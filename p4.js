
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
