
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
        const statusClass = ({'待处理':'warning','处理中':'primary','已解决':'success','已关闭':'default'}[row.status] || 'default');
        html += '<tr>' +
            '<td>' + row.id + '</td>' +
            '<td><a class="game-name-link" onclick="showGameIssueDetail(' + row.id + ')">' + escapeHtml(row.game_name) + '</a></td>' +
            '<td>' + escapeHtml(row.issue_type||'') + '</td>' +
            '<td><span class="badge badge-' + (row.priority==='P0-紧急'?'danger':row.priority==='P1-高'?'warning':'primary') + '">' + escapeHtml(row.priority||'') + '</span></td>' +
            '<td title="' + escapeHtml(row.issue_desc||'') + '">' + escapeHtml((row.issue_desc||'').substring(0,30)) + '</td>' +
            '<td>' + escapeHtml(row.owner||'') + '</td>' +
            '<td><span class="badge badge-' + statusClass + '">' + escapeHtml(row.status) + '</span></td>' +
            '<td>' + (row.created_at||'').substring(0,10) + '</td>' +
            '<td class="action-btns">' +
            '<button class="btn btn-primary" onclick="showGameIssueDetail(' + row.id + ')">详情</button> ' +
            '<button class="btn btn-warning" onclick="editGameIssue(' + row.id + ')">编辑</button> ' +
            (isAdmin() ? '<button class="btn btn-danger" onclick="deleteGameIssue(' + row.id + ')">删除</button>' : '') +
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
