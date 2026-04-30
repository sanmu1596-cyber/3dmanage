
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
            (isAdmin() ? '<button class="btn btn-danger" onclick="deleteEquipment(' + row.id + ')">删除</button>' : '') +
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
