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

// 切换Tab (P0: 增加 hash 路由, 性能优化: 防抖+请求计数, 防抖动)
let _tabSwitchCounter = 0; // 递增计数器，用于检测过时的tab切换
let _revealTimer = null; // 恢复可见的定时器
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
        // 防抖动：先让内容区不可见（保留布局占位），等所有DOM操作完成再显示
        content.style.visibility = 'hidden';
        content.classList.add('active');
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

    // 按需加载当前 tab 数据
    const noObserverTabs = ['dashboard', 'field-settings'];
    loadTabData(tabId, mySwitch).then(() => {
        if (!content || mySwitch !== _tabSwitchCounter) return;
        if (noObserverTabs.includes(tabId)) {
            // 没有 MutationObserver 注入的 tab，直接用 rAF 显示
            requestAnimationFrame(() => {
                if (mySwitch === _tabSwitchCounter && content) {
                    content.style.visibility = '';
                }
            });
        } else {
            // 有表格 Observer 注入的 tab，等 Observer 防抖(80ms)完成后再显示
            _revealTimer = setTimeout(() => {
                if (mySwitch !== _tabSwitchCounter) return;
                requestAnimationFrame(() => {
                    if (mySwitch === _tabSwitchCounter && content) {
                        content.style.visibility = '';
                    }
                });
            }, 150);
        }
    });
}

// 按需加载当前Tab数据
async function loadTabData(tabId, switchId) {
    // 确保字段选项已加载（全局依赖）
    if (!window._fieldOptionsLoaded) {
        await loadFieldOptions();
        window._fieldOptionsLoaded = true;
    }
    // 如果切换已过时（用户快速切到别的tab了），跳过
    if (switchId !== undefined && switchId !== _tabSwitchCounter) return;
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
    if (data && data.length > 0) {
        tbody.innerHTML = data.map((member, index) => `
            <tr>
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td class="editable-cell" ondblclick="startMemberInlineEdit(this, ${member.id}, 'name', 'text')" title="双击编辑">${escapeHtml(member.name)}</td>
                <td class="editable-cell" ondblclick="startMemberInlineEdit(this, ${member.id}, 'wechat_id', 'text')" title="双击编辑">${escapeHtml(member.wechat_id || '-')}</td>
                <td class="editable-cell" ondblclick="startMemberInlineEdit(this, ${member.id}, 'role', 'select')" title="双击选择">${escapeHtml(member.role || '-')}</td>
                <td class="editable-cell" ondblclick="startMemberInlineEdit(this, ${member.id}, 'duty', 'textarea')" title="双击编辑">${escapeHtml(member.duty || '-')}</td>
                <td class="editable-cell text-center" ondblclick="startMemberInlineEdit(this, ${member.id}, 'status', 'select')" title="双击切换"><span class="status-badge status-${sanitizeCssClass(member.status)}">${getStatusText(member.status)}</span></td>
                <td class="text-center action-icons">
                    <button class="action-icon-btn edit" onclick="editMember(${member.id})" title="编辑">✏️</button>
                    <button class="action-icon-btn delete" onclick="deleteMember(${member.id})" title="删除">🗑️</button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">👥</div>
                    <div class="empty-text">还没有项目成员</div>
                    <div class="empty-sub">添加团队成员以便分配任务和跟踪工作进度</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="openModal('member-modal')">➕ 添加第一个成员</button>
                    </div>
                </td>
            </tr>
        `;
    }
}

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

// P0: 渲染设备表格（支持筛选后的子集）
function renderDevicesTable(data) {
    const tbody = document.getElementById('devices-table');
    if (data && data.length > 0) {
        tbody.innerHTML = data.map((device, index) => `
            <tr class="clickable" data-id="${device.id}">
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>${escapeHtml(device.manufacturer || '-')}</td>
                <td>${escapeHtml(device.device_type || '-')}</td>
                <td>${escapeHtml(device.name)}</td>
                <td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'requirements', 'text')" title="双击编辑">${escapeHtml(device.requirements || '-')}</td>
                <td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'quantity', 'number')" title="双击编辑">${escapeHtml(String(device.quantity || 1))}</td>
                <td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'keeper', 'select')" title="双击选择">${escapeHtml(device.keeper || '-')}</td>
                <td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'notes', 'text')" title="双击编辑">${escapeHtml(device.notes || '-')}</td>
                <td>${escapeHtml(device.adapter_completion_rate || '0%')}</td>
                <td>${escapeHtml(device.total_bugs || 0)}</td>
                <td>${escapeHtml(device.completed_adaptations || 0)}</td>
                <td>${getDeviceOnlineGameCount(device.name)}</td>
                <td class="text-center action-icons">
                    <button class="action-icon-btn edit" onclick="editDevice(${device.id})" title="编辑">✏️</button>
                    <button class="action-icon-btn delete" onclick="deleteDevice(${device.id})" title="删除">🗑️</button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="13" class="empty-state">
                    <div class="empty-icon">📱</div>
                    <div class="empty-text">还没有测试设备</div>
                    <div class="empty-sub">添加设备以便管理适配测试和分配任务</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="openModal('device-modal')">➕ 添加第一个设备</button>
                    </div>
                </td>
            </tr>
        `;
    }
}

