/**
 * core.js — 核心基础模块
 * 职责：全局常量、主题切换、Toast通知、确认弹窗、游戏账号、全局状态变量
 * 依赖：无（最底层模块，最先加载）
 */
window.App = window.App || {};
var App = window.App;

// API 基础 URL
const API_BASE = '/api';

// ========== 主题切换 ==========
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    try { localStorage.setItem('theme', newTheme); } catch (e) { /* QuotaExceeded */ }
    updateThemeIcon(newTheme);
    showToast(newTheme === 'dark' ? '已切换到深色模式' : '已切换到浅色模式', 'info', 1500);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
        btn.textContent = theme === 'dark' ? '☀️' : '🌙';
        btn.title = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    }
}

// 页面加载时初始化主题
document.addEventListener('DOMContentLoaded', initTheme);

// ========== Toast 通知 ==========
function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }
    const colors = {
        success: { bg: 'rgba(46,158,90,0.95)', icon: '✅' },
        danger:  { bg: 'rgba(212,64,64,0.95)', icon: '❌' },
        warning: { bg: 'rgba(212,136,15,0.95)', icon: '⚠️' },
        info:    { bg: 'rgba(47,127,187,0.95)', icon: 'ℹ️' }
    };
    const c = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.style.cssText = `background:${c.bg};color:#fff;padding:10px 18px;border-radius:6px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;pointer-events:auto;animation:slideInRight 0.3s ease;max-width:360px;`;
    toast.innerHTML = `<span>${c.icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ========== 自定义确认弹窗 ==========
function showConfirm(message, onConfirm, onCancel) {
    // 创建遮罩和弹窗
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:10001;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-input);border-radius:8px;padding:24px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);animation:slideIn 0.2s ease;';
    box.innerHTML = `
        <div style="font-size:14px;color:var(--text-primary);line-height:1.6;margin-bottom:20px;white-space:pre-line;">${escapeHtml(message)}</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button class="btn btn-secondary confirm-cancel-btn" style="padding:6px 20px;cursor:pointer;">取消</button>
            <button class="tool-btn tool-btn-primary confirm-ok-btn" style="padding:6px 20px;cursor:pointer;">确定</button>
        </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const close = () => { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 200); };
    box.querySelector('.confirm-cancel-btn').onclick = () => { close(); if (onCancel) onCancel(); };
    box.querySelector('.confirm-ok-btn').onclick = () => { close(); if (onConfirm) onConfirm(); };
    overlay.onclick = (e) => { if (e.target === overlay) { close(); if (onCancel) onCancel(); } };
}

// 游戏分页状态
let currentPage = 1;
let pageSize = 20;
let allGamesData = [];
let filteredGamesData = []; // 筛选后的数据

// 游戏账号数据映射
let gameAccountsMap = {};

// 加载游戏账号数据
function loadGameAccounts() {
    // 由于gameAccountsData.js已通过script标签引入,直接使用全局变量
    if (typeof gameAccountsData !== 'undefined') {
        gameAccountsMap = gameAccountsData;
        console.log('游戏账号数据已加载:', Object.keys(gameAccountsMap).length, '条记录');
    } else {
        console.error('游戏账号数据未找到,请确认gameAccountsData.js已正确引入');
    }
}

// 根据游戏名称获取游戏账号
function getGameAccount(gameName) {
    // 尝试精确匹配
    if (gameAccountsMap[gameName]) {
        return gameAccountsMap[gameName];
    }

    // 尝试模糊匹配
    const gameKey = Object.keys(gameAccountsMap).find(key =>
        key.toLowerCase().includes(gameName.toLowerCase()) ||
        gameName.toLowerCase().includes(key.toLowerCase())
    );

    return gameKey ? gameAccountsMap[gameKey] : '';
}

// 游戏列表显示列配置
let visibleColumns = {
    name: true,
    english_name: true,
    platform: true,
    game_id: true,
    game_type: true,
    description: true,
    developer: true,
    operator: true,
    release_date: true,
    config_path: true,
    adapter_progress: true,
    owner: true,
    online_status: true,
    quality: true,
    game_account: true,
    storage_location: true,
    game_engine: true
};

// 适配进展状态
let allDevicesData = [];
let allGamesForProgress = [];
let allMembersData = []; // 存储成员数据,用于适配进展中的负责人
let allTestsData = [];   // P0: 存储测试数据,支持前端筛选
let allBugsData = [];    // P0: 存储缺陷数据,支持前端筛选
let currentDeviceId = null;
let progressData = []; // 存储各设备的游戏适配数据

// ==================== 数据刷新指示器 ====================

let _refreshCounter = 0; // 正在进行的请求数
let _refreshBar = null;
let _refreshToast = null;
let _refreshTimer = null;

/**
 * 显示刷新指示器（进度条 + 提示文字）
 */
function showRefreshIndicator(msg) {
    _refreshCounter++;
    if (_refreshCounter === 1) {
        _createRefreshElements();
        if (_refreshBar) _refreshBar.style.display = 'block';
        if (_refreshToast) { _refreshToast.style.display = 'flex'; _refreshToast.querySelector('.refresh-msg').textContent = msg || '正在同步...'; }
    }
}

/**
 * 隐藏刷新指示器（所有请求完成时才隐藏）
 * @param {string} finalMsg - 完成后短暂显示的消息（可选）
 */
function hideRefreshIndicator(finalMsg) {
    _refreshCounter = Math.max(0, _refreshCounter - 1);
    if (_refreshCounter <= 0) {
        if (finalMsg && _refreshToast) {
            // 短暂显示完成消息后消失
            _refreshToast.querySelector('.refresh-msg').textContent = finalMsg;
            clearTimeout(_refreshTimer);
            _refreshTimer = setTimeout(() => {
                _removeRefreshElements();
                _refreshCounter = 0;
            }, 1200);
        } else {
            _removeRefreshElements();
        }
        _refreshCounter = 0;
    }
}

function _createRefreshElements() {
    if (!_refreshBar) {
        _refreshBar = document.createElement('div');
        _refreshBar.className = 'data-refresh-bar';
        _refreshBar.innerHTML = '<div class="refresh-progress"></div>';
        _refreshBar.style.display = 'none';
        document.body.appendChild(_refreshBar);
    }

    if (!_refreshToast) {
        _refreshToast = document.createElement('div');
        _refreshToast.className = 'refresh-toast';
        _refreshToast.innerHTML = '<span class="refresh-spinner"></span><span class="refresh-msg">正在同步...</span>';
        _refreshToast.style.display = 'none';
        document.body.appendChild(_refreshToast);
    }
}

function _removeRefreshElements() {
    if (_refreshBar) { _refreshBar.remove(); _refreshBar = null; }
    if (_refreshToast) { _refreshToast.remove(); _refreshToast = null; }
    clearTimeout(_refreshTimer);
}

