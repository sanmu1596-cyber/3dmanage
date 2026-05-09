/**
 * admin.js — 用户管理与权限模块
 * 职责：用户组权限管理、成员管理CRUD、发布计划、计划关闭/添加游戏
 * 依赖：core.js, auth.js, router.js（authFetch, showToast等）
 */
var App = window.App;

// ============================================================
//  P2: 用户管理模块 — 角色权限 + 成员管理
// ============================================================

// ---------- 模块状态 ----------
let umRoles = [];          // 所有角色
let umUsers = [];          // 所有用户
let umSelectedRoleId = null; // 当前选中角色ID
let umPermMatrix = {};     // { roleId: { module: { action: bool } } }

// 权限模块 & 操作定义
const UM_MODULES = [
    { key: 'members',        label: '成员管理',   icon: '👥' },
    { key: 'devices',        label: '设备管理',   icon: '📱' },
    { key: 'games',          label: '游戏管理',   icon: '🎮' },
    { key: 'tests',          label: '测试管理',   icon: '🧪' },
    { key: 'bugs',           label: '缺陷管理',   icon: '🐛' },
    { key: 'config_plan',    label: '配置计划',   icon: '📋' },
    { key: 'adaptation',     label: '适配进展',   icon: '📊' },
    { key: 'field_settings', label: '字段设置',   icon: '⚙️' },
    { key: 'user_management',label: '用户管理',   icon: '🔐' }
];
const UM_ACTIONS = [
    { key: 'view',   label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit',   label: '编辑' },
    { key: 'delete', label: '删除' },
    { key: 'export', label: '导出' },
    { key: 'import', label: '导入' }
];

// ---------- 入口：Tab加载 ----------
async function umLoadData() {
    try {
        // 并行加载角色列表和用户列表
        const [rolesResp, usersResp] = await Promise.all([
            authFetch(`${API_BASE}/roles`),
            authFetch(`${API_BASE}/users`)
        ]);
        const rolesResult = await rolesResp.json();
        const usersResult = await usersResp.json();
        umRoles = rolesResult.data || [];
        umUsers = usersResult.data || [];
    } catch (e) {
        console.error('加载用户管理数据失败:', e);
        umRoles = [];
        umUsers = [];
    }
    umRenderRoleList();
    umRenderUserList();
    umPopulateRoleFilter();

    // 默认选中第一个角色（如果还没有选中任何角色）
    if (!umSelectedRoleId && umRoles.length > 0) {
        umSelectRole(umRoles[0].id);
    }
}

// ---------- 子Tab切换 ----------
function switchUserMgmtTab(subTab) {
    document.querySelectorAll('.um-sub-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.um-subtab-content').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`.um-sub-tab[data-subtab="${subTab}"]`);
    if (btn) btn.classList.add('active');
    const content = document.getElementById('um-' + subTab);
    if (content) content.classList.add('active');
}

// ========== 用户组权限 ==========

// 渲染左侧角色列表
function umRenderRoleList() {
    const container = document.getElementById('um-role-list');
    if (!container) return;
    if (umRoles.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-light);">暂无角色</div>';
        return;
    }
    // 统计每个角色的用户数
    const roleCounts = {};
    umUsers.forEach(u => { roleCounts[u.role_id] = (roleCounts[u.role_id] || 0) + 1; });

    container.innerHTML = umRoles.map(role => {
        const count = roleCounts[role.id] || 0;
        const isActive = role.id === umSelectedRoleId;
        const isSystem = role.is_system ? '<span class="um-system-badge">系统</span>' : '';
        return `<div class="um-role-item ${isActive ? 'active' : ''}" data-role-id="${role.id}" onclick="umSelectRole(${role.id})">
            <span class="um-role-dot" style="background:${role.color || '#718096'}"></span>
            <div class="um-role-info">
                <span class="um-role-name">${escapeHtml(role.name)} ${isSystem}</span>
                <span class="um-role-count">${count} 人</span>
            </div>
            ${!role.is_system ? `<button class="um-role-delete" onclick="event.stopPropagation(); umDeleteRole(${role.id}, '${escapeHtml(role.name)}')" title="删除角色">×</button>` : ''}
        </div>`;
    }).join('');
}

// 选择角色 → 加载权限矩阵
async function umSelectRole(roleId) {
    umSelectedRoleId = roleId;
    // 更新左侧高亮
    document.querySelectorAll('.um-role-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.roleId) === roleId);
    });

    const role = umRoles.find(r => r.id === roleId);
    if (!role) return;

    document.getElementById('um-perm-title').textContent = role.name + ' — 权限配置';
    document.getElementById('um-perm-desc').textContent = role.description || '';
    document.getElementById('um-perm-actions').style.display = 'flex';

    // 超级管理员提示
    if (role.id === 1) {
        document.getElementById('um-perm-desc').textContent = '超级管理员拥有所有权限，无需配置';
    }

    // 加载权限
    try {
        const resp = await authFetch(`${API_BASE}/roles/${roleId}/permissions`);
        const result = await resp.json();
        if (result.success) {
            umPermMatrix[roleId] = result.data.permissions || {};
        }
    } catch (e) {
        console.error('加载角色权限失败:', e);
        umPermMatrix[roleId] = {};
    }

    umRenderPermMatrix(roleId);
}

// 渲染权限矩阵表格
function umRenderPermMatrix(roleId) {
    const container = document.getElementById('um-perm-matrix');
    const perms = umPermMatrix[roleId] || {};
    const role = umRoles.find(r => r.id === roleId);
    const isSuperAdmin = role && role.id === 1;

    let html = `<table class="um-matrix-table">
        <thead><tr>
            <th class="um-matrix-module-th">功能模块</th>
            ${UM_ACTIONS.map(a => `<th class="um-matrix-action-th">${a.label}</th>`).join('')}
        </tr></thead><tbody>`;

    UM_MODULES.forEach(mod => {
        const modPerms = perms[mod.key] || {};
        html += `<tr>
            <td class="um-matrix-module-td">${mod.icon} ${mod.label}</td>
            ${UM_ACTIONS.map(act => {
                const checked = isSuperAdmin ? true : !!modPerms[act.key];
                const disabled = isSuperAdmin ? 'disabled' : '';
                return `<td class="um-matrix-action-td">
                    <input type="checkbox" class="um-perm-cb" data-module="${mod.key}" data-action="${act.key}" ${checked ? 'checked' : ''} ${disabled}>
                </td>`;
            }).join('')}
        </tr>`;
    });

    html += '</tbody></table>';

    if (isSuperAdmin) {
        html += '<div style="padding:12px 0;text-align:center;color:var(--accent);font-size:13px;">⚡ 超级管理员自动拥有全部权限，无法修改</div>';
    }

    container.innerHTML = html;
}

// 全选 / 取消全选
function umSelectAllPerms() {
    document.querySelectorAll('.um-perm-cb:not(:disabled)').forEach(cb => cb.checked = true);
}
function umDeselectAllPerms() {
    document.querySelectorAll('.um-perm-cb:not(:disabled)').forEach(cb => cb.checked = false);
}

// 保存权限
async function umSavePermissions() {
    if (!umSelectedRoleId) return;
    const role = umRoles.find(r => r.id === umSelectedRoleId);
    if (role && role.id === 1) {
        showToast('超级管理员权限不可修改', 'warning');
        return;
    }

    // 收集 checkbox 状态
    const permissions = {};
    document.querySelectorAll('.um-perm-cb').forEach(cb => {
        const mod = cb.dataset.module;
        const act = cb.dataset.action;
        if (!permissions[mod]) permissions[mod] = {};
        permissions[mod][act] = cb.checked;
    });

    try {
        const resp = await authFetch(`${API_BASE}/roles/${umSelectedRoleId}/permissions`, {
            method: 'PUT',
            body: JSON.stringify({ permissions })
        });
        const result = await resp.json();
        if (result.success) {
            showToast('权限已保存', 'success');
            umPermMatrix[umSelectedRoleId] = permissions;
        } else {
            showToast(result.error || '保存失败', 'danger');
        }
    } catch (e) {
        showToast('保存权限失败: ' + e.message, 'danger');
    }
}

// 创建角色
function openCreateRoleModal() {
    document.getElementById('um-role-name').value = '';
    document.getElementById('um-role-desc').value = '';
    // 默认选中灰色
    document.querySelectorAll('#um-role-colors .um-color-opt').forEach(opt => opt.classList.remove('selected'));
    const defaultOpt = document.querySelector('#um-role-colors .um-color-opt:last-child');
    if (defaultOpt) defaultOpt.classList.add('selected');
    const defaultRadio = document.querySelector('input[name="um-role-color"][value="#718096"]');
    if (defaultRadio) defaultRadio.checked = true;
    openModal('um-role-modal');
}

async function submitRoleForm(e) {
    e.preventDefault();
    const name = document.getElementById('um-role-name').value.trim();
    const description = document.getElementById('um-role-desc').value.trim();
    const colorRadio = document.querySelector('input[name="um-role-color"]:checked');
    const color = colorRadio ? colorRadio.value : '#718096';

    if (!name) { showToast('角色名称不能为空', 'warning'); return; }

    try {
        const resp = await authFetch(`${API_BASE}/roles`, {
            method: 'POST',
            body: JSON.stringify({ name, description, color })
        });
        const result = await resp.json();
        if (result.success) {
            showToast('角色创建成功', 'success');
            closeModal('um-role-modal');
            await umLoadData(); // 重新加载
        } else {
            showToast(result.error || '创建失败', 'danger');
        }
    } catch (e) {
        showToast('创建角色失败: ' + e.message, 'danger');
    }
}

// 删除角色
function umDeleteRole(roleId, roleName) {
    showConfirm(`确定要删除角色「${roleName}」吗？\n删除后不可恢复。`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/roles/${roleId}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('角色已删除', 'success');
                if (umSelectedRoleId === roleId) {
                    umSelectedRoleId = null;
                    document.getElementById('um-perm-title').textContent = '选择角色查看权限';
                    document.getElementById('um-perm-desc').textContent = '';
                    document.getElementById('um-perm-actions').style.display = 'none';
                    document.getElementById('um-perm-matrix').innerHTML = `
                        <div class="um-perm-empty">
                            <div class="empty-icon">🔐</div>
                            <div>请在左侧选择一个角色</div>
                            <div class="empty-sub">点击角色后，可在此配置其权限矩阵</div>
                        </div>`;
                }
                await umLoadData();
            } else {
                showToast(result.error || '删除失败', 'danger');
            }
        } catch (e) {
            showToast('删除角色失败: ' + e.message, 'danger');
        }
    });
}

// 颜色选择器交互
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#um-role-colors .um-color-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('#um-role-colors .um-color-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        });
    });
});

// ========== 成员管理 ==========

// 填充角色筛选下拉
function umPopulateRoleFilter() {
    const filterSelect = document.getElementById('um-user-role-filter');
    if (!filterSelect) return;
    filterSelect.innerHTML = '<option value="">全部角色</option>' +
        umRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

    // 同时填充用户弹窗中的角色下拉
    const roleSelect = document.getElementById('um-role-select');
    if (roleSelect) {
        roleSelect.innerHTML = umRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    }
}

// 渲染用户列表
function umRenderUserList(data) {
    const list = data || umUsers;
    const tbody = document.getElementById('um-users-table');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="empty-icon">👥</div><div>暂无用户</div></td></tr>';
        return;
    }

    tbody.innerHTML = list.map((user, idx) => {
        const roleColor = /^#[0-9a-fA-F]{3,8}$/.test(user.roleColor) ? user.roleColor : '#718096';
        const roleName = user.role || '未分配';
        const statusText = user.status === 'active' ? '正常' : '禁用';
        const statusClass = user.status === 'active' ? 'status-online' : 'status-pending';
        const memberBadge = user.isMember
            ? '<span class="status-badge status-online">✓ 是</span>'
            : '<span class="status-badge status-pending">否</span>';
        const displayName = escapeHtml(user.realName || user.username || '-');
        return `<tr>
            <td class="text-center"><strong>${idx + 1}</strong></td>
            <td><strong>${displayName}</strong></td>
            <td>${escapeHtml(user.username || '(无账号)')}</td>
            <td>${escapeHtml(user.wechatId || '-')}</td>
            <td>${escapeHtml(user.projectRole || '-')}</td>
            <td><span class="um-role-badge" style="background:${roleColor}20;color:${roleColor};border:1px solid ${roleColor}40;">${escapeHtml(roleName)}</span></td>
            <td>${memberBadge}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <button class="btn-icon" title="编辑" onclick="umEditUser(${user.id})">✏️</button>
                <button class="btn-icon" title="重置密码" onclick="umResetPassword(${user.id}, '${escapeHtml(user.realName || user.username || '')}')">🔑</button>
                ${user.status === 'active'
                    ? `<button class="btn-icon" title="禁用" onclick="umToggleUserStatus(${user.id}, 'disabled')">🚫</button>`
                    : `<button class="btn-icon" title="启用" onclick="umToggleUserStatus(${user.id}, 'active')">✅</button>`
                }
                <button class="btn-icon" title="删除" onclick="umDeleteUser(${user.id}, '${escapeHtml(user.realName || user.username || '')}')">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

// 筛选用户列表
function filterUserList() {
    const keyword = (document.getElementById('um-user-search')?.value || '').toLowerCase();
    const roleId = document.getElementById('um-user-role-filter')?.value;
    let filtered = umUsers;
    if (keyword) {
        filtered = filtered.filter(u =>
            (u.username || '').toLowerCase().includes(keyword) ||
            (u.realName || '').toLowerCase().includes(keyword) ||
            (u.wechatId || '').toLowerCase().includes(keyword) ||
            (u.projectRole || '').toLowerCase().includes(keyword)
        );
    }
    if (roleId) {
        filtered = filtered.filter(u => String(u.role_id) === roleId);
    }
    umRenderUserList(filtered);
}

// 创建用户
function openCreateUserModal() {
    document.getElementById('um-user-modal-title').textContent = '添加用户';
    document.getElementById('um-user-id').value = '';
    document.getElementById('um-username').value = '';
    document.getElementById('um-username').disabled = false;
    document.getElementById('um-realname').value = '';
    document.getElementById('um-password').value = '';
    document.getElementById('um-password').required = false;
    document.getElementById('um-password-label').textContent = '密码（选填）';
    document.getElementById('um-wechat-id').value = '';
    document.getElementById('um-project-role').value = '';
    document.getElementById('um-duty').value = '';
    document.getElementById('um-is-member').checked = true;
    document.getElementById('um-status-group').style.display = 'none';
    // 默认选第一个角色
    const roleSelect = document.getElementById('um-role-select');
    if (roleSelect && roleSelect.options.length > 0) {
        roleSelect.selectedIndex = 0;
    }
    openModal('um-user-modal');
}

// 编辑用户
function umEditUser(userId) {
    const user = umUsers.find(u => u.id === userId);
    if (!user) return;
    document.getElementById('um-user-modal-title').textContent = '编辑用户';
    document.getElementById('um-user-id').value = user.id;
    document.getElementById('um-username').value = user.username || '';
    document.getElementById('um-username').disabled = !!user.username; // 有账号则不可改
    document.getElementById('um-realname').value = user.realName || '';
    document.getElementById('um-password').value = '';
    document.getElementById('um-password').required = false;
    document.getElementById('um-password-label').textContent = '密码（留空不修改）';
    document.getElementById('um-wechat-id').value = user.wechatId || '';
    document.getElementById('um-project-role').value = user.projectRole || '';
    document.getElementById('um-duty').value = user.duty || '';
    document.getElementById('um-is-member').checked = !!user.isMember;
    document.getElementById('um-status-group').style.display = 'block';
    document.getElementById('um-user-status').value = user.status || 'active';
    const roleSelect = document.getElementById('um-role-select');
    if (roleSelect) roleSelect.value = user.role_id || '';
    openModal('um-user-modal');
}

// 提交用户表单（新增/编辑）
async function submitUserForm(e) {
    e.preventDefault();
    const userId = document.getElementById('um-user-id').value;
    const isEdit = !!userId;

    let username = document.getElementById('um-username').value.trim() || null;
    const realName = document.getElementById('um-realname').value.trim();
    let password = document.getElementById('um-password').value;
    const role_id = parseInt(document.getElementById('um-role-select').value) || null;
    const status = isEdit ? document.getElementById('um-user-status').value : 'active';
    const wechat_id = document.getElementById('um-wechat-id').value.trim();
    const project_role = document.getElementById('um-project-role').value.trim();
    const duty = document.getElementById('um-duty').value.trim();
    const is_member = document.getElementById('um-is-member').checked;

    if (!realName) {
        showToast('真实姓名不能为空', 'warning');
        return;
    }
    // 新建时：企微ID自动填充为用户名，密码默认123456
    if (!isEdit) {
        if (!username && wechat_id) {
            username = wechat_id;
        }
        if (username && !password) {
            password = '123456';
        }
    }

    const body = { username, realName, role_id, status, wechat_id, project_role, duty, is_member };
    if (password) body.password = password;

    try {
        const url = isEdit ? `${API_BASE}/users/${userId}` : `${API_BASE}/users`;
        const method = isEdit ? 'PUT' : 'POST';
        const resp = await authFetch(url, { method, body: JSON.stringify(body) });
        const result = await resp.json();
        if (result.success || resp.ok) {
            showToast(isEdit ? '用户已更新' : '用户已创建', 'success');
            closeModal('um-user-modal');
            await umLoadData();
        } else {
            showToast(result.error || '操作失败', 'danger');
        }
    } catch (e) {
        showToast('保存用户失败: ' + e.message, 'danger');
    }
}

// 重置密码
function umResetPassword(userId, username) {
    showConfirm(`确定要重置用户「${username}」的密码吗？\n重置后密码将变为: 123456`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/users/${userId}`, {
                method: 'PUT',
                body: JSON.stringify({ password: '123456' })
            });
            const result = await resp.json();
            if (result.success || resp.ok) {
                showToast('密码已重置为 123456', 'success');
            } else {
                showToast(result.error || '重置失败', 'danger');
            }
        } catch (e) {
            showToast('重置密码失败: ' + e.message, 'danger');
        }
    });
}

// 切换用户状态
async function umToggleUserStatus(userId, newStatus) {
    try {
        const resp = await authFetch(`${API_BASE}/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        const result = await resp.json();
        if (result.success || resp.ok) {
            showToast(newStatus === 'active' ? '用户已启用' : '用户已禁用', 'success');
            await umLoadData();
        } else {
            showToast(result.error || '操作失败', 'danger');
        }
    } catch (e) {
        showToast('修改状态失败: ' + e.message, 'danger');
    }
}

// 删除用户
function umDeleteUser(userId, username) {
    showConfirm(`确定要删除用户「${username}」吗？\n此操作不可恢复。`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/users/${userId}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('用户已删除', 'success');
                await umLoadData();
            } else {
                showToast(result.error || '删除失败', 'danger');
            }
        } catch (e) {
            showToast('删除用户失败: ' + e.message, 'danger');
        }
    });
}

// ==================== 发布计划 ====================
async function publishPlan(planIndex) {
    const plan = configPlans[planIndex];
    if (!plan || !plan.id) return;

    // 检查是否有游戏未指派负责人
    const unassigned = plan.games.filter(g => !g.assignedTo && !g.ownerName);
    if (unassigned.length > 0) {
        showConfirm(`还有 ${unassigned.length} 个游戏未指派负责人，确定发布吗？\n发布后负责人可在"我的任务"中看到分配给他们的任务。`, async () => {
            await doPublishPlan(planIndex);
        });
    } else {
        await doPublishPlan(planIndex);
    }
}

async function doPublishPlan(planIndex) {
    const plan = configPlans[planIndex];
    try {
        const resp = await authFetch(`${API_BASE}/plans/${plan.id}/publish`, { method: 'POST' });
        const result = await resp.json();
        if (result.success) {
            plan.status = 'published';
            showToast('计划已发布！负责人可在"我的任务"中查看', 'success');
            // 如果当前在详情视图，刷新详情；如果在列表视图，刷新卡片
            if (document.getElementById('plan-detail-view').style.display !== 'none') {
                openPlanDetail(planIndex);
            } else {
                renderPlanCards();
            }
        } else {
            showToast('发布失败: ' + (result.error || '未知错误'), 'danger');
        }
    } catch (e) {
        showToast('发布失败，请重试', 'danger');
    }
}

// ==================== 更新计划游戏负责人 ====================

// 完成计划（published → closed）
async function closePlan(planIndex) {
    const plan = configPlans[planIndex];
    if (!plan || !plan.id) return;
    showConfirm('确定将此计划标记为"已完成"吗？完成后计划仍可查看但不再显示在"我的任务"中。', async () => {
        try {
            const resp = await authFetch(`${API_BASE}/plans/${plan.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'closed' })
            });
            const result = await resp.json();
            if (result.success) {
                plan.status = 'closed';
                showToast('计划已标记为完成', 'success');
                if (document.getElementById('plan-detail-view').style.display !== 'none') {
                    openPlanDetail(planIndex);
                } else {
                    renderPlanCards();
                }
            } else {
                showToast('操作失败: ' + (result.error || ''), 'danger');
            }
        } catch (e) {
            showToast('操作失败，请重试', 'danger');
        }
    });
}

// 向已有计划添加游戏
let addGamesToPlanIndex = null; // 记录当前要添加游戏的计划索引
function addGamesToPlan(planIndex) {
    const plan = configPlans[planIndex];
    if (!plan) return;
    addGamesToPlanIndex = planIndex;

    // 获取当前计划已有的游戏ID
    const existingGameIds = new Set((plan.games || []).map(g => g.gameId || g.game_id));

    planGameSelectSourceList = allGamesForProgress
        .filter(g => !existingGameIds.has(g.id))
        .map(g => ({
            id: g.id,
            name: g.name,
            platform: g.platform || '-',
            gameType: g.game_type || '-',
            ownerName: g.owner_name || '-',
            checked: false
        }));
    planGameSelectTargetList = [];

    renderPlanGameSourceList();
    renderPlanGameTargetList();

    document.getElementById('plan-game-select-search').value = '';
    document.getElementById('plan-game-target-search').value = '';
    if (document.getElementById('select-all-plan-games-src')) document.getElementById('select-all-plan-games-src').checked = false;
    if (document.getElementById('select-all-plan-games-tgt')) document.getElementById('select-all-plan-games-tgt').checked = false;

    document.getElementById('plan-game-select-modal').style.display = 'block';
}

async function updatePlanGameAssignee(planIndex, gameIndex, selectEl) {
    const plan = configPlans[planIndex];
    const game = plan.games[gameIndex];
    if (!game || !game.id) return;

    const assignedTo = selectEl.value ? parseInt(selectEl.value) : null;
    const ownerName = selectEl.options[selectEl.selectedIndex].text || '';

    try {
        await authFetch(`${API_BASE}/plans/game/${game.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assigned_to: assignedTo, owner_name: assignedTo ? ownerName : '' })
        });
        game.assignedTo = assignedTo;
        game.ownerName = assignedTo ? ownerName : '';
        game.assignedName = assignedTo ? ownerName : '';
    } catch (e) {
        showToast('更新负责人失败', 'danger');
    }
}

