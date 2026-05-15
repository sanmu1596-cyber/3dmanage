/**
 * 汇报报表模块 — reports.js
 * 只保留「游戏适配状态详情表」，样式和交互完全对齐游戏列表：
 * - 标准工具栏 + 搜索过滤（onkeyup实时）
 * - .data-table 扁平表格
 * - 表头三态排序（asc/desc/default）
 * - 长按拖拽列重排（400ms）
 * - 内联编辑备注（失焦保存）
 * - Excel导出
 */

// ==================== 全局变量 ====================
let reportDataCache = null;
let allReportGameData = [];          // 全量扁平游戏数据
let filteredReportGameData = [];     // 筛选后数据
let reportSearchTerm = '';
let reportCurrentPage = 1;
const REPORT_PAGE_SIZE = 20;         // 每页条数，-1表示全部

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
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> 加载中...</td></tr>';
}

function setReportError(msg) {
    const tbody = document.getElementById('report-games-tbody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(msg)} <a href="#" onclick="loadReportData()" style="margin-left:8px;">重试</a></td></tr>`;
    }
}

// ==================== 数据加载 ====================
function loadReportData() {
    showReportLoading();
    authFetch(API_BASE + '/reports/data')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(result => {
            if (!result.success) throw new Error(result.error || '服务器返回错误');
            reportDataCache = result.data;

            // 将三分类数据扁平化为一维数组
            allReportGameData = flattenGameStatus(result.data.gameStatus);
            filteredReportGameData = [...allReportGameData];

            // 更新时间
            if (result.data.lastUpdated) {
                const el = document.getElementById('reports-updated');
                if (el) el.textContent = '更新于 ' + new Date(result.data.lastUpdated).toLocaleString('zh-CN');
            }

            // 渲染
            renderReportTable();
        })
        .catch(err => {
            console.error('[reports] 加载失败:', err);
            setReportError('加载失败: ' + err.message);

            // 开发模式降级
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                fetch(API_BASE + '/reports/data', { credentials: 'include' })
                    .then(r2 => r2.json())
                    .then(result2 => {
                        if (result2.success) {
                            reportDataCache = result2.data;
                            allReportGameData = flattenGameStatus(result2.data.gameStatus);
                            filteredReportGameData = [...allReportGameData];
                            renderReportTable();
                        }
                    })
                    .catch(() => {});
            }
        });
}

/**
 * 将 gameStatus 的三类（inProgress/hasBugs/completed）扁平化为统一数组
 * 每项: { name, status, statusLabel, platform, notes, quality }
 */
function flattenGameStatus(gameStatus) {
    const gs = gameStatus || {};
    const rows = [];

    (gs.inProgress || []).forEach(g => {
        rows.push({
            name: g.name,
            status: 'inProgress',
            statusLabel: '适配中',
            statusBadge: 'adapting-badge',
            platform: g.platform || '',
            notes: g.notes || ''
        });
    });

    (gs.hasBugs || []).forEach(g => {
        rows.push({
            name: g.name,
            status: 'hasBugs',
            statusLabel: '有BUG',
            statusBadge: 'bug-badge',
            platform: g.platform || '',
            notes: g.bugNotes || ''
        });
    });

    (gs.completed || []).forEach(g => {
        rows.push({
            name: g.name,
            status: 'completed',
            statusLabel: '已完成',
            statusBadge: 'completed-badge',
            platform: g.platform || '',
            notes: g.notes || '',
            quality: g.quality || ''
        });
    });

    return rows;
}

// ==================== 搜索过滤（对齐游戏列表） ====================
function filterReports() {
    reportSearchTerm = (document.getElementById('report-search-input')?.value || '').toLowerCase().trim();

    // 注册搜索关键词用于高亮
    if (typeof setSearchKeyword === 'function') {
        setSearchKeyword('report-games-table', reportSearchTerm);
    }

    filteredReportGameData = allReportGameData.filter(g => {
        if (!reportSearchTerm) return true;
        return (g.name || '').toLowerCase().includes(reportSearchTerm) ||
               (g.statusLabel || '').includes(reportSearchTerm) ||
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

// ==================== 表格渲染（标准data-table格式） ====================
function renderReportTable() {
    const tbody = document.getElementById('report-games-tbody');
    if (!tbody) return;

    // 分页切片
    let dataToShow = filteredReportGameData;
    if (REPORT_PAGE_SIZE !== -1) {
        const start = (reportCurrentPage - 1) * REPORT_PAGE_SIZE;
        dataToShow = filteredReportGameData.slice(start, start + REPORT_PAGE_SIZE);
    }

    // 更新列显隐
    if (typeof updateColumnHeaders === 'function') {
        updateColumnHeaders('report-games-table');
    }

    if (dataToShow.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">
            <div class="empty-icon">🎮</div>
            <div class="empty-text">暂无游戏适配状态数据</div>
            <div class="empty-sub">在配置计划中更新游戏适配状态后，数据将自动汇总到这里</div>
        </td></tr>`;
        updateReportPagination();
        return;
    }

    // 按列配置顺序动态生成行
    tbody.innerHTML = dataToShow.map((g, idx) => {
        const globalIdx = REPORT_PAGE_SIZE === -1 ? idx + 1 : (reportCurrentPage - 1) * REPORT_PAGE_SIZE + idx + 1;
        let html = `<td class="text-center"><strong>${globalIdx}</strong></td>`;

        // 获取列顺序（如果注册成功则用配置顺序，否则默认）
        let colOrder = ['name', 'status', 'platform', 'notes'];
        if (typeof getColumnOrder === 'function') {
            try { colOrder = getColumnOrder('report-games-table'); } catch(e) {}
        }

        colOrder.forEach(field => {
            switch(field) {
                case 'name':
                    html += `<td class="cell-game-name">${highlightReportText(g.name)}</td>`;
                    break;
                case 'status':
                    html += `<td><span class="report-status-badge ${g.statusBadge}">${escapeHtml(g.statusLabel)}</span></td>`;
                    break;
                case 'platform':
                    html += `<td>${escapeHtml(g.platform || '-')}</td>`;
                    break;
                case 'notes':
                    html += `<td class="cell-wrap">
                        <input type="text" class="report-text-edit"
                               data-report-type="game_status" data-entity="${escapeHtml(g.name)}" data-field="notes"
                               value="${escapeHtml(g.notes)}" placeholder="点击编辑备注..."
                               onblur="saveReportOverride(this)"
                               data-old="${escapeHtml(g.notes)}">
                    </td>`;
                    break;
            }
        });

        return `<tr data-id="${escapeHtml(g.name)}">${html}</tr>`;
    }).join('');

    // 后置初始化
    updateReportPagination();
    if (typeof applyCellTooltips === 'function') {
        applyCellTooltips('report-games-table');
    }
    if (typeof initHeaderDrag === 'function') {
        try { initHeaderDrag('report-games-table'); } catch(e) {}
    }
    if (typeof initTableSort === 'function') {
        try { initTableSort('report-games-table'); } catch(e) {}
    }
}

/**
 * 搜索高亮（复用 games 的 highlightSearch 或降级为纯文本）
 */
function highlightReportText(text) {
    if (!text) return '-';
    if (typeof highlightSearch === 'function') {
        return highlightSearch(text, 'report-games-table');
    }
    return escapeHtml(text);
}

// ==================== 分页控制 ====================
function updateReportPagination() {
    const total = filteredReportGameData.length;
    const totalPages = REPORT_PAGE_SIZE === -1 ? 1 : Math.ceil(total / REPORT_PAGE_SIZE);

    // 页码信息
    const infoEl = document.getElementById('report-page-info');
    if (infoEl) {
        if (REPORT_PAGE_SIZE === -1 || total <= REPORT_PAGE_SIZE) {
            infoEl.textContent = `共 ${total} 条`;
        } else {
            const start = (reportCurrentPage - 1) * REPORT_PAGE_SIZE + 1;
            const end = Math.min(reportCurrentPage * REPORT_PAGE_SIZE, total);
            infoEl.textContent = `${start}-${end} / 共 ${total} 条`;
        }
    }

    // 分页按钮
    const prevBtn = document.getElementById('report-prev-page');
    const nextBtn = document.getElementById('report-next-page');
    if (prevBtn) prevBtn.disabled = reportCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = reportCurrentPage >= totalPages;
}

function reportPrevPage() {
    if (reportCurrentPage > 1) {
        reportCurrentPage--;
        renderReportTable();
    }
}

function reportNextPage() {
    const total = filteredReportGameData.length;
    const totalPages = REPORT_PAGE_SIZE === -1 ? 1 : Math.ceil(total / REPORT_PAGE_SIZE);
    if (reportCurrentPage < totalPages) {
        reportCurrentPage++;
        renderReportTable();
    }
}

// ==================== 内联编辑保存 ====================
function saveReportOverride(inputEl) {
    const type = inputEl.getAttribute('data-report-type');
    const entity = inputEl.getAttribute('data-entity');
    const field = inputEl.getAttribute('data-field');
    const newVal = inputEl.value.trim();
    const oldVal = inputEl.getAttribute('data-old');

    if (!type || !entity || !field) return;

    // 值没变跳过
    if (newVal === oldVal) return;

    authFetch(API_BASE + '/reports/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: type, entity_key: entity, field, value: newVal })
    })
    .then(r => r.json())
    .then(result => {
        if (result.success) {
            inputEl.setAttribute('data-old', newVal);
            inputEl.style.borderColor = '#28a745';
            setTimeout(() => { inputEl.style.borderColor = ''; }, 1200);
            // 同步缓存
            const target = allReportGameData.find(g => g.name === entity);
            if (target) target[field] = newVal;
            showToast('已保存', 'success');
        } else {
            throw new Error(result.error || '保存失败');
        }
    })
    .catch(err => {
        console.error('[reports] 保存失败:', err);
        inputEl.value = oldVal || '';
        showToast('保存失败: ' + err.message, 'danger');
    });
}

// ==================== Excel 导出 ====================
function exportReport() {
    if (!allReportGameData || allReportGameData.length === 0) {
        showToast('暂无数据可导出', 'warning'); return;
    }
    if (typeof XLSX === 'undefined') {
        showToast('Excel库未加载', 'danger'); return;
    }

    const sheetData = allReportGameData.map((g, i) => ({
        '序号': i + 1,
        '游戏名称': g.name,
        '适配状态': g.statusLabel,
        '平台': g.platform || '',
        '备注': g.notes
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
