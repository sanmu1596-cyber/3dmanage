/**
 * social.js — 协作功能模块
 * 职责：评论组件(含@提及)、操作日志、导出增强、全局搜索扩展
 * 依赖：core.js, auth.js, router.js（authFetch, showToast, switchTab等）
 */
var App = window.App;

// ==================== 评论组件 Comments Module ====================
let currentReqId = null;      // 当前查看的需求ID
let currentPlanId = null;     // 当前查看的计划ID
let _membersCache = [];       // 成员缓存（用于@提及）

/**
 * 加载评论列表
 * @param {string} entityType - 实体类型: requirement | plan | bug | task
 * @param {number} entityId   - 实体ID
 * @param {string} prefix     - 前缀: req | plan (对应DOM ID)
 */
async function loadComments(entityType, entityId, prefix) {
    if (!entityId) return;
    try {
        const resp = await authFetch(`${API_BASE}/comments?entity_type=${entityType}&entity_id=${entityId}`);
        const result = await resp.json();
        const list = document.getElementById(`${prefix}-comments-list`);
        const countEl = document.getElementById(`${prefix}-comments-count`);
        if (!list) return;

        if (result.success && result.data && result.data.length > 0) {
            countEl.textContent = result.data.length;
            list.innerHTML = result.data.map(c => renderCommentItem(c, entityType, entityId, prefix)).join('');
        } else {
            countEl.textContent = '0';
            list.innerHTML = '<li class="comments-empty"><div class="comments-empty-icon">💬</div>暂无评论，来写第一条吧~</li>';
        }
    } catch (e) {
        console.error('加载评论失败:', e);
    }
}

/** 渲染单条评论 */
function renderCommentItem(c, entityType, entityId, prefix) {
    const user = getCurrentUser();
    const isOwner = (c.user_id === user.id);
    const isAdmin = IS_DEV_MODE || user.role_id === 1;
    const canDelete = isOwner || isAdmin;
    // 处理@mention高亮
    let textHtml = escHtml(c.content || '');
    textHtml = textHtml.replace(/@(\d+)/g, '<span class="mention-highlight">@$1</span>');
    // 格式化时间
    const timeStr = formatCommentTime(c.created_at);
    // 头像取名字首字
    const avatarChar = (c.user_name || '?').charAt(0).toUpperCase();

    return `<li class="comment-item" id="comment-${c.id}">
        <div class="comment-avatar-sm">${avatarChar}</div>
        <div class="comment-body">
            <div class="comment-meta">
                <span class="comment-author">${escHtml(c.user_name || '未知用户')}</span>
                <span class="comment-time">${timeStr}</span>
            </div>
            <div class="comment-text">${textHtml}</div>
            ${canDelete ? `<div class="comment-actions"><button class="comment-action-btn" onclick="deleteComment(${c.id}, '${entityType}', ${entityId}, '${prefix}')">🗑️ 删除</button></div>` : ''}
        </div></li>`;
}

/** 提交评论 */
async function submitComment(entityType, entityId, prefix) {
    const input = document.getElementById(`${prefix}-comment-input`);
    const content = (input.value || '').trim();
    if (!content) return showToast('请输入评论内容', 'warning');
    if (!entityId) return showToast('数据异常，请刷新页面', 'danger');

    try {
        const btn = input.parentElement.querySelector('.comment-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = '发送中...'; }

        const resp = await authFetch(`${API_BASE}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_type: entityType, entity_id: entityId, content })
        });
        const result = await resp.json();

        if (result.success) {
            input.value = '';
            showToast('评论发表成功', 'success');
            await loadComments(entityType, entityId, prefix);
        } else {
            showToast(result.error || '发送失败', 'danger');
        }
    } catch (e) {
        showToast('网络错误', 'danger');
    } finally {
        const btn2 = input.parentElement.querySelector('.comment-submit-btn');
        if (btn2) { btn2.disabled = false; btn2.textContent = '发送'; }
    }
}

/** 删除评论 */
async function deleteComment(commentId, entityType, entityId, prefix) {
    showConfirm('确定要删除这条评论吗？', async () => {
        try {
            const resp = await authFetch(`${API_BASE}/comments/${commentId}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('评论已删除', 'success');
                await loadComments(entityType, entityId, prefix);
            } else {
                showToast(result.error || '删除失败', 'danger');
            }
        } catch (e) {
            showToast('操作失败', 'danger');
        }
    });
}

/** 初始化@提及功能 */
function initMentionPicker(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    let hideTimer = null;

    input.addEventListener('keyup', function(e) {
        const val = this.value;
        const pos = this.selectionStart;
        // 找光标前的@符号
        const beforeCursor = val.substring(0, pos);
        const atIdx = beforeCursor.lastIndexOf('@');

        if (atIdx >= 0 && (pos - atIdx - 1) <= 15) {
            const query = val.substring(atIdx + 1, pos).toLowerCase();
            showMentionDropdown(dropdown, query, input, atIdx);
        } else {
            hideMentionDropdown(dropdown);
        }
    });

    input.addEventListener('blur', function() {
        hideTimer = setTimeout(() => hideMentionDropdown(dropdown), 150);
    });
    input.addEventListener('focus', function() {
        if (hideTimer) clearTimeout(hideTimer);
    });
}

/** 显示@提及下拉 */
function showMentionDropdown(dropdown, query, input, atIdx) {
    if (_membersCache.length === 0) return;

    const filtered = _membersCache.filter(m =>
        m.real_name.toLowerCase().includes(query) || m.username.toLowerCase().includes(query)
    ).slice(0, 8);

    if (filtered.length === 0) { hideMentionDropdown(dropdown); return; }

    dropdown.innerHTML = filtered.map(m =>
        `<div class="mention-item" data-id="${m.id}" data-name="${escHtml(m.real_name)}">
            <span class="mi-name">${escHtml(m.real_name)}</span>
            <span class="mi-role">@${m.username}</span>
        </div>`
    ).join('');

    dropdown.classList.add('show');

    // 点击选择
    dropdown.querySelectorAll('.mention-item').forEach(item => {
        item.onclick = function() {
            const uid = this.dataset.id;
            const name = this.dataset.name;
            const val = input.value;
            // 替换@xxx为@uid
            const beforeAt = val.substring(0, atIdx);
            input.value = beforeAt + '@' + uid + ' ' + val.substring(input.selectionStart);
            hideMentionDropdown(dropdown);
            input.focus();
        };
    });
}

function hideMentionDropdown(dropdown) {
    if (dropdown) dropdown.classList.remove('show');
}

/** 缓存成员列表（用于@提及） */
async function cacheMembersForMention() {
    if (_membersCache.length > 0) return;
    try {
        const resp = await authFetch(`${API_BASE}/users?is_member=true`);
        const result = await resp.json();
        if (result.data) _membersCache = result.data;
    } catch (e) { /* 静默 */ }
}

/** 格式化评论时间 */
function formatCommentTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(/-/g, '/'));
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    return dateStr.slice(5, 16).replace('-', '-'); // MM-DD HH:mm
}

// ===== 集成到详情视图：需求详情 =====
const _origOpenReqDetail = typeof openReqDetail === 'function' ? openReqDetail : null;
if (_origOpenReqDetail) {
    window.openReqDetail = async function(id) {
        currentReqId = id;
        await _origOpenReqDetail(id);
        loadComments('requirement', id, 'req');
        cacheMembersForMention();
        initMentionPicker('req-comment-input', 'req-mention-dropdown');
        // 设置头像
        const user = getCurrentUser();
        const avEl = document.getElementById('req-comment-avatar');
        if (avEl) avEl.textContent = (user.real_name || user.username || '?').charAt(0).toUpperCase();
    };
}

// ===== 集成到详情视图：计划详情 =====
const _origOpenPlanDetail = typeof openPlanDetail === 'function' ? openPlanDetail : null;
if (_origOpenPlanDetail) {
    window.openPlanDetail = async function(planIndex) {
        const plan = configPlans[planIndex];
        if (!plan) return;
        currentPlanId = plan.id;
        await _origOpenPlanDetail(planIndex);
        loadComments('plan', plan.id, 'plan');
        cacheMembersForMention();
        initMentionPicker('plan-comment-input', 'plan-mention-dropdown');
        // 设置头像
        const user = getCurrentUser();
        const avEl = document.getElementById('plan-comment-avatar');
        if (avEl) avEl.textContent = (user.real_name || user.username || '?').charAt(0).toUpperCase();
    };
}

console.log('✅ 评论组件模块已加载（支持需求/计划评论区 + @提及）');


// ==================== 操作日志 Activity Logs Module ====================
let _logCurrentPage = 1;
const _logPageSize = 30;

const _resourceTypeLabels = {
    requirement: '📄 需求', plan: '📋 计划', task: '🎮 任务', bug: '🐛 缺陷',
    game: '🕹️ 游戏', device: '📱 设备', user: '👤 用户', member: '👥 成员',
    config_plan: '⚙️ 配置', test: '🧪 测试', version: '📦 版本'
};
const _actionLabels = {
    create: '✅ 创建', update: '✏️ 编辑', delete: '🗑️ 删除', assign: '👤 指派',
    publish: '🚀 发布', close: '🏁 完成', link: '🔗 关联', unlink: '❌ 取消关联',
    import: '📥 导入', export: '📤 导出', login: '🔓 登录'
};

/** 加载操作日志列表 */
async function loadActivityLogs(page) {
    if (page) _logCurrentPage = page;
    const type = document.getElementById('log-type-filter')?.value || 'all';
    try {
        // 并行请求列表和统计
        const [listRes, statsRes] = await Promise.all([
            authFetch(`${API_BASE}/activity-logs?resource_type=${type}&page=${_logCurrentPage}&limit=${_logPageSize}`),
            authFetch(`${API_BASE}/activity-logs/stats`)
        ]);
        const listData = await listRes.json();
        const statsData = await statsRes.json();

        if (listData.success) renderActivityLogTable(listData.data);
        if (statsData.success) renderLogStats(statsData.data);

        // 分页
        renderLogPagination(listData.total);
    } catch (e) {
        console.error('加载操作日志失败:', e);
        document.getElementById('activity-logs-tbody').innerHTML =
            '<tr><td colspan="6" class="empty-state"><div>加载失败，请重试</div></td></tr>';
    }
}

/** 渲染日志表格 */
function renderActivityLogTable(logs) {
    const tbody = document.getElementById('activity-logs-tbody');
    if (!logs || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">📋</div><div>暂无操作日志</div></td></tr>`;
        return;
    }
    tbody.innerHTML = logs.map((log, i) => {
        const typeLabel = _resourceTypeLabels[log.resource_type] || log.resource_type;
        const actionLabel = _actionLabels[log.action] || log.action;
        const timeStr = (log.created_at || '').slice(5, 16).replace('T', ' ');
        return `<tr>
            <td class="text-center">${(_logCurrentPage - 1) * _logPageSize + i + 1}</td>
            <td><span style="font-size:12px;">${actionLabel}</span></td>
            <td><span style="font-size:12px;color:var(--text-secondary);">${typeLabel}</span></td>
            <td>${escHtml(log.resource_name || '-')}</td>
            <td>${escHtml(log.user_name || '-')}</td>
            <td style="color:var(--text-light,#888);font-size:12px;">${timeStr}</td>
        </tr>`;
    }).join('');
}

/** 渲染类型统计卡片 */
function renderLogStats(stats) {
    const container = document.getElementById('log-stats-cards');
    if (!container) return;
    if (!stats || stats.length === 0) { container.innerHTML = ''; return; }

    const total = stats.reduce((s, item) => s + (item.cnt || 0), 0);
    container.innerHTML = stats.slice(0, 6).map(s => `
        <div class="dash-card" style="cursor:pointer;${document.getElementById('log-type-filter')?.value===s.resource_type?'border-color:var(--primary);':''}"
             onclick="document.getElementById('log-type-filter').value='${s.resource_type}';loadActivityLogs(1);">
            <div class="dash-card-icon">${_resourceTypeLabels[s.resource_type]?.split(' ')[0] || '📋'}</div>
            <div class="dash-card-info">
                <div class="dash-card-num">${s.cnt}</div>
                <div class="dash-card-label">${_resourceTypeLabels[s.resource_type]?.substring(2) || s.resource_type}</div>
            </div>
        </div>
    `).join('');
}

/** 渲染分页 */
function renderLogPagination(total) {
    const container = document.getElementById('log-pagination');
    if (!container) return;
    const totalPages = Math.ceil(total / _logPageSize);
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    let html = `<span style="font-size:12px;color:var(--text-muted);">共 ${total} 条 / ${totalPages} 页</span>`;
    html += `<button class="tool-btn" ${ _logCurrentPage<=1 ?'disabled':'' } onclick="loadActivityLogs(${_logCurrentPage-1})">上一页</button>`;
    for (let p=1;p<=totalPages;p++) {
        if(p===1||p===totalPages||(p>=_logCurrentPage-1&&p<=_logCurrentPage+1)){
            html+=`<button class="tool-btn" ${p===_logCurrentPage ?'style="background:var(--primary);color:#fff;"':'' } onclick="loadActivityLogs(${p})">${p}</button>`;
        } else if ([_logCurrentPage-2,_logCurrentPage+2].includes(p)) html+=`<span style="color:var(--text-muted)">...</span>`;
    }
    html+=`<button class="tool-btn" ${ _logCurrentPage>=totalPages ?'disabled':'' } onclick="loadActivityLogs(${_logCurrentPage+1})">下一页</button>`;
    container.innerHTML = html;
}

// 切换到日志tab时自动加载
const _origSwitchTab2 = window.switchTab;
window.switchTab = function(tabId) {
    _origSwitchTab2(tabId);
    if (tabId === 'activity-logs') loadActivityLogs(1);
};


// ==================== 导出功能扩展 Export Enhancement ====================
Object.assign(exportConfigs, {
    requirements: {
        sheetName: '需求列表',
        getData: () => requirementsData || [],
        columns: [
            { key: 'req_no', label: '需求编号' }, { key: 'title', label: '标题' },
            { key: 'priority', label: '优先级' }, { key: 'status', label: '状态' },
            { key: 'assigned_name', label: '指派PM' }, { key: 'creator_name', label: '创建者' },
            { key: 'deadline', label: '截止日期' }, { key: 'created_at', label: '创建时间' }
        ]
    },
    plans: {
        sheetName: '配置计划',
        getData: () => configPlans || [],
        columns: [
            { key: 'planNo', label: '计划编号' }, { key: 'title', label: '计划标题' },
            { key: 'status', label: '状态' }, { key: 'date', label: '日期' },
            { key: 'goal', label: '目标说明' }, { key: 'gameCount', label: '游戏数' },
            { key: 'requirementTitle', label: '关联需求' }
        ]
    }
});

// ========== 纯前端 CSV / JSON 导出 ==========
/**
 * 导出数据为CSV文件（浏览器下载）
 * @param {Array} data - 对象数组
 * @param {Array} columns - [{key, label}] 列配置
 * @param {String} filename - 文件名（不含扩展名）
 */
function exportToCSV(data, columns, filename) {
    if (!data || !data.length) { showToast('没有数据可导出', 'warning'); return; }
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel
    const header = columns.map(c => c.label).join(',');
    const rows = data.map(row =>
        columns.map(c => {
            let val = row[c.key];
            if (val === null || val === undefined) val = '';
            val = String(val).replace(/"/g, '""');
            return `"${val}"`;
        }).join(',')
    );
    const csv = BOM + [header, ...rows].join('\n');
    downloadFile(csv, filename + '.csv', 'text/csv;charset=utf-8;');
}

/**
 * 导出数据为JSON文件（浏览器下载）
 */
function exportToJSON(data, filename) {
    if (!data || !data.length) { showToast('没有数据可导出', 'warning'); return; }
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, filename + '.json', 'application/json');
}

/**
 * 通用文件下载触发器
 */
function downloadFile(content, mimeType, charset) {
    const blob = new Blob([content], { type: charset || mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'download';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
}

/**
 * 快捷导出当前列表
 * @param {String} moduleKey - exportConfigs中的key
 * @param {String} format - 'csv' | 'json'
 */
function quickExport(moduleKey, format) {
    const config = exportConfigs[moduleKey];
    if (!config) { showToast('不支持导出: ' + moduleKey, 'warning'); return; }
    const data = typeof config.getData === 'function' ? config.getData() : [];
    const fn = (config.sheetName || moduleKey) + '_' + new Date().toISOString().slice(0,10);
    if (format === 'csv') exportToCSV(data, config.columns, fn);
    else exportToJSON(data, fn);
}


// ==================== 全局搜索增强：支持需求/计划 ====================
(function() {
    // 在全局搜索初始化后注入新的搜索源
    setTimeout(() => {
        // 检查是否有搜索结果数组可以扩展
        if (typeof window._searchSources !== 'undefined') {
            window._searchSources.push(
                { id: 'requirements', label: '需求', icon: '📄', tab: 'requirements' },
                { id: 'plans', label: '计划', icon: '📋', tab: 'config-plan' }
            );
        }
    }, 2000);
})();

console.log('✅ 通用增强模块已加载（操作日志页面 + 导出扩展 + 搜索增强）');

