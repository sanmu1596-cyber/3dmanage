// ==================== 游戏问题模块 ====================
let gameIssuesData = [];
let gameIssuesPage = 1;
const gameIssuesPageSize = 20;

async function loadGameIssues() {
    const res = await authFetch('/api/game-issues');
    gameIssuesData = await res.json();
    renderGameIssuesPage();
}
