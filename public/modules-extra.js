// ==================== modules-extra.js（已废弃）====================
// 历史背景：本文件曾承载游戏问题/设备管理的旧版实现（基于 #content innerHTML 模式）
// 现在所有功能已迁移到模块化新架构（issues-versions.js 等）
//
// 2026-06-10 大神 决定：整个文件清空，只保留 isAdmin 兜底（可能其他地方零星使用）
// 旧函数会与新版同名 → 因为加载顺序在后会覆盖新版 → 必报错
// 不要往这里再添加任何业务函数！新功能写到对应的 js/ 模块文件即可。
// ==========================================================================

(function () {
    'use strict';
    // 兜底：isAdmin（其他文件零星使用，但未来应迁移到 auth.js）
    if (typeof window.isAdmin !== 'function') {
        window.isAdmin = function () {
            try {
                const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
                return u && (u.role === '超级管理员' || u.role_id === 1 || u.username === 'admin');
            } catch (e) {
                return false;
            }
        };
    }
})();
