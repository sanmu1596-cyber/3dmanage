/**
 * issues-versions.js — 问题与版本管理模块
 * 职责：版本/游戏版本/交织版本/交织问题/客户端问题/游戏问题CRUD、UX增强、Admin Dashboard
 * 依赖：core.js, auth.js, router.js（authFetch, showToast等）
 */
var App = window.App;

// ==================== 版本管理模块 ====================

let allVersionsData = [];           // 全部版本数据
let versionsReleasedData = [];      // 已发布
let versionsTestingData = [];       // 测试中
let currentVersionSubTab = 'ver-released';

// 切换版本管理子Tab
function switchVersionTab(subTab) {
    document.querySelectorAll('#versions .um-sub-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#versions .um-subtab-content').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`#versions .um-sub-tab[data-subtab="${subTab}"]`);
    if (btn) btn.classList.add('active');
    const content = document.getElementById(subTab);
    if (content) content.classList.add('active');
    currentVersionSubTab = subTab;
}

// 加载版本数据
async function loadVersions() {
    try {
        const response = await authFetch(`${API_BASE}/versions`);
        const result = await response.json();
        allVersionsData = result.data || [];

        // 按状态拆分
        versionsReleasedData = allVersionsData.filter(v => v.status === 'released');
        versionsTestingData = allVersionsData.filter(v => v.status === 'testing');

        renderVersionsTable('released', versionsReleasedData);
        renderVersionsTable('testing', versionsTestingData);

        // 填充设备筛选下拉
        populateVersionDeviceFilters();
    } catch (error) {
        console.error('加载版本数据失败:', error);
    }
}

// 填充版本筛选中的设备下拉
function populateVersionDeviceFilters() {
    const devices = allDevicesData || [];
    ['released', 'testing'].forEach(status => {
        const sel = document.getElementById(`ver-${status}-device-filter`);
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">全部设备</option>' +
            devices.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
        sel.value = current;
    });
    // 也填充弹窗中的设备选择
    const modalSel = document.getElementById('version-device');
    if (modalSel) {
        modalSel.innerHTML = '<option value="">请选择设备</option>' +
            devices.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    }
}

// 渲染版本表格
function renderVersionsTable(status, data) {
    const tbodyId = status === 'released' ? 'ver-released-table' : 'ver-testing-table';
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (data && data.length > 0) {
        tbody.innerHTML = data.map((v, index) => {
            const typeBadge = getVersionTypeBadge(v.version_type);
            const actions = status === 'testing'
                ? `<button class="action-icon-btn edit" onclick="editVersion(${v.id})" title="编辑">✏️</button>
                   <button class="action-icon-btn" onclick="releaseVersion(${v.id}, '${escapeHtml(v.version_number)}')" title="发布" style="color:#52c41a">🚀</button>
                   <button class="action-icon-btn delete" onclick="deleteVersion(${v.id})" title="删除">🗑️</button>`
                : `<button class="action-icon-btn edit" onclick="editVersion(${v.id})" title="编辑">✏️</button>
                   <button class="action-icon-btn delete" onclick="deleteVersion(${v.id})" title="删除">🗑️</button>`;
            return `
            <tr data-id="${v.id}">
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>${escapeHtml(v.device_name || '-')}</td>
                <td><strong>${escapeHtml(v.version_number)}</strong></td>
                <td>${typeBadge}</td>
                <td>${escapeHtml(v.version_date || '-')}</td>
                <td>${escapeHtml(v.updater_name || '-')}</td>
                <td>${escapeHtml(v.file_size || '-')}</td>
                <td class="editable-cell" ondblclick="startVersionInlineEdit(this, ${v.id}, 'changelog')" title="双击编辑">${escapeHtml(v.changelog || '-')}</td>
                <td class="editable-cell" ondblclick="startVersionInlineEdit(this, ${v.id}, 'notes')" title="双击编辑">${escapeHtml(v.notes || '-')}</td>
                <td class="text-center action-icons">${actions}</td>
            </tr>`;
        }).join('');
    } else {
        const emptyMsg = status === 'released' ? '还没有已发布的版本' : '还没有测试中的版本';
        const emptyIcon = status === 'released' ? '🚀' : '🧪';
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <div class="empty-icon">${emptyIcon}</div>
                    <div class="empty-text">${emptyMsg}</div>
                    <div class="empty-sub">点击上方按钮添加新版本</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="openVersionModal('${status}')">➕ 添加版本</button>
                    </div>
                </td>
            </tr>`;
    }
}

// 版本类型标签
function getVersionTypeBadge(type) {
    const colors = {
        '整合版': '#1890ff',
        'Gateway': '#722ed1',
        'LITE': '#13c2c2',
        'Transformer': '#fa8c16',
        'TransformerPlus': '#eb2f96',
        'HooK': '#52c41a'
    };
    const color = colors[type] || '#666';
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;color:#fff;background:${color}">${escapeHtml(type || '-')}</span>`;
}

// 筛选版本
function filterVersions(status) {
    const searchInput = document.getElementById(`ver-${status}-search`);
    const deviceFilter = document.getElementById(`ver-${status}-device-filter`);
    const typeFilter = document.getElementById(`ver-${status}-type-filter`);

    const keyword = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const deviceId = deviceFilter ? deviceFilter.value : '';
    const vType = typeFilter ? typeFilter.value : '';

    const source = status === 'released' ? versionsReleasedData : versionsTestingData;
    const filtered = source.filter(v => {
        if (keyword && !((v.version_number || '').toLowerCase().includes(keyword) ||
                         (v.device_name || '').toLowerCase().includes(keyword) ||
                         (v.notes || '').toLowerCase().includes(keyword))) return false;
        if (deviceId && String(v.device_id) !== deviceId) return false;
        if (vType && v.version_type !== vType) return false;
        return true;
    });
    renderVersionsTable(status, filtered);
}

// 打开版本新增弹窗
function openVersionModal(targetStatus) {
    document.getElementById('version-id').value = '';
    document.getElementById('version-target-status').value = targetStatus || 'testing';
    document.getElementById('version-modal-title').textContent = targetStatus === 'released' ? '新增已发布版本' : '新增测试版本';
    document.getElementById('version-form').reset();
    document.getElementById('version-date').value = new Date().toISOString().slice(0, 10);
    // 确保设备下拉已填充
    populateVersionDeviceFilters();
    openModal('version-modal');
}

// 编辑版本
async function editVersion(id) {
    try {
        const response = await authFetch(`${API_BASE}/versions/${id}`);
        const result = await response.json();
        if (!result.success || !result.data) {
            showToast('获取版本详情失败', 'error');
            return;
        }
        const v = result.data;
        document.getElementById('version-id').value = v.id;
        document.getElementById('version-target-status').value = v.status;
        document.getElementById('version-modal-title').textContent = '编辑版本';
        populateVersionDeviceFilters();
        document.getElementById('version-device').value = v.device_id;
        document.getElementById('version-number').value = v.version_number || '';
        document.getElementById('version-type').value = v.version_type || '整合版';
        document.getElementById('version-date').value = v.version_date || '';
        document.getElementById('version-download-url').value = v.download_url || '';
        document.getElementById('version-file-size').value = v.file_size || '';
        document.getElementById('version-changelog').value = v.changelog || '';
        document.getElementById('version-notes').value = v.notes || '';
        openModal('version-modal');
    } catch (error) {
        console.error('获取版本详情失败:', error);
        showToast('获取版本详情失败', 'error');
    }
}

// 提交版本表单
async function submitVersionForm(event) {
    event.preventDefault();
    const id = document.getElementById('version-id').value;
    const targetStatus = document.getElementById('version-target-status').value;
    const data = {
        device_id: parseInt(document.getElementById('version-device').value),
        version_number: document.getElementById('version-number').value.trim(),
        version_type: document.getElementById('version-type').value,
        status: targetStatus,
        version_date: document.getElementById('version-date').value,
        download_url: document.getElementById('version-download-url').value.trim(),
        file_size: document.getElementById('version-file-size').value.trim(),
        changelog: document.getElementById('version-changelog').value.trim(),
        notes: document.getElementById('version-notes').value.trim()
    };

    if (!data.device_id || !data.version_number) {
        showToast('请填写设备和版本号', 'warning');
        return;
    }

    try {
        const url = id ? `${API_BASE}/versions/${id}` : `${API_BASE}/versions`;
        const method = id ? 'PUT' : 'POST';
        const response = await authFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            showToast(id ? '版本更新成功' : '版本创建成功', 'success');
            closeModal('version-modal');
            await loadVersions();
        } else {
            showToast(result.error || '操作失败', 'error');
        }
    } catch (error) {
        console.error('保存版本失败:', error);
        showToast('保存版本失败', 'error');
    }
}

// 发布版本（测试中→已发布）
async function releaseVersion(id, versionNumber) {
    const confirmed = await showConfirm(`确定要将版本 ${versionNumber} 标记为已发布吗？`);
    if (!confirmed) return;
    try {
        const response = await authFetch(`${API_BASE}/versions/${id}/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success) {
            showToast(`版本 ${versionNumber} 已发布 🚀`, 'success');
            await loadVersions();
        } else {
            showToast(result.error || '发布失败', 'error');
        }
    } catch (error) {
        console.error('发布版本失败:', error);
        showToast('发布版本失败', 'error');
    }
}

// 删除版本
async function deleteVersion(id) {
    const confirmed = await showConfirm('确定要删除这个版本记录吗？此操作不可恢复。');
    if (!confirmed) return;
    try {
        const response = await authFetch(`${API_BASE}/versions/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast('版本已删除', 'success');
            await loadVersions();
        } else {
            showToast(result.error || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除版本失败:', error);
        showToast('删除版本失败', 'error');
    }
}

// 版本行内编辑（更新日志、备注）
async function startVersionInlineEdit(cell, id, field) {
    if (cell.querySelector('input, textarea')) return;
    const originalText = cell.textContent === '-' ? '' : cell.textContent;
    const input = document.createElement('textarea');
    input.value = originalText;
    input.className = 'inline-edit-input';
    input.style.cssText = 'width:100%;min-height:32px;resize:vertical;font-size:inherit;padding:4px;border:1px solid #1890ff;border-radius:4px;';
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newValue = input.value.trim();
        if (newValue === originalText) {
            cell.textContent = originalText || '-';
            return;
        }
        try {
            const response = await authFetch(`${API_BASE}/versions/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: newValue })
            });
            const result = await response.json();
            if (result.success) {
                cell.textContent = newValue || '-';
                showToast('更新成功', 'success');
                // 同步本地数据
                const ver = allVersionsData.find(v => v.id === id);
                if (ver) ver[field] = newValue;
            } else {
                cell.textContent = originalText || '-';
                showToast('更新失败', 'error');
            }
        } catch (e) {
            cell.textContent = originalText || '-';
            showToast('更新失败', 'error');
        }
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            cell.textContent = originalText || '-';
        }
    });
}

// ==========================
// ======= 游戏问题管理 =======
// ==========================

let allGameIssuesData = [];

async function loadGameIssues() {
    try {
        const resp = await authFetch(`${API_BASE}/game-issues`);
        const data = await resp.json();
        allGameIssuesData = data || [];
        renderGameIssuesTable(allGameIssuesData);
        updateGameIssuesStats();
    } catch (e) {
        console.error('加载游戏问题失败:', e);
        showToast('加载游戏问题失败', 'error');
    }
}

function renderGameIssuesTable(data) {
    const tbody = document.getElementById('game-issues-table');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-table">暂无游戏问题数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map((item, idx) => `
        <tr data-id="${item.id}">
            <td>${idx + 1}</td>
            <td>${escapeHtml(item.game_name || '-')}</td>
            <td>${getIssueTypeBadge(item.issue_type)}</td>
            <td>${getPriorityBadge(item.priority)}</td>
            <td class="desc-cell" title="${escapeHtml(item.issue_desc || '')}">${escapeHtml(item.issue_desc || '-')}</td>
            <td>${escapeHtml(item.owner || '-')}</td>
            <td>${getGameIssueStatusBadge(item.status)}</td>
            <td class="remarks-cell" title="${escapeHtml(item.remarks || '')}">${escapeHtml(item.remarks || '-')}</td>
            <td>${item.created_at ? formatDate(item.created_at) : '-'}</td>
            <td>
                <button class="action-btn" onclick="editGameIssue(${item.id})" title="编辑">✏️</button>
                <button class="action-btn action-btn-danger" onclick="deleteGameIssue(${item.id})" title="删除">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function getIssueTypeBadge(type) {
    const colors = {
        '画面问题': '#17a2b8',
        '性能问题': '#ffc107',
        '适配问题': '#6f42c1',
        '崩溃闪退': '#dc3545',
        '其他': '#6c757d'
    };
    if (!type) return '<span class="badge" style="background:#6c757d">-</span>';
    return `<span class="badge" style="background:${colors[type] || '#6c757d'}">${escapeHtml(type)}</span>`;
}

function getPriorityBadge(priority) {
    const colors = { '高': '#dc3545', '中': '#ffc107', '低': '#28a745' };
    if (!priority) return '<span class="badge" style="background:#6c757d">-</span>';
    return `<span class="badge" style="background:${colors[priority] || '#6c757d'}">${priority}</span>`;
}

function getGameIssueStatusBadge(status) {
    const colors = {
        '待处理': '#ffc107',
        '处理中': '#17a2b8',
        '已解决': '#28a745',
        '已关闭': '#6c757d'
    };
    if (!status) return '<span class="badge" style="background:#ffc107">待处理</span>';
    return `<span class="badge" style="background:${colors[status] || '#6c757d'}">${escapeHtml(status)}</span>`;
}

function updateGameIssuesStats() {
    const statsItems = document.getElementById('gi-stats-items');
    if (!statsItems) return;
    
    const total = allGameIssuesData.length;
    const pending = allGameIssuesData.filter(i => i.status === '待处理').length;
    const processing = allGameIssuesData.filter(i => i.status === '处理中').length;
    const resolved = allGameIssuesData.filter(i => i.status === '已解决').length;
    
    statsItems.innerHTML = `
        <span class="stat-item"><span class="stat-label">总数:</span><span class="stat-value">${total}</span></span>
        <span class="stat-item"><span class="stat-label">待处理:</span><span class="stat-value" style="color:#ffc107">${pending}</span></span>
        <span class="stat-item"><span class="stat-label">处理中:</span><span class="stat-value" style="color:#17a2b8">${processing}</span></span>
        <span class="stat-item"><span class="stat-label">已解决:</span><span class="stat-value" style="color:#28a745">${resolved}</span></span>
    `;
}

function filterGameIssues() {
    const search = (document.getElementById('gi-search')?.value || '').toLowerCase();
    const status = document.getElementById('gi-status-filter')?.value || '';
    const type = document.getElementById('gi-type-filter')?.value || '';
    const priority = document.getElementById('gi-priority-filter')?.value || '';
    
    let filtered = allGameIssuesData;
    if (search) {
        filtered = filtered.filter(i => 
            (i.game_name || '').toLowerCase().includes(search) ||
            (i.issue_desc || '').toLowerCase().includes(search) ||
            (i.owner || '').toLowerCase().includes(search)
        );
    }
    if (status) filtered = filtered.filter(i => i.status === status);
    if (type) filtered = filtered.filter(i => i.issue_type === type);
    if (priority) filtered = filtered.filter(i => i.priority === priority);
    
    renderGameIssuesTable(filtered);
}

async function openGameIssueModal(id = null) {
    document.getElementById('gi-id').value = '';
    document.getElementById('game-issue-form').reset();
    document.getElementById('game-issue-modal-title').textContent = id ? '编辑游戏问题' : '新增游戏问题';
    
    // 确保游戏和成员数据已加载
    if (!allGamesForProgress || allGamesForProgress.length === 0) {
        try {
            const gamesResp = await authFetch(`${API_BASE}/games`);
            const gamesResult = await gamesResp.json();
            allGamesForProgress = gamesResult.data || [];
        } catch (e) { console.error('加载游戏数据失败:', e); }
    }
    if (!allMembersData || allMembersData.length === 0) {
        try {
            const membersResp = await authFetch(`${API_BASE}/members`);
            const membersResult = await membersResp.json();
            allMembersData = membersResult.data || membersResult || [];
        } catch (e) { console.error('加载成员数据失败:', e); }
    }
    
    // 填充游戏下拉框
    const gameSelect = document.getElementById('gi-game-name');
    gameSelect.innerHTML = '<option value="">选择游戏</option>';
    if (allGamesForProgress && allGamesForProgress.length > 0) {
        allGamesForProgress.forEach(g => {
            const gameName = g.name || g.game_name || '';
            gameSelect.innerHTML += `<option value="${escapeHtml(gameName)}">${escapeHtml(gameName)}</option>`;
        });
    }
    
    // 填充负责人下拉框
    const ownerSelect = document.getElementById('gi-owner');
    ownerSelect.innerHTML = '<option value="">选择负责人</option>';
    if (allMembersData && allMembersData.length > 0) {
        allMembersData.forEach(m => {
            ownerSelect.innerHTML += `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`;
        });
    }
    
    openModal('game-issue-modal');
}

async function editGameIssue(id) {
    const item = allGameIssuesData.find(i => i.id === id);
    if (!item) return;
    
    await openGameIssueModal(id);
    
    document.getElementById('gi-id').value = item.id;
    document.getElementById('gi-game-name').value = item.game_name || '';
    document.getElementById('gi-issue-type').value = item.issue_type || '';
    document.getElementById('gi-priority').value = item.priority || '';
    document.getElementById('gi-owner').value = item.owner || '';
    document.getElementById('gi-status').value = item.status || '待处理';
    document.getElementById('gi-issue-desc').value = item.issue_desc || '';
    document.getElementById('gi-remarks').value = item.remarks || '';
}

async function submitGameIssueForm(event) {
    event.preventDefault();
    
    const id = document.getElementById('gi-id').value;
    const data = {
        game_name: document.getElementById('gi-game-name').value,
        issue_type: document.getElementById('gi-issue-type').value,
        priority: document.getElementById('gi-priority').value,
        owner: document.getElementById('gi-owner').value,
        status: document.getElementById('gi-status').value,
        issue_desc: document.getElementById('gi-issue-desc').value,
        remarks: document.getElementById('gi-remarks').value
    };
    
    try {
        const url = id ? `${API_BASE}/game-issues/${id}` : `${API_BASE}/game-issues`;
        const method = id ? 'PUT' : 'POST';
        const resp = await authFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        if (result.success || result.id) {
            showToast(id ? '更新成功' : '创建成功', 'success');
            closeModal('game-issue-modal');
            await loadGameIssues();
        } else {
            showToast(result.error || '操作失败', 'error');
        }
    } catch (e) {
        console.error('保存游戏问题失败:', e);
        showToast('保存失败', 'error');
    }
}

async function deleteGameIssue(id) {
    if (!confirm('确定要删除这条游戏问题吗？')) return;
    try {
        const resp = await authFetch(`${API_BASE}/game-issues/${id}`, { method: 'DELETE' });
        const result = await resp.json();
        if (result.success) {
            showToast('删除成功', 'success');
            await loadGameIssues();
        } else {
            showToast(result.error || '删除失败', 'error');
        }
    } catch (e) {
        showToast('删除失败', 'error');
    }
}

// ========== 易用性增强功能 (UX Enhancement) ==========

/**
 * 显示骨架屏加载状态
 * @param {string} tableId - 表格 tbody 的 ID
 * @param {number} rows - 骨架屏行数
 * @param {number} cols - 骨架屏列数
 */
function showTableSkeleton(tableId, rows = 5, cols = 6) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    
    let html = '';
    for (let i = 0; i < rows; i++) {
        html += '<tr class="skeleton-row">';
        for (let j = 0; j < cols; j++) {
            const widthClass = j === 0 ? 'short' : (j === cols - 1 ? 'short' : (j === 1 ? 'long' : 'medium'));
            html += `<td><div class="skeleton skeleton-cell ${widthClass}"></div></td>`;
        }
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

/**
 * 按钮加载状态切换
 * @param {HTMLElement|string} btn - 按钮元素或选择器
 * @param {boolean} loading - 是否加载中
 * @param {string} loadingText - 加载中显示的文本（可选）
 */
function setButtonLoading(btn, loading, loadingText = '') {
    const button = typeof btn === 'string' ? document.querySelector(btn) : btn;
    if (!button) return;
    
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
        if (loadingText) {
            button.dataset.originalText = button.textContent;
            button.textContent = loadingText;
        }
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

/**
 * 表单验证错误高亮
 * @param {HTMLElement} input - 输入框元素
 * @param {string} message - 错误信息
 */
function showFieldError(input, message) {
    input.classList.add('error');
    
    // 移除已有的错误信息
    const existingError = input.parentElement.querySelector('.form-error-message');
    if (existingError) existingError.remove();
    
    // 添加错误信息
    const errorEl = document.createElement('div');
    errorEl.className = 'form-error-message';
    errorEl.textContent = message;
    input.parentElement.appendChild(errorEl);
    
    // 聚焦到错误字段
    input.focus();
    
    // 输入时自动清除错误状态
    const clearError = () => {
        input.classList.remove('error');
        const err = input.parentElement.querySelector('.form-error-message');
        if (err) err.remove();
        input.removeEventListener('input', clearError);
    };
    input.addEventListener('input', clearError);
}

/**
 * 清除表单所有错误状态
 * @param {HTMLElement} form - 表单元素
 */
function clearFormErrors(form) {
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    form.querySelectorAll('.form-error-message').forEach(el => el.remove());
}

/**
 * 行操作成功闪烁效果
 * @param {HTMLElement} row - 表格行元素
 */
function flashRowSuccess(row) {
    row.classList.add('success-flash');
    setTimeout(() => row.classList.remove('success-flash'), 600);
}

/**
 * 显示批量操作进度
 * @param {number} current - 当前进度
 * @param {number} total - 总数
 */
function showBatchProgress(current, total) {
    let progressBar = document.querySelector('.batch-progress');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.className = 'batch-progress';
        progressBar.innerHTML = '<div class="batch-progress-bar"></div>';
        document.body.appendChild(progressBar);
    }
    
    const bar = progressBar.querySelector('.batch-progress-bar');
    const percent = (current / total) * 100;
    bar.style.width = percent + '%';
    
    if (current >= total) {
        setTimeout(() => {
            progressBar.remove();
        }, 500);
    }
}

/**
 * 键盘快捷键支持
 */
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K: 快速搜索
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.querySelector('.search-input:visible, .filter-input:visible, input[type="search"]');
            if (searchInput) searchInput.focus();
        }
        
        // Escape: 关闭模态框
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.modal.show, .modal[style*="display: flex"], .modal[style*="display: block"]');
            if (openModal) {
                const closeBtn = openModal.querySelector('.modal-close, .close-btn, [onclick*="closeModal"]');
                if (closeBtn) closeBtn.click();
            }
        }
        
        // Ctrl/Cmd + S: 保存（如果有打开的表单）
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            const openModal = document.querySelector('.modal.show, .modal[style*="display: flex"]');
            if (openModal) {
                e.preventDefault();
                const saveBtn = openModal.querySelector('.btn-primary, [type="submit"]');
                if (saveBtn) saveBtn.click();
            }
        }
    });
}

// 页面加载后初始化键盘快捷键
document.addEventListener('DOMContentLoaded', initKeyboardShortcuts);

/**
 * 记住用户的筛选偏好
 * @param {string} module - 模块名
 * @param {object} filters - 筛选条件
 */
function saveFilterPreference(module, filters) {
    try {
        const key = `filter_pref_${module}`;
        localStorage.setItem(key, JSON.stringify(filters));
    } catch (e) {
        // QuotaExceeded 或其他错误，忽略
    }
}

/**
 * 获取用户的筛选偏好
 * @param {string} module - 模块名
 * @returns {object|null} 筛选条件
 */
function getFilterPreference(module) {
    try {
        const key = `filter_pref_${module}`;
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : null;
    } catch (e) {
        return null;
    }
}

/**
 * 增强版确认弹窗（支持危险操作样式）
 * @param {string} message - 确认信息
 * @param {object} options - 配置选项
 */
function showDangerConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
        
        const box = document.createElement('div');
        box.className = 'confirm-dialog-danger';
        box.style.cssText = 'background:var(--bg-card);border-radius:8px;padding:24px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        
        const title = options.title || '确认操作';
        const confirmText = options.confirmText || '确定删除';
        const cancelText = options.cancelText || '取消';
        
        box.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                <span style="font-size:24px;">⚠️</span>
                <span style="font-size:16px;font-weight:600;color:var(--text-primary);">${escapeHtml(title)}</span>
            </div>
            <div style="font-size:14px;color:var(--text-secondary);line-height:1.6;margin-bottom:24px;">${escapeHtml(message)}</div>
            <div style="display:flex;justify-content:flex-end;gap:12px;">
                <button class="btn confirm-cancel-btn">${escapeHtml(cancelText)}</button>
                <button class="btn confirm-ok-btn" style="background:var(--danger);color:#fff;border-color:var(--danger);">${escapeHtml(confirmText)}</button>
            </div>
        `;
        
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        const close = (result) => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
            resolve(result);
        };
        
        box.querySelector('.confirm-cancel-btn').onclick = () => close(false);
        box.querySelector('.confirm-ok-btn').onclick = () => close(true);
        overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    });
}

console.log('✅ UX Enhancement 模块已加载');


// ========== 游戏版本管理 ==========
let allGameVersionsData = [];
let gameVersionsReleasedData = [];
let gameVersionsTestingData = [];
let currentGameVersionSubTab = 'game-ver-released';

function switchGameVersionTab(subTab) {
    document.querySelectorAll('#game-versions .um-sub-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#game-versions .um-subtab-content').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`#game-versions .um-sub-tab[data-subtab="${subTab}"]`);
    if (btn) btn.classList.add('active');
    const content = document.getElementById(subTab);
    if (content) content.classList.add('active');
    currentGameVersionSubTab = subTab;
}

async function loadGameVersions() {
    try {
        const response = await authFetch(`${API_BASE}/game-versions`);
        const result = await response.json();
        allGameVersionsData = result.data || result || [];
        
        gameVersionsReleasedData = allGameVersionsData.filter(v => v.status === 'released');
        gameVersionsTestingData = allGameVersionsData.filter(v => v.status === 'testing');
        
        renderGameVersionsTable('released', gameVersionsReleasedData);
        renderGameVersionsTable('testing', gameVersionsTestingData);
        populateGameVersionGameFilters();
    } catch (error) {
        console.error('加载游戏版本数据失败:', error);
        renderGameVersionsTable('released', []);
        renderGameVersionsTable('testing', []);
    }
}

function populateGameVersionGameFilters() {
    const games = allGamesForProgress || [];
    ['released', 'testing'].forEach(status => {
        const sel = document.getElementById(`game-ver-${status}-game-filter`);
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">全部游戏</option>' +
            games.map(g => `<option value="${g.id}">${escapeHtml(g.name || g.game_name || '')}</option>`).join('');
        sel.value = current;
    });
    const modalSel = document.getElementById('game-version-game');
    if (modalSel) {
        modalSel.innerHTML = '<option value="">请选择游戏</option>' +
            games.map(g => `<option value="${g.id}">${escapeHtml(g.name || g.game_name || '')}</option>`).join('');
    }
}

function renderGameVersionsTable(status, data) {
    const tbodyId = status === 'released' ? 'game-ver-released-table' : 'game-ver-testing-table';
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (data && data.length > 0) {
        tbody.innerHTML = data.map((v, index) => {
            const actions = status === 'testing'
                ? `<button class="action-icon-btn edit" onclick="editGameVersion(${v.id})" title="编辑">✏️</button>
                   <button class="action-icon-btn" onclick="releaseGameVersion(${v.id}, '${escapeHtml(v.version_number)}')" title="发布" style="color:#52c41a">🚀</button>
                   <button class="action-icon-btn delete" onclick="deleteGameVersion(${v.id})" title="删除">🗑️</button>`
                : `<button class="action-icon-btn edit" onclick="editGameVersion(${v.id})" title="编辑">✏️</button>
                   <button class="action-icon-btn delete" onclick="deleteGameVersion(${v.id})" title="删除">🗑️</button>`;
            return `
            <tr data-id="${v.id}">
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>${escapeHtml(v.game_name || '-')}</td>
                <td><strong>${escapeHtml(v.version_number)}</strong></td>
                <td>${escapeHtml(v.version_date || '-')}</td>
                <td>${escapeHtml(v.updater_name || '-')}</td>
                <td class="editable-cell" title="${escapeHtml(v.changelog || '-')}">${escapeHtml(v.changelog || '-')}</td>
                <td class="editable-cell" title="${escapeHtml(v.notes || '-')}">${escapeHtml(v.notes || '-')}</td>
                <td class="text-center action-icons">${actions}</td>
            </tr>`;
        }).join('');
    } else {
        const emptyMsg = status === 'released' ? '还没有已发布的版本' : '还没有测试中的版本';
        const emptyIcon = status === 'released' ? '🚀' : '🧪';
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <div class="empty-icon">${emptyIcon}</div>
                    <div class="empty-text">${emptyMsg}</div>
                    <div class="empty-sub">点击上方按钮添加新版本</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="openGameVersionModal('${status}')">➕ 添加版本</button>
                    </div>
                </td>
            </tr>`;
    }
}

function filterGameVersions(status) {
    const searchInput = document.getElementById(`game-ver-${status}-search`);
    const gameFilter = document.getElementById(`game-ver-${status}-game-filter`);
    const keyword = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const gameId = gameFilter ? gameFilter.value : '';
    
    const source = status === 'released' ? gameVersionsReleasedData : gameVersionsTestingData;
    const filtered = source.filter(v => {
        if (keyword && !((v.version_number || '').toLowerCase().includes(keyword) ||
                         (v.game_name || '').toLowerCase().includes(keyword))) return false;
        if (gameId && String(v.game_id) !== gameId) return false;
        return true;
    });
    renderGameVersionsTable(status, filtered);
}

function openGameVersionModal(targetStatus) {
    document.getElementById('game-version-id').value = '';
    document.getElementById('game-version-target-status').value = targetStatus || 'testing';
    document.getElementById('game-version-modal-title').textContent = targetStatus === 'released' ? '新增已发布版本' : '新增测试版本';
    document.getElementById('game-version-form').reset();
    document.getElementById('game-version-date').value = new Date().toISOString().slice(0, 10);
    populateGameVersionGameFilters();
    openModal('game-version-modal');
}

async function editGameVersion(id) {
    try {
        const response = await authFetch(`${API_BASE}/game-versions/${id}`);
        const result = await response.json();
        if (!result.success || !result.data) {
            showToast('获取版本详情失败', 'error');
            return;
        }
        const v = result.data;
        document.getElementById('game-version-id').value = v.id;
        document.getElementById('game-version-target-status').value = v.status;
        document.getElementById('game-version-modal-title').textContent = '编辑游戏版本';
        populateGameVersionGameFilters();
        document.getElementById('game-version-game').value = v.game_id;
        document.getElementById('game-version-number').value = v.version_number || '';
        document.getElementById('game-version-date').value = v.version_date || '';
        document.getElementById('game-version-changelog').value = v.changelog || '';
        document.getElementById('game-version-notes').value = v.notes || '';
        openModal('game-version-modal');
    } catch (error) {
        console.error('获取版本详情失败:', error);
        showToast('获取版本详情失败', 'error');
    }
}

async function submitGameVersionForm(event) {
    event.preventDefault();
    const id = document.getElementById('game-version-id').value;
    const targetStatus = document.getElementById('game-version-target-status').value;
    const data = {
        game_id: parseInt(document.getElementById('game-version-game').value),
        version_number: document.getElementById('game-version-number').value.trim(),
        status: targetStatus,
        version_date: document.getElementById('game-version-date').value,
        changelog: document.getElementById('game-version-changelog').value.trim(),
        notes: document.getElementById('game-version-notes').value.trim()
    };

    if (!data.game_id || !data.version_number) {
        showToast('请填写游戏和版本号', 'warning');
        return;
    }

    try {
        const url = id ? `${API_BASE}/game-versions/${id}` : `${API_BASE}/game-versions`;
        const method = id ? 'PUT' : 'POST';
        const response = await authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            showToast(id ? '更新成功' : '添加成功', 'success');
            closeModal('game-version-modal');
            await loadGameVersions();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('保存游戏版本失败:', error);
        showToast('保存失败', 'error');
    }
}

async function deleteGameVersion(id) {
    if (!confirm('确定要删除这个版本吗？')) return;
    try {
        const response = await authFetch(`${API_BASE}/game-versions/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast('删除成功', 'success');
            await loadGameVersions();
        } else {
            showToast(result.message || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除游戏版本失败:', error);
        showToast('删除失败', 'error');
    }
}

async function releaseGameVersion(id, versionNumber) {
    if (!confirm(`确定要将版本 ${versionNumber} 标记为已发布吗？`)) return;
    try {
        const response = await authFetch(`${API_BASE}/game-versions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'released' })
        });
        const result = await response.json();
        if (result.success) {
            showToast('发布成功', 'success');
            await loadGameVersions();
        } else {
            showToast(result.message || '发布失败', 'error');
        }
    } catch (error) {
        console.error('发布游戏版本失败:', error);
        showToast('发布失败', 'error');
    }
}


// ========== 交织问题管理 ==========
let allInterlaceIssuesData = [];

async function loadInterlaceIssues() {
    try {
        const resp = await authFetch(`${API_BASE}/interlace-issues`);
        const data = await resp.json();
        allInterlaceIssuesData = data.data || data || [];
        renderInterlaceIssuesTable(allInterlaceIssuesData);
        updateInterlaceIssuesStats();
    } catch (e) {
        console.error('加载交织问题失败:', e);
        renderInterlaceIssuesTable([]);
    }
}

function renderInterlaceIssuesTable(data) {
    const tbody = document.getElementById('interlace-issues-table');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-table">暂无交织问题数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map((item, idx) => `
        <tr data-id="${item.id}">
            <td>${idx + 1}</td>
            <td>${getIssueTypeBadge(item.issue_type)}</td>
            <td>${getPriorityBadge(item.priority)}</td>
            <td class="desc-cell" title="${escapeHtml(item.issue_desc || '')}">${escapeHtml(item.issue_desc || '-')}</td>
            <td>${escapeHtml(item.version || '-')}</td>
            <td>${escapeHtml(item.owner || '-')}</td>
            <td>${getGameIssueStatusBadge(item.status)}</td>
            <td class="remarks-cell" title="${escapeHtml(item.remarks || '')}">${escapeHtml(item.remarks || '-')}</td>
            <td>${item.created_at ? formatDate(item.created_at) : '-'}</td>
            <td>
                <button class="action-btn" onclick="editInterlaceIssue(${item.id})" title="编辑">✏️</button>
                <button class="action-btn action-btn-danger" onclick="deleteInterlaceIssue(${item.id})" title="删除">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function updateInterlaceIssuesStats() {
    const statsItems = document.getElementById('interlace-issues-stats-items');
    if (!statsItems) return;
    
    const total = allInterlaceIssuesData.length;
    const pending = allInterlaceIssuesData.filter(i => i.status === '待处理').length;
    const processing = allInterlaceIssuesData.filter(i => i.status === '处理中').length;
    const resolved = allInterlaceIssuesData.filter(i => i.status === '已解决').length;
    
    statsItems.innerHTML = `
        <span class="stat-item"><span class="stat-label">总数:</span><span class="stat-value">${total}</span></span>
        <span class="stat-item"><span class="stat-label">待处理:</span><span class="stat-value" style="color:#ffc107">${pending}</span></span>
        <span class="stat-item"><span class="stat-label">处理中:</span><span class="stat-value" style="color:#17a2b8">${processing}</span></span>
        <span class="stat-item"><span class="stat-label">已解决:</span><span class="stat-value" style="color:#28a745">${resolved}</span></span>
    `;
}

function filterInterlaceIssues() {
    const search = (document.getElementById('interlace-issue-search')?.value || '').toLowerCase();
    const status = document.getElementById('interlace-issue-status-filter')?.value || '';
    const type = document.getElementById('interlace-issue-type-filter')?.value || '';
    const priority = document.getElementById('interlace-issue-priority-filter')?.value || '';
    
    let filtered = allInterlaceIssuesData;
    if (search) {
        filtered = filtered.filter(i => 
            (i.issue_desc || '').toLowerCase().includes(search) ||
            (i.owner || '').toLowerCase().includes(search)
        );
    }
    if (status) filtered = filtered.filter(i => i.status === status);
    if (type) filtered = filtered.filter(i => i.issue_type === type);
    if (priority) filtered = filtered.filter(i => i.priority === priority);
    
    renderInterlaceIssuesTable(filtered);
}

async function openInterlaceIssueModal(id = null) {
    document.getElementById('interlace-issue-id').value = '';
    document.getElementById('interlace-issue-form').reset();
    document.getElementById('interlace-issue-modal-title').textContent = id ? '编辑交织问题' : '新增交织问题';
    
    // 填充负责人下拉框
    if (!allMembersData || allMembersData.length === 0) {
        try {
            const membersResp = await authFetch(`${API_BASE}/members`);
            const membersResult = await membersResp.json();
            allMembersData = membersResult.data || membersResult || [];
        } catch (e) { console.error('加载成员数据失败:', e); }
    }
    const ownerSelect = document.getElementById('interlace-issue-owner');
    ownerSelect.innerHTML = '<option value="">选择负责人</option>';
    if (allMembersData && allMembersData.length > 0) {
        allMembersData.forEach(m => {
            ownerSelect.innerHTML += `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`;
        });
    }
    
    // 填充版本下拉框
    const versionSelect = document.getElementById('interlace-issue-version');
    versionSelect.innerHTML = '<option value="">选择版本</option>';
    if (allInterlaceVersionsData && allInterlaceVersionsData.length > 0) {
        allInterlaceVersionsData.forEach(v => {
            versionSelect.innerHTML += `<option value="${escapeHtml(v.version_number)}">${escapeHtml(v.version_number)}</option>`;
        });
    }
    
    openModal('interlace-issue-modal');
}

async function editInterlaceIssue(id) {
    try {
        const response = await authFetch(`${API_BASE}/interlace-issues/${id}`);
        const result = await response.json();
        if (!result.success || !result.data) {
            showToast('获取问题详情失败', 'error');
            return;
        }
        const item = result.data;
        await openInterlaceIssueModal(id);
        document.getElementById('interlace-issue-id').value = item.id;
        document.getElementById('interlace-issue-type').value = item.issue_type || '';
        document.getElementById('interlace-issue-version').value = item.version || '';
        document.getElementById('interlace-issue-priority').value = item.priority || '';
        document.getElementById('interlace-issue-owner').value = item.owner || '';
        document.getElementById('interlace-issue-status').value = item.status || '待处理';
        document.getElementById('interlace-issue-desc').value = item.issue_desc || '';
        document.getElementById('interlace-issue-remarks').value = item.remarks || '';
    } catch (error) {
        console.error('获取问题详情失败:', error);
        showToast('获取问题详情失败', 'error');
    }
}

async function submitInterlaceIssueForm(event) {
    event.preventDefault();
    const id = document.getElementById('interlace-issue-id').value;
    const data = {
        issue_type: document.getElementById('interlace-issue-type').value,
        version: document.getElementById('interlace-issue-version').value,
        priority: document.getElementById('interlace-issue-priority').value,
        owner: document.getElementById('interlace-issue-owner').value,
        status: document.getElementById('interlace-issue-status').value,
        issue_desc: document.getElementById('interlace-issue-desc').value.trim(),
        remarks: document.getElementById('interlace-issue-remarks').value.trim()
    };

    if (!data.issue_type || !data.owner || !data.issue_desc) {
        showToast('请填写必填字段', 'warning');
        return;
    }

    try {
        const url = id ? `${API_BASE}/interlace-issues/${id}` : `${API_BASE}/interlace-issues`;
        const method = id ? 'PUT' : 'POST';
        const response = await authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            showToast(id ? '更新成功' : '添加成功', 'success');
            closeModal('interlace-issue-modal');
            await loadInterlaceIssues();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('保存交织问题失败:', error);
        showToast('保存失败', 'error');
    }
}

async function deleteInterlaceIssue(id) {
    if (!confirm('确定要删除这条问题记录吗？')) return;
    try {
        const response = await authFetch(`${API_BASE}/interlace-issues/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast('删除成功', 'success');
            await loadInterlaceIssues();
        } else {
            showToast(result.message || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除交织问题失败:', error);
        showToast('删除失败', 'error');
    }
}


// ========== 交织版本管理 ==========
let allInterlaceVersionsData = [];
let interlaceVersionsReleasedData = [];
let interlaceVersionsTestingData = [];
let currentInterlaceVersionSubTab = 'interlace-ver-released';

function switchInterlaceVersionTab(subTab) {
    document.querySelectorAll('#interlace-versions .um-sub-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#interlace-versions .um-subtab-content').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`#interlace-versions .um-sub-tab[data-subtab="${subTab}"]`);
    if (btn) btn.classList.add('active');
    const content = document.getElementById(subTab);
    if (content) content.classList.add('active');
    currentInterlaceVersionSubTab = subTab;
}

async function loadInterlaceVersions() {
    try {
        const response = await authFetch(`${API_BASE}/interlace-versions`);
        const result = await response.json();
        allInterlaceVersionsData = result.data || result || [];
        
        interlaceVersionsReleasedData = allInterlaceVersionsData.filter(v => v.status === 'released');
        interlaceVersionsTestingData = allInterlaceVersionsData.filter(v => v.status === 'testing');
        
        renderInterlaceVersionsTable('released', interlaceVersionsReleasedData);
        renderInterlaceVersionsTable('testing', interlaceVersionsTestingData);
    } catch (error) {
        console.error('加载交织版本数据失败:', error);
        renderInterlaceVersionsTable('released', []);
        renderInterlaceVersionsTable('testing', []);
    }
}

function renderInterlaceVersionsTable(status, data) {
    const tbodyId = status === 'released' ? 'interlace-ver-released-table' : 'interlace-ver-testing-table';
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (data && data.length > 0) {
        tbody.innerHTML = data.map((v, index) => {
            const actions = status === 'testing'
                ? `<button class="action-icon-btn edit" onclick="editInterlaceVersion(${v.id})" title="编辑">✏️</button>
                   <button class="action-icon-btn" onclick="releaseInterlaceVersion(${v.id}, '${escapeHtml(v.version_number)}')" title="发布" style="color:#52c41a">🚀</button>
                   <button class="action-icon-btn delete" onclick="deleteInterlaceVersion(${v.id})" title="删除">🗑️</button>`
                : `<button class="action-icon-btn edit" onclick="editInterlaceVersion(${v.id})" title="编辑">✏️</button>
                   <button class="action-icon-btn delete" onclick="deleteInterlaceVersion(${v.id})" title="删除">🗑️</button>`;
            return `
            <tr data-id="${v.id}">
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td><strong>${escapeHtml(v.version_number)}</strong></td>
                <td>${escapeHtml(v.version_date || '-')}</td>
                <td>${escapeHtml(v.updater_name || '-')}</td>
                <td class="editable-cell" title="${escapeHtml(v.changelog || '-')}">${escapeHtml(v.changelog || '-')}</td>
                <td class="editable-cell" title="${escapeHtml(v.notes || '-')}">${escapeHtml(v.notes || '-')}</td>
                <td class="text-center action-icons">${actions}</td>
            </tr>`;
        }).join('');
    } else {
        const emptyMsg = status === 'released' ? '还没有已发布的版本' : '还没有测试中的版本';
        const emptyIcon = status === 'released' ? '🚀' : '🧪';
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">${emptyIcon}</div>
                    <div class="empty-text">${emptyMsg}</div>
                    <div class="empty-sub">点击上方按钮添加新版本</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="openInterlaceVersionModal('${status}')">➕ 添加版本</button>
                    </div>
                </td>
            </tr>`;
    }
}

function filterInterlaceVersions(status) {
    const searchInput = document.getElementById(`interlace-ver-${status}-search`);
    const keyword = (searchInput ? searchInput.value : '').toLowerCase().trim();
    
    const source = status === 'released' ? interlaceVersionsReleasedData : interlaceVersionsTestingData;
    const filtered = source.filter(v => {
        if (keyword && !(v.version_number || '').toLowerCase().includes(keyword)) return false;
        return true;
    });
    renderInterlaceVersionsTable(status, filtered);
}

function openInterlaceVersionModal(targetStatus) {
    document.getElementById('interlace-version-id').value = '';
    document.getElementById('interlace-version-target-status').value = targetStatus || 'testing';
    document.getElementById('interlace-version-modal-title').textContent = targetStatus === 'released' ? '新增已发布版本' : '新增测试版本';
    document.getElementById('interlace-version-form').reset();
    document.getElementById('interlace-version-date').value = new Date().toISOString().slice(0, 10);
    openModal('interlace-version-modal');
}

async function editInterlaceVersion(id) {
    try {
        const response = await authFetch(`${API_BASE}/interlace-versions/${id}`);
        const result = await response.json();
        if (!result.success || !result.data) {
            showToast('获取版本详情失败', 'error');
            return;
        }
        const v = result.data;
        document.getElementById('interlace-version-id').value = v.id;
        document.getElementById('interlace-version-target-status').value = v.status;
        document.getElementById('interlace-version-modal-title').textContent = '编辑交织版本';
        document.getElementById('interlace-version-number').value = v.version_number || '';
        document.getElementById('interlace-version-date').value = v.version_date || '';
        document.getElementById('interlace-version-changelog').value = v.changelog || '';
        document.getElementById('interlace-version-notes').value = v.notes || '';
        openModal('interlace-version-modal');
    } catch (error) {
        console.error('获取版本详情失败:', error);
        showToast('获取版本详情失败', 'error');
    }
}

async function submitInterlaceVersionForm(event) {
    event.preventDefault();
    const id = document.getElementById('interlace-version-id').value;
    const targetStatus = document.getElementById('interlace-version-target-status').value;
    const data = {
        version_number: document.getElementById('interlace-version-number').value.trim(),
        status: targetStatus,
        version_date: document.getElementById('interlace-version-date').value,
        changelog: document.getElementById('interlace-version-changelog').value.trim(),
        notes: document.getElementById('interlace-version-notes').value.trim()
    };

    if (!data.version_number) {
        showToast('请填写版本号', 'warning');
        return;
    }

    try {
        const url = id ? `${API_BASE}/interlace-versions/${id}` : `${API_BASE}/interlace-versions`;
        const method = id ? 'PUT' : 'POST';
        const response = await authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            showToast(id ? '更新成功' : '添加成功', 'success');
            closeModal('interlace-version-modal');
            await loadInterlaceVersions();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('保存交织版本失败:', error);
        showToast('保存失败', 'error');
    }
}

async function deleteInterlaceVersion(id) {
    if (!confirm('确定要删除这个版本吗？')) return;
    try {
        const response = await authFetch(`${API_BASE}/interlace-versions/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast('删除成功', 'success');
            await loadInterlaceVersions();
        } else {
            showToast(result.message || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除交织版本失败:', error);
        showToast('删除失败', 'error');
    }
}

async function releaseInterlaceVersion(id, versionNumber) {
    if (!confirm(`确定要将版本 ${versionNumber} 标记为已发布吗？`)) return;
    try {
        const response = await authFetch(`${API_BASE}/interlace-versions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'released' })
        });
        const result = await response.json();
        if (result.success) {
            showToast('发布成功', 'success');
            await loadInterlaceVersions();
        } else {
            showToast(result.message || '发布失败', 'error');
        }
    } catch (error) {
        console.error('发布交织版本失败:', error);
        showToast('发布失败', 'error');
    }
}


// ========== 客户端问题管理 ==========
let allClientIssuesData = [];

async function loadClientIssues() {
    try {
        const resp = await authFetch(`${API_BASE}/client-issues`);
        const data = await resp.json();
        allClientIssuesData = data.data || data || [];
        renderClientIssuesTable(allClientIssuesData);
        updateClientIssuesStats();
    } catch (e) {
        console.error('加载客户端问题失败:', e);
        renderClientIssuesTable([]);
    }
}

function renderClientIssuesTable(data) {
    const tbody = document.getElementById('client-issues-table');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-table">暂无客户端问题数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map((item, idx) => `
        <tr data-id="${item.id}">
            <td>${idx + 1}</td>
            <td>${getClientIssueTypeBadge(item.issue_type)}</td>
            <td>${getPriorityBadge(item.priority)}</td>
            <td class="desc-cell" title="${escapeHtml(item.issue_desc || '')}">${escapeHtml(item.issue_desc || '-')}</td>
            <td>${escapeHtml(item.version || '-')}</td>
            <td>${escapeHtml(item.owner || '-')}</td>
            <td>${getGameIssueStatusBadge(item.status)}</td>
            <td class="remarks-cell" title="${escapeHtml(item.remarks || '')}">${escapeHtml(item.remarks || '-')}</td>
            <td>${item.created_at ? formatDate(item.created_at) : '-'}</td>
            <td>
                <button class="action-btn" onclick="editClientIssue(${item.id})" title="编辑">✏️</button>
                <button class="action-btn action-btn-danger" onclick="deleteClientIssue(${item.id})" title="删除">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function getClientIssueTypeBadge(type) {
    const colors = {
        '界面问题': '#17a2b8',
        '功能异常': '#ffc107',
        '性能问题': '#6f42c1',
        '崩溃闪退': '#dc3545',
        '其他': '#6c757d'
    };
    if (!type) return '<span class="badge" style="background:#6c757d">-</span>';
    return `<span class="badge" style="background:${colors[type] || '#6c757d'}">${escapeHtml(type)}</span>`;
}

function updateClientIssuesStats() {
    const statsItems = document.getElementById('client-issues-stats-items');
    if (!statsItems) return;
    
    const total = allClientIssuesData.length;
    const pending = allClientIssuesData.filter(i => i.status === '待处理').length;
    const processing = allClientIssuesData.filter(i => i.status === '处理中').length;
    const resolved = allClientIssuesData.filter(i => i.status === '已解决').length;
    
    statsItems.innerHTML = `
        <span class="stat-item"><span class="stat-label">总数:</span><span class="stat-value">${total}</span></span>
        <span class="stat-item"><span class="stat-label">待处理:</span><span class="stat-value" style="color:#ffc107">${pending}</span></span>
        <span class="stat-item"><span class="stat-label">处理中:</span><span class="stat-value" style="color:#17a2b8">${processing}</span></span>
        <span class="stat-item"><span class="stat-label">已解决:</span><span class="stat-value" style="color:#28a745">${resolved}</span></span>
    `;
}

function filterClientIssues() {
    const search = (document.getElementById('client-issue-search')?.value || '').toLowerCase();
    const status = document.getElementById('client-issue-status-filter')?.value || '';
    const type = document.getElementById('client-issue-type-filter')?.value || '';
    const priority = document.getElementById('client-issue-priority-filter')?.value || '';
    
    let filtered = allClientIssuesData;
    if (search) {
        filtered = filtered.filter(i => 
            (i.issue_desc || '').toLowerCase().includes(search) ||
            (i.owner || '').toLowerCase().includes(search)
        );
    }
    if (status) filtered = filtered.filter(i => i.status === status);
    if (type) filtered = filtered.filter(i => i.issue_type === type);
    if (priority) filtered = filtered.filter(i => i.priority === priority);
    
    renderClientIssuesTable(filtered);
}

async function openClientIssueModal(id = null) {
    document.getElementById('client-issue-id').value = '';
    document.getElementById('client-issue-form').reset();
    document.getElementById('client-issue-modal-title').textContent = id ? '编辑客户端问题' : '新增客户端问题';
    
    // 填充负责人下拉框
    if (!allMembersData || allMembersData.length === 0) {
        try {
            const membersResp = await authFetch(`${API_BASE}/members`);
            const membersResult = await membersResp.json();
            allMembersData = membersResult.data || membersResult || [];
        } catch (e) { console.error('加载成员数据失败:', e); }
    }
    const ownerSelect = document.getElementById('client-issue-owner');
    ownerSelect.innerHTML = '<option value="">选择负责人</option>';
    if (allMembersData && allMembersData.length > 0) {
        allMembersData.forEach(m => {
            ownerSelect.innerHTML += `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`;
        });
    }
    
    // 填充版本下拉框（使用客户端版本）
    const versionSelect = document.getElementById('client-issue-version');
    versionSelect.innerHTML = '<option value="">选择版本</option>';
    if (allVersionsData && allVersionsData.length > 0) {
        allVersionsData.forEach(v => {
            versionSelect.innerHTML += `<option value="${escapeHtml(v.version_number)}">${escapeHtml(v.version_number)}</option>`;
        });
    }
    
    openModal('client-issue-modal');
}

async function editClientIssue(id) {
    try {
        const response = await authFetch(`${API_BASE}/client-issues/${id}`);
        const result = await response.json();
        if (!result.success || !result.data) {
            showToast('获取问题详情失败', 'error');
            return;
        }
        const item = result.data;
        await openClientIssueModal(id);
        document.getElementById('client-issue-id').value = item.id;
        document.getElementById('client-issue-type').value = item.issue_type || '';
        document.getElementById('client-issue-version').value = item.version || '';
        document.getElementById('client-issue-priority').value = item.priority || '';
        document.getElementById('client-issue-owner').value = item.owner || '';
        document.getElementById('client-issue-status').value = item.status || '待处理';
        document.getElementById('client-issue-desc').value = item.issue_desc || '';
        document.getElementById('client-issue-remarks').value = item.remarks || '';
    } catch (error) {
        console.error('获取问题详情失败:', error);
        showToast('获取问题详情失败', 'error');
    }
}

async function submitClientIssueForm(event) {
    event.preventDefault();
    const id = document.getElementById('client-issue-id').value;
    const data = {
        issue_type: document.getElementById('client-issue-type').value,
        version: document.getElementById('client-issue-version').value,
        priority: document.getElementById('client-issue-priority').value,
        owner: document.getElementById('client-issue-owner').value,
        status: document.getElementById('client-issue-status').value,
        issue_desc: document.getElementById('client-issue-desc').value.trim(),
        remarks: document.getElementById('client-issue-remarks').value.trim()
    };

    if (!data.issue_type || !data.owner || !data.issue_desc) {
        showToast('请填写必填字段', 'warning');
        return;
    }

    try {
        const url = id ? `${API_BASE}/client-issues/${id}` : `${API_BASE}/client-issues`;
        const method = id ? 'PUT' : 'POST';
        const response = await authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            showToast(id ? '更新成功' : '添加成功', 'success');
            closeModal('client-issue-modal');
            await loadClientIssues();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('保存客户端问题失败:', error);
        showToast('保存失败', 'error');
    }
}

async function deleteClientIssue(id) {
    if (!confirm('确定要删除这条问题记录吗？')) return;
    try {
        const response = await authFetch(`${API_BASE}/client-issues/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast('删除成功', 'success');
            await loadClientIssues();
        } else {
            showToast(result.message || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除客户端问题失败:', error);
        showToast('删除失败', 'error');
    }
}

console.log('✅ 新模块（游戏版本、交织问题、交织版本、客户端问题）已加载');

// ========== 管理者看板 Admin Dashboard ==========

function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

let adminDashboardChart = null;

async function loadAdminDashboard() {
    try {
        const response = await authFetch(`${API_BASE}/stats/admin-dashboard`);
        const result = await response.json();
        if (result.success) {
            const d = result.data;
            renderAdminOverview(d.overview || {});
            renderAdminPmStats(d.pm_stats || []);
            renderAdminTrend(d.trends || []);
        } else {
            showToast(result.error || '加载看板数据失败', 'error');
        }
    } catch (err) {
        console.error('加载管理者看板失败:', err);
        showToast('加载失败，请检查网络', 'error');
    }
}

function renderAdminOverview(ov) {
    setEl('adm-total-reqs', ov.total_reqs || 0);
    setEl('adm-pending-reqs', ov.pending_reqs || 0);
    setEl('adm-total-plans', ov.total_plans || 0);
    setEl('adm-total-tasks', ov.total_tasks || 0);
    setEl('adm-finished-tasks', ov.finished_tasks || 0);
    setEl('adm-open-bugs', ov.open_bugs || 0);
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function renderAdminPmStats(stats) {
    const tbody = document.getElementById('adm-pm-stats-table');
    if (!tbody) return;
    if (!stats || stats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><div>暂无PM数据</div></td></tr>';
        return;
    }
    tbody.innerHTML = stats.map((pm, i) => `
        <tr>
            <td><strong>${escHtml(pm.pm_name || '-')}</strong></td>
            <td>${pm.total_requirements || 0}</td>
            <td><span class="badge badge-warning">${pm.pending_reqs || 0}</span></td>
            <td><span class="badge badge-success">${pm.completed_reqs || 0}</span></td>
            <td>${pm.total_plans || 0}</td>
            <td>${pm.active_plans || 0}</td>
            <td><span class="badge badge-success">${pm.completed_plans || 0}</span></td>
            <td>${pm.total_tasks || 0}</td>
            <td><span class="badge badge-success">${pm.finished_tasks || 0}</span></td>
            <td><span class="badge badge-primary">${pm.active_tasks || 0}</span></td>
        </tr>`).join('');
}

function renderAdminTrend(trends) {
    const canvas = document.getElementById('admin-trend-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (adminDashboardChart) { adminDashboardChart.destroy(); adminDashboardChart = null; }

    if (!trends || trends.length === 0) {
        ctx.fillStyle = '#999'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('暂无活动数据', canvas.width / 2, canvas.height / 2);
        return;
    }

    const labels = trends.map(t => t.date.slice(5));
    const data = trends.map(t => t.cnt);
    const maxVal = Math.max(...data, 1);

    // 绘制柱状图
    adminDashboardChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '操作次数',
                data: data,
                backgroundColor: 'rgba(24,144,255,0.6)',
                borderColor: 'rgba(24,144,255,1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, max: Math.ceil(maxVal * 1.2), ticks: { stepSize: 1 } },
                x: { ticks: { fontSize: 11 } }
            }
        }
    });
}

// 管理者看板导航：仅管理员可见
function initAdminNav() {
    const user = getCurrentUser();
    const nav = document.getElementById('nav-admin-dashboard');
    if (nav) {
        // role_id=1 超级管理员, role_id=2 项目经理 都可查看
        const isAdmin = IS_DEV_MODE || (user.role_id === 1 || user.role_id === 2);
        nav.style.display = isAdmin ? '' : 'none';
    }
}

// 切换到管理者看板时自动加载数据
const _origSwitchTab = window.switchTab;
window.switchTab = function(tabId) {
    _origSwitchTab(tabId);
    if (tabId === 'admin-dashboard') loadAdminDashboard();
};

// 页面初始化时检查导航权限
setTimeout(initAdminNav, 500);

console.log('✅ 管理者看板模块已加载');


