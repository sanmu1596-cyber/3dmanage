/**
 * 汇报报表模块 — reports.js（增强编辑版）
 * 只保留「游戏适配状态详情表」，全字段可编辑：
 * - 游戏名称 → 下拉选择（从游戏列表提取）
 * - 适配状态 → 下拉选择（待适配 / 适配中 / 已适配）
 * - 平台   → 下拉选择（Steam / WeGame / 官网）
 * - 备注   → 文本输入框
 * - 标准工具栏 + 搜索过滤 + 排序 + 拖拽 + 分页 + Excel导出
 */

// ==================== 全局变量 ====================
let reportDataCache = null;
let allReportGameData = [];          // 全量扁平游戏数据
let filteredReportGameData = [];     // 筛选后数据
let reportSearchTerm = '';
let reportCurrentPage = 1;
let reportGameListCache = [];        // 游戏列表缓存（用于下拉选项）
const REPORT_PAGE_SIZE = 20;

// ==================== 下拉选项定义 ====================
const REPORT_STATUS_OPTIONS = [
    { value: 'pending', label: '待适配', badge: 'pending-badge', color: '#9ca3af' },
    { value: 'inProgress', label: '适配中', badge: 'adapting-badge', color: '#0369a1' },
    { value: 'completed', label: '已适配', badge: 'completed-badge', color: '#166534' }
];

const REPORT_PLATFORM_OPTIONS = ['Steam', 'WeGame', '官网'];

// ==================== 默认兜底数据 ====================
function getDefaultReportData() {
    return [
        { _id: 1, name: '艾尔登法环', status: 'inProgress', statusLabel: '适配中', platform: 'Steam', notes: '场景切换偶发闪退，排查中' },
        { _id: 2, name: '黑神话：悟空', status: 'inProgress', statusLabel: '适配中', platform: 'WeGame', notes: '分辨率缩放算法待优化' },
        { _id: 3, name: '霍格沃茨之遗', status: 'inProgress', statusLabel: '适配中', platform: 'Steam', notes: '光影渲染需进一步调校' },
        { _id: 4, name: '幻兽帕鲁', status: 'pending', statusLabel: '待适配', platform: '', notes: '' },
        { _id: 5, name: '暗黑破坏神 IV', status: 'inProgress', statusLabel: '适配中', platform: 'Steam', notes: '优先级:medium | 帧率3D后降至28fps' },
        { _id: 6, name: '真·三国无双8', status: 'pending', statusLabel: '待适配', platform: '', notes: '' },
        { _id: 7, name: '博德之门 3', status: 'completed', statusLabel: '已适配', platform: 'Steam', notes: '适配完成并通过测试' },
        { _id: 8, name: '赛博朋克 2077', status: 'completed', statusLabel: '已适配', platform: 'Steam', notes: '' },
        { _id: 9, name: '古墓丽影：暗影', status: 'completed', statusLabel: '已适配', platform: 'Steam', notes: '3D效果优秀，已上线' }
    ];
}

// ==================== 主入口 ====================
function loadReports() {
    if (typeof authFetch !== 'function') {
        setTimeout(() => {
            if (typeof authFetch === 'function') loadReportData();
            else setReportError('系统组件加载中，请刷新页面');
        }, 500);
        return;
    }
    loadReportData();
}

function refreshReports() {
    showReportLoading();
    loadReportData();
}

function showReportLoading() {
    const tbody = document.getElementById('report-games-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> 加载中...</td></tr>';
}

function setReportError(msg) {
    const tbody = document.getElementById('report-games-tbody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(msg)} <a href="#" onclick="loadReportData()" style="margin-left:8px;">重试</a></td></tr>`;
    }
}

// ==================== 加载游戏列表（用于下拉） ====================
function loadGameListForDropdown() {
    if (reportGameListCache.length > 0) return Promise.resolve(reportGameListCache);

    return fetch(API_BASE + '/games?limit=500')
        .then(r => r.json())
        .then(result => {
            if (result && result.data && Array.isArray(result.data)) {
                reportGameListCache = result.data.map(g => g.name || '').filter(Boolean).sort();
                // 去重并保持顺序
                reportGameListCache = [...new Set(reportGameListCache)];
            } else if (result && Array.isArray(result)) {
                reportGameListCache = result.map(g => g.name || '').filter(Boolean).sort();
                reportGameListCache = [...new Set(reportGameListCache)];
            }
            return reportGameListCache;
        })
        .catch(err => {
            console.error('[reports] 加载游戏列表失败:', err);
            return [];
        });
}

// ==================== 数据加载 ====================
function loadReportData() {
    showReportLoading();

    // 并行：加载报表数据 + 加载游戏列表下拉选项
    let dataPromise = authFetch(API_BASE + '/reports/data')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(result => {
            if (!result.success) throw new Error(result.error || '服务器返回错误');
            reportDataCache = result.data;
            allReportGameData = flattenGameStatus(result.data.gameStatus);
            filteredReportGameData = [...allReportGameData];
            if (result.data.lastUpdated) {
                const el = document.getElementById('reports-updated');
                if (el) el.textContent = '更新于 ' + new Date(result.data.lastUpdated).toLocaleString('zh-CN');
            }
            hideReportBanner();
        });

    // 游戏列表（下拉用，失败不影响主流程）
    loadGameListForDropdown().catch(() => {});

    dataPromise.then(() => renderReportTable()).catch(err => {
        console.error('[reports] 加载失败:', err);

        // ★ 兜底：使用默认示例数据
        allReportGameData = getDefaultReportData();
        filteredReportGameData = [...allReportGameData];
        reportDataCache = null;
        showReportBanner('数据加载异常，当前显示的是示例数据。点击「刷新」重试。');
        renderReportTable();

        // 后台静默重试一次（仅 localhost）
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            fetch(API_BASE + '/reports/data', { credentials: 'include' })
                .then(r2 => r2.json())
                .then(result2 => {
                    if (result2 && result2.success) {
                        reportDataCache = result2.data;
                        allReportGameData = flattenGameStatus(result2.data.gameStatus);
                        filteredReportChartData = [...allReportGameData];
                        hideReportBanner();
                        renderReportTable();
                    }
                })
                .catch(() => {});
        }
    });
}

// ==================== 横幅提示 ====================
function showReportBanner(msg) {
    let banner = document.getElementById('report-banner');
    if (!banner) {
        const toolbar = document.querySelector('#reports .toolbar');
        if (!toolbar) return;
        banner = document.createElement('div');
        banner.id = 'report-banner';
        banner.className = 'report-fallback-banner';
        toolbar.parentNode.insertBefore(banner, toolbar.nextSibling);
    }
    banner.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(msg)} <a href="#" onclick="refreshReports();return false;" style="margin-left:8px;color:#0369a1;font-weight:600;">刷新</a>`;
    banner.style.display = '';
}
function hideReportBanner() {
    const banner = document.getElementById('report-banner');
    if (banner) banner.style.display = 'none';
}

// ==================== 扁平化 API 数据 ====================
function flattenGameStatus(gameStatus) {
    const gs = gameStatus || {};
    const rows = [];

    (gs.inProgress || []).forEach((g, i) => {
        rows.push({
            _id: 'ip_' + i,
            name: g.name,
            status: 'inProgress',
            statusLabel: '适配中',
            platform: g.platform || '',
            notes: g.notes || ''
        });
    });

    (gs.hasBugs || []).forEach((g, i) => {
        rows.push({
            _id: 'hb_' + i,
            name: g.name,
            status: 'inProgress',  // 有BUG归类为适配中
            statusLabel: '适配中',
            platform: g.platform || '',
            notes: (g.bugNotes || '')
        });
    });

    (gs.completed || []).forEach((g, i) => {
        rows.push({
            _id: 'cp_' + i,
            name: g.name,
            status: 'completed',
            statusLabel: '已适配',
            platform: g.platform || '',
            notes: g.notes || ''
        });
    });

    return rows;
}

/** 根据 status 值查找对应的显示信息 */
function getStatusInfo(statusValue) {
    return REPORT_STATUS_OPTIONS.find(s => s.value === statusValue)
        || REPORT_STATUS_OPTIONS[0]; // 默认待适配
}

// ==================== 搜索过滤 ====================
function filterReports() {
    reportSearchTerm = (document.getElementById('report-search-input')?.value || '').toLowerCase().trim();

    if (typeof setSearchKeyword === 'function') {
        setSearchKeyword('report-games-table', reportSearchTerm);
    }

    filteredReportGameData = allReportGameData.filter(g => {
        if (!reportSearchTerm) return true;
        return (g.name || '').toLowerCase().includes(reportSearchTerm) ||
               (getStatusInfo(g.status).label || '').includes(reportSearchTerm) ||
               (g.platform || '').toLowerCase().includes(reportSearchTerm) ||
               (g.notes || '').toLowerCase().includes(reportSearchTerm);
    });

    reportCurrentPage = 1;
    renderReportTable();
}

function resetReportFilters() {
    const si = document.getElementById('report-search-input');
    if (si) si.value = '';
    reportSearchTerm = '';
    if (typeof setSearchKeyword === 'function') {
        setSearchKeyword('report-games-table', '');
    }
    filteredReportGameData = [...allReportGameData];
    reportCurrentPage = 1;
    renderReportTable();
}

// ==================== 表格渲染（全字段可编辑） ====================
function renderReportTable() {
    const tbody = document.getElementById('report-games-tbody');
    if (!tbody) return;

    let dataToShow = filteredReportGameData;
    if (REPORT_PAGE_SIZE !== -1) {
        const start = (reportCurrentPage - 1) * REPORT_PAGE_SIZE;
        dataToShow = filteredReportGameData.slice(start, start + REPORT_PAGE_SIZE);
    }

    if (typeof updateColumnHeaders === 'function') {
        updateColumnHeaders('report-games-table');
    }

    // 空数据提示
    if (dataToShow.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">
            <div class="empty-icon">🎮</div>
            <div class="empty-text">暂无游戏适配状态数据</div>
            <div class="empty-sub">点击「添加行」新增记录，或使用上方工具栏操作</div>
        </td></tr>`;
        updateReportPagination();
        return;
    }

    // 构建行HTML —— 每个字段都是可编辑控件
    const gameNames = reportGameListCache.length > 0 ? reportGameListCache : dataToShow.map(g => g.name).filter(Boolean);

    tbody.innerHTML = dataToShow.map((g, idx) => {
        const globalIdx = REPORT_PAGE_SIZE === -1 ? idx + 1 : (reportCurrentPage - 1) * REPORT_PAGE_SIZE + idx + 1;
        const rowId = g._id || idx;
        const sInfo = getStatusInfo(g.status);

        // 序号列
        let html = `<td class="text-center"><strong>${globalIdx}</strong></td>`;

        // 获取列顺序
        let colOrder = ['name', 'status', 'platform', 'notes'];
        if (typeof getColumnOrder === 'function') {
            try { colOrder = getColumnOrder('report-games-table'); } catch(e) {}
        }

        colOrder.forEach(field => {
            switch(field) {
                case 'name':
                    // 游戏名称 — 可搜索的下拉选择框
                    html += `<td class="cell-game-name">
                        <select class="report-select report-select-name"
                                data-row-id="${rowId}" data-field="name"
                                data-old-name="${escapeHtml(g.name)}"
                                onchange="onReportFieldChange(this)">
                            <option value="">-- 选择游戏 --</option>
                            ${gameNames.map(n =>
                                `<option value="${escapeHtml(n)}"${n === g.name ? ' selected' : ''}>${escapeHtml(n)}</option>`
                            ).join('')}
                        </select>
                    </td>`;
                    break;

                case 'status':
                    // 适配状态 — 下拉选择
                    html += `<td>
                        <select class="report-select report-select-status"
                                data-row-id="${rowId}" data-field="status"
                                data-old-status="${escapeHtml(g.status)}"
                                style="background:${sInfo.color}15;border-color:${sInfo.color}45;color:${sInfo.color};font-weight:600;"
                                onchange="onReportFieldChange(this)">
                            ${REPORT_STATUS_OPTIONS.map(opt =>
                                `<option value="${opt.value}"${opt.value === g.status ? ' selected' : ''}
                                        style="color:${opt.color}">${opt.label}</option>`
                            ).join('')}
                        </select>
                    </td>`;
                    break;

                case 'platform':
                    // 平台 — 下拉选择
                    html += `<td>
                        <select class="report-select report-select-platform"
                                data-row-id="${rowId}" data-field="platform"
                                data-old-platform="${escapeHtml(g.platform)}"
                                onchange="onReportFieldChange(this)">
                            <option value="">-- 选择平台 --</option>
                            ${REPORT_PLATFORM_OPTIONS.map(p => {
                                const selected = (p.toLowerCase() === String(g.platform || '').toLowerCase());
                                return `<option value="${p}"${selected ? ' selected' : ''}>${p}</option>`;
                            }).join('')}
                        </select>
                    </td>`;
                    break;

                case 'notes':
                    // 备注 — 文本输入框
                    html += `<td class="cell-wrap">
                        <input type="text" class="report-text-edit"
                               data-row-id="${rowId}" data-field="notes"
                               value="${escapeHtml(g.notes)}"
                               placeholder="填写备注..."
                               onblur="onReportFieldChange(this)"
                               data-old-notes="${escapeHtml(g.notes)}">
                    </td>`;
                    break;
            }
        });

        return `<tr data-row-id="${rowId}">${html}
            <td class="text-center">
                <button class="report-del-btn" onclick="deleteReportRow('${rowId}')" title="删除此行"><i class="fas fa-trash-alt" style="font-size:12px;color:#ef4444;cursor:pointer;"></i></button>
            </td>
        </tr>`;
    }).join('');

    // 后置初始化
    updateReportPagination();
    if (typeof applyCellTooltips === 'function') applyCellTooltips('report-games-table');
    if (typeof initHeaderDrag === 'function') try { initHeaderDrag('report-games-table'); } catch(e) {}
    if (typeof initTableSort === 'function') try { initTableSort('report-games-table'); } catch(e) {}
}

// ==================== 统一字段变更处理 ====================
/**
 * 所有编辑控件的统一 onChange/onBlur 处理器
 * 根据控件类型自动识别 field，更新本地缓存 + 保存到服务器
 */
function onReportFieldChange(el) {
    const rowId = el.getAttribute('data-row-id');
    const field = el.getAttribute('data-field');

    if (!field || !rowId) return;

    let oldValue, newValue;

    switch(field) {
        case 'name':
            oldValue = el.getAttribute('data-old-name') || '';
            newValue = el.value.trim();
            el.setAttribute('data-old-name', newValue);
            break;
        case 'status':
            oldValue = el.getAttribute('data-old-status') || '';
            newValue = el.value;
            el.setAttribute('data-old-status', newValue);
            break;
        case 'platform':
            oldValue = el.getAttribute('data-old-platform') || '';
            newValue = el.value;
            el.setAttribute('data-old-platform', newValue);
            break;
        case 'notes':
            oldValue = el.getAttribute('data-old-notes') || '';
            newValue = el.value.trim();
            el.setAttribute('data-old-notes', newValue);
            break;
        default:
            return;
    }

    // 值没变化跳过
    if (newValue === oldValue) return;

    // 找到对应的数据行
    const rowData = allReportGameData.find(r => r._id == rowId);
    if (!rowData) return;

    // 更新本地缓存
    if (field === 'name') {
        rowData.name = newValue;
    } else if (field === 'status') {
        rowData.status = newValue;
        const sInfo = getStatusInfo(newValue);
        rowData.statusLabel = sInfo.label;
        // 更新 select 样式颜色
        el.style.background = sInfo.color + '15';
        el.style.borderColor = sInfo.color + '45';
        el.style.color = sInfo.color;
    } else if (field === 'platform') {
        rowData.platform = newValue;
    } else if (field === 'notes') {
        rowData.notes = newValue;
    }

    // 视觉反馈：成功绿色边框闪烁
    el.style.borderColor = '#28a745';
    setTimeout(() => {
        el.style.borderColor = '';
    }, 1200);

    // 异步保存到服务器（不阻塞UI）
    saveRowToServer(rowData);
}

// ==================== 保存到服务器 ====================
function saveRowToServer(rowData) {
    if (!rowData || !rowData._id) return;

    const payload = {
        _id: rowData._id,
        name: rowData.name || '',
        status: rowData.status || 'pending',
        platform: rowData.platform || '',
        notes: rowData.notes || ''
    };

    authFetch(API_BASE + '/reports/save-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(result => {
        if (result.success) {
            // 如果服务端返回了新的_id（首次创建），同步回来
            if (result.id) rowData._id = result.id;
            showToast('已保存', 'success');
        } else {
            showToast(result.error || '保存失败', 'warning');
        }
    })
    .catch(err => {
        console.error('[reports] 保存失败:', err);
        showToast('本地已修改，但同步服务器失败', 'danger');
    });
}

/** 旧版兼容接口（备注单独保存） */
function saveReportOverride(inputEl) {
    const rowId = inputEl.getAttribute('data-row-id') || inputEl.getAttribute('data-entity');
    if (inputEl.hasAttribute('data-row-id')) {
        onReportFieldChange(inputEl); // 新版统一处理
    } else {
        // 兜底：走旧的 entity_key 方式
        const type = inputEl.getAttribute('data-report-type');
        const entity = inputEl.getAttribute('data-entity');
        const field = inputEl.getAttribute('data-field');
        const newVal = inputEl.value.trim();
        const oldVal = inputEl.getAttribute('data-old');
        if (!type || !entity || !field || newVal === oldVal) return;
        authFetch(API_BASE + '/reports/overrides', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ report_type: type, entity_key: entity, field, value: newVal })
        }).then(r => r.json()).then(res => {
            if (res.success) { inputEl.setAttribute('data-old', newVal); showToast('已保存','success'); }
            else throw new Error(res.error);
        }).catch(err => { inputEl.value = oldVal||''; showToast('保存失败','danger'); });
    }
}

// ==================== 添加新行 ====================
function addReportRow() {
    const maxId = Math.max(0, ...allReportGameData.map(r => Number(r._id) || 0));
    const newRow = {
        _id: 'new_' + Date.now(),
        name: '',
        status: 'pending',
        statusLabel: '待适配',
        platform: '',
        notes: ''
    };
    allReportGameData.unshift(newRow);
    filteredReportGameData = [...allReportGameData];
    reportCurrentPage = 1;
    renderReportTable();
    showToast('已添加新行，请填写内容', 'info');
}

// ==================== 删除当前行 ====================
function deleteReportRow(rowId) {
    if (!confirm('确定删除这条记录吗？')) return;

    allReportGameData = allReportGameData.filter(r => r._id != rowId);
    filteredReportGameData = filteredReportGameData.filter(r => r._id != rowId);
    renderReportTable();

    // 通知服务器删除
    authFetch(API_BASE + '/reports/delete-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: rowId })
    }).catch(() => {});
    showToast('已删除', 'success');
}

// ==================== 分页控制 ====================
function updateReportPagination() {
    const total = filteredReportGameData.length;
    const infoEl = document.getElementById('report-page-info');
    if (infoEl) {
        infoEl.textContent = (REPORT_PAGE_SIZE === -1 || total <= REPORT_PAGE_SIZE)
            ? `共 ${total} 条`
            : `${(reportCurrentPage-1)*REPORT_PAGE_SIZE+1}-${Math.min(reportCurrentPage*REPORT_PAGE_SIZE,total)} / 共 ${total} 条`;
    }
    const prevBtn = document.getElementById('report-prev-page');
    const nextBtn = document.getElementById('report-next-page');
    if (prevBtn) prevBtn.disabled = reportCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = reportCurrentPage >= Math.ceil(total / REPORT_PAGE_SIZE) || total <= REPORT_PAGE_SIZE;
}
function reportPrevPage() { if (reportCurrentPage > 1) { reportCurrentPage--; renderReportTable(); } }
function reportNextPage() {
    const total = filteredReportGameData.length;
    if (reportCurrentPage < Math.ceil(total / REPORT_PAGE_SIZE)) { reportCurrentPage++; renderReportTable(); }
}

// ==================== Excel 导出 ====================
function exportReport() {
    if (!allReportGameData || allReportGameData.length === 0) {
        showToast('暂无数据可导出', 'warning'); return;
    }
    if (typeof XLSX === 'undefined') { showToast('Excel库未加载', 'danger'); return; }

    const sheetData = allReportGameData.map((g, i) => ({
        '序号': i + 1,
        '游戏名称': g.name || '(未指定)',
        '适配状态': getStatusInfo(g.status).label,
        '平台': g.platform || '',
        '备注': g.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{wch:6}, {wch:28}, {wch:12}, {wch:12}, {wch:50}];
    setSheetHeaderStyle(ws, 5, '#e8f4fd', '#0369a1');

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '游戏适配状态详情');

    const today = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `裸眼3D适配汇报_${today}.xlsx`);
    showToast('导出成功！', 'success');
}

function setSheetHeaderStyle(ws, colCount, bgColor, fontColor) {
    for (let c = 0; c < colCount; c++) {
        const addr = XLSX.utils.encode_cell({r:0, c});
        if (!ws[addr]) continue;
        ws[addr].s = {
            fill: { fgColor: { rgb: bgColor.replace('#','') } },
            font: { bold:true, color: { rgb: fontColor.replace('#','') } },
            alignment: { horizontal:'center', vertical:'center', wrapText:true }
        };
    }
}

// ==================== 工具函数 ====================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
