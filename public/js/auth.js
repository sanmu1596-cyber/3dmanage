/**
 * auth.js — 认证与错误处理模块
 * 职责：登录认证(正式/开发模式)、authFetch、错误处理、用户信息、DOMContentLoaded入口
 * 依赖：core.js（showToast, escapeHtml, API_BASE等）
 */
var App = window.App;

// ========== 登录认证模块（支持正式模式和开发调试模式） ==========
// 正式模式：前端带 token 请求，401 自动跳登录页
// 开发模式（DEV_MODE=true）：不带 token，不检查登录，方便开发调试

let IS_DEV_MODE = false; // 由 /api/config 接口初始化

// 认证 Fetch 封装
async function authFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    // 正式模式下自动携带 token
    if (!IS_DEV_MODE) {
        const token = localStorage.getItem('authToken');
        if (token) {
            headers['X-Auth-Token'] = token;
        }
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    // 处理 401 未认证 → 跳转登录页
    if (response.status === 401 && !IS_DEV_MODE) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userInfo');
        window.location.href = '/login.html';
        throw new Error('未认证，跳转登录页');
    }

    // 处理 403 权限不足
    if (response.status === 403) {
        try {
            const error = await response.json();
            showToast(error.error || '权限不足', 'danger');
        } catch(e) {
            showToast('权限不足', 'danger');
        }
        throw new Error('权限不足');
    }

    // 处理 400 请求参数错误（校验失败）
    if (response.status === 400) {
        try {
            const errorData = await response.json();
            const msg = errorData.error || '请求数据不合法';
            showToast(msg, 'warning', 4000);
        } catch(e) {
            showToast('请求参数有误', 'warning');
        }
        throw new Error('请求参数错误');
    }

    // 处理 500+ 服务器错误
    if (response.status >= 500) {
        try {
            const errorData = await response.json();
            console.error('[服务器错误]', response.status, errorData);
            showToast(errorData.error || '服务器内部错误，请稍后重试', 'danger', 4000);
        } catch(e) {
            console.error('[服务器错误]', response.status);
            showToast(`服务器错误(${response.status})`, 'danger', 4000);
        }
        throw new Error('服务器错误');
    }

    return response;
}

// ========== 全局错误处理增强 ==========

/**
 * 安全API调用包装器 — 统一错误提示 + 控制台日志
 * @param {string} label - 操作名称（用于toast提示）
 * @param {Function} fn - 返回Promise的异步函数
 * @returns {Promise<any>} 返回原结果或抛出异常
 * 用法: const data = await safeApiCall('保存成员', () => { return resp.json(); });
 */
async function safeApiCall(label, fn) {
    try {
        return await fn();
    } catch (e) {
        console.error(`[${label}] 操作失败:`, e);
        // 网络错误特殊提示
        if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
            showToast('网络连接失败，请检查网络', 'danger', 5000);
        }
        // 401/403 已在 authFetch 中处理，这里不重复 toast
        // 其他未知错误给一个通用提示（如果还没显示过）
        throw e;
    }
}

// 全局未捕获异常处理
window.addEventListener('unhandledrejection', function(e) {
    console.error('[未捕获异常]', e.reason);
    // 防止重复toast（authFetch已处理的401/403不再重复提示）
    const msg = e.reason?.message || String(e.reason);
    if (!msg.includes('未认证') && !msg.includes('权限不足')) {
        showToast(`操作异常: ${msg.slice(0, 50)}`, 'danger');
    }
});

window.addEventListener('error', function(e) {
    if (e.error) {
        console.error('[全局错误]', e.error);
        // 只对非资源加载错误做用户提示
        if (!e.target?.src && !e.target?.href) {
            showToast(`页面出错: ${e.message}`, 'danger');
        }
    }
});

// 检查登录状态
async function checkLoginStatus() {
    try {
        // 先获取服务端配置
        const configResp = await fetch(`${API_BASE}/config`);
        const configResult = await configResp.json();
        IS_DEV_MODE = configResult.devMode === true;
    } catch (e) {
        console.warn('获取服务端配置失败，默认正式模式', e);
        IS_DEV_MODE = false;
    }

    // 开发模式：跳过登录检查
    if (IS_DEV_MODE) {
        console.log('[DEV_MODE] 开发调试模式，跳过登录检查');
        return;
    }

    // 正式模式：检查 localStorage 中的 token
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // 验证 token 是否仍有效
    try {
        const resp = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'X-Auth-Token': token }
        });
        if (!resp.ok) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userInfo');
            window.location.href = '/login.html';
            return;
        }
        // 更新本地缓存的用户信息
        const result = await resp.json();
        if (result.success && result.user) {
            try { localStorage.setItem('userInfo', JSON.stringify(result.user)); } catch (e) { /* QuotaExceeded */ }
        }
    } catch (e) {
        console.error('Token 验证失败', e);
        localStorage.removeItem('authToken');
        localStorage.removeItem('userInfo');
        window.location.href = '/login.html';
    }
}

// 获取当前用户信息
function getCurrentUser() {
    if (IS_DEV_MODE) {
        return { username: 'admin', realName: '管理员', role: '超级管理员', role_id: 1, role_key: 'super_admin' };
    }
    try {
        const userInfo = localStorage.getItem('userInfo');
        return userInfo ? JSON.parse(userInfo) : { username: '未知', realName: '未知', role: '未知', role_key: 'unknown' };
    } catch (e) {
        return { username: '未知', realName: '未知', role: '未知', role_key: 'unknown' };
    }
}

// 检查用户是否具有特定权限
// 用法: if (hasPermission('games', 'edit')) { showEditBtn(); }
function hasPermission(module, action) {
    if (IS_DEV_MODE) return true; // 开发模式拥有所有权限
    const user = getCurrentUser();
    if (user.role_key === 'super_admin') return true; // 超级管理员拥有所有权限
    // 从用户信息中获取权限矩阵
    try {
        const permissions = JSON.parse(localStorage.getItem('userPermissions') || '{}');
        return permissions[module]?.[action] === true;
    } catch (e) {
        return false;
    }
}

// 根据权限显示/隐藏元素
// 用法: <div data-permission="games.edit">编辑按钮</div>
function applyPermissionControl() {
    if (IS_DEV_MODE) return; // 开发模式不隐藏任何元素
    document.querySelectorAll('[data-permission]').forEach(el => {
        const [module, action] = el.dataset.permission.split('.');
        if (!hasPermission(module, action)) {
            el.style.display = 'none';
        }
    });
}

// 加载用户权限矩阵
async function loadUserPermissions() {
    if (IS_DEV_MODE) return;
    try {
        const resp = await authFetch(`${API_BASE}/auth/permissions`);
        if (resp.ok) {
            const result = await resp.json();
            if (result.success && result.permissions) {
                localStorage.setItem('userPermissions', JSON.stringify(result.permissions));
            }
        }
    } catch (e) {
        console.warn('加载用户权限失败:', e);
    }
}

// 更新用户信息显示
function updateUserInfo() {
    const user = getCurrentUser();
    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl) {
        // 保留主题切换和通知按钮，只更新用户信息部分
        const themeBtn = '<button class="theme-toggle-btn" id="theme-toggle" onclick="toggleTheme()" title="切换主题">🌙</button>';
        const notifyBtn = '<button class="icon-btn notification-btn" id="notification-btn" onclick="toggleNotificationPanel()" title="通知">🔔<span class="notification-badge" id="notification-badge" style="display:none">0</span></button>';

        if (IS_DEV_MODE) {
            userInfoEl.innerHTML = `
                ${themeBtn}
                ${notifyBtn}
                <span class="user-avatar">👤</span>
                <span class="user-name">${escapeHtml(user.realName || user.username)}</span>
                <span style="color:var(--text-light);font-size:12px;margin-left:6px;">(开发模式)</span>
            `;
        } else {
            userInfoEl.innerHTML = `
                ${themeBtn}
                ${notifyBtn}
                <span class="user-avatar">👤</span>
                <span class="user-name">${escapeHtml(user.realName || user.username)}</span>
                <span class="user-role-badge" style="font-size:11px;margin-left:6px;color:var(--text-light);">${escapeHtml(user.role || '')}</span>
                <button class="logout-btn" onclick="logout()" title="退出登录">🚪 退出</button>
            `;
        }

        // 刷新主题图标
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        updateThemeIcon(currentTheme);
    }
}

// 登出
async function logout() {
    if (IS_DEV_MODE) {
        window.location.reload();
        return;
    }
    try {
        const token = localStorage.getItem('authToken');
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Auth-Token': token || ''
            }
        });
    } catch (e) {
        // 登出请求失败也无所谓，继续清理本地状态
    }
    localStorage.removeItem('authToken');
    localStorage.removeItem('userInfo');
    window.location.href = '/login.html';
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await checkLoginStatus(); // 必须先确认登录状态和 DEV_MODE
    initTabs();
    loadColumnSettings(); // 加载列显示设置（游戏）
    if (typeof loadDeviceColumnSettings === 'function') loadDeviceColumnSettings(); // 加载设备列显示设置
    loadGameAccounts(); // 加载游戏账号数据
    // 首次加载：先加载全局基础数据（字段选项、成员），再由 initHashRouter 按需加载当前 tab
    await loadFieldOptions();
    window._fieldOptionsLoaded = true;
    await loadMembers(); // 成员数据是全局依赖（适配进展、游戏列表都用到）
    initForms();
    updateUserInfo();
    // P3-19: 加载用户权限矩阵并应用权限控制
    await loadUserPermissions();
    applyPermissionControl();
    updateStats();
    initHashRouter(); // P0: URL hash 路由（会调 switchTab → loadTabData 按需加载）


    // Dashboard 首次加载：直接加载数据，不经过 switchTab 的 visibility:hidden 机制
    const currentTab = location.hash.slice(1) || 'dashboard';
    if (currentTab === 'dashboard') {
        // 确保 dashboard 是 active 且可见状态（HTML 默认就是 active）
        const dashEl = document.getElementById('dashboard');
        if (dashEl) {
            dashEl.classList.add('active');
            dashEl.style.visibility = '';
        }
        // 标记侧边栏高亮
        const dashSidebar = document.querySelector('.sidebar-item[data-tab="dashboard"]');
        if (dashSidebar) dashSidebar.classList.add('active');
        // 直接加载 dashboard 数据
        try {
            await loadDashboard();
        } catch (e) {
            console.error('Dashboard 首次加载失败:', e);
        }
    }
});
