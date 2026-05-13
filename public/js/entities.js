/**
 * entities.js — 实体管理CRUD模块
 * 职责：设备/游戏/成员列表渲染与行内编辑、适配进展、导入导出Excel、打印PDF、筛选统计
 * 依赖：core.js, auth.js, router.js（switchTab, authFetch, showToast等）
 */
var App = window.App;

// ========== 表头拖拽排序 - TAPD风格 ==========

// 列顺序配置（持久化到localStorage）
let columnOrder = ['name', 'english_name', 'platform', 'game_id', 'game_type', 'description',
    'developer', 'operator', 'release_date', 'config_path', 'adapter_progress',
    'owner', 'online_status', 'quality', 'game_account', 'storage_location', 'game_engine'];

// 从localStorage加载列顺序
function loadColumnOrder() {
    const saved = localStorage.getItem('gamesColumnOrder');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                columnOrder = parsed;
            }
        } catch (e) {
            console.warn('加载列顺序失败:', e);
        }
    }
}

// 保存列顺序到localStorage
function saveColumnOrder() {
    try {
        localStorage.setItem('gamesColumnOrder', JSON.stringify(columnOrder));
    } catch (e) {
        console.warn('保存列顺序失败:', e);
    }
}

// ==================== 设备行内编辑 ====================

// P1.1: 行内编辑焦点管理 - 记录当前编辑的td
let _inlineEditCurrentTd = null;

/**
 * 双击单元格进入编辑模式
 * @param {HTMLElement} td - 被双击的<td>元素
 * @param {number} deviceId - 设备ID
 * @param {string} field - 字段名 (requirements/quantity/keeper/notes)
 * @param {string} inputType - 输入类型 (text/number)
 */
function startInlineEdit(td, deviceId, field, inputType) {
    // 防止重复激活
    if (td.querySelector('input, textarea, select')) return;

    const currentValue = td.textContent.trim();
    const displayValue = currentValue === '-' ? '' : currentValue;

    td.classList.add('editing');
    // P1.1: 记录当前编辑的td，用于外部点击判断
    _inlineEditCurrentTd = td;

    // 锁定单元格宽高，防止编辑态撑开引起抖动
    const rect = td.getBoundingClientRect();
    td.style.width = rect.width + 'px';
    td.style.minWidth = rect.width + 'px';
    td.style.maxWidth = rect.width + 'px';
    td.style.height = rect.height + 'px';
    td.style.boxSizing = 'border-box';

    // 保管者：下拉选择（从成员列表获取）
    if (field === 'keeper') {
        const select = document.createElement('select');
        select.className = 'inline-edit-select';
        // 空选项
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- 选择保管者 --';
        select.appendChild(emptyOpt);
        // 从成员列表填充
        (allMembersData || []).forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.name;
            opt.textContent = member.name;
            if (member.name === displayValue) opt.selected = true;
            select.appendChild(opt);
        });
        td.innerHTML = '';
        td.appendChild(select);
        select.focus();
        // 自动展开下拉选项
        try { select.showPicker(); } catch(e) { select.click(); }
        // change 直接保存
        select.addEventListener('change', () => saveInlineEdit(td, deviceId, field, select.value));
        select.addEventListener('blur', () => {
            // 延迟关闭，让change事件先触发
            setTimeout(() => {
                if (td.querySelector('select')) cancelInlineEdit(td, currentValue);
            }, 150);
        });
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') cancelInlineEdit(td, currentValue);
        });
    }
    // 设备需求：改用 input（保持单行，和显示状态一致）
    else if (field === 'requirements') {
        td.innerHTML = `<input type="text" class="inline-edit-input" value="${escapeHtml(displayValue)}">`;
        const input = td.querySelector('input');
        input.focus();
        // TAPD风格：光标定位到句尾
        input.setSelectionRange(input.value.length, input.value.length);
        input.addEventListener('blur', () => saveInlineEdit(td, deviceId, field, input.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') cancelInlineEdit(td, currentValue);
        });
    }
    // 数量：纯文本 input + 数字校验（不用 type=number 避免丑箭头）
    else if (field === 'quantity') {
        td.innerHTML = `<input type="text" inputmode="numeric" class="inline-edit-input inline-edit-qty" value="${escapeHtml(displayValue)}">`;
        const input = td.querySelector('input');
        input.focus();
        // 光标定位到句尾
        input.setSelectionRange(input.value.length, input.value.length);
        input.addEventListener('blur', () => saveInlineEdit(td, deviceId, field, input.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') cancelInlineEdit(td, currentValue);
        });
    }
    // 其他：通用 input
    else {
        td.innerHTML = `<input type="text" class="inline-edit-input" value="${escapeHtml(displayValue)}">`;
        const input = td.querySelector('input');
        input.focus();
        // TAPD风格：光标定位到句尾，而不是全选
        input.setSelectionRange(input.value.length, input.value.length);
        input.addEventListener('blur', () => saveInlineEdit(td, deviceId, field, input.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') cancelInlineEdit(td, currentValue);
        });
    }
}

/**
 * 保存行内编辑
 */
async function saveInlineEdit(td, deviceId, field, newValue) {
    td.classList.remove('editing');
    const trimmed = newValue.trim();

    // 构造PATCH请求体
    const body = {};
    body[field] = field === 'quantity' ? (parseInt(trimmed) || 1) : trimmed;

    try {
        const response = await authFetch(`${API_BASE}/devices/${deviceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            // 更新本地数据
            const device = allDevicesData.find(d => d.id === deviceId);
            if (device) device[field] = body[field];
            // 只恢复当前单元格显示（不整表重渲染，避免抖动）
            td.textContent = trimmed || '-';
            // 解除宽高锁定
            td.style.width = '';
            td.style.minWidth = '';
            td.style.maxWidth = '';
            td.style.height = '';
            // 异步刷新关联模块缓存（适配进展中的设备信息可能变化）
            if (['keeper', 'notes', 'requirements', 'quantity'].includes(field)) {
                window._progressDataStale = true; // 标记适配进展数据需刷新
            }
        } else {
            td.textContent = trimmed || '-';
            td.style.width = '';
            td.style.minWidth = '';
            td.style.maxWidth = '';
            td.style.height = '';
            showToast('保存失败', 'danger');
        }
    } catch (error) {
        console.error('行内编辑保存失败:', error);
        td.textContent = trimmed || '-';
        td.style.width = '';
        td.style.minWidth = '';
        td.style.maxWidth = '';
        td.style.height = '';
        showToast('保存失败', 'danger');
    }
}

/**
 * 取消行内编辑（按Esc）
 */
function cancelInlineEdit(td, originalValue) {
    td.classList.remove('editing');
    // 解除宽高锁定
    td.style.width = '';
    td.style.minWidth = '';
    td.style.maxWidth = '';
    td.style.height = '';
    td.textContent = originalValue;
}

// 加载游戏列表
async function loadGames() {
    try {
        const response = await authFetch(`${API_BASE}/games`);
        const result = await response.json();

        // 保存所有游戏数据
        allGamesData = result.data || [];
        filteredGamesData = [...allGamesData]; // 初始时筛选数据等于全部数据

        // 自动填充游戏账号
        allGamesData.forEach(game => {
            if (!game.game_account) {
                game.game_account = getGameAccount(game.name);
            }
        });

        // 填充筛选下拉框
        populateFilterOptions();

        // 加载列顺序并初始化拖拽
        loadColumnOrder();
        initHeaderDrag();

        renderGamesPage();

        // 更新测试游戏下拉框（使用全部数据）
        updateSelectOptions('test-game', allGamesData, 'id', 'name', '请选择游戏');
    } catch (error) {
        console.error('加载游戏失败:', error);
    }
}

// 填充筛选下拉框选项
function populateFilterOptions() {
    // 游戏平台筛选
    const platformFilter = document.getElementById('platform-filter');
    if (!platformFilter) return;
    // 保留第一个"全部"选项，清空其他选项
    while (platformFilter.options.length > 1) {
        platformFilter.remove(1);
    }
    const platforms = [...new Set(allGamesData.map(game => game.platform).filter(p => p))];
    platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform;
        option.textContent = platform;
        platformFilter.appendChild(option);
    });

    // 游戏类型筛选
    const typeFilter = document.getElementById('type-filter');
    if (!typeFilter) return;
    // 保留第一个"全部"选项，清空其他选项
    while (typeFilter.options.length > 1) {
        typeFilter.remove(1);
    }
    const types = [...new Set(allGamesData.map(game => game.game_type).filter(t => t))];
    types.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        typeFilter.appendChild(option);
    });
}

// 渲染当前页游戏
function renderGamesPage() {
    const tbody = document.getElementById('games-table');
    const totalGames = filteredGamesData.length;

    // 如果显示全部
    let gamesToShow = filteredGamesData;
    if (pageSize !== -1) {
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        gamesToShow = filteredGamesData.slice(startIndex, endIndex);
    }

    // 更新表头的显示/隐藏
    updateColumnHeaders();

    if (gamesToShow.length > 0) {
        tbody.innerHTML = gamesToShow.map((game, index) => {
            const globalIndex = pageSize === -1 ? index + 1 : (currentPage - 1) * pageSize + index + 1;
            let rowHtml = `<td class="text-center"><strong>${globalIndex}</strong></td>`;

            // 根据columnOrder顺序生成单元格
            columnOrder.forEach(field => {
                if (!visibleColumns[field]) return;
                
                switch (field) {
                    case 'name':
                        rowHtml += `<td class="cell-game-name">${highlightSearch(game.name, 'games-table')}</td>`;
                        break;
                    case 'english_name':
                        rowHtml += `<td class="cell-game-name">${highlightSearch(game.english_name || '-', 'games-table')}</td>`;
                        break;
                    case 'platform':
                        rowHtml += `<td class="editable-cell" onclick="startGameDropdownEdit(this, ${game.id}, 'platform', 'game_platform')" title="点击选择">${escapeHtml(game.platform || '-')}</td>`;
                        break;
                    case 'game_id':
                        rowHtml += `<td>${highlightSearch(game.game_id || '-', 'games-table')}</td>`;
                        break;
                    case 'game_type':
                        rowHtml += `<td class="editable-cell" onclick="startGameDropdownEdit(this, ${game.id}, 'game_type', 'game_type')" title="点击选择">${highlightSearch(game.game_type || '-', 'games-table')}</td>`;
                        break;
                    case 'description':
                        rowHtml += `<td class="cell-description editable-cell" ondblclick="startGameTextEdit(this, ${game.id}, 'description')" title="双击编辑">${highlightSearch(game.description || '-', 'games-table')}</td>`;
                        break;
                    case 'developer':
                        rowHtml += `<td>${highlightSearch(game.developer || '-', 'games-table')}</td>`;
                        break;
                    case 'operator':
                        rowHtml += `<td>${highlightSearch(game.operator || '-', 'games-table')}</td>`;
                        break;
                    case 'release_date':
                        rowHtml += `<td>${escapeHtml(game.release_date || '-')}</td>`;
                        break;
                    case 'config_path':
                        rowHtml += `<td>${escapeHtml(game.config_path || '-')}</td>`;
                        break;
                    case 'adapter_progress':
                        rowHtml += `<td>${escapeHtml(game.adapter_progress || '0%')}</td>`;
                        break;
                    case 'owner':
                        rowHtml += `<td class="editable-cell" onclick="startGameDropdownEdit(this, ${game.id}, 'owner_id', 'members', '${escapeHtml(game.owner_id || '')}')" title="点击选择">${escapeHtml(game.owner_name || '-')}</td>`;
                        break;
                    case 'online_status':
                        rowHtml += `<td>${escapeHtml(getFieldOptionLabel('online_status', game.online_status) || '-')}</td>`;
                        break;
                    case 'quality':
                        rowHtml += `<td class="editable-cell" onclick="startGameDropdownEdit(this, ${game.id}, 'quality', 'quality', '${escapeHtml(game.quality || '')}')" title="点击选择">${escapeHtml(getFieldOptionLabel('quality', game.quality) || '-')}</td>`;
                        break;
                    case 'game_account':
                        const acctText = game.game_account || '-';
                        const acctHtml = acctText.split('\n').map(a => escapeHtml(a.trim())).filter(Boolean).join('<br>');
                        rowHtml += `<td class="editable-cell" style="white-space:nowrap;font-size:12px;" ondblclick="startGameTextEdit(this, ${game.id}, 'game_account')" title="双击编辑">${acctHtml}</td>`;
                        break;
                    case 'storage_location':
                        rowHtml += `<td class="editable-cell" onclick="startGameDropdownEdit(this, ${game.id}, 'storage_location', 'storage_location')" title="点击选择">${escapeHtml(game.storage_location || '硬盘1号')}</td>`;
                        break;
                    case 'game_engine':
                        rowHtml += `<td class="editable-cell" ondblclick="startGameTextEdit(this, ${game.id}, 'game_engine')" title="双击编辑">${escapeHtml(game.game_engine || '-')}</td>`;
                        break;
                }
            });

            rowHtml += `
                <td class="text-center action-icons">
                    <button class="action-icon-btn edit" onclick="editGame(${game.id})" title="编辑">✏️</button>
                    <button class="action-icon-btn delete" onclick="deleteGame(${game.id})" title="删除">🗑️</button>
                </td>
            `;

            return `<tr class="clickable" data-id="${game.id}">${rowHtml}</tr>`;
        }).join('');
    } else {
        // 计算显示的列数（包括序号、checkbox选择列和操作列）
        const visibleCount = Object.values(visibleColumns).filter(v => v).length + 3;
        tbody.innerHTML = `
            <tr>
                <td colspan="${visibleCount}" class="empty-state">
                    <div class="empty-icon">🎮</div>
                    <div class="empty-text">还没有游戏数据</div>
                    <div class="empty-sub">添加游戏以开始管理裸眼3D适配工作</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="openModal('game-modal')">➕ 添加第一个游戏</button>
                        <button class="btn" onclick="document.getElementById('excel-import-input').click()" style="margin-left:8px">📥 导入Excel</button>
                    </div>
                </td>
            </tr>
        `;
    }

    // 更新分页信息和控件
    updatePaginationControls();
    // P0: 为长文本单元格添加 tooltip
    applyCellTooltips('games-table');
    // P0: 初始化表头排序
    initTableSort('games-table');
    // P0: 初始化批量选择
    initBatchSelect('games-table', {
        entityName: '游戏',
        onDelete: async (ids) => {
            let ok = 0, fail = 0;
            for (const id of ids) {
                try {
                    const r = await authFetch(`${API_BASE}/games/${id}`, { method: 'DELETE' });
                    if (r.ok) ok++; else fail++;
                } catch { fail++; }
            }
            showToast(`批量删除完成：成功 ${ok}，失败 ${fail}`, ok > 0 ? 'success' : 'danger');
            if (ok > 0) await loadGames();
        }
    });
}

// ========== 游戏列表行内编辑 ==========

// 双击文本编辑（游戏简介、游戏账号）
function startGameTextEdit(td, gameId, field) {
    if (td.classList.contains('editing')) return;
    td.classList.add('editing');

    // 锁定宽高防抖动
    const rect = td.getBoundingClientRect();
    td.style.width = rect.width + 'px';
    td.style.minWidth = rect.width + 'px';
    td.style.maxWidth = rect.width + 'px';
    td.style.height = rect.height + 'px';
    td.style.boxSizing = 'border-box';

    const game = allGamesData.find(g => g.id === gameId);
    const originalValue = game ? (game[field] || '') : '';
    const originalHtml = td.innerHTML;

    // 游戏账号用 textarea（多行），简介用 input
    let input;
    if (field === 'game_account') {
        input = document.createElement('textarea');
        input.className = 'inline-edit-textarea';
        input.value = originalValue;
        input.rows = 2;
    } else {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit-input';
        input.value = originalValue;
    }

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    // 光标定位到句尾，不全选
    if (input.tagName === 'TEXTAREA') {
        input.selectionStart = input.selectionEnd = input.value.length;
    } else {
        input.setSelectionRange(input.value.length, input.value.length);
    }

    let saved = false;
    const save = async () => {
        if (saved) return;
        saved = true;
        const newValue = input.value.trim();
        // 无变化直接还原
        if (newValue === originalValue) {
            td.classList.remove('editing');
            td.innerHTML = originalHtml;
            td.style.width = ''; td.style.minWidth = ''; td.style.maxWidth = ''; td.style.height = '';
            return;
        }
        try {
            const response = await authFetch(`${API_BASE}/games/${gameId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: newValue })
            });
            if (response.ok) {
                if (game) game[field] = newValue;
                // 更新显示
                if (field === 'game_account') {
                    const lines = (newValue || '-').split('\n').map(a => escapeHtml(a.trim())).filter(Boolean).join('<br>');
                    td.innerHTML = lines;
                } else {
                    td.textContent = newValue || '-';
                }
            } else {
                td.innerHTML = originalHtml;
                showToast('保存失败', 'danger');
            }
        } catch (e) {
            td.innerHTML = originalHtml;
            showToast('保存失败', 'danger');
        }
        td.classList.remove('editing');
        td.style.width = ''; td.style.minWidth = ''; td.style.maxWidth = ''; td.style.height = '';
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && field !== 'game_account') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') {
            saved = true;
            td.classList.remove('editing');
            td.innerHTML = originalHtml;
            td.style.width = ''; td.style.minWidth = ''; td.style.maxWidth = ''; td.style.height = '';
        }
    });
}

// 点击下拉编辑（游戏平台、游戏类型、负责人、品质）
function startGameDropdownEdit(td, gameId, field, optionSource, currentRawValue) {
    if (td.classList.contains('editing')) return;
    td.classList.add('editing');

    // 锁定宽高防抖动
    const rect = td.getBoundingClientRect();
    td.style.width = rect.width + 'px';
    td.style.minWidth = rect.width + 'px';
    td.style.maxWidth = rect.width + 'px';
    td.style.height = rect.height + 'px';
    td.style.boxSizing = 'border-box';

    const game = allGamesData.find(g => g.id === gameId);
    const originalHtml = td.innerHTML;

    const select = document.createElement('select');
    select.className = 'inline-edit-select';

    // 空选项
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '-- 请选择 --';
    select.appendChild(emptyOpt);

    // 填充选项
    if (optionSource === 'members') {
        // 负责人：从成员列表
        (allMembersData || []).forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            if (String(game.owner_id) === String(m.id)) opt.selected = true;
            select.appendChild(opt);
        });
    } else {
        // 从字段设置获取选项
        const options = getFieldOptionsByKey(optionSource);
        const currentVal = game ? (game[field] || '') : '';
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            if (o.value === currentVal) opt.selected = true;
            select.appendChild(opt);
        });
    }

    td.innerHTML = '';
    td.appendChild(select);
    select.focus();

    let saved = false;
    const save = async () => {
        if (saved) return;
        saved = true;
        const newValue = select.value;
        const patchBody = { [field]: newValue || null };

        try {
            const response = await authFetch(`${API_BASE}/games/${gameId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patchBody)
            });
            if (response.ok) {
                const result = await response.json();
                if (game) game[field] = newValue || null;
                // 更新显示文本
                if (optionSource === 'members') {
                    const memberName = result.owner_name || '-';
                    if (game) game.owner_name = memberName;
                    td.textContent = memberName;
                } else if (optionSource === 'quality') {
                    td.textContent = getFieldOptionLabel('quality', newValue) || '-';
                } else {
                    td.textContent = newValue || '-';
                }
            } else {
                td.innerHTML = originalHtml;
                showToast('保存失败', 'danger');
            }
        } catch (e) {
            td.innerHTML = originalHtml;
            showToast('保存失败', 'danger');
        }
        td.classList.remove('editing');
        td.style.width = ''; td.style.minWidth = ''; td.style.maxWidth = ''; td.style.height = '';
    };

    select.addEventListener('change', save);
    select.addEventListener('blur', () => {
        // blur时如果还没保存（用户没选就点别处），还原
        if (!saved) {
            saved = true;
            td.classList.remove('editing');
            td.innerHTML = originalHtml;
            td.style.width = ''; td.style.minWidth = ''; td.style.maxWidth = ''; td.style.height = '';
        }
    });
}

// 更新分页控件
function updatePaginationControls() {
    const totalGames = filteredGamesData.length;
    const totalPages = pageSize === -1 ? 1 : Math.ceil(totalGames / pageSize);

    // 更新显示信息（pagination-info 已移除，安全跳过）
    const startShow = totalGames === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endShow = pageSize === -1 ? totalGames : Math.min(currentPage * pageSize, totalGames);
    const paginationInfo = document.getElementById('pagination-info');
    if (paginationInfo) {
        paginationInfo.textContent = `显示 ${startShow}-${endShow} 共 ${totalGames} 条`;
    }

    // 更新按钮状态
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = pageSize === -1 || currentPage >= totalPages;

    // 更新页码显示
    const pageNumbersDiv = document.getElementById('page-numbers');
    if (!pageNumbersDiv) return;
    if (totalPages <= 1) {
        pageNumbersDiv.innerHTML = '';
        // 即使只有一页也显示分页增强控件
        pageNumbersDiv.innerHTML = buildPaginationExtras(totalPages);
        return;
    }

    // 生成页码按钮
    let pageNumbersHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const isActive = i === currentPage ? 'active' : '';
        pageNumbersHTML += `<button class="btn btn-small page-number ${isActive}" onclick="goToPage(${i})">${i}</button>`;
    }
    pageNumbersDiv.innerHTML = pageNumbersHTML + buildPaginationExtras(totalPages);
}

/**
 * 构建分页增强控件（跳转输入框 + 每页条数选择器）
 */
function buildPaginationExtras(totalPages) {
    let html = '';

    // 跳转到指定页
    html += `<span class="page-jump-wrapper">跳至`;
    html += `<input type="number" min="1" max="${totalPages}" value="${currentPage}" `;
    html += `onkeydown="if(event.key==='Enter'){const v=parseInt(this.value);if(v>=1&&v<=${totalPages})goToPage(v);this.value=${currentPage};}" `;
    html += `title="输入页码后按回车跳转">`;
    html += `/${totalPages} 页</span>`;

    // 每页条数选择器
    const sizes = [20, 50, 100];
    html += `<span class="page-size-selector">每页`;
    html += `<select onchange="changePageSizeCustom(this.value)">`;
    sizes.forEach(s => {
        html += `<option value="${s}" ${pageSize === s ? 'selected' : ''}>${s}条</option>`;
    });
    html += `<option value="-1" ${pageSize === -1 ? 'selected' : ''}>全部</option>`;
    html += `</select></span>`;

    return html;
}

/**
 * 自定义每页条数（由增强分页选择器调用）
 */
function changePageSizeCustom(val) {
    pageSize = parseInt(val);
    currentPage = 1;

    // 同步到原有的 select（如果存在）
    const oldSelect = document.getElementById('page-size');
    if (oldSelect) oldSelect.value = val;

    renderGamesPage();
}

// 切换到上一页
function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderGamesPage();
    }
}

// 切换到下一页
function nextPage() {
    const totalGames = filteredGamesData.length;
    const totalPages = Math.ceil(totalGames / pageSize);
    if (currentPage < totalPages) {
        currentPage++;
        renderGamesPage();
    }
}

// 跳转到指定页
function goToPage(page) {
    currentPage = page;
    renderGamesPage();
}

// 改变每页显示数量
function changePageSize() {
    const select = document.getElementById('page-size');
    if (!select) return;
    pageSize = parseInt(select.value);
    currentPage = 1; // 重置到第一页
    renderGamesPage();
}

// 筛选游戏
function filterGames() {
    const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase();
    const platformFilter = document.getElementById('platform-filter')?.value || '';
    const typeFilter = document.getElementById('type-filter')?.value || '';
    const statusFilter = document.getElementById('status-filter')?.value || '';

    // P0: 注册搜索关键词用于高亮渲染
    setSearchKeyword('games-table', searchTerm);

    filteredGamesData = allGamesData.filter(game => {
        // 搜索匹配（游戏名称或ID）
        const matchesSearch = !searchTerm ||
            (game.name && game.name.toLowerCase().includes(searchTerm)) ||
            (game.game_id && game.game_id.toString().includes(searchTerm));

        // 平台匹配
        const matchesPlatform = !platformFilter || game.platform === platformFilter;

        // 类型匹配
        const matchesType = !typeFilter || game.game_type === typeFilter;

        // 状态匹配
        const matchesStatus = !statusFilter || game.adaptation_status === statusFilter;

        return matchesSearch && matchesPlatform && matchesType && matchesStatus;
    });

    // 重置到第一页
    currentPage = 1;
    renderGamesPage();

    // 渲染筛选条件标签
    renderFilterChips({ searchTerm, platformFilter, typeFilter, statusFilter });
}

// 渲染筛选条件为可移除的Chip标签
function renderFilterChips(filters) {
    const container = document.getElementById('filter-chips');
    if (!container) return;

    const chips = [];

    if (filters.searchTerm) {
        chips.push({
            label: `搜索: "${filters.searchTerm}"`,
            onRemove: () => {
                const el = document.getElementById('search-input');
                if (el) { el.value = ''; filterGames(); }
            }
        });
    }

    if (filters.platformFilter) {
        const selectEl = document.getElementById('platform-filter');
        const text = selectEl?.options[selectEl.selectedIndex]?.text || filters.platformFilter;
        chips.push({
            label: `平台: ${text}`,
            onRemove: () => {
                const el = document.getElementById('platform-filter');
                if (el) { el.value = ''; filterGames(); }
            }
        });
    }

    if (filters.typeFilter) {
        const selectEl = document.getElementById('type-filter');
        const text = selectEl?.options[selectEl.selectedIndex]?.text || filters.typeFilter;
        chips.push({
            label: `类型: ${text}`,
            onRemove: () => {
                const el = document.getElementById('type-filter');
                if (el) { el.value = ''; filterGames(); }
            }
        });
    }

    if (filters.statusFilter) {
        const selectEl = document.getElementById('status-filter');
        const text = selectEl?.options[selectEl.selectedIndex]?.text || filters.statusFilter;
        chips.push({
            label: `状态: ${text}`,
            onRemove: () => {
                const el = document.getElementById('status-filter');
                if (el) { el.value = ''; filterGames(); }
            }
        });
    }

    if (chips.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    container.innerHTML = chips.map((chip, i) =>
        `<span class="filter-chip"><span class="chip-label">${escapeHtml(chip.label)}</span>` +
        `<span class="chip-remove" data-chip-idx="${i}">✕</span></span>`
    ).join('');

    // 绑定移除事件（使用事件委托更高效）
    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('chip-remove')) {
            const idx = parseInt(e.target.dataset.chipIdx);
            if (chips[idx]) chips[idx].onRemove();
        }
    }, { once: false });
}

// 重置筛选条件
function resetFilters() {
    const searchInput = document.getElementById('search-input');
    const platformFilter = document.getElementById('platform-filter');
    const typeFilter = document.getElementById('type-filter');
    const statusFilter = document.getElementById('status-filter');
    if (searchInput) searchInput.value = '';
    if (platformFilter) platformFilter.value = '';
    if (typeFilter) typeFilter.value = '';
    if (statusFilter) statusFilter.value = '';

    filteredGamesData = [...allGamesData];
    currentPage = 1;
    renderGamesPage();
}

// ========== 通用导入/导出 Excel ==========

// 各模块导出配置
const exportConfigs = {
    games: {
        sheetName: '游戏列表',
        getData: () => filteredGamesData || allGamesData,
        columns: [
            { key: 'name', label: '游戏名称' }, { key: 'english_name', label: '英文名称' },
            { key: 'platform', label: '游戏平台' }, { key: 'game_id', label: '游戏ID' },
            { key: 'game_type', label: '游戏类型' }, { key: 'description', label: '游戏简介' },
            { key: 'developer', label: '开发商' }, { key: 'operator', label: '运营商' },
            { key: 'release_date', label: '上线日期' }, { key: 'config_path', label: '配置路径' },
            { key: 'adapter_progress', label: '适配进度' }, { key: 'owner_name', label: '负责人' },
            { key: 'online_status', label: '上线状态' }, { key: 'quality', label: '品质' },
            { key: 'game_account', label: '游戏账号' }, { key: 'storage_location', label: '存储位置' }
        ]
    },
    members: {
        sheetName: '项目成员',
        getData: () => allMembersData,
        columns: [
            { key: 'name', label: '姓名' }, { key: 'wechat_id', label: '企业微信ID' },
            { key: 'role', label: '角色' }, { key: 'duty', label: '职责' },
            { key: 'status', label: '状态' }
        ]
    },
    devices: {
        sheetName: '设备列表',
        getData: () => allDevicesData,
        columns: [
            { key: 'manufacturer', label: '厂商' }, { key: 'device_type', label: '设备类型' },
            { key: 'name', label: '设备名称' }, { key: 'requirements', label: '设备需求' },
            { key: 'quantity', label: '数量' }, { key: 'keeper', label: '保管者' },
            { key: 'notes', label: '备注' }, { key: 'adapter_completion_rate', label: '适配完成率' },
            { key: 'total_bugs', label: '总BUG数' }, { key: 'completed_adaptations', label: '适配完成数' },
            { key: 'total_games', label: '适配游戏数' }, { key: 'status', label: '状态' }
        ]
    },
    tests: {
        sheetName: '测试列表',
        getData: () => allTestsData,
        columns: [
            { key: 'name', label: '测试名称' }, { key: 'game_name', label: '游戏' },
            { key: 'device_name', label: '设备' }, { key: 'tester_name', label: '测试人' },
            { key: 'test_date', label: '测试日期' }, { key: 'status', label: '状态' },
            { key: 'priority', label: '优先级' }, { key: 'result', label: '测试结果' },
            { key: 'bugs_count', label: '缺陷数' }, { key: 'description', label: '描述' }
        ]
    },
    bugs: {
        sheetName: '缺陷列表',
        getData: () => allBugsData,
        columns: [
            { key: 'versions', label: '涉及版本' }, { key: 'device_name', label: '设备名称' },
            { key: 'discovery_time', label: '发现时间' }, { key: 'owner', label: '负责人' },
            { key: 'bug_status', label: '缺陷状态' }, { key: 'priority', label: '优先级' },
            { key: 'problem_type', label: '问题类型' }, { key: 'description', label: '描述' },
            { key: 'steps', label: '复现步骤' }, { key: 'planned_fix_time', label: '计划修复' },
            { key: 'actual_fix_time', label: '实际修复' }
        ]
    }
};

// ========== 打印 & PDF 导出 ==========

/** 打印当前激活的Tab页面 */
function printCurrentPage() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) { showToast('没有可打印的内容', 'warning'); return; }

    // 设置打印日期水印
    document.body.setAttribute('data-print-date',
        '打印时间: ' + new Date().toLocaleString('zh-CN'));

    window.print();

    // 延迟清除（等打印对话框关闭）
    setTimeout(() => { document.body.removeAttribute('data-print-date'); }, 1000);
}

/**
 * 导出当前页面为PDF
 * 使用 html2pdf.js (CDN动态加载)
 */
async function exportToPDF(moduleName) {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) { showToast('没有可导出的内容', 'warning'); return; }

    showToast('正在生成PDF，请稍候...', 'info');

    try {
        // 动态加载 html2pdf.js
        if (typeof html2pdf === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        }

        const element = activeTab.cloneNode(true);
        // 清理不需要的元素
        element.querySelectorAll('.more-actions-wrapper, .toolbar, .filter-panel, button, .more-actions-dropdown')
            .forEach(el => el.remove());
        element.style.background = 'white';
        element.style.padding = '16px';

        const opt = {
            margin: [10, 10, 10, 10],
            filename: `${moduleName || 'report'}_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        await html2pdf().set(opt).from(element).save();
        showToast('PDF导出成功 ✅', 'success');
    } catch (e) {
        console.error('[PDF导出失败]', e);
        // 降级：使用浏览器打印功能作为替代
        showToast('PDF生成失败，将使用浏览器打印', 'warning');
        printCurrentPage();
    }
}

/** 动态加载JS脚本 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

function exportToExcel(moduleName) {
    moduleName = moduleName || 'games';
    if (typeof XLSX === 'undefined') { showToast('XLSX 库未加载，无法导出', 'warning'); return; }
    const config = exportConfigs[moduleName];
    if (!config) { showToast('不支持的导出模块', 'warning'); return; }
    
    const rawData = config.getData() || [];
    const data = rawData.map((item, i) => {
        const row = { '序号': i + 1 };
        config.columns.forEach(col => { row[col.label] = item[col.key] || ''; });
        return row;
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.sheetName);
    XLSX.writeFile(wb, `${config.sheetName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`${config.sheetName}导出成功`, 'success');
}

function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') {
        showToast('XLSX 库未加载，无法导入', 'warning');
        return;
    }
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws);
            if (rows.length === 0) { showToast('文件中没有数据', 'warning'); return; }
            
            showConfirm(`读取到 ${rows.length} 条数据，确认导入到游戏列表？`, async () => {
                let success = 0, fail = 0;
                for (const row of rows) {
                    try {
                        const gameData = {
                            name: row['游戏名称'] || row['name'] || '',
                            english_name: row['英文名称'] || row['english_name'] || '',
                            platform: row['游戏平台'] || row['platform'] || '',
                            game_id: row['游戏ID'] || row['game_id'] || '',
                            game_type: row['游戏类型'] || row['game_type'] || '',
                            description: row['游戏简介'] || row['description'] || '',
                            developer: row['开发商'] || row['developer'] || '',
                            operator: row['运营商'] || row['operator'] || '',
                            release_date: row['上线日期'] || row['release_date'] || '',
                            config_path: row['配置路径'] || row['config_path'] || '',
                            adapter_progress: row['适配进度'] || row['adapter_progress'] || '',
                            online_status: row['上线状态'] || row['online_status'] || 'pending',
                            quality: row['品质'] || row['quality'] || 'normal',
                            game_account: row['游戏账号'] || row['game_account'] || '',
                            storage_location: row['存储位置'] || row['storage_location'] || ''
                        };
                        if (!gameData.name) { fail++; continue; }
                        const resp = await authFetch(`${API_BASE}/games`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(gameData)
                        });
                        const result = await resp.json();
                        if (result.success) success++; else fail++;
                    } catch { fail++; }
                }
                showToast(`导入完成：成功 ${success}，失败 ${fail}`, success > 0 ? 'success' : 'danger');
                if (success > 0) await loadGames();
            });
        } catch (err) {
            showToast('文件解析失败: ' + err.message, 'danger');
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

// 加载测试列表
async function loadTests() {
    try {
        const response = await authFetch(`${API_BASE}/tests`);
        const result = await response.json();

        allTestsData = result.data || [];
        renderTestsTable(allTestsData);
    } catch (error) {
        console.error('加载测试失败:', error);
    }
}

// P0: 渲染测试表格（支持筛选后的子集）
function renderTestsTable(data) {
    const tbody = document.getElementById('tests-table');
    if (data && data.length > 0) {
        tbody.innerHTML = data.map((test, index) => `
            <tr data-id="${test.id}">
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>${highlightSearch(test.name, 'tests-table')}</td>
                <td>${highlightSearch(test.game_name || '-', 'tests-table')}</td>
                <td>${highlightSearch(test.device_name || '-', 'tests-table')}</td>
                <td>${highlightSearch(test.tester_name || '-', 'tests-table')}</td>
                <td>${escapeHtml(test.test_date || '-')}</td>
                <td class="text-center"><span class="status-badge status-${sanitizeCssClass(test.status)}">${getTestStatusText(test.status)}</span></td>
                <td class="text-center"><span class="priority-badge priority-${sanitizeCssClass(test.priority)}">${getPriorityText(test.priority)}</span></td>
                <td>${test.bugs_count || 0}</td>
                <td class="text-center">
                    <button class="btn btn-small btn-edit" onclick="editTest(${test.id})">编辑</button>
                    <button class="btn btn-small btn-delete" onclick="deleteTest(${test.id})">删除</button>
                </td>
            </tr>
        `        ).join('');
        applyCellTooltips('tests-table');
        initBatchSelect('tests-table', {
            entityName: '测试记录',
            onDelete: async (ids) => {
                let ok = 0, fail = 0;
                for (const id of ids) {
                    try {
                        const r = await authFetch(`${API_BASE}/tests/${id}`, { method: 'DELETE' });
                        if (r.ok) ok++; else fail++;
                    } catch { fail++; }
                }
                showToast(`批量删除完成：成功 ${ok}，失败 ${fail}`, ok > 0 ? 'success' : 'danger');
                if (ok > 0) loadTests();
            }
        });
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="empty-state">
                    <div class="empty-icon">🧪</div>
                    <div class="empty-text">还没有测试记录</div>
                    <div class="empty-sub">创建测试记录以追踪游戏在各设备上的表现</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="openModal('test-modal')">➕ 创建第一个测试</button>
                    </div>
                </td>
            </tr>
        `;
    }
}

// 加载缺陷列表
async function loadBugs() {
    try {
        const response = await authFetch(`${API_BASE}/bugs`);
        const result = await response.json();

        allBugsData = result.data || [];
        renderBugsTable(allBugsData);
    } catch (error) {
        console.error('加载缺陷失败:', error);
    }
}

// P0: 渲染缺陷表格（支持筛选后的子集）
function renderBugsTable(data) {
    const tbody = document.getElementById('bugs-table');
    if (data && data.length > 0) {
        tbody.innerHTML = data.map((bug, index) => `
            <tr data-id="${bug.id}">
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>${highlightSearch(bug.versions || '-', 'bugs-table')}</td>
                <td>${highlightSearch(bug.device_name || '-', 'bugs-table')}</td>
                <td>${escapeHtml(bug.discovery_time || '-')}</td>
                <td>${highlightSearch(bug.owner || '-', 'bugs-table')}</td>
                <td class="text-center"><span class="status-badge status-${sanitizeCssClass(bug.bug_status)}">${getBugStatusText(bug.bug_status)}</span></td>
                <td class="text-center"><span class="priority-badge priority-${sanitizeCssClass(bug.priority)}">${getPriorityText(bug.priority)}</span></td>
                <td>${highlightSearch(bug.problem_type || '-', 'bugs-table')}</td>
                <td>${highlightSearch(bug.description || '-', 'bugs-table')}</td>
                <td class="text-center">
                    <button class="btn btn-small btn-edit" onclick="editBug(${bug.id})">编辑</button>
                    <button class="btn btn-small btn-delete" onclick="deleteBug(${bug.id})">删除</button>
                </td>
            </tr>
        `        ).join('');
        applyCellTooltips('bugs-table');
        initBatchSelect('bugs-table', {
            entityName: '缺陷',
            onDelete: async (ids) => {
                let ok = 0, fail = 0;
                for (const id of ids) {
                    try {
                        const r = await authFetch(`${API_BASE}/bugs/${id}`, { method: 'DELETE' });
                        if (r.ok) ok++; else fail++;
                    } catch { fail++; }
                }
                showToast(`批量删除完成：成功 ${ok}，失败 ${fail}`, ok > 0 ? 'success' : 'danger');
                if (ok > 0) loadBugs();
            }
        });
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="empty-state">
                    <div class="empty-icon">🐛</div>
                    <div class="empty-text">暂无缺陷记录</div>
                    <div class="empty-sub">测试过程中发现的问题会记录在这里</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="openModal('bug-modal')">➕ 报告一个缺陷</button>
                    </div>
                </td>
            </tr>
        `;
    }
}

// ========== P0/P1.7: 通用模块筛选 ==========
function filterModule(moduleName) {
    const searchEl = document.getElementById(`${moduleName}-search`);
    const statusEl = document.getElementById(`${moduleName}-status-filter`);
    const keyword = (searchEl ? searchEl.value : '').toLowerCase().trim();
    const statusVal = statusEl ? statusEl.value : '';

    // P0: 注册搜索关键词用于高亮渲染
    setSearchKeyword(`${moduleName}-table`, keyword);

    // 筛选配置：定义每个模块的搜索字段和状态字段
    const config = {
        members: {
            source: () => allMembersData,
            searchFields: ['name', 'role', 'duty', 'wechat_id'],
            statusField: 'status',
            render: renderMembersTable,
            filteredVar: 'filteredMembersData'
        },
        devices: {
            source: () => allDevicesData,
            searchFields: ['name', 'manufacturer', 'device_type', 'keeper'],
            statusField: 'status',
            render: renderDevicesTable,
            filteredVar: 'filteredDevicesData'
        },
        tests: {
            source: () => allTestsData,
            searchFields: ['name', 'game_name', 'device_name', 'tester_name'],
            statusField: 'status',
            render: renderTestsTable,
            filteredVar: 'filteredTestsData'
        },
        bugs: {
            source: () => allBugsData,
            searchFields: ['description', 'device_name', 'owner', 'problem_type', 'versions'],
            statusField: 'bug_status',
            render: renderBugsTable,
            filteredVar: 'filteredBugsData'
        }
    };

    const cfg = config[moduleName];
    if (!cfg) return;

    let data = cfg.source() || [];

    // 关键字筛选
    if (keyword) {
        data = data.filter(item =>
            cfg.searchFields.some(field => {
                const val = item[field];
                return val && String(val).toLowerCase().includes(keyword);
            })
        );
    }

    // 状态筛选
    if (statusVal) {
        data = data.filter(item => item[cfg.statusField] === statusVal);
    }

    // P1.7: 保存筛选后的数据到全局变量，供分页回调使用
    if (cfg.filteredVar) {
        window[cfg.filteredVar] = data;
    }

    cfg.render(data);

    // P1.5: 渲染筛选条件Chips标签
    renderModuleFilterChips(moduleName, {
        searchTerm: keyword,
        statusFilter: statusVal
    });
}

// 更新统计数据（直接查后端API，确保实时准确）
async function updateStats() {
    const setStatText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    try {
        const response = await authFetch(`${API_BASE}/stats/dashboard`);
        const result = await response.json();
        if (result.success) {
            const d = result.data;
            setStatText('stat-members', d.members_total || 0);
            setStatText('stat-devices', d.devices_total || 0);
            setStatText('stat-games', d.games_total || 0);
            setStatText('stat-tests', d.tests_total || 0);
            setStatText('stat-bugs', d.bugs_total || 0);
        }
    } catch (e) {
        // 后端不可用时降级到内存数据
        setStatText('stat-members', (allMembersData || []).length);
        setStatText('stat-devices', (allDevicesData || []).length);
        setStatText('stat-games', (allGamesData || []).length);
        setStatText('stat-tests', (allTestsData || []).length);
        setStatText('stat-bugs', (allBugsData || []).length);
    }

    // 更新各模块底部统计
    updateGamesModuleStats();
    updateMembersModuleStats();
    updateDevicesModuleStats();
    updateTestsModuleStats();
    updateBugsModuleStats();
}

// ========== 各模块底部统计 ==========

function makeStatCard(label, num, highlight) {
    const cls = highlight ? ' highlight' : '';
    return `<div class="stat-card"><span class="stat-num${cls}">${num}</span><span class="stat-label">${label}</span></div>`;
}

// 游戏列表统计
function updateGamesModuleStats() {
    const container = document.getElementById('games-stats-items');
    if (!container) return;
    const data = allGamesData || [];
    const total = data.length;

    // 按平台统计
    const platformCounts = {};
    data.forEach(g => {
        const p = g.platform || '未知';
        platformCounts[p] = (platformCounts[p] || 0) + 1;
    });

    // 上线状态统计
    const onlineStatusMap = {};
    try { getFieldOptionsByKey('online_status').forEach(o => onlineStatusMap[o.value] = o.label); } catch(e) {}
    if (!onlineStatusMap['online']) Object.assign(onlineStatusMap, {'pending':'待上线','in_progress':'适配中','paused':'暂停适配','online':'已上线'});

    const onlineCounts = {};
    data.forEach(g => {
        const s = g.online_status || 'pending';
        const label = onlineStatusMap[s] || s;
        onlineCounts[label] = (onlineCounts[label] || 0) + 1;
    });

    // 品质统计
    const qualityCounts = { '推荐': 0, '一般': 0 };
    data.forEach(g => {
        if (g.quality === 'recommended') qualityCounts['推荐']++;
        else qualityCounts['一般']++;
    });

    let html = makeStatCard('游戏总数', total, true);

    // 平台统计（按数量降序，最多显示5个）
    const sortedPlatforms = Object.entries(platformCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    sortedPlatforms.forEach(([name, count]) => {
        html += makeStatCard(name, count);
    });

    // 上线状态
    Object.entries(onlineCounts).forEach(([label, count]) => {
        if (count > 0) html += makeStatCard(label, count);
    });

    // 品质
    if (qualityCounts['推荐'] > 0) html += makeStatCard('推荐', qualityCounts['推荐']);

    container.innerHTML = html;
}

// 成员列表统计
function updateMembersModuleStats() {
    const container = document.getElementById('members-stats-items');
    if (!container) return;
    const data = allMembersData || [];
    const total = data.length;

    // 按角色统计
    const roleCounts = {};
    data.forEach(m => {
        const r = m.role || '未设定';
        roleCounts[r] = (roleCounts[r] || 0) + 1;
    });

    // 按状态统计
    const activeCnt = data.filter(m => m.status === 'active').length;
    const inactiveCnt = total - activeCnt;

    let html = makeStatCard('成员总数', total, true);
    html += makeStatCard('在职', activeCnt);
    if (inactiveCnt > 0) html += makeStatCard('离职', inactiveCnt);

    Object.entries(roleCounts).forEach(([role, count]) => {
        html += makeStatCard(role, count);
    });

    container.innerHTML = html;
}

// 设备列表统计
function updateDevicesModuleStats() {
    const container = document.getElementById('devices-stats-items');
    if (!container) return;
    const rows = document.querySelectorAll('#devices-table tr:not(.empty-state)');
    const total = rows.length;

    // 按厂商统计
    const mfrCounts = {};
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) {
            const mfr = cells[1].textContent.trim() || '未知';
            mfrCounts[mfr] = (mfrCounts[mfr] || 0) + 1;
        }
    });

    let html = makeStatCard('设备总数', total, true);
    Object.entries(mfrCounts).forEach(([mfr, count]) => {
        if (mfr !== '-') html += makeStatCard(mfr, count);
    });

    container.innerHTML = html;
}

// 适配进展统计
function updateProgressModuleStats(deviceIndex) {
    const container = document.getElementById('progress-stats-items');
    if (!container) return;

    if (deviceIndex === undefined || deviceIndex === null || !progressData[deviceIndex]) {
        container.innerHTML = '';
        return;
    }

    const device = progressData[deviceIndex];
    const games = device.games || [];
    const total = games.length;

    // 上线状态统计
    const onlineStatusMap = {};
    try { getFieldOptionsByKey('online_status').forEach(o => onlineStatusMap[o.value] = o.label); } catch(e) {}
    if (!onlineStatusMap['online']) Object.assign(onlineStatusMap, {'pending':'待上线','in_progress':'适配中','paused':'暂停适配','online':'已上线'});

    const statusCounts = {};
    games.forEach(g => {
        const s = g.onlineStatus || 'pending';
        const label = onlineStatusMap[s] || s;
        statusCounts[label] = (statusCounts[label] || 0) + 1;
    });

    // 品质统计
    const recommendedCnt = games.filter(g => g.quality === 'recommended').length;

    // 平均进度
    const avgProgress = total > 0 ? Math.round(games.reduce((sum, g) => sum + (g.adapterProgress || 0), 0) / total) : 0;

    let html = makeStatCard('游戏总数', total, true);
    Object.entries(statusCounts).forEach(([label, count]) => {
        if (count > 0) html += makeStatCard(label, count);
    });
    if (recommendedCnt > 0) html += makeStatCard('推荐', recommendedCnt);
    html += makeStatCard('平均进度', avgProgress + '%');

    container.innerHTML = html;
}

// 测试列表统计
function updateTestsModuleStats() {
    const container = document.getElementById('tests-stats-items');
    if (!container) return;
    const rows = document.querySelectorAll('#tests-table tr:not(.empty-state)');
    const total = rows.length;

    let html = makeStatCard('测试总数', total, true);
    container.innerHTML = html;
}

// 缺陷列表统计
function updateBugsModuleStats() {
    const container = document.getElementById('bugs-stats-items');
    if (!container) return;
    const rows = document.querySelectorAll('#bugs-table tr:not(.empty-state)');
    const total = rows.length;

    let html = makeStatCard('缺陷总数', total, true);
    container.innerHTML = html;
}

// 表单处理
function initForms() {
    // 成员表单
    document.getElementById('member-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!acquireSubmitLock('member-form')) return;
        if (!validateForm('member-form')) { releaseSubmitLock('member-form'); return; }
        const id = document.getElementById('member-id').value;
        const data = {
            name: document.getElementById('member-name').value,
            wechat_id: document.getElementById('member-wechat-id').value,
            role: document.getElementById('member-role').value,
            duty: document.getElementById('member-duty').value,
            status: document.getElementById('member-status').value
        };

        const url = id ? `${API_BASE}/members/${id}` : `${API_BASE}/members`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeModal('member-modal');
                showToast(id ? '成员已更新' : '成员已添加', 'success');
                loadMembers();
                resetForm('member-form');
            }
        } catch (error) {
            console.error('保存成员失败:', error);
            showToast('保存失败', 'danger');
        } finally {
            releaseSubmitLock('member-form');
        }
    });

    // 设备表单
    document.getElementById('device-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!acquireSubmitLock('device-form')) return;
        if (!validateForm('device-form')) { releaseSubmitLock('device-form'); return; }
        const id = document.getElementById('device-id').value;
        const data = {
            manufacturer: document.getElementById('device-manufacturer').value,
            device_type: document.getElementById('device-type').value,
            name: document.getElementById('device-name').value,
            requirements: document.getElementById('device-requirements').value,
            quantity: document.getElementById('device-quantity').value,
            keeper: document.getElementById('device-keeper').value,
            notes: document.getElementById('device-notes').value,
            adapter_completion_rate: document.getElementById('device-adapter-rate').value,
            total_bugs: document.getElementById('device-total-bugs').value,
            completed_adaptations: document.getElementById('device-completed-adaptations').value,
            total_games: document.getElementById('device-total-games').value,
            status: document.getElementById('device-status').value,
            assigned_to: document.getElementById('device-assigned').value || null
        };

        const url = id ? `${API_BASE}/devices/${id}` : `${API_BASE}/devices`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeModal('device-modal');
                showToast(id ? '设备已更新' : '设备已添加', 'success');
                loadDevices();
                resetForm('device-form');
            }
        } catch (error) {
            console.error('保存设备失败:', error);
            showToast('保存失败', 'danger');
        } finally {
            releaseSubmitLock('device-form');
        }
    });

    // 游戏表单
    document.getElementById('game-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!acquireSubmitLock('game-form')) return;
        if (!validateForm('game-form')) { releaseSubmitLock('game-form'); return; }
        const id = document.getElementById('game-id').value;
        const data = {
            name: document.getElementById('game-name').value,
            english_name: document.getElementById('game-english-name').value,
            platform: document.getElementById('game-platform').value,
            game_id: document.getElementById('game-id-input').value,
            game_type: document.getElementById('game-type').value,
            description: document.getElementById('game-description').value,
            developer: document.getElementById('game-developer').value,
            operator: document.getElementById('game-operator').value,
            release_date: document.getElementById('game-release-date').value,
            config_path: document.getElementById('game-config-path').value,
            adapter_progress: document.getElementById('game-adapter-progress').value,
            version: document.getElementById('game-version').value,
            package_size: document.getElementById('game-package-size').value,
            adaptation_status: document.getElementById('game-adaptation-status').value,
            adaptation_notes: document.getElementById('game-adaptation-notes').value,
            owner_id: document.getElementById('game-owner').value,
            online_status: document.getElementById('game-online-status').value,
            quality: document.getElementById('game-quality').value,
            game_account: document.getElementById('game-account').value,
            storage_location: document.getElementById('game-storage-location').value,
            game_engine: document.getElementById('game-engine').value
        };

        const url = id ? `${API_BASE}/games/${id}` : `${API_BASE}/games`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeModal('game-modal');
                showToast(id ? '游戏已更新' : '游戏已添加', 'success');
                await loadGames(); // 重新加载所有数据并重新筛选
                resetForm('game-form');
            }
        } catch (error) {
            console.error('保存游戏失败:', error);
            showToast('保存失败', 'danger');
        } finally {
            releaseSubmitLock('game-form');
        }
    });

    // 测试表单
    document.getElementById('test-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!acquireSubmitLock('test-form')) return;
        if (!validateForm('test-form')) { releaseSubmitLock('test-form'); return; }
        const id = document.getElementById('test-id').value;
        const data = {
            name: document.getElementById('test-name').value,
            game_id: document.getElementById('test-game').value,
            device_id: document.getElementById('test-device').value,
            tester_id: document.getElementById('test-tester').value,
            test_date: document.getElementById('test-date').value,
            status: document.getElementById('test-status').value,
            priority: document.getElementById('test-priority').value,
            result: document.getElementById('test-result').value,
            bugs_count: document.getElementById('test-bugs').value,
            description: document.getElementById('test-description').value
        };

        const url = id ? `${API_BASE}/tests/${id}` : `${API_BASE}/tests`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeModal('test-modal');
                showToast(id ? '测试已更新' : '测试已添加', 'success');
                loadTests();
                resetForm('test-form');
            }
        } catch (error) {
            console.error('保存测试失败:', error);
            showToast('保存失败', 'danger');
        } finally {
            releaseSubmitLock('test-form');
        }
    });

    // 缺陷表单
    document.getElementById('bug-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!acquireSubmitLock('bug-form')) return;
        if (!validateForm('bug-form')) { releaseSubmitLock('bug-form'); return; }
        const id = document.getElementById('bug-id').value;
        const data = {
            versions: document.getElementById('bug-versions').value,
            device_name: document.getElementById('bug-device-name').value,
            discovery_time: document.getElementById('bug-discovery-time').value,
            owner: document.getElementById('bug-owner').value,
            bug_status: document.getElementById('bug-status').value,
            priority: document.getElementById('bug-priority').value,
            problem_type: document.getElementById('bug-problem-type').value,
            description: document.getElementById('bug-description').value,
            steps: document.getElementById('bug-steps').value,
            planned_fix_time: document.getElementById('bug-planned-fix-time').value,
            actual_fix_time: document.getElementById('bug-actual-fix-time').value
        };

        const url = id ? `${API_BASE}/bugs/${id}` : `${API_BASE}/bugs`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeModal('bug-modal');
                showToast(id ? '缺陷已更新' : '缺陷已添加', 'success');
                loadBugs();
                resetForm('bug-form');
            }
        } catch (error) {
            console.error('保存缺陷失败:', error);
            showToast('保存失败', 'danger');
        } finally {
            releaseSubmitLock('bug-form');
        }
    });

    // P0: 初始化表单实时校验
    initFormValidations();
}

// 模态框操作
let _previousFocus = null; // P1.8: 记录弹窗打开前的焦点元素

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        // P1.8: 保存当前焦点元素
        _previousFocus = document.activeElement;
        
        modal.style.display = 'block';
        
        // P1.8: 弹窗打开后将焦点移动到弹窗内的第一个可交互元素
        setTimeout(() => {
            const focusable = modal.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
            if (focusable) {
                focusable.focus();
            } else {
                // 如果没有可交互元素，聚焦到弹窗本身
                modal.focus();
            }
        }, 50);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
    resetForm(modalId.replace('-modal', '-form'));
    
    // P1.8: 弹窗关闭后恢复焦点到之前保存的元素
    if (_previousFocus && _previousFocus.focus) {
        setTimeout(() => {
            _previousFocus.focus();
            _previousFocus = null;
        }, 50);
    }
}

// 点击模态框外部关闭 - 已禁用自动关闭功能
// 用户必须点击关闭按钮或取消按钮来关闭模态框，防止误触
// 如果需要恢复点击背景关闭功能，取消下面的注释
/*
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        const modalId = event.target.id;
        if (modalId) {
            closeModal(modalId);
        } else {
            event.target.style.display = 'none';
        }
    }
}
*/

// 重置表单
function resetForm(formId) {
    const form = document.getElementById(formId);
    if (form) form.reset();
    const idField = document.getElementById(formId.replace('-form', '-id'));
    if (idField) {
        idField.value = '';
    }
}

// ========== 成员列表 - 双击行内编辑 ==========
/**
 * 双击成员单元格进入编辑模式
 * @param {HTMLElement} td - 被双击的<td>元素
 * @param {number} memberId - 成员ID
 * @param {string} field - 字段名 (name/wechat_id/role/duty/status)
 * @param {string} inputType - 输入类型 (text/select/textarea)
 */
function startMemberInlineEdit(td, memberId, field, inputType) {
    // 防止重复激活
    if (td.querySelector('input, textarea, select')) return;

    const currentValue = td.textContent.trim();
    const displayValue = currentValue === '-' ? '' : currentValue;

    td.classList.add('editing');

    // 锁定单元格宽高，防止编辑态撑开引起抖动
    const rect = td.getBoundingClientRect();
    td.style.width = rect.width + 'px';
    td.style.minWidth = rect.width + 'px';
    td.style.maxWidth = rect.width + 'px';
    td.style.height = rect.height + 'px';
    td.style.boxSizing = 'border-box';

    // 角色：下拉选择（从字段选项获取）
    if (field === 'role') {
        const select = document.createElement('select');
        select.className = 'inline-edit-select';
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- 请选择角色 --';
        select.appendChild(emptyOpt);

        // 优先从 fieldOptions 获取，兜底写死
        const roleOptions = getFieldOptionsByKey('member_role').length > 0 ? getFieldOptionsByKey('member_role') : [
            {value:'项目经理',label:'项目经理'},{value:'开发工程师',label:'开发工程师'},
            {value:'测试工程师',label:'测试工程师'},{value:'适配工程师',label:'适配工程师'},
            {value:'UI设计师',label:'UI设计师'}
        ];
        roleOptions.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (opt.value === displayValue || opt.label === displayValue) o.selected = true;
            select.appendChild(o);
        });

        td.innerHTML = '';
        td.appendChild(select);
        select.focus();
        try { select.showPicker(); } catch(e) { select.click(); }
        select.addEventListener('change', () => saveMemberInlineEdit(td, memberId, field, select.value));
        select.addEventListener('blur', () => {
            setTimeout(() => {
                if (td.querySelector('select')) cancelMemberInlineEdit(td, memberId, field, currentValue);
            }, 150);
        });
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') cancelMemberInlineEdit(td, memberId, field, currentValue);
        });
    }
    // 状态：下拉选择
    else if (field === 'status') {
        const select = document.createElement('select');
        select.className = 'inline-edit-select';
        const statusOptions = getFieldOptionsByKey('member_status').length > 0 ? getFieldOptionsByKey('member_status') : [
            {value:'active',label:'活跃'},{value:'inactive',label:'非活跃'}
        ];
        statusOptions.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            // 找到当前成员的实际status值
            const member = (allMembersData || []).find(m => m.id === memberId);
            if (member && member.status === opt.value) o.selected = true;
            select.appendChild(o);
        });

        td.innerHTML = '';
        td.appendChild(select);
        select.focus();
        try { select.showPicker(); } catch(e) { select.click(); }
        select.addEventListener('change', () => saveMemberInlineEdit(td, memberId, field, select.value));
        select.addEventListener('blur', () => {
            setTimeout(() => {
                if (td.querySelector('select')) cancelMemberInlineEdit(td, memberId, field, currentValue);
            }, 150);
        });
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') cancelMemberInlineEdit(td, memberId, field, currentValue);
        });
    }
    // 职责：textarea（多行文本）
    else if (field === 'duty') {
        td.innerHTML = `<textarea class="inline-edit-input" style="min-height:60px;resize:vertical;">${escapeHtml(displayValue)}</textarea>`;
        const textarea = td.querySelector('textarea');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        textarea.addEventListener('blur', () => saveMemberInlineEdit(td, memberId, field, textarea.value));
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); textarea.blur(); }
            if (e.key === 'Escape') cancelMemberInlineEdit(td, memberId, field, currentValue);
        });
    }
    // 其他字段：通用 input
    else {
        td.innerHTML = `<input type="text" class="inline-edit-input" value="${escapeHtml(displayValue)}">`;
        const input = td.querySelector('input');
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        input.addEventListener('blur', () => saveMemberInlineEdit(td, memberId, field, input.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') cancelMemberInlineEdit(td, memberId, field, currentValue);
        });
    }
}

/**
 * 保存成员行内编辑
 */
async function saveMemberInlineEdit(td, memberId, field, newValue) {
    td.classList.remove('editing');
    const trimmed = newValue.trim();

    // 构造PATCH请求体
    const body = {};
    body[field] = trimmed;

    try {
        const response = await authFetch(`${API_BASE}/members/${memberId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            // 更新本地数据
            const member = (allMembersData || []).find(m => m.id === memberId);
            if (member) member[field] = trimmed;

            // 恢复单元格显示
            if (field === 'status') {
                td.innerHTML = `<span class="status-badge status-${sanitizeCssClass(trimmed)}">${getStatusText(trimmed)}</span>`;
            } else {
                td.textContent = trimmed || '-';
            }

            // 解除宽高锁定
            td.style.width = '';
            td.style.minWidth = '';
            td.style.maxWidth = '';
            td.style.height = '';

            showToast('已保存', 'success');
        } else {
            // 保存失败，恢复原值
            cancelMemberInlineEditRestore(td, memberId, field);
            showToast('保存失败', 'danger');
        }
    } catch (error) {
        cancelMemberInlineEditRestore(td, memberId, field);
        showToast('保存失败', 'danger');
    }
}

/**
 * 取消成员行内编辑（ESC或blur时未change）
 */
function cancelMemberInlineEdit(td, memberId, field, originalValue) {
    td.classList.remove('editing');
    if (field === 'status') {
        const member = (allMembersData || []).find(m => m.id === memberId);
        const statusVal = member ? member.status : 'active';
        td.innerHTML = `<span class="status-badge status-${sanitizeCssClass(statusVal)}">${getStatusText(statusVal)}</span>`;
    } else {
        td.textContent = originalValue || '-';
    }
    td.style.width = '';
    td.style.minWidth = '';
    td.style.maxWidth = '';
    td.style.height = '';
}

/**
 * 保存失败时恢复（从本地数据恢复）
 */
function cancelMemberInlineEditRestore(td, memberId, field) {
    const member = (allMembersData || []).find(m => m.id === memberId);
    if (field === 'status') {
        const statusVal = member ? member.status : 'active';
        td.innerHTML = `<span class="status-badge status-${sanitizeCssClass(statusVal)}">${getStatusText(statusVal)}</span>`;
    } else {
        td.textContent = member ? (member[field] || '-') : '-';
    }
    td.style.width = '';
    td.style.minWidth = '';
    td.style.maxWidth = '';
    td.style.height = '';
}

// 编辑成员
async function editMember(id) {
    try {
        const response = await authFetch(`${API_BASE}/members`);
        const result = await response.json();
        const member = result.data.find(m => m.id === id);

        if (member) {
            document.getElementById('member-id').value = member.id;
            document.getElementById('member-name').value = member.name;
            document.getElementById('member-wechat-id').value = member.wechat_id || '';
            document.getElementById('member-role').value = member.role || '';
            document.getElementById('member-duty').value = member.duty || '';
            document.getElementById('member-status').value = member.status;
            openModal('member-modal');
        }
    } catch (error) {
        console.error('加载成员失败:', error);
    }
}

// 删除成员
async function deleteMember(id) {
    showConfirm('确定要删除该成员吗？', async () => {
        try {
            const response = await authFetch(`${API_BASE}/members/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('成员已删除', 'success');
                loadMembers();
            }
        } catch (error) {
            console.error('删除成员失败:', error);
            showToast('删除失败', 'danger');
        }
    });
}

// 编辑设备
async function editDevice(id) {
    try {
        const response = await authFetch(`${API_BASE}/devices`);
        const result = await response.json();
        const device = result.data.find(d => d.id === id);

        if (device) {
            document.getElementById('device-id').value = device.id;
            document.getElementById('device-manufacturer').value = device.manufacturer || '';
            document.getElementById('device-type').value = device.device_type || '';
            document.getElementById('device-name').value = device.name;
            document.getElementById('device-requirements').value = device.requirements || '';
            document.getElementById('device-quantity').value = device.quantity || 1;
            document.getElementById('device-keeper').value = device.keeper || '';
            document.getElementById('device-notes').value = device.notes || '';
            document.getElementById('device-adapter-rate').value = device.adapter_completion_rate || '';
            document.getElementById('device-total-bugs').value = device.total_bugs || 0;
            document.getElementById('device-completed-adaptations').value = device.completed_adaptations || 0;
            document.getElementById('device-total-games').value = device.total_games || 0;
            document.getElementById('device-status').value = device.status;
            document.getElementById('device-assigned').value = device.assigned_to || '';
            openModal('device-modal');
        }
    } catch (error) {
        console.error('加载设备失败:', error);
    }
}

// 删除设备
async function deleteDevice(id) {
    showConfirm('确定要删除该设备吗？', async () => {
        try {
            const response = await authFetch(`${API_BASE}/devices/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('设备已删除', 'success');
                loadDevices();
            }
        } catch (error) {
            console.error('删除设备失败:', error);
            showToast('删除失败', 'danger');
        }
    });
}

// 编辑游戏
async function editGame(id) {
    try {
        const response = await authFetch(`${API_BASE}/games`);
        const result = await response.json();
        const game = result.data.find(g => g.id === id);

        if (game) {
            document.getElementById('game-id').value = game.id;
            document.getElementById('game-name').value = game.name;
            document.getElementById('game-english-name').value = game.english_name || '';
            document.getElementById('game-platform').value = game.platform || '';
            document.getElementById('game-id-input').value = game.game_id || '';
            document.getElementById('game-type').value = game.game_type || '';
            document.getElementById('game-description').value = game.description || '';
            document.getElementById('game-developer').value = game.developer || '';
            document.getElementById('game-operator').value = game.operator || '';
            document.getElementById('game-release-date').value = game.release_date || '';
            document.getElementById('game-config-path').value = game.config_path || '';
            document.getElementById('game-adapter-progress').value = game.adapter_progress || '';
            document.getElementById('game-version').value = game.version || '';
            document.getElementById('game-package-size').value = game.package_size || '';
            document.getElementById('game-adaptation-status').value = game.adaptation_status || '';
            document.getElementById('game-adaptation-notes').value = game.adaptation_notes || '';
            document.getElementById('game-owner').value = game.owner_id || '';
            document.getElementById('game-online-status').value = game.online_status || 'pending';
            document.getElementById('game-quality').value = game.quality || 'normal';
            document.getElementById('game-account').value = game.game_account || '';
            document.getElementById('game-storage-location').value = game.storage_location || '硬盘1号';
            document.getElementById('game-engine').value = game.game_engine || '';
            openModal('game-modal');
        }
    } catch (error) {
        console.error('加载游戏失败:', error);
    }
}

// 删除游戏
async function deleteGame(id) {
    showConfirm('确定要删除该游戏吗？', async () => {
        try {
            const response = await authFetch(`${API_BASE}/games/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('游戏已删除', 'success');
                await loadGames();
            }
        } catch (error) {
            console.error('删除游戏失败:', error);
            showToast('删除失败', 'danger');
        }
    });
}

// 编辑测试
async function editTest(id) {
    try {
        const response = await authFetch(`${API_BASE}/tests`);
        const result = await response.json();
        const test = result.data.find(t => t.id === id);

        if (test) {
            document.getElementById('test-id').value = test.id;
            document.getElementById('test-name').value = test.name;
            document.getElementById('test-game').value = test.game_id;
            document.getElementById('test-device').value = test.device_id;
            document.getElementById('test-tester').value = test.tester_id;
            document.getElementById('test-date').value = test.test_date || '';
            document.getElementById('test-status').value = test.status;
            document.getElementById('test-priority').value = test.priority;
            document.getElementById('test-result').value = test.result || '';
            document.getElementById('test-bugs').value = test.bugs_count || 0;
            document.getElementById('test-description').value = test.description || '';
            openModal('test-modal');
        }
    } catch (error) {
        console.error('加载测试失败:', error);
    }
}

// 删除测试
async function deleteTest(id) {
    showConfirm('确定要删除该测试吗？', async () => {
        try {
            const response = await authFetch(`${API_BASE}/tests/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('测试已删除', 'success');
                loadTests();
            }
        } catch (error) {
            console.error('删除测试失败:', error);
            showToast('删除失败', 'danger');
        }
    });
}

// 编辑缺陷
async function editBug(id) {
    try {
        const response = await authFetch(`${API_BASE}/bugs`);
        const result = await response.json();
        const bug = result.data.find(b => b.id === id);

        if (bug) {
            document.getElementById('bug-id').value = bug.id;
            document.getElementById('bug-versions').value = bug.versions || '';
            document.getElementById('bug-device-name').value = bug.device_name || '';
            document.getElementById('bug-discovery-time').value = bug.discovery_time || '';
            document.getElementById('bug-owner').value = bug.owner || '';
            document.getElementById('bug-status').value = bug.bug_status;
            document.getElementById('bug-priority').value = bug.priority;
            document.getElementById('bug-problem-type').value = bug.problem_type || '';
            document.getElementById('bug-description').value = bug.description || '';
            document.getElementById('bug-steps').value = bug.steps || '';
            document.getElementById('bug-planned-fix-time').value = bug.planned_fix_time || '';
            document.getElementById('bug-actual-fix-time').value = bug.actual_fix_time || '';
            openModal('bug-modal');
        }
    } catch (error) {
        console.error('加载缺陷失败:', error);
    }
}

// 删除缺陷
async function deleteBug(id) {
    showConfirm('确定要删除该缺陷吗？', async () => {
        try {
            const response = await authFetch(`${API_BASE}/bugs/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('缺陷已删除', 'success');
                loadBugs();
            }
        } catch (error) {
            console.error('删除缺陷失败:', error);
            showToast('删除失败', 'danger');
        }
    });
}

// 更新表头显示/隐藏
function updateColumnHeaders() {
    const thead = document.querySelector('#games-table').previousElementSibling;
    if (!thead) return;
    const headerRow = thead.querySelector('tr');
    if (!headerRow) return;
    
    // 获取所有表头（排除序号列和操作列）
    const allHeaders = Array.from(headerRow.querySelectorAll('th'));
    const fixedHeaders = allHeaders.filter(th => !th.dataset.field); // 序号列、checkbox、操作列
    const draggableHeaders = allHeaders.filter(th => th.dataset.field); // 可拖拽列
    
    // 按columnOrder排序可拖拽列
    const sortedHeaders = [];
    columnOrder.forEach(field => {
        const header = draggableHeaders.find(th => th.dataset.field === field);
        if (header) sortedHeaders.push(header);
    });
    
    // 清空表头行
    headerRow.innerHTML = '';
    
    // 重新按顺序添加：固定列前 -> 排序后的可拖拽列 -> 固定列后
    fixedHeaders.forEach((header, index) => {
        if (index < fixedHeaders.length / 2) {
            headerRow.appendChild(header);
        }
    });
    
    sortedHeaders.forEach(header => {
        // 更新显示/隐藏
        const field = header.dataset.field;
        if (visibleColumns[field]) {
            header.classList.remove('hidden-column');
        } else {
            header.classList.add('hidden-column');
        }
        headerRow.appendChild(header);
    });
    
    fixedHeaders.forEach((header, index) => {
        if (index >= fixedHeaders.length / 2) {
            headerRow.appendChild(header);
        }
    });
}

// 切换字段显示设置面板
function toggleColumnSettings() {
    const panel = document.getElementById('column-settings');
    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

// 全选所有列
function selectAllColumns() {
    const checkboxes = document.querySelectorAll('.column-settings-panel input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
}

// 取消全选所有列
function deselectAllColumns() {
    const checkboxes = document.querySelectorAll('.column-settings-panel input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
}

// 应用列显示设置
function applyColumnSettings() {
    const checkboxes = document.querySelectorAll('.column-settings-panel input[type="checkbox"]');

    checkboxes.forEach(checkbox => {
        const field = checkbox.value;
        visibleColumns[field] = checkbox.checked;
    });

    // 重新渲染游戏列表
    renderGamesPage();

    // 隐藏设置面板
    toggleColumnSettings();

    // 可选:保存到localStorage
    try {
        localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
    } catch (e) {
        console.warn('保存列设置到 localStorage 失败:', e);
    }
}

// 从localStorage加载列显示设置
function loadColumnSettings() {
    const savedSettings = localStorage.getItem('visibleColumns');
    if (savedSettings) {
        try {
            const saved = JSON.parse(savedSettings);

            // 合并保存的设置到默认设置中，新增字段默认显示
            // 这样旧的localStorage中没有的新字段会保持默认值true
            for (const key in saved) {
                if (key in visibleColumns) {
                    visibleColumns[key] = saved[key];
                }
            }

            // 更新设置面板中的复选框状态
            const checkboxes = document.querySelectorAll('.column-settings-panel input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                const field = checkbox.value;
                checkbox.checked = visibleColumns[field] || false;
            });
        } catch (error) {
            console.error('加载列显示设置失败:', error);
        }
    }
}

// ==================== 表格列排序功能 ====================

/**
 * 排序状态：{ field: string, direction: 'asc'|'desc'|null }
 * null = 默认顺序（按数据库原始顺序）
 */
let tableSortState = { field: null, direction: null };

/**
 * 初始化表头排序点击事件（在 DOMContentLoaded 或表格渲染后调用）
 * 为带有 data-field 属性的 <th> 添加点击排序
 */
function initTableSort(tableId) {
    const thead = document.querySelector(`#${tableId}`).closest('table')?.querySelector('thead');
    if (!thead) return;

    thead.querySelectorAll('th[data-field]').forEach(th => {
        // 跳过已初始化的（避免重复绑定）
        if (th.dataset.sortInit) return;
        th.dataset.sortInit = '1';

        th.style.userSelect = 'none';
        th.style.position = 'relative';

        // 保留表头拖拽的grab光标（不覆盖games-table的cursor:grab）
        if (tableId !== 'games-table' || !th.dataset.field) {
            th.style.cursor = 'pointer';
        }

        // 添加排序箭头占位
        if (!th.querySelector('.sort-arrow')) {
            const arrow = document.createElement('span');
            arrow.className = 'sort-arrow';
            arrow.innerHTML = ' <span class="sort-indicator"></span>';
            th.appendChild(arrow);
        }

        // 更新当前排序状态显示
        updateSortIndicator(th);

        th.addEventListener('click', () => {
            // 如果刚完成长按拖拽，跳过排序（防止竞争）
            if (_isHeaderLongPress) {
                _isHeaderLongPress = false;
                return;
            }
            const field = th.getAttribute('data-field');
            handleSortClick(tableId, field);
        });
    });
}

/**
 * 处理表头点击排序
 * 三态循环: default → asc → desc → default
 */
function handleSortClick(tableId, field) {
    if (tableSortState.field === field) {
        // 同一字段：切换方向或重置
        if (tableSortState.direction === 'asc') {
            tableSortState.direction = 'desc';
        } else if (tableSortState.direction === 'desc') {
            tableSortState.field = null;
            tableSortState.direction = null;
        } else {
            tableSortState.direction = 'asc';
        }
    } else {
        // 新字段：默认升序
        tableSortState.field = field;
        tableSortState.direction = 'asc';
    }

    // 更新所有表头箭头显示
    const thead = document.querySelector(`#${tableId}`).closest('table')?.querySelector('thead');
    if (thead) {
        thead.querySelectorAll('th[data-field]').forEach(th => updateSortIndicator(th));
    }

    // 对游戏列表应用排序并重新渲染
    if (tableId === 'games-table') {
        applyGamesSort();
        renderGamesPage();
    }
}

/**
 * 更新单个表头的排序箭头显示
 */
function updateSortIndicator(th) {
    const field = th.getAttribute('data-field');
    const indicator = th.querySelector('.sort-indicator');
    if (!indicator) return;

    th.classList.remove('sort-asc', 'sort-desc');

    if (tableSortState.field === field && tableSortState.direction) {
        th.classList.add(tableSortState.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        indicator.innerHTML = tableSortState.direction === 'asc' ? '▲' : '▼';
        indicator.style.opacity = '1';
    } else {
        indicator.innerHTML = '▽'; // 未排序时显示浅色双向箭头
        indicator.style.opacity = '0.3';
    }
}

/**
 * 对 filteredGamesData 进行原地排序
 */
function applyGamesSort() {
    if (!tableSortState.field || !tableSortState.direction) return;

    const field = tableSortState.field;
    const dir = tableSortState.direction;

    filteredGamesData.sort((a, b) => {
        let valA = a[field];
        let valB = b[field];

        // 数字类型字段的特殊处理
        if (field === 'adapter_progress') {
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        } else {
            // 字符串比较：转小写，null/undefined 排最后
            valA = (valA != null ? String(valA) : '');
            valB = (valB != null ? String(valB) : '');
        }

        let cmp = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
            cmp = valA - valB;
        } else {
            cmp = valA.localeCompare(valB, 'zh-CN', { numeric: true });
        }

        return dir === 'asc' ? cmp : -cmp;
    });

    // 排序后重置到第一页
    currentPage = 1;
}

// ========== 表单校验配置注册（P0） ==========

/**
 * 初始化所有表单的校验规则
 * 在 DOMContentLoaded 或 initForms() 末尾调用
 */
function initFormValidations() {
    // 成员表单：姓名必填
    registerFormValidation('member-form', {
        'member-name': [{ rule: 'required', message: '请输入成员姓名' }]
    });

    // 设备表单：名称必填，数量必须是数字
    registerFormValidation('device-form', {
        'device-name': [{ rule: 'required', message: '请输入设备名称' }],
        'device-quantity': [{ rule: 'isNumber', message: '数量必须是有效数字' }]
    });

    // 游戏表单：名称必填（最强校验）
    registerFormValidation('game-form', {
        'game-name': [
            { rule: 'required', message: '请输入游戏名称' },
            { rule: 'minLength', param: 2, message: '游戏名称至少2个字符' }
        ],
        'game-release-date': [{ rule: 'isDate', message: '日期格式不正确（如 2024-01-15）' }],
        'game-adapter-progress': [{ rule: 'isNumber', message: '适配进度必须是数字' }]
    });

    // 测试表单：测试名称必填
    registerFormValidation('test-form', {
        'test-name': [{ rule: 'required', message: '请输入测试名称' }],
        'test-date': [{ rule: 'isDate', message: '请输入有效的测试日期' }]
    });

    // 缺陷表单：描述必填
    registerFormValidation('bug-form', {
        'bug-description': [{ rule: 'required', message: '请输入缺陷描述' }],
        'bug-discovery-time': [{ rule: 'isDate', message: '请输入有效的发现时间' }]
    });
}

// P1.1: 全局点击事件处理 - 外部点击自动保存行内编辑
document.addEventListener('click', function(e) {
    // 如果没有正在编辑的单元格，不处理
    if (!_inlineEditCurrentTd) return;
    
    // 检查点击目标是否在编辑单元格内
    if (_inlineEditCurrentTd.contains(e.target)) return;
    
    // 点击在编辑单元格外，检查是否是input/select
    const input = _inlineEditCurrentTd.querySelector('input, textarea, select');
    if (input && document.contains(e.target) && !_inlineEditCurrentTd.contains(e.target)) {
        // 外部点击，触发blur保存
        input.blur();
    }
});

// P1.1: 编辑完成后清除记录
function clearInlineEditState() {
    _inlineEditCurrentTd = null;
}

// 在saveInlineEdit完成后调用clearInlineEditState
// 修改saveInlineEdit函数
const originalSaveInlineEdit = saveInlineEdit;
saveInlineEdit = async function(td, deviceId, field, newValue) {
    const result = await originalSaveInlineEdit(td, deviceId, field, newValue);
    clearInlineEditState();
    return result;
};

// cancelInlineEdit也需要清除状态
const originalCancelInlineEdit = cancelInlineEdit;
cancelInlineEdit = function(td, currentValue) {
    originalCancelInlineEdit(td, currentValue);
    clearInlineEditState();
};

// ========== 表头拖拽排序 - TAPD风格 ==========

// 全局标志：是否刚完成长按拖拽（用于阻止click排序）
let _isHeaderLongPress = false;

// 初始化表头拖拽
function initHeaderDrag() {
    const table = document.querySelector('#games-table');
    if (!table) return;

    const thead = table.previousElementSibling;
    if (!thead) return;

    const headerRow = thead.querySelector('tr');
    if (!headerRow) return;

    // 防重复绑定
    if (headerRow.dataset.headerDragInit) return;
    headerRow.dataset.headerDragInit = '1';
    
    let dragState = {
        isDragging: false,
        sourceTh: null,
        sourceField: null,
        sourceIndex: -1,
        ghost: null,
        indicator: null,
        longPressTimer: null,
        startX: 0,
        startY: 0
    };
    
    const LONG_PRESS_DELAY = 400; // 长按触发时间(ms)
    
    // 获取所有可拖拽的表头
    function getDraggableHeaders() {
        return Array.from(headerRow.querySelectorAll('th[data-field]'));
    }
    
    // 创建幽灵元素
    function createGhost(th, x, y) {
        const ghost = document.createElement('div');
        ghost.className = 'column-drag-ghost';
        ghost.textContent = th.textContent.trim();
        ghost.style.left = x + 'px';
        ghost.style.top = y + 'px';
        document.body.appendChild(ghost);
        return ghost;
    }
    
    // 创建插入指示器
    function createIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'column-drop-indicator';
        indicator.style.display = 'none';
        headerRow.appendChild(indicator);
        return indicator;
    }
    
    // 显示插入指示器
    function showIndicator(targetTh, position) {
        if (!dragState.indicator) {
            dragState.indicator = createIndicator();
        }
        
        const rect = targetTh.getBoundingClientRect();
        const rowRect = headerRow.getBoundingClientRect();
        
        dragState.indicator.style.display = 'block';
        dragState.indicator.style.height = rowRect.height + 'px';
        
        if (position === 'before') {
            dragState.indicator.style.left = (rect.left - rowRect.left) + 'px';
        } else {
            dragState.indicator.style.left = (rect.right - rowRect.left - 3) + 'px';
        }
    }
    
    // 隐藏插入指示器
    function hideIndicator() {
        if (dragState.indicator) {
            dragState.indicator.style.display = 'none';
        }
    }
    
    // 获取目标位置
    function getDropPosition(x, headers) {
        for (let i = 0; i < headers.length; i++) {
            const rect = headers[i].getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            
            if (x < midX) {
                return { index: i, position: 'before', th: headers[i] };
            }
        }
        return { index: headers.length, position: 'after', th: headers[headers.length - 1] };
    }
    
    // 执行列移动
    function moveColumn(fromField, toIndex) {
        const fromIndex = columnOrder.indexOf(fromField);
        if (fromIndex === -1) return;
        
        // 从原位置移除
        columnOrder.splice(fromIndex, 1);
        
        // 插入到新位置（考虑移除后的索引变化）
        let adjustedIndex = toIndex;
        if (fromIndex < toIndex) {
            adjustedIndex = toIndex - 1;
        }
        columnOrder.splice(adjustedIndex, 0, fromField);
        
        // 保存并重新渲染
        saveColumnOrder();
        renderGamesPage();
    }
    
    // 高亮对应列的数据单元格
    function highlightColumn(field, highlight) {
        const table = document.querySelector('#games-table');
        if (!table) return;
        
        const headers = getDraggableHeaders();
        const colIndex = headers.findIndex(h => h.dataset.field === field);
        if (colIndex === -1) return;
        
        // 表头高亮
        headers[colIndex].classList.toggle('dragging-source', highlight);
        
        // 数据行高亮（+1因为有序号列）
        const dataColIndex = colIndex + 1;
        table.querySelectorAll('tr').forEach(row => {
            const cell = row.children[dataColIndex];
            if (cell) {
                cell.classList.toggle('dragging-col', highlight);
            }
        });
    }
    
    // mousedown事件
    headerRow.addEventListener('mousedown', (e) => {
        const th = e.target.closest('th[data-field]');
        if (!th) return;
        
        // 忽略右键
        if (e.button !== 0) return;
        
        // 忽略点击在resize手柄上
        if (e.target.classList.contains('col-resize-handle')) return;
        
        dragState.sourceTh = th;
        dragState.sourceField = th.dataset.field;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;
        
        // 添加长按提示
        th.classList.add('press-hint');
        
        // 启动长按计时器
        dragState.longPressTimer = setTimeout(() => {
            dragState.isDragging = true;
            _isHeaderLongPress = true;  // 标记已进入拖拽模式
            th.classList.remove('press-hint');
            
            // 高亮源列
            highlightColumn(dragState.sourceField, true);
            
            // 创建幽灵元素
            dragState.ghost = createGhost(th, e.clientX, e.clientY);
            
            // 阻止文本选择
            document.body.style.userSelect = 'none';
        }, LONG_PRESS_DELAY);
    });
    
    // mousemove事件
    document.addEventListener('mousemove', (e) => {
        if (!dragState.sourceTh) return;
        
        // 如果还没开始拖拽，检查移动距离是否超过阈值（取消长按）
        if (!dragState.isDragging) {
            const dx = Math.abs(e.clientX - dragState.startX);
            const dy = Math.abs(e.clientY - dragState.startY);
            
            if (dx > 5 || dy > 5) {
                // 移动了，取消长按
                clearTimeout(dragState.longPressTimer);
                dragState.sourceTh.classList.remove('press-hint');
                dragState.sourceTh = null;
            }
            return;
        }
        
        // 更新幽灵位置
        if (dragState.ghost) {
            dragState.ghost.style.left = e.clientX + 'px';
            dragState.ghost.style.top = e.clientY + 'px';
        }
        
        // 显示插入指示器
        const headers = getDraggableHeaders();
        const dropPos = getDropPosition(e.clientX, headers);
        
        if (dropPos.th && dropPos.th !== dragState.sourceTh) {
            showIndicator(dropPos.th, dropPos.position);
        } else {
            hideIndicator();
        }
    });
    
    // mouseup事件
    document.addEventListener('mouseup', (e) => {
        if (!dragState.sourceTh) return;

        // 清除长按计时器
        clearTimeout(dragState.longPressTimer);
        dragState.sourceTh.classList.remove('press-hint');

        if (dragState.isDragging) {
            // 执行列移动
            const headers = getDraggableHeaders();
            const dropPos = getDropPosition(e.clientX, headers);
            
            if (dropPos.th && dropPos.th !== dragState.sourceTh) {
                const targetIndex = columnOrder.indexOf(dropPos.th.dataset.field);
                if (targetIndex !== -1) {
                    let insertIndex = targetIndex;
                    if (dropPos.position === 'after') {
                        insertIndex = targetIndex + 1;
                    }
                    moveColumn(dragState.sourceField, insertIndex);
                }
            }
            
            // 清理
            highlightColumn(dragState.sourceField, false);
            
            if (dragState.ghost) {
                dragState.ghost.remove();
                dragState.ghost = null;
            }
            
            hideIndicator();
            document.body.style.userSelect = '';
        }
        
        // 重置状态
        dragState = {
            isDragging: false,
            sourceTh: null,
            sourceField: null,
            sourceIndex: -1,
            ghost: null,
            indicator: null,
            longPressTimer: null,
            startX: 0,
            startY: 0
        };
    });
    
    // 防止拖拽时选中文字
    headerRow.addEventListener('selectstart', (e) => {
        if (dragState.isDragging) {
            e.preventDefault();
        }
    });
}

