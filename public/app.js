// API 基础 URL
const API_BASE = '/api';

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
    toast.innerHTML = `<span>${c.icon}</span><span>${message}</span>`;
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
        <div style="font-size:14px;color:var(--text-primary);line-height:1.6;margin-bottom:20px;white-space:pre-line;">${message}</div>
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
    storage_location: true
};

// 适配进展状态
let allDevicesData = [];
let allGamesForProgress = [];
let allMembersData = []; // 存储成员数据,用于适配进展中的负责人
let allTestsData = [];   // P0: 存储测试数据,支持前端筛选
let allBugsData = [];    // P0: 存储缺陷数据,支持前端筛选
let currentDeviceId = null;
let progressData = []; // 存储各设备的游戏适配数据

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
        const error = await response.json();
        alert(error.error || '权限不足');
        throw new Error('权限不足');
    }

    return response;
}

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
            localStorage.setItem('userInfo', JSON.stringify(result.user));
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
        return { username: 'admin', realName: '管理员', role: '超级管理员', role_id: 1 };
    }
    try {
        const userInfo = localStorage.getItem('userInfo');
        return userInfo ? JSON.parse(userInfo) : { username: '未知', realName: '未知', role: '未知' };
    } catch (e) {
        return { username: '未知', realName: '未知', role: '未知' };
    }
}

// 更新用户信息显示
function updateUserInfo() {
    const user = getCurrentUser();
    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl) {
        if (IS_DEV_MODE) {
            userInfoEl.innerHTML = `
                <span class="user-avatar">👤</span>
                <span class="user-name">${escapeHtml(user.realName || user.username)}</span>
                <span style="color:var(--text-light);font-size:12px;margin-left:6px;">(开发模式)</span>
            `;
        } else {
            userInfoEl.innerHTML = `
                <span class="user-avatar">👤</span>
                <span class="user-name">${escapeHtml(user.realName || user.username)}</span>
                <span class="user-role-badge" style="font-size:11px;margin-left:6px;color:var(--text-light);">${escapeHtml(user.role || '')}</span>
                <button class="logout-btn" onclick="logout()" title="退出登录">🚪 退出</button>
            `;
        }
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
    loadColumnSettings(); // 加载列显示设置
    loadGameAccounts(); // 加载游戏账号数据
    // 首次加载：先加载全局基础数据（字段选项、成员），再由 initHashRouter 按需加载当前 tab
    await loadFieldOptions();
    window._fieldOptionsLoaded = true;
    await loadMembers(); // 成员数据是全局依赖（适配进展、游戏列表都用到）
    initForms();
    updateUserInfo();
    updateStats();
    initHashRouter(); // P0: URL hash 路由（会调 switchTab → loadTabData 按需加载）
});

// ========== P0: URL Hash 路由 ==========
function initHashRouter() {
    // 监听 hash 变化
    window.addEventListener('hashchange', () => {
        const tab = location.hash.slice(1) || 'dashboard';
        switchTab(tab, true); // true = 来自 hash，不再 pushState
    });
    // 初始加载时读取 hash
    const initialTab = location.hash.slice(1) || 'dashboard';
    switchTab(initialTab, true);
}

// 标签切换（兼容侧边栏导航 + 旧tabs）
function initTabs() {
    // 侧边栏导航已在HTML中用onclick="switchTab(...)"绑定
    // 这里保留兼容旧.tab的逻辑
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });
}

// 切换Tab (P0: 增加 hash 路由, 性能优化: 防抖+请求计数)
let _tabSwitchCounter = 0; // 递增计数器，用于检测过时的tab切换
function switchTab(tabId, fromHash) {
    const mySwitch = ++_tabSwitchCounter; // 记录本次切换的序号
    // 移除所有激活状态
    document.querySelectorAll('.sidebar-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // 激活当前标签
    const sidebarItem = document.querySelector(`.sidebar-item[data-tab="${tabId}"]`);
    if (sidebarItem) sidebarItem.classList.add('active');
    
    const tabBtn = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    
    const content = document.getElementById(tabId);
    if (content) {
        content.classList.add('active');
    } else {
        // fallback: 如果找不到对应 tab，跳到 dashboard
        const dash = document.getElementById('dashboard');
        if (dash) dash.classList.add('active');
        const dashItem = document.querySelector('.sidebar-item[data-tab="dashboard"]');
        if (dashItem) dashItem.classList.add('active');
    }

    // P0: 更新 URL hash（仅非 hash 触发时）
    if (!fromHash && location.hash !== '#' + tabId) {
        history.pushState(null, '', '#' + tabId);
    }

    // 按需加载当前 tab 数据（避免每次 switchTab 全量刷新所有模块）
    // 传入切换序号，loadTabData内部可检测是否已过时
    loadTabData(tabId, mySwitch);
}

// 按需加载当前Tab数据
async function loadTabData(tabId, switchId) {
    // 确保字段选项已加载（全局依赖）
    if (!window._fieldOptionsLoaded) {
        await loadFieldOptions();
        window._fieldOptionsLoaded = true;
    }
    // 如果切换已过时（用户快速切到别的tab了），跳过
    if (switchId !== undefined && switchId !== _tabSwitchCounter) return;
    switch (tabId) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'games':
            await loadGames();
            refreshAllSelectsFromFieldOptions();
            break;
        case 'members':
            await loadMembers();
            break;
        case 'devices':
            await loadDevices();
            break;
        case 'progress':
            await loadProgressData();
            break;
        case 'matrix':
            await loadMatrixData();
            break;
        case 'tests':
            await loadTests();
            break;
        case 'bugs':
            await loadBugs();
            break;
        case 'config-plan':
            // 配置计划需要设备和游戏数据（穿梭框选择用）
            if (!allDevicesData || allDevicesData.length === 0) await loadDevices();
            if (!allGamesForProgress || allGamesForProgress.length === 0) {
                const gamesResp = await authFetch(`${API_BASE}/games`);
                const gamesResult = await gamesResp.json();
                allGamesForProgress = gamesResult.data || [];
            }
            await loadConfigPlans();
            break;
        case 'field-settings':
            await loadFieldOptions();
            renderFieldCards();
            break;
        case 'user-management':
            await umLoadData();
            break;
    }
    // 仅在非dashboard tab时更新侧边栏统计（dashboard自带完整统计）
    if (tabId !== 'dashboard') {
        updateStats();
    }
}

// 切换侧边栏
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// 加载所有数据
async function loadAllData() {
    await loadFieldOptions(); // 先加载字段选项
    await Promise.all([
        loadMembers(),
        loadDevices(),
        loadGames(),
        loadTests(),
        loadBugs()
    ]);
    await loadProgressData(); // 加载适配进展数据
    await loadConfigPlans(); // 加载配置计划数据
    refreshAllSelectsFromFieldOptions(); // 刷新所有表单下拉框
    updateStats();
}

// 加载成员列表
async function loadMembers() {
    try {
        const response = await authFetch(`${API_BASE}/members`);
        const result = await response.json();

        // 保存成员数据供适配进展使用
        allMembersData = result.data || [];

        renderMembersTable(allMembersData);

        // 更新下拉选择框
        updateSelectOptions('device-assigned', result.data, 'id', 'name', '未分配');
        updateSelectOptions('test-tester', result.data, 'id', 'name', '请选择测试人');
        updateSelectOptions('game-owner', result.data, 'id', 'name', '未分配');
    } catch (error) {
        console.error('加载成员失败:', error);
    }
}

// P0: 渲染成员表格（支持筛选后的子集）
function renderMembersTable(data) {
    const tbody = document.getElementById('members-table');
    if (data && data.length > 0) {
        tbody.innerHTML = data.map((member, index) => `
            <tr>
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>${escapeHtml(member.name)}</td>
                <td>${escapeHtml(member.wechat_id || '-')}</td>
                <td>${escapeHtml(member.role || '-')}</td>
                <td>${escapeHtml(member.duty || '-')}</td>
                <td><span class="status-badge status-${member.status}">${getStatusText(member.status)}</span></td>
                <td>
                    <button class="btn btn-small btn-edit" onclick="editMember(${member.id})">编辑</button>
                    <button class="btn btn-small btn-delete" onclick="deleteMember(${member.id})">删除</button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-icon">👥</div>
                    <div class="empty-text">暂无成员</div>
                    <div class="empty-sub">点击上方按钮添加第一个成员</div>
                </td>
            </tr>
        `;
    }
}

// 加载设备列表
async function loadDevices() {
    try {
        const response = await authFetch(`${API_BASE}/devices`);
        const result = await response.json();

        allDevicesData = result.data || [];
        renderDevicesTable(allDevicesData);

        // 更新测试设备下拉框
        updateSelectOptions('test-device', result.data, 'id', 'name', '请选择设备');
    } catch (error) {
        console.error('加载设备失败:', error);
    }
}

// P0: 渲染设备表格（支持筛选后的子集）
function renderDevicesTable(data) {
    const tbody = document.getElementById('devices-table');
    if (data && data.length > 0) {
        tbody.innerHTML = data.map((device, index) => `
            <tr>
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>${escapeHtml(device.manufacturer || '-')}</td>
                <td>${escapeHtml(device.device_type || '-')}</td>
                <td>${escapeHtml(device.name)}</td>
                <td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'requirements', 'text')" title="双击编辑">${escapeHtml(device.requirements || '-')}</td>
                <td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'quantity', 'number')" title="双击编辑">${escapeHtml(String(device.quantity || 1))}</td>
                <td class="editable-cell" ondblclick="startInlineEdit(this, ${device.id}, 'keeper', 'select')" title="双击选择">${escapeHtml(device.keeper || '-')}</td>
                <td>${escapeHtml(device.notes || '-')}</td>
                <td>${escapeHtml(device.adapter_completion_rate || '0%')}</td>
                <td>${escapeHtml(device.total_bugs || 0)}</td>
                <td>${escapeHtml(device.completed_adaptations || 0)}</td>
                <td>${getDeviceOnlineGameCount(device.name)}</td>
                <td>
                    <button class="btn btn-small btn-edit" onclick="editDevice(${device.id})">编辑</button>
                    <button class="btn btn-small btn-delete" onclick="deleteDevice(${device.id})">删除</button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="13" class="empty-state">
                    <div class="empty-icon">📱</div>
                    <div class="empty-text">暂无设备</div>
                    <div class="empty-sub">点击上方按钮添加第一个设备</div>
                </td>
            </tr>
        `;
    }
}

// ==================== 设备行内编辑 ====================

/**
 * 双击单元格进入编辑模式
 * @param {HTMLElement} td - 被双击的<td>元素
 * @param {number} deviceId - 设备ID
 * @param {string} field - 字段名 (requirements/quantity/keeper)
 * @param {string} inputType - 输入类型 (text/number)
 */
function startInlineEdit(td, deviceId, field, inputType) {
    // 防止重复激活
    if (td.querySelector('input, textarea, select')) return;

    const currentValue = td.textContent.trim();
    const displayValue = currentValue === '-' ? '' : currentValue;

    td.classList.add('editing');

    // 保管者：下拉选择（从成员列表获取）
    if (field === 'keeper') {
        const select = document.createElement('select');
        select.className = 'inline-edit-select';
        // 空选项
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- 选择保管者 --';
        select.appendChild(emptyOpt);
        // 从成员列表填充
        (allMembersData || []).forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.name;
            opt.textContent = member.name;
            if (member.name === displayValue) opt.selected = true;
            select.appendChild(opt);
        });
        td.innerHTML = '';
        td.appendChild(select);
        select.focus();
        // change 直接保存
        select.addEventListener('change', () => saveInlineEdit(td, deviceId, field, select.value));
        select.addEventListener('blur', () => {
            // 延迟关闭，让change事件先触发
            setTimeout(() => {
                if (td.querySelector('select')) cancelInlineEdit(td, currentValue);
            }, 150);
        });
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') cancelInlineEdit(td, currentValue);
        });
    }
    // 设备需求：textarea（自适应高度）
    else if (field === 'requirements') {
        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-textarea';
        textarea.value = displayValue;
        td.innerHTML = '';
        td.appendChild(textarea);
        // 自适应高度
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(60, textarea.scrollHeight) + 'px';
        textarea.focus();
        textarea.select();
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        });
        textarea.addEventListener('blur', () => saveInlineEdit(td, deviceId, field, textarea.value));
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textarea.blur(); }
            if (e.key === 'Escape') cancelInlineEdit(td, currentValue);
        });
    }
    // 数量：纯文本 input + 数字校验（不用 type=number 避免丑箭头）
    else if (field === 'quantity') {
        td.innerHTML = `<input type="text" inputmode="numeric" class="inline-edit-input inline-edit-qty" value="${escapeHtml(displayValue)}">`;
        const input = td.querySelector('input');
        input.focus();
        input.select();
        input.addEventListener('blur', () => saveInlineEdit(td, deviceId, field, input.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') cancelInlineEdit(td, currentValue);
        });
    }
    // 其他：通用 input
    else {
        td.innerHTML = `<input type="text" class="inline-edit-input" value="${escapeHtml(displayValue)}">`;
        const input = td.querySelector('input');
        input.focus();
        input.select();
        input.addEventListener('blur', () => saveInlineEdit(td, deviceId, field, input.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') cancelInlineEdit(td, currentValue);
        });
    }
}

/**
 * 保存行内编辑
 */
async function saveInlineEdit(td, deviceId, field, newValue) {
    td.classList.remove('editing');
    const trimmed = newValue.trim();

    // 构造PATCH请求体
    const body = {};
    body[field] = field === 'quantity' ? (parseInt(trimmed) || 1) : trimmed;

    try {
        const response = await authFetch(`${API_BASE}/devices/${deviceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            // 更新本地数据
            const device = allDevicesData.find(d => d.id === deviceId);
            if (device) device[field] = body[field];
            // 显示新值
            td.textContent = trimmed || '-';
            showToast('已保存', 'success');
        } else {
            td.textContent = trimmed || '-';
            showToast('保存失败', 'danger');
        }
    } catch (error) {
        console.error('行内编辑保存失败:', error);
        td.textContent = trimmed || '-';
        showToast('保存失败', 'danger');
    }
}

/**
 * 取消行内编辑（按Esc）
 */
function cancelInlineEdit(td, originalValue) {
    td.classList.remove('editing');
    td.textContent = originalValue;
}

// 加载游戏列表
async function loadGames() {
    try {
        const response = await authFetch(`${API_BASE}/games`);
        const result = await response.json();

        // 保存所有游戏数据
        allGamesData = result.data || [];
        filteredGamesData = [...allGamesData]; // 初始时筛选数据等于全部数据

        // 自动填充游戏账号
        allGamesData.forEach(game => {
            if (!game.game_account) {
                game.game_account = getGameAccount(game.name);
            }
        });

        // 填充筛选下拉框
        populateFilterOptions();

        renderGamesPage();

        // 更新测试游戏下拉框（使用全部数据）
        updateSelectOptions('test-game', allGamesData, 'id', 'name', '请选择游戏');
    } catch (error) {
        console.error('加载游戏失败:', error);
    }
}

// 填充筛选下拉框选项
function populateFilterOptions() {
    // 游戏平台筛选
    const platformFilter = document.getElementById('platform-filter');
    // 保留第一个"全部"选项，清空其他选项
    while (platformFilter.options.length > 1) {
        platformFilter.remove(1);
    }
    const platforms = [...new Set(allGamesData.map(game => game.platform).filter(p => p))];
    platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform;
        option.textContent = platform;
        platformFilter.appendChild(option);
    });

    // 游戏类型筛选
    const typeFilter = document.getElementById('type-filter');
    // 保留第一个"全部"选项，清空其他选项
    while (typeFilter.options.length > 1) {
        typeFilter.remove(1);
    }
    const types = [...new Set(allGamesData.map(game => game.game_type).filter(t => t))];
    types.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        typeFilter.appendChild(option);
    });
}

// 渲染当前页游戏
function renderGamesPage() {
    const tbody = document.getElementById('games-table');
    const totalGames = filteredGamesData.length;

    // 如果显示全部
    let gamesToShow = filteredGamesData;
    if (pageSize !== -1) {
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        gamesToShow = filteredGamesData.slice(startIndex, endIndex);
    }

    // 更新表头的显示/隐藏
    updateColumnHeaders();

    if (gamesToShow.length > 0) {
        tbody.innerHTML = gamesToShow.map((game, index) => {
            const globalIndex = pageSize === -1 ? index + 1 : (currentPage - 1) * pageSize + index + 1;
            let rowHtml = `<td class="text-center"><strong>${globalIndex}</strong></td>`;

            // 根据可见列配置生成单元格
            if (visibleColumns.name) {
                rowHtml += `<td>${escapeHtml(game.name)}</td>`;
            }
            if (visibleColumns.english_name) {
                rowHtml += `<td>${escapeHtml(game.english_name || '-')}</td>`;
            }
            if (visibleColumns.platform) {
                rowHtml += `<td>${escapeHtml(game.platform || '-')}</td>`;
            }
            if (visibleColumns.game_id) {
                rowHtml += `<td>${escapeHtml(game.game_id || '-')}</td>`;
            }
            if (visibleColumns.game_type) {
                rowHtml += `<td>${escapeHtml(game.game_type || '-')}</td>`;
            }
            if (visibleColumns.description) {
                rowHtml += `<td>${escapeHtml(game.description || '-')}</td>`;
            }
            if (visibleColumns.developer) {
                rowHtml += `<td>${escapeHtml(game.developer || '-')}</td>`;
            }
            if (visibleColumns.operator) {
                rowHtml += `<td>${escapeHtml(game.operator || '-')}</td>`;
            }
            if (visibleColumns.release_date) {
                rowHtml += `<td>${escapeHtml(game.release_date || '-')}</td>`;
            }
            if (visibleColumns.config_path) {
                rowHtml += `<td>${escapeHtml(game.config_path || '-')}</td>`;
            }
            if (visibleColumns.adapter_progress) {
                rowHtml += `<td>${escapeHtml(game.adapter_progress || '0%')}</td>`;
            }
            if (visibleColumns.owner) {
                rowHtml += `<td>${escapeHtml(game.owner_name || '-')}</td>`;
            }
            if (visibleColumns.online_status) {
                rowHtml += `<td>${escapeHtml(getFieldOptionLabel('online_status', game.online_status) || '-')}</td>`;
            }
            if (visibleColumns.quality) {
                rowHtml += `<td>${escapeHtml(getFieldOptionLabel('quality', game.quality) || '-')}</td>`;
            }
            if (visibleColumns.game_account) {
                rowHtml += `<td>${escapeHtml(game.game_account || '-')}</td>`;
            }
            if (visibleColumns.storage_location) {
                rowHtml += `<td>${escapeHtml(game.storage_location || '硬盘1号')}</td>`;
            }

            rowHtml += `
                <td>
                    <button class="btn btn-small btn-edit" onclick="editGame(${game.id})">编辑</button>
                    <button class="btn btn-small btn-delete" onclick="deleteGame(${game.id})">删除</button>
                </td>
            `;

            return `<tr>${rowHtml}</tr>`;
        }).join('');
    } else {
        // 计算显示的列数（包括序号和操作列）
        const visibleCount = Object.values(visibleColumns).filter(v => v).length + 2;
        tbody.innerHTML = `
            <tr>
                <td colspan="${visibleCount}" class="empty-state">
                    <div class="empty-icon">🎯</div>
                    <div class="empty-text">暂无游戏</div>
                    <div class="empty-sub">点击上方按钮添加第一个游戏</div>
                </td>
            </tr>
        `;
    }

    // 更新分页信息和控件
    updatePaginationControls();
}

// 更新分页控件
function updatePaginationControls() {
    const totalGames = filteredGamesData.length;
    const totalPages = pageSize === -1 ? 1 : Math.ceil(totalGames / pageSize);

    // 更新显示信息（pagination-info 已移除，安全跳过）
    const startShow = totalGames === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endShow = pageSize === -1 ? totalGames : Math.min(currentPage * pageSize, totalGames);
    const paginationInfo = document.getElementById('pagination-info');
    if (paginationInfo) {
        paginationInfo.textContent = `显示 ${startShow}-${endShow} 共 ${totalGames} 条`;
    }

    // 更新按钮状态
    document.getElementById('prev-btn').disabled = currentPage <= 1;
    document.getElementById('next-btn').disabled = pageSize === -1 || currentPage >= totalPages;

    // 更新页码显示
    const pageNumbersDiv = document.getElementById('page-numbers');
    if (totalPages <= 1) {
        pageNumbersDiv.innerHTML = '';
        return;
    }

    // 生成页码按钮
    let pageNumbersHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const isActive = i === currentPage ? 'active' : '';
        pageNumbersHTML += `<button class="btn btn-small page-number ${isActive}" onclick="goToPage(${i})">${i}</button>`;
    }
    pageNumbersDiv.innerHTML = pageNumbersHTML;
}

// 切换到上一页
function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderGamesPage();
    }
}

// 切换到下一页
function nextPage() {
    const totalGames = filteredGamesData.length;
    const totalPages = Math.ceil(totalGames / pageSize);
    if (currentPage < totalPages) {
        currentPage++;
        renderGamesPage();
    }
}

// 跳转到指定页
function goToPage(page) {
    currentPage = page;
    renderGamesPage();
}

// 改变每页显示数量
function changePageSize() {
    const select = document.getElementById('page-size');
    pageSize = parseInt(select.value);
    currentPage = 1; // 重置到第一页
    renderGamesPage();
}

// 筛选游戏
function filterGames() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const platformFilter = document.getElementById('platform-filter').value;
    const typeFilter = document.getElementById('type-filter').value;
    const statusFilter = document.getElementById('status-filter').value;

    filteredGamesData = allGamesData.filter(game => {
        // 搜索匹配（游戏名称或ID）
        const matchesSearch = !searchTerm ||
            (game.name && game.name.toLowerCase().includes(searchTerm)) ||
            (game.game_id && game.game_id.toString().includes(searchTerm));

        // 平台匹配
        const matchesPlatform = !platformFilter || game.platform === platformFilter;

        // 类型匹配
        const matchesType = !typeFilter || game.game_type === typeFilter;

        // 状态匹配
        const matchesStatus = !statusFilter || game.adaptation_status === statusFilter;

        return matchesSearch && matchesPlatform && matchesType && matchesStatus;
    });

    // 重置到第一页
    currentPage = 1;
    renderGamesPage();
}

// 重置筛选条件
function resetFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('platform-filter').value = '';
    document.getElementById('type-filter').value = '';
    document.getElementById('status-filter').value = '';

    filteredGamesData = [...allGamesData];
    currentPage = 1;
    renderGamesPage();
}

// ========== 通用导入/导出 Excel ==========

// 各模块导出配置
const exportConfigs = {
    games: {
        sheetName: '游戏列表',
        getData: () => filteredGamesData || allGamesData,
        columns: [
            { key: 'name', label: '游戏名称' }, { key: 'english_name', label: '英文名称' },
            { key: 'platform', label: '游戏平台' }, { key: 'game_id', label: '游戏ID' },
            { key: 'game_type', label: '游戏类型' }, { key: 'description', label: '游戏简介' },
            { key: 'developer', label: '开发商' }, { key: 'operator', label: '运营商' },
            { key: 'release_date', label: '上线日期' }, { key: 'config_path', label: '配置路径' },
            { key: 'adapter_progress', label: '适配进度' }, { key: 'owner_name', label: '负责人' },
            { key: 'online_status', label: '上线状态' }, { key: 'quality', label: '品质' },
            { key: 'game_account', label: '游戏账号' }, { key: 'storage_location', label: '存储位置' }
        ]
    },
    members: {
        sheetName: '项目成员',
        getData: () => allMembersData,
        columns: [
            { key: 'name', label: '姓名' }, { key: 'wechat_id', label: '企业微信ID' },
            { key: 'role', label: '角色' }, { key: 'duty', label: '职责' },
            { key: 'status', label: '状态' }
        ]
    },
    devices: {
        sheetName: '设备列表',
        getData: () => allDevicesData,
        columns: [
            { key: 'manufacturer', label: '厂商' }, { key: 'device_type', label: '设备类型' },
            { key: 'name', label: '设备名称' }, { key: 'requirements', label: '设备需求' },
            { key: 'quantity', label: '数量' }, { key: 'keeper', label: '保管者' },
            { key: 'notes', label: '备注' }, { key: 'adapter_completion_rate', label: '适配完成率' },
            { key: 'total_bugs', label: '总BUG数' }, { key: 'completed_adaptations', label: '适配完成数' },
            { key: 'total_games', label: '适配游戏数' }, { key: 'status', label: '状态' }
        ]
    },
    tests: {
        sheetName: '测试列表',
        getData: () => allTestsData,
        columns: [
            { key: 'name', label: '测试名称' }, { key: 'game_name', label: '游戏' },
            { key: 'device_name', label: '设备' }, { key: 'tester_name', label: '测试人' },
            { key: 'test_date', label: '测试日期' }, { key: 'status', label: '状态' },
            { key: 'priority', label: '优先级' }, { key: 'result', label: '测试结果' },
            { key: 'bugs_count', label: '缺陷数' }, { key: 'description', label: '描述' }
        ]
    },
    bugs: {
        sheetName: '缺陷列表',
        getData: () => allBugsData,
        columns: [
            { key: 'versions', label: '涉及版本' }, { key: 'device_name', label: '设备名称' },
            { key: 'discovery_time', label: '发现时间' }, { key: 'owner', label: '负责人' },
            { key: 'bug_status', label: '缺陷状态' }, { key: 'priority', label: '优先级' },
            { key: 'problem_type', label: '问题类型' }, { key: 'description', label: '描述' },
            { key: 'steps', label: '复现步骤' }, { key: 'planned_fix_time', label: '计划修复' },
            { key: 'actual_fix_time', label: '实际修复' }
        ]
    }
};

function exportToExcel(moduleName) {
    moduleName = moduleName || 'games';
    if (typeof XLSX === 'undefined') { showToast('XLSX 库未加载，无法导出', 'warning'); return; }
    const config = exportConfigs[moduleName];
    if (!config) { showToast('不支持的导出模块', 'warning'); return; }
    
    const rawData = config.getData() || [];
    const data = rawData.map((item, i) => {
        const row = { '序号': i + 1 };
        config.columns.forEach(col => { row[col.label] = item[col.key] || ''; });
        return row;
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.sheetName);
    XLSX.writeFile(wb, `${config.sheetName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`${config.sheetName}导出成功`, 'success');
}

function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') {
        showToast('XLSX 库未加载，无法导入', 'warning');
        return;
    }
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws);
            if (rows.length === 0) { showToast('文件中没有数据', 'warning'); return; }
            
            showConfirm(`读取到 ${rows.length} 条数据，确认导入到游戏列表？`, async () => {
                let success = 0, fail = 0;
                for (const row of rows) {
                    try {
                        const gameData = {
                            name: row['游戏名称'] || row['name'] || '',
                            english_name: row['英文名称'] || row['english_name'] || '',
                            platform: row['游戏平台'] || row['platform'] || '',
                            game_id: row['游戏ID'] || row['game_id'] || '',
                            game_type: row['游戏类型'] || row['game_type'] || '',
                            description: row['游戏简介'] || row['description'] || '',
                            developer: row['开发商'] || row['developer'] || '',
                            operator: row['运营商'] || row['operator'] || '',
                            release_date: row['上线日期'] || row['release_date'] || '',
                            config_path: row['配置路径'] || row['config_path'] || '',
                            adapter_progress: row['适配进度'] || row['adapter_progress'] || '',
                            online_status: row['上线状态'] || row['online_status'] || 'pending',
                            quality: row['品质'] || row['quality'] || 'normal',
                            game_account: row['游戏账号'] || row['game_account'] || '',
                            storage_location: row['存储位置'] || row['storage_location'] || ''
                        };
                        if (!gameData.name) { fail++; continue; }
                        const resp = await authFetch(`${API_BASE}/games`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(gameData)
                        });
                        const result = await resp.json();
                        if (result.success) success++; else fail++;
                    } catch { fail++; }
                }
                showToast(`导入完成：成功 ${success}，失败 ${fail}`, success > 0 ? 'success' : 'danger');
                if (success > 0) await loadGames();
            });
        } catch (err) {
            showToast('文件解析失败: ' + err.message, 'danger');
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

// 加载测试列表
async function loadTests() {
    try {
        const response = await authFetch(`${API_BASE}/tests`);
        const result = await response.json();

        allTestsData = result.data || [];
        renderTestsTable(allTestsData);
    } catch (error) {
        console.error('加载测试失败:', error);
    }
}

// P0: 渲染测试表格（支持筛选后的子集）
function renderTestsTable(data) {
    const tbody = document.getElementById('tests-table');
    if (data && data.length > 0) {
        tbody.innerHTML = data.map((test, index) => `
            <tr>
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>${escapeHtml(test.name)}</td>
                <td>${escapeHtml(test.game_name || '-')}</td>
                <td>${escapeHtml(test.device_name || '-')}</td>
                <td>${escapeHtml(test.tester_name || '-')}</td>
                <td>${escapeHtml(test.test_date || '-')}</td>
                <td><span class="status-badge status-${test.status}">${getTestStatusText(test.status)}</span></td>
                <td><span class="priority-badge priority-${test.priority}">${getPriorityText(test.priority)}</span></td>
                <td>${test.bugs_count || 0}</td>
                <td>
                    <button class="btn btn-small btn-edit" onclick="editTest(${test.id})">编辑</button>
                    <button class="btn btn-small btn-delete" onclick="deleteTest(${test.id})">删除</button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <div class="empty-icon">🧪</div>
                    <div class="empty-text">暂无测试</div>
                    <div class="empty-sub">点击上方按钮添加第一个测试</div>
                </td>
            </tr>
        `;
    }
}

// 加载缺陷列表
async function loadBugs() {
    try {
        const response = await authFetch(`${API_BASE}/bugs`);
        const result = await response.json();

        allBugsData = result.data || [];
        renderBugsTable(allBugsData);
    } catch (error) {
        console.error('加载缺陷失败:', error);
    }
}

// P0: 渲染缺陷表格（支持筛选后的子集）
function renderBugsTable(data) {
    const tbody = document.getElementById('bugs-table');
    if (data && data.length > 0) {
        tbody.innerHTML = data.map((bug, index) => `
            <tr>
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>${escapeHtml(bug.versions || '-')}</td>
                <td>${escapeHtml(bug.device_name || '-')}</td>
                <td>${escapeHtml(bug.discovery_time || '-')}</td>
                <td>${escapeHtml(bug.owner || '-')}</td>
                <td><span class="status-badge status-${bug.bug_status}">${getBugStatusText(bug.bug_status)}</span></td>
                <td><span class="priority-badge priority-${bug.priority}">${getPriorityText(bug.priority)}</span></td>
                <td>${escapeHtml(bug.problem_type || '-')}</td>
                <td>${escapeHtml(bug.description || '-')}</td>
                <td>
                    <button class="btn btn-small btn-edit" onclick="editBug(${bug.id})">编辑</button>
                    <button class="btn btn-small btn-delete" onclick="deleteBug(${bug.id})">删除</button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <div class="empty-icon">🐛</div>
                    <div class="empty-text">暂无缺陷</div>
                    <div class="empty-sub">测试完成后记录发现的缺陷</div>
                </td>
            </tr>
        `;
    }
}

// ========== P0: 通用模块筛选 ==========
function filterModule(moduleName) {
    const searchEl = document.getElementById(`${moduleName}-search`);
    const statusEl = document.getElementById(`${moduleName}-status-filter`);
    const keyword = (searchEl ? searchEl.value : '').toLowerCase().trim();
    const statusVal = statusEl ? statusEl.value : '';

    // 筛选配置：定义每个模块的搜索字段和状态字段
    const config = {
        members: {
            source: () => allMembersData,
            searchFields: ['name', 'role', 'duty', 'wechat_id'],
            statusField: 'status',
            render: renderMembersTable
        },
        devices: {
            source: () => allDevicesData,
            searchFields: ['name', 'manufacturer', 'device_type', 'keeper'],
            statusField: 'status',
            render: renderDevicesTable
        },
        tests: {
            source: () => allTestsData,
            searchFields: ['name', 'game_name', 'device_name', 'tester_name'],
            statusField: 'status',
            render: renderTestsTable
        },
        bugs: {
            source: () => allBugsData,
            searchFields: ['description', 'device_name', 'owner', 'problem_type', 'versions'],
            statusField: 'bug_status',
            render: renderBugsTable
        }
    };

    const cfg = config[moduleName];
    if (!cfg) return;

    let data = cfg.source() || [];

    // 关键字筛选
    if (keyword) {
        data = data.filter(item =>
            cfg.searchFields.some(field => {
                const val = item[field];
                return val && String(val).toLowerCase().includes(keyword);
            })
        );
    }

    // 状态筛选
    if (statusVal) {
        data = data.filter(item => item[cfg.statusField] === statusVal);
    }

    cfg.render(data);
}

// 更新统计数据（直接查后端API，确保实时准确）
async function updateStats() {
    try {
        const response = await authFetch(`${API_BASE}/stats/dashboard`);
        const result = await response.json();
        if (result.success) {
            const d = result.data;
            document.getElementById('stat-members').textContent = d.members_total || 0;
            document.getElementById('stat-devices').textContent = d.devices_total || 0;
            document.getElementById('stat-games').textContent = d.games_total || 0;
            document.getElementById('stat-tests').textContent = d.tests_total || 0;
            document.getElementById('stat-bugs').textContent = d.bugs_total || 0;
        }
    } catch (e) {
        // 后端不可用时降级到内存数据
        document.getElementById('stat-members').textContent = (allMembersData || []).length;
        document.getElementById('stat-devices').textContent = (allDevicesData || []).length;
        document.getElementById('stat-games').textContent = (allGamesData || []).length;
        document.getElementById('stat-tests').textContent = (allTestsData || []).length;
        document.getElementById('stat-bugs').textContent = (allBugsData || []).length;
    }

    // 更新各模块底部统计
    updateGamesModuleStats();
    updateMembersModuleStats();
    updateDevicesModuleStats();
    updateTestsModuleStats();
    updateBugsModuleStats();
}

// ========== 各模块底部统计 ==========

function makeStatCard(label, num, highlight) {
    const cls = highlight ? ' highlight' : '';
    return `<div class="stat-card"><span class="stat-num${cls}">${num}</span><span class="stat-label">${label}</span></div>`;
}

// 游戏列表统计
function updateGamesModuleStats() {
    const container = document.getElementById('games-stats-items');
    if (!container) return;
    const data = allGamesData || [];
    const total = data.length;

    // 按平台统计
    const platformCounts = {};
    data.forEach(g => {
        const p = g.platform || '未知';
        platformCounts[p] = (platformCounts[p] || 0) + 1;
    });

    // 上线状态统计
    const onlineStatusMap = {};
    try { getFieldOptionsByKey('online_status').forEach(o => onlineStatusMap[o.value] = o.label); } catch(e) {}
    if (!onlineStatusMap['online']) Object.assign(onlineStatusMap, {'pending':'待上线','in_progress':'适配中','paused':'暂停适配','online':'已上线'});

    const onlineCounts = {};
    data.forEach(g => {
        const s = g.online_status || 'pending';
        const label = onlineStatusMap[s] || s;
        onlineCounts[label] = (onlineCounts[label] || 0) + 1;
    });

    // 品质统计
    const qualityCounts = { '推荐': 0, '一般': 0 };
    data.forEach(g => {
        if (g.quality === 'recommended') qualityCounts['推荐']++;
        else qualityCounts['一般']++;
    });

    let html = makeStatCard('游戏总数', total, true);

    // 平台统计（按数量降序，最多显示5个）
    const sortedPlatforms = Object.entries(platformCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    sortedPlatforms.forEach(([name, count]) => {
        html += makeStatCard(name, count);
    });

    // 上线状态
    Object.entries(onlineCounts).forEach(([label, count]) => {
        if (count > 0) html += makeStatCard(label, count);
    });

    // 品质
    if (qualityCounts['推荐'] > 0) html += makeStatCard('推荐', qualityCounts['推荐']);

    container.innerHTML = html;
}

// 成员列表统计
function updateMembersModuleStats() {
    const container = document.getElementById('members-stats-items');
    if (!container) return;
    const data = allMembersData || [];
    const total = data.length;

    // 按角色统计
    const roleCounts = {};
    data.forEach(m => {
        const r = m.role || '未设定';
        roleCounts[r] = (roleCounts[r] || 0) + 1;
    });

    // 按状态统计
    const activeCnt = data.filter(m => m.status === 'active').length;
    const inactiveCnt = total - activeCnt;

    let html = makeStatCard('成员总数', total, true);
    html += makeStatCard('在职', activeCnt);
    if (inactiveCnt > 0) html += makeStatCard('离职', inactiveCnt);

    Object.entries(roleCounts).forEach(([role, count]) => {
        html += makeStatCard(role, count);
    });

    container.innerHTML = html;
}

// 设备列表统计
function updateDevicesModuleStats() {
    const container = document.getElementById('devices-stats-items');
    if (!container) return;
    const rows = document.querySelectorAll('#devices-table tr:not(.empty-state)');
    const total = rows.length;

    // 按厂商统计
    const mfrCounts = {};
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) {
            const mfr = cells[1].textContent.trim() || '未知';
            mfrCounts[mfr] = (mfrCounts[mfr] || 0) + 1;
        }
    });

    let html = makeStatCard('设备总数', total, true);
    Object.entries(mfrCounts).forEach(([mfr, count]) => {
        if (mfr !== '-') html += makeStatCard(mfr, count);
    });

    container.innerHTML = html;
}

// 适配进展统计
function updateProgressModuleStats(deviceIndex) {
    const container = document.getElementById('progress-stats-items');
    if (!container) return;

    if (deviceIndex === undefined || deviceIndex === null || !progressData[deviceIndex]) {
        container.innerHTML = '';
        return;
    }

    const device = progressData[deviceIndex];
    const games = device.games || [];
    const total = games.length;

    // 上线状态统计
    const onlineStatusMap = {};
    try { getFieldOptionsByKey('online_status').forEach(o => onlineStatusMap[o.value] = o.label); } catch(e) {}
    if (!onlineStatusMap['online']) Object.assign(onlineStatusMap, {'pending':'待上线','in_progress':'适配中','paused':'暂停适配','online':'已上线'});

    const statusCounts = {};
    games.forEach(g => {
        const s = g.onlineStatus || 'pending';
        const label = onlineStatusMap[s] || s;
        statusCounts[label] = (statusCounts[label] || 0) + 1;
    });

    // 品质统计
    const recommendedCnt = games.filter(g => g.quality === 'recommended').length;

    // 平均进度
    const avgProgress = total > 0 ? Math.round(games.reduce((sum, g) => sum + (g.adapterProgress || 0), 0) / total) : 0;

    let html = makeStatCard('游戏总数', total, true);
    Object.entries(statusCounts).forEach(([label, count]) => {
        if (count > 0) html += makeStatCard(label, count);
    });
    if (recommendedCnt > 0) html += makeStatCard('推荐', recommendedCnt);
    html += makeStatCard('平均进度', avgProgress + '%');

    container.innerHTML = html;
}

// 测试列表统计
function updateTestsModuleStats() {
    const container = document.getElementById('tests-stats-items');
    if (!container) return;
    const rows = document.querySelectorAll('#tests-table tr:not(.empty-state)');
    const total = rows.length;

    let html = makeStatCard('测试总数', total, true);
    container.innerHTML = html;
}

// 缺陷列表统计
function updateBugsModuleStats() {
    const container = document.getElementById('bugs-stats-items');
    if (!container) return;
    const rows = document.querySelectorAll('#bugs-table tr:not(.empty-state)');
    const total = rows.length;

    let html = makeStatCard('缺陷总数', total, true);
    container.innerHTML = html;
}

// 表单处理
function initForms() {
    // 成员表单
    document.getElementById('member-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('member-id').value;
        const data = {
            name: document.getElementById('member-name').value,
            wechat_id: document.getElementById('member-wechat-id').value,
            role: document.getElementById('member-role').value,
            duty: document.getElementById('member-duty').value,
            status: document.getElementById('member-status').value
        };

        const url = id ? `${API_BASE}/members/${id}` : `${API_BASE}/members`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeModal('member-modal');
                showToast(id ? '成员已更新' : '成员已添加', 'success');
                loadMembers();
                resetForm('member-form');
            }
        } catch (error) {
            console.error('保存成员失败:', error);
            showToast('保存失败', 'danger');
        }
    });

    // 设备表单
    document.getElementById('device-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('device-id').value;
        const data = {
            manufacturer: document.getElementById('device-manufacturer').value,
            device_type: document.getElementById('device-type').value,
            name: document.getElementById('device-name').value,
            requirements: document.getElementById('device-requirements').value,
            quantity: document.getElementById('device-quantity').value,
            keeper: document.getElementById('device-keeper').value,
            notes: document.getElementById('device-notes').value,
            adapter_completion_rate: document.getElementById('device-adapter-rate').value,
            total_bugs: document.getElementById('device-total-bugs').value,
            completed_adaptations: document.getElementById('device-completed-adaptations').value,
            total_games: document.getElementById('device-total-games').value,
            status: document.getElementById('device-status').value,
            assigned_to: document.getElementById('device-assigned').value || null
        };

        const url = id ? `${API_BASE}/devices/${id}` : `${API_BASE}/devices`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeModal('device-modal');
                showToast(id ? '设备已更新' : '设备已添加', 'success');
                loadDevices();
                resetForm('device-form');
            }
        } catch (error) {
            console.error('保存设备失败:', error);
            showToast('保存失败', 'danger');
        }
    });

    // 游戏表单
    document.getElementById('game-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('game-id').value;
        const data = {
            name: document.getElementById('game-name').value,
            english_name: document.getElementById('game-english-name').value,
            platform: document.getElementById('game-platform').value,
            game_id: document.getElementById('game-id-input').value,
            game_type: document.getElementById('game-type').value,
            description: document.getElementById('game-description').value,
            developer: document.getElementById('game-developer').value,
            operator: document.getElementById('game-operator').value,
            release_date: document.getElementById('game-release-date').value,
            config_path: document.getElementById('game-config-path').value,
            adapter_progress: document.getElementById('game-adapter-progress').value,
            version: document.getElementById('game-version').value,
            package_size: document.getElementById('game-package-size').value,
            adaptation_status: document.getElementById('game-adaptation-status').value,
            adaptation_notes: document.getElementById('game-adaptation-notes').value,
            owner_id: document.getElementById('game-owner').value,
            online_status: document.getElementById('game-online-status').value,
            quality: document.getElementById('game-quality').value,
            game_account: document.getElementById('game-account').value,
            storage_location: document.getElementById('game-storage-location').value
        };

        const url = id ? `${API_BASE}/games/${id}` : `${API_BASE}/games`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeModal('game-modal');
                showToast(id ? '游戏已更新' : '游戏已添加', 'success');
                await loadGames(); // 重新加载所有数据并重新筛选
                resetForm('game-form');
            }
        } catch (error) {
            console.error('保存游戏失败:', error);
            showToast('保存失败', 'danger');
        }
    });

    // 测试表单
    document.getElementById('test-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('test-id').value;
        const data = {
            name: document.getElementById('test-name').value,
            game_id: document.getElementById('test-game').value,
            device_id: document.getElementById('test-device').value,
            tester_id: document.getElementById('test-tester').value,
            test_date: document.getElementById('test-date').value,
            status: document.getElementById('test-status').value,
            priority: document.getElementById('test-priority').value,
            result: document.getElementById('test-result').value,
            bugs_count: document.getElementById('test-bugs').value,
            description: document.getElementById('test-description').value
        };

        const url = id ? `${API_BASE}/tests/${id}` : `${API_BASE}/tests`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeModal('test-modal');
                showToast(id ? '测试已更新' : '测试已添加', 'success');
                loadTests();
                resetForm('test-form');
            }
        } catch (error) {
            console.error('保存测试失败:', error);
            showToast('保存失败', 'danger');
        }
    });

    // 缺陷表单
    document.getElementById('bug-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('bug-id').value;
        const data = {
            versions: document.getElementById('bug-versions').value,
            device_name: document.getElementById('bug-device-name').value,
            discovery_time: document.getElementById('bug-discovery-time').value,
            owner: document.getElementById('bug-owner').value,
            bug_status: document.getElementById('bug-status').value,
            priority: document.getElementById('bug-priority').value,
            problem_type: document.getElementById('bug-problem-type').value,
            description: document.getElementById('bug-description').value,
            steps: document.getElementById('bug-steps').value,
            planned_fix_time: document.getElementById('bug-planned-fix-time').value,
            actual_fix_time: document.getElementById('bug-actual-fix-time').value
        };

        const url = id ? `${API_BASE}/bugs/${id}` : `${API_BASE}/bugs`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeModal('bug-modal');
                showToast(id ? '缺陷已更新' : '缺陷已添加', 'success');
                loadBugs();
                resetForm('bug-form');
            }
        } catch (error) {
            console.error('保存缺陷失败:', error);
            showToast('保存失败', 'danger');
        }
    });
}

// 模态框操作
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    resetForm(modalId.replace('-modal', '-form'));
}

// 点击模态框外部关闭
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        // 尝试获取 modal id 以正确重置表单
        const modalId = event.target.id;
        if (modalId) {
            closeModal(modalId);
        } else {
            event.target.style.display = 'none';
        }
    }
}

// 重置表单
function resetForm(formId) {
    document.getElementById(formId).reset();
    const idField = document.getElementById(formId.replace('-form', '-id'));
    if (idField) {
        idField.value = '';
    }
}

// 编辑成员
async function editMember(id) {
    try {
        const response = await authFetch(`${API_BASE}/members`);
        const result = await response.json();
        const member = result.data.find(m => m.id === id);

        if (member) {
            document.getElementById('member-id').value = member.id;
            document.getElementById('member-name').value = member.name;
            document.getElementById('member-wechat-id').value = member.wechat_id || '';
            document.getElementById('member-role').value = member.role || '';
            document.getElementById('member-duty').value = member.duty || '';
            document.getElementById('member-status').value = member.status;
            openModal('member-modal');
        }
    } catch (error) {
        console.error('加载成员失败:', error);
    }
}

// 删除成员
async function deleteMember(id) {
    showConfirm('确定要删除这个成员吗？', async () => {
        try {
            const response = await authFetch(`${API_BASE}/members/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('成员已删除', 'success');
                loadMembers();
            }
        } catch (error) {
            console.error('删除成员失败:', error);
            showToast('删除失败', 'danger');
        }
    });
}

// 编辑设备
async function editDevice(id) {
    try {
        const response = await authFetch(`${API_BASE}/devices`);
        const result = await response.json();
        const device = result.data.find(d => d.id === id);

        if (device) {
            document.getElementById('device-id').value = device.id;
            document.getElementById('device-manufacturer').value = device.manufacturer || '';
            document.getElementById('device-type').value = device.device_type || '';
            document.getElementById('device-name').value = device.name;
            document.getElementById('device-requirements').value = device.requirements || '';
            document.getElementById('device-quantity').value = device.quantity || 1;
            document.getElementById('device-keeper').value = device.keeper || '';
            document.getElementById('device-notes').value = device.notes || '';
            document.getElementById('device-adapter-rate').value = device.adapter_completion_rate || '';
            document.getElementById('device-total-bugs').value = device.total_bugs || 0;
            document.getElementById('device-completed-adaptations').value = device.completed_adaptations || 0;
            document.getElementById('device-total-games').value = device.total_games || 0;
            document.getElementById('device-status').value = device.status;
            document.getElementById('device-assigned').value = device.assigned_to || '';
            openModal('device-modal');
        }
    } catch (error) {
        console.error('加载设备失败:', error);
    }
}

// 删除设备
async function deleteDevice(id) {
    showConfirm('确定要删除这个设备吗？', async () => {
        try {
            const response = await authFetch(`${API_BASE}/devices/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('设备已删除', 'success');
                loadDevices();
            }
        } catch (error) {
            console.error('删除设备失败:', error);
            showToast('删除失败', 'danger');
        }
    });
}

// 编辑游戏
async function editGame(id) {
    try {
        const response = await authFetch(`${API_BASE}/games`);
        const result = await response.json();
        const game = result.data.find(g => g.id === id);

        if (game) {
            document.getElementById('game-id').value = game.id;
            document.getElementById('game-name').value = game.name;
            document.getElementById('game-english-name').value = game.english_name || '';
            document.getElementById('game-platform').value = game.platform || '';
            document.getElementById('game-id-input').value = game.game_id || '';
            document.getElementById('game-type').value = game.game_type || '';
            document.getElementById('game-description').value = game.description || '';
            document.getElementById('game-developer').value = game.developer || '';
            document.getElementById('game-operator').value = game.operator || '';
            document.getElementById('game-release-date').value = game.release_date || '';
            document.getElementById('game-config-path').value = game.config_path || '';
            document.getElementById('game-adapter-progress').value = game.adapter_progress || '';
            document.getElementById('game-version').value = game.version || '';
            document.getElementById('game-package-size').value = game.package_size || '';
            document.getElementById('game-adaptation-status').value = game.adaptation_status || '';
            document.getElementById('game-adaptation-notes').value = game.adaptation_notes || '';
            document.getElementById('game-owner').value = game.owner_id || '';
            document.getElementById('game-online-status').value = game.online_status || 'pending';
            document.getElementById('game-quality').value = game.quality || 'normal';
            document.getElementById('game-account').value = game.game_account || '';
            document.getElementById('game-storage-location').value = game.storage_location || '硬盘1号';
            openModal('game-modal');
        }
    } catch (error) {
        console.error('加载游戏失败:', error);
    }
}

// 删除游戏
async function deleteGame(id) {
    showConfirm('确定要删除这个游戏吗？', async () => {
        try {
            const response = await authFetch(`${API_BASE}/games/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('游戏已删除', 'success');
                await loadGames();
            }
        } catch (error) {
            console.error('删除游戏失败:', error);
            showToast('删除失败', 'danger');
        }
    });
}

// 编辑测试
async function editTest(id) {
    try {
        const response = await authFetch(`${API_BASE}/tests`);
        const result = await response.json();
        const test = result.data.find(t => t.id === id);

        if (test) {
            document.getElementById('test-id').value = test.id;
            document.getElementById('test-name').value = test.name;
            document.getElementById('test-game').value = test.game_id;
            document.getElementById('test-device').value = test.device_id;
            document.getElementById('test-tester').value = test.tester_id;
            document.getElementById('test-date').value = test.test_date || '';
            document.getElementById('test-status').value = test.status;
            document.getElementById('test-priority').value = test.priority;
            document.getElementById('test-result').value = test.result || '';
            document.getElementById('test-bugs').value = test.bugs_count || 0;
            document.getElementById('test-description').value = test.description || '';
            openModal('test-modal');
        }
    } catch (error) {
        console.error('加载测试失败:', error);
    }
}

// 删除测试
async function deleteTest(id) {
    showConfirm('确定要删除这个测试吗？', async () => {
        try {
            const response = await authFetch(`${API_BASE}/tests/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('测试已删除', 'success');
                loadTests();
            }
        } catch (error) {
            console.error('删除测试失败:', error);
            showToast('删除失败', 'danger');
        }
    });
}

// 编辑缺陷
async function editBug(id) {
    try {
        const response = await authFetch(`${API_BASE}/bugs`);
        const result = await response.json();
        const bug = result.data.find(b => b.id === id);

        if (bug) {
            document.getElementById('bug-id').value = bug.id;
            document.getElementById('bug-versions').value = bug.versions || '';
            document.getElementById('bug-device-name').value = bug.device_name || '';
            document.getElementById('bug-discovery-time').value = bug.discovery_time || '';
            document.getElementById('bug-owner').value = bug.owner || '';
            document.getElementById('bug-status').value = bug.bug_status;
            document.getElementById('bug-priority').value = bug.priority;
            document.getElementById('bug-problem-type').value = bug.problem_type || '';
            document.getElementById('bug-description').value = bug.description || '';
            document.getElementById('bug-steps').value = bug.steps || '';
            document.getElementById('bug-planned-fix-time').value = bug.planned_fix_time || '';
            document.getElementById('bug-actual-fix-time').value = bug.actual_fix_time || '';
            openModal('bug-modal');
        }
    } catch (error) {
        console.error('加载缺陷失败:', error);
    }
}

// 删除缺陷
async function deleteBug(id) {
    showConfirm('确定要删除这个缺陷吗？', async () => {
        try {
            const response = await authFetch(`${API_BASE}/bugs/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('缺陷已删除', 'success');
                loadBugs();
            }
        } catch (error) {
            console.error('删除缺陷失败:', error);
            showToast('删除失败', 'danger');
        }
    });
}

// 更新表头显示/隐藏
function updateColumnHeaders() {
    const thead = document.querySelector('#games-table').previousElementSibling;
    const headers = thead.querySelectorAll('th[data-field]');

    headers.forEach(header => {
        const field = header.getAttribute('data-field');
        if (visibleColumns[field]) {
            header.classList.remove('hidden-column');
        } else {
            header.classList.add('hidden-column');
        }
    });
}

// 切换字段显示设置面板
function toggleColumnSettings() {
    const panel = document.getElementById('column-settings');
    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

// 全选所有列
function selectAllColumns() {
    const checkboxes = document.querySelectorAll('.column-settings-panel input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
}

// 取消全选所有列
function deselectAllColumns() {
    const checkboxes = document.querySelectorAll('.column-settings-panel input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
}

// 应用列显示设置
function applyColumnSettings() {
    const checkboxes = document.querySelectorAll('.column-settings-panel input[type="checkbox"]');

    checkboxes.forEach(checkbox => {
        const field = checkbox.value;
        visibleColumns[field] = checkbox.checked;
    });

    // 重新渲染游戏列表
    renderGamesPage();

    // 隐藏设置面板
    toggleColumnSettings();

    // 可选:保存到localStorage
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
}

// 从localStorage加载列显示设置
function loadColumnSettings() {
    const savedSettings = localStorage.getItem('visibleColumns');
    if (savedSettings) {
        try {
            const saved = JSON.parse(savedSettings);
            
            // 合并保存的设置到默认设置中，新增字段默认显示
            // 这样旧的localStorage中没有的新字段会保持默认值true
            for (const key in saved) {
                if (key in visibleColumns) {
                    visibleColumns[key] = saved[key];
                }
            }

            // 更新设置面板中的复选框状态
            const checkboxes = document.querySelectorAll('.column-settings-panel input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                const field = checkbox.value;
                checkbox.checked = visibleColumns[field] || false;
            });
        } catch (error) {
            console.error('加载列显示设置失败:', error);
        }
    }
}

// ==================== 适配进展功能 ====================

// 加载适配进展数据
async function loadProgressData() {
    try {
        // 复用已加载的数据，仅在为空时才请求（避免重复请求）
        if (!allDevicesData || allDevicesData.length === 0) {
            const devicesResponse = await authFetch(`${API_BASE}/devices`);
            const devicesResult = await devicesResponse.json();
            allDevicesData = devicesResult.data || [];
        }

        if (!allGamesForProgress || allGamesForProgress.length === 0) {
            const gamesResponse = await authFetch(`${API_BASE}/games`);
            const gamesResult = await gamesResponse.json();
            allGamesForProgress = gamesResult.data || [];
        }

        // P0: 从后端加载适配记录（不再随机生成）
        await loadAdaptationRecords();

        // 生成设备tab
        renderDeviceTabs();

        console.log('适配进展数据加载完成');
    } catch (error) {
        console.error('加载适配进展数据失败:', error);
    }
}

// P0: 从后端API加载适配记录（优化：1个请求替代N个串行请求）
async function loadAdaptationRecords() {
    progressData = [];

    try {
        // 一次性获取所有适配记录（替代原来按设备逐个请求的N+1模式）
        const resp = await authFetch(`${API_BASE}/adaptations`);
        const result = await resp.json();
        const allRecords = result.data || [];

        // 按 device_id 分组
        const recordsByDevice = {};
        allRecords.forEach(r => {
            if (!recordsByDevice[r.device_id]) recordsByDevice[r.device_id] = [];
            recordsByDevice[r.device_id].push(r);
        });

        // 为每个设备构建 progressData
        for (const device of allDevicesData) {
            const records = recordsByDevice[device.id] || [];
            const deviceGames = records.map(r => ({
                id: r.id,
                deviceId: r.device_id,
                deviceName: device.name || r.device_name,
                gameId: r.game_id,
                gameName: r.game_name || '未知',
                gamePlatform: r.game_platform || '-',
                gameType: r.game_type || '-',
                adapterProgress: r.adapter_progress || 0,
                ownerName: r.owner_name || '-',
                onlineStatus: r.online_status || 'pending',
                quality: r.quality || 'normal'
            }));

            progressData.push({
                deviceId: device.id,
                deviceName: device.name,
                games: deviceGames
            });
        }
    } catch (e) {
        console.error('加载适配记录失败:', e);
        // fallback: 为每个设备创建空记录
        allDevicesData.forEach(device => {
            progressData.push({ deviceId: device.id, deviceName: device.name, games: [] });
        });
    }
}

// generateProgressData 保留为空操作（兼容旧代码调用）
function generateProgressData() {
    // P0: 不再随机生成,数据从后端加载
    console.log('generateProgressData 已废弃,数据从后端加载');
}

// 渲染设备tab
function renderDeviceTabs() {
    const tabContainer = document.getElementById('device-tab-container');
    tabContainer.innerHTML = '';

    progressData.forEach((deviceData, index) => {
        const tab = document.createElement('button');
        tab.className = 'device-tab' + (index === 0 ? ' active' : '');
        tab.textContent = deviceData.deviceName;
        tab.onclick = () => selectDevice(index);
        tabContainer.appendChild(tab);
    });

    // 默认选中第一个设备
    if (progressData.length > 0) {
        selectDevice(0);
    }
}

// 选择设备
function selectDevice(deviceIndex) {
    // 更新tab激活状态
    const tabs = document.querySelectorAll('.device-tab');
    tabs.forEach((tab, index) => {
        if (index === deviceIndex) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    currentDeviceId = deviceIndex;

    // 渲染该设备的游戏适配进展
    renderProgressTable(deviceIndex);
}

// 渲染适配进展表格
function renderProgressTable(deviceIndex) {
    const tbody = document.getElementById('progress-table');

    if (!progressData[deviceIndex] || progressData[deviceIndex].games.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    <div class="empty-icon">📊</div>
                    <div class="empty-text">暂无适配数据</div>
                    <div class="empty-sub">该设备暂无游戏适配记录</div>
                </td>
            </tr>
        `;
        updateProgressModuleStats(deviceIndex);
        return;
    }

    const games = progressData[deviceIndex].games;

    // 状态映射（动态从字段设置读取）
    const onlineStatusMap = {};
    getFieldOptionsByKey('online_status').forEach(o => onlineStatusMap[o.value] = o.label);
    // fallback
    if (!onlineStatusMap['pending']) Object.assign(onlineStatusMap, {'pending':'待上线','in_progress':'适配中','paused':'暂停适配','online':'已上线'});

    const qualityMap = {};
    getFieldOptionsByKey('quality').forEach(o => qualityMap[o.value] = o.label);
    if (!qualityMap['normal']) Object.assign(qualityMap, {'normal':'一般','recommended':'推荐'});

    tbody.innerHTML = games.map((gameData, index) => `
        <tr>
            <td class="text-center"><strong>${index + 1}</strong></td>
            <td>${escapeHtml(gameData.gameName)}</td>
            <td>${escapeHtml(gameData.gamePlatform || '-')}</td>
            <td>${escapeHtml(gameData.gameType || '-')}</td>
            <td>
                <div class="progress-bar-container">
                    <div class="progress-bar-track"><div class="progress-bar" style="width: ${gameData.adapterProgress}%"></div></div>
                    <span class="progress-text">${gameData.adapterProgress}%</span>
                </div>
            </td>
            <td class="editable-cell" data-field="ownerName" data-row-index="${index}" data-device-index="${deviceIndex}">
                <span class="cell-value">${escapeHtml(gameData.ownerName || '-')}</span>
                <span class="edit-icon">✎</span>
            </td>
            <td class="editable-cell" data-field="onlineStatus" data-row-index="${index}" data-device-index="${deviceIndex}">
                <span class="cell-value"><span class="status-badge status-${gameData.onlineStatus}">${escapeHtml(onlineStatusMap[gameData.onlineStatus] || '-')}</span></span>
                <span class="edit-icon">✎</span>
            </td>
            <td class="editable-cell" data-field="quality" data-row-index="${index}" data-device-index="${deviceIndex}">
                <span class="cell-value">${escapeHtml(qualityMap[gameData.quality] || '-')}</span>
                <span class="edit-icon">✎</span>
            </td>
            <td>
                <button class="btn btn-small btn-delete" onclick="deleteProgressItem(${deviceIndex}, ${gameData.id})">删除</button>
            </td>
        </tr>
    `).join('');

    // 为所有可编辑单元格添加点击事件
    const editableCells = tbody.querySelectorAll('.editable-cell');
    editableCells.forEach(cell => {
        cell.addEventListener('click', () => {
            const field = cell.dataset.field;
            const rowIndex = parseInt(cell.dataset.rowIndex);
            const deviceIndex = parseInt(cell.dataset.deviceIndex);
            showEditDropdown(cell, field, rowIndex, deviceIndex);
        });
    });

    // 更新适配进展统计
    updateProgressModuleStats(deviceIndex);
}

// 显示编辑下拉框
function showEditDropdown(cell, field, rowIndex, deviceIndex) {
    // 如果已经在编辑状态,不重复创建
    if (cell.classList.contains('editing')) {
        return;
    }

    const gameData = progressData[deviceIndex].games[rowIndex];
    cell.classList.add('editing');

    // 创建下拉选择框
    const select = document.createElement('select');
    select.className = 'edit-select';

    // 根据字段类型填充选项
    if (field === 'ownerName') {
        // 负责人: 从成员列表获取
        allMembersData.forEach(member => {
            const option = document.createElement('option');
            option.value = member.name;
            option.textContent = member.name;
            if (member.name === gameData.ownerName) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } else if (field === 'onlineStatus') {
        // 上线状态（从字段设置动态获取）
        let statuses = getFieldOptionsByKey('online_status').map(o => ({ value: o.value, text: o.label }));
        if (statuses.length === 0) statuses = [{value:'pending',text:'待上线'},{value:'in_progress',text:'适配中'},{value:'paused',text:'暂停适配'},{value:'online',text:'已上线'}];
        statuses.forEach(status => {
            const option = document.createElement('option');
            option.value = status.value;
            option.textContent = status.text;
            if (status.value === gameData.onlineStatus) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } else if (field === 'quality') {
        // 品质（从字段设置动态获取）
        let qualities = getFieldOptionsByKey('quality').map(o => ({ value: o.value, text: o.label }));
        if (qualities.length === 0) qualities = [{value:'normal',text:'一般'},{value:'recommended',text:'推荐'}];
        qualities.forEach(quality => {
            const option = document.createElement('option');
            option.value = quality.value;
            option.textContent = quality.text;
            if (quality.value === gameData.quality) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    // 隐藏原始值
    const cellValue = cell.querySelector('.cell-value');
    const editIcon = cell.querySelector('.edit-icon');
    cellValue.style.display = 'none';
    editIcon.style.display = 'none';

    // 添加下拉框
    cell.appendChild(select);
    select.focus();

    // 保存更改的函数
    const saveChanges = async () => {
        let newValue = select.value;
        let displayValue = newValue;

        // 根据字段类型处理值
        if (field === 'onlineStatus') {
            displayValue = `<span class="status-badge status-${newValue}">${getFieldOptionLabel('online_status', newValue)}</span>`;
            gameData.onlineStatus = newValue;
        } else if (field === 'quality') {
            displayValue = getFieldOptionLabel('quality', newValue);
            gameData.quality = newValue;
        } else if (field === 'ownerName') {
            displayValue = newValue;
            gameData.ownerName = newValue;
        }

        // 更新单元格显示
        cellValue.innerHTML = displayValue;
        cellValue.style.display = '';
        editIcon.style.display = '';

        // 移除下拉框和编辑状态
        select.remove();
        cell.classList.remove('editing');

        // P0: 同步更新到后端
        try {
            await authFetch(`${API_BASE}/adaptations/${gameData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    adapter_progress: gameData.adapterProgress,
                    owner_name: gameData.ownerName,
                    online_status: gameData.onlineStatus,
                    quality: gameData.quality
                })
            });
        } catch (e) {
            console.error('同步适配记录到后端失败:', e);
        }

        // 如果修改了上线状态，同步刷新设备列表的"适配游戏数"
        if (field === 'onlineStatus') {
            loadDevices();
        }

        console.log(`更新字段 ${field}: ${newValue}`, gameData);
    };

    // 事件监听
    select.addEventListener('change', saveChanges);
    select.addEventListener('blur', saveChanges);

    // 防止点击下拉框时触发单元格点击
    select.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// 删除适配进展项目
function deleteProgressItem(deviceIndex, itemId) {
    showConfirm('确定要删除这条适配记录吗？', async () => {
        try {
            // P0: 先删后端
            await authFetch(`${API_BASE}/adaptations/${itemId}`, { method: 'DELETE' });
        } catch (e) {
            console.error('删除适配记录失败:', e);
        }
        // 从进度数据中删除
        const deviceData = progressData[deviceIndex];
        deviceData.games = deviceData.games.filter(g => g.id !== itemId);

        // 重新渲染表格
        renderProgressTable(deviceIndex);
        showToast('已删除适配记录', 'success');
    });
}


// ==============================
// 适配进展 - 添加游戏 / 批量添加游戏
// ==============================

// 弹窗状态
let gameSelectSourceList = [];   // 源列表（可选游戏）
let gameSelectTargetList = [];   // 目标列表（已选游戏）
let gameSelectMode = 'single';   // 'single' 或 'batch'

// 打开添加游戏弹窗（单个添加，同样用穿梭框，选一个即可）
function openAddGameToProgress() {
    if (currentDeviceId === null && progressData.length > 0) {
        currentDeviceId = 0;
    }
    if (currentDeviceId === null) {
        alert('请先选择一个设备标签');
        return;
    }
    gameSelectMode = 'single';
    document.getElementById('game-select-modal-title').textContent = '添加游戏到适配列表';
    openGameSelectModal();
}

// 打开批量添加游戏弹窗
function openBatchAddGameToProgress() {
    if (currentDeviceId === null && progressData.length > 0) {
        currentDeviceId = 0;
    }
    if (currentDeviceId === null) {
        alert('请先选择一个设备标签');
        return;
    }
    gameSelectMode = 'batch';
    document.getElementById('game-select-modal-title').textContent = '批量添加游戏到适配列表';
    openGameSelectModal();
}

// 打开游戏选择弹窗
function openGameSelectModal() {
    // 获取当前设备已有的游戏ID列表
    const existingGameIds = new Set();
    if (progressData[currentDeviceId]) {
        progressData[currentDeviceId].games.forEach(g => {
            existingGameIds.add(g.gameId);
        });
    }

    // 构建源列表：排除当前设备已有的游戏
    gameSelectSourceList = allGamesForProgress
        .filter(game => !existingGameIds.has(game.id))
        .map(game => ({
            id: game.id,
            name: game.name,
            platform: game.platform || '-',
            gameType: game.game_type || '-',
            checked: false
        }));

    gameSelectTargetList = [];

    // 渲染列表
    renderSourceGameList();
    renderTargetGameList();

    // 清空搜索
    document.getElementById('game-select-search').value = '';
    document.getElementById('target-select-search').value = '';
    document.getElementById('select-all-games').checked = false;
    document.getElementById('select-all-target').checked = false;

    // 显示弹窗
    document.getElementById('game-select-modal').style.display = 'block';
}

// 关闭弹窗
function closeGameSelectModal() {
    document.getElementById('game-select-modal').style.display = 'none';
}

// 渲染源列表
function renderSourceGameList(filterText) {
    const container = document.getElementById('source-game-list');
    let items = gameSelectSourceList;

    if (filterText) {
        const keyword = filterText.toLowerCase();
        items = items.filter(g => g.name.toLowerCase().includes(keyword));
    }

    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无可用游戏</div>';
    } else {
        container.innerHTML = items.map((game, idx) => {
            const realIndex = gameSelectSourceList.indexOf(game);
            return `
                <div class="game-select-item ${game.checked ? 'selected' : ''}" onclick="toggleSourceGameCheck(${realIndex})" ondblclick="event.stopPropagation(); dblTransferSourceGame(${realIndex})">
                    <input type="checkbox" ${game.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleSourceGameCheck(${realIndex})">
                    <div class="game-select-item-info">
                        <span class="game-select-item-name">${escapeHtml(game.name)}</span>
                        <span class="game-select-item-meta">${escapeHtml(game.platform)} · ${escapeHtml(game.gameType)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateSourceCount();
}

// 双击左框游戏 → 移到右框（适配进展用）
function dblTransferSourceGame(i) {
    const item = gameSelectSourceList[i];
    if (!item) return;
    item.checked = false;
    gameSelectTargetList.push(item);
    gameSelectSourceList.splice(i, 1);
    document.getElementById('select-all-games').checked = false;
    renderSourceGameList(document.getElementById('game-select-search').value);
    renderTargetGameList(document.getElementById('target-select-search').value);
}

// 渲染目标列表
function renderTargetGameList(filterText) {
    const container = document.getElementById('target-game-list');
    let items = gameSelectTargetList;

    if (filterText) {
        const keyword = filterText.toLowerCase();
        items = items.filter(g => g.name.toLowerCase().includes(keyword));
    }

    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无数据</div>';
    } else {
        container.innerHTML = items.map((game, idx) => {
            const realIndex = gameSelectTargetList.indexOf(game);
            return `
                <div class="game-select-item ${game.checked ? 'selected' : ''}" onclick="toggleTargetGameCheck(${realIndex})" ondblclick="event.stopPropagation(); dblTransferTargetGame(${realIndex})">
                    <input type="checkbox" ${game.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleTargetGameCheck(${realIndex})">
                    <div class="game-select-item-info">
                        <span class="game-select-item-name">${escapeHtml(game.name)}</span>
                        <span class="game-select-item-meta">${escapeHtml(game.platform)} · ${escapeHtml(game.gameType)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateTargetCount();
}

// 双击右框游戏 → 移回左框（适配进展用）
function dblTransferTargetGame(i) {
    const item = gameSelectTargetList[i];
    if (!item) return;
    item.checked = false;
    gameSelectSourceList.push(item);
    gameSelectTargetList.splice(i, 1);
    document.getElementById('select-all-target').checked = false;
    renderSourceGameList(document.getElementById('game-select-search').value);
    renderTargetGameList(document.getElementById('target-select-search').value);
}

// 切换源列表游戏选中状态
function toggleSourceGameCheck(index) {
    gameSelectSourceList[index].checked = !gameSelectSourceList[index].checked;
    const filterText = document.getElementById('game-select-search').value;
    renderSourceGameList(filterText);
    updateSelectAllState();
}

// 切换目标列表游戏选中状态
function toggleTargetGameCheck(index) {
    gameSelectTargetList[index].checked = !gameSelectTargetList[index].checked;
    const filterText = document.getElementById('target-select-search').value;
    renderTargetGameList(filterText);
    updateTargetSelectAllState();
}

// 源列表全选/取消全选
function toggleSelectAllGames() {
    const checked = document.getElementById('select-all-games').checked;
    const filterText = document.getElementById('game-select-search').value;

    if (filterText) {
        // 如果有搜索，只全选/取消当前可见的
        const keyword = filterText.toLowerCase();
        gameSelectSourceList.forEach(g => {
            if (g.name.toLowerCase().includes(keyword)) {
                g.checked = checked;
            }
        });
    } else {
        gameSelectSourceList.forEach(g => g.checked = checked);
    }

    renderSourceGameList(filterText);
}

// 目标列表全选/取消全选
function toggleSelectAllTarget() {
    const checked = document.getElementById('select-all-target').checked;
    const filterText = document.getElementById('target-select-search').value;

    if (filterText) {
        const keyword = filterText.toLowerCase();
        gameSelectTargetList.forEach(g => {
            if (g.name.toLowerCase().includes(keyword)) {
                g.checked = checked;
            }
        });
    } else {
        gameSelectTargetList.forEach(g => g.checked = checked);
    }

    renderTargetGameList(filterText);
}

// 将选中的游戏从源列表移到目标列表
function transferGamesToTarget() {
    const toTransfer = gameSelectSourceList.filter(g => g.checked);
    if (toTransfer.length === 0) return;

    // 移到目标列表，重置checked
    toTransfer.forEach(g => {
        g.checked = false;
        gameSelectTargetList.push(g);
    });

    // 从源列表移除
    gameSelectSourceList = gameSelectSourceList.filter(g => !toTransfer.includes(g));

    // 清空搜索和全选
    document.getElementById('select-all-games').checked = false;
    document.getElementById('select-all-target').checked = false;

    const sourceFilter = document.getElementById('game-select-search').value;
    const targetFilter = document.getElementById('target-select-search').value;
    renderSourceGameList(sourceFilter);
    renderTargetGameList(targetFilter);
}

// 将选中的游戏从目标列表移回源列表
function transferGamesFromTarget() {
    const toTransfer = gameSelectTargetList.filter(g => g.checked);
    if (toTransfer.length === 0) return;

    // 移回源列表，重置checked
    toTransfer.forEach(g => {
        g.checked = false;
        gameSelectSourceList.push(g);
    });

    // 从目标列表移除
    gameSelectTargetList = gameSelectTargetList.filter(g => !toTransfer.includes(g));

    // 清空全选
    document.getElementById('select-all-games').checked = false;
    document.getElementById('select-all-target').checked = false;

    const sourceFilter = document.getElementById('game-select-search').value;
    const targetFilter = document.getElementById('target-select-search').value;
    renderSourceGameList(sourceFilter);
    renderTargetGameList(targetFilter);
}

// 搜索过滤源列表
function filterGameSelectList() {
    const filterText = document.getElementById('game-select-search').value;
    renderSourceGameList(filterText);
    updateSelectAllState();
}

// 搜索过滤目标列表
function filterTargetSelectList() {
    const filterText = document.getElementById('target-select-search').value;
    renderTargetGameList(filterText);
    updateTargetSelectAllState();
}

// 更新源列表计数
function updateSourceCount() {
    const checkedCount = gameSelectSourceList.filter(g => g.checked).length;
    const totalCount = gameSelectSourceList.length;
    document.getElementById('source-game-count').textContent = `${checkedCount}/${totalCount}`;
}

// 更新目标列表计数
function updateTargetCount() {
    const checkedCount = gameSelectTargetList.filter(g => g.checked).length;
    const totalCount = gameSelectTargetList.length;
    document.getElementById('target-game-count').textContent = `${checkedCount}/${totalCount}`;
}

// 更新源列表全选状态
function updateSelectAllState() {
    const filterText = document.getElementById('game-select-search').value;
    let visibleItems = gameSelectSourceList;
    if (filterText) {
        const keyword = filterText.toLowerCase();
        visibleItems = visibleItems.filter(g => g.name.toLowerCase().includes(keyword));
    }
    const allChecked = visibleItems.length > 0 && visibleItems.every(g => g.checked);
    document.getElementById('select-all-games').checked = allChecked;
}

// 更新目标列表全选状态
function updateTargetSelectAllState() {
    const filterText = document.getElementById('target-select-search').value;
    let visibleItems = gameSelectTargetList;
    if (filterText) {
        const keyword = filterText.toLowerCase();
        visibleItems = visibleItems.filter(g => g.name.toLowerCase().includes(keyword));
    }
    const allChecked = visibleItems.length > 0 && visibleItems.every(g => g.checked);
    document.getElementById('select-all-target').checked = allChecked;
}

// 确认添加游戏到适配进展
async function confirmAddGamesToProgress() {
    if (gameSelectTargetList.length === 0) {
        showToast('请先将游戏添加到目标列表', 'warning');
        return;
    }

    const deviceIndex = currentDeviceId;
    if (!progressData[deviceIndex]) return;

    const deviceId = progressData[deviceIndex].deviceId;

    // P0: 批量写入后端
    const records = gameSelectTargetList.map(game => ({
        device_id: deviceId,
        game_id: game.id,
        adapter_progress: 0,
        owner_name: '-',
        online_status: 'pending',
        quality: 'normal'
    }));

    try {
        const resp = await authFetch(`${API_BASE}/adaptations/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records })
        });
        const result = await resp.json();

        if (result.success) {
            // 重新从后端加载该设备的适配记录
            const reloadResp = await authFetch(`${API_BASE}/adaptations/device/${deviceId}`);
            const reloadResult = await reloadResp.json();
            const reloadedRecords = reloadResult.data || [];

            progressData[deviceIndex].games = reloadedRecords.map(r => ({
                id: r.id,
                deviceId: r.device_id,
                deviceName: progressData[deviceIndex].deviceName,
                gameId: r.game_id,
                gameName: r.game_name || '未知',
                gamePlatform: r.game_platform || '-',
                gameType: r.game_type || '-',
                adapterProgress: r.adapter_progress || 0,
                ownerName: r.owner_name || '-',
                onlineStatus: r.online_status || 'pending',
                quality: r.quality || 'normal'
            }));

            showToast(`已添加 ${gameSelectTargetList.length} 个游戏`, 'success');
        }
    } catch (e) {
        console.error('批量添加适配记录失败:', e);
        showToast('添加失败，请重试', 'danger');
    }

    // 关闭弹窗
    closeGameSelectModal();

    // 重新渲染表格
    renderProgressTable(deviceIndex);
}


// ==============================
// 配置计划模块
// ==============================

// 配置计划数据
let configPlans = [];           // 所有计划
let currentPlanIndex = null;    // 当前选中的计划索引

// 机型选择弹窗数据
let deviceSelectSourceList = [];
let deviceSelectTargetList = [];

// 游戏选择弹窗数据（配置计划用）
let planGameSelectSourceList = [];
let planGameSelectTargetList = [];

// 创建计划表单中已选的机型和游戏
let planSelectedDevices = [];
let planSelectedGames = [];

// 假缺陷数据（用于调试）
const mockBugsData = [
    { id: 1, gameName: '原神', description: '角色模型在3D模式下渲染异常', bug_status: 'open', priority: 'high', owner: '张三' },
    { id: 2, gameName: '原神', description: '切换场景时画面闪烁', bug_status: 'in_progress', priority: 'medium', owner: '李四' },
    { id: 3, gameName: '王者荣耀', description: '技能特效深度显示错误', bug_status: 'fixed', priority: 'high', owner: '王五' },
    { id: 4, gameName: '和平精英', description: '瞄准镜3D效果偏移', bug_status: 'open', priority: 'high', owner: '赵六' },
    { id: 5, gameName: '和平精英', description: '载具模型穿透问题', bug_status: 'in_progress', priority: 'medium', owner: '张三' },
    { id: 6, gameName: '崩坏：星穹铁道', description: 'UI界面在3D模式下层级错误', bug_status: 'open', priority: 'low', owner: '李四' },
    { id: 7, gameName: '英雄联盟手游', description: '小地图3D显示重叠', bug_status: 'closed', priority: 'medium', owner: '王五' },
    { id: 8, gameName: 'CSGO', description: '烟雾弹效果在3D模式异常', bug_status: 'open', priority: 'high', owner: '赵六' },
    { id: 9, gameName: '使命召唤手游', description: '开镜时画面抖动', bug_status: 'in_progress', priority: 'high', owner: '张三' },
    { id: 10, gameName: '暗黑破坏神：不朽', description: '装备界面3D模型失真', bug_status: 'open', priority: 'medium', owner: '李四' },
    { id: 11, gameName: '阴阳师', description: '式神召唤动画3D效果缺失', bug_status: 'fixed', priority: 'low', owner: '王五' },
    { id: 12, gameName: '明日方舟', description: '战斗画面帧率在3D模式下掉帧严重', bug_status: 'open', priority: 'high', owner: '赵六' },
];

// ========== 视图切换 ==========

function showCreatePlanView() {
    document.getElementById('plan-list-view').style.display = 'none';
    document.getElementById('plan-create-view').style.display = 'block';

    // 重置表单
    document.getElementById('plan-form').reset();
    planSelectedDevices = [];
    planSelectedGames = [];
    renderPlanDeviceTags();
    renderPlanGameTags();

    // 设置默认日期为今天
    document.getElementById('plan-date').value = new Date().toISOString().split('T')[0];
}

function showPlanListView() {
    document.getElementById('plan-create-view').style.display = 'none';
    document.getElementById('plan-list-view').style.display = 'block';
}

// ========== 创建计划表单 ==========

// 渲染已选机型标签
function renderPlanDeviceTags() {
    const container = document.getElementById('plan-devices-tags');
    container.innerHTML = planSelectedDevices.map((device, i) =>
        `<span class="tag-item">${escapeHtml(device.name)} <span class="tag-remove" onclick="removePlanDevice(${i})">×</span></span>`
    ).join('');
}

// 渲染已选游戏标签
function renderPlanGameTags() {
    const container = document.getElementById('plan-games-tags');
    container.innerHTML = planSelectedGames.map((game, i) =>
        `<span class="tag-item">${escapeHtml(game.name)} <span class="tag-remove" onclick="removePlanGame(${i})">×</span></span>`
    ).join('');
}

function removePlanDevice(index) {
    planSelectedDevices.splice(index, 1);
    renderPlanDeviceTags();
}

function removePlanGame(index) {
    planSelectedGames.splice(index, 1);
    renderPlanGameTags();
}

// 提交计划
async function submitPlan(event) {
    event.preventDefault();

    const title = document.getElementById('plan-title').value.trim();
    const date = document.getElementById('plan-date').value;
    const interlaceVersion = document.getElementById('plan-interlace-version').value.trim();
    const clientVersion = document.getElementById('plan-client-version').value.trim();
    const goal = document.getElementById('plan-goal').value.trim();

    if (planSelectedDevices.length === 0) {
        showToast('请至少选择一个机型', 'warning');
        return;
    }

    if (planSelectedGames.length === 0) {
        showToast('请至少选择一个游戏', 'warning');
        return;
    }

    // 生成Tab名称: 机型+日期
    const tabName = planSelectedDevices.map(d => d.name).join('+') + ' ' + date;

    // P0: 写入后端
    const payload = {
        title,
        plan_date: date,
        devices_json: JSON.stringify(planSelectedDevices),
        interlace_version: interlaceVersion,
        client_version: clientVersion,
        goal,
        tab_name: tabName,
        games: planSelectedGames.map((game, i) => ({
            game_id: game.id,
            game_name: game.name,
            game_platform: game.platform || '-',
            owner_name: game.ownerName || '-',
            adapt_status: 'not_started',
            remark: '',
            sort_order: i
        }))
    };

    try {
        const resp = await authFetch(`${API_BASE}/plans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await resp.json();

        if (result.success) {
            showToast('配置计划创建成功', 'success');
            // 重新加载所有计划
            await loadConfigPlans();
            // 返回列表视图
            showPlanListView();
            // 选中最新的计划
            if (configPlans.length > 0) selectPlan(0); // 按 created_at DESC 排序，最新在前
        } else {
            showToast('创建失败: ' + (result.error || '未知错误'), 'danger');
        }
    } catch (e) {
        console.error('创建配置计划失败:', e);
        showToast('创建失败，请重试', 'danger');
    }
}

// P0: 从后端加载所有配置计划
async function loadConfigPlans() {
    try {
        const resp = await authFetch(`${API_BASE}/plans`);
        const result = await resp.json();

        if (result.success && result.data) {
            configPlans = result.data.map(p => ({
                id: p.id,
                title: p.title,
                date: p.plan_date,
                devices: JSON.parse(p.devices_json || '[]'),
                interlaceVersion: p.interlace_version || '',
                clientVersion: p.client_version || '',
                goal: p.goal || '',
                tabName: p.tab_name || p.title,
                createdAt: p.created_at,
                games: [] // 详情按需加载
            }));
        } else {
            configPlans = [];
        }

        renderPlanTabs();
    } catch (e) {
        console.error('加载配置计划失败:', e);
        configPlans = [];
    }
}

// P0: 从后端加载单个计划详情（含游戏列表）
async function loadPlanDetail(planId) {
    try {
        const resp = await authFetch(`${API_BASE}/plans/${planId}`);
        const result = await resp.json();

        if (result.success && result.data) {
            const plan = result.data;
            const planIndex = configPlans.findIndex(p => p.id === planId);
            if (planIndex >= 0) {
                configPlans[planIndex].games = (plan.games || []).map(g => ({
                    id: g.id,
                    gameId: g.game_id,
                    name: g.game_name || '未知',
                    platform: g.game_platform || '-',
                    gameType: '-',
                    ownerName: g.owner_name || '-',
                    adaptStatus: g.adapt_status || 'not_started',
                    remark: g.remark || '',
                    bugs: [] // 缺陷关联后续可扩展
                }));
            }
        }
    } catch (e) {
        console.error('加载计划详情失败:', e);
    }
}

// 为游戏随机分配缺陷数据
function getRandomBugsForGame(gameName) {
    // 先找同名游戏的缺陷
    const matchedBugs = mockBugsData.filter(b => b.gameName === gameName);
    if (matchedBugs.length > 0) {
        return matchedBugs;
    }

    // 随机决定是否有缺陷（60%概率有缺陷）
    if (Math.random() > 0.6) {
        return [];
    }

    // 随机选1-3条缺陷并修改游戏名
    const count = Math.floor(Math.random() * 3) + 1;
    const shuffled = [...mockBugsData].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(b => ({
        ...b,
        id: Date.now() + Math.random(),
        gameName: gameName
    }));
}

// ========== 计划Tabs ==========

function renderPlanTabs() {
    const container = document.getElementById('plan-tab-container');
    container.innerHTML = '';

    configPlans.forEach((plan, index) => {
        const tab = document.createElement('button');
        tab.className = 'device-tab' + (index === currentPlanIndex ? ' active' : '');
        tab.textContent = plan.tabName;
        tab.title = plan.title;
        tab.onclick = () => selectPlan(index);
        container.appendChild(tab);
    });
}

async function selectPlan(planIndex) {
    currentPlanIndex = planIndex;

    // 更新Tab激活状态
    const tabs = document.querySelectorAll('#plan-tab-container .device-tab');
    tabs.forEach((tab, i) => {
        tab.classList.toggle('active', i === planIndex);
    });

    // P0: 先从后端加载详情
    const plan = configPlans[planIndex];
    if (plan && plan.id && (!plan.games || plan.games.length === 0)) {
        await loadPlanDetail(plan.id);
    }

    // 渲染计划详情
    renderPlanDetail(planIndex);
}

function renderPlanDetail(planIndex) {
    const plan = configPlans[planIndex];
    if (!plan) return;

    const detailArea = document.getElementById('plan-detail-area');

    // 生成信息栏 + 表格
    let html = `
        <div class="plan-info-bar">
            <div class="plan-info-item"><span class="info-label">标题：</span><span class="info-value">${escapeHtml(plan.title)}</span></div>
            <div class="plan-info-item"><span class="info-label">日期：</span><span class="info-value">${escapeHtml(plan.date)}</span></div>
            <div class="plan-info-item"><span class="info-label">机型：</span><span class="info-value">${plan.devices.map(d => escapeHtml(d.name)).join('、')}</span></div>
            ${plan.interlaceVersion ? `<div class="plan-info-item"><span class="info-label">交织版本：</span><span class="info-value">${escapeHtml(plan.interlaceVersion)}</span></div>` : ''}
            ${plan.clientVersion ? `<div class="plan-info-item"><span class="info-label">客户端版本：</span><span class="info-value">${escapeHtml(plan.clientVersion)}</span></div>` : ''}
            ${plan.goal ? `<div class="plan-info-item"><span class="info-label">目标说明：</span><span class="info-value">${escapeHtml(plan.goal)}</span></div>` : ''}
            <div class="plan-info-item" style="margin-left:auto;"><button class="btn btn-small btn-delete" onclick="deletePlan(${planIndex})">🗑️ 删除此计划</button></div>
        </div>
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th width="50">序号</th>
                        <th>游戏名称</th>
                        <th>游戏平台</th>
                        <th>负责人</th>
                        <th>适配进展</th>
                        <th>问题备注</th>
                        <th>缺陷列表</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (plan.games.length === 0) {
        html += `
            <tr>
                <td colspan="8" class="empty-state">
                    <div class="empty-icon">📋</div>
                    <div class="empty-text">暂无游戏</div>
                </td>
            </tr>
        `;
    } else {
        plan.games.forEach((game, index) => {
            const adaptStatusMap = {};
            getFieldOptionsByKey('plan_adapt_status').forEach(o => adaptStatusMap[o.value] = o.label);
            if (!adaptStatusMap['not_started']) Object.assign(adaptStatusMap, {'not_started':'未开始','adapting':'适配中','finished':'已结束'});

            const bugCount = game.bugs ? game.bugs.length : 0;

            html += `
                <tr>
                    <td class="text-center"><strong>${index + 1}</strong></td>
                    <td>${escapeHtml(game.name)}</td>
                    <td>${escapeHtml(game.platform)}</td>
                    <td class="editable-cell" onclick="editPlanGameOwner(${planIndex}, ${index}, this)">
                        <span class="cell-value">${escapeHtml(game.ownerName || '-')}</span>
                        <span class="edit-icon">✎</span>
                    </td>
                    <td>
                        <select class="adapt-status-select" onchange="updatePlanGameAdaptStatus(${planIndex}, ${index}, this.value)">
                            ${(getFieldOptionsByKey('plan_adapt_status').length > 0 
                                ? getFieldOptionsByKey('plan_adapt_status') 
                                : [{value:'not_started',label:'未开始'},{value:'adapting',label:'适配中'},{value:'finished',label:'已结束'}]
                            ).map(o => `<option value="${o.value}" ${game.adaptStatus === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
                        </select>
                    </td>
                    <td>
                        <input type="text" class="remark-input" value="${escapeHtml(game.remark || '')}"
                            placeholder="输入备注..."
                            onchange="updatePlanGameRemark(${planIndex}, ${index}, this.value)">
                    </td>
                    <td>
                        ${bugCount > 0
                            ? `<span class="bug-count-badge" onclick="showPlanBugDetail(${planIndex}, ${index})">🐛 ${bugCount} 个缺陷</span>`
                            : `<span class="bug-count-badge no-bugs">✅ 无缺陷</span>`
                        }
                    </td>
                    <td>
                        <button class="btn btn-small btn-delete" onclick="deletePlanGame(${planIndex}, ${index})">删除</button>
                    </td>
                </tr>
            `;
        });
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    detailArea.innerHTML = html;
}

// ========== 计划详情操作 ==========

// P0: 删除整个计划
function deletePlan(planIndex) {
    const plan = configPlans[planIndex];
    if (!plan) return;
    showConfirm(`确定要删除计划「${plan.title || plan.tabName}」吗？此操作不可撤销。`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/plans/${plan.id}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('计划已删除', 'success');
                await loadConfigPlans();
                if (configPlans.length > 0) {
                    selectPlan(0);
                } else {
                    currentPlanIndex = -1;
                    document.getElementById('plan-detail-area').innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">暂无配置计划</div></div>';
                }
            } else {
                showToast('删除失败: ' + (result.error || '未知错误'), 'danger');
            }
        } catch (e) {
            console.error('删除计划失败:', e);
            showToast('删除失败，请重试', 'danger');
        }
    });
}

// P0: 同步计划游戏变更到后端
async function syncPlanGameChange(game, fields) {
    if (!game.id) return; // 无后端ID则跳过
    try {
        await authFetch(`${API_BASE}/plans/game/${game.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields)
        });
    } catch (e) {
        console.error('同步计划游戏变更失败:', e);
    }
}

// 编辑负责人
function editPlanGameOwner(planIndex, gameIndex, cell) {
    if (cell.classList.contains('editing')) return;
    cell.classList.add('editing');

    const game = configPlans[planIndex].games[gameIndex];
    const select = document.createElement('select');
    select.className = 'edit-select';

    // 添加默认选项
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '-';
    defaultOpt.textContent = '未分配';
    select.appendChild(defaultOpt);

    allMembersData.forEach(member => {
        const opt = document.createElement('option');
        opt.value = member.name;
        opt.textContent = member.name;
        if (member.name === game.ownerName) opt.selected = true;
        select.appendChild(opt);
    });

    const cellValue = cell.querySelector('.cell-value');
    const editIcon = cell.querySelector('.edit-icon');
    cellValue.style.display = 'none';
    editIcon.style.display = 'none';
    cell.appendChild(select);
    select.focus();

    const save = () => {
        game.ownerName = select.value;
        cellValue.textContent = game.ownerName;
        cellValue.style.display = '';
        editIcon.style.display = '';
        select.remove();
        cell.classList.remove('editing');
        // P0: 同步到后端
        syncPlanGameChange(game, { owner_name: game.ownerName });
    };

    select.addEventListener('change', save);
    select.addEventListener('blur', save);
    select.addEventListener('click', e => e.stopPropagation());
}

// 更新适配进展状态
function updatePlanGameAdaptStatus(planIndex, gameIndex, value) {
    const game = configPlans[planIndex].games[gameIndex];
    game.adaptStatus = value;
    // P0: 同步到后端
    syncPlanGameChange(game, { adapt_status: value });
}

// 更新问题备注
function updatePlanGameRemark(planIndex, gameIndex, value) {
    const game = configPlans[planIndex].games[gameIndex];
    game.remark = value;
    // P0: 同步到后端
    syncPlanGameChange(game, { remark: value });
}

// P0: 删除游戏（调用后端API）
function deletePlanGame(planIndex, gameIndex) {
    const game = configPlans[planIndex].games[gameIndex];
    showConfirm(`确定要删除游戏「${game.name || ''}」吗？`, async () => {
        if (game.id) {
            try {
                await authFetch(`${API_BASE}/plans/game/${game.id}`, { method: 'DELETE' });
            } catch (e) {
                console.error('删除计划游戏失败:', e);
                showToast('删除失败，请重试', 'danger');
                return;
            }
        }
        configPlans[planIndex].games.splice(gameIndex, 1);
        renderPlanDetail(planIndex);
        showToast('游戏已删除', 'success');
    });
}

// 显示缺陷详情弹窗
function showPlanBugDetail(planIndex, gameIndex) {
    const game = configPlans[planIndex].games[gameIndex];
    const bugs = game.bugs || [];

    const tbody = document.getElementById('bug-detail-table');

    if (bugs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-text">无缺陷</div></td></tr>`;
    } else {
        tbody.innerHTML = bugs.map((bug, i) => `
            <tr>
                <td class="text-center">${i + 1}</td>
                <td>${escapeHtml(bug.description)}</td>
                <td><span class="status-badge status-${bug.bug_status}">${getBugStatusText(bug.bug_status)}</span></td>
                <td><span class="priority-badge priority-${bug.priority}">${getPriorityText(bug.priority)}</span></td>
                <td>${escapeHtml(bug.owner || '-')}</td>
            </tr>
        `).join('');
    }

    document.getElementById('bug-detail-modal').style.display = 'block';
}

function closeBugDetailModal() {
    document.getElementById('bug-detail-modal').style.display = 'none';
}

// ========== 机型选择弹窗 ==========

function openDeviceSelectModal() {
    // 构建源列表：排除已选的机型
    const selectedIds = new Set(planSelectedDevices.map(d => d.id));
    deviceSelectSourceList = allDevicesData
        .filter(d => !selectedIds.has(d.id))
        .map(d => ({ id: d.id, name: d.name, manufacturer: d.manufacturer || '-', checked: false }));
    deviceSelectTargetList = [];

    renderDeviceSourceList();
    renderDeviceTargetList();

    document.getElementById('device-select-search').value = '';
    document.getElementById('device-target-search').value = '';
    document.getElementById('select-all-devices-src').checked = false;
    document.getElementById('select-all-devices-tgt').checked = false;

    document.getElementById('device-select-modal').style.display = 'block';
}

function closeDeviceSelectModal() {
    document.getElementById('device-select-modal').style.display = 'none';
}

function renderDeviceSourceList(filterText) {
    const container = document.getElementById('device-source-list');
    let items = deviceSelectSourceList;
    if (filterText) {
        const kw = filterText.toLowerCase();
        items = items.filter(d => d.name.toLowerCase().includes(kw));
    }
    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无可用机型</div>';
    } else {
        container.innerHTML = items.map(d => {
            const ri = deviceSelectSourceList.indexOf(d);
            return `<div class="game-select-item ${d.checked ? 'selected' : ''}" onclick="toggleDeviceSrc(${ri})" ondblclick="event.stopPropagation(); dblTransferDeviceSrc(${ri})">
                <input type="checkbox" ${d.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleDeviceSrc(${ri})">
                <div class="game-select-item-info">
                    <span class="game-select-item-name">${escapeHtml(d.name)}</span>
                    <span class="game-select-item-meta">${escapeHtml(d.manufacturer)}</span>
                </div>
            </div>`;
        }).join('');
    }
    const checked = deviceSelectSourceList.filter(d => d.checked).length;
    document.getElementById('device-src-count').textContent = `${checked}/${deviceSelectSourceList.length}`;
}

// 双击左框item → 移到右框
function dblTransferDeviceSrc(i) {
    const item = deviceSelectSourceList[i];
    if (!item) return;
    item.checked = false;
    deviceSelectTargetList.push(item);
    deviceSelectSourceList.splice(i, 1);
    document.getElementById('select-all-devices-src').checked = false;
    renderDeviceSourceList(document.getElementById('device-select-search').value);
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function renderDeviceTargetList(filterText) {
    const container = document.getElementById('device-target-list');
    let items = deviceSelectTargetList;
    if (filterText) {
        const kw = filterText.toLowerCase();
        items = items.filter(d => d.name.toLowerCase().includes(kw));
    }
    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无数据</div>';
    } else {
        container.innerHTML = items.map(d => {
            const ri = deviceSelectTargetList.indexOf(d);
            return `<div class="game-select-item ${d.checked ? 'selected' : ''}" onclick="toggleDeviceTgt(${ri})" ondblclick="event.stopPropagation(); dblTransferDeviceTgt(${ri})">
                <input type="checkbox" ${d.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleDeviceTgt(${ri})">
                <div class="game-select-item-info">
                    <span class="game-select-item-name">${escapeHtml(d.name)}</span>
                    <span class="game-select-item-meta">${escapeHtml(d.manufacturer)}</span>
                </div>
            </div>`;
        }).join('');
    }
    const checked = deviceSelectTargetList.filter(d => d.checked).length;
    document.getElementById('device-tgt-count').textContent = `${checked}/${deviceSelectTargetList.length}`;
}

// 双击右框item → 移回左框
function dblTransferDeviceTgt(i) {
    const item = deviceSelectTargetList[i];
    if (!item) return;
    item.checked = false;
    deviceSelectSourceList.push(item);
    deviceSelectTargetList.splice(i, 1);
    document.getElementById('select-all-devices-tgt').checked = false;
    renderDeviceSourceList(document.getElementById('device-select-search').value);
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function toggleDeviceSrc(i) {
    deviceSelectSourceList[i].checked = !deviceSelectSourceList[i].checked;
    renderDeviceSourceList(document.getElementById('device-select-search').value);
}

function toggleDeviceTgt(i) {
    deviceSelectTargetList[i].checked = !deviceSelectTargetList[i].checked;
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function toggleSelectAllDevicesSrc() {
    const checked = document.getElementById('select-all-devices-src').checked;
    deviceSelectSourceList.forEach(d => d.checked = checked);
    renderDeviceSourceList(document.getElementById('device-select-search').value);
}

function toggleSelectAllDevicesTgt() {
    const checked = document.getElementById('select-all-devices-tgt').checked;
    deviceSelectTargetList.forEach(d => d.checked = checked);
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function transferDevicesToTarget() {
    const toTransfer = deviceSelectSourceList.filter(d => d.checked);
    if (!toTransfer.length) return;
    toTransfer.forEach(d => { d.checked = false; deviceSelectTargetList.push(d); });
    deviceSelectSourceList = deviceSelectSourceList.filter(d => !toTransfer.includes(d));
    document.getElementById('select-all-devices-src').checked = false;
    renderDeviceSourceList(document.getElementById('device-select-search').value);
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function transferDevicesFromTarget() {
    const toTransfer = deviceSelectTargetList.filter(d => d.checked);
    if (!toTransfer.length) return;
    toTransfer.forEach(d => { d.checked = false; deviceSelectSourceList.push(d); });
    deviceSelectTargetList = deviceSelectTargetList.filter(d => !toTransfer.includes(d));
    document.getElementById('select-all-devices-tgt').checked = false;
    renderDeviceSourceList(document.getElementById('device-select-search').value);
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function filterDeviceSelectList() {
    renderDeviceSourceList(document.getElementById('device-select-search').value);
}

function filterDeviceTargetList() {
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function confirmDeviceSelect() {
    if (deviceSelectTargetList.length === 0) {
        alert('请先选择机型');
        return;
    }
    planSelectedDevices = [...planSelectedDevices, ...deviceSelectTargetList.map(d => ({ id: d.id, name: d.name }))];
    renderPlanDeviceTags();
    closeDeviceSelectModal();
}

// ========== 游戏选择弹窗（配置计划用） ==========

function openPlanGameSelectModal() {
    const selectedIds = new Set(planSelectedGames.map(g => g.id));
    planGameSelectSourceList = allGamesForProgress
        .filter(g => !selectedIds.has(g.id))
        .map(g => ({
            id: g.id,
            name: g.name,
            platform: g.platform || '-',
            gameType: g.game_type || '-',
            ownerName: g.owner_name || '-',
            checked: false
        }));
    planGameSelectTargetList = [];

    renderPlanGameSourceList();
    renderPlanGameTargetList();

    document.getElementById('plan-game-select-search').value = '';
    document.getElementById('plan-game-target-search').value = '';
    document.getElementById('select-all-plan-games-src').checked = false;
    document.getElementById('select-all-plan-games-tgt').checked = false;

    document.getElementById('plan-game-select-modal').style.display = 'block';
}

function closePlanGameSelectModal() {
    document.getElementById('plan-game-select-modal').style.display = 'none';
}

function renderPlanGameSourceList(filterText) {
    const container = document.getElementById('plan-game-source-list');
    let items = planGameSelectSourceList;
    if (filterText) {
        const kw = filterText.toLowerCase();
        items = items.filter(g => g.name.toLowerCase().includes(kw));
    }
    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无可用游戏</div>';
    } else {
        container.innerHTML = items.map(g => {
            const ri = planGameSelectSourceList.indexOf(g);
            return `<div class="game-select-item ${g.checked ? 'selected' : ''}" onclick="togglePlanGameSrc(${ri})" ondblclick="event.stopPropagation(); dblTransferPlanGameSrc(${ri})">
                <input type="checkbox" ${g.checked ? 'checked' : ''} onclick="event.stopPropagation(); togglePlanGameSrc(${ri})">
                <div class="game-select-item-info">
                    <span class="game-select-item-name">${escapeHtml(g.name)}</span>
                    <span class="game-select-item-meta">${escapeHtml(g.platform)} · ${escapeHtml(g.gameType)}</span>
                </div>
            </div>`;
        }).join('');
    }
    const checked = planGameSelectSourceList.filter(g => g.checked).length;
    document.getElementById('plan-game-src-count').textContent = `${checked}/${planGameSelectSourceList.length}`;
}

// 双击左框游戏 → 移到右框
function dblTransferPlanGameSrc(i) {
    const item = planGameSelectSourceList[i];
    if (!item) return;
    item.checked = false;
    planGameSelectTargetList.push(item);
    planGameSelectSourceList.splice(i, 1);
    document.getElementById('select-all-plan-games-src').checked = false;
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function renderPlanGameTargetList(filterText) {
    const container = document.getElementById('plan-game-target-list');
    let items = planGameSelectTargetList;
    if (filterText) {
        const kw = filterText.toLowerCase();
        items = items.filter(g => g.name.toLowerCase().includes(kw));
    }
    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无数据</div>';
    } else {
        container.innerHTML = items.map(g => {
            const ri = planGameSelectTargetList.indexOf(g);
            return `<div class="game-select-item ${g.checked ? 'selected' : ''}" onclick="togglePlanGameTgt(${ri})" ondblclick="event.stopPropagation(); dblTransferPlanGameTgt(${ri})">
                <input type="checkbox" ${g.checked ? 'checked' : ''} onclick="event.stopPropagation(); togglePlanGameTgt(${ri})">
                <div class="game-select-item-info">
                    <span class="game-select-item-name">${escapeHtml(g.name)}</span>
                    <span class="game-select-item-meta">${escapeHtml(g.platform)} · ${escapeHtml(g.gameType)}</span>
                </div>
            </div>`;
        }).join('');
    }
    const checked = planGameSelectTargetList.filter(g => g.checked).length;
    document.getElementById('plan-game-tgt-count').textContent = `${checked}/${planGameSelectTargetList.length}`;
}

// 双击右框游戏 → 移回左框
function dblTransferPlanGameTgt(i) {
    const item = planGameSelectTargetList[i];
    if (!item) return;
    item.checked = false;
    planGameSelectSourceList.push(item);
    planGameSelectTargetList.splice(i, 1);
    document.getElementById('select-all-plan-games-tgt').checked = false;
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function togglePlanGameSrc(i) {
    planGameSelectSourceList[i].checked = !planGameSelectSourceList[i].checked;
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
}

function togglePlanGameTgt(i) {
    planGameSelectTargetList[i].checked = !planGameSelectTargetList[i].checked;
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function toggleSelectAllPlanGamesSrc() {
    const checked = document.getElementById('select-all-plan-games-src').checked;
    planGameSelectSourceList.forEach(g => g.checked = checked);
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
}

function toggleSelectAllPlanGamesTgt() {
    const checked = document.getElementById('select-all-plan-games-tgt').checked;
    planGameSelectTargetList.forEach(g => g.checked = checked);
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function transferPlanGamesToTarget() {
    const toTransfer = planGameSelectSourceList.filter(g => g.checked);
    if (!toTransfer.length) return;
    toTransfer.forEach(g => { g.checked = false; planGameSelectTargetList.push(g); });
    planGameSelectSourceList = planGameSelectSourceList.filter(g => !toTransfer.includes(g));
    document.getElementById('select-all-plan-games-src').checked = false;
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function transferPlanGamesFromTarget() {
    const toTransfer = planGameSelectTargetList.filter(g => g.checked);
    if (!toTransfer.length) return;
    toTransfer.forEach(g => { g.checked = false; planGameSelectSourceList.push(g); });
    planGameSelectTargetList = planGameSelectTargetList.filter(g => !toTransfer.includes(g));
    document.getElementById('select-all-plan-games-tgt').checked = false;
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function filterPlanGameSelectList() {
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
}

function filterPlanGameTargetList() {
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function confirmPlanGameSelect() {
    if (planGameSelectTargetList.length === 0) {
        alert('请先选择游戏');
        return;
    }
    planSelectedGames = [...planSelectedGames, ...planGameSelectTargetList.map(g => ({
        id: g.id,
        name: g.name,
        platform: g.platform,
        gameType: g.gameType,
        ownerName: g.ownerName
    }))];
    renderPlanGameTags();
    closePlanGameSelectModal();
}


// ==============================
// 字段设置模块
// ==============================

// 字段选项缓存
let fieldOptionsCache = {};    // { field_key: { field_key, field_label, field_group, options: [...] } }
let allFieldOptions = [];       // 完整列表
let currentFieldGroup = 'all';  // 当前筛选分组

// 加载字段选项数据
async function loadFieldOptions() {
    try {
        const response = await authFetch(`${API_BASE}/field-options`);
        const result = await response.json();
        if (result.success) {
            allFieldOptions = result.data;
            // 建立缓存
            fieldOptionsCache = {};
            allFieldOptions.forEach(field => {
                fieldOptionsCache[field.field_key] = field;
            });
            renderFieldCards();
            console.log('字段选项加载成功:', allFieldOptions.length, '个字段');
        }
    } catch (error) {
        console.error('加载字段选项失败:', error);
    }
}

// 获取指定字段的选项（供其他模块使用）
function getFieldOptionsByKey(fieldKey) {
    const field = fieldOptionsCache[fieldKey];
    return field ? field.options : [];
}

// 获取选项的显示文本
function getFieldOptionLabel(fieldKey, value) {
    const options = getFieldOptionsByKey(fieldKey);
    const option = options.find(o => o.value === value);
    return option ? option.label : value;
}

// 切换字段分组
function switchFieldGroup(group) {
    currentFieldGroup = group;
    document.querySelectorAll('.field-group-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.group === group);
    });
    renderFieldCards();
}

// 渲染字段卡片
function renderFieldCards() {
    const container = document.getElementById('field-cards-container');
    if (!container) return;

    let fields = allFieldOptions;
    if (currentFieldGroup !== 'all') {
        fields = fields.filter(f => f.field_group === currentFieldGroup);
    }

    if (fields.length === 0) {
        container.innerHTML = `
            <div class="field-empty-state">
                <div class="empty-icon">⚙️</div>
                <div class="empty-text">${currentFieldGroup === 'all' ? '暂无字段选项配置' : `"${currentFieldGroup}" 分组下暂无字段`}</div>
            </div>`;
        return;
    }

    container.innerHTML = fields.map(field => {
        const optionsHtml = field.options.map((opt, idx) => `
            <span class="field-option-tag" draggable="true" 
                  ondragstart="dragFieldOption(event, '${field.field_key}', ${idx})"
                  ondragover="dragOverFieldOption(event)"
                  ondrop="dropFieldOption(event, '${field.field_key}', ${idx})"
                  ondragleave="dragLeaveFieldOption(event)">
                <span class="option-label">${escapeHtml(opt.label)}</span>
                <span class="option-value">${escapeHtml(opt.value)}</span>
                <span class="option-remove" onclick="removeFieldOption('${field.field_key}', ${idx})" title="删除此选项">×</span>
            </span>
        `).join('');

        return `
            <div class="field-card" data-field-key="${field.field_key}">
                <div class="field-card-header">
                    <div class="field-card-title">
                        <h4>${escapeHtml(field.field_label)}</h4>
                        <span class="field-key">${escapeHtml(field.field_key)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="field-card-group">${escapeHtml(field.field_group)}</span>
                        <button class="btn btn-small btn-delete" onclick="deleteFieldConfig('${field.field_key}', '${escapeHtml(field.field_label)}')" title="删除此字段">🗑</button>
                    </div>
                </div>
                <div class="field-card-body">
                    <div class="field-options-list" id="options-${field.field_key}">
                        ${optionsHtml || '<span style="color:#64748b;font-size:12px;">暂无选项</span>'}
                    </div>
                    <div class="field-add-option">
                        <input type="text" id="new-opt-value-${field.field_key}" placeholder="选项值(英文)" 
                               onkeydown="if(event.key==='Enter'){event.preventDefault();addFieldOption('${field.field_key}');}">
                        <input type="text" id="new-opt-label-${field.field_key}" placeholder="显示名称(中文)" 
                               onkeydown="if(event.key==='Enter'){event.preventDefault();addFieldOption('${field.field_key}');}">
                        <button class="btn btn-small btn-primary" onclick="addFieldOption('${field.field_key}')">添加</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 添加新选项
async function addFieldOption(fieldKey) {
    const valueInput = document.getElementById(`new-opt-value-${fieldKey}`);
    const labelInput = document.getElementById(`new-opt-label-${fieldKey}`);

    const value = valueInput.value.trim();
    const label = labelInput.value.trim();

    if (!value) {
        alert('请输入选项值');
        valueInput.focus();
        return;
    }
    if (!label) {
        alert('请输入显示名称');
        labelInput.focus();
        return;
    }

    const field = fieldOptionsCache[fieldKey];
    if (!field) return;

    // 检查重复
    if (field.options.some(o => o.value === value)) {
        alert(`选项值 "${value}" 已存在`);
        return;
    }

    const newOptions = [...field.options, { value, label }];

    try {
        const response = await authFetch(`${API_BASE}/field-options/${fieldKey}`, {
            method: 'PUT',
            body: JSON.stringify({ options: newOptions })
        });
        const result = await response.json();
        if (result.success) {
            field.options = newOptions;
            valueInput.value = '';
            labelInput.value = '';
            renderFieldCards();
            refreshAllSelectsFromFieldOptions();
        } else {
            alert('保存失败: ' + (result.error || '未知错误'));
        }
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

// 删除选项
async function removeFieldOption(fieldKey, optIndex) {
    const field = fieldOptionsCache[fieldKey];
    if (!field) return;

    const opt = field.options[optIndex];
    if (!confirm(`确定删除选项 "${opt.label}" (${opt.value}) 吗？\n\n注意：已使用此选项的数据不会受影响，但后续将无法再选择此选项。`)) {
        return;
    }

    const newOptions = field.options.filter((_, i) => i !== optIndex);

    try {
        const response = await authFetch(`${API_BASE}/field-options/${fieldKey}`, {
            method: 'PUT',
            body: JSON.stringify({ options: newOptions })
        });
        const result = await response.json();
        if (result.success) {
            field.options = newOptions;
            renderFieldCards();
            refreshAllSelectsFromFieldOptions();
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// 拖拽排序
let dragFieldKey = null;
let dragOptionIndex = null;

function dragFieldOption(event, fieldKey, index) {
    dragFieldKey = fieldKey;
    dragOptionIndex = index;
    event.target.closest('.field-option-tag').classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
}

function dragOverFieldOption(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.target.closest('.field-option-tag')?.classList.add('drag-over');
}

function dragLeaveFieldOption(event) {
    event.target.closest('.field-option-tag')?.classList.remove('drag-over');
}

async function dropFieldOption(event, targetFieldKey, targetIndex) {
    event.preventDefault();
    event.target.closest('.field-option-tag')?.classList.remove('drag-over');

    if (dragFieldKey !== targetFieldKey || dragOptionIndex === targetIndex) return;

    const field = fieldOptionsCache[targetFieldKey];
    if (!field) return;

    // 执行排序
    const options = [...field.options];
    const [moved] = options.splice(dragOptionIndex, 1);
    options.splice(targetIndex, 0, moved);

    try {
        const response = await authFetch(`${API_BASE}/field-options/${targetFieldKey}`, {
            method: 'PUT',
            body: JSON.stringify({ options })
        });
        const result = await response.json();
        if (result.success) {
            field.options = options;
            renderFieldCards();
        }
    } catch (error) {
        console.error('排序保存失败:', error);
    }

    dragFieldKey = null;
    dragOptionIndex = null;
}

// 新增字段弹窗
function openAddFieldModal() {
    document.getElementById('field-modal-title').textContent = '新增字段';
    document.getElementById('field-edit-key').value = '';
    document.getElementById('field-key-input').value = '';
    document.getElementById('field-key-input').disabled = false;
    document.getElementById('field-label-input').value = '';
    document.getElementById('field-group-input').value = '游戏管理';
    document.getElementById('field-modal').style.display = 'block';
}

function closeFieldModal() {
    document.getElementById('field-modal').style.display = 'none';
}

async function submitField(event) {
    event.preventDefault();

    const editKey = document.getElementById('field-edit-key').value;
    const fieldKey = document.getElementById('field-key-input').value.trim();
    const fieldLabel = document.getElementById('field-label-input').value.trim();
    const fieldGroup = document.getElementById('field-group-input').value;

    if (!fieldKey || !fieldLabel) {
        alert('请填写完整信息');
        return;
    }

    // 校验key格式
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldKey)) {
        alert('字段Key只能包含英文字母、数字和下划线，且不能以数字开头');
        return;
    }

    try {
        let response;
        if (editKey) {
            // 编辑模式 - 只更新 label 和 group
            response = await authFetch(`${API_BASE}/field-options/${editKey}`, {
                method: 'PUT',
                body: JSON.stringify({
                    field_label: fieldLabel,
                    field_group: fieldGroup,
                    options: fieldOptionsCache[editKey]?.options || []
                })
            });
        } else {
            // 新增模式
            response = await authFetch(`${API_BASE}/field-options`, {
                method: 'POST',
                body: JSON.stringify({
                    field_key: fieldKey,
                    field_label: fieldLabel,
                    field_group: fieldGroup,
                    options: [],
                    sort_order: allFieldOptions.length + 1
                })
            });
        }

        const result = await response.json();
        if (result.success) {
            closeFieldModal();
            await loadFieldOptions();
        } else {
            alert('保存失败: ' + (result.error || '未知错误'));
        }
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

// 删除字段配置
async function deleteFieldConfig(fieldKey, fieldLabel) {
    if (!confirm(`确定要删除字段 "${fieldLabel}" (${fieldKey}) 及其所有选项吗？\n\n此操作不可恢复。`)) {
        return;
    }

    try {
        const response = await authFetch(`${API_BASE}/field-options/${fieldKey}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (result.success) {
            await loadFieldOptions();
        } else {
            alert('删除失败: ' + (result.error || '未知错误'));
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// ========== 动态选项填充工具函数 ==========

// 动态填充 select 元素的选项（基于字段设置）
function populateSelectFromFieldOptions(selectId, fieldKey, defaultValue, includeEmpty, emptyLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    const options = getFieldOptionsByKey(fieldKey);
    
    // 清空现有选项
    select.innerHTML = '';
    
    // 添加空选项
    if (includeEmpty) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = emptyLabel || '请选择';
        select.appendChild(emptyOpt);
    }
    
    // 添加字段选项
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === defaultValue) option.selected = true;
        select.appendChild(option);
    });
}

// 动态填充筛选下拉框（支持从字段设置获取）
function populateFilterFromFieldOptions(selectId, fieldKey) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // 保留第一个"全部"选项
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    const options = getFieldOptionsByKey(fieldKey);
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
    });
}

// 刷新所有表单中的动态下拉框
function refreshAllSelectsFromFieldOptions() {
    // 成员管理 - 状态
    populateSelectFromFieldOptions('member-status', 'member_status', 'active');
    
    // 设备管理 - 状态
    populateSelectFromFieldOptions('device-status', 'device_status', 'available');
    
    // 游戏管理 - 适配状态
    populateSelectFromFieldOptions('game-adaptation-status', 'adaptation_status', 'pending');
    // 游戏管理 - 上线状态
    populateSelectFromFieldOptions('game-online-status', 'online_status', 'pending');
    // 游戏管理 - 品质
    populateSelectFromFieldOptions('game-quality', 'quality', 'normal');
    // 游戏管理 - 存储位置
    populateSelectFromFieldOptions('game-storage-location', 'storage_location', '硬盘1号');
    
    // 测试管理 - 状态
    populateSelectFromFieldOptions('test-status', 'test_status', 'pending');
    // 测试管理 - 优先级
    populateSelectFromFieldOptions('test-priority', 'test_priority', 'medium');
    
    // 缺陷管理 - 缺陷状态
    populateSelectFromFieldOptions('bug-status', 'bug_status', 'open');
    // 缺陷管理 - 优先级
    populateSelectFromFieldOptions('bug-priority', 'bug_priority', 'medium');
    
    // 筛选器 - 适配状态
    populateFilterFromFieldOptions('status-filter', 'adaptation_status');
}


// 工具函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusText(status) {
    // 优先从字段设置读取
    const dynamic = getFieldOptionLabel('member_status', status);
    if (dynamic !== status) return dynamic;
    const statusMap = {
        'active': '活跃',
        'inactive': '非活跃',
        'archived': '已归档'
    };
    return statusMap[status] || status;
}

function getDeviceStatusText(status) {
    const dynamic = getFieldOptionLabel('device_status', status);
    if (dynamic !== status) return dynamic;
    const statusMap = {
        'available': '可用',
        'assigned': '已分配',
        'maintenance': '维护中',
        'broken': '损坏'
    };
    return statusMap[status] || status;
}

function getTestStatusText(status) {
    const dynamic = getFieldOptionLabel('test_status', status);
    if (dynamic !== status) return dynamic;
    const statusMap = {
        'pending': '待测试',
        'in_progress': '测试中',
        'completed': '已完成',
        'failed': '失败'
    };
    return statusMap[status] || status;
}

function getPriorityText(priority) {
    const dynamic = getFieldOptionLabel('test_priority', priority);
    if (dynamic !== priority) return dynamic;
    const priorityMap = {
        'low': '低',
        'medium': '中',
        'high': '高',
        'urgent': '紧急'
    };
    return priorityMap[priority] || priority;
}

function getBugStatusText(status) {
    const dynamic = getFieldOptionLabel('bug_status', status);
    if (dynamic !== status) return dynamic;
    const statusMap = {
        'open': '待处理',
        'in_progress': '处理中',
        'fixed': '已修复',
        'closed': '已关闭',
        'reopened': '重新打开'
    };
    return statusMap[status] || status;
}

function getAdaptationStatusText(status) {
    const dynamic = getFieldOptionLabel('adaptation_status', status);
    if (dynamic !== status) return dynamic;
    const statusMap = {
        'pending': '待适配',
        'in_progress': '适配中',
        'completed': '已完成',
        'failed': '失败'
    };
    return statusMap[status] || status;
}


function getSeverityText(severity) {
    const dynamic = getFieldOptionLabel('severity', severity);
    if (dynamic !== severity) return dynamic;
    const severityMap = {
        'advice': '建议',
        'prompt': '提示',
        'normal': '一般',
        'serious': '严重',
        'fatal': '致命'
    };
    return severityMap[severity] || severity;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
}

function updateSelectOptions(selectId, data, valueField, textField, defaultText) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = `<option value="">${defaultText}</option>`;
    if (data && data.length > 0) {
        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item[valueField];
            option.textContent = item[textField];
            select.appendChild(option);
        });
    }
}

// ==================== 列宽手动拖拽调节 ====================

/**
 * 为所有 .data-table 的表头单元格添加拖拽 resize 手柄。
 * 每次表格内容渲染后调用此函数即可自动补全手柄。
 */
function initColumnResize() {
    document.querySelectorAll('.data-table').forEach(table => {
        const ths = table.querySelectorAll('thead th');
        ths.forEach(th => {
            // 跳过已有手柄的
            if (th.querySelector('.col-resize-handle')) return;

            const handle = document.createElement('div');
            handle.className = 'col-resize-handle';
            th.appendChild(handle);

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const startX = e.pageX;
                const startWidth = th.offsetWidth;
                
                handle.classList.add('resizing');
                document.body.classList.add('col-resizing');

                const onMouseMove = (moveEvt) => {
                    const delta = moveEvt.pageX - startX;
                    const newWidth = Math.max(40, startWidth + delta);
                    th.style.width = newWidth + 'px';
                    th.style.minWidth = newWidth + 'px';
                };

                const onMouseUp = () => {
                    handle.classList.remove('resizing');
                    document.body.classList.remove('col-resizing');
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });
    });
}

// 用 MutationObserver 自动监测表格变化，补全 resize 手柄
const _resizeObserver = new MutationObserver(() => {
    initColumnResize();
});

// 在 DOM 加载完成后启动 observer
document.addEventListener('DOMContentLoaded', () => {
    // 初始化一次
    setTimeout(initColumnResize, 500);

    // 监测所有 table-container 区域的子树变化
    document.querySelectorAll('.table-container, .tab-content').forEach(container => {
        _resizeObserver.observe(container, { childList: true, subtree: true });
    });
});

// ==================== 适配游戏数计算函数 ====================

/**
 * 根据设备名称获取该设备在适配进展中"已上线"的游戏数量
 * @param {string} deviceName - 设备名称
 * @returns {number} 已上线游戏数
 */
function getDeviceOnlineGameCount(deviceName) {
    if (!progressData || progressData.length === 0) return 0;
    
    const deviceProgress = progressData.find(p => p.deviceName === deviceName);
    if (!deviceProgress || !deviceProgress.games) return 0;
    
    return deviceProgress.games.filter(g => g.onlineStatus === 'online').length;
}

// ==================== P0: Dashboard 概览页 ====================

let dashboardCharts = {}; // 存储 Chart.js 实例，防止重复创建

async function loadDashboard() {
    try {
        const response = await authFetch(`${API_BASE}/stats/dashboard`);
        const result = await response.json();
        if (!result.success) return;
        const d = result.data;

        // 更新数字卡片
        setTextSafe('dash-games', d.games_total || 0);
        setTextSafe('dash-devices', d.devices_total || 0);
        setTextSafe('dash-members', d.members_total || 0);
        setTextSafe('dash-tests', d.tests_total || 0);
        setTextSafe('dash-bugs-open', d.bugs_open || 0);

        // 计算已上线率
        const total = d.games_total || 1;
        const onlineCount = (d.online_status_distribution || []).find(r => r.online_status === 'online');
        const rate = onlineCount ? Math.round((onlineCount.count / total) * 100) : 0;
        setTextSafe('dash-adaptation-rate', rate + '%');

        // 图表渲染
        renderPlatformChart(d.platform_distribution || []);
        renderOnlineStatusChart(d.online_status_distribution || []);
        renderBugStatusChart(d.bug_status_distribution || []);
        renderRecentGames(d.recent_games || []);
        
        // 加载最近活动
        loadRecentActivity();
    } catch (error) {
        console.error('加载 Dashboard 数据失败:', error);
    }
}

function setTextSafe(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// 柱状颜色方案
const chartColors = ['#2f7fbb', '#1d2c4d', '#d9e8ea', '#d4880f', '#2e9e5a', '#d44040', '#8c96a8', '#4355a7'];

function renderPlatformChart(data) {
    const ctx = document.getElementById('chart-platform');
    if (!ctx || typeof Chart === 'undefined') return;
    if (dashboardCharts.platform) dashboardCharts.platform.destroy();
    dashboardCharts.platform = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(r => r.platform || '未知'),
            datasets: [{
                label: '游戏数',
                data: data.map(r => r.count),
                backgroundColor: chartColors,
                borderRadius: 4,
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderOnlineStatusChart(data) {
    const ctx = document.getElementById('chart-online-status');
    if (!ctx || typeof Chart === 'undefined') return;
    if (dashboardCharts.onlineStatus) dashboardCharts.onlineStatus.destroy();
    const statusLabels = { pending: '待上线', in_progress: '适配中', paused: '暂停适配', online: '已上线' };
    const statusColors = { pending: '#2f7fbb', in_progress: '#d4880f', paused: '#8c96a8', online: '#2e9e5a' };
    dashboardCharts.onlineStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(r => statusLabels[r.online_status] || r.online_status || '未知'),
            datasets: [{
                data: data.map(r => r.count),
                backgroundColor: data.map(r => statusColors[r.online_status] || '#8c96a8'),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 12 } } }
            }
        }
    });
}

function renderBugStatusChart(data) {
    const ctx = document.getElementById('chart-bug-status');
    if (!ctx || typeof Chart === 'undefined') return;
    if (dashboardCharts.bugStatus) dashboardCharts.bugStatus.destroy();
    const bugLabels = { open: '待处理', in_progress: '处理中', fixed: '已修复', closed: '已关闭', reopened: '重新打开' };
    const bugColors = { open: '#d44040', in_progress: '#d4880f', fixed: '#2e9e5a', closed: '#8c96a8', reopened: '#4355a7' };
    dashboardCharts.bugStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(r => bugLabels[r.bug_status] || r.bug_status || '未知'),
            datasets: [{
                data: data.map(r => r.count),
                backgroundColor: data.map(r => bugColors[r.bug_status] || '#8c96a8'),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 12 } } }
            }
        }
    });
}

function renderRecentGames(data) {
    const container = document.getElementById('recent-games-list');
    if (!container) return;
    if (data.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-icon">🎮</div><div>暂无游戏数据</div></div>';
        return;
    }
    const statusMap = { pending: '待适配', in_progress: '适配中', completed: '已完成', failed: '失败' };
    container.innerHTML = data.map(g => `
        <div class="recent-item">
            <span class="recent-item-name">${escapeHtml(g.name || '-')}</span>
            <span class="recent-item-meta">${escapeHtml(g.platform || '-')} · ${statusMap[g.adaptation_status] || '-'}</span>
        </div>
    `).join('');
}

async function loadRecentActivity() {
    try {
        const resp = await authFetch(`${API_BASE}/stats/activity?limit=10`);
        const result = await resp.json();
        const container = document.getElementById('recent-activity-list');
        if (!container) return;
        
        const activities = result.data || [];
        if (activities.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-icon">📋</div><div>暂无操作记录</div></div>';
            return;
        }
        
        const actionMap = { create: '创建', update: '更新', delete: '删除', batch_delete: '批量删除' };
        const typeMap = { game: '🎮 游戏', device: '📱 设备', member: '👥 成员', bug: '🐛 缺陷', test: '🧪 测试', plan: '📋 计划', games: '🎮 游戏', members: '👥 成员', devices: '📱 设备', tests: '🧪 测试', bugs: '🐛 缺陷', adaptations: '📊 适配' };
        
        container.innerHTML = activities.map(a => {
            const action = actionMap[a.action] || a.action;
            const type = typeMap[a.resource_type] || a.resource_type;
            const name = a.resource_name ? ` "${escapeHtml(a.resource_name)}"` : '';
            const time = formatTimeAgo(a.created_at);
            return `<div class="activity-item">
                <span class="activity-dot"></span>
                <div class="activity-info">
                    <span class="activity-text">${a.user_name} ${action}了 ${type}${name}</span>
                    <span class="activity-time">${time}</span>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('加载活动日志失败:', err);
    }
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr.replace(' ', 'T') + '+08:00');
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';
    return dateStr.slice(0, 10);
}

// ==================== P1: 适配矩阵视图 ====================

let matrixData = null;

async function loadMatrixData() {
    try {
        const resp = await authFetch(`${API_BASE}/stats/matrix`);
        const result = await resp.json();
        if (!result.success) return;
        matrixData = result.data;
        
        // 填充平台筛选
        const platformFilter = document.getElementById('matrix-platform-filter');
        if (platformFilter && matrixData.games) {
            const platforms = [...new Set(matrixData.games.map(g => g.platform).filter(Boolean))];
            // 保留第一个"全部平台"选项
            platformFilter.innerHTML = '<option value="">全部平台</option>' +
                platforms.map(p => `<option value="${p}">${p}</option>`).join('');
        }
        
        renderMatrix();
    } catch (err) {
        console.error('加载矩阵数据失败:', err);
    }
}

function renderMatrix() {
    if (!matrixData) return;
    const { devices, games, recordMap } = matrixData;
    const thead = document.getElementById('matrix-thead');
    const tbody = document.getElementById('matrix-tbody');
    if (!thead || !tbody) return;
    
    // 平台筛选
    const platformFilter = document.getElementById('matrix-platform-filter');
    const selectedPlatform = platformFilter ? platformFilter.value : '';
    const filteredGames = selectedPlatform 
        ? games.filter(g => g.platform === selectedPlatform) 
        : games;
    
    if (filteredGames.length === 0 || devices.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td class="empty-state" style="padding:40px"><div class="empty-icon">🔲</div><div>暂无适配矩阵数据</div></td></tr>';
        return;
    }
    
    // 设备类型图标映射
    function getDeviceIcon(deviceType) {
        if (!deviceType) return '📱';
        if (deviceType.includes('笔电') || deviceType.includes('笔记本')) return '💻';
        if (deviceType.includes('显示器')) return '🖥️';
        if (deviceType.includes('手机')) return '📱';
        if (deviceType.includes('平板')) return '📲';
        return '🖥️';
    }
    
    // 渲染表头：第一列是游戏名称，后面每列是一个设备（横排+icon）
    thead.innerHTML = `<tr>
        <th class="matrix-corner">游戏 \\ 设备</th>
        ${devices.map(d => {
            const icon = getDeviceIcon(d.device_type || '');
            return `<th title="${escapeHtml(d.name)}${d.device_type ? ' (' + escapeHtml(d.device_type) + ')' : ''}"><span class="matrix-device-icon">${icon}</span><span class="matrix-device-name">${escapeHtml(d.name)}</span></th>`;
        }).join('')}
    </tr>`;
    
    // 渲染每行
    const statusLabels = { online: '已上线', in_progress: '适配中', pending: '待上线' };
    tbody.innerHTML = filteredGames.map(game => {
        const cells = devices.map(device => {
            const key = `${device.id}-${game.id}`;
            const record = recordMap[key];
            if (!record) {
                return `<td><span class="matrix-cell" data-status="none" title="${escapeHtml(game.name)} × ${escapeHtml(device.name)}: 未适配"></span></td>`;
            }
            const status = record.status || 'pending';
            const progress = record.progress || 0;
            const label = statusLabels[status] || '待上线';
            return `<td><span class="matrix-cell" data-status="${status}" title="${escapeHtml(game.name)} × ${escapeHtml(device.name)}\n${label} (${progress}%)"></span></td>`;
        }).join('');
        return `<tr><td title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</td>${cells}</tr>`;
    }).join('');
}

// ==================== P0: 表格 Tooltip（长文本悬停提示） ====================

// 为所有表格 td 自动添加 title 属性
function addTableTooltips() {
    document.querySelectorAll('.data-table td').forEach(td => {
        // 跳过包含按钮/进度条/输入框的单元格
        if (td.querySelector('button, .progress-bar-container, input, select')) return;
        const text = td.textContent.trim();
        if (text && text !== '-' && td.scrollWidth > td.clientWidth + 2) {
            td.title = text;
        } else {
            td.removeAttribute('title');
        }
    });
}

// 在 MutationObserver 中也触发 tooltip
const _tooltipObserver = new MutationObserver(() => {
    clearTimeout(window._tooltipTimer);
    window._tooltipTimer = setTimeout(addTableTooltips, 200);
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(addTableTooltips, 800);
    document.querySelectorAll('.table-container').forEach(container => {
        _tooltipObserver.observe(container, { childList: true, subtree: true });
    });
});

// ==================== P1: 全局搜索命令面板 (Ctrl+K) ====================

let gsDebounceTimer = null;
let gsActiveIndex = -1;
let gsResultItems = [];

function openGlobalSearch() {
    const overlay = document.getElementById('global-search-overlay');
    overlay.style.display = 'flex';
    const input = document.getElementById('gs-input');
    input.value = '';
    document.getElementById('gs-results').innerHTML = '';
    gsActiveIndex = -1;
    gsResultItems = [];
    setTimeout(() => input.focus(), 50);
}

function closeGlobalSearch() {
    document.getElementById('global-search-overlay').style.display = 'none';
}

function onGlobalSearchInput() {
    clearTimeout(gsDebounceTimer);
    gsDebounceTimer = setTimeout(performGlobalSearch, 250);
}

async function performGlobalSearch() {
    const q = document.getElementById('gs-input').value.trim();
    const container = document.getElementById('gs-results');
    
    if (!q) {
        container.innerHTML = '';
        gsResultItems = [];
        gsActiveIndex = -1;
        return;
    }

    container.innerHTML = '<div class="gs-loading">搜索中...</div>';
    
    try {
        const resp = await authFetch(`${API_BASE}/stats/search?q=${encodeURIComponent(q)}`);
        const result = await resp.json();
        
        if (!result.success || !result.data.length) {
            container.innerHTML = `<div class="gs-empty">未找到 "${escapeHtml(q)}" 相关结果</div>`;
            gsResultItems = [];
            gsActiveIndex = -1;
            return;
        }

        // 按类型分组
        const groups = {};
        result.data.forEach(item => {
            if (!groups[item.type]) groups[item.type] = { icon: item.icon, label: item.typeLabel, items: [] };
            groups[item.type].items.push(item);
        });

        let html = '';
        let idx = 0;
        for (const [type, group] of Object.entries(groups)) {
            html += `<div class="gs-group-label">${group.icon} ${group.label}</div>`;
            group.items.forEach(item => {
                const title = highlightMatch(escapeHtml(item.title || ''), q);
                const sub = item.subtitle ? escapeHtml(item.subtitle) : '';
                html += `<div class="gs-item" data-type="${type}" data-id="${item.id}" data-idx="${idx}" 
                          onmouseenter="gsSetActive(${idx})" onclick="gsNavigate('${type}', ${item.id})">
                    <span class="gs-item-icon">${group.icon}</span>
                    <div class="gs-item-text">
                        <div class="gs-item-title">${title}</div>
                        ${sub ? `<div class="gs-item-sub">${sub}</div>` : ''}
                    </div>
                    <span class="gs-item-badge">${group.label}</span>
                </div>`;
                idx++;
            });
        }
        container.innerHTML = html;
        gsResultItems = container.querySelectorAll('.gs-item');
        gsActiveIndex = -1;
    } catch (err) {
        container.innerHTML = '<div class="gs-empty">搜索出错，请重试</div>';
    }
}

function highlightMatch(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function gsSetActive(idx) {
    gsResultItems.forEach(el => el.classList.remove('gs-active'));
    if (idx >= 0 && idx < gsResultItems.length) {
        gsActiveIndex = idx;
        gsResultItems[idx].classList.add('gs-active');
    }
}

function gsNavigate(type, id) {
    closeGlobalSearch();
    // 类型到Tab的映射
    const tabMap = {
        game: 'games', device: 'devices', member: 'members',
        bug: 'bugs', test: 'tests', plan: 'config-plan'
    };
    const tab = tabMap[type];
    if (tab) {
        switchTab(tab);
        // 延迟后高亮搜索结果（如果模块有搜索框，填入关键词）
        setTimeout(() => {
            const searchInput = document.getElementById(
                tab === 'games' ? 'search-input' : `${tab === 'config-plan' ? '' : tab}-search`
            );
            // 不自动填充搜索框，直接跳转到对应Tab即可
        }, 300);
    }
}

// ==================== P1: 键盘快捷键系统 ====================

document.addEventListener('keydown', function(e) {
    const overlay = document.getElementById('global-search-overlay');
    const isSearchOpen = overlay && overlay.style.display !== 'none';
    const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    const isInModal = document.activeElement.closest('.modal[style*="block"], .modal.show');

    // Ctrl+K / Cmd+K: 全局搜索
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isSearchOpen) closeGlobalSearch();
        else openGlobalSearch();
        return;
    }

    // 全局搜索面板内的键盘导航
    if (isSearchOpen) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeGlobalSearch();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            gsSetActive(Math.min(gsActiveIndex + 1, gsResultItems.length - 1));
            if (gsResultItems[gsActiveIndex]) gsResultItems[gsActiveIndex].scrollIntoView({ block: 'nearest' });
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            gsSetActive(Math.max(gsActiveIndex - 1, 0));
            if (gsResultItems[gsActiveIndex]) gsResultItems[gsActiveIndex].scrollIntoView({ block: 'nearest' });
            return;
        }
        if (e.key === 'Enter' && gsActiveIndex >= 0 && gsResultItems[gsActiveIndex]) {
            e.preventDefault();
            gsResultItems[gsActiveIndex].click();
            return;
        }
        return; // 搜索面板打开时不响应其他快捷键
    }

    // Escape: 关闭当前弹窗
    if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal[style*="flex"], .modal[style*="block"]');
        if (openModal) {
            e.preventDefault();
            const closeBtn = openModal.querySelector('.close-btn');
            if (closeBtn) closeBtn.click();
            return;
        }
    }

    // 以下快捷键仅在非输入状态生效
    if (isInInput || isInModal) return;

    // N: 新建当前模块记录
    if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        const tab = getCurrentTab();
        const newBtnMap = {
            games: () => openModal('game-modal'),
            members: () => openModal('member-modal'),
            devices: () => openModal('device-modal'),
            tests: () => openModal('test-modal'),
            bugs: () => openModal('bug-modal'),
            'config-plan': () => showCreatePlanView(),
        };
        if (newBtnMap[tab]) newBtnMap[tab]();
        return;
    }

    // 数字键 1-9: 快速切换Tab
    if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tabs = ['dashboard', 'games', 'devices', 'members', 'progress', 'tests', 'bugs', 'config-plan', 'field-settings'];
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) {
            e.preventDefault();
            switchTab(tabs[idx]);
        }
        return;
    }

    // / : 打开全局搜索（同 Ctrl+K）
    if (e.key === '/') {
        e.preventDefault();
        openGlobalSearch();
        return;
    }
});

function getCurrentTab() {
    const hash = location.hash.slice(1);
    return hash || 'dashboard';
}

// 在顶栏添加搜索入口按钮
document.addEventListener('DOMContentLoaded', () => {
    const topBarRight = document.querySelector('.top-bar-right');
    if (topBarRight) {
        const searchBtn = document.createElement('button');
        searchBtn.className = 'icon-btn';
        searchBtn.title = '全局搜索 (Ctrl+K)';
        searchBtn.innerHTML = '🔍';
        searchBtn.style.cssText = 'margin-right: 8px; cursor: pointer; font-size: 16px; background: none; border: none; padding: 4px 8px; border-radius: 4px;';
        searchBtn.onclick = openGlobalSearch;
        topBarRight.insertBefore(searchBtn, topBarRight.firstChild);
    }
});

// ==================== P1: 批量操作系统 ====================

const batchState = { selected: new Set(), resource: '' };

// 表格模块 → 后端资源名映射
const tableToBatchResource = {
    'games-table': 'games',
    'members-table': 'members',
    'devices-table': 'devices',
    'tests-table': 'tests',
    'bugs-table': 'bugs',
    'progress-table': 'adaptations'
};

// 重载函数映射
const batchReloadMap = {
    games: loadGames,
    members: loadMembers,
    devices: loadDevices,
    tests: loadTests,
    bugs: loadBugs,
    adaptations: loadProgressData
};

// 注入 checkbox 到表格（在每次 render 后调用）
function injectBatchCheckboxes(tableId) {
    const resource = tableToBatchResource[tableId];
    if (!resource) return;
    
    const table = document.getElementById(tableId);
    if (!table) return;
    
    // 获取对应的 <thead>
    const theadRow = table.closest('table')?.querySelector('thead tr');
    if (!theadRow) return;
    
    // 如果已有 checkbox 列头，不重复添加
    if (theadRow.querySelector('.batch-th')) return;
    
    // 在序号列之前添加 checkbox 表头
    const th = document.createElement('th');
    th.className = 'batch-th';
    th.setAttribute('width', '36');
    th.innerHTML = `<input type="checkbox" class="row-checkbox-all" onchange="batchToggleAll('${tableId}', this.checked)">`;
    theadRow.insertBefore(th, theadRow.firstChild);
    
    // 给每一行添加 checkbox
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        if (row.querySelector('.empty-state')) return; // 跳过空状态行
        // 从操作列的按钮中提取 ID
        const editBtn = row.querySelector('button[onclick*="edit"], button[onclick*="Edit"], button[onclick*="delete"], button[onclick*="Delete"]');
        let rowId = null;
        if (editBtn) {
            const match = editBtn.getAttribute('onclick')?.match(/\((\d+)/);
            if (match) rowId = parseInt(match[1]);
        }
        if (rowId === null) return;
        
        const td = document.createElement('td');
        td.innerHTML = `<input type="checkbox" class="row-checkbox" data-id="${rowId}" data-resource="${resource}" onchange="batchToggleRow(this)">`;
        row.insertBefore(td, row.firstChild);
    });
}

function batchToggleAll(tableId, checked) {
    const resource = tableToBatchResource[tableId];
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const checkboxes = table.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checked;
        const id = parseInt(cb.dataset.id);
        if (checked) batchState.selected.add(id);
        else batchState.selected.delete(id);
    });
    batchState.resource = resource;
    updateBatchBar();
}

function batchToggleRow(cb) {
    const id = parseInt(cb.dataset.id);
    const resource = cb.dataset.resource;
    batchState.resource = resource;
    
    if (cb.checked) batchState.selected.add(id);
    else batchState.selected.delete(id);
    
    updateBatchBar();
    
    // 更新全选框状态
    const table = cb.closest('tbody');
    const allCbs = table.querySelectorAll('.row-checkbox');
    const checkedCbs = table.querySelectorAll('.row-checkbox:checked');
    const allCb = cb.closest('table').querySelector('.row-checkbox-all');
    if (allCb) {
        allCb.checked = allCbs.length > 0 && allCbs.length === checkedCbs.length;
        allCb.indeterminate = checkedCbs.length > 0 && checkedCbs.length < allCbs.length;
    }
}

function updateBatchBar() {
    let bar = document.getElementById('batch-bar');
    
    if (batchState.selected.size === 0) {
        if (bar) bar.remove();
        return;
    }
    
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'batch-bar';
        bar.className = 'batch-bar';
        document.body.appendChild(bar);
    }
    
    bar.innerHTML = `
        <span class="batch-bar-count">已选择 ${batchState.selected.size} 条记录</span>
        <button class="batch-btn batch-btn-danger" onclick="batchDelete()">🗑 批量删除</button>
        <button class="batch-btn batch-btn-cancel" onclick="batchClearAll()">取消</button>
    `;
}

function batchClearAll() {
    batchState.selected.clear();
    document.querySelectorAll('.row-checkbox, .row-checkbox-all').forEach(cb => {
        cb.checked = false;
        cb.indeterminate = false;
    });
    updateBatchBar();
}

async function batchDelete() {
    const count = batchState.selected.size;
    const resource = batchState.resource;
    if (!count || !resource) return;
    
    showConfirm(`确定要删除选中的 ${count} 条记录吗？此操作不可撤销。`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/batch/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resource, ids: Array.from(batchState.selected) })
            });
            const result = await resp.json();
            if (result.success) {
                showToast(`成功删除 ${result.deleted} 条记录`, 'success');
                batchState.selected.clear();
                updateBatchBar();
                // 重新加载对应模块数据
                if (batchReloadMap[resource]) await batchReloadMap[resource]();
                updateStats();
            } else {
                showToast(result.error || '删除失败', 'danger');
            }
        } catch (err) {
            showToast('批量删除失败: ' + err.message, 'danger');
        }
    });
}

// 在表格渲染后自动注入checkbox（使用 MutationObserver）
const _batchObserver = new MutationObserver((mutations) => {
    mutations.forEach(m => {
        const tbody = m.target;
        if (tbody.id && tableToBatchResource[tbody.id]) {
            // 先清除全选状态
            batchState.selected.clear();
            updateBatchBar();
            // 移除旧的 checkbox 列头
            const theadRow = tbody.closest('table')?.querySelector('thead tr');
            const oldTh = theadRow?.querySelector('.batch-th');
            if (oldTh) oldTh.remove();
            // 重新注入
            setTimeout(() => injectBatchCheckboxes(tbody.id), 50);
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    // 监听所有支持批量操作的表格
    Object.keys(tableToBatchResource).forEach(tableId => {
        const el = document.getElementById(tableId);
        if (el) _batchObserver.observe(el, { childList: true });
    });
});

// ============================================================
//  P2: 用户管理模块 — 角色权限 + 成员管理
// ============================================================

// ---------- 模块状态 ----------
let umRoles = [];          // 所有角色
let umUsers = [];          // 所有用户
let umSelectedRoleId = null; // 当前选中角色ID
let umPermMatrix = {};     // { roleId: { module: { action: bool } } }

// 权限模块 & 操作定义
const UM_MODULES = [
    { key: 'members',        label: '成员管理',   icon: '👥' },
    { key: 'devices',        label: '设备管理',   icon: '📱' },
    { key: 'games',          label: '游戏管理',   icon: '🎮' },
    { key: 'tests',          label: '测试管理',   icon: '🧪' },
    { key: 'bugs',           label: '缺陷管理',   icon: '🐛' },
    { key: 'config_plan',    label: '配置计划',   icon: '📋' },
    { key: 'adaptation',     label: '适配进展',   icon: '📊' },
    { key: 'field_settings', label: '字段设置',   icon: '⚙️' },
    { key: 'user_management',label: '用户管理',   icon: '🔐' }
];
const UM_ACTIONS = [
    { key: 'view',   label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit',   label: '编辑' },
    { key: 'delete', label: '删除' },
    { key: 'export', label: '导出' },
    { key: 'import', label: '导入' }
];

// ---------- 入口：Tab加载 ----------
async function umLoadData() {
    try {
        // 并行加载角色列表和用户列表
        const [rolesResp, usersResp] = await Promise.all([
            authFetch(`${API_BASE}/roles`),
            authFetch(`${API_BASE}/users`)
        ]);
        const rolesResult = await rolesResp.json();
        const usersResult = await usersResp.json();
        umRoles = rolesResult.data || [];
        umUsers = usersResult.data || [];
    } catch (e) {
        console.error('加载用户管理数据失败:', e);
        umRoles = [];
        umUsers = [];
    }
    umRenderRoleList();
    umRenderUserList();
    umPopulateRoleFilter();
}

// ---------- 子Tab切换 ----------
function switchUserMgmtTab(subTab) {
    document.querySelectorAll('.um-sub-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.um-subtab-content').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`.um-sub-tab[data-subtab="${subTab}"]`);
    if (btn) btn.classList.add('active');
    const content = document.getElementById('um-' + subTab);
    if (content) content.classList.add('active');
}

// ========== 用户组权限 ==========

// 渲染左侧角色列表
function umRenderRoleList() {
    const container = document.getElementById('um-role-list');
    if (!container) return;
    if (umRoles.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-light);">暂无角色</div>';
        return;
    }
    // 统计每个角色的用户数
    const roleCounts = {};
    umUsers.forEach(u => { roleCounts[u.role_id] = (roleCounts[u.role_id] || 0) + 1; });

    container.innerHTML = umRoles.map(role => {
        const count = roleCounts[role.id] || 0;
        const isActive = role.id === umSelectedRoleId;
        const isSystem = role.is_system ? '<span class="um-system-badge">系统</span>' : '';
        return `<div class="um-role-item ${isActive ? 'active' : ''}" data-role-id="${role.id}" onclick="umSelectRole(${role.id})">
            <span class="um-role-dot" style="background:${role.color || '#718096'}"></span>
            <div class="um-role-info">
                <span class="um-role-name">${escapeHtml(role.name)} ${isSystem}</span>
                <span class="um-role-count">${count} 人</span>
            </div>
            ${!role.is_system ? `<button class="um-role-delete" onclick="event.stopPropagation(); umDeleteRole(${role.id}, '${escapeHtml(role.name)}')" title="删除角色">×</button>` : ''}
        </div>`;
    }).join('');
}

// 选择角色 → 加载权限矩阵
async function umSelectRole(roleId) {
    umSelectedRoleId = roleId;
    // 更新左侧高亮
    document.querySelectorAll('.um-role-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.roleId) === roleId);
    });

    const role = umRoles.find(r => r.id === roleId);
    if (!role) return;

    document.getElementById('um-perm-title').textContent = role.name + ' — 权限配置';
    document.getElementById('um-perm-desc').textContent = role.description || '';
    document.getElementById('um-perm-actions').style.display = 'flex';

    // 超级管理员提示
    if (role.id === 1) {
        document.getElementById('um-perm-desc').textContent = '超级管理员拥有所有权限，无需配置';
    }

    // 加载权限
    try {
        const resp = await authFetch(`${API_BASE}/roles/${roleId}/permissions`);
        const result = await resp.json();
        if (result.success) {
            umPermMatrix[roleId] = result.data.permissions || {};
        }
    } catch (e) {
        console.error('加载角色权限失败:', e);
        umPermMatrix[roleId] = {};
    }

    umRenderPermMatrix(roleId);
}

// 渲染权限矩阵表格
function umRenderPermMatrix(roleId) {
    const container = document.getElementById('um-perm-matrix');
    const perms = umPermMatrix[roleId] || {};
    const role = umRoles.find(r => r.id === roleId);
    const isSuperAdmin = role && role.id === 1;

    let html = `<table class="um-matrix-table">
        <thead><tr>
            <th class="um-matrix-module-th">功能模块</th>
            ${UM_ACTIONS.map(a => `<th class="um-matrix-action-th">${a.label}</th>`).join('')}
        </tr></thead><tbody>`;

    UM_MODULES.forEach(mod => {
        const modPerms = perms[mod.key] || {};
        html += `<tr>
            <td class="um-matrix-module-td">${mod.icon} ${mod.label}</td>
            ${UM_ACTIONS.map(act => {
                const checked = isSuperAdmin ? true : !!modPerms[act.key];
                const disabled = isSuperAdmin ? 'disabled' : '';
                return `<td class="um-matrix-action-td">
                    <input type="checkbox" class="um-perm-cb" data-module="${mod.key}" data-action="${act.key}" ${checked ? 'checked' : ''} ${disabled}>
                </td>`;
            }).join('')}
        </tr>`;
    });

    html += '</tbody></table>';

    if (isSuperAdmin) {
        html += '<div style="padding:12px 0;text-align:center;color:var(--accent);font-size:13px;">⚡ 超级管理员自动拥有全部权限，无法修改</div>';
    }

    container.innerHTML = html;
}

// 全选 / 取消全选
function umSelectAllPerms() {
    document.querySelectorAll('.um-perm-cb:not(:disabled)').forEach(cb => cb.checked = true);
}
function umDeselectAllPerms() {
    document.querySelectorAll('.um-perm-cb:not(:disabled)').forEach(cb => cb.checked = false);
}

// 保存权限
async function umSavePermissions() {
    if (!umSelectedRoleId) return;
    const role = umRoles.find(r => r.id === umSelectedRoleId);
    if (role && role.id === 1) {
        showToast('超级管理员权限不可修改', 'warning');
        return;
    }

    // 收集 checkbox 状态
    const permissions = {};
    document.querySelectorAll('.um-perm-cb').forEach(cb => {
        const mod = cb.dataset.module;
        const act = cb.dataset.action;
        if (!permissions[mod]) permissions[mod] = {};
        permissions[mod][act] = cb.checked;
    });

    try {
        const resp = await authFetch(`${API_BASE}/roles/${umSelectedRoleId}/permissions`, {
            method: 'PUT',
            body: JSON.stringify({ permissions })
        });
        const result = await resp.json();
        if (result.success) {
            showToast('权限已保存', 'success');
            umPermMatrix[umSelectedRoleId] = permissions;
        } else {
            showToast(result.error || '保存失败', 'danger');
        }
    } catch (e) {
        showToast('保存权限失败: ' + e.message, 'danger');
    }
}

// 创建角色
function openCreateRoleModal() {
    document.getElementById('um-role-name').value = '';
    document.getElementById('um-role-desc').value = '';
    // 默认选中灰色
    document.querySelectorAll('#um-role-colors .um-color-opt').forEach(opt => opt.classList.remove('selected'));
    const defaultOpt = document.querySelector('#um-role-colors .um-color-opt:last-child');
    if (defaultOpt) defaultOpt.classList.add('selected');
    const defaultRadio = document.querySelector('input[name="um-role-color"][value="#718096"]');
    if (defaultRadio) defaultRadio.checked = true;
    openModal('um-role-modal');
}

async function submitRoleForm(e) {
    e.preventDefault();
    const name = document.getElementById('um-role-name').value.trim();
    const description = document.getElementById('um-role-desc').value.trim();
    const colorRadio = document.querySelector('input[name="um-role-color"]:checked');
    const color = colorRadio ? colorRadio.value : '#718096';

    if (!name) { showToast('角色名称不能为空', 'warning'); return; }

    try {
        const resp = await authFetch(`${API_BASE}/roles`, {
            method: 'POST',
            body: JSON.stringify({ name, description, color })
        });
        const result = await resp.json();
        if (result.success) {
            showToast('角色创建成功', 'success');
            closeModal('um-role-modal');
            await umLoadData(); // 重新加载
        } else {
            showToast(result.error || '创建失败', 'danger');
        }
    } catch (e) {
        showToast('创建角色失败: ' + e.message, 'danger');
    }
}

// 删除角色
function umDeleteRole(roleId, roleName) {
    showConfirm(`确定要删除角色「${roleName}」吗？\n删除后不可恢复。`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/roles/${roleId}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('角色已删除', 'success');
                if (umSelectedRoleId === roleId) {
                    umSelectedRoleId = null;
                    document.getElementById('um-perm-title').textContent = '选择角色查看权限';
                    document.getElementById('um-perm-desc').textContent = '';
                    document.getElementById('um-perm-actions').style.display = 'none';
                    document.getElementById('um-perm-matrix').innerHTML = `
                        <div class="um-perm-empty">
                            <div class="empty-icon">🔐</div>
                            <div>请在左侧选择一个角色</div>
                            <div class="empty-sub">点击角色后，可在此配置其权限矩阵</div>
                        </div>`;
                }
                await umLoadData();
            } else {
                showToast(result.error || '删除失败', 'danger');
            }
        } catch (e) {
            showToast('删除角色失败: ' + e.message, 'danger');
        }
    });
}

// 颜色选择器交互
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#um-role-colors .um-color-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('#um-role-colors .um-color-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        });
    });
});

// ========== 成员管理 ==========

// 填充角色筛选下拉
function umPopulateRoleFilter() {
    const filterSelect = document.getElementById('um-user-role-filter');
    if (!filterSelect) return;
    filterSelect.innerHTML = '<option value="">全部角色</option>' +
        umRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

    // 同时填充用户弹窗中的角色下拉
    const roleSelect = document.getElementById('um-role-select');
    if (roleSelect) {
        roleSelect.innerHTML = umRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    }
}

// 渲染用户列表
function umRenderUserList(data) {
    const list = data || umUsers;
    const tbody = document.getElementById('um-users-table');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="empty-icon">👥</div><div>暂无用户</div></td></tr>';
        return;
    }

    tbody.innerHTML = list.map((user, idx) => {
        const roleColor = user.roleColor || '#718096';
        const roleName = user.role || '未分配';
        const statusText = user.status === 'active' ? '正常' : '禁用';
        const statusClass = user.status === 'active' ? 'status-online' : 'status-pending';
        const memberBadge = user.isMember
            ? '<span class="status-badge status-online">✓ 是</span>'
            : '<span class="status-badge status-pending">否</span>';
        const displayName = escapeHtml(user.realName || user.username || '-');
        return `<tr>
            <td class="text-center"><strong>${idx + 1}</strong></td>
            <td><strong>${displayName}</strong></td>
            <td>${escapeHtml(user.username || '(无账号)')}</td>
            <td>${escapeHtml(user.wechatId || '-')}</td>
            <td>${escapeHtml(user.projectRole || '-')}</td>
            <td><span class="um-role-badge" style="background:${roleColor}20;color:${roleColor};border:1px solid ${roleColor}40;">${escapeHtml(roleName)}</span></td>
            <td>${memberBadge}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <button class="btn-icon" title="编辑" onclick="umEditUser(${user.id})">✏️</button>
                <button class="btn-icon" title="重置密码" onclick="umResetPassword(${user.id}, '${escapeHtml(user.realName || user.username || '')}')">🔑</button>
                ${user.status === 'active'
                    ? `<button class="btn-icon" title="禁用" onclick="umToggleUserStatus(${user.id}, 'disabled')">🚫</button>`
                    : `<button class="btn-icon" title="启用" onclick="umToggleUserStatus(${user.id}, 'active')">✅</button>`
                }
                <button class="btn-icon" title="删除" onclick="umDeleteUser(${user.id}, '${escapeHtml(user.realName || user.username || '')}')">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

// 筛选用户列表
function filterUserList() {
    const keyword = (document.getElementById('um-user-search')?.value || '').toLowerCase();
    const roleId = document.getElementById('um-user-role-filter')?.value;
    let filtered = umUsers;
    if (keyword) {
        filtered = filtered.filter(u =>
            (u.username || '').toLowerCase().includes(keyword) ||
            (u.realName || '').toLowerCase().includes(keyword) ||
            (u.wechatId || '').toLowerCase().includes(keyword) ||
            (u.projectRole || '').toLowerCase().includes(keyword)
        );
    }
    if (roleId) {
        filtered = filtered.filter(u => String(u.role_id) === roleId);
    }
    umRenderUserList(filtered);
}

// 创建用户
function openCreateUserModal() {
    document.getElementById('um-user-modal-title').textContent = '添加用户';
    document.getElementById('um-user-id').value = '';
    document.getElementById('um-username').value = '';
    document.getElementById('um-username').disabled = false;
    document.getElementById('um-realname').value = '';
    document.getElementById('um-password').value = '';
    document.getElementById('um-password').required = false;
    document.getElementById('um-password-label').textContent = '密码（选填）';
    document.getElementById('um-wechat-id').value = '';
    document.getElementById('um-project-role').value = '';
    document.getElementById('um-duty').value = '';
    document.getElementById('um-is-member').checked = true;
    document.getElementById('um-status-group').style.display = 'none';
    // 默认选第一个角色
    const roleSelect = document.getElementById('um-role-select');
    if (roleSelect && roleSelect.options.length > 0) {
        roleSelect.selectedIndex = 0;
    }
    openModal('um-user-modal');
}

// 编辑用户
function umEditUser(userId) {
    const user = umUsers.find(u => u.id === userId);
    if (!user) return;
    document.getElementById('um-user-modal-title').textContent = '编辑用户';
    document.getElementById('um-user-id').value = user.id;
    document.getElementById('um-username').value = user.username || '';
    document.getElementById('um-username').disabled = !!user.username; // 有账号则不可改
    document.getElementById('um-realname').value = user.realName || '';
    document.getElementById('um-password').value = '';
    document.getElementById('um-password').required = false;
    document.getElementById('um-password-label').textContent = '密码（留空不修改）';
    document.getElementById('um-wechat-id').value = user.wechatId || '';
    document.getElementById('um-project-role').value = user.projectRole || '';
    document.getElementById('um-duty').value = user.duty || '';
    document.getElementById('um-is-member').checked = !!user.isMember;
    document.getElementById('um-status-group').style.display = 'block';
    document.getElementById('um-user-status').value = user.status || 'active';
    const roleSelect = document.getElementById('um-role-select');
    if (roleSelect) roleSelect.value = user.role_id || '';
    openModal('um-user-modal');
}

// 提交用户表单（新增/编辑）
async function submitUserForm(e) {
    e.preventDefault();
    const userId = document.getElementById('um-user-id').value;
    const isEdit = !!userId;

    let username = document.getElementById('um-username').value.trim() || null;
    const realName = document.getElementById('um-realname').value.trim();
    let password = document.getElementById('um-password').value;
    const role_id = parseInt(document.getElementById('um-role-select').value) || null;
    const status = isEdit ? document.getElementById('um-user-status').value : 'active';
    const wechat_id = document.getElementById('um-wechat-id').value.trim();
    const project_role = document.getElementById('um-project-role').value.trim();
    const duty = document.getElementById('um-duty').value.trim();
    const is_member = document.getElementById('um-is-member').checked;

    if (!realName) {
        showToast('真实姓名不能为空', 'warning');
        return;
    }
    // 新建时：企微ID自动填充为用户名，密码默认123456
    if (!isEdit) {
        if (!username && wechat_id) {
            username = wechat_id;
        }
        if (username && !password) {
            password = '123456';
        }
    }

    const body = { username, realName, role_id, status, wechat_id, project_role, duty, is_member };
    if (password) body.password = password;

    try {
        const url = isEdit ? `${API_BASE}/users/${userId}` : `${API_BASE}/users`;
        const method = isEdit ? 'PUT' : 'POST';
        const resp = await authFetch(url, { method, body: JSON.stringify(body) });
        const result = await resp.json();
        if (result.success || resp.ok) {
            showToast(isEdit ? '用户已更新' : '用户已创建', 'success');
            closeModal('um-user-modal');
            await umLoadData();
        } else {
            showToast(result.error || '操作失败', 'danger');
        }
    } catch (e) {
        showToast('保存用户失败: ' + e.message, 'danger');
    }
}

// 重置密码
function umResetPassword(userId, username) {
    showConfirm(`确定要重置用户「${username}」的密码吗？\n重置后密码将变为: 123456`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/users/${userId}`, {
                method: 'PUT',
                body: JSON.stringify({ password: '123456' })
            });
            const result = await resp.json();
            if (result.success || resp.ok) {
                showToast('密码已重置为 123456', 'success');
            } else {
                showToast(result.error || '重置失败', 'danger');
            }
        } catch (e) {
            showToast('重置密码失败: ' + e.message, 'danger');
        }
    });
}

// 切换用户状态
async function umToggleUserStatus(userId, newStatus) {
    try {
        const resp = await authFetch(`${API_BASE}/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        const result = await resp.json();
        if (result.success || resp.ok) {
            showToast(newStatus === 'active' ? '用户已启用' : '用户已禁用', 'success');
            await umLoadData();
        } else {
            showToast(result.error || '操作失败', 'danger');
        }
    } catch (e) {
        showToast('修改状态失败: ' + e.message, 'danger');
    }
}

// 删除用户
function umDeleteUser(userId, username) {
    showConfirm(`确定要删除用户「${username}」吗？\n此操作不可恢复。`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/users/${userId}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('用户已删除', 'success');
                await umLoadData();
            } else {
                showToast(result.error || '删除失败', 'danger');
            }
        } catch (e) {
            showToast('删除用户失败: ' + e.message, 'danger');
        }
    });
}
