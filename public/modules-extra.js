// ==================== 游戏问题模块 ====================
// isAdmin 函数：判断当前用户是否为管理员
function isAdmin() {
    try {
        const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
        return u && (u.role === '超级管理员' || u.role_id === 1 || u.username === 'admin');
    } catch(e) { return false; }
}
window.isAdmin = isAdmin;

let gameIssuesData = [];
let gameIssuesPage = 1;
const gameIssuesPageSize = 20;

async function loadGameIssues() {
    const res = await authFetch('/api/game-issues');
    gameIssuesData = await res.json();
    renderGameIssuesPage();
}

function renderGameIssuesPage() {
    const q = (document.getElementById('gi-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('gi-filter-status')?.value || '';
    const typeFilter = document.getElementById('gi-filter-type')?.value || '';
    const priorityFilter = document.getElementById('gi-filter-priority')?.value || '';
    let data = [...gameIssuesData];
    if (q) data = data.filter(r => (r.game_name||'').toLowerCase().includes(q) || (r.issue_desc||'').toLowerCase().includes(q) || (r.owner||'').toLowerCase().includes(q));
    if (statusFilter) data = data.filter(r => r.status === statusFilter);
    if (typeFilter) data = data.filter(r => r.issue_type === typeFilter);
    if (priorityFilter) data = data.filter(r => r.priority === priorityFilter);
    const start = (gameIssuesPage - 1) * gameIssuesPageSize;
    const paged = data.slice(start, start + gameIssuesPageSize);
    const totalPages = Math.max(1, Math.ceil(data.length / gameIssuesPageSize));
    let html = '<div class="stats-grid">' +
        '<div class="stat-card"><div class="stat-number">' + data.length + '</div><div class="stat-label">全部问题</div></div>' +
        '<div class="stat-card"><div class="stat-number">' + data.filter(r=>r.status==='待处理').length + '</div><div class="stat-label">待处理</div></div>' +
        '<div class="stat-card"><div class="stat-number">' + data.filter(r=>r.status==='处理中').length + '</div><div class="stat-label">处理中</div></div>' +
        '<div class="stat-card"><div class="stat-number">' + data.filter(r=>r.status==='已解决').length + '</div><div class="stat-label">已解决</div></div>' +
        '</div>';
    html += '<div class="search-bar">' +
        '<input type="text" id="gi-search" placeholder="搜索游戏名/问题描述/负责人..." oninput="renderGameIssuesPage()" class="search-input">' +
        '<select id="gi-filter-status" onchange="renderGameIssuesPage()"><option value="">全部状态</option><option>待处理</option><option>处理中</option><option>已解决</option><option>已关闭</option></select>' +
        '<select id="gi-filter-type" onchange="renderGameIssuesPage()"><option value="">全部类型</option><option>Bug</option><option>优化</option><option>新功能</option><option>美术</option><option>音效</option><option>其他</option></select>' +
        '<select id="gi-filter-priority" onchange="renderGameIssuesPage()"><option value="">全部优先级</option><option>P0-紧急</option><option>P1-高</option><option>P2-中</option><option>P3-低</option></select>' +
        '<button class="btn btn-primary" onclick="showGameIssueModal()">+ 新建问题</button>' +
        '<button class="btn btn-success" onclick="exportGameIssuesToExcel()">导出Excel</button>' +
        '</div>';
    html += '<table><thead><tr><th>ID</th><th>游戏名</th><th>问题类型</th><th>优先级</th><th>问题描述</th><th>负责人</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>';
    for (const row of paged) {
        const sc = ({'待处理':'warning','处理中':'primary','已解决':'success','已关闭':'default'}[row.status] || 'default');
        html += '<tr>' +
            '<td>' + row.id + '</td>' +
            '<td><a class="game-name-link" onclick="showGameIssueDetail(' + row.id + ')">' + escapeHtml(row.game_name) + '</a></td>' +
            '<td>' + escapeHtml(row.issue_type||'') + '</td>' +
            '<td><span class="badge badge-' + (row.priority==='P0-紧急'?'danger':row.priority==='P1-高'?'warning':'primary') + '">' + escapeHtml(row.priority||'') + '</span></td>' +
            '<td title="' + escapeHtml(row.issue_desc||'') + '">' + escapeHtml((row.issue_desc||'').substring(0,30)) + '</td>' +
            '<td>' + escapeHtml(row.owner||'') + '</td>' +
            '<td><span class="badge badge-' + sc + '">' + escapeHtml(row.status) + '</span></td>' +
            '<td>' + (row.created_at||'').substring(0,10) + '</td>' +
            '<td class="action-btns">' +
            '<button class="btn btn-primary" onclick="showGameIssueDetail(' + row.id + ')">详情</button> ' +
            '<button class="btn btn-warning" onclick="editGameIssue(' + row.id + ')">编辑</button> ' +
            (window.isAdmin?.() ? '<button class="btn btn-danger" onclick="deleteGameIssue(' + row.id + ')">删除</button>' : '') +
            '</td></tr>';
    }
    if (!paged.length) html += '<tr><td colspan="9" class="empty-state">暂无数据</td></tr>';
    html += '</tbody></table>';
    html += '<div class="pagination">' +
        '<button ' + (gameIssuesPage<=1?'disabled':'') + ' onclick="gameIssuesPage--;renderGameIssuesPage()">上一页</button>' +
        '<span>第 ' + gameIssuesPage + ' / ' + totalPages + ' 页，共 ' + data.length + ' 条</span>' +
        '<button ' + (gameIssuesPage>=totalPages?'disabled':'') + ' onclick="gameIssuesPage++;renderGameIssuesPage()">下一页</button>' +
        '</div>';
    document.getElementById('content').innerHTML = html;
}

function showGameIssueModal(issueId) {
    const isEdit = !!issueId;
    const data = isEdit ? gameIssuesData.find(r => r.id === issueId) : {};
    const statusOpts = ['待处理','处理中','已解决','已关闭'];
    const typeOpts = ['Bug','优化','新功能','美术','音效','其他'];
    const prioOpts = ['P0-紧急','P1-高','P2-中','P3-低'];
    let html = '<div class="modal show" id="gi-modal"><div class="modal-content">' +
        '<div class="modal-header"><span class="modal-title">' + (isEdit?'编辑问题':'新建问题') + '</span><span class="modal-close" onclick="closeGameIssueModal()">\u00d7</span></div>' +
        '<div class="modal-body">' +
        '<input type="hidden" id="gi-id" value="' + (data.id||'') + '">' +
        '<label>游戏名 *</label><input type="text" id="gi-game-name" value="' + escapeHtml(data.game_name||'') + '" placeholder="输入游戏名称">' +
        '<label>问题类型 *</label><select id="gi-type">' + typeOpts.map(o => '<option value="' + o + '"' + (data.issue_type===o?' selected':'') + '>' + o + '</option>').join('') + '</select>' +
        '<label>优先级 *</label><select id="gi-priority">' + prioOpts.map(o => '<option value="' + o + '"' + (data.priority===o?' selected':'') + '>' + o + '</option>').join('') + '</select>' +
        '<label>问题描述 *</label><textarea id="gi-desc" rows="4" placeholder="详细描述问题...">' + escapeHtml(data.issue_desc||'') + '</textarea>' +
        '<label>负责人 *</label><input type="text" id="gi-owner" value="' + escapeHtml(data.owner||'') + '" placeholder="负责人姓名">' +
        '<label>状态</label><select id="gi-status">' + statusOpts.map(o => '<option value="' + o + '"' + (data.status===o?' selected':'') + '>' + o + '</option>').join('') + '</select>' +
        '<label>备注</label><textarea id="gi-remarks" rows="2">' + escapeHtml(data.remarks||'') + '</textarea>' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button class="btn btn-primary" onclick="saveGameIssue()">保存</button>' +
        '<button class="btn" onclick="closeGameIssueModal()">取消</button>' +
        '</div></div></div>';
    document.getElementById('content').insertAdjacentHTML('beforeend', html);
}
function closeGameIssueModal() { const m = document.getElementById('gi-modal'); if (m) m.remove(); }

async function saveGameIssue() {
    const id = document.getElementById('gi-id').value;
    const body = {
        game_name: document.getElementById('gi-game-name').value.trim(),
        issue_type: document.getElementById('gi-type').value,
        priority: document.getElementById('gi-priority').value,
        issue_desc: document.getElementById('gi-desc').value.trim(),
        owner: document.getElementById('gi-owner').value.trim(),
        status: document.getElementById('gi-status').value,
        remarks: document.getElementById('gi-remarks').value.trim()
    };
    if (!body.game_name || !body.issue_desc || !body.owner) { showToast('请填写必填项', 'warning'); return; }
    try {
        if (id) { await authFetch('/api/game-issues/' + id, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
        else { await authFetch('/api/game-issues', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
        showToast('保存成功', 'success'); closeGameIssueModal(); loadGameIssues();
    } catch(e) { showToast('保存失败: ' + e.message, 'error'); }
}
function editGameIssue(id) { showGameIssueModal(id); }
async function deleteGameIssue(id) {
    if (!confirm('确定删除？')) return;
    try { await authFetch('/api/game-issues/' + id, { method: 'DELETE' }); showToast('删除成功', 'success'); loadGameIssues(); }
    catch(e) { showToast('删除失败: ' + e.message, 'error'); }
}

function showGameIssueDetail(id) {
    const data = gameIssuesData.find(r => r.id === id); if (!data) return;
    let html = '<div class="modal show" id="gi-detail-modal"><div class="modal-content" style="max-width:600px">' +
        '<div class="modal-header"><span class="modal-title">问题详情 #' + data.id + '</span><span class="modal-close" onclick="document.getElementById(\'gi-detail-modal\').remove()">\u00d7</span></div>' +
        '<div class="modal-body">' +
        '<p><strong>游戏名:</strong> ' + escapeHtml(data.game_name) + '</p>' +
        '<p><strong>问题类型:</strong> ' + escapeHtml(data.issue_type||'') + '</p>' +
        '<p><strong>优先级:</strong> ' + escapeHtml(data.priority||'') + '</p>' +
        '<p><strong>问题描述:</strong></p><p style="padding:8px;background:#f5f5f5;border-radius:4px">' + escapeHtml(data.issue_desc||'') + '</p>' +
        '<p><strong>负责人:</strong> ' + escapeHtml(data.owner||'') + '</p>' +
        '<p><strong>状态:</strong> ' + escapeHtml(data.status||'') + '</p>' +
        '<p><strong>备注:</strong> ' + escapeHtml(data.remarks||'') + '</p>' +
        '<p><strong>创建时间:</strong> ' + (data.created_at||'') + '</p>' +
        '<p><strong>更新时间:</strong> ' + (data.updated_at||'') + '</p>' +
        '</div></div></div>';
    document.getElementById('content').insertAdjacentHTML('beforeend', html);
}
function exportGameIssuesToExcel() {
    const headers = ['ID','游戏名','问题类型','优先级','问题描述','负责人','状态','创建时间'];
    const rows = gameIssuesData.map(r => [r.id,r.game_name,r.issue_type,r.priority,r.issue_desc,r.owner,r.status,(r.created_at||'').substring(0,10)]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '游戏问题');
    XLSX.writeFile(wb, '游戏问题_' + new Date().toISOString().slice(0,10) + '.xlsx');
}

// ==================== 设备管理模块 ====================
let equipmentData = [];
let equipmentPage = 1;
const equipmentPageSize = 20;

async function loadEquipment() {
    const res = await authFetch('/api/equipment');
    equipmentData = await res.json();
    renderEquipmentPage();
}
function renderEquipmentPage() {
    const q = (document.getElementById('eq-search')?.value || '').toLowerCase();
    let data = [...equipmentData];
    if (q) data = data.filter(r => (r.name||'').toLowerCase().includes(q) || (r.equipment_no||'').toLowerCase().includes(q) || (r.keeper||'').toLowerCase().includes(q));
    const start = (equipmentPage - 1) * equipmentPageSize;
    const paged = data.slice(start, start + equipmentPageSize);
    const totalPages = Math.max(1, Math.ceil(data.length / equipmentPageSize));
    let html = '<div class="stats-grid"><div class="stat-card"><div class="stat-number">' + data.length + '</div><div class="stat-label">全部设备</div></div></div>';
    html += '<div class="search-bar">' +
        '<input type="text" id="eq-search" placeholder="搜索设备名/编号/保管人..." oninput="renderEquipmentPage()" class="search-input">' +
        '<button class="btn btn-primary" onclick="showEquipmentModal()">+ 新增设备</button>' +
        '</div>';
    html += '<table><thead><tr><th>ID</th><th>设备名</th><th>设备编号</th><th>保管人</th><th>登记日期</th><th>备注</th><th>操作</th></tr></thead><tbody>';
    for (const row of paged) {
        html += '<tr>' +
            '<td>' + row.id + '</td>' +
            '<td>' + escapeHtml(row.name) + '</td>' +
            '<td>' + escapeHtml(row.equipment_no||'') + '</td>' +
            '<td>' + escapeHtml(row.keeper||'') + '</td>' +
            '<td>' + (row.date||'') + '</td>' +
            '<td title="' + escapeHtml(row.remarks||'') + '">' + escapeHtml((row.remarks||'').substring(0,20)) + '</td>' +
            '<td class="action-btns">' +
            '<button class="btn btn-warning" onclick="editEquipment(' + row.id + ')">编辑</button> ' +
            (window.isAdmin?.() ? '<button class="btn btn-danger" onclick="deleteEquipment(' + row.id + ')">删除</button>' : '') +
            '</td></tr>';
    }
    if (!paged.length) html += '<tr><td colspan="7" class="empty-state">暂无数据</td></tr>';
    html += '</tbody></table>';
    html += '<div class="pagination">' +
        '<button ' + (equipmentPage<=1?'disabled':'') + ' onclick="equipmentPage--;renderEquipmentPage()">上一页</button>' +
        '<span>第 ' + equipmentPage + ' / ' + totalPages + ' 页，共 ' + data.length + ' 条</span>' +
        '<button ' + (equipmentPage>=totalPages?'disabled':'') + ' onclick="equipmentPage++;renderEquipmentPage()">下一页</button>' +
        '</div>';
    document.getElementById('content').innerHTML = html;
}

function showEquipmentModal(eqId) {
    const isEdit = !!eqId;
    const data = isEdit ? equipmentData.find(r => r.id === eqId) : {};
    let html = '<div class="modal show" id="eq-modal"><div class="modal-content">' +
        '<div class="modal-header"><span class="modal-title">' + (isEdit?'编辑设备':'新增设备') + '</span><span class="modal-close" onclick="closeEquipmentModal()">\u00d7</span></div>' +
        '<div class="modal-body">' +
        '<input type="hidden" id="eq-id" value="' + (data.id||'') + '">' +
        '<label>设备名 *</label><input type="text" id="eq-name" value="' + escapeHtml(data.name||'') + '">' +
        '<label>设备编号</label><input type="text" id="eq-no" value="' + escapeHtml(data.equipment_no||'') + '">' +
        '<label>保管人</label><input type="text" id="eq-keeper" value="' + escapeHtml(data.keeper||'') + '">' +
        '<label>登记日期</label><input type="date" id="eq-date" value="' + (data.date||new Date().toISOString().slice(0,10)) + '">' +
        '<label>备注</label><textarea id="eq-remarks" rows="3">' + escapeHtml(data.remarks||'') + '</textarea>' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button class="btn btn-primary" onclick="saveEquipment()">保存</button>' +
        '<button class="btn" onclick="closeEquipmentModal()">取消</button>' +
        '</div></div></div>';
    document.getElementById('content').insertAdjacentHTML('beforeend', html);
}
function closeEquipmentModal() { const m = document.getElementById('eq-modal'); if (m) m.remove(); }

async function saveEquipment() {
    const id = document.getElementById('eq-id').value;
    const body = {
        name: document.getElementById('eq-name').value.trim(),
        equipment_no: document.getElementById('eq-no').value.trim(),
        keeper: document.getElementById('eq-keeper').value.trim(),
        date: document.getElementById('eq-date').value,
        remarks: document.getElementById('eq-remarks').value.trim()
    };
    if (!body.name) { showToast('请填写设备名', 'warning'); return; }
    try {
        if (id) { await authFetch('/api/equipment/' + id, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
        else { await authFetch('/api/equipment', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
        showToast('保存成功', 'success'); closeEquipmentModal(); loadEquipment();
    } catch(e) { showToast('保存失败: ' + e.message, 'error'); }
}
function editEquipment(id) { showEquipmentModal(id); }
async function deleteEquipment(id) {
    if (!confirm('确定删除？')) return;
    try { await authFetch('/api/equipment/' + id, { method: 'DELETE' }); showToast('删除成功', 'success'); loadEquipment(); }
    catch(e) { showToast('删除失败: ' + e.message, 'error'); }
}

// ==================== Hook into switchTab ====================
(function(){
    // 保存原始 switchTab 引用（兼容 function 声明和 window.switchTab 赋值两种方式）
    const _orig = window.switchTab || switchTab;
    window.switchTab = function(tabId) {
        if (tabId === 'game-issues') { if(typeof loadGameIssues==='function') loadGameIssues(); return; }
        if (tabId === 'equipment') { if(typeof loadEquipment==='function') loadEquipment(); return; }
        if (_orig) _orig.apply(this, arguments);
    };
})();

// ==================== 侧边栏菜单注入 ====================
function injectNewMenuItems() {
    const menu = document.getElementById('sidebar-menu');
    if (!menu || document.getElementById('menu-game-issues')) return;
    const gameMgmtLink = menu.querySelector('a[onclick*="game-management"]');
    if (gameMgmtLink && gameMgmtLink.parentElement) {
        gameMgmtLink.parentElement.insertAdjacentHTML('afterend',
            '<li id="menu-game-issues"><a onclick="switchTab(&quot;game-issues&quot;)">\uD83C\uDFAE 游戏问题</a></li>' +
            '<li id="menu-equipment"><a onclick="switchTab(&quot;equipment&quot;)">\uD83D\uDDA5\uFE0F 设备管理</a></li>');
    }
}
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', injectNewMenuItems); }
else { setTimeout(injectNewMenuItems, 0); }
