
// ==================== Hook into switchTab ====================
(function(){
    const _orig = window.switchTab;
    window.switchTab = function(tabId) {
        if (tabId === 'game-issues') { loadGameIssues(); return; }
        if (tabId === 'equipment') { loadEquipment(); return; }
        _orig.apply(this, arguments);
    };
})();

// ==================== 侧边栏菜单注入 ====================
function injectNewMenuItems() {
    const menu = document.getElementById('sidebar-menu');
    if (!menu || document.getElementById('menu-game-issues')) return;
    const gameMgmtLink = menu.querySelector('a[onclick*="game-management"]');
    if (gameMgmtLink && gameMgmtLink.parentElement) {
        gameMgmtLink.parentElement.insertAdjacentHTML('afterend',
            '<li id="menu-game-issues"><a onclick="switchTab(&quot;game-issues&quot;)">🎮 游戏问题</a></li>' +
            '<li id="menu-equipment"><a onclick="switchTab(&quot;equipment&quot;)">🖥️ 设备管理</a></li>');
    }
}
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', injectNewMenuItems); }
else { setTimeout(injectNewMenuItems, 0); }
