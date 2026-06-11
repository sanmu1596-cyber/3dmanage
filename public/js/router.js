/**
 * router.js — 路由与标签系统
 * 职责：Hash路由、标签切换、Tab数据加载、侧边栏
 * 依赖：core.js, auth.js（IS_DEV_MODE, authFetch等）
 */
var App = window.App;

// ========== P0: URL Hash 路由 ==========
function initHashRouter() {
    // 监听 hash 变化
    window.addEventListener('hashchange', () => {
        const tab = location.hash.slice(1) || 'dashboard';
        switchTab(tab, true); // true = 来自 hash，不再 pushState
    });
    // 初始加载时读取 hash — 如果是 dashboard 则跳过（由 DOMContentLoaded 直接加载，避免 visibility 竞态）
    const initialTab = location.hash.slice(1) || 'dashboard';
    if (initialTab !== 'dashboard') {
        switchTab(initialTab, true);
    }
}

// 标签切换（兼容侧边栏导航 + 旧tabs）
function initTabs() {
    // 侧边栏导航已在HTML中用onclick="switchTab(...)"绑定
    // 这里保留兼容旧.tab的逻辑
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });
}

// 切换Tab (P0: 增加 hash 路由, 性能优化: 防抖+请求计数, 防抖动, Skeleton骨架屏)
let _tabSwitchCounter = 0; // 递增计数器，用于检测过时的tab切换
let _revealTimer = null; // 恢复可见的定时器

// 各模块的Skeleton模板配置
const SKELETON_CONFIGS = {
    games: { rows: 5, cols: 6 },
    members: { rows: 4, cols: 4 },
    devices: { rows: 4, cols: 8 },
    tests: { rows: 4, cols: 7 },
    bugs: { rows: 4, cols: 7 },
    progress: { rows: 3, cols: 5 }
};

/**
 * 生成骨架屏HTML
 */
function generateSkeleton(tabId) {
    const cfg = SKELETON_CONFIGS[tabId];
    if (!cfg) return '';
    let rowsHtml = '';
    for (let r = 0; r < cfg.rows; r++) {
        const cells = [];
        for (let c = 0; c < cfg.cols; c++) {
            const widths = ['short', 'medium', '', 'wide', ''];
            cells.push(`<div class="skeleton-cell ${widths[c % widths.length]}"></div>`);
        }
        rowsHtml += `<div class="skeleton-row">${cells.join('')}</div>`;
    }
    return `<div class="skeleton-shimmer" id="${tabId}-skeleton">${rowsHtml}</div>`;
}

function switchTab(tabId, fromHash) {
    const mySwitch = ++_tabSwitchCounter; // 记录本次切换的序号
    clearTimeout(_revealTimer);

    // 切换模块时自动关闭详情面板和下拉菜单
    closeDetailPanel();
    closeAllMoreActions();

    // 移除所有激活状态
    document.querySelectorAll('.sidebar-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.style.visibility = '';
    });

    // 激活当前标签
    const sidebarItem = document.querySelector(`.sidebar-item[data-tab="${tabId}"]`);
    if (sidebarItem) sidebarItem.classList.add('active');

    const tabBtn = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.classList.add('active');

    const content = document.getElementById(tabId);
    if (content) {
        content.classList.add('active');
        // 显示骨架屏覆盖层（保留原始DOM不被破坏，避免渲染函数找不到tbody等元素）
        if (SKELETON_CONFIGS[tabId]) {
            // 移除旧骨架屏（如有）
            const oldSk = content.querySelector(`#${tabId}-skeleton`);
            if (oldSk) oldSk.remove();
            // 插入骨架屏覆盖层（绝对定位覆盖内容区）
            const skEl = document.createElement('div');
            skEl.innerHTML = generateSkeleton(tabId);
            const skNode = skEl.firstElementChild;
            if (skNode) content.appendChild(skNode);
        } else {
            content.style.visibility = 'hidden';
        }
    } else {
        // fallback: 如果找不到对应 tab，跳到 dashboard
        const dash = document.getElementById('dashboard');
        if (dash) dash.classList.add('active');
        const dashItem = document.querySelector('.sidebar-item[data-tab="dashboard"]');
        if (dashItem) dashItem.classList.add('active');
    }

    // P0: 更新 URL hash（仅非 hash 触发时）
    if (!fromHash && location.hash !== '#' + tabId) {
        history.pushState(null, '', '#' + tabId);
    }

    // 更新面包屑导航
    updateBreadcrumb(tabId);

    // 按需加载当前 tab 数据
    const noObserverTabs = ['dashboard', 'field-settings'];
    loadTabData(tabId, mySwitch).then(() => {
        if (!content || mySwitch !== _tabSwitchCounter) return;
        // 数据加载完毕，移除骨架屏覆盖层 + 恢复可见性
        const skeleton = content.querySelector(`#${tabId}-skeleton`);
        if (skeleton) skeleton.remove();
        content.style.visibility = '';
    });
}

// 按需加载当前Tab数据
async function loadTabData(tabId, switchId) {
    // 显示刷新指示器
    const tabLabels = { games:'游戏列表', members:'项目成员', devices:'设备列表', tests:'测试列表', bugs:'缺陷列表', progress:'适配进展' };
    if (tabLabels[tabId]) showRefreshIndicator(`正在加载${tabLabels[tabId]}...`);

    // 确保字段选项已加载（全局依赖）
    if (!window._fieldOptionsLoaded) {
        await loadFieldOptions();
        window._fieldOptionsLoaded = true;
    }
    // 如果切换已过时（用户快速切到别的tab了），跳过
    if (switchId !== undefined && switchId !== _tabSwitchCounter) return;
    try {
        await _doLoadTabData(tabId, switchId);
        // 隐藏刷新指示器（带成功提示）
        hideRefreshIndicator('同步完成 ✅');
    } catch(e) {
        console.error('[loadTabData]', e);
        hideRefreshIndicator();
    }
}

/**
 * 实际的数据加载逻辑（与原 loadTabData 一致）
 */
async function _doLoadTabData(tabId, switchId) {
    switch (tabId) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'games':
            await loadGames();
            refreshAllSelectsFromFieldOptions();
            break;
        case 'members':
            await loadMembers();
            refreshAllSelectsFromFieldOptions();
            break;
        case 'devices':
            await loadDevices();
            break;
        case 'progress':
            await loadProgressData();
            break;
        case 'matrix':
            await loadMatrixData();
            break;
        case 'tests':
            await loadTests();
            break;
        case 'bugs':
            await loadBugs();
            break;
        case 'game-issues':
            await loadGameIssues();
            break;
        case 'config-plan':
            // 配置计划需要设备和游戏数据（穿梭框选择用）
            if (!allDevicesData || allDevicesData.length === 0) await loadDevices();
            if (!allGamesForProgress || allGamesForProgress.length === 0) {
                try {
                    const gamesResp = await authFetch(`${API_BASE}/games`);
                    const gamesResult = await gamesResp.json();
                    allGamesForProgress = gamesResult.data || [];
                } catch (e) {
                    console.error('加载游戏数据失败:', e);
                    allGamesForProgress = [];
                }
            }
            if (!allMembersData || allMembersData.length === 0) await loadMembers();
            await loadConfigPlans();
            break;
        case 'my-tasks':
            if (!allMembersData || allMembersData.length === 0) await loadMembers();
            await loadMyTasks();
            break;
        case 'requirements':
            if (!allMembersData || allMembersData.length === 0) await loadMembers();
            await loadRequirements();
            break;
        case 'field-settings':
            await loadFieldOptions();
            renderFieldCards();
            break;
        case 'test-cases':
            await loadTestCases();
            break;
        case 'user-management':
            await umLoadData();
            break;
        case 'versions':
            if (!allDevicesData || allDevicesData.length === 0) await loadDevices();
            await loadVersions();
            break;
        case 'game-versions':
            if (!allGamesForProgress || allGamesForProgress.length === 0) {
                try {
                    const gamesResp = await authFetch(`${API_BASE}/games`);
                    const gamesResult = await gamesResp.json();
                    allGamesForProgress = gamesResult.data || [];
                } catch (e) { console.error('加载游戏数据失败:', e); }
            }
            await loadGameVersions();
            break;
        case 'interlace-issues':
            await loadInterlaceVersions();
            await loadInterlaceIssues();
            break;
        case 'interlace-versions':
            await loadInterlaceVersions();
            break;
        case 'client-issues':
            await loadVersions();
            await loadClientIssues();
            break;
        case 'reports':
            loadReports();
            break;
    }
    // 仅在非dashboard tab时更新侧边栏统计（dashboard自带完整统计）
    if (tabId !== 'dashboard') {
        updateStats();
    }
}

// 切换侧边栏
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed');
}

// 加载所有数据
async function loadAllData() {
    await loadFieldOptions(); // 先加载字段选项
    await Promise.all([
        loadMembers(),
        loadDevices(),
        loadGames(),
        loadTests(),
        loadBugs()
    ]);
    await loadProgressData(); // 加载适配进展数据
    await loadConfigPlans(); // 加载配置计划数据
    refreshAllSelectsFromFieldOptions(); // 刷新所有表单下拉框
    updateStats();
}

// 加载成员列表
async function loadMembers() {
    try {
        const response = await authFetch(`${API_BASE}/members`);
        const result = await response.json();

        // 保存成员数据供适配进展使用
        allMembersData = result.data || [];

        renderMembersTable(allMembersData);

        // 更新下拉选择框
        updateSelectOptions('device-assigned', result.data, 'id', 'name', '未分配');
        updateSelectOptions('test-tester', result.data, 'id', 'name', '请选择测试人');
        updateSelectOptions('game-owner', result.data, 'id', 'name', '未分配');
    } catch (error) {
        console.error('加载成员失败:', error);
    }
}

// P0: 渲染成员表格（支持筛选后的子集）
function renderMembersTable(data) {
    const tbody = document.getElementById('members-table');

    // 更新表头列顺序
    if (typeof updateColumnHeaders === 'function') updateColumnHeaders('members-table');
    // 初始化拖拽排序
    if (typeof initHeaderDrag === 'function') initHeaderDrag('members-table');
    // 初始化点击排序
    if (typeof initTableSort === 'function') initTableSort('members-table');
    // ★ 列宽锁定+resize手柄
    if (typeof initColumnResize === 'function') requestAnimationFrame(() => initColumnResize());

    if (data && data.length > 0) {
        const colOrder = typeof getColumnOrder === 'function' ? getColumnOrder('members-table') :
            ['name', 'wechat_id', 'role', 'duty', 'status'];

        tbody.innerHTML = data.map((member, index) => {
            // ★ 第一列：复选框（与thead的.batch-th对齐，避免后续异步注入引发列抖动）
            let rowHtml = `<td class="batch-td"><input type="checkbox" class="row-checkbox" data-id="${member.id}" data-resource="members" onchange="batchToggleRow(this)"></td>`;
            rowHtml += `<td class="text-center"><strong>${index + 1}</strong></td>`;

            colOrder.forEach(field => {
                // 跳过隐藏列
                if (typeof memberVisibleColumns !== 'undefined' && !memberVisibleColumns[field]) return;
                switch (field) {
                    case 'name':
                        rowHtml += `<td class="editable-cell" ondblclick="startMemberInlineEdit(this, ${member.id}, 'name', 'text')" title="双击编辑">${highlightSearch(member.name, 'members-table')}</td>`;
                        break;
                    case 'wechat_id':
                        rowHtml += `<td class="editable-cell" ondblclick="startMemberInlineEdit(this, ${member.id}, 'wechat_id', 'text')" title="双击编辑">${highlightSearch(member.wechat_id || '-', 'members-table')}</td>`;
                        break;
                    case 'role':
                        rowHtml += `<td class="editable-cell" ondblclick="startMemberInlineEdit(this, ${member.id}, 'role', 'select')" title="双击选择">${highlightSearch(member.role || '-', 'members-table')}</td>`;
                        break;
                    case 'duty':
                        rowHtml += `<td class="editable-cell" ondblclick="startMemberInlineEdit(this, ${member.id}, 'duty', 'textarea')" title="双击编辑">${escapeHtml(member.duty || '-')}</td>`;
                        break;
                    case 'status':
                        rowHtml += `<td class="editable-cell text-center" ondblclick="startMemberInlineEdit(this, ${member.id}, 'status', 'select')" title="双击切换"><span class="status-badge status-${sanitizeCssClass(member.status)}">${getStatusText(member.status)}</span></td>`;
                        break;
                }
            });

            rowHtml += `
                <td class="text-center action-icons">
                    <button class="btn btn-small btn-edit" onclick="editMember(${member.id})">编辑</button>
                    <button class="btn btn-small btn-delete" onclick="deleteMember(${member.id})">删除</button>
                </td>
            `;
            return `<tr data-id="${member.id}">${rowHtml}</tr>`;
        }).join('');

        // 注意：批量选择checkbox由 ui-features.js 的 MutationObserver 自动注入

        updateMembersPagination(data.length);
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <div class="empty-icon">👥</div>
                    <div class="empty-text">还没有项目成员</div>
                    <div class="empty-sub">添加团队成员以便分配任务和跟踪工作进度</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="openModal('member-modal')">➕ 添加第一个成员</button>
                    </div>
                </td>
            </tr>
        `;
        // 清空分页控件
        const pgDiv = document.getElementById('members-pagination');
        if (pgDiv) pgDiv.style.display = 'none';
    }
}

// P1.7: 更新成员表分页增强控件
function updateMembersPagination(totalItems) {
    const pgDiv = document.getElementById('members-pagination');
    const pageNumsDiv = document.getElementById('members-page-numbers');
    if (!pgDiv || !pageNumsDiv) return;
    
    const state = getModulePaginationState('members');
    const pageSize = state.pageSize || 20;
    const totalPages = pageSize === -1 ? 1 : Math.ceil(totalItems / pageSize);
    const currentPage = Math.min(state.page || 1, totalPages || 1);
    
    // 更新当前模块的数据长度
    _modulePaginationState['members'] = _modulePaginationState['members'] || {};
    _modulePaginationState['members'].totalItems = totalItems;
    
    if (totalItems > pageSize) {
        pgDiv.style.display = 'flex';
        appendPaginationExtras('members-page-numbers', currentPage, totalPages, pageSize, {
            moduleName: 'members',
            onPageChange: 'handleMembersPageChange',
            onPageSizeChange: 'handleMembersPageSizeChange'
        });
    } else {
        pgDiv.style.display = 'none';
    }
}

// P1.7: 成员表页码变化处理
function handleMembersPageChange(moduleName, pageNum) {
    setModulePaginationState('members', { page: pageNum });
    renderMembersTable(filteredMembersData || allMembersData);
}

// P1.7: 成员表条数变化处理
function handleMembersPageSizeChange(moduleName, newSize) {
    const size = parseInt(newSize);
    setModulePaginationState('members', { pageSize: size, page: 1 });
    renderMembersTable(filteredMembersData || allMembersData);
}

// 全局过滤后的成员数据
let filteredMembersData = null;

// 加载设备列表
async function loadDevices() {
    try {
        const response = await authFetch(`${API_BASE}/devices`);
        const result = await response.json();

        allDevicesData = result.data || [];
        renderDevicesTable(allDevicesData);

        // 更新测试设备下拉框
        updateSelectOptions('test-device', result.data, 'id', 'name', '请选择设备');
    } catch (error) {
        console.error('加载设备失败:', error);
    }
}

// P0: 渲染设备表格（支持列隐藏/显示、行拖拽排序、筛选后的子集）
function renderDevicesTable(data) {
    const tbody = document.getElementById('devices-table');

    // 更新表头列顺序
    if (typeof updateColumnHeaders === 'function') updateColumnHeaders('devices-table');
    // 初始化表头列拖拽排序
    if (typeof initHeaderDrag === 'function') initHeaderDrag('devices-table');
    // 初始化点击排序
    if (typeof initTableSort === 'function') initTableSort('devices-table');
    // ★ 列宽锁定+resize手柄
    if (typeof initColumnResize === 'function') requestAnimationFrame(() => initColumnResize());

    // 设备表默认列顺序（与表头th的data-field一一对应）
    const defaultDeviceColOrder = ['manufacturer', 'device_type', 'name', 'requirements',
        'quantity', 'keeper', 'notes', 'adapter_completion_rate', 'total_bugs',
        'completed_adaptations', 'online_games'];

    if (data && data.length > 0) {
        const colOrder = typeof getColumnOrder === 'function'
            ? getColumnOrder('devices-table') : [...defaultDeviceColOrder];

        // 计算可见列数量（用于空状态colspan）
        let visibleCount = 1; // 拖拽手柄列始终可见
        colOrder.forEach(field => {
            if (window.deviceVisibleColumns && !window.deviceVisibleColumns[field]) return;
            visibleCount++;
        });
        visibleCount += 1; // 操作列
        tbody.setAttribute('data-visible-cols', visibleCount);

        tbody.innerHTML = data.map((device, index) => {
            // ★ 第一列：复选框（与thead的.batch-th对齐）
            let rowHtml = `<td class="batch-td"><input type="checkbox" class="row-checkbox" data-id="${device.id}" data-resource="devices" onchange="batchToggleRow(this)"></td>`;
            // 第二列：拖拽手柄（替代序号）
            rowHtml += `<td class="text-center drag-handle" title="拖拽排序">⋮⋮</td>`;

            // 动态渲染各列（支持隐藏）
            colOrder.forEach(field => {
                // 跳过隐藏列
                if (window.deviceVisibleColumns && !window.deviceVisibleColumns[field]) return;

                switch (field) {
                    case 'manufacturer':
                        rowHtml += `<td>${highlightSearch(device.manufacturer || '-', 'devices-table')}</td>`;
                        break;
                    case 'device_type':
                        rowHtml += `<td>${highlightSearch(device.device_type || '-', 'devices-table')}</td>`;
                        break;
                    case 'name':
                        rowHtml += `<td>${highlightSearch(device.name, 'devices-table')}</td>`;
                        break;
                    case 'requirements':
                        rowHtml += `<td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'requirements', 'text')" title="双击编辑">${escapeHtml(device.requirements || '-')}</td>`;
                        break;
                    case 'quantity':
                        rowHtml += `<td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'quantity', 'number')" title="双击编辑">${escapeHtml(String(device.quantity || 1))}</td>`;
                        break;
                    case 'keeper':
                        rowHtml += `<td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'keeper', 'select')" title="双击选择">${escapeHtml(device.keeper || '-')}</td>`;
                        break;
                    case 'notes':
                        rowHtml += `<td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'notes', 'text')" title="双击编辑">${escapeHtml(device.notes || '-')}</td>`;
                        break;
                    case 'adapter_completion_rate':
                        rowHtml += `<td>${escapeHtml(device.adapter_completion_rate || '0%')}</td>`;
                        break;
                    case 'total_bugs':
                        rowHtml += `<td>${escapeHtml(device.total_bugs || 0)}</td>`;
                        break;
                    case 'completed_adaptations':
                        rowHtml += `<td class="editable-cell" onclick="startInlineEdit(this, ${device.id}, 'completed_adaptations', 'number')" title="单击编辑">${escapeHtml(device.completed_adaptations || 0)}</td>`;
                        break;
                    case 'online_games':
                        rowHtml += `<td>${getDeviceOnlineGameCount(device.name)}</td>`;
                        break;
                }
            });

            // 操作列
            rowHtml += `
                <td class="text-center action-icons">
                    <button class="btn btn-small btn-edit" onclick="editDevice(${device.id})">编辑</button>
                    <button class="btn btn-small btn-delete" onclick="deleteDevice(${device.id})">删除</button>
                </td>
            `;
            // draggable-row 类启用行拖拽
            return `<tr class="clickable draggable-row" data-id="${device.id}" draggable="true">${rowHtml}</tr>`;
        }).join('');

        // 注意：批量选择checkbox由 ui-features.js 的 MutationObserver 自动注入

        applyCellTooltips && applyCellTooltips('devices-table');
        // 初始化行拖拽排序
        if (typeof initRowDrag === 'function') initRowDrag('devices-table', data);
        updateDevicesPagination(data.length);
    } else {
        // 计算colspan（总列数 = 手柄 + 所有数据列 + 操作列）
        const totalCols = (typeof getColumnOrder === 'function' ? getColumnOrder('devices-table').length : defaultDeviceColOrder.length) + 2;
        tbody.innerHTML = `
            <tr>
                <td colspan="${totalCols}" class="empty-state">
                    <div class="empty-icon">📱</div>
                    <div class="empty-text">还没有测试设备</div>
                    <div class="empty-sub">添加设备以便管理适配测试和分配任务</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="openModal('device-modal')">➕ 添加第一个设备</button>
                    </div>
                </td>
            </tr>
        `;
        // 清空分页控件
        const pgDiv = document.getElementById('devices-pagination');
        if (pgDiv) pgDiv.style.display = 'none';
    }
}

// ==================== 设备表行拖拽排序 ====================
// 全局变量：拖拽中的行引用
let _dragSrcRow = null;

/**
 * 初始化设备表的行拖拽排序
 * @param {string} tableId - 表格ID ('devices-table')
 * @param {Array} data - 当前显示的设备数据（用于保存排序）
 */
function initRowDrag(tableId, data) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    const rows = tbody.querySelectorAll('.draggable-row');
    rows.forEach(row => {
        row.addEventListener('dragstart', function(e) {
            _dragSrcRow = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.dataset.id);
            // 延迟设置透明度，避免拖拽图标变透明
            setTimeout(() => this.style.opacity = '0.4', 0);
        });
        row.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            this.style.opacity = '';
            _dragSrcRow = null;
            removeRowDropIndicator();
            // 拖拽结束后保存新顺序到后端
            saveDeviceRowOrder(tableId);
        });
        row.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (_dragSrcRow && _dragSrcRow !== this) {
                const rect = this.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                showRowDropIndicator(this, e.clientY < midY ? 'before' : 'after');
            }
        });
        row.addEventListener('dragleave', function() {
            removeRowDropIndicator();
        });
        row.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            removeRowDropIndicator();
            if (_dragSrcRow && _dragSrcRow !== this) {
                const rect = this.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    this.parentNode.insertBefore(_dragSrcRow, this);
                } else {
                    this.parentNode.insertBefore(_dragSrcRow, this.nextSibling);
                }
            }
        });
    });
}

/**
 * 在目标行旁边显示蓝色放置指示线
 */
function showRowDropIndicator(targetRow, position) {
    removeRowDropIndicator();
    const indicator = document.createElement('div');
    indicator.className = 'row-drop-indicator';
    indicator.style.width = targetRow.offsetWidth + 'px';
    indicator.style.left = targetRow.offsetLeft + 'px';
    if (position === 'before') {
        indicator.style.top = targetRow.offsetTop + 'px';
    } else {
        indicator.style.top = (targetRow.offsetTop + targetRow.offsetHeight) + 'px';
    }
    targetRow.parentNode.parentNode.style.position = 'relative';
    targetRow.parentNode.parentNode.appendChild(indicator);
}

/** 移除放置指示线 */
function removeRowDropIndicator() {
    const existing = document.querySelector('.row-drop-indicator');
    if (existing) existing.remove();
}

/**
 * 将当前DOM行顺序保存到后端
 * 遍历表格中所有 draggable-row，按当前DOM顺序分配 sort_order 并批量提交
 */
function saveDeviceRowOrder(tableId) {
    var tbody = document.getElementById(tableId);
    if (!tbody) return;
    var rows = tbody.querySelectorAll('.draggable-row');
    var orders = [];
    rows.forEach(function(row, index) {
        var id = parseInt(row.dataset.id);
        if (!isNaN(id)) {
            orders.push({ id: id, sort_order: index });
        }
    });
    if (orders.length === 0) return;
    fetch('/api/devices/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: orders })
    }).then(function(res) {
        if (!res.ok) {
            return res.json().then(function(d) {
                throw new Error(d.error || '排序保存失败(' + res.status + ')');
            });
        }
        return res.json();
    }).then(function(result) {
        console.log('[设备行拖拽] 排序已保存，共', result.updated || orders.length, '条');
    }).catch(function(err) {
        console.error('[设备行拖拽] 保存失败:', err.message);
        showToast('排序保存失败: ' + err.message, 'error');
    });
}

// P1.7: 更新设备表分页增强控件
function updateDevicesPagination(totalItems) {
    const pgDiv = document.getElementById('devices-pagination');
    const pageNumsDiv = document.getElementById('devices-page-numbers');
    if (!pgDiv || !pageNumsDiv) return;
    
    const state = getModulePaginationState('devices');
    const pageSize = state.pageSize || 20;
    const totalPages = pageSize === -1 ? 1 : Math.ceil(totalItems / pageSize);
    const currentPage = Math.min(state.page || 1, totalPages || 1);
    
    _modulePaginationState['devices'] = _modulePaginationState['devices'] || {};
    _modulePaginationState['devices'].totalItems = totalItems;
    
    if (totalItems > pageSize) {
        pgDiv.style.display = 'flex';
        appendPaginationExtras('devices-page-numbers', currentPage, totalPages, pageSize, {
            moduleName: 'devices',
            onPageChange: 'handleDevicesPageChange',
            onPageSizeChange: 'handleDevicesPageSizeChange'
        });
    } else {
        pgDiv.style.display = 'none';
    }
}

// P1.7: 设备表页码变化处理
function handleDevicesPageChange(moduleName, pageNum) {
    setModulePaginationState('devices', { page: pageNum });
    renderDevicesTable(filteredDevicesData || allDevicesData);
}

// P1.7: 设备表条数变化处理
function handleDevicesPageSizeChange(moduleName, newSize) {
    const size = parseInt(newSize);
    setModulePaginationState('devices', { pageSize: size, page: 1 });
    renderDevicesTable(filteredDevicesData || allDevicesData);
}

// 全局过滤后的设备数据
let filteredDevicesData = null;

// ==================== 面包屑导航功能 ====================

/**
 * Tab → 显示名称 的映射
 */
const BREADCRUMB_MAP = {
    'dashboard': { label: '项目概览', icon: '📊', parent: null },
    'games':     { label: '游戏列表', icon: '🎮', parent: 'dashboard' },
    'devices':   { label: '设备列表', icon: '📱', parent: 'dashboard' },
    'members':   { label: '项目成员', icon: '👥', parent: 'dashboard' },
    'progress':  { label: '适配进展', icon: '📈', parent: 'games' },
    'matrix':    { label: '适配矩阵', icon: '🔲', parent: 'progress' },
    'tests':     { label: '测试列表', icon: '🧪', parent: 'games' },
    'bugs':      { label: '缺陷列表', icon: '🐛', parent: 'tests' },
    'game-issues':{label: '游戏问题', icon: '⚠️',  parent: 'games' },
    'config-plan':{label: '配置计划', icon: '📋', parent: 'progress' },
    'my-tasks':   { label: '我的任务', icon: '✅', parent: null },
    'requirements':{label: '需求管理', icon: '📝', parent: null },
    'field-settings':{label:'字段设置', icon: '⚙️', parent: null },
    'test-cases':{label: '测试用例', icon: '📑', parent: 'tests' },
    'user-management':{label:'用户管理', icon: '🔐', parent: null },
    'versions':  { label: '版本管理', icon: '🏷️', parent: 'devices' },
    'game-versions':{label:'游戏版本', icon: '🎯', parent: 'games' },
    'interlace-issues':{label:'交织问题', icon: '⚠️', parent: 'games' },
    'interlace-versions':{label:'交织版本', icon: '🔀', parent: 'devices' },
    'client-issues':{label: '客户端问题', icon: '⚠️', parent: 'games' },
    'reports':    { label: '汇报报表', icon: '📊', parent: null }
};

function updateBreadcrumb(tabId) {
    const nav = document.getElementById('breadcrumb-nav');
    if (!nav) return;

    const path = [];
    let current = tabId;
    while (current && BREADCRUMB_MAP[current]) {
        path.unshift(BREADCRUMB_MAP[current]);
        current = BREADCRUMB_MAP[current].parent;
    }

    if (path.length === 0) return;

    let html = '';
    path.forEach((item, idx) => {
        if (idx > 0) html += `<span class="breadcrumb-sep">›</span>`;
        const isLast = idx === path.length - 1;
        if (isLast) {
            html += `<span class="breadcrumb-current">${item.icon} ${item.label}</span>`;
        } else {
            for (const [tid, val] of Object.entries(BREADCRUMB_MAP)) {
                if (val.label === item.label && val.icon === item.icon) {
                    html += `<a onclick="switchTab('${tid}')">${item.icon} ${item.label}</a>`;
                    break;
                }
            }
        }
    });

    nav.innerHTML = html;
}

