
function showGameIssueModal(issueId) {
    const isEdit = !!issueId;
    const data = isEdit ? gameIssuesData.find(r => r.id === issueId) : {};
    const statusOpts = ['待处理','处理中','已解决','已关闭'];
    const typeOpts = ['Bug','优化','新功能','美术','音效','其他'];
    const prioOpts = ['P0-紧急','P1-高','P2-中','P3-低'];
    let html = '<div class="modal show" id="gi-modal"><div class="modal-content">' +
        '<div class="modal-header"><span class="modal-title">' + (isEdit?'编辑问题':'新建问题') + '</span><span class="modal-close" onclick="closeGameIssueModal()">&times;</span></div>' +
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
