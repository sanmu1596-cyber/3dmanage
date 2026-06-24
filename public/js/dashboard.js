/**
 * dashboard.js — Dashboard与矩阵视图模块
 * 职责：Dashboard概览(Chart.js图表)、适配矩阵视图、表格Tooltip
 * 依赖：core.js, auth.js, router.js（authFetch, API_BASE, showToast等）
 */
var App = window.App;

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

let _dashRetryCount = 0;
const DASH_MAX_RETRY = 2;

async function loadDashboard() {
    try {
        const response = await authFetch(`${API_BASE}/stats/dashboard`);
        const result = await response.json();
        if (!result.success) {
            // API 返回失败时自动重试
            if (_dashRetryCount < DASH_MAX_RETRY) {
                _dashRetryCount++;
                console.warn(`Dashboard 数据加载失败，${500 * _dashRetryCount}ms 后重试 (${_dashRetryCount}/${DASH_MAX_RETRY})`);
                setTimeout(loadDashboard, 500 * _dashRetryCount);
            }
            return;
        }
        _dashRetryCount = 0; // 成功则重置计数
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

        // 加载近期关注事项
        if (typeof loadFocusItems === 'function') loadFocusItems();
    } catch (error) {
        console.error('加载 Dashboard 数据失败:', error);
        // 网络异常时也自动重试
        if (_dashRetryCount < DASH_MAX_RETRY) {
            _dashRetryCount++;
            console.warn(`Dashboard 网络异常，${500 * _dashRetryCount}ms 后重试 (${_dashRetryCount}/${DASH_MAX_RETRY})`);
            setTimeout(loadDashboard, 500 * _dashRetryCount);
        }
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
    const statusLabels = { completed: '已发布', developing: '开发中', undeveloped: '未开始', anticheat: '反外挂', not_applicable: '不适用' };
    const statusColors = { completed: '#2e9e5a', developing: '#d4880f', undeveloped: '#8c96a8', anticheat: '#e53e3e', not_applicable: '#a0aec0' };
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
                    <span class="activity-text">${escapeHtml(a.user_name || '未知用户')} ${action}了 ${type}${name}</span>
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
                platforms.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
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

// 在 MutationObserver 中也触发 tooltip（延迟足够长，让其他DOM操作先完成）
const _tooltipObserver = new MutationObserver(() => {
    clearTimeout(window._tooltipTimer);
    window._tooltipTimer = setTimeout(addTableTooltips, 500);
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(addTableTooltips, 800);
    document.querySelectorAll('.table-container').forEach(container => {
        _tooltipObserver.observe(container, { childList: true, subtree: true });
    });
});

