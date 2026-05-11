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

// ========== 提交防重复机制（P0） ==========

/**
 * 防重复提交锁 — 全局 Map，key为表单ID，value为是否锁定
 * 用法：在 form submit handler 最开头调用 if (!acquireSubmitLock('xxx-form')) return;
 * 请求完成后（成功/失败都必须）调用 releaseSubmitLock('xxx-form')
 */
const _submitLocks = new Map();

/**
 * 获取提交锁。返回 false 表示已锁定（正在提交中），应直接忽略本次提交。
 * @param {string} formId - 表单ID或任意唯一标识
 * @returns {boolean} 是否获取成功
 */
function acquireSubmitLock(formId) {
    if (_submitLocks.get(formId)) return false; // 已锁定
    _submitLocks.set(formId, true);
    // 同时禁用对应表单的所有 submit 类型按钮
    const form = document.getElementById(formId);
    if (form) {
        form.querySelectorAll('button[type="submit"]').forEach(btn => {
            btn.dataset._origText = btn.textContent;
            btn.textContent = '⏳ 提交中...';
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
        });
    }
    return true;
}

/**
 * 释放提交锁。必须在 finally 中调用确保释放。
 * @param {string} formId - 表单ID
 */
function releaseSubmitLock(formId) {
    _submitLocks.delete(formId);
    const form = document.getElementById(formId);
    if (form) {
        form.querySelectorAll('button[type="submit"]').forEach(btn => {
            btn.textContent = btn.dataset._origText || '提交';
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = '';
            delete btn.dataset._origText;
        });
    }
}

/**
 * 包装异步提交操作，自动管理锁的获取和释放。
 * @param {string} formId - 表单ID
 * @param {Function} asyncFn - 异步提交函数，返回 Promise
 */
async function withSubmitLock(formId, asyncFn) {
    if (!acquireSubmitLock(formId)) {
        showToast('请勿重复提交', 'warning');
        return null;
    }
    try {
        return await asyncFn();
    } finally {
        releaseSubmitLock(formId);
    }
}

// ========== 表单实时校验系统（P0） ==========

/**
 * 校验规则定义
 * 每个规则: (value, formData) => string | null  — 返回错误信息或null（通过）
 */
const VALIDATION_RULES = {
    required: (val) => (!val || !String(val).trim()) ? '此字段为必填项' : null,
    minLength: (val, min) => val && String(val).trim().length < min ? `至少输入${min}个字符` : null,
    maxLength: (val, max) => val && String(val).length > max ? `不能超过${max}个字符` : null,
    isNumber: (val) => val && isNaN(Number(val)) ? '请输入有效数字' : null,
    isDate: (val) => {
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? '日期格式无效' : null;
    },
    // 自定义：游戏名称不能重复
    uniqueGameName: async (val, _, formId) => {
        if (!val || !val.trim()) return null;
        const idField = document.getElementById('game-id');
        const currentId = idField ? idField.value : '';
        try {
            const resp = await authFetch(`${API_BASE}/games`);
            const result = await resp.json();
            const dup = (result.data || []).find(g =>
                g.name === val.trim() && String(g.id) !== String(currentId)
            );
            return dup ? '游戏名称已存在' : null;
        } catch { return null; }
    }
};

/**
 * 存储每个表单的校验配置
 * 结构: { formId: { fieldId: [{ rule, param, message }], ... }, ... }
 */
const _formValidationConfigs = {};

/**
 * 注册表单校验配置
 * @param {string} formId - 表单ID
 * @param {Object} config - { fieldName: [ruleDefs, ...] }
 *   ruleDef: { rule: 'required'|'minLength'|..., param?: any, message?: string }
 */
function registerFormValidation(formId, config) {
    _formValidationConfigs[formId] = config;
    _bindValidationEvents(formId);
}

/**
 * 为表单字段绑定实时校验事件（input/blur/change）
 */
function _bindValidationEvents(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const config = _formValidationConfigs[formId];
    if (!config) return;

    Object.keys(config).forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // 实时 input 校验（带防抖）
        let debounceTimer = null;
        field.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => validateField(formId, fieldId), 400);
        });

        // blur 立即校验
        field.addEventListener('blur', () => validateField(formId, fieldId));

        // select change 立即校验
        if (field.tagName === 'SELECT') {
            field.addEventListener('change', () => validateField(formId, fieldId));
        }
    });
}

/**
 * 校验单个字段，显示/清除错误提示
 * @returns {boolean} 是否通过
 */
function validateField(formId, fieldId) {
    const config = _formValidationConfigs[formId];
    if (!config || !config[fieldId]) return true;

    const field = document.getElementById(fieldId);
    if (!field) return true;

    const value = field.value;
    let error = null;

    for (const ruleDef of config[fieldId]) {
        const ruleFn = VALIDATION_RULES[ruleDef.rule];
        if (!ruleFn) continue;

        const result = ruleFn(value, ruleDef.param, formId);
        // 支持异步规则（Promise）
        if (result instanceof Promise) {
            result.then(err => {
                if (err) _showFieldError(fieldId, err);
                else _clearFieldError(fieldId);
            });
            continue; // 异步结果稍后处理
        }

        if (result) {
            error = ruleDef.message || result;
            break; // 第一个错误就停
        }
    }

    if (error) {
        _showFieldError(fieldId, error);
        return false;
    } else {
        _clearFieldError(fieldId);
        return true;
    }
}

/**
 * 校验整个表单的所有字段
 * @returns {boolean} 全部是否通过
 */
function validateForm(formId) {
    const config = _formValidationConfigs[formId];
    if (!config) return true;

    let allValid = true;
    Object.keys(config).forEach(fieldId => {
        if (!validateField(formId, fieldId)) allValid = false;
    });
    return allValid;
}

/** 显示字段级错误提示 */
function _showFieldError(fieldId, message) {
    let el = document.getElementById(`${fieldId}-error`);
    if (!el) {
        el = document.createElement('div');
        el.id = `${fieldId}-error`;
        el.className = 'field-error-msg';
        const field = document.getElementById(fieldId);
        if (field) field.parentNode.insertBefore(el, field.nextSibling);
    }
    el.textContent = message;
    el.style.display = '';
    const field = document.getElementById(fieldId);
    if (field) field.classList.add('field-invalid');
}

/** 清除字段级错误提示 */
function _clearFieldError(fieldId) {
    const el = document.getElementById(`${fieldId}-error`);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
    const field = document.getElementById(fieldId);
    if (field) field.classList.remove('field-invalid');
}

// ========== 批量选择/操作系统（P0） ==========

/**
 * 每张表格的选择状态: { tableId: Set<rowId> }
 */
const _batchSelection = {};

/**
 * 初始化表格的批量选择功能
 * 在表格渲染后调用（或由 render 函数内部调用）
 * @param {string} tableId - tbody 元素ID
 * @param {Object} options - { onDelete: function(ids), entityName: string }
 */
function initBatchSelect(tableId, options = {}) {
    if (!_batchSelection[tableId]) _batchSelection[tableId] = new Set();
    const tbody = document.getElementById(tableId);
    if (!tbody) return;

    const table = tbody.closest('table');
    if (!table) return;

    // 确保 thead 有全选 checkbox
    const thead = table.querySelector('thead tr');
    if (thead && !thead.querySelector('.batch-select-all')) {
        const th = document.createElement('th');
        th.className = 'batch-select-col';
        th.innerHTML = `<input type="checkbox" class="batch-select-all" data-table="${tableId}" title="全选/取消全选">`;
        th.style.cssText = 'width:40px;text-align:center;';
        thead.insertBefore(th, thead.firstChild);
    }

    // 绑定全选事件
    const selectAllCb = table.querySelector('.batch-select-all');
    if (selectAllCb && !selectAllCb.dataset._bound) {
        selectAllCb.dataset._bound = '1';
        selectAllCb.addEventListener('change', () => {
            const rows = tbody.querySelectorAll('tr:not(.empty-state)');
            rows.forEach(row => {
                const cb = row.querySelector('.batch-cb');
                if (cb) {
                    cb.checked = selectAllCb.checked;
                    _toggleRowSelection(tableId, row, cb.checked);
                }
            });
            _updateBatchBar(tableId, options);
        });
    }

    // 为每一行确保有 checkbox（如果渲染函数已生成则跳过）
    tbody.querySelectorAll('tr:not(.empty-state)').forEach(row => {
        if (!row.querySelector('.batch-cb')) {
            const firstTd = row.querySelector('td');
            if (firstTd) {
                const td = document.createElement('td');
                td.className = 'batch-select-col';
                td.style.cssText = 'width:40px;text-align:center;';
                td.innerHTML = `<input type="checkbox" class="batch-cb" data-table="${tableId}" data-id="${row.dataset.id || ''}">`;
                row.insertBefore(td, firstTd);

                // 绑定行选择事件
                const cb = td.querySelector('.batch-cb');
                cb.addEventListener('change', () => _toggleRowSelection(tableId, row, cb.checked));
            }
        }
    });
}

/**
 * 切换单行选中状态
 */
function _toggleRowSelection(tableId, row, selected) {
    const id = row.dataset.id;
    if (!id) return;
    if (selected) {
        _batchSelection[tableId].add(id);
        row.classList.add('row-selected');
    } else {
        _batchSelection[tableId].delete(id);
        row.classList.remove('row-selected');
    }
}

/**
 * 获取当前表格选中的 ID 列表
 */
function getSelectedIds(tableId) {
    return Array.from(_batchSelection[tableId] || []);
}

/**
 * 获取选中数量
 */
function getSelectedCount(tableId) {
    return (_batchSelection[tableId] || new Set()).size;
}

/**
 * 更新批量操作栏显示状态
 */
function _updateBatchBar(tableId, options) {
    const count = getSelectedCount(tableId);
    const barId = `batch-bar-${tableId}`;
    let bar = document.getElementById(barId);

    if (count === 0) {
        if (bar) { bar.style.display = 'none'; }
        // 重置全选 checkbox
        const table = document.getElementById(tableId)?.closest('table');
        if (table) {
            const allCb = table.querySelector('.batch-select-all');
            if (allCb) allCb.checked = false;
        }
        return;
    }

    if (!bar) {
        bar = document.createElement('div');
        bar.id = barId;
        bar.className = 'batch-action-bar';
        const tbody = document.getElementById(tableId);
        if (tbody) tbody.parentNode.insertBefore(bar, tbody);
    }

    bar.innerHTML = `
        <span class="batch-info">已选 <strong>${count}</strong> 项</span>
        <div class="batch-actions">
            ${options.onDelete ? `<button class="btn btn-small btn-delete-batch" data-batch-action="delete">🗑️ 删除选中</button>` : ''}
            <button class="btn btn-small btn-secondary" data-batch-action="clear">取消选择</button>
        </div>
    `;
    bar.style.display = '';

    // 绑定操作按钮事件
    bar.querySelector('[data-batch-action="delete"]')?.addEventListener('click', () => {
        const ids = getSelectedIds(tableId);
        showConfirm(`确定要删除选中的 ${ids.length} 条${options.entityName || '记录'}吗？`, async () => {
            if (options.onDelete) await options.onDelete(ids);
            clearBatchSelection(tableId);
            _updateBatchBar(tableId, options);
        });
    });

    bar.querySelector('[data-batch-action="clear"]')?.addEventListener('click', () => {
        clearBatchSelection(tableId);
        _updateBatchBar(tableId, options);
    });
}

/**
 * 清除某表格的所有选择
 */
function clearBatchSelection(tableId) {
    _batchSelection[tableId]?.clear();
    const tbody = document.getElementById(tableId);
    if (!tbody) return;

    tbody.querySelectorAll('tr .batch-cb').forEach(cb => { cb.checked = false; });
    tbody.querySelectorAll('tr.row-selected').forEach(row => row.classList.remove('row-selected'));

    const table = tbody.closest('table');
    const allCb = table?.querySelector('.batch-select-all');
    if (allCb) allCb.checked = false;
}

// ========== 搜索高亮工具（P0） ==========

/**
 * 当前各模块的搜索关键词（用于高亮渲染）
 * 结构: { tableName: 'keyword' }
 */
const _searchKeywords = {};

/**
 * 设置搜索关键词（供筛选/搜索函数调用）
 * @param {string} tableId - 表格ID
 * @param {string} keyword - 搜索关键词
 */
function setSearchKeyword(tableId, keyword) {
    if (keyword && keyword.trim()) {
        _searchKeywords[tableId] = keyword.trim().toLowerCase();
    } else {
        delete _searchKeywords[tableId];
    }
}

/**
 * 对文本进行搜索关键词高亮，返回 HTML 字符串
 * 匹配部分用 <mark class="search-highlight"> 包裹
 * @param {string} text - 原始文本
 * @param {string} tableId - 表格ID（用于查找对应的关键词）
 * @returns {string} 高亮后的 HTML
 */
function highlightSearch(text, tableId) {
    if (!text) return escapeHtml(text || '');
    const keyword = _searchKeywords[tableId];
    if (!keyword) return escapeHtml(text);

    const escaped = escapeHtml(String(text));
    // 转义特殊正则字符
    const regexStr = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
        const regex = new RegExp(`(${regexStr})`, 'gi');
        return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
    } catch {
        return escaped;
    }
}

// ========== P1.5: 通用筛选Chips渲染函数 ==========
// 为各模块提供统一的筛选标签渲染能力
// 使用方法：在各模块的filter函数末尾调用 renderModuleFilterChips('members-table', {searchTerm, statusFilter})

/**
 * 渲染模块的筛选Chips标签
 * @param {string} moduleId - 模块标识（members/devices/tests等）
 * @param {Object} filters - 筛选条件对象 {searchTerm, statusFilter, ...}
 * @param {Object} options - 配置选项 {containerId, onRemoveHandlers}
 */
function renderModuleFilterChips(moduleId, filters, options = {}) {
    const containerId = options.containerId || `${moduleId}-filter-chips`;
    let container = document.getElementById(containerId);
    
    // 如果容器不存在，创建它（在table-container之前）
    if (!container) {
        const tableContainer = document.querySelector(`#${moduleId === 'members' ? 'members-table' : moduleId === 'devices' ? 'devices-table' : moduleId}-table`)?.closest('.table-container');
        if (tableContainer) {
            container = document.createElement('div');
            container.id = containerId;
            container.className = 'filter-chips-area';
            tableContainer.parentNode.insertBefore(container, tableContainer);
        }
    }
    
    if (!container) return;

    const chips = [];
    const onRemove = options.onRemoveHandlers || {};

    // 搜索条件chip
    if (filters.searchTerm) {
        chips.push({
            label: `搜索: "${filters.searchTerm}"`,
            onRemove: onRemove.searchTerm || (() => {
                const el = document.getElementById(`${moduleId}-search`);
                if (el) { el.value = ''; }
                // 触发对应模块的筛选函数
                if (typeof window[`filterModule`] === 'function') {
                    filterModule(moduleId);
                }
            })
        });
    }

    // 状态筛选chip
    if (filters.statusFilter) {
        const statusText = {
            'active': '活跃',
            'inactive': '非活跃',
            'available': '可用',
            'assigned': '已分配',
            'maintenance': '维护中',
            'broken': '损坏'
        }[filters.statusFilter] || filters.statusFilter;
        
        chips.push({
            label: `状态: ${statusText}`,
            onRemove: onRemove.statusFilter || (() => {
                const el = document.getElementById(`${moduleId}-status-filter`);
                if (el) { el.value = ''; }
                if (typeof window[`filterModule`] === 'function') {
                    filterModule(moduleId);
                }
            })
        });
    }

    // 其他自定义chips
    if (options.extraChips) {
        chips.push(...options.extraChips);
    }

    // 渲染chips
    if (chips.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    container.innerHTML = chips.map((chip, i) =>
        `<span class="filter-chip"><span class="chip-label">${escapeHtml(chip.label)}</span>` +
        `<span class="chip-remove" data-chip-idx="${i}">✕</span></span>`
    ).join('');

    // 事件委托
    container.onclick = (e) => {
        if (e.target.classList.contains('chip-remove')) {
            const idx = parseInt(e.target.dataset.chipIdx);
            if (chips[idx] && chips[idx].onRemove) {
                chips[idx].onRemove();
            }
        }
    };
}

// ========== P1.7: 通用分页增强函数 ==========
// 将游戏表已实现的分页增强功能（跳转页/条数选择）推广到所有模块

/**
 * 为模块的页码区域添加分页增强控件
 * @param {string} pageNumbersDivId - 页码div的ID
 * @param {number} currentPage - 当前页
 * @param {number} totalPages - 总页数
 * @param {number} currentPageSize - 当前每页条数
 * @param {Object} options - 配置选项
 *   - onPageChange: 页码变化回调 (moduleName, pageNum)
 *   - onPageSizeChange: 条数变化回调 (moduleName, newSize)
 *   - pageSizes: 可选的条数选项，默认[20, 50, 100, -1]
 */
function appendPaginationExtras(pageNumbersDivId, currentPage, totalPages, currentPageSize, options = {}) {
    const container = document.getElementById(pageNumbersDivId);
    if (!container) return;

    const pageSizes = options.pageSizes || [20, 50, 100];
    const moduleName = options.moduleName || '';

    // 如果totalPages<=1仍然显示增强控件
    let html = '<span class="page-jump-wrapper">跳至';
    html += `<input type="number" min="1" max="${totalPages || 1}" value="${currentPage}" `;
    html += `onkeydown="if(event.key==='Enter'){const v=parseInt(this.value);if(v>=1&&v<=${totalPages||1}){goToPageEx('${moduleName}',v);}this.value='${currentPage}';}" `;
    html += `title="输入页码后按回车跳转">`;
    html += `/${totalPages || 1} 页</span>`;

    html += '<span class="page-size-selector">每页';
    html += `<select onchange="changePageSizeEx('${moduleName}',this.value)">`;
    pageSizes.forEach(s => {
        const label = s === -1 ? '全部' : `${s}条`;
        html += `<option value="${s}" ${currentPageSize === s ? 'selected' : ''}>${label}</option>`;
    });
    html += `</select></span>`;

    // 追加到页码区域
    container.innerHTML = html;
}

// 全局分页状态管理
const _modulePaginationState = {};

/**
 * 设置模块的分页状态
 */
function setModulePaginationState(moduleName, state) {
    _modulePaginationState[moduleName] = { ...(_modulePaginationState[moduleName] || {}), ...state };
    // 持久化到localStorage
    try {
        localStorage.setItem(`pagination_${moduleName}`, JSON.stringify(_modulePaginationState[moduleName]));
    } catch(e) {}
}

/**
 * 获取模块的分页状态（从localStorage恢复）
 */
function getModulePaginationState(moduleName) {
    if (_modulePaginationState[moduleName]) return _modulePaginationState[moduleName];
    try {
        const saved = localStorage.getItem(`pagination_${moduleName}`);
        if (saved) {
            _modulePaginationState[moduleName] = JSON.parse(saved);
            return _modulePaginationState[moduleName];
        }
    } catch(e) {}
    return { page: 1, pageSize: 20 };
}

/**
 * 分页增强控件的页码跳转回调
 */
function goToPageEx(moduleName, pageNum) {
    setModulePaginationState(moduleName, { page: pageNum });
    // 触发对应模块的重新渲染（由各模块自行实现）
    const event = new CustomEvent('modulePageChange', { detail: { module: moduleName, page: pageNum } });
    document.dispatchEvent(event);
}

/**
 * 分页增强控件的条数变化回调
 */
function changePageSizeEx(moduleName, newSize) {
    const size = parseInt(newSize);
    setModulePaginationState(moduleName, { pageSize: size, page: 1 });
    // 触发对应模块的重新渲染
    const event = new CustomEvent('modulePageSizeChange', { detail: { module: moduleName, pageSize: size } });
    document.dispatchEvent(event);
}

