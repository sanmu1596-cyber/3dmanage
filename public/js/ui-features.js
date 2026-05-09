/**
 * ui-features.js — UI增强功能模块
 * 职责：全局搜索(Ctrl+K)、键盘快捷键、更多操作菜单、附件管理、批量操作
 * 依赖：core.js, auth.js, router.js（authFetch, showToast, switchTab等）
 */
var App = window.App;

// ==================== P1: 全局搜索命令面板 (Ctrl+K) ====================

let gsDebounceTimer = null;
let gsActiveIndex = -1;
let gsResultItems = [];

function openGlobalSearch() {
    const overlay = document.getElementById('global-search-overlay');
    overlay.style.display = 'flex';
    const input = document.getElementById('gs-input');
    input.value = '';
    document.getElementById('gs-results').innerHTML = '';
    gsActiveIndex = -1;
    gsResultItems = [];
    setTimeout(() => input.focus(), 50);
}

function closeGlobalSearch() {
    document.getElementById('global-search-overlay').style.display = 'none';
}

function onGlobalSearchInput() {
    clearTimeout(gsDebounceTimer);
    gsDebounceTimer = setTimeout(performGlobalSearch, 250);
}

async function performGlobalSearch() {
    const q = document.getElementById('gs-input').value.trim();
    const container = document.getElementById('gs-results');
    
    if (!q) {
        container.innerHTML = '';
        gsResultItems = [];
        gsActiveIndex = -1;
        return;
    }

    container.innerHTML = '<div class="gs-loading">搜索中...</div>';
    
    try {
        const resp = await authFetch(`${API_BASE}/stats/search?q=${encodeURIComponent(q)}`);
        const result = await resp.json();
        
        if (!result.success || !result.data.length) {
            container.innerHTML = `<div class="gs-empty">未找到 "${escapeHtml(q)}" 相关结果</div>`;
            gsResultItems = [];
            gsActiveIndex = -1;
            return;
        }

        // 按类型分组
        const groups = {};
        result.data.forEach(item => {
            if (!groups[item.type]) groups[item.type] = { icon: item.icon, label: item.typeLabel, items: [] };
            groups[item.type].items.push(item);
        });

        let html = '';
        let idx = 0;
        for (const [type, group] of Object.entries(groups)) {
            html += `<div class="gs-group-label">${group.icon} ${group.label}</div>`;
            group.items.forEach(item => {
                const title = highlightMatch(escapeHtml(item.title || ''), q);
                const sub = item.subtitle ? escapeHtml(item.subtitle) : '';
                html += `<div class="gs-item" data-type="${type}" data-id="${item.id}" data-idx="${idx}" 
                          onmouseenter="gsSetActive(${idx})" onclick="gsNavigate('${type}', ${item.id})">
                    <span class="gs-item-icon">${group.icon}</span>
                    <div class="gs-item-text">
                        <div class="gs-item-title">${title}</div>
                        ${sub ? `<div class="gs-item-sub">${sub}</div>` : ''}
                    </div>
                    <span class="gs-item-badge">${group.label}</span>
                </div>`;
                idx++;
            });
        }
        container.innerHTML = html;
        gsResultItems = container.querySelectorAll('.gs-item');
        gsActiveIndex = -1;
    } catch (err) {
        container.innerHTML = '<div class="gs-empty">搜索出错，请重试</div>';
    }
}

function highlightMatch(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function gsSetActive(idx) {
    gsResultItems.forEach(el => el.classList.remove('gs-active'));
    if (idx >= 0 && idx < gsResultItems.length) {
        gsActiveIndex = idx;
        gsResultItems[idx].classList.add('gs-active');
    }
}

function gsNavigate(type, id) {
    closeGlobalSearch();
    // 类型到Tab的映射
    const tabMap = {
        game: 'games', device: 'devices', member: 'members',
        bug: 'bugs', test: 'tests', plan: 'config-plan'
    };
    const tab = tabMap[type];
    if (tab) {
        switchTab(tab);
        // 延迟后高亮搜索结果（如果模块有搜索框，填入关键词）
        setTimeout(() => {
            const searchInput = document.getElementById(
                tab === 'games' ? 'search-input' : `${tab === 'config-plan' ? '' : tab}-search`
            );
            // 不自动填充搜索框，直接跳转到对应Tab即可
        }, 300);
    }
}

// ==================== P1: 键盘快捷键系统 ====================

document.addEventListener('keydown', function(e) {
    // 忽略单独的修饰键（Shift、Ctrl、Alt、Meta）
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock'].includes(e.key)) {
        return;
    }
    
    const overlay = document.getElementById('global-search-overlay');
    const isSearchOpen = overlay && overlay.style.display !== 'none';
    const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    const isInModal = document.activeElement.closest('.modal[style*="block"], .modal.show');

    // Ctrl+K / Cmd+K: 全局搜索
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isSearchOpen) closeGlobalSearch();
        else openGlobalSearch();
        return;
    }

    // 全局搜索面板内的键盘导航
    if (isSearchOpen) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeGlobalSearch();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            gsSetActive(Math.min(gsActiveIndex + 1, gsResultItems.length - 1));
            if (gsResultItems[gsActiveIndex]) gsResultItems[gsActiveIndex].scrollIntoView({ block: 'nearest' });
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            gsSetActive(Math.max(gsActiveIndex - 1, 0));
            if (gsResultItems[gsActiveIndex]) gsResultItems[gsActiveIndex].scrollIntoView({ block: 'nearest' });
            return;
        }
        if (e.key === 'Enter' && gsActiveIndex >= 0 && gsResultItems[gsActiveIndex]) {
            e.preventDefault();
            gsResultItems[gsActiveIndex].click();
            return;
        }
        return; // 搜索面板打开时不响应其他快捷键
    }

    // Escape: 关闭当前弹窗（但如果焦点在输入框内，先让输入框处理）
    if (e.key === 'Escape') {
        const activeEl = document.activeElement;
        const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName);
        
        // 如果在输入框内，先让输入框失去焦点而不是直接关闭弹窗
        if (isInInput && activeEl.closest('.modal')) {
            activeEl.blur();
            e.preventDefault();
            return;
        }
        
        const openModal = document.querySelector('.modal[style*="flex"], .modal[style*="block"]');
        if (openModal) {
            e.preventDefault();
            const closeBtn = openModal.querySelector('.close-btn');
            if (closeBtn) closeBtn.click();
            return;
        }
    }

    // 以下快捷键仅在非输入状态生效
    if (isInInput || isInModal) return;

    // N: 新建当前模块记录
    if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        const tab = getCurrentTab();
        const newBtnMap = {
            games: () => openModal('game-modal'),
            members: () => openModal('member-modal'),
            devices: () => openModal('device-modal'),
            tests: () => openModal('test-modal'),
            bugs: () => openModal('bug-modal'),
            'config-plan': () => showCreatePlanView(),
        };
        if (newBtnMap[tab]) newBtnMap[tab]();
        return;
    }

    // 数字键 1-9: 快速切换Tab
    if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tabs = ['dashboard', 'games', 'devices', 'members', 'progress', 'tests', 'bugs', 'config-plan', 'field-settings'];
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) {
            e.preventDefault();
            switchTab(tabs[idx]);
        }
        return;
    }

    // / : 打开全局搜索（同 Ctrl+K）
    if (e.key === '/') {
        e.preventDefault();
        openGlobalSearch();
        return;
    }
});

function getCurrentTab() {
    const hash = location.hash.slice(1);
    return hash || 'dashboard';
}

// 在顶栏添加搜索入口按钮
document.addEventListener('DOMContentLoaded', () => {
    const topBarRight = document.querySelector('.top-bar-right');
    if (topBarRight) {
        const searchBtn = document.createElement('button');
        searchBtn.className = 'icon-btn';
        searchBtn.title = '全局搜索 (Ctrl+K)';
        searchBtn.innerHTML = '🔍';
        searchBtn.style.cssText = 'margin-right: 8px; cursor: pointer; font-size: 16px; background: none; border: none; padding: 4px 8px; border-radius: 4px;';
        searchBtn.onclick = openGlobalSearch;
        topBarRight.insertBefore(searchBtn, topBarRight.firstChild);
    }
});

// ==================== "更多操作" 下拉菜单 ====================

/**
 * 切换下拉菜单显示/隐藏
 */
function toggleMoreActions(btn) {
    const wrapper = btn.closest('.more-actions-wrapper');
    const dropdown = wrapper.querySelector('.more-actions-dropdown');
    const isOpen = dropdown.classList.contains('show');

    // 先关闭所有已打开的（会把之前portal出去的下拉菜单归位）
    closeAllMoreActions();

    if (!isOpen) {
        // Portal：将 dropdown 移到 <body> 层级，彻底跳出所有父容器 overflow/backdrop-filter 裁剪
        const rect = btn.getBoundingClientRect();
        // 用 JS 属性记录原始父容器（属性不受 DOM 移动影响）
        dropdown._originalParent = wrapper;
        document.body.appendChild(dropdown);
        dropdown.style.position = 'fixed';
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';

        dropdown.classList.add('show');
        btn.classList.add('active');
    }
}

/**
 * 关闭所有"更多操作"下拉菜单，并 Portal 归位
 */
function closeAllMoreActions() {
    document.querySelectorAll('.more-actions-dropdown.show').forEach(d => {
        d.classList.remove('show');
        d.style.position = '';
        d.style.top = '';
        d.style.left = '';
        // 归位到原始父容器
        if (d._originalParent && !d._originalParent.contains(d)) {
            d._originalParent.appendChild(d);
        }
        delete d._originalParent;
    });
    document.querySelectorAll('.more-actions-btn.active').forEach(b => b.classList.remove('active'));
}

/**
 * 批量删除提示（从"更多操作"菜单触发）
 * 检查是否有选中项，没有则提示先勾选
 */
function batchDeletePrompt(moduleName) {
    const tableMap = { games: 'games-table', members: 'members-table', devices: 'devices-table' };
    const tableId = tableMap[moduleName];
    if (!tableId) return;

    const table = document.getElementById(tableId);
    if (!table) return;

    const checkedBoxes = table.querySelectorAll('.row-checkbox:checked');
    if (checkedBoxes.length === 0) {
        showToast('请先在列表中勾选要删除的记录', 'warning');
        return;
    }
    // 已有勾选，直接触发批量删除
    batchDelete();
}

// 点击页面其他区域时关闭下拉菜单
document.addEventListener('click', function(e) {
    if (!e.target.closest('.more-actions-wrapper')) {
        closeAllMoreActions();
    }
});

// ========== 附件上传/管理 ==========
const ATTACH_API = '/api/attachments';

/**
 * 处理文件上传（从input file change触发）
 * @param {Event} e - 文件选择事件
 * @param {string} entityType - 实体类型: requirement, plan, bug, test 等
 */
async function handleFileUpload(e, entityType) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 获取当前查看的实体ID
    const entityId = getCurrentEntityId(entityType);
    if (!entityId) { showToast('请先选择或保存一条记录', 'warning'); return; }

    let successCount = 0;
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('entity_type', entityType);
        formData.append('entity_id', String(entityId));

        try {
            const resp = await fetch(`${ATTACH_API}/upload`, { method: 'POST', body: formData });
            const result = await resp.json();
            if (result.success) successCount++;
            else showToast(`上传「${file.name}」失败: ${result.error}`, 'danger');
        } catch (err) {
            showToast(`上传「${file.name}」失败: 网络错误`, 'danger');
        }
    }

    if (successCount > 0) {
        showToast(`成功上传 ${successCount}/${files.length} 个附件`, 'success');
        loadAttachments(entityType, entityId);
    }
    // 清空input以便重复选择同一文件
    e.target.value = '';
}

/**
 * 获取当前正在查看的实体ID
 */
function getCurrentEntityId(entityType) {
    // 从全局状态获取当前详情ID
    if (entityType === 'requirement' && window.currentRequirementId) return window.currentRequirementId;
    if (entityType === 'plan' && window.currentPlanId) return window.currentPlanId;
    if (entityType === 'bug' && window.currentBugId) return window.currentBugId;
    // 尝试从URL hash参数获取
    const match = location.hash.match(/detail=(\d+)/);
    return match ? parseInt(match[1]) : null;
}

/**
 * 加载并渲染某实体的附件列表
 */
async function loadAttachments(entityType, entityId) {
    if (!entityId) return;
    try {
        const resp = await fetch(`${ATTACH_API}/list/${entityType}/${entityId}`);
        const result = await resp.json();
        renderAttachmentList(result.data || [], entityType);
    } catch (e) { console.error('[加载附件失败]', e); }
}

/** 渲染附件列表 */
function renderAttachmentList(attachments, entityType) {
    const listMap = {
        requirement: 'req-attachment-list',
        plan: 'plan-attachment-list',
        bug: 'bug-attachment-list'
    };
    const container = document.getElementById(listMap[entityType]);
    if (!container) return;

    if (attachments.length === 0) {
        container.innerHTML = '<span style="color:var(--text-tertiary);font-size:12px;">暂无附件</span>';
        return;
    }

    container.innerHTML = attachments.map(a => {
        const icon = getFileIcon(a.original_name);
        const sizeStr = a.size_bytes > 1024*1024 ? (a.size_bytes/1024/1024).toFixed(1)+'MB'
                     : a.size_bytes > 1024 ? Math.round(a.size_bytes/1024)+'KB' : a.size_bytes+'B';
        return `<div class="attachment-item">
            <span class="attach-icon">${icon}</span>
            <span class="attach-name" title="${escapeHtml(a.original_name)} (${sizeStr})">${escapeHtml(a.original_name)}</span>
            <span class="attach-delete" onclick="deleteAttachment(${a.id}, '${entityType}')">✕</span>
        </div>`;
    }).join('');
}

/** 根据扩展名返回图标 */
function getFileIcon(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    const map = { jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🎬', webp:'🖼️', svg:'🎨',
                 pdf:'📕', doc:'📘', docx:'📘', xls:'📊', xlsx:'📊', ppt:'📙', pptx:'📙',
                 txt:'📝', csv:'📊', zip:'📦', log:'📋', json:'{}', default:'📎' };
    return map[ext] || map.default;
}

/** 删除附件 */
async function deleteAttachment(id, entityType) {
    showConfirm('确定要删除此附件吗？', async () => {
        try {
            const resp = await fetch(`${ATTACH_API}/${id}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('附件已删除', 'success');
                const eid = getCurrentEntityId(entityType);
                loadAttachments(entityType, eid);
            } else showToast(result.error, 'danger');
        } catch (e) { showToast('删除失败', 'danger'); }
    });
}

/** AOP拦截：加载详情时自动加载附件列表 */
const _origLoadReqDetail = typeof loadRequirementDetail === 'function';
// 在 switchTab AOP中已处理，这里通过 loadAttachments 按需调用

// ==================== P1: 批量操作系统 ====================

const batchState = { selected: new Set(), resource: '' };

// 表格模块 → 后端资源名映射
const tableToBatchResource = {
    'games-table': 'games',
    'members-table': 'members',
    'devices-table': 'devices',
    'tests-table': 'tests',
    'bugs-table': 'bugs',
    'progress-table': 'adaptations'
};

// 重载函数映射
const batchReloadMap = {
    games: loadGames,
    members: loadMembers,
    devices: loadDevices,
    tests: loadTests,
    bugs: loadBugs,
    adaptations: loadProgressData
};

// 注入 checkbox 到表格（在每次 render 后调用）
function injectBatchCheckboxes(tableId) {
    const resource = tableToBatchResource[tableId];
    if (!resource) return;
    
    const table = document.getElementById(tableId);
    if (!table) return;
    
    // 获取对应的 <thead>
    const theadRow = table.closest('table')?.querySelector('thead tr');
    if (!theadRow) return;
    
    // 如果已有 checkbox 列头，不重复添加
    if (theadRow.querySelector('.batch-th')) return;
    
    // 在序号列之前添加 checkbox 表头
    const th = document.createElement('th');
    th.className = 'batch-th';
    th.style.cssText = 'width:36px;min-width:36px;max-width:36px;overflow:hidden;text-overflow:clip;padding:4px 2px;text-align:center;';
    th.innerHTML = `<input type="checkbox" class="row-checkbox-all" onchange="batchToggleAll('${tableId}', this.checked)">`;
    theadRow.insertBefore(th, theadRow.firstChild);
    
    // 给每一行添加 checkbox
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        if (row.querySelector('.empty-state')) return; // 跳过空状态行
        // 从操作列的按钮中提取 ID
        const editBtn = row.querySelector('button[onclick*="edit"], button[onclick*="Edit"], button[onclick*="delete"], button[onclick*="Delete"]');
        let rowId = null;
        if (editBtn) {
            const match = editBtn.getAttribute('onclick')?.match(/\((\d+)/);
            if (match) rowId = parseInt(match[1]);
        }
        if (rowId === null) return;
        
        const td = document.createElement('td');
        td.style.cssText = 'width:36px;min-width:36px;max-width:36px;overflow:hidden;text-overflow:clip;padding:4px 2px;text-align:center;';
        td.innerHTML = `<input type="checkbox" class="row-checkbox" data-id="${rowId}" data-resource="${resource}" onchange="batchToggleRow(this)">`;
        row.insertBefore(td, row.firstChild);
    });
}

function batchToggleAll(tableId, checked) {
    const resource = tableToBatchResource[tableId];
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const checkboxes = table.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checked;
        const id = parseInt(cb.dataset.id);
        if (checked) batchState.selected.add(id);
        else batchState.selected.delete(id);
    });
    batchState.resource = resource;
    updateBatchBar();
}

function batchToggleRow(cb) {
    const id = parseInt(cb.dataset.id);
    const resource = cb.dataset.resource;
    batchState.resource = resource;
    
    if (cb.checked) batchState.selected.add(id);
    else batchState.selected.delete(id);
    
    updateBatchBar();
    
    // 更新全选框状态
    const table = cb.closest('tbody');
    const allCbs = table.querySelectorAll('.row-checkbox');
    const checkedCbs = table.querySelectorAll('.row-checkbox:checked');
    const allCb = cb.closest('table').querySelector('.row-checkbox-all');
    if (allCb) {
        allCb.checked = allCbs.length > 0 && allCbs.length === checkedCbs.length;
        allCb.indeterminate = checkedCbs.length > 0 && checkedCbs.length < allCbs.length;
    }
}

function updateBatchBar() {
    let bar = document.getElementById('batch-bar');
    
    if (batchState.selected.size === 0) {
        if (bar) bar.remove();
        return;
    }
    
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'batch-bar';
        bar.className = 'batch-bar';
        document.body.appendChild(bar);
    }
    
    bar.innerHTML = `
        <span class="batch-bar-count">已选择 ${batchState.selected.size} 条记录</span>
        <button class="batch-btn batch-btn-danger" onclick="batchDelete()">🗑 批量删除</button>
        <button class="batch-btn batch-btn-cancel" onclick="batchClearAll()">取消</button>
    `;
}

function batchClearAll() {
    batchState.selected.clear();
    document.querySelectorAll('.row-checkbox, .row-checkbox-all').forEach(cb => {
        cb.checked = false;
        cb.indeterminate = false;
    });
    updateBatchBar();
}

async function batchDelete() {
    const count = batchState.selected.size;
    const resource = batchState.resource;
    if (!count || !resource) return;
    
    showConfirm(`确定要删除选中的 ${count} 条记录吗？此操作不可撤销。`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/batch/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resource, ids: Array.from(batchState.selected) })
            });
            const result = await resp.json();
            if (result.success) {
                showToast(`成功删除 ${result.deleted} 条记录`, 'success');
                batchState.selected.clear();
                updateBatchBar();
                // 重新加载对应模块数据
                if (batchReloadMap[resource]) await batchReloadMap[resource]();
                updateStats();
            } else {
                showToast(result.error || '删除失败', 'danger');
            }
        } catch (err) {
            showToast('批量删除失败: ' + err.message, 'danger');
        }
    });
}

// 在表格渲染后自动注入checkbox（使用 MutationObserver + 防抖合并）
let _batchTimers = {};
const _batchObserver = new MutationObserver((mutations) => {
    mutations.forEach(m => {
        const tbody = m.target;
        if (tbody.id && tableToBatchResource[tbody.id]) {
            // 防抖：合并同一 tbody 的多次变更
            clearTimeout(_batchTimers[tbody.id]);
            _batchTimers[tbody.id] = setTimeout(() => {
                // 先清除全选状态
                batchState.selected.clear();
                updateBatchBar();
                // 移除旧的 checkbox 列头
                const theadRow = tbody.closest('table')?.querySelector('thead tr');
                const oldTh = theadRow?.querySelector('.batch-th');
                if (oldTh) oldTh.remove();
                // 重新注入
                injectBatchCheckboxes(tbody.id);
            }, 80);
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    // 监听所有支持批量操作的表格
    Object.keys(tableToBatchResource).forEach(tableId => {
        const el = document.getElementById(tableId);
        if (el) _batchObserver.observe(el, { childList: true });
    });
});

