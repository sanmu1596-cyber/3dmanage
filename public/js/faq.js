/**
 * FAQ 知识库前端逻辑 (P2-1)
 * 依赖：core.js (authFetch/API_BASE/showToast/showConfirm/escapeHtml), entities.js (openModal/closeModal)
 */
var allFaqData = [];           // 全量数据缓存
var faqActiveCategory = '';    // 当前选中分类（''=全部）

// 入口：加载 FAQ 列表 + 分类
async function loadFaq() {
    try {
        const resp = await authFetch(`${API_BASE}/faq`);
        const result = await resp.json();
        allFaqData = (result && result.data) || [];
        renderFaqCategories();
        renderFaqCards();
    } catch (e) {
        console.error('加载FAQ失败:', e);
        if (typeof showToast === 'function') showToast('加载知识库失败', 'error');
    }
}

// 渲染左侧分类导航
function renderFaqCategories() {
    const box = document.getElementById('faq-categories');
    if (!box) return;
    const counts = {};
    allFaqData.forEach(f => {
        const c = f.category || '未分类';
        counts[c] = (counts[c] || 0) + 1;
    });
    const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    let html = `<div class="faq-cat-item ${faqActiveCategory === '' ? 'active' : ''}" onclick="selectFaqCategory('')">
                    <span>全部</span><span class="faq-cat-count">${allFaqData.length}</span>
                </div>`;
    cats.forEach(c => {
        html += `<div class="faq-cat-item ${faqActiveCategory === c ? 'active' : ''}" onclick="selectFaqCategory('${faqEsc(c)}')">
                    <span>${escapeHtml(c)}</span><span class="faq-cat-count">${counts[c]}</span>
                 </div>`;
    });
    box.innerHTML = html;

    // 同步填充弹窗分类 datalist
    const dl = document.getElementById('faq-category-options');
    if (dl) dl.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');
}

function selectFaqCategory(cat) {
    faqActiveCategory = cat;
    renderFaqCategories();
    renderFaqCards();
}

// 渲染卡片（根据分类 + 搜索词过滤）
function renderFaqCards() {
    const wrap = document.getElementById('faq-cards');
    const empty = document.getElementById('faq-empty');
    if (!wrap) return;
    const kw = (document.getElementById('faq-search') || {}).value || '';
    const kwLower = kw.trim().toLowerCase();

    let list = allFaqData.slice();
    if (faqActiveCategory) list = list.filter(f => (f.category || '未分类') === faqActiveCategory);
    if (kwLower) {
        list = list.filter(f =>
            (f.question || '').toLowerCase().includes(kwLower) ||
            (f.answer || '').toLowerCase().includes(kwLower) ||
            (f.keywords || '').toLowerCase().includes(kwLower)
        );
    }
    // 置顶优先，其次浏览量
    list.sort((a, b) => (b.is_pinned - a.is_pinned) || (b.view_count - a.view_count));

    if (!list.length) {
        wrap.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    wrap.innerHTML = list.map(f => {
        const ans = escapeHtml(f.answer || '');
        const q = kwLower ? hlText(f.question || '', kw) : escapeHtml(f.question || '');
        const a = kwLower ? hlText(f.answer || '', kw) : ans;
        const needClamp = (f.answer || '').length > 80 || (f.answer || '').split('\n').length > 3;
        return `
        <div class="faq-card ${f.is_pinned ? 'pinned' : ''}">
            <div class="faq-card-head">
                <span class="faq-card-cat">${escapeHtml(f.category || '未分类')}</span>
                ${f.is_pinned ? '<span class="faq-pin-mark" title="置顶">📌</span>' : ''}
            </div>
            <div class="faq-card-q">${q}</div>
            <div class="faq-card-a ${needClamp ? 'clamp' : ''}" id="faq-ans-${f.id}">${a}</div>
            ${needClamp ? `<span class="faq-card-toggle" onclick="toggleFaqAnswer(${f.id}, this)">展开全文 ▾</span>` : ''}
            <div class="faq-card-foot">
                <div class="faq-card-meta">
                    <span>👁 ${f.view_count || 0}</span>
                    ${f.author ? `<span>✍ ${escapeHtml(f.author)}</span>` : ''}
                </div>
                <div class="faq-card-actions">
                    <button class="faq-act-btn pin" onclick="togglePinFaq(${f.id})">${f.is_pinned ? '取消置顶' : '置顶'}</button>
                    <button class="faq-act-btn" onclick="editFaq(${f.id})">编辑</button>
                    <button class="faq-act-btn danger" onclick="deleteFaq(${f.id})">删除</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// 搜索框输入
function filterFaq() {
    renderFaqCards();
}

// 展开/收起答案
function toggleFaqAnswer(id, el) {
    const ans = document.getElementById('faq-ans-' + id);
    if (!ans) return;
    const expanded = ans.classList.toggle('expanded');
    el.textContent = expanded ? '收起 ▴' : '展开全文 ▾';
    // 命中浏览：展开时静默+1浏览量
    if (expanded) {
        authFetch(`${API_BASE}/faq/${id}`).catch(() => {});
        const item = allFaqData.find(f => f.id === id);
        if (item) item.view_count = (item.view_count || 0) + 1;
    }
}

// 打开新增弹窗
function openFaqModal() {
    const f = document.getElementById('faq-form');
    if (f) f.reset();
    document.getElementById('faq-id').value = '';
    document.getElementById('faq-modal-title').textContent = '新增知识';
    // 若当前选中了某分类，默认带入
    if (faqActiveCategory) document.getElementById('faq-category').value = faqActiveCategory;
    openModal('faq-modal');
}

// 编辑
function editFaq(id) {
    const f = allFaqData.find(x => x.id === id);
    if (!f) return;
    document.getElementById('faq-id').value = f.id;
    document.getElementById('faq-category').value = f.category || '';
    document.getElementById('faq-question').value = f.question || '';
    document.getElementById('faq-answer').value = f.answer || '';
    document.getElementById('faq-keywords').value = f.keywords || '';
    document.getElementById('faq-pinned').checked = !!f.is_pinned;
    document.getElementById('faq-modal-title').textContent = '编辑知识';
    openModal('faq-modal');
}

// 提交表单（新增/编辑）
async function submitFaqForm(event) {
    if (event) event.preventDefault();
    const id = document.getElementById('faq-id').value;
    const payload = {
        category: document.getElementById('faq-category').value.trim() || '未分类',
        question: document.getElementById('faq-question').value.trim(),
        answer: document.getElementById('faq-answer').value.trim(),
        keywords: document.getElementById('faq-keywords').value.trim(),
        is_pinned: document.getElementById('faq-pinned').checked ? 1 : 0
    };
    if (!payload.question || !payload.answer) {
        if (typeof showToast === 'function') showToast('问题和解决方案为必填项', 'warning');
        return;
    }
    try {
        const url = id ? `${API_BASE}/faq/${id}` : `${API_BASE}/faq`;
        const method = id ? 'PUT' : 'POST';
        const resp = await authFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await resp.json();
        if (!result.success) throw new Error(result.error || '保存失败');
        if (typeof showToast === 'function') showToast(id ? '已更新' : '已新增', 'success');
        closeModal('faq-modal');
        await loadFaq();
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast('保存失败：' + e.message, 'error');
    }
}
// 兼容按钮 onclick="saveFaq()"
function saveFaq() { submitFaqForm(); }

// 切换置顶
async function togglePinFaq(id) {
    try {
        const resp = await authFetch(`${API_BASE}/faq/${id}/pin`, { method: 'PATCH' });
        const result = await resp.json();
        if (!result.success) throw new Error(result.error || '操作失败');
        await loadFaq();
    } catch (e) {
        if (typeof showToast === 'function') showToast('操作失败：' + e.message, 'error');
    }
}

// 删除
async function deleteFaq(id) {
    const ok = await showConfirm('确定删除这条知识吗？删除后不可恢复。', '删除确认');
    if (!ok) return;
    try {
        const resp = await authFetch(`${API_BASE}/faq/${id}`, { method: 'DELETE' });
        const result = await resp.json();
        if (!result.success) throw new Error(result.error || '删除失败');
        if (typeof showToast === 'function') showToast('已删除', 'success');
        await loadFaq();
    } catch (e) {
        if (typeof showToast === 'function') showToast('删除失败：' + e.message, 'error');
    }
}

// 高亮搜索词（先转义，再替换）
function hlText(text, kw) {
    const safe = escapeHtml(String(text || ''));
    if (!kw) return safe;
    const safeKw = escapeHtml(kw.trim());
    if (!safeKw) return safe;
    try {
        const re = new RegExp('(' + safeKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return safe.replace(re, '<mark class="faq-hl">$1</mark>');
    } catch (e) { return safe; }
}

// 用于 onclick 单引号属性的转义
function faqEsc(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
