
function showGameIssueDetail(id) {
    const data = gameIssuesData.find(r => r.id === id); if (!data) return;
    let html = '<div class="modal show" id="gi-detail-modal"><div class="modal-content" style="max-width:600px">' +
        '<div class="modal-header"><span class="modal-title">问题详情 #' + data.id + '</span><span class="modal-close" onclick="document.getElementById(\\'gi-detail-modal\\').remove()">&times;</span></div>' +
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
    const rows = [['ID','游戏名','问题类型','优先级','问题描述','负责人','状态','创建时间']];
    for (const r of gameIssuesData) rows.push([r.id,r.game_name,r.issue_type,r.priority,r.issue_desc,r.owner,r.status,(r.created_at||'').substring(0,10)]);
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '游戏问题_' + new Date().toISOString().slice(0,10) + '.csv'; a.click();
}
