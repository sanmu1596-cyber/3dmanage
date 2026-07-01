/**
 * testcases.js — 测试用例全流程模块
 * 职责：测试用例CRUD+行内编辑、套件管理、批量操作、关联/执行用例、通知、详情面板
 * 依赖：core.js, auth.js, router.js, entities.js（authFetch, showToast等）
 */
var App = window.App;

// ==================== 测试步骤 富文本编辑器（RichEditor） ====================
var _tcStepsEditor = null;

function mountTcStepsEditor(html) {
    destroyTcStepsEditor();
    if (window.RichEditor && RichEditor.isReady && RichEditor.isReady()) {
        try {
            _tcStepsEditor = RichEditor.create({ containerId: 'tc-steps-editor', value: html || '', height: 200, placeholder: '1. 第一步操作\n2. 第二步操作\n3. 第三步操作' });
        } catch (e) { console.error('测试步骤富文本挂载失败:', e); }
    }
    if (!_tcStepsEditor) { var t = document.getElementById('tc-steps'); if (t) { t.style.display = ''; t.value = html || ''; } }
}
function getTcStepsValue() {
    if (_tcStepsEditor) return _tcStepsEditor.getHtml();
    var t = document.getElementById('tc-steps'); return t ? t.value : '';
}
function destroyTcStepsEditor() {
    try { if (_tcStepsEditor) _tcStepsEditor.destroy(); } catch (e) {}
    _tcStepsEditor = null;
    var c = document.getElementById('tc-steps-editor'); if (c) c.innerHTML = '';
}
function tcPlain(html) {
    if (!html) return '';
    if (html.indexOf('<') < 0) return html;
    var d = document.createElement('div'); d.innerHTML = html; return (d.textContent || d.innerText || '').trim();
}

// ==================== 测试用例模块 ====================
let allTestCasesData = [];
let filteredTestCasesData = [];
let selectedTestCaseIds = new Set();
let allTestSuites = [];             // 所有套件
let currentSuiteId = null;          // 当前选中的套件ID (null=全部)

// 加载测试套件列表
async function loadTestSuites() {
    try {
        const resp = await authFetch(`${API_BASE}/test-cases/suites`);
        const result = await resp.json();
        if (result.success) {
            allTestSuites = result.data || [];
        }
    } catch (e) {
        console.error('加载测试套件失败:', e);
        allTestSuites = [];
    }
    renderSuiteTree();
    populateSuiteSelects();
}

// 渲染左侧套件树
function renderSuiteTree() {
    const container = document.getElementById('tc-suite-list');
    if (!container) return;

    // 计算未归类数量
    const unclassifiedCount = allTestCasesData.filter(tc => !tc.suite_id).length;
    const totalCount = allTestCasesData.length;

    let html = `
        <div class="tc-suite-item ${currentSuiteId === null ? 'active' : ''}" onclick="selectSuite(null)">
            <span class="suite-icon">📋</span>
            <span class="suite-name">全部用例</span>
            <span class="suite-count">${totalCount}</span>
        </div>
        <div class="tc-suite-item ${currentSuiteId === 'unclassified' ? 'active' : ''}" onclick="selectSuite('unclassified')">
            <span class="suite-icon">📄</span>
            <span class="suite-name">未归类</span>
            <span class="suite-count">${unclassifiedCount}</span>
        </div>
        <div style="border-top:1px solid var(--border-light);margin:4px 14px;"></div>
    `;

    allTestSuites.forEach(suite => {
        html += `
        <div class="tc-suite-item ${currentSuiteId === suite.id ? 'active' : ''}" onclick="selectSuite(${suite.id})" title="${escapeHtml(suite.description || '')}">
            <span class="suite-icon">📂</span>
            <span class="suite-name">${escapeHtml(suite.name)}</span>
            <span class="suite-count">${suite.case_count || 0}</span>
            <div class="suite-actions">
                <button class="suite-action-btn" onclick="event.stopPropagation(); editSuite(${suite.id})" title="编辑">✏️</button>
                <button class="suite-action-btn" onclick="event.stopPropagation(); deleteSuite(${suite.id}, '${escapeHtml(suite.name)}')" title="删除">🗑️</button>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

// 填充套件下拉选择框（用例表单、移动弹窗等）
function populateSuiteSelects() {
    const selects = ['tc-suite-id', 'move-target-suite'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        const currentVal = select.value;
        let optionsHtml = '<option value="">未归类</option>';
        allTestSuites.forEach(s => {
            optionsHtml += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
        });
        select.innerHTML = optionsHtml;
        select.value = currentVal;
    });
}

// 选择套件
function selectSuite(suiteId) {
    currentSuiteId = suiteId;
    renderSuiteTree();
    updateBreadcrumb();
    filterTestCases();
}

// 更新面包屑
function updateBreadcrumb() {
    const container = document.getElementById('tc-breadcrumb');
    if (!container) return;

    if (currentSuiteId === null) {
        container.innerHTML = '<span class="tc-breadcrumb-item active" onclick="selectSuite(null)">📂 全部用例</span>';
    } else if (currentSuiteId === 'unclassified') {
        container.innerHTML = `
            <span class="tc-breadcrumb-item" onclick="selectSuite(null)">📂 全部用例</span>
            <span class="tc-breadcrumb-sep">›</span>
            <span class="tc-breadcrumb-item active">📄 未归类</span>`;
    } else {
        const suite = allTestSuites.find(s => s.id === currentSuiteId);
        container.innerHTML = `
            <span class="tc-breadcrumb-item" onclick="selectSuite(null)">📂 全部用例</span>
            <span class="tc-breadcrumb-sep">›</span>
            <span class="tc-breadcrumb-item active">📂 ${escapeHtml(suite?.name || '')}</span>`;
    }
}

// 加载测试用例列表
async function loadTestCases() {
    try {
        // 先加载套件
        await loadTestSuites();
        
        const resp = await authFetch(`${API_BASE}/test-cases`);
        const result = await resp.json();
        if (result.success) {
            allTestCasesData = result.data || [];
            filterTestCases();
            updateTestCaseStats();
            renderSuiteTree(); // 更新套件计数
        }
    } catch (e) {
        console.error('加载测试用例失败:', e);
        showToast('加载测试用例失败', 'danger');
    }
}

// 渲染测试用例表格
function renderTestCases() {
    const tbody = document.getElementById('test-cases-table');
    if (!tbody) return;
    
    if (filteredTestCasesData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="empty-state"><div class="empty-icon">📝</div><div>暂无测试用例</div><div class="empty-sub">点击"新增用例"创建第一个测试用例</div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = filteredTestCasesData.map((tc, i) => `
        <tr data-id="${tc.id}" class="${selectedTestCaseIds.has(tc.id) ? 'tc-selected' : ''}">
            <td><input type="checkbox" class="tc-checkbox" data-id="${tc.id}" ${selectedTestCaseIds.has(tc.id) ? 'checked' : ''} onchange="toggleTestCaseSelect(${tc.id})"></td>
            <td>${i + 1}</td>
            <td><span class="tc-code">${escapeHtml(tc.code || '-')}</span></td>
            <td class="editable-cell text-left" ondblclick="startTcTextEdit(this, ${tc.id}, 'name')" title="双击编辑"><strong>${escapeHtml(tc.name)}</strong></td>
            <td class="editable-cell" ondblclick="startTcDropdownEdit(this, ${tc.id}, 'category')" title="双击选择"><span class="tc-category-tag">${escapeHtml(tc.category || '功能测试')}</span></td>
            <td class="editable-cell" ondblclick="startTcDropdownEdit(this, ${tc.id}, 'priority')" title="双击选择"><span class="tc-priority-tag ${sanitizeCssClass(tc.priority || 'medium')}">${getPriorityLabel(tc.priority)}</span></td>
            <td class="editable-cell text-left" ondblclick="startTcTextEdit(this, ${tc.id}, 'precondition')" title="双击编辑"><span class="tc-cell-text" title="${escapeHtml(tc.precondition || '')}">${escapeHtml(tc.precondition || '-')}</span></td>
            <td class="text-left" title="点击编辑按钮打开富文本编辑"><span class="tc-cell-text" title="${escapeHtml(tcPlain(tc.steps))}">${escapeHtml(tcPlain(tc.steps) || '-')}</span></td>
            <td class="editable-cell text-left" ondblclick="startTcTextEdit(this, ${tc.id}, 'expected_result')" title="双击编辑"><span class="tc-cell-text" title="${escapeHtml(tc.expected_result || '')}">${escapeHtml(tc.expected_result || '-')}</span></td>
            <td class="editable-cell" ondblclick="startTcDropdownEdit(this, ${tc.id}, 'is_template')" title="双击选择"><span class="tc-type-tag ${tc.is_template ? 'template' : 'normal'}">${tc.is_template ? '模板' : '普通'}</span></td>
            <td class="text-center action-icons">
                <button class="action-icon-btn edit" onclick="editTestCase(${tc.id})" title="编辑">✏️</button>
                <button class="action-icon-btn" onclick="copyTestCase(${tc.id})" title="复制">📋</button>
                <button class="action-icon-btn delete" onclick="deleteTestCase(${tc.id})" title="删除">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// ==================== 测试用例行内编辑 ====================

/**
 * 测试用例 — 双击文本编辑（用例名称、前置条件、测试步骤、预期结果）
 */
function startTcTextEdit(td, tcId, field) {
    if (td.classList.contains('editing')) return;
    td.classList.add('editing');

    // ★ 不再锁定 td 宽高，避免列宽重排
    td.style.position = 'relative';

    const tc = allTestCasesData.find(t => t.id === tcId);
    const originalValue = tc ? (tc[field] || '') : '';
    const originalHtml = td.innerHTML;

    // 多行字段用 textarea，单行用 input
    const multiLineFields = ['precondition', 'steps', 'expected_result'];
    let input;
    if (multiLineFields.includes(field)) {
        input = document.createElement('textarea');
        input.className = 'inline-edit-textarea';
        input.value = originalValue;
        input.rows = 3;
        input.style.minHeight = '60px';
        input.style.resize = 'vertical';
    } else {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit-input';
        input.value = originalValue;
    }

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
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
        if (newValue === originalValue) {
            td.classList.remove('editing');
            td.innerHTML = originalHtml;
            td.style.position = '';
            return;
        }
        try {
            const response = await authFetch(`${API_BASE}/test-cases/${tcId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: newValue })
            });
            if (response.ok) {
                if (tc) tc[field] = newValue;
                // 恢复显示
                if (field === 'name') {
                    td.innerHTML = `<strong>${escapeHtml(newValue || '-')}</strong>`;
                } else {
                    td.innerHTML = `<span class="tc-cell-text" title="${escapeHtml(newValue || '')}">${escapeHtml(newValue || '-')}</span>`;
                }
                showToast('已保存', 'success');
            } else {
                td.innerHTML = originalHtml;
                showToast('保存失败', 'danger');
            }
        } catch (e) {
            td.innerHTML = originalHtml;
            showToast('保存失败', 'danger');
        }
        td.classList.remove('editing');
        td.style.position = '';
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !multiLineFields.includes(field)) { e.preventDefault(); input.blur(); }
        if (e.key === 'Enter' && e.ctrlKey && multiLineFields.includes(field)) { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') {
            saved = true;
            td.classList.remove('editing');
            td.innerHTML = originalHtml;
            td.style.position = '';
        }
    });
}

/**
 * 测试用例 — 双击下拉编辑（分类、优先级、类型）
 */
function startTcDropdownEdit(td, tcId, field) {
    if (td.classList.contains('editing')) return;
    td.classList.add('editing');

    // ★ 不再锁定 td 宽高，避免列宽重排
    td.style.position = 'relative';

    const tc = allTestCasesData.find(t => t.id === tcId);
    const originalHtml = td.innerHTML;

    const select = document.createElement('select');
    select.className = 'inline-edit-select';

    // 根据字段确定选项
    let options = [];
    let currentVal = '';
    if (field === 'category') {
        options = [
            { value: '功能测试', label: '功能测试' },
            { value: '性能测试', label: '性能测试' },
            { value: '兼容性测试', label: '兼容性测试' },
            { value: 'UI测试', label: 'UI测试' },
            { value: '安装卸载', label: '安装卸载' },
            { value: '适配验收', label: '适配验收' }
        ];
        currentVal = tc ? (tc.category || '功能测试') : '';
    } else if (field === 'priority') {
        options = [
            { value: 'high', label: '高' },
            { value: 'medium', label: '中' },
            { value: 'low', label: '低' }
        ];
        currentVal = tc ? (tc.priority || 'medium') : '';
    } else if (field === 'is_template') {
        options = [
            { value: '0', label: '普通' },
            { value: '1', label: '模板' }
        ];
        currentVal = tc ? String(tc.is_template || 0) : '0';
    }

    options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === currentVal) opt.selected = true;
        select.appendChild(opt);
    });

    td.innerHTML = '';
    td.appendChild(select);
    select.focus();
    try { select.showPicker(); } catch(e) { select.click(); }

    let saved = false;
    const save = async () => {
        if (saved) return;
        saved = true;
        const newValue = select.value;
        if (newValue === currentVal) {
            td.classList.remove('editing');
            td.innerHTML = originalHtml;
            td.style.position = '';
            return;
        }

        // 构造请求体
        const payload = {};
        if (field === 'is_template') {
            payload.is_template = parseInt(newValue);
        } else {
            payload[field] = newValue;
        }

        try {
            const response = await authFetch(`${API_BASE}/test-cases/${tcId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                if (tc) {
                    if (field === 'is_template') tc.is_template = parseInt(newValue);
                    else tc[field] = newValue;
                }
                // 更新显示
                if (field === 'category') {
                    td.innerHTML = `<span class="tc-category-tag">${escapeHtml(newValue)}</span>`;
                } else if (field === 'priority') {
                    td.innerHTML = `<span class="tc-priority-tag ${sanitizeCssClass(newValue)}">${getPriorityLabel(newValue)}</span>`;
                } else if (field === 'is_template') {
                    const isTemplate = parseInt(newValue);
                    td.innerHTML = `<span class="tc-type-tag ${isTemplate ? 'template' : 'normal'}">${isTemplate ? '模板' : '普通'}</span>`;
                }
                showToast('已保存', 'success');
            } else {
                td.innerHTML = originalHtml;
                showToast('保存失败', 'danger');
            }
        } catch (e) {
            td.innerHTML = originalHtml;
            showToast('保存失败', 'danger');
        }
        td.classList.remove('editing');
        td.style.position = '';
    };

    select.addEventListener('change', save);
    select.addEventListener('blur', () => {
        if (!saved) {
            saved = true;
            td.classList.remove('editing');
            td.innerHTML = originalHtml;
            td.style.position = '';
        }
    });
}

// 获取优先级标签文本
function getPriorityLabel(priority) {
    const labels = { high: '高', medium: '中', low: '低' };
    return labels[priority] || '中';
}

// 更新测试用例统计
function updateTestCaseStats() {
    const total = allTestCasesData.length;
    const highCount = allTestCasesData.filter(tc => tc.priority === 'high').length;
    const templateCount = allTestCasesData.filter(tc => tc.is_template).length;
    
    const statTotal = document.getElementById('tc-stat-total');
    const statHigh = document.getElementById('tc-stat-high');
    const statTemplate = document.getElementById('tc-stat-template');
    
    if (statTotal) statTotal.textContent = total;
    if (statHigh) statHigh.textContent = highCount;
    if (statTemplate) statTemplate.textContent = templateCount;
}

// 筛选测试用例
function filterTestCases() {
    const search = (document.getElementById('tc-search')?.value || '').toLowerCase();
    const category = document.getElementById('tc-category-filter')?.value || '';
    const priority = document.getElementById('tc-priority-filter')?.value || '';
    const templateFilter = document.getElementById('tc-template-filter')?.value || '';
    
    filteredTestCasesData = allTestCasesData.filter(tc => {
        // 套件过滤
        if (currentSuiteId === 'unclassified') {
            if (tc.suite_id) return false;
        } else if (currentSuiteId !== null) {
            if (tc.suite_id !== currentSuiteId) return false;
        }
        // 搜索过滤
        if (search && !tc.name.toLowerCase().includes(search) && 
            !(tc.code || '').toLowerCase().includes(search) &&
            !(tc.tags || '').toLowerCase().includes(search)) {
            return false;
        }
        if (category && tc.category !== category) return false;
        if (priority && tc.priority !== priority) return false;
        if (templateFilter !== '' && String(tc.is_template) !== templateFilter) return false;
        return true;
    });
    
    renderTestCases();
    updateBatchMoveBtn();
}

// 重置筛选
function resetTestCaseFilters() {
    const search = document.getElementById('tc-search');
    const category = document.getElementById('tc-category-filter');
    const priority = document.getElementById('tc-priority-filter');
    const template = document.getElementById('tc-template-filter');
    
    if (search) search.value = '';
    if (category) category.value = '';
    if (priority) priority.value = '';
    if (template) template.value = '';
    
    filteredTestCasesData = allTestCasesData.filter(tc => {
        if (currentSuiteId === 'unclassified') return !tc.suite_id;
        if (currentSuiteId !== null) return tc.suite_id === currentSuiteId;
        return true;
    });
    renderTestCases();
}

// 更新批量移动按钮可见性
function updateBatchMoveBtn() {
    const btn = document.getElementById('tc-batch-move-btn');
    if (btn) btn.style.display = selectedTestCaseIds.size > 0 ? 'inline-flex' : 'none';
}

// 打开新增/编辑弹窗
function openTestCaseModal(tc = null) {
    const modal = document.getElementById('test-case-modal');
    const title = document.getElementById('test-case-modal-title');
    const form = document.getElementById('test-case-form');
    
    form.reset();
    document.getElementById('tc-id').value = '';
    
    // 刷新套件下拉
    populateSuiteSelects();
    
    if (tc) {
        title.textContent = '编辑测试用例';
        document.getElementById('tc-id').value = tc.id;
        document.getElementById('tc-name').value = tc.name || '';
        document.getElementById('tc-code').value = tc.code || '';
        document.getElementById('tc-category').value = tc.category || '功能测试';
        document.getElementById('tc-priority').value = tc.priority || 'medium';
        document.getElementById('tc-precondition').value = tc.precondition || '';
        document.getElementById('tc-expected').value = tc.expected_result || '';
        document.getElementById('tc-tags').value = tc.tags || '';
        document.getElementById('tc-is-template').checked = !!tc.is_template;
        // 设置套件
        const suiteSelect = document.getElementById('tc-suite-id');
        if (suiteSelect) suiteSelect.value = tc.suite_id || '';
    } else {
        title.textContent = '新增测试用例';
        // 新增时默认归入当前选中套件
        const suiteSelect = document.getElementById('tc-suite-id');
        if (suiteSelect && currentSuiteId && currentSuiteId !== 'unclassified') {
            suiteSelect.value = currentSuiteId;
        }
    }
    
    openModal('test-case-modal');
    mountTcStepsEditor(tc ? (tc.steps || '') : '');
}

// 编辑测试用例
function editTestCase(id) {
    const tc = allTestCasesData.find(t => t.id === id);
    if (tc) openTestCaseModal(tc);
}

// 提交测试用例表单
async function submitTestCaseForm(event) {
    event.preventDefault();
    
    const id = document.getElementById('tc-id').value;
    const suiteVal = document.getElementById('tc-suite-id')?.value;
    const payload = {
        name: document.getElementById('tc-name').value.trim(),
        code: document.getElementById('tc-code').value.trim(),
        category: document.getElementById('tc-category').value,
        priority: document.getElementById('tc-priority').value,
        precondition: document.getElementById('tc-precondition').value.trim(),
        steps: getTcStepsValue(),
        expected_result: document.getElementById('tc-expected').value.trim(),
        tags: document.getElementById('tc-tags').value.trim(),
        is_template: document.getElementById('tc-is-template').checked ? 1 : 0,
        suite_id: suiteVal ? parseInt(suiteVal) : null
    };
    
    if (!payload.name) {
        showToast('用例名称不能为空', 'warning');
        return;
    }
    
    try {
        const url = id ? `${API_BASE}/test-cases/${id}` : `${API_BASE}/test-cases`;
        const method = id ? 'PUT' : 'POST';
        
        const resp = await authFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await resp.json();
        if (result.success) {
            showToast(id ? '用例已更新' : '用例已创建', 'success');
            closeModal('test-case-modal');
            await loadTestCases();
        } else {
            showToast('保存失败: ' + (result.error || ''), 'danger');
        }
    } catch (e) {
        showToast('保存失败，请重试', 'danger');
    }
}

// 删除测试用例
function deleteTestCase(id) {
    const tc = allTestCasesData.find(t => t.id === id);
    showConfirm(`确定删除用例「${tc?.name || ''}」吗？`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/test-cases/${id}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('用例已删除', 'success');
                await loadTestCases();
            } else {
                showToast('删除失败: ' + (result.error || ''), 'danger');
            }
        } catch (e) {
            showToast('删除失败，请重试', 'danger');
        }
    });
}

// 复制测试用例
async function copyTestCase(id) {
    try {
        const resp = await authFetch(`${API_BASE}/test-cases/${id}/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const result = await resp.json();
        if (result.success) {
            showToast('用例已复制', 'success');
            await loadTestCases();
        } else {
            showToast('复制失败: ' + (result.error || ''), 'danger');
        }
    } catch (e) {
        showToast('复制失败，请重试', 'danger');
    }
}

// 全选/取消全选
function toggleSelectAllTestCases() {
    const checkbox = document.getElementById('tc-select-all');
    const isChecked = checkbox?.checked;
    
    if (isChecked) {
        filteredTestCasesData.forEach(tc => selectedTestCaseIds.add(tc.id));
    } else {
        selectedTestCaseIds.clear();
    }
    
    renderTestCases();
    updateBatchMoveBtn();
}

// 单选
function toggleTestCaseSelect(id) {
    if (selectedTestCaseIds.has(id)) {
        selectedTestCaseIds.delete(id);
    } else {
        selectedTestCaseIds.add(id);
    }
    renderTestCases();
    updateBatchMoveBtn();
}

// 批量删除
async function batchDeleteTestCases() {
    if (selectedTestCaseIds.size === 0) {
        showToast('请先选择要删除的用例', 'warning');
        return;
    }
    
    showConfirm(`确定删除选中的 ${selectedTestCaseIds.size} 条用例吗？`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/test-cases/batch-delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedTestCaseIds) })
            });
            const result = await resp.json();
            if (result.success) {
                showToast(`已删除 ${result.deleted} 条用例`, 'success');
                selectedTestCaseIds.clear();
                await loadTestCases();
            } else {
                showToast('批量删除失败', 'danger');
            }
        } catch (e) {
            showToast('批量删除失败', 'danger');
        }
    });
}

// 打开批量添加弹窗
function openBatchTestCaseModal() {
    const textarea = document.getElementById('batch-tc-input');
    if (textarea) textarea.value = '';
    openModal('batch-test-case-modal');
}

// 加载批量添加模板
function loadBatchTestCaseTemplate() {
    const template = `游戏启动正常 | 功能测试 | high | 1. 点击游戏图标启动 2. 等待加载完成 | 游戏正常进入主界面
画面无撕裂 | 性能测试 | medium | 1. 进入游戏场景 2. 快速移动视角 | 画面流畅无撕裂
3D效果开启 | 适配验收 | high | 1. 进入设置 2. 开启3D效果 | 3D效果正常显示
安装流程正常 | 安装卸载 | high | 1. 下载安装包 2. 执行安装 | 安装成功，无报错
卸载流程正常 | 安装卸载 | medium | 1. 进入应用管理 2. 卸载游戏 | 卸载成功，无残留文件
存档功能 | 功能测试 | medium | 1. 进入游戏 2. 保存进度 3. 退出重进 | 存档正常加载
声音正常 | 功能测试 | low | 1. 进入游戏 2. 检查BGM和音效 | 音频播放正常
UI显示正确 | UI测试 | medium | 1. 进入各界面 2. 检查UI元素 | UI显示完整无错位`;
    
    const textarea = document.getElementById('batch-tc-input');
    if (textarea) textarea.value = template;
}

// 提交批量添加
async function submitBatchTestCases() {
    const textarea = document.getElementById('batch-tc-input');
    const input = textarea?.value.trim();
    
    if (!input) {
        showToast('请输入用例数据', 'warning');
        return;
    }
    
    const lines = input.split('\n').filter(line => line.trim());
    const cases = [];
    
    for (const line of lines) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length < 1 || !parts[0]) continue;
        
        cases.push({
            name: parts[0],
            category: parts[1] || '功能测试',
            priority: parts[2] || 'medium',
            steps: parts[3] || '',
            expected_result: parts[4] || '',
            suite_id: (currentSuiteId && currentSuiteId !== 'unclassified') ? currentSuiteId : null
        });
    }
    
    if (cases.length === 0) {
        showToast('未解析到有效用例', 'warning');
        return;
    }
    
    try {
        const resp = await authFetch(`${API_BASE}/test-cases/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cases })
        });
        const result = await resp.json();
        if (result.success) {
            showToast(`成功添加 ${result.created} 条用例`, 'success');
            closeModal('batch-test-case-modal');
            await loadTestCases();
        } else {
            showToast('批量添加失败: ' + (result.error || ''), 'danger');
        }
    } catch (e) {
        showToast('批量添加失败', 'danger');
    }
}

// 导出测试用例到Excel
function exportTestCasesToExcel() {
    if (allTestCasesData.length === 0) {
        showToast('没有可导出的数据', 'warning');
        return;
    }
    
    const data = allTestCasesData.map((tc, i) => ({
        '序号': i + 1,
        '用例编号': tc.code || '',
        '用例名称': tc.name,
        '分类': tc.category || '',
        '优先级': getPriorityLabel(tc.priority),
        '前置条件': tc.precondition || '',
        '测试步骤': tcPlain(tc.steps) || '',
        '预期结果': tc.expected_result || '',
        '类型': tc.is_template ? '模板' : '普通',
        '标签': tc.tags || ''
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '测试用例');
    XLSX.writeFile(wb, `测试用例_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('导出成功', 'success');
}

// ========== 测试套件管理 ==========

// 打开新增/编辑套件弹窗
function openSuiteModal(suite = null) {
    const form = document.getElementById('suite-form');
    const title = document.getElementById('suite-modal-title');
    form.reset();
    document.getElementById('suite-id').value = '';
    
    if (suite) {
        title.textContent = '编辑测试套件';
        document.getElementById('suite-id').value = suite.id;
        document.getElementById('suite-name').value = suite.name || '';
        document.getElementById('suite-desc').value = suite.description || '';
        document.getElementById('suite-order').value = suite.sort_order || 0;
    } else {
        title.textContent = '新增测试套件';
    }
    
    openModal('suite-modal');
}

// 编辑套件
function editSuite(id) {
    const suite = allTestSuites.find(s => s.id === id);
    if (suite) openSuiteModal(suite);
}

// 删除套件
function deleteSuite(id, name) {
    showConfirm(`删除套件「${name}」后，其下用例将变为"未归类"，确定？`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/test-cases/suites/${id}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('套件已删除', 'success');
                if (currentSuiteId === id) currentSuiteId = null;
                await loadTestCases();
            } else {
                showToast('删除失败: ' + (result.error || ''), 'danger');
            }
        } catch (e) {
            showToast('删除失败，请重试', 'danger');
        }
    });
}

// 提交套件表单
async function submitSuiteForm(event) {
    event.preventDefault();
    
    const id = document.getElementById('suite-id').value;
    const payload = {
        name: document.getElementById('suite-name').value.trim(),
        description: document.getElementById('suite-desc').value.trim(),
        sort_order: parseInt(document.getElementById('suite-order').value) || 0
    };
    
    if (!payload.name) {
        showToast('套件名称不能为空', 'warning');
        return;
    }
    
    try {
        const url = id ? `${API_BASE}/test-cases/suites/${id}` : `${API_BASE}/test-cases/suites`;
        const method = id ? 'PUT' : 'POST';
        
        const resp = await authFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await resp.json();
        if (result.success) {
            showToast(id ? '套件已更新' : '套件已创建', 'success');
            closeModal('suite-modal');
            await loadTestCases();
        } else {
            showToast('保存失败: ' + (result.error || ''), 'danger');
        }
    } catch (e) {
        showToast('保存失败，请重试', 'danger');
    }
}

// ========== 批量移动用例到套件 ==========

// 打开移动弹窗
function batchMoveTestCases() {
    if (selectedTestCaseIds.size === 0) {
        showToast('请先选择要移动的用例', 'warning');
        return;
    }
    
    populateSuiteSelects();
    document.getElementById('move-tc-count').textContent = selectedTestCaseIds.size;
    openModal('move-to-suite-modal');
}

// 确认移动
async function confirmMoveToSuite() {
    const targetVal = document.getElementById('move-target-suite').value;
    const suiteId = targetVal ? parseInt(targetVal) : null;
    
    try {
        const resp = await authFetch(`${API_BASE}/test-cases/suites/move-cases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case_ids: Array.from(selectedTestCaseIds),
                suite_id: suiteId
            })
        });
        
        const result = await resp.json();
        if (result.success) {
            const targetName = suiteId 
                ? (allTestSuites.find(s => s.id === suiteId)?.name || '指定套件')
                : '未归类';
            showToast(`已将 ${selectedTestCaseIds.size} 条用例移动到「${targetName}」`, 'success');
            selectedTestCaseIds.clear();
            closeModal('move-to-suite-modal');
            await loadTestCases();
        } else {
            showToast('移动失败: ' + (result.error || ''), 'danger');
        }
    } catch (e) {
        showToast('移动失败，请重试', 'danger');
    }
}


// ==================== 关联测试用例（配置计划用） ====================
let linkTcAllCases = [];          // 所有可选用例
let linkTcFilteredCases = [];     // 筛选后
let linkTcSelectedIds = new Set(); // 已选中的用例ID
let linkTcContext = null;          // {planId, planGameId, planIndex, gameIndex}
let linkTcSuites = [];             // 套件列表
let linkTcCurrentSuiteId = null;   // 当前选中套件 (null=全部)

// 打开关联用例弹窗
async function openLinkTestCaseModal(planIndex, gameIndex) {
    const plan = configPlans[planIndex];
    const game = plan?.games[gameIndex];
    if (!plan || !game) return;
    
    linkTcContext = {
        planId: plan.id,
        planGameId: game.id,
        planIndex,
        gameIndex
    };
    
    document.getElementById('link-tc-modal-title').textContent = `关联测试用例 - ${game.name}`;
    
    // 加载套件列表
    try {
        const suiteResp = await authFetch(`${API_BASE}/test-cases/suites`);
        const suiteResult = await suiteResp.json();
        linkTcSuites = suiteResult.data || [];
    } catch (e) {
        linkTcSuites = [];
    }
    
    // 加载所有测试用例
    try {
        const resp = await authFetch(`${API_BASE}/test-cases`);
        const result = await resp.json();
        linkTcAllCases = result.data || [];
    } catch (e) {
        linkTcAllCases = [];
    }
    
    // 加载已关联的用例
    try {
        const linkedResp = await authFetch(`${API_BASE}/test-cases/plan-game/${game.id}`);
        const linkedResult = await linkedResp.json();
        const linkedIds = (linkedResult.data || []).map(tc => tc.test_case_id);
        linkTcSelectedIds = new Set(linkedIds);
    } catch (e) {
        linkTcSelectedIds = new Set();
    }
    
    linkTcCurrentSuiteId = null;
    renderLinkTcSuiteTree();
    updateLinkTcBreadcrumb();
    filterLinkTestCases();
    updateLinkTcSelectedCount();
    
    document.getElementById('link-tc-search').value = '';
    document.getElementById('link-tc-category').value = '';
    
    openModal('link-test-case-modal');
}

// 渲染关联弹窗左侧套件树
function renderLinkTcSuiteTree() {
    const container = document.getElementById('link-tc-suite-list');
    if (!container) return;
    
    const totalCount = linkTcAllCases.length;
    const unclassifiedCount = linkTcAllCases.filter(tc => !tc.suite_id).length;
    
    let html = `
        <div class="link-tc-suite-item ${linkTcCurrentSuiteId === null ? 'active' : ''}" onclick="selectLinkTcSuite(null)">
            <span class="suite-icon">📋</span>
            <span class="suite-name">全部用例</span>
            <span class="suite-count">${totalCount}</span>
        </div>
        <div class="link-tc-suite-item ${linkTcCurrentSuiteId === 'unclassified' ? 'active' : ''}" onclick="selectLinkTcSuite('unclassified')">
            <span class="suite-icon">📄</span>
            <span class="suite-name">未归类</span>
            <span class="suite-count">${unclassifiedCount}</span>
        </div>
        <div style="border-top:1px solid var(--border-light);margin:4px 10px;"></div>
    `;
    
    linkTcSuites.forEach(suite => {
        const count = linkTcAllCases.filter(tc => tc.suite_id === suite.id).length;
        html += `
        <div class="link-tc-suite-item ${linkTcCurrentSuiteId === suite.id ? 'active' : ''}" onclick="selectLinkTcSuite(${suite.id})" title="${escapeHtml(suite.description || '')}">
            <span class="suite-icon">📂</span>
            <span class="suite-name">${escapeHtml(suite.name)}</span>
            <span class="suite-count">${count}</span>
        </div>`;
    });
    
    container.innerHTML = html;
}

// 选择套件
function selectLinkTcSuite(suiteId) {
    linkTcCurrentSuiteId = suiteId;
    renderLinkTcSuiteTree();
    updateLinkTcBreadcrumb();
    filterLinkTestCases();
}

// 更新面包屑
function updateLinkTcBreadcrumb() {
    const container = document.getElementById('link-tc-breadcrumb');
    if (!container) return;
    
    if (linkTcCurrentSuiteId === null) {
        container.innerHTML = '<span class="tc-breadcrumb-item active">📂 全部用例</span>';
    } else if (linkTcCurrentSuiteId === 'unclassified') {
        container.innerHTML = `
            <span class="tc-breadcrumb-item" onclick="selectLinkTcSuite(null)" style="cursor:pointer">📂 全部用例</span>
            <span class="tc-breadcrumb-sep">›</span>
            <span class="tc-breadcrumb-item active">📄 未归类</span>`;
    } else {
        const suite = linkTcSuites.find(s => s.id === linkTcCurrentSuiteId);
        container.innerHTML = `
            <span class="tc-breadcrumb-item" onclick="selectLinkTcSuite(null)" style="cursor:pointer">📂 全部用例</span>
            <span class="tc-breadcrumb-sep">›</span>
            <span class="tc-breadcrumb-item active">📂 ${escapeHtml(suite?.name || '')}</span>`;
    }
}

// 渲染关联用例表格
function renderLinkTestCaseTable() {
    const tbody = document.getElementById('link-tc-table');
    if (!tbody) return;
    
    if (linkTcFilteredCases.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">暂无测试用例</td></tr>`;
        return;
    }
    
    tbody.innerHTML = linkTcFilteredCases.map(tc => {
        const isSelected = linkTcSelectedIds.has(tc.id);
        return `
            <tr class="${isSelected ? 'selected' : ''}" onclick="toggleLinkTcSelect(${tc.id})">
                <td><input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleLinkTcSelect(${tc.id})"></td>
                <td>${escapeHtml(tc.code || '-')}</td>
                <td>${escapeHtml(tc.name)}</td>
                <td><span class="tc-category-tag">${escapeHtml(tc.category || '')}</span></td>
                <td><span class="tc-priority-tag ${sanitizeCssClass(tc.priority || 'medium')}">${getPriorityLabel(tc.priority)}</span></td>
            </tr>
        `;
    }).join('');
}

// 筛选关联用例
function filterLinkTestCases() {
    const search = (document.getElementById('link-tc-search')?.value || '').toLowerCase();
    const category = document.getElementById('link-tc-category')?.value || '';
    
    linkTcFilteredCases = linkTcAllCases.filter(tc => {
        // 套件过滤
        if (linkTcCurrentSuiteId === 'unclassified') {
            if (tc.suite_id) return false;
        } else if (linkTcCurrentSuiteId !== null) {
            if (tc.suite_id !== linkTcCurrentSuiteId) return false;
        }
        // 搜索过滤
        if (search && !tc.name.toLowerCase().includes(search) && !(tc.code || '').toLowerCase().includes(search)) {
            return false;
        }
        if (category && tc.category !== category) return false;
        return true;
    });
    
    renderLinkTestCaseTable();
}

// 切换选择
function toggleLinkTcSelect(id) {
    if (linkTcSelectedIds.has(id)) {
        linkTcSelectedIds.delete(id);
    } else {
        linkTcSelectedIds.add(id);
    }
    renderLinkTestCaseTable();
    updateLinkTcSelectedCount();
}

// 全选
function toggleLinkTcSelectAll() {
    const checkbox = document.getElementById('link-tc-select-all');
    if (checkbox?.checked) {
        linkTcFilteredCases.forEach(tc => linkTcSelectedIds.add(tc.id));
    } else {
        linkTcFilteredCases.forEach(tc => linkTcSelectedIds.delete(tc.id));
    }
    renderLinkTestCaseTable();
    updateLinkTcSelectedCount();
}

// 更新已选数量
function updateLinkTcSelectedCount() {
    const el = document.getElementById('link-tc-selected-count');
    if (el) el.textContent = linkTcSelectedIds.size;
}

// 确认关联
async function confirmLinkTestCases() {
    if (!linkTcContext) return;
    
    try {
        const resp = await authFetch(`${API_BASE}/test-cases/plan-game/${linkTcContext.planGameId}/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan_id: linkTcContext.planId,
                test_case_ids: Array.from(linkTcSelectedIds)
            })
        });
        const result = await resp.json();
        if (result.success) {
            showToast(`已关联 ${result.linked} 条用例`, 'success');
            closeModal('link-test-case-modal');
            // 刷新计划详情
            await loadPlanDetail(linkTcContext.planId);
            renderPlanDetailGames(linkTcContext.planIndex);
        } else {
            showToast('关联失败: ' + (result.error || ''), 'danger');
        }
    } catch (e) {
        showToast('关联失败，请重试', 'danger');
    }
}


// ==================== 执行测试用例（我的任务 Checklist） ====================
let execTcList = [];          // 当前任务关联的测试用例
let execTcContext = null;     // {taskId, taskIndex, gameName}
let execTcChanges = {};       // 变更记录 {ptcId: {status, remark}}

// 打开执行用例弹窗
async function openExecTestCaseModal(taskIndex) {
    const task = myTasksFiltered[taskIndex];
    if (!task) return;
    
    execTcContext = {
        taskId: task.id,
        taskIndex,
        gameName: task.game_name
    };
    execTcChanges = {};
    
    document.getElementById('exec-tc-modal-title').textContent = `执行测试用例 - ${task.game_name}`;
    
    // 加载关联的测试用例
    try {
        const resp = await authFetch(`${API_BASE}/my-tasks/${task.id}/test-cases`);
        const result = await resp.json();
        execTcList = result.data || [];
    } catch (e) {
        execTcList = [];
        showToast('加载测试用例失败', 'danger');
    }
    
    renderExecTestCaseTable();
    updateExecTcProgress();
    
    openModal('exec-test-case-modal');
}

// 渲染执行用例表格
function renderExecTestCaseTable() {
    const tbody = document.getElementById('exec-tc-table');
    if (!tbody) return;
    
    if (execTcList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-icon">📝</div><div>该任务暂未关联测试用例</div><div class="empty-sub">请在配置计划中为游戏关联测试用例</div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = execTcList.map((tc, i) => {
        const currentStatus = execTcChanges[tc.id]?.status ?? tc.status;
        const currentRemark = execTcChanges[tc.id]?.remark ?? tc.remark ?? '';
        const statusClass = currentStatus !== 'pending' ? `status-${currentStatus}` : '';
        
        return `
            <tr>
                <td class="text-center">${i + 1}</td>
                <td>${escapeHtml(tc.code || '-')}</td>
                <td class="text-left">
                    <strong>${escapeHtml(tc.name)}</strong>
                    ${tc.precondition ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">前置: ${escapeHtml(tc.precondition)}</div>` : ''}
                </td>
                <td><span class="tc-priority-tag ${sanitizeCssClass(tc.priority || 'medium')}">${getPriorityLabel(tc.priority)}</span></td>
                <td class="text-left"><span class="tc-cell-text">${escapeHtml(tcPlain(tc.steps) || '-')}</span></td>
                <td class="text-left"><span class="tc-cell-text">${escapeHtml(tc.expected_result || '-')}</span></td>
                <td>
                    <select class="exec-status-select ${statusClass}" data-ptc-id="${tc.id}" onchange="onExecStatusChange(${tc.id}, this)">
                        <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>⏳ 待执行</option>
                        <option value="pass" ${currentStatus === 'pass' ? 'selected' : ''}>✅ Pass</option>
                        <option value="fail" ${currentStatus === 'fail' ? 'selected' : ''}>❌ Fail</option>
                        <option value="block" ${currentStatus === 'block' ? 'selected' : ''}>⏸️ Block</option>
                    </select>
                </td>
                <td>
                    <input type="text" class="exec-remark-input" data-ptc-id="${tc.id}" value="${escapeHtml(currentRemark)}" 
                        placeholder="备注..." onchange="onExecRemarkChange(${tc.id}, this.value)">
                </td>
            </tr>
        `;
    }).join('');
}

// 执行状态变更
function onExecStatusChange(ptcId, selectEl) {
    const status = selectEl.value;
    if (!execTcChanges[ptcId]) execTcChanges[ptcId] = {};
    execTcChanges[ptcId].status = status;
    
    // 更新样式
    selectEl.className = 'exec-status-select ' + (status !== 'pending' ? `status-${status}` : '');
    
    updateExecTcProgress();
}

// 执行备注变更
function onExecRemarkChange(ptcId, remark) {
    if (!execTcChanges[ptcId]) execTcChanges[ptcId] = {};
    execTcChanges[ptcId].remark = remark;
}

// 更新执行进度
function updateExecTcProgress() {
    const total = execTcList.length;
    let pass = 0, fail = 0, block = 0, pending = 0;
    
    execTcList.forEach(tc => {
        const status = execTcChanges[tc.id]?.status ?? tc.status;
        if (status === 'pass') pass++;
        else if (status === 'fail') fail++;
        else if (status === 'block') block++;
        else pending++;
    });
    
    const executed = total - pending;
    const rate = total > 0 ? Math.round(executed / total * 100) : 0;
    
    document.getElementById('exec-tc-total').textContent = total;
    document.getElementById('exec-tc-pass').textContent = pass;
    document.getElementById('exec-tc-fail').textContent = fail;
    document.getElementById('exec-tc-block').textContent = block;
    document.getElementById('exec-tc-pending').textContent = pending;
    document.getElementById('exec-tc-rate').textContent = rate + '%';
}

// 保存执行结果
async function saveExecTestCases() {
    const updates = Object.keys(execTcChanges).map(ptcId => ({
        id: parseInt(ptcId),
        status: execTcChanges[ptcId].status,
        remark: execTcChanges[ptcId].remark || ''
    })).filter(u => u.status !== undefined);
    
    if (updates.length === 0) {
        showToast('没有需要保存的变更', 'info');
        return;
    }
    
    try {
        const resp = await authFetch(`${API_BASE}/test-cases/execution/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
        const result = await resp.json();
        if (result.success) {
            showToast(`已保存 ${result.updated} 条执行结果`, 'success');
            
            // 计算并自动更新任务进度
            await autoUpdateTaskProgress();
            
            closeModal('exec-test-case-modal');
            // 刷新我的任务
            await loadMyTasks();
        } else {
            showToast('保存失败: ' + (result.error || ''), 'danger');
        }
    } catch (e) {
        showToast('保存失败，请重试', 'danger');
    }
}

// 自动更新任务进度（基于用例执行情况）
async function autoUpdateTaskProgress() {
    if (!execTcContext) return;
    
    // 计算当前进度
    const total = execTcList.length;
    if (total === 0) return;
    
    let executed = 0;
    execTcList.forEach(tc => {
        const status = execTcChanges[tc.id]?.status ?? tc.status;
        if (status !== 'pending') executed++;
    });
    
    const progress = Math.round(executed / total * 100);
    
    // 自动更新任务的 adapt_progress
    try {
        await authFetch(`${API_BASE}/my-tasks/${execTcContext.taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adapt_progress: progress })
        });
    } catch (e) {
        console.error('自动更新进度失败:', e);
    }
}


// ==================== 通知提醒功能 ====================
let notificationsData = [];
let notificationsPanelOpen = false;
let _notifIntervalId = null;

// 初始化通知功能
function initNotifications() {
    loadUnreadCount();
    // 清除旧定时器（防止重复调用时累积）
    if (_notifIntervalId) clearInterval(_notifIntervalId);
    // 每 60 秒刷新一次未读数量
    _notifIntervalId = setInterval(loadUnreadCount, 60000);
}

// 获取未读通知数量
async function loadUnreadCount() {
    try {
        const response = await authFetch(`${API_BASE}/notifications/unread-count`);
        const result = await response.json();
        if (result.success) {
            updateNotificationBadge(result.count);
        }
    } catch (e) {
        console.error('获取通知数量失败:', e);
    }
}

// 更新通知徽章
function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// 打开/关闭通知面板
function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;
    
    if (notificationsPanelOpen) {
        closeNotificationPanel();
    } else {
        openNotificationPanel();
    }
}

// 打开通知面板
async function openNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;
    
    panel.style.display = 'flex';
    notificationsPanelOpen = true;
    
    // 加载通知列表
    await loadNotifications();
    
    // 点击外部关闭
    setTimeout(() => {
        document.addEventListener('click', handleNotificationOutsideClick);
    }, 100);
}

// 关闭通知面板
function closeNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (panel) {
        panel.style.display = 'none';
    }
    notificationsPanelOpen = false;
    document.removeEventListener('click', handleNotificationOutsideClick);
}

// 处理点击外部关闭
function handleNotificationOutsideClick(e) {
    const panel = document.getElementById('notification-panel');
    const btn = document.getElementById('notification-btn');
    if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
        closeNotificationPanel();
    }
}

// 加载通知列表
async function loadNotifications() {
    try {
        const response = await authFetch(`${API_BASE}/notifications?limit=30`);
        const result = await response.json();
        if (result.success) {
            notificationsData = result.data || [];
            renderNotificationList();
        }
    } catch (e) {
        console.error('加载通知失败:', e);
    }
}

// 渲染通知列表
function renderNotificationList() {
    const list = document.getElementById('notification-list');
    if (!list) return;
    
    if (notificationsData.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px; text-align: center;">
                <div class="empty-icon" style="font-size: 40px; margin-bottom: 10px;">🔔</div>
                <div style="color: var(--text-light);">暂无通知</div>
            </div>
        `;
        return;
    }
    
    list.innerHTML = notificationsData.map(n => {
        const icon = getNotificationIcon(n.type);
        const timeAgo = formatTimeAgo(n.created_at);
        const unreadClass = n.is_read ? '' : 'unread';
        
        return `
            <div class="notification-item ${unreadClass}" data-id="${n.id}" onclick="handleNotificationClick(${n.id}, '${n.related_type || ''}', ${n.related_id || 0})">
                <div class="notification-icon type-${n.type}">${icon}</div>
                <div class="notification-content">
                    <div class="notification-title">${escapeHtml(n.title)}</div>
                    <div class="notification-text">${escapeHtml(n.content || '')}</div>
                    <div class="notification-time">${timeAgo}</div>
                </div>
            </div>
        `;
    }).join('');
}

// 获取通知图标
function getNotificationIcon(type) {
    const icons = {
        'deadline_warning': '⏰',
        'deadline_today': '🚨',
        'bug_assigned': '🐛',
        'bug_high_priority': '⚠️',
        'plan_published': '📋',
        'task_assigned': '✅'
    };
    return icons[type] || '📢';
}

// 处理通知点击
async function handleNotificationClick(notificationId, relatedType, relatedId) {
    // 标记为已读
    try {
        await authFetch(`${API_BASE}/notifications/${notificationId}/read`, { method: 'PUT' });
        loadUnreadCount();
    } catch (e) {
        console.error('标记已读失败:', e);
    }
    
    // 跳转到相关页面
    if (relatedType === 'plan' && relatedId) {
        closeNotificationPanel();
        switchTab('config-plan');
    } else if (relatedType === 'bug' && relatedId) {
        closeNotificationPanel();
        switchTab('bugs');
    }
    
    // 更新 UI
    const item = document.querySelector(`.notification-item[data-id="${notificationId}"]`);
    if (item) {
        item.classList.remove('unread');
    }
}

// 全部标记已读
async function markAllNotificationsRead() {
    try {
        const response = await authFetch(`${API_BASE}/notifications/read-all`, { method: 'PUT' });
        const result = await response.json();
        if (result.success) {
            showToast(`已标记 ${result.updated} 条通知为已读`, 'success');
            loadUnreadCount();
            // 更新 UI
            document.querySelectorAll('.notification-item.unread').forEach(item => {
                item.classList.remove('unread');
            });
        }
    } catch (e) {
        showToast('操作失败', 'danger');
    }
}

// 初始化时调用
document.addEventListener('DOMContentLoaded', () => {
    // 延迟初始化通知功能
    setTimeout(initNotifications, 1000);
});


// ==================== 详情侧边面板 ====================
let currentDetailData = null;
let currentDetailType = null;

// 打开详情面板
function openDetailPanel(type, data) {
    currentDetailType = type;
    currentDetailData = data;
    
    const overlay = document.getElementById('detail-panel-overlay');
    const panel = document.getElementById('detail-panel');
    const titleEl = document.getElementById('detail-title');
    const iconEl = document.getElementById('detail-type-icon');
    const bodyEl = document.getElementById('detail-panel-body');
    const editBtn = document.getElementById('detail-edit-btn');
    const deleteBtn = document.getElementById('detail-delete-btn');
    
    // 设置标题和图标
    const config = getDetailConfig(type);
    iconEl.textContent = config.icon;
    titleEl.textContent = data[config.nameField] || config.defaultTitle;
    
    // 生成详情内容
    bodyEl.innerHTML = renderDetailContent(type, data);
    
    // 绑定按钮事件
    editBtn.onclick = () => {
        closeDetailPanel();
        config.editFn(data.id);
    };
    deleteBtn.onclick = () => {
        closeDetailPanel();
        config.deleteFn(data.id);
    };
    
    // 显示面板
    overlay.classList.add('show');
    panel.classList.add('show');
    
    // ESC 关闭
    document.addEventListener('keydown', handleDetailPanelEsc);
}

// 关闭详情面板
function closeDetailPanel() {
    const overlay = document.getElementById('detail-panel-overlay');
    const panel = document.getElementById('detail-panel');
    
    overlay.classList.remove('show');
    panel.classList.remove('show');
    
    document.removeEventListener('keydown', handleDetailPanelEsc);
    currentDetailData = null;
    currentDetailType = null;
}

// ESC 键处理
function handleDetailPanelEsc(e) {
    if (e.key === 'Escape') {
        closeDetailPanel();
    }
}

// 获取详情配置
function getDetailConfig(type) {
    const configs = {
        game: {
            icon: '🎮',
            nameField: 'name',
            defaultTitle: '游戏详情',
            editFn: editGame,
            deleteFn: deleteGame
        },
        device: {
            icon: '📱',
            nameField: 'name',
            defaultTitle: '设备详情',
            editFn: editDevice,
            deleteFn: deleteDevice
        },
        member: {
            icon: '👤',
            nameField: 'nickname',
            defaultTitle: '成员详情',
            editFn: editMember,
            deleteFn: deleteMember
        },
        bug: {
            icon: '🐛',
            nameField: 'title',
            defaultTitle: '缺陷详情',
            editFn: editBug,
            deleteFn: deleteBug
        },
        test: {
            icon: '🧪',
            nameField: 'name',
            defaultTitle: '测试详情',
            editFn: editTest,
            deleteFn: deleteTest
        }
    };
    return configs[type] || configs.game;
}

// 渲染详情内容
function renderDetailContent(type, data) {
    switch (type) {
        case 'game':
            return renderGameDetail(data);
        case 'device':
            return renderDeviceDetail(data);
        case 'member':
            return renderMemberDetail(data);
        case 'bug':
            return renderBugDetail(data);
        case 'test':
            return renderTestDetail(data);
        default:
            return '<div class="empty-state">暂无详情</div>';
    }
}

// 渲染游戏详情
function renderGameDetail(game) {
    const statusMap = {
        completed: { text: '已发布', class: 'status-online' },
        developing: { text: '开发中', class: 'status-in_progress' },
        undeveloped: { text: '未开始', class: 'status-pending' },
        anticheat: { text: '反外挂', class: 'status-paused' },
        not_applicable: { text: '不适用', class: '' }
    };
    const qualityMap = {
        high: { text: '高', class: 'priority-high' },
        normal: { text: '普通', class: 'priority-medium' },
        low: { text: '低', class: 'priority-low' }
    };
    
    const status = statusMap[game.online_status] || { text: game.online_status || '-', class: '' };
    const quality = qualityMap[game.quality] || { text: game.quality || '-', class: '' };
    
    return `
        <div class="detail-section">
            <div class="detail-section-title">基本信息</div>
            ${detailField('游戏名称', game.name)}
            ${detailField('英文名称', game.english_name)}
            ${detailField('游戏平台', game.platform)}
            ${detailField('游戏类型', game.game_type)}
            ${detailField('游戏ID', game.game_id)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">发行信息</div>
            ${detailField('开发商', game.developer)}
            ${detailField('运营商', game.operator)}
            ${detailField('上线日期', game.release_date)}
            ${detailField('版本', game.version)}
            ${detailField('包体大小', game.package_size)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">适配状态</div>
            ${detailField('适配状态', `<span class="status-badge ${status.class}">${status.text}</span>`, true)}
            ${detailField('品质', `<span class="priority-badge ${quality.class}">${quality.text}</span>`, true)}
            ${detailField('负责人', game.owner_name || '-')}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">其他信息</div>
            ${detailField('游戏账号', game.game_account)}
            ${detailField('存储位置', game.storage_location)}
            ${detailField('配置路径', game.config_path)}
            ${detailField('适配备注', game.adaptation_notes)}
        </div>
    `;
}

// 渲染设备详情
function renderDeviceDetail(device) {
    const statusMap = {
        available: { text: '可用', class: 'status-available' },
        in_use: { text: '使用中', class: 'status-in_progress' },
        maintenance: { text: '维护中', class: 'status-maintenance' },
        broken: { text: '已损坏', class: 'status-broken' }
    };
    const status = statusMap[device.status] || { text: device.status || '-', class: '' };
    
    return `
        <div class="detail-section">
            <div class="detail-section-title">设备信息</div>
            ${detailField('设备名称', device.name)}
            ${detailField('设备类型', device.device_type)}
            ${detailField('客户名称', device.manufacturer)}
            ${detailField('型号', device.model)}
            ${detailField('操作系统', device.os_version)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">状态信息</div>
            ${detailField('状态', `<span class="status-badge ${status.class}">${status.text}</span>`, true)}
            ${detailField('保管者', device.custodian_name || '-')}
            ${detailField('存放位置', device.location)}
            ${detailField('适配游戏数', device.adapted_games_count || 0)}
            ${detailField('适配完成率', device.adaptation_rate ? device.adaptation_rate + '%' : '-')}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">其他信息</div>
            ${detailField('设备序列号', device.serial_number)}
            ${detailField('分辨率', device.resolution)}
            ${detailField('购买日期', device.purchase_date)}
            ${detailField('备注', device.notes)}
        </div>
    `;
}

// 渲染成员详情
function renderMemberDetail(member) {
    const statusMap = {
        active: { text: '在职', class: 'status-active' },
        inactive: { text: '离职', class: 'status-inactive' }
    };
    const status = statusMap[member.status] || { text: member.status || '-', class: '' };
    
    return `
        <div class="detail-section">
            <div class="detail-section-title">基本信息</div>
            ${detailField('姓名', member.nickname || member.name)}
            ${detailField('用户名', member.username)}
            ${detailField('企业微信ID', member.wechat_id)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">角色与职责</div>
            ${detailField('项目角色', member.project_role)}
            ${detailField('职责', member.duty)}
            ${detailField('状态', `<span class="status-badge ${status.class}">${status.text}</span>`, true)}
        </div>
    `;
}

// 渲染缺陷详情
function renderBugDetail(bug) {
    const statusMap = {
        open: { text: '待处理', class: 'status-open' },
        in_progress: { text: '处理中', class: 'status-in_progress' },
        resolved: { text: '已解决', class: 'status-completed' },
        closed: { text: '已关闭', class: 'status-completed' }
    };
    const priorityMap = {
        urgent: { text: '紧急', class: 'priority-urgent' },
        high: { text: '高', class: 'priority-high' },
        medium: { text: '中', class: 'priority-medium' },
        low: { text: '低', class: 'priority-low' }
    };
    const severityMap = {
        fatal: { text: '致命', class: 'severity-fatal' },
        serious: { text: '严重', class: 'severity-serious' },
        normal: { text: '一般', class: 'severity-normal' },
        prompt: { text: '提示', class: 'severity-prompt' },
        advice: { text: '建议', class: 'severity-advice' }
    };
    
    const status = statusMap[bug.status] || { text: bug.status || '-', class: '' };
    const priority = priorityMap[bug.priority] || { text: bug.priority || '-', class: '' };
    const severity = severityMap[bug.severity] || { text: bug.severity || '-', class: '' };
    
    return `
        <div class="detail-section">
            <div class="detail-section-title">缺陷信息</div>
            ${detailField('标题', bug.title)}
            ${detailField('关联游戏', bug.game_name || '-')}
            ${detailField('关联客户', bug.device_name || '-')}
            ${detailField('涉及版本', bug.affected_version)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">状态与优先级</div>
            ${detailField('状态', `<span class="status-badge ${status.class}">${status.text}</span>`, true)}
            ${detailField('优先级', `<span class="priority-badge ${priority.class}">${priority.text}</span>`, true)}
            ${detailField('严重程度', `<span class="severity-badge ${severity.class}">${severity.text}</span>`, true)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">人员与时间</div>
            ${detailField('发现人', bug.reporter_name || '-')}
            ${detailField('负责人', bug.assignee_name || '-')}
            ${detailField('发现时间', bug.found_date)}
            ${detailField('解决时间', bug.resolved_date)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">详细描述</div>
            <div class="detail-field-value" style="padding:10px;background:var(--bg-surface);border-radius:var(--radius-sm);white-space:pre-wrap;font-size:13px;">${escapeHtml(bug.description || '暂无描述')}</div>
        </div>
    `;
}

// 渲染测试详情
function renderTestDetail(test) {
    const statusMap = {
        pending: { text: '待测试', class: 'status-pending' },
        in_progress: { text: '测试中', class: 'status-in_progress' },
        completed: { text: '已完成', class: 'status-completed' },
        failed: { text: '失败', class: 'status-failed' }
    };
    const priorityMap = {
        urgent: { text: '紧急', class: 'priority-urgent' },
        high: { text: '高', class: 'priority-high' },
        medium: { text: '中', class: 'priority-medium' },
        low: { text: '低', class: 'priority-low' }
    };
    
    const status = statusMap[test.status] || { text: test.status || '-', class: '' };
    const priority = priorityMap[test.priority] || { text: test.priority || '-', class: '' };
    
    return `
        <div class="detail-section">
            <div class="detail-section-title">测试信息</div>
            ${detailField('测试名称', test.name)}
            ${detailField('关联游戏', test.game_name || '-')}
            ${detailField('测试设备', test.device_name || '-')}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">状态与结果</div>
            ${detailField('状态', `<span class="status-badge ${status.class}">${status.text}</span>`, true)}
            ${detailField('优先级', `<span class="priority-badge ${priority.class}">${priority.text}</span>`, true)}
            ${detailField('测试结果', test.result || '-')}
            ${detailField('发现缺陷数', test.bugs_count || 0)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">执行信息</div>
            ${detailField('测试人员', test.tester_name || '-')}
            ${detailField('测试日期', test.test_date)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">测试描述</div>
            <div class="detail-field-value" style="padding:10px;background:var(--bg-surface);border-radius:var(--radius-sm);white-space:pre-wrap;font-size:13px;">${escapeHtml(test.description || '暂无描述')}</div>
        </div>
    `;
}

// 详情字段辅助函数（isHtml=true 时保留原始 HTML，否则自动转义防 XSS）
function detailField(label, value, isHtml = false) {
    const isEmpty = !value || value === '-' || value === 'undefined' || value === 'null';
    const displayValue = isEmpty ? '-' : (isHtml ? value : escapeHtml(String(value)));
    return `
        <div class="detail-field">
            <span class="detail-field-label">${escapeHtml(label)}</span>
            <span class="detail-field-value${isEmpty ? ' empty' : ''}">${displayValue}</span>
        </div>
    `;
}

// 为游戏表格行添加点击事件
function enableGameRowClick() {
    const tbody = document.getElementById('games-table');
    if (!tbody) return;
    
    tbody.addEventListener('click', (e) => {
        // 如果点击的是按钮、链接、输入框或可编辑单元格，不处理
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('select')) {
            return;
        }
        // 如果点击的是可编辑单元格，不处理（让原有的编辑逻辑生效）
        if (e.target.classList.contains('editable-cell')) {
            return;
        }
        
        const row = e.target.closest('tr');
        if (!row || !row.classList.contains('clickable')) return;
        
        const gameId = row.dataset.id;
        if (!gameId) return;
        
        // 从已加载的数据中找到对应的游戏
        const game = allGamesData.find(g => g.id == gameId);
        if (game) {
            openDetailPanel('game', game);
        }
    });
}

// 为设备表格行添加点击事件
function enableDeviceRowClick() {
    const tbody = document.getElementById('devices-table');
    if (!tbody) return;
    
    tbody.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('select')) {
            return;
        }
        // 如果点击的是可编辑单元格，不处理
        if (e.target.classList.contains('editable-cell')) {
            return;
        }
        
        const row = e.target.closest('tr');
        if (!row || !row.classList.contains('clickable')) return;
        
        const deviceId = row.dataset.id;
        if (!deviceId) return;
        
        // 从已加载的数据中找到对应的设备
        const device = allDevicesData.find(d => d.id == deviceId);
        if (device) {
            openDetailPanel('device', device);
        }
    });
}

// 在页面初始化时启用行点击
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        enableGameRowClick();
        enableDeviceRowClick();
    }, 500);
});

