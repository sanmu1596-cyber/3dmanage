/**
 * requirements.js — 需求与任务模块
 * 职责：需求CRUD(列表/卡片)、需求详情、我的任务(二级视图:计划→任务)
 * 依赖：core.js, auth.js, router.js, entities.js（authFetch, showToast, switchTab等）
 */
var App = window.App;

// ==================== 需求管理模块 ====================
let requirementsData = [];
let reqViewMode = 'list'; // 'list' or 'card'

// 统一状态字典（P1-3：含审批闭环态）
// draft 草稿 → published 已发布 → in_progress 进行中 → pending_review 待审批 → approved 通过 / rejected 驳回(可重做) → closed 已完成
var REQ_STATUS_MAP = {
    draft: '📝 草稿',
    published: '✅ 已发布',
    assigned: '📌 已指派',
    in_progress: '🔄 进行中',
    pending_review: '⏳ 待审批',
    approved: '✔️ 已通过',
    rejected: '❌ 已驳回',
    completed: '🏁 已完成',
    closed: '🏁 已完成',
    cancelled: '🚫 已取消'
};
function reqStatusLabel(s) { return REQ_STATUS_MAP[s] || s; }

// 当前用户是否有审批权限（管理员/乔老师）。开发模式下 currentUser 通常为超级管理员。
function canApproveReq() {
    try {
        var u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : (window.currentUser || null);
        if (!u) return true; // 开发模式无用户对象时默认放行，后端仍会二次校验
        if (u.role_id === 1 || u.is_admin || u.role === 'admin') return true;
        if (u.real_name === '乔老师' || u.name === '乔老师') return true;
        // 权限位（若后端下发 permissions）
        if (u.permissions && u.permissions.requirements && u.permissions.requirements.edit) return true;
        return false;
    } catch (e) { return true; }
}

// 根据需求状态生成流转操作按钮 HTML（紧凑型，用于列表/卡片）
// style: 'table' | 'card' | 'detail'
function reqFlowButtons(r, style) {
    var id = r.id;
    var btns = [];
    var canApprove = canApproveReq();
    if (style === 'card') {
        if (r.status === 'draft') btns.push(`<button class="plan-card-action-btn btn-publish" onclick="event.stopPropagation(); publishRequirement(${id})">🚀 发布</button>`);
        if (['published','assigned','in_progress','rejected'].indexOf(r.status) >= 0)
            btns.push(`<button class="plan-card-action-btn" style="background:#e6f0ff;color:#2563eb;" onclick="event.stopPropagation(); submitReviewReq(${id})">📤 提交审批</button>`);
        if (r.status === 'pending_review' && canApprove) {
            btns.push(`<button class="plan-card-action-btn" style="background:#e7f7ec;color:#2f855a;" onclick="event.stopPropagation(); approveReq(${id})">✔️ 通过</button>`);
            btns.push(`<button class="plan-card-action-btn" style="background:#fdecec;color:#c53030;" onclick="event.stopPropagation(); rejectReq(${id})">❌ 驳回</button>`);
        }
    } else if (style === 'detail') {
        if (r.status === 'draft') btns.push(`<button class="tool-btn tool-btn-primary" onclick="publishRequirement(${id})">🚀 发布</button>`);
        if (['published','assigned','in_progress','rejected'].indexOf(r.status) >= 0)
            btns.push(`<button class="tool-btn" style="background:#2563eb;color:#fff;" onclick="submitReviewReq(${id})">📤 提交审批</button>`);
        if (r.status === 'pending_review' && canApprove) {
            btns.push(`<button class="tool-btn" style="background:var(--success);color:#fff;" onclick="approveReq(${id})">✔️ 审批通过</button>`);
            btns.push(`<button class="tool-btn" style="background:var(--danger,#e53e3e);color:#fff;" onclick="rejectReq(${id})">❌ 驳回</button>`);
        }
        if (['approved','published','assigned','in_progress'].indexOf(r.status) >= 0)
            btns.push(`<button class="tool-btn" style="background:var(--success);color:#fff;" onclick="closeRequirement(${id})">🏁 完成</button>`);
    } else { // table
        if (r.status === 'draft') btns.push(`<button class="btn btn-small" style="background:var(--primary);color:#fff;" onclick="publishRequirement(${id})">发布</button>`);
        if (['published','assigned','in_progress','rejected'].indexOf(r.status) >= 0)
            btns.push(`<button class="btn btn-small" style="background:#2563eb;color:#fff;" onclick="submitReviewReq(${id})">提交审批</button>`);
        if (r.status === 'pending_review' && canApprove) {
            btns.push(`<button class="btn btn-small" style="background:#2f855a;color:#fff;" onclick="approveReq(${id})">通过</button>`);
            btns.push(`<button class="btn btn-small" style="background:#c53030;color:#fff;" onclick="rejectReq(${id})">驳回</button>`);
        }
    }
    return btns.join('');
}

// 加载需求列表
async function loadRequirements() {
    try {
        const resp = await authFetch(`${API_BASE}/requirements`);
        const result = await resp.json();
        requirementsData = result.success ? (result.data || []) : [];
        renderRequirements();
    } catch (e) {
        console.error('加载需求失败:', e);
        requirementsData = [];
    }
}

// 筛选需求
function filterRequirements() {
    renderRequirements();
}

// 视图切换
function toggleReqView(mode) {
    reqViewMode = mode;
    document.querySelectorAll('#req-view-toggle .view-toggle-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`#req-view-toggle .view-toggle-btn[data-view="${mode}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    renderRequirements();
}

// 渲染需求（列表 + 卡片双模式）
function renderRequirements() {
    const statusFilter = document.getElementById('req-status-filter')?.value || '';
    const priorityFilter = document.getElementById('req-priority-filter')?.value || '';
    const summaryBar = document.getElementById('req-summary-bar');

    let filtered = requirementsData;
    if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);
    if (priorityFilter) filtered = filtered.filter(r => r.priority === priorityFilter);

    // 汇总
    const totalCount = requirementsData.length;
    const draftCount = requirementsData.filter(r => r.status === 'draft').length;
    const publishedCount = requirementsData.filter(r => r.status === 'published').length;
    const reviewCount = requirementsData.filter(r => r.status === 'pending_review').length;
    const closedCount = requirementsData.filter(r => r.status === 'closed' || r.status === 'completed').length;
    if (summaryBar) {
        summaryBar.innerHTML = `
            <span class="summary-item">共 <strong>${totalCount}</strong></span>
            <span class="summary-item">草稿 <strong>${draftCount}</strong></span>
            <span class="summary-item">已发布 <strong>${publishedCount}</strong></span>
            <span class="summary-item" style="${reviewCount > 0 ? 'color:#d69e2e;font-weight:600;' : ''}">待审批 <strong>${reviewCount}</strong></span>
            <span class="summary-item">已完成 <strong>${closedCount}</strong></span>
        `;
    }

    const tableContainer = document.getElementById('req-table-container');
    const cardsContainer = document.getElementById('req-cards-container');

    if (reqViewMode === 'list') {
        tableContainer.style.display = '';
        cardsContainer.style.display = 'none';
        renderReqTable(filtered);
    } else {
        tableContainer.style.display = 'none';
        cardsContainer.style.display = '';
        renderReqCards(filtered);
    }
}

// 列表渲染
function renderReqTable(filtered) {
    const tbody = document.getElementById('req-table');
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="11" class="empty-state"><div class="empty-icon">📄</div><div class="empty-text">${requirementsData.length === 0 ? '暂无需求' : '没有符合筛选条件的需求'}</div><div class="empty-sub">${requirementsData.length === 0 ? '点击"发布需求"创建第一条需求记录' : '请调整筛选条件后重试'}</div></td></tr>`;
        return;
    }
    tbody.innerHTML = filtered.map((r, i) => {
        const priorityBadge = { high: '🔴 高', medium: '🟡 中', low: '🟢 低' }[r.priority] || r.priority;
        const statusLabel = reqStatusLabel(r.status);
        const totalGames = r.total_games || 0;
        const finishedGames = r.finished_games || 0;
        const progress = totalGames > 0 ? Math.round(finishedGames / totalGames * 100) : 0;
        return `<tr>
            <td class="text-center"><strong>${i + 1}</strong></td>
            <td><span style="color:var(--text-muted);font-size:12px;">${escapeHtml(r.req_no || '')}</span></td>
            <td class="text-left"><a href="javascript:void(0)" onclick="openReqDetail(${r.id})" style="color:var(--primary);font-weight:500;">${escapeHtml(r.title)}</a></td>
            <td>${priorityBadge}</td>
            <td>${escapeHtml(r.assigned_name || '-')}</td>
            <td>${statusLabel}</td>
            <td>${r.deadline || '-'}</td>
            <td class="text-center">${r.plan_count || 0}</td>
            <td>
                <div class="plan-card-progress" style="margin:0;">
                    <div class="plan-card-progress-bar"><div class="plan-card-progress-fill" style="width:${progress}%"></div></div>
                    <span class="plan-card-pct" style="font-size:11px;">${progress}%</span>
                </div>
            </td>
            <td style="font-size:12px;color:var(--text-muted);">${(r.created_at || '').slice(0, 10)}</td>
            <td>
                <button class="btn btn-small btn-edit" onclick="editRequirement(${r.id})">编辑</button>
                ${reqFlowButtons(r, 'table')}
                <button class="btn btn-small btn-delete" onclick="deleteRequirement(${r.id})">删除</button>
            </td>
        </tr>`;
    }).join('');
    applyCellTooltips('req-table');
}

// 卡片渲染
function renderReqCards(filtered) {
    const container = document.getElementById('req-cards-container');
    if (!filtered.length) {
        container.innerHTML = `<div class="empty-state-full"><div class="empty-icon">📄</div><div>${requirementsData.length === 0 ? '暂无需求' : '没有符合筛选条件的需求'}</div></div>`;
        return;
    }
    container.innerHTML = filtered.map(r => {
        const priorityColor = { high: '#e53e3e', medium: '#d69e2e', low: '#38a169' }[r.priority] || '#718096';
        const totalGames = r.total_games || 0;
        const finishedGames = r.finished_games || 0;
        const progress = totalGames > 0 ? Math.round(finishedGames / totalGames * 100) : 0;
        return `
        <div class="plan-card status-${r.status}" onclick="openReqDetail(${r.id})" style="cursor:pointer;">
            <div class="plan-card-top">
                <div class="plan-card-title-row">
                    <span class="plan-card-status status-${r.status}">${reqStatusLabel(r.status)}</span>
                    <span class="plan-card-title">${escapeHtml(r.title)}</span>
                    <span class="plan-card-no">${escapeHtml(r.req_no || '')}</span>
                </div>
            </div>
            <div class="plan-card-meta">
                <span class="plan-card-meta-item"><span class="meta-icon" style="color:${priorityColor}">●</span>${{high:'高优先级',medium:'中优先级',low:'低优先级'}[r.priority] || r.priority}</span>
                ${r.assigned_name ? `<span class="plan-card-meta-item"><span class="meta-icon">👤</span>${escapeHtml(r.assigned_name)}</span>` : ''}
                ${r.deadline ? `<span class="plan-card-meta-item"><span class="meta-icon">📅</span>${r.deadline}</span>` : ''}
                <span class="plan-card-meta-item"><span class="meta-icon">📋</span>${r.plan_count || 0} 个计划</span>
            </div>
            ${r.description ? `<div style="font-size:12px;color:var(--text-secondary);margin:6px 0;line-height:1.5;overflow:hidden;max-height:36px;">${escapeHtml(r.description).slice(0, 80)}${r.description.length > 80 ? '...' : ''}</div>` : ''}
            <div class="plan-card-body">
                <div class="plan-card-progress">
                    <div class="plan-card-progress-bar"><div class="plan-card-progress-fill" style="width:${progress}%"></div></div>
                    <span class="plan-card-pct">${progress}%</span>
                </div>
            </div>
            <div class="plan-card-actions" onclick="event.stopPropagation()">
                <button class="plan-card-action-btn" onclick="event.stopPropagation(); editRequirement(${r.id})">✏️ 编辑</button>
                ${reqFlowButtons(r, 'card')}
                <button class="plan-card-action-btn btn-danger" onclick="event.stopPropagation(); deleteRequirement(${r.id})">🗑️ 删除</button>
            </div>
        </div>`;
    }).join('');
}

// 显示创建需求视图
function showReqCreateView() {
    document.getElementById('req-list-view').style.display = 'none';
    document.getElementById('req-detail-view').style.display = 'none';
    document.getElementById('req-create-view').style.display = '';
    document.getElementById('req-form-title').textContent = '新增需求';
    document.getElementById('req-edit-id').value = '';
    document.getElementById('req-title').value = '';
    document.getElementById('req-description').value = '';
    document.getElementById('req-priority').value = 'medium';
    document.getElementById('req-deadline').value = '';
    document.getElementById('req-assigned-to').value = '';
    // 填充项目经理下拉
    populateReqAssigneeSelect();
}

// 填充指派下拉（只显示项目经理角色的成员）
function populateReqAssigneeSelect() {
    const select = document.getElementById('req-assigned-to');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">不指定</option>';
    (allMembersData || []).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name + (m.role ? ` (${m.role})` : '');
        if (String(m.id) === String(current)) opt.selected = true;
        select.appendChild(opt);
    });
}

// 编辑需求
async function editRequirement(id) {
    try {
        const resp = await authFetch(`${API_BASE}/requirements/${id}`);
        const result = await resp.json();
        if (!result.success) return showToast('加载需求失败', 'danger');
        const r = result.data;
        document.getElementById('req-list-view').style.display = 'none';
        document.getElementById('req-detail-view').style.display = 'none';
        document.getElementById('req-create-view').style.display = '';
        document.getElementById('req-form-title').textContent = '编辑需求';
        document.getElementById('req-edit-id').value = r.id;
        document.getElementById('req-title').value = r.title || '';
        document.getElementById('req-description').value = r.description || '';
        document.getElementById('req-priority').value = r.priority || 'medium';
        document.getElementById('req-deadline').value = r.deadline || '';
        populateReqAssigneeSelect();
        document.getElementById('req-assigned-to').value = r.assigned_to || '';
    } catch (e) {
        showToast('加载需求失败', 'danger');
    }
}

// 提交需求（创建/更新）
async function submitRequirement(status) {
    const id = document.getElementById('req-edit-id').value;
    const title = document.getElementById('req-title').value.trim();
    if (!title) return showToast('请输入需求标题', 'warning');

    const data = {
        title,
        description: document.getElementById('req-description').value,
        priority: document.getElementById('req-priority').value,
        assigned_to: document.getElementById('req-assigned-to').value || null,
        deadline: document.getElementById('req-deadline').value || null,
        status
    };

    try {
        const url = id ? `${API_BASE}/requirements/${id}` : `${API_BASE}/requirements`;
        const method = id ? 'PUT' : 'POST';
        const resp = await authFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        if (result.success) {
            // 如果是新建且状态为published，还需要调发布接口
            if (!id && status === 'published' && result.id) {
                await authFetch(`${API_BASE}/requirements/${result.id}/publish`, { method: 'POST' });
            }
            showToast(id ? '需求已更新' : '需求已创建', 'success');
            backToReqList();
            await loadRequirements();
        } else {
            showToast('操作失败: ' + (result.error || ''), 'danger');
        }
    } catch (e) {
        showToast('操作失败: ' + e.message, 'danger');
    }
}

// 发布需求
async function publishRequirement(id) {
    showConfirm('确定发布此需求？发布后将通知指派的项目经理。', async () => {
        try {
            const resp = await authFetch(`${API_BASE}/requirements/${id}/publish`, { method: 'POST' });
            const result = await resp.json();
            if (result.success) {
                showToast('需求已发布', 'success');
                await loadRequirements();
            } else {
                showToast('发布失败: ' + (result.error || ''), 'danger');
            }
        } catch (e) {
            showToast('发布失败', 'danger');
        }
    });
}

// 删除需求
async function deleteRequirement(id) {
    showConfirm('确定要删除该需求吗？关联的配置计划将解除关联但不会被删除。', async () => {
        try {
            const resp = await authFetch(`${API_BASE}/requirements/${id}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('需求已删除', 'success');
                await loadRequirements();
            }
        } catch (e) {
            showToast('删除失败', 'danger');
        }
    });
}

// 打开需求详情
async function openReqDetail(id) {
    try {
        const resp = await authFetch(`${API_BASE}/requirements/${id}`);
        const result = await resp.json();
        if (!result.success) return showToast('加载需求详情失败', 'danger');
        const r = result.data;

        document.getElementById('req-list-view').style.display = 'none';
        document.getElementById('req-create-view').style.display = 'none';
        document.getElementById('req-detail-view').style.display = 'flex';

        // 标题
        document.getElementById('req-detail-title').innerHTML = `${escapeHtml(r.title)} <span style="font-size:12px;color:var(--text-light);font-weight:400;margin-left:8px;">${escapeHtml(r.req_no || '')}</span>`;

        // 操作按钮
        const actionsEl = document.getElementById('req-detail-actions');
        actionsEl.innerHTML = `
            <button class="tool-btn" onclick="editRequirement(${r.id})">✏️ 编辑</button>
            ${reqFlowButtons(r, 'detail')}
            <button class="tool-btn" onclick="createPlanFromReq(${r.id})">📋 创建配置计划</button>
            <button class="btn btn-small btn-delete" onclick="deleteRequirement(${r.id})">🗑️ 删除</button>
        `;

        // 信息条
        const priorityLabel = { high: '🔴 高', medium: '🟡 中', low: '🟢 低' }[r.priority] || r.priority;
        const infoEl = document.getElementById('req-detail-info');
        infoEl.innerHTML = `
            <span class="info-tag"><span class="tag-label">状态：</span>${reqStatusLabel(r.status)}</span>
            <span class="info-tag"><span class="tag-label">优先级：</span>${priorityLabel}</span>
            <span class="info-tag"><span class="tag-label">指派给：</span>${escapeHtml(r.assigned_name || '未指派')}</span>
            ${r.deadline ? `<span class="info-tag"><span class="tag-label">截止日期：</span>${r.deadline}</span>` : ''}
            <span class="info-tag"><span class="tag-label">创建者：</span>${escapeHtml(r.creator_name || '-')}</span>
            <span class="info-tag"><span class="tag-label">创建时间：</span>${(r.created_at || '').slice(0, 16)}</span>
            ${r.submitted_at ? `<span class="info-tag"><span class="tag-label">提交审批：</span>${(r.submitted_at || '').slice(0, 16)}</span>` : ''}
            ${r.approver_name ? `<span class="info-tag"><span class="tag-label">审批人：</span>${escapeHtml(r.approver_name)}</span>` : ''}
            ${r.approved_at ? `<span class="info-tag"><span class="tag-label">审批时间：</span>${(r.approved_at || '').slice(0, 16)}</span>` : ''}
            ${r.status === 'rejected' && r.reject_reason ? `<div style="margin-top:8px;padding:10px 14px;background:#fdecec;border:1px solid #f5c2c2;border-radius:6px;font-size:13px;line-height:1.6;color:#c53030;white-space:pre-wrap;"><strong>❌ 驳回理由：</strong>${escapeHtml(r.reject_reason)}</div>` : ''}
            ${r.description ? `<div style="margin-top:8px;padding:10px 14px;background:var(--bg-card);border-radius:6px;font-size:13px;line-height:1.6;color:var(--text-secondary);white-space:pre-wrap;">${escapeHtml(r.description)}</div>` : ''}
        `;

        // 关联的配置计划
        const plansBody = document.getElementById('req-plans-table');
        const plans = r.plans || [];
        if (plans.length === 0) {
            plansBody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-icon">📋</div><div>暂无关联的配置计划</div><div class="empty-sub">点击"创建配置计划"基于此需求创建</div></td></tr>`;
        } else {
            plansBody.innerHTML = plans.map((p, i) => {
                const statusLabel = { draft: '📝 草稿', published: '✅ 已发布', closed: '🏁 已完成' }[p.status] || p.status;
                const progress = p.game_count > 0 ? Math.round((p.finished_count || 0) / p.game_count * 100) : 0;
                return `<tr>
                    <td class="text-center">${i + 1}</td>
                    <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(p.plan_no || '')}</td>
                    <td><a href="javascript:void(0)" onclick="switchTab('config-plan'); setTimeout(()=>{ const idx = configPlans.findIndex(cp=>cp.id===${p.id}); if(idx>=0) openPlanDetail(idx); }, 500);" style="color:var(--primary);">${escapeHtml(p.title)}</a></td>
                    <td>${statusLabel}</td>
                    <td>${p.plan_date || '-'}</td>
                    <td class="text-center">${p.game_count || 0}</td>
                    <td>
                        <div class="plan-card-progress" style="margin:0;">
                            <div class="plan-card-progress-bar"><div class="plan-card-progress-fill" style="width:${progress}%"></div></div>
                            <span class="plan-card-pct" style="font-size:11px;">${progress}%</span>
                        </div>
                    </td>
                    <td><button class="btn btn-small btn-edit" onclick="switchTab('config-plan'); setTimeout(()=>{ const idx = configPlans.findIndex(cp=>cp.id===${p.id}); if(idx>=0) openPlanDetail(idx); }, 500);">查看</button></td>
                </tr>`;
            }).join('');
        }
    } catch (e) {
        showToast('加载失败', 'danger');
    }
}

// 关闭需求
async function closeRequirement(id) {
    showConfirm('确定要将该需求标记为已完成吗？', async () => {
        try {
            const resp = await authFetch(`${API_BASE}/requirements/${id}/close`, { method: 'POST' });
            const result = await resp.json();
            if (result.success) {
                showToast('需求已完成', 'success');
                backToReqList();
                await loadRequirements();
            }
        } catch (e) {
            showToast('操作失败', 'danger');
        }
    });
}

// ===== P1-3 流转操作：提交审批 / 通过 / 驳回 =====

// 通用：调用流转接口并刷新（同时刷新列表与当前详情视图）
async function _reqFlowCall(id, path, body, okMsg) {
    try {
        const resp = await authFetch(`${API_BASE}/requirements/${id}/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        const result = await resp.json();
        if (result.success) {
            showToast(okMsg, 'success');
            await loadRequirements();
            // 若详情视图正打开，刷新详情
            const detailView = document.getElementById('req-detail-view');
            if (detailView && detailView.style.display !== 'none') {
                openReqDetail(id);
            }
            return true;
        } else {
            showToast('操作失败: ' + (result.error || ''), 'danger');
            return false;
        }
    } catch (e) {
        showToast('操作失败: ' + e.message, 'danger');
        return false;
    }
}

// 提交审批
function submitReviewReq(id) {
    showConfirm('确定提交该需求审批？提交后将通知创建者（TPM）进行审批。', () => {
        _reqFlowCall(id, 'submit-review', null, '已提交审批');
    });
}

// 审批通过（仅管理员/乔老师，后端二次校验）
function approveReq(id) {
    showConfirm('确定审批通过该需求？', () => {
        _reqFlowCall(id, 'approve', null, '已审批通过');
    });
}

// 审批驳回（必填理由）—— 自建轻量模态框
function rejectReq(id) {
    // 移除可能残留的旧弹窗
    const old = document.getElementById('req-reject-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'req-reject-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:var(--bg-card,#fff);border-radius:10px;width:440px;max-width:92vw;box-shadow:0 12px 40px rgba(0,0,0,0.25);overflow:hidden;">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border,#eee);font-weight:600;font-size:15px;color:var(--text,#222);">❌ 驳回需求</div>
            <div style="padding:18px 20px;">
                <div style="font-size:13px;color:var(--text-secondary,#666);margin-bottom:8px;">请填写驳回理由（必填，将通知执行人重做）：</div>
                <textarea id="req-reject-reason" rows="4" maxlength="1000" placeholder="例如：测试覆盖不足，缺少XX机型的实测记录…"
                    style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:13px;line-height:1.5;resize:vertical;outline:none;"></textarea>
                <div id="req-reject-err" style="color:#c53030;font-size:12px;margin-top:6px;min-height:16px;"></div>
            </div>
            <div style="padding:12px 20px;border-top:1px solid var(--border,#eee);display:flex;justify-content:flex-end;gap:10px;">
                <button class="btn btn-small" onclick="document.getElementById('req-reject-modal').remove()">取消</button>
                <button class="btn btn-small" style="background:#c53030;color:#fff;" onclick="confirmRejectReq(${id})">确认驳回</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    setTimeout(() => { const ta = document.getElementById('req-reject-reason'); if (ta) ta.focus(); }, 50);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function confirmRejectReq(id) {
    const ta = document.getElementById('req-reject-reason');
    const errEl = document.getElementById('req-reject-err');
    const reason = (ta ? ta.value : '').trim();
    if (!reason) {
        if (errEl) errEl.textContent = '驳回理由不能为空';
        if (ta) ta.focus();
        return;
    }
    const ok = await _reqFlowCall(id, 'reject', { reject_reason: reason }, '已驳回，已通知执行人重做');
    if (ok) {
        const modal = document.getElementById('req-reject-modal');
        if (modal) modal.remove();
    }
}

// 基于需求创建配置计划（跳到配置计划创建页面，预填 requirement_id）
function createPlanFromReq(reqId) {
    // 存储当前需求ID，在创建计划时使用
    window._pendingReqId = reqId;
    switchTab('config-plan');
    setTimeout(() => {
        showCreatePlanView();
        // 标记来源
        const titleInput = document.getElementById('plan-title');
        if (titleInput && !titleInput.value) {
            const req = requirementsData.find(r => r.id === reqId);
            if (req) titleInput.value = req.title;
        }
    }, 300);
}

// 返回需求列表
function backToReqList() {
    document.getElementById('req-list-view').style.display = '';
    document.getElementById('req-detail-view').style.display = 'none';
    document.getElementById('req-create-view').style.display = 'none';
}


// ==================== 我的任务（二级结构：计划卡片 → 任务列表） ====================
let myTasksData = [];           // 所有任务（扁平）
let myTasksFiltered = [];       // 当前二级视图中筛选后的任务
let myTaskPlans = [];           // 按 plan_id 分组后的计划列表
let currentMyTaskPlanId = null; // 当前打开的计划ID

async function loadMyTasks() {
    try {
        const resp = await authFetch(`${API_BASE}/my-tasks`);
        const result = await resp.json();
        myTasksData = result.data || [];
    } catch (e) {
        console.error('加载我的任务失败:', e);
        myTasksData = [];
    }

    // 按 plan_id 分组，聚合统计
    const planMap = {};
    myTasksData.forEach(t => {
        const pid = t.plan_id;
        if (!planMap[pid]) {
            planMap[pid] = {
                planId: pid,
                planTitle: t.plan_title || '',
                planNo: t.plan_no || '',
                planDate: t.plan_date || '',
                planGoal: t.plan_goal || '',
                devicesJson: t.devices_json || [],
                interlaceVersion: t.interlace_version || '',
                clientVersion: t.client_version || '',
                tasks: []
            };
        }
        planMap[pid].tasks.push(t);
    });
    myTaskPlans = Object.values(planMap);

    // 更新汇总栏（显示在工具栏右侧）
    const summaryBar = document.getElementById('my-tasks-summary-bar');
    if (summaryBar) {
        const total = myTasksData.length;
        const notStarted = myTasksData.filter(t => t.adapt_status === 'not_started').length;
        const adapting = myTasksData.filter(t => t.adapt_status === 'adapting').length;
        const finished = myTasksData.filter(t => t.adapt_status === 'finished').length;
        summaryBar.innerHTML = `
            <span class="stat-item">共 <strong>${total}</strong> 项</span>
            <span class="stat-item">未开始 <strong>${notStarted}</strong></span>
            <span class="stat-item">适配中 <strong>${adapting}</strong></span>
            <span class="stat-item">已结束 <strong>${finished}</strong></span>
        `;
    }

    // 如果当前在二级视图且计划仍存在，刷新二级
    if (currentMyTaskPlanId) {
        const stillExists = myTaskPlans.find(p => p.planId === currentMyTaskPlanId);
        if (stillExists) {
            renderMyTaskDetail(currentMyTaskPlanId);
            return;
        }
    }

    // 默认显示一级：计划卡片
    currentMyTaskPlanId = null;
    renderMyTaskPlanCards();
}

// 一级状态筛选（工具栏下拉）
function filterMyTasks() {
    const statusFilter = document.getElementById('my-tasks-status-filter').value;

    if (currentMyTaskPlanId) {
        // 在二级视图：筛选当前计划的任务
        const plan = myTaskPlans.find(p => p.planId === currentMyTaskPlanId);
        if (plan) {
            myTasksFiltered = statusFilter 
                ? plan.tasks.filter(t => t.adapt_status === statusFilter) 
                : [...plan.tasks];
        }
        renderMyTasksTable();
    } else {
        // 在一级视图：筛选卡片（按状态过滤有对应状态任务的计划）
        renderMyTaskPlanCards();
    }
}

// 我的任务视图模式切换
let myTaskViewMode = 'card'; // 'card' or 'list'

function toggleMyTaskView(mode) {
    myTaskViewMode = mode;
    document.querySelectorAll('#mytask-view-toggle .view-toggle-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`#mytask-view-toggle .view-toggle-btn[data-view="${mode}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    renderMyTaskPlanCards();
}

// 我的任务 - 列表渲染
function renderMyTaskPlanListTable(filteredPlans) {
    const tbody = document.getElementById('my-tasks-plan-list-table');
    if (!filteredPlans.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-icon">📌</div><div class="empty-text">暂无任务</div><div class="empty-sub">项目经理发布计划后，您的任务将显示在这里</div></td></tr>`;
        return;
    }
    tbody.innerHTML = filteredPlans.map((plan, i) => {
        const total = plan.tasks.length;
        const finished = plan.tasks.filter(t => t.adapt_status === 'finished').length;
        const avgProgress = total > 0 ? Math.round(plan.tasks.reduce((s, t) => s + (t.adapt_progress || 0), 0) / total) : 0;
        return `<tr>
            <td class="text-center"><strong>${i + 1}</strong></td>
            <td><a href="javascript:void(0)" onclick="openMyTaskPlan(${plan.planId})" style="color:var(--primary);font-weight:500;">${escapeHtml(plan.planTitle)}</a></td>
            <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(plan.planNo)}</td>
            <td>${plan.planDate || '-'}</td>
            <td class="text-center">${total} (✅${finished})</td>
            <td>
                <div class="plan-card-progress" style="margin:0;">
                    <div class="plan-card-progress-bar"><div class="plan-card-progress-fill" style="width:${avgProgress}%"></div></div>
                    <span class="plan-card-pct" style="font-size:11px;">${avgProgress}%</span>
                </div>
            </td>
            <td><button class="btn btn-small btn-edit" onclick="openMyTaskPlan(${plan.planId})">查看</button></td>
        </tr>`;
    }).join('');
}

// ========== 一级视图：计划卡片 ==========
function renderMyTaskPlanCards() {
    const container = document.getElementById('my-tasks-plan-cards');
    const tableContainer = document.getElementById('my-tasks-plan-table');
    const detailView = document.getElementById('my-tasks-detail-view');

    // 确保隐藏二级
    detailView.style.display = 'none';

    if (myTaskPlans.length === 0) {
        container.style.display = '';
        if (tableContainer) tableContainer.style.display = 'none';
        container.innerHTML = `<div class="empty-state-full"><div class="empty-icon">📌</div><div>暂无分配给您的任务</div><div class="empty-sub">项目经理发布计划后，您的任务将显示在这里</div></div>`;
        return;
    }

    // 如果有状态筛选，只显示包含该状态任务的计划
    const statusFilter = document.getElementById('my-tasks-status-filter').value;
    let filteredPlans = myTaskPlans;
    if (statusFilter) {
        filteredPlans = myTaskPlans.filter(p => p.tasks.some(t => t.adapt_status === statusFilter));
    }

    // 排序：从新到旧（按计划日期降序）
    filteredPlans.sort((a, b) => {
        const da = a.planDate ? new Date(a.planDate).getTime() : 0;
        const db = b.planDate ? new Date(b.planDate).getTime() : 0;
        return db - da;
    });

    if (filteredPlans.length === 0) {
        container.style.display = '';
        if (tableContainer) tableContainer.style.display = 'none';
        container.innerHTML = `<div class="empty-state-full"><div class="empty-icon">📌</div><div>没有符合筛选条件的计划</div></div>`;
        return;
    }

    // 视图模式分流
    if (myTaskViewMode === 'list') {
        container.style.display = 'none';
        if (tableContainer) tableContainer.style.display = '';
        renderMyTaskPlanListTable(filteredPlans);
        return;
    } else {
        container.style.display = '';
        if (tableContainer) tableContainer.style.display = 'none';
    }

    container.innerHTML = filteredPlans.map(plan => {
        const total = plan.tasks.length;
        const notStarted = plan.tasks.filter(t => t.adapt_status === 'not_started').length;
        const adapting = plan.tasks.filter(t => t.adapt_status === 'adapting').length;
        const finished = plan.tasks.filter(t => t.adapt_status === 'finished').length;
        const avgProgress = total > 0 ? Math.round(plan.tasks.reduce((s, t) => s + (t.adapt_progress || 0), 0) / total) : 0;
        const devices = Array.isArray(plan.devicesJson) ? plan.devicesJson : [];
        const deviceNames = devices.map(d => d.name || d).slice(0, 3).join(', ');
        const deviceMore = devices.length > 3 ? ` 等${devices.length}台` : '';

        // 进度条颜色
        const progressColor = avgProgress >= 80 ? '#38a169' : avgProgress >= 40 ? '#d69e2e' : '#e53e3e';

        return `
        <div class="plan-card my-task-plan-card" onclick="openMyTaskPlan(${plan.planId})" style="cursor:pointer;">
            <div class="plan-card-top">
                <span class="plan-card-title">${escapeHtml(plan.planTitle)}</span>
                <span class="plan-card-no">${escapeHtml(plan.planNo)}</span>
            </div>
            ${plan.planGoal ? `<div class="plan-card-goal">${escapeHtml(plan.planGoal)}</div>` : ''}
            <div class="my-task-card-meta">
                <span>📅 ${plan.planDate || '-'}</span>
                <span>📱 ${deviceNames}${deviceMore || ''}</span>
            </div>
            <div class="my-task-card-bottom">
                <div class="plan-card-progress">
                    <div class="plan-card-progress-bar">
                        <div class="plan-card-progress-fill" style="width:${avgProgress}%;background:${progressColor};"></div>
                    </div>
                    <span class="plan-card-pct" style="color:#fff;">${avgProgress}%</span>
                </div>
                <div class="plan-card-stats my-task-stats">
                    <span>🎮 <strong>${total}</strong></span>
                    <span style="color:rgba(255,255,255,0.75)">⏳ ${notStarted}</span>
                    <span style="color:rgba(255,255,255,0.85)">🔧 ${adapting}</span>
                    <span style="color:rgba(255,255,255,0.95)">✅ ${finished}</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ========== 进入二级视图 ==========
function openMyTaskPlan(planId) {
    currentMyTaskPlanId = planId;
    renderMyTaskDetail(planId);
}

function renderMyTaskDetail(planId) {
    const plan = myTaskPlans.find(p => p.planId === planId);
    if (!plan) return;

    // 切换视图
    document.getElementById('my-tasks-plan-cards').style.display = 'none';
    document.getElementById('my-tasks-detail-view').style.display = 'flex';

    // 设置标题
    document.getElementById('my-tasks-detail-title').innerHTML = 
        `${escapeHtml(plan.planTitle)} <span style="font-size:12px;color:var(--text-light);font-weight:400;margin-left:8px;">${escapeHtml(plan.planNo)}</span>`;

    // 计划元信息
    const infoEl = document.getElementById('my-tasks-detail-info');
    if (infoEl) {
        const devices = Array.isArray(plan.devicesJson) ? plan.devicesJson : [];
        const deviceNames = devices.map(d => d.name || d).join(', ') || '-';
        infoEl.innerHTML = `
            <div class="plan-detail-info-grid">
                <div class="info-item"><span class="info-label">📅 计划日期</span><span class="info-value">${plan.planDate || '-'}</span></div>
                <div class="info-item"><span class="info-label">📱 适配设备</span><span class="info-value">${escapeHtml(deviceNames)}</span></div>
                <div class="info-item"><span class="info-label">🔀 交织版本</span><span class="info-value">${escapeHtml(plan.interlaceVersion || '-')}</span></div>
                <div class="info-item"><span class="info-label">📦 客户端版本</span><span class="info-value">${escapeHtml(plan.clientVersion || '-')}</span></div>
                ${plan.planGoal ? `<div class="info-item"><span class="info-label">🎯 目标</span><span class="info-value">${escapeHtml(plan.planGoal)}</span></div>` : ''}
            </div>
        `;
    }

    // 筛选任务
    const statusFilter = document.getElementById('my-tasks-status-filter').value;
    myTasksFiltered = statusFilter
        ? plan.tasks.filter(t => t.adapt_status === statusFilter)
        : [...plan.tasks];

    renderMyTasksTable();
}

// ========== 二级视图：任务表格 ==========
function renderMyTasksTable() {
    const tbody = document.getElementById('my-tasks-table');
    const statsItems = document.getElementById('my-tasks-stats-items');

    if (!myTasksFiltered || myTasksFiltered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-icon">📌</div><div>该计划下暂无符合条件的任务</div></td></tr>`;
        if (statsItems) statsItems.innerHTML = '';
        return;
    }


    tbody.innerHTML = myTasksFiltered.map((task, index) => {
        // 用例统计信息
        const tcTotal = task.tc_total || 0;
        const tcProgress = task.tc_progress || 0;
        const tcBadgeClass = tcTotal > 0 ? 'has-cases' : '';
        const tcBadge = tcTotal > 0 
            ? `<span class="tc-count-badge ${tcBadgeClass}" onclick="openExecTestCaseModal(${index})" title="点击执行测试用例">
                 📝 ${tcTotal}条
                 <span class="tc-progress-mini"><span class="tc-progress-mini-fill" style="width:${tcProgress}%"></span></span>
               </span>`
            : `<span class="tc-count-badge" style="opacity:0.5">无用例</span>`;
        
        return `
        <tr>
            <td class="text-center"><strong>${index + 1}</strong></td>
            <td class="text-left">
                ${escapeHtml(task.game_name || '')}
                <div style="margin-top:4px;">${tcBadge}</div>
            </td>
            <td>${escapeHtml(task.assigned_name || task.owner_name || '-')}</td>
            <td>${escapeHtml(task.game_platform || task.game_platform_full || '-')}</td>
            <td>
                <select class="adapt-status-select" data-task-id="${task.id}" onchange="onMyTaskFieldChange(${index})">
                    <option value="not_started" ${task.adapt_status === 'not_started' ? 'selected' : ''}>未开始</option>
                    <option value="adapting" ${task.adapt_status === 'adapting' ? 'selected' : ''}>适配中</option>
                    <option value="finished" ${task.adapt_status === 'finished' ? 'selected' : ''}>已结束</option>
                </select>
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:6px;">
                    <input type="range" class="progress-slider" min="0" max="100" step="5" 
                        value="${task.adapt_progress || 0}" 
                        data-task-id="${task.id}"
                        oninput="this.nextElementSibling.textContent=this.value+'%'; onMyTaskFieldChange(${index})">
                    <span class="progress-text" style="min-width:36px;">${task.adapt_progress || 0}%</span>
                </div>
            </td>
            <td>
                <input type="text" class="remark-input" value="${escapeHtml(task.remark || '')}"
                    placeholder="输入问题备注..."
                    data-task-id="${task.id}"
                    onchange="onMyTaskFieldChange(${index})">
            </td>
            <td class="text-center">
                <button class="tool-btn tool-btn-primary" style="padding:3px 10px;font-size:12px;" onclick="submitSingleTask(${index})">提交</button>
            </td>
        </tr>
    `}).join('');

    // 统计
    if (statsItems) {
        const total = myTasksFiltered.length;
        const notStarted = myTasksFiltered.filter(t => t.adapt_status === 'not_started').length;
        const adapting = myTasksFiltered.filter(t => t.adapt_status === 'adapting').length;
        const finished = myTasksFiltered.filter(t => t.adapt_status === 'finished').length;
        const avgProgress = total > 0 ? Math.round(myTasksFiltered.reduce((s, t) => s + (t.adapt_progress || 0), 0) / total) : 0;
        statsItems.innerHTML = `
            <span class="stat-item">共 <strong>${total}</strong> 项任务</span>
            <span class="stat-item">未开始 <strong>${notStarted}</strong></span>
            <span class="stat-item">适配中 <strong>${adapting}</strong></span>
            <span class="stat-item">已结束 <strong>${finished}</strong></span>
            <span class="stat-item">平均进度 <strong>${avgProgress}%</strong></span>
        `;
    }
}

// ========== 返回一级视图 ==========
function backToMyTasksPlanCards() {
    currentMyTaskPlanId = null;
    document.getElementById('my-tasks-plan-cards').style.display = '';
    document.getElementById('my-tasks-detail-view').style.display = 'none';
    renderMyTaskPlanCards();
}

function onMyTaskFieldChange(index) {
    const task = myTasksFiltered[index];
    if (task) task._dirty = true;
}

// 提交单条任务
async function submitSingleTask(index) {
    const task = myTasksFiltered[index];
    if (!task) return;

    const rows = document.querySelectorAll('#my-tasks-table tr');
    const row = rows[index];
    if (!row) return;

    const statusSelect = row.querySelector('.adapt-status-select');
    const progressSlider = row.querySelector('.progress-slider');
    const remarkInput = row.querySelector('.remark-input');

    const payload = {
        adapt_status: statusSelect ? statusSelect.value : task.adapt_status,
        adapt_progress: progressSlider ? parseInt(progressSlider.value) : (task.adapt_progress || 0),
        remark: remarkInput ? remarkInput.value : (task.remark || '')
    };

    try {
        const resp = await authFetch(`${API_BASE}/my-tasks/${task.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await resp.json();
        if (result.success) {
            task.adapt_status = payload.adapt_status;
            task.adapt_progress = payload.adapt_progress;
            task.remark = payload.remark;
            task._dirty = false;
            showToast(`「${task.game_name}」进展已提交并同步`, 'success');
        } else {
            showToast('提交失败: ' + (result.error || ''), 'danger');
        }
    } catch (e) {
        showToast('提交失败，请重试', 'danger');
    }
}

// 全部提交（当前计划内的所有任务）
async function submitAllMyTasks() {
    if (myTasksFiltered.length === 0) {
        showToast('没有可提交的任务', 'warning');
        return;
    }

    const rows = document.querySelectorAll('#my-tasks-table tr');
    const items = [];

    myTasksFiltered.forEach((task, index) => {
        const row = rows[index];
        if (!row) return;

        const statusSelect = row.querySelector('.adapt-status-select');
        const progressSlider = row.querySelector('.progress-slider');
        const remarkInput = row.querySelector('.remark-input');

        items.push({
            plan_game_id: task.id,
            adapt_status: statusSelect ? statusSelect.value : task.adapt_status,
            adapt_progress: progressSlider ? parseInt(progressSlider.value) : (task.adapt_progress || 0),
            remark: remarkInput ? remarkInput.value : (task.remark || '')
        });
    });

    try {
        const resp = await authFetch(`${API_BASE}/my-tasks/batch-submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });
        const result = await resp.json();
        if (result.success) {
            showToast(`已提交 ${result.count} 项任务，数据已同步到适配进展`, 'success');
            await loadMyTasks();
        } else {
            showToast('批量提交失败: ' + (result.error || ''), 'danger');
        }
    } catch (e) {
        showToast('批量提交失败，请重试', 'danger');
    }
}

// ==================== showCreatePlanView 增强：加载成员下拉框 ====================
// 覆盖原函数，在原逻辑基础上添加成员下拉框填充
const _origShowCreatePlanView = showCreatePlanView;
showCreatePlanView = function() {
    _origShowCreatePlanView();

    // 填充"默认负责人"下拉框
    const assigneeSelect = document.getElementById('plan-default-assignee');
    if (assigneeSelect && allMembersData && allMembersData.length > 0) {
        assigneeSelect.innerHTML = '<option value="">不指定（后续逐个指派）</option>' +
            allMembersData.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    }
};


