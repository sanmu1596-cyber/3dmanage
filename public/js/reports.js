/**
 * 汇报报表模块 — reports.js（TAPD 风格 Click-to-Edit 版）
 * 交互与游戏列表保持一致：默认展示文本，单击/双击进入编辑
 * - 游戏名称 → 单击下拉选择（从游戏列表提取）
 * - 适配状态 → 单击下拉选择（待适配 / 适配中 / 已适配）
 * - 平台   → 单击下拉选择（Steam / WeGame / 官网）
 * - 备注   → 双击文本输入
 */

// ==================== 全局变量（必须用 var，踩坑 #1） ====================
var reportDataCache = null;
var allReportGameData = [];          // 全量扁平游戏数据
var filteredReportGameData = [];     // 筛选后数据
var reportSearchTerm = '';
var reportCurrentPage = 1;
var reportGameListCache = [];        // 游戏列表缓存（用于下拉选项）
var _reportDragSrcRow = null;        // 行拖拽源行引用
var reportVisibleColumns = { name: true, status: true, platform: true, notes: true, action: true };  // 列显隐配置
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
    // 初始化字段设置面板（工厂组件：自动创建DOM + 注册逻辑 + 插入到toolbar后面）
    if (typeof initReportColumnSettings === 'function') initReportColumnSettings();
    loadReportData();
}

function refreshReports() {
    showReportLoading();
    loadReportData();
}

function showReportLoading() {
    const tbody = document.getElementById('report-games-table');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> 加载中...</td></tr>';
}

function setReportError(msg) {
    const tbody = document.getElementById('report-games-table');
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

    loadGameListForDropdown().catch(() => {});

    dataPromise.then(() => renderReportTable()).catch(err => {
        console.error('[reports] 加载失败:', err);
        allReportGameData = getDefaultReportData();
        filteredReportGameData = [...allReportGameData];
        reportDataCache = null;
        showReportBanner('数据加载异常，当前显示的是示例数据。点击「刷新」重试。');
        renderReportTable();

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
        rows.push({ _id: 'ip_' + i, name: g.name, status: 'inProgress', statusLabel: '适配中', platform: g.platform || '', notes: g.notes || '' });
    });

    (gs.hasBugs || []).forEach((g, i) => {
        rows.push({ _id: 'hb_' + i, name: g.name, status: 'inProgress', statusLabel: '适配中', platform: g.platform || '', notes: (g.bugNotes || '') });
    });

    (gs.completed || []).forEach((g, i) => {
        rows.push({ _id: 'cp_' + i, name: g.name, status: 'completed', statusLabel: '已适配', platform: g.platform || '', notes: g.notes || '' });
    });

    return rows;
}

/** 根据 status 值查找对应的显示信息 */
function getStatusInfo(statusValue) {
    return REPORT_STATUS_OPTIONS.find(s => s.value === statusValue) || REPORT_STATUS_OPTIONS[0];
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

// ==================== 表格渲染（TAPD 风格 Click-to-Edit） ====================
function renderReportTable() {
    const tbody = document.getElementById('report-games-table');
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

    // ★ TAPD风格：默认渲染文本值，通过 onclick/ondblclick 进入编辑
    tbody.innerHTML = dataToShow.map((g, idx) => {
        const globalIdx = REPORT_PAGE_SIZE === -1 ? idx + 1 : (reportCurrentPage - 1) * REPORT_PAGE_SIZE + idx + 1;
        const rowId = g._id || idx;
        const sInfo = getStatusInfo(g.status);

        let html = `<td class="drag-handle" title="拖拽排序">⋮⋮</td>
                       <td class="text-center"><strong>${globalIdx}</strong></td>`;

        // 获取列顺序
        let colOrder = ['name', 'status', 'platform', 'notes'];
        if (typeof getColumnOrder === 'function') {
            try { colOrder = getColumnOrder('report-games-table'); } catch(e) {}
        }

        colOrder.forEach(field => {
            switch(field) {
                case 'name':
                    // 游戏名称 — 单击进入下拉选择
                    html += `<td class="cell-game-name editable-cell" data-row-id="${rowId}" data-field="name"
                                onclick="startReportDropdownEdit(this, '${rowId}', 'name')"
                                title="点击选择游戏">${highlightSearch(g.name || '', 'report-games-table') || '<span class="text-muted">-- 选择 --</span>'}</td>`;
                    break;

                case 'status': {
                    // 适配状态 — 单击进入下拉选择，带颜色编码
                    const displayName = highlightSearch(sInfo.label, 'report-games-table');
                    html += `<td class="editable-cell text-center" data-row-id="${rowId}" data-field="status"
                                onclick="startReportDropdownEdit(this, '${rowId}', 'status')"
                                title="点击选择状态"
                                style="color:${sInfo.color};font-weight:600;">${displayName}</td>`;
                    break;
                }

                case 'platform':
                    // 平台 — 单击进入下拉选择
                    html += `<td class="editable-cell text-center" data-row-id="${rowId}" data-field="platform"
                                onclick="startReportDropdownEdit(this, '${rowId}', 'platform')"
                                title="点击选择平台">${highlightSearch(g.platform || '', 'report-games-table') || '<span class="text-muted">--</span>'}</td>`;
                    break;

                case 'notes':
                    // 备注 — 双击进入文本编辑
                    html += `<td class="cell-wrap editable-cell" data-row-id="${rowId}"
                                ondblclick="startReportNotesEdit(this, '${rowId}')"
                                title="双击编辑备注">${highlightSearch(g.notes || '', 'report-games-table')}</td>`;
                    break;
            }
        });

        return `<tr data-row-id="${rowId}" class="draggable-row" draggable="true">${html}
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
    if (typeof initColumnResize === 'function') try { initColumnResize('report-games-table'); } catch(e) {}
    // 行拖拽排序
    initReportRowDrag();
}

/**
 * 搜索关键词高亮（使用已加载的全局 highlightSearch）
 * 注意：不在此重新定义，直接依赖 core.js 中的实现
 */

// ==================== 行内编辑：下拉选择（游戏名称/状态/平台） ====================
/**
 * TAPD 风格单击下拉编辑 —— 与游戏列表的 startGameDropdownEdit 保持一致
 * @param {HTMLElement} td - 被点击的单元格
 * @param {string} rowId - 行标识
 * @param {string} field - 字段名 (name / status / platform)
 */
function startReportDropdownEdit(td, rowId, field) {
    if (td.classList.contains('editing')) return;
    td.classList.add('editing');

    // 锁定宽高防抖动
    const rect = td.getBoundingClientRect();
    td.style.width = rect.width + 'px';
    td.style.minWidth = rect.width + 'px';
    td.style.maxWidth = rect.width + 'px';
    td.style.height = rect.height + 'px';
    td.style.boxSizing = 'border-box';

    const rowData = allReportGameData.find(r => r._id == rowId);
    const originalHtml = td.innerHTML;
    const currentValue = rowData ? (rowData[field] || '') : '';

    const select = document.createElement('select');
    select.className = 'inline-edit-select';

    // 根据字段类型填充选项
    if (field === 'name') {
        // 游戏名称：从缓存的游戏列表提取
        const gameNames = reportGameListCache.length > 0
            ? reportGameListCache
            : allReportGameData.map(g => g.name).filter(Boolean);
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- 选择游戏 --';
        select.appendChild(emptyOpt);
        gameNames.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n;
            opt.textContent = n;
            if (n === currentValue) opt.selected = true;
            select.appendChild(opt);
        });
    } else if (field === 'status') {
        // 适配状态
        REPORT_STATUS_OPTIONS.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            o.style.color = opt.color;
            if (opt.value === currentValue) o.selected = true;
            select.appendChild(o);
        });
    } else if (field === 'platform') {
        // 平台
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- 选择平台 --';
        select.appendChild(emptyOpt);
        REPORT_PLATFORM_OPTIONS.forEach(p => {
            const o = document.createElement('option');
            o.value = p;
            o.textContent = p;
            if (p.toLowerCase() === String(currentValue).toLowerCase()) o.selected = true;
            select.appendChild(o);
        });
    }

    td.innerHTML = '';
    td.appendChild(select);
    select.focus();

    let saved = false;
    const save = async () => {
        if (saved) return;
        saved = true;
        const newValue = select.value;

        // 无变化直接还原
        if (newValue === currentValue) {
            finishEditing(td, originalHtml);
            return;
        }

        // 更新本地缓存
        if (rowData) {
            if (field === 'name') {
                rowData.name = newValue;
            } else if (field === 'status') {
                rowData.status = newValue;
                const sInfo = getStatusInfo(newValue);
                rowData.statusLabel = sInfo.label;
            } else if (field === 'platform') {
                rowData.platform = newValue;
            }
        }

        // 保存到服务器
        try {
            const payload = Object.assign({}, rowData);
            const response = await authFetch(API_BASE + '/reports/save-row', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.success) {
                if (result.id && rowData) rowData._id = result.id;
                // 更新单元格显示
                refreshReportCell(td, rowId, field);
                showToast('已保存', 'success');
            } else {
                td.innerHTML = originalHtml;
                showToast(result.error || '保存失败', 'warning');
            }
        } catch (e) {
            td.innerHTML = originalHtml;
            showToast('网络异常，保存失败', 'danger');
        }
        td.classList.remove('editing');
        td.style.width = ''; td.style.minWidth = ''; td.style.maxWidth = ''; td.style.height = '';
    };

    select.addEventListener('change', save);
    select.addEventListener('blur', () => {
        if (!saved) { saved = true; finishEditing(td, originalHtml); }
    });
    select.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { saved = true; finishEditing(td, originalHtml); }
    });
}

// ==================== 行内编辑：文本输入（备注） ====================
/**
 * 双击文本编辑 —— 与游戏列表的 startGameTextEdit 保持一致
 * @param {HTMLElement} td - 被双击的单元格
 * @param {string} rowId - 行标识
 */
function startReportNotesEdit(td, rowId) {
    if (td.classList.contains('editing')) return;
    td.classList.add('editing');

    // 锁定宽高防抖动
    const rect = td.getBoundingClientRect();
    td.style.width = rect.width + 'px';
    td.style.minWidth = rect.width + 'px';
    td.style.maxWidth = rect.width + 'px';
    td.style.height = rect.height + 'px';
    td.style.boxSizing = 'border-box';

    const rowData = allReportGameData.find(r => r._id == rowId);
    const originalValue = rowData ? (rowData.notes || '') : '';
    const originalHtml = td.innerHTML;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = originalValue;
    input.placeholder = '填写备注...';

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let saved = false;
    const save = async () => {
        if (saved) return;
        saved = true;
        const newValue = input.value.trim();

        if (newValue === originalValue) {
            finishEditing(td, originalHtml);
            return;
        }

        if (rowData) rowData.notes = newValue;

        try {
            const payload = Object.assign({}, rowData);
            const response = await authFetch(API_BASE + '/reports/save-row', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.success) {
                if (result.id && rowData) rowData._id = result.id;
                td.textContent = newValue || '';
                showToast('已保存', 'success');
            } else {
                td.innerHTML = originalHtml;
                showToast(result.error || '保存失败', 'warning');
            }
        } catch (e) {
            td.innerHTML = originalHtml;
            showToast('网络异常，保存失败', 'danger');
        }
        td.classList.remove('editing');
        td.style.width = ''; td.style.minWidth = ''; td.style.maxWidth = ''; td.style.height = '';
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { saved = true; finishEditing(td, originalHtml); }
    });
}

/** 编辑完成后还原单元格显示态 */
function finishEditing(td, originalHtml) {
    td.classList.remove('editing');
    td.innerHTML = originalHtml;
    td.style.width = ''; td.style.minWidth = ''; td.style.maxWidth = ''; td.style.height = '';
}

/** 刷新单个单元格的显示内容（保存成功后调用） */
function refreshReportCell(td, rowId, field) {
    const rowData = allReportGameData.find(r => r._id == rowId);
    if (!rowData) return;

    td.classList.remove('editing');
    td.style.width = ''; td.style.minWidth = ''; td.style.maxWidth = ''; td.style.height = '';

    if (field === 'name') {
        td.textContent = rowData.name || '';
    } else if (field === 'status') {
        const sInfo = getStatusInfo(rowData.status);
        td.textContent = sInfo.label;
        td.style.color = sInfo.color;
        td.style.fontWeight = '600';
    } else if (field === 'platform') {
        td.textContent = rowData.platform || '';
    }
}

// ==================== 添加新行（先选游戏再保存）====================
/**
 * 新增流程：点击"新增" → 表格顶部插入一行（游戏名列为下拉选择器）
 * 用户从已有游戏列表中选中后 → 自动调 save-row 持久化
 * 按 ESC 或点其他地方可取消
 */
var _pendingAddRowId = null;   // 正在添加的临时行ID
function addReportRow() {
    // 如果已有待完成的添加行，先取消
    if (_pendingAddRowId) {
        cancelPendingAddRow();
    }

    const tbody = document.getElementById('report-games-table');
    if (!tbody) return;

    const tempId = 'pending_' + Date.now();
    _pendingAddRowId = tempId;

    // ★ 关键：从实际DOM读取当前表头顺序（100%匹配显示的列排列）
    // 不依赖 getColumnOrder() 内存值，直接读 <th data-field=""> 的出现顺序
    var colOrder = [];
    try {
        var tableEl = document.getElementById('report-games-table');
        if (tableEl) {
            var thead = tableEl.previousElementSibling;
            if (thead) {
                var headerRow = thead.querySelector('tr');
                if (headerRow) {
                    var thList = headerRow.querySelectorAll('th[data-field]');
                    thList.forEach(function(th) {
                        colOrder.push(th.dataset.field || '');
                    });
                }
            }
        }
    } catch(e) { console.warn('[reports] 读取表头列顺序失败:', e); }

    // 兜底：如果DOM读取失败，用默认顺序
    if (colOrder.length === 0) {
        colOrder = ['name', 'status', 'platform', 'notes'];
    }

    // 按当前列顺序动态构建单元格（避免列拖拽后错位）
    var cellsHtml = '<td class="drag-handle" title="拖拽排序">⋮⋮</td>' +
                    '<td class="text-center"><strong>*</strong></td>';

    colOrder.forEach(function(field) {
        switch(field) {
            case 'name':
                cellsHtml += '<td class="editable-cell" data-field="name">' +
                    '<select id="select-' + tempId + '" class="inline-edit-select new-row-game-select">' +
                        '<option value="">-- 选择游戏 --</option>' +
                    '</select>' +
                '</td>';
                break;
            case 'status':
                cellsHtml += '<td class="editable-cell text-center" style="color:#9ca3af;font-weight:600;">待适配</td>';
                break;
            case 'platform':
                cellsHtml += '<td class="editable-cell text-center"><span class="text-muted">--</span></td>';
                break;
            case 'notes':
                cellsHtml += '<td class="cell-wrap"><span class="text-muted"></span></td>';
                break;
            default:
                cellsHtml += '<td></td>';
        }
    });

    cellsHtml += '<td class="text-center"><button class="report-del-btn" onclick="cancelPendingAddRow()" title="取消新增"><i class="fas fa-times" style="font-size:12px;color:#9ca3af;cursor:pointer;"></i></button></td>';

    // 在表格最前面插入一行
    const tr = document.createElement('tr');
    tr.id = 'row-' + tempId;
    tr.className = 'draggable-row pending-add-row';
    tr.dataset.rowId = tempId;
    tr.innerHTML = cellsHtml;

    // 如果表格为空（显示空状态提示），先清空
    const emptyState = tbody.querySelector('.empty-state');
    if (emptyState) {
        tbody.innerHTML = '';
    }
    tbody.insertBefore(tr, tbody.firstChild);

    const selectEl = document.getElementById('select-' + tempId);

    // 加载游戏列表填充下拉选项
    loadGameListForDropdown().then(gameNames => {
        if (!selectEl) return; // 已被移除（用户取消）
        selectEl.innerHTML = '<option value="">-- 选择游戏 --</option>';
        gameNames.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n;
            opt.textContent = n;
            selectEl.appendChild(opt);
        });
        selectEl.focus();
    }).catch(() => {
        // 加载失败时用本地数据兜底
        const fallbackGames = allReportGameData.map(g => g.name).filter(Boolean);
        const uniqueGames = [...new Set(fallbackGames)].sort();
        selectEl.innerHTML = '<option value="">-- 选择游戏 --</option>';
        uniqueGames.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n;
            opt.textContent = n;
            selectEl.appendChild(opt);
        });
    });

    // 选中游戏后立即保存
    selectEl.addEventListener('change', function() {
        const selectedName = this.value;
        if (!selectedName) return; // 还没选

        // 禁用下拉防止重复操作
        this.disabled = true;

        const newRow = {
            _id: tempId,
            name: selectedName,
            status: 'pending',
            statusLabel: '待适配',
            platform: '',
            notes: ''
        };

        authFetch(API_BASE + '/reports/save-row', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRow)
        })
        .then(r => r.json())
        .then(result => {
            _pendingAddRowId = null;
            if (result.success) {
                if (result.row_id) newRow._id = result.row_id;
                allReportGameData.unshift(newRow);
                filteredReportGameData = [...allReportGameData];
                reportCurrentPage = 1;
                renderReportTable();
                showToast('已添加：' + selectedName, 'success');
            } else {
                showToast(result.error || '添加失败', 'warning');
                renderReportTable(); // 移除临时行
            }
        })
        .catch(err => {
            console.error('[reports] 新增保存失败:', err);
            _pendingAddRowId = null;
            // 降级：前端显示
            allReportGameData.unshift(newRow);
            filteredReportGameData = [...allReportGameData];
            reportCurrentPage = 1;
            renderReportTable();
            showToast('已添加（离线模式）', 'info');
        });
    });

    // ESC 取消
    selectEl.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') cancelPendingAddRow();
    });
}

/** 取消正在进行的添加行 */
function cancelPendingAddRow() {
    if (!_pendingAddRowId) return;
    const tr = document.getElementById('row-' + _pendingAddRowId);
    if (tr) tr.remove();
    _pendingAddRowId = null;
    // 如果表格空了，重新渲染（会显示空状态）
    if (document.getElementById('report-games-table')?.children.length === 0) {
        renderReportTable();
    }
}

// ==================== 删除当前行（持久化到后端）====================
function deleteReportRow(rowId) {
    if (!confirm('确定删除这条记录吗？')) return;

    authFetch(API_BASE + '/reports/delete-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: rowId })
    })
    .then(r => r.json())
    .then(result => {
        if (result.success) {
            allReportGameData = allReportGameData.filter(r => r._id != rowId);
            filteredReportGameData = filteredReportGameData.filter(r => r._id != rowId);
            renderReportTable();
            showToast('已删除', 'success');
        } else {
            showToast(result.error || '删除失败', 'warning');
        }
    })
    .catch(() => {
        // 降级：仅前端删除
        allReportGameData = allReportGameData.filter(r => r._id != rowId);
        filteredReportGameData = filteredReportGameData.filter(r => r._id != rowId);
        renderReportTable();
        showToast('已删除（离线模式）', 'info');
    });
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

/** 旧版兼容接口 */
function saveReportOverride(inputEl) {
    const rowId = inputEl.getAttribute('data-row-id') || inputEl.getAttribute('data-entity');
    if (inputEl.hasAttribute('data-row-id')) {
        // 新版不再使用独立 onchange，此处兼容旧 HTML 残留
        console.warn('[reports] saveReportObsolete 已废弃，请使用新版行内编辑');
    } else {
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

/** 旧版兼容（onReportFieldChange 已移除，保留空壳防报错） */
function onReportFieldChange(el) {
    /* 已废弃：新版使用 startReportDropdownEdit / startReportNotesEdit */
}

// ==================== 报表行拖拽排序 ====================

/**
 * 初始化报表表格行拖拽排序（参照设备列表 initRowDrag）
 */
function initReportRowDrag() {
    var tbody = document.getElementById('report-games-table');
    if (!tbody) return;

    var rows = tbody.querySelectorAll('.draggable-row');
    rows.forEach(function(row) {
        row.addEventListener('dragstart', function(e) {
            _reportDragSrcRow = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.dataset.rowId);
            setTimeout(() => { this.style.opacity = '0.4'; }, 0);
        });
        row.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            this.style.opacity = '';
            _reportDragSrcRow = null;
            removeRowDropIndicator();
            saveReportRowOrder();
        });
        row.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (_reportDragSrcRow && _reportDragSrcRow !== this) {
                var rect = this.getBoundingClientRect();
                var midY = rect.top + rect.height / 2;
                showRowDropIndicator(this, e.clientY < midY ? 'before' : 'after');
            }
        });
        row.addEventListener('dragleave', function() {
            removeRowDropIndicator();
        });
        row.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            removeRowDropIndicator();
            if (_reportDragSrcRow && _reportDragSrcRow !== this) {
                var rect = this.getBoundingClientRect();
                var midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    this.parentNode.insertBefore(_reportDragSrcRow, this);
                } else {
                    this.parentNode.insertBefore(_reportDragSrcRow, this.nextSibling);
                }
            }
        });
    });
}

/**
 * 将当前DOM行顺序保存到后端
 */
function saveReportRowOrder() {
    var tbody = document.getElementById('report-games-table');
    if (!tbody) return;

    var rows = tbody.querySelectorAll('.draggable-row');
    var orders = [];
    rows.forEach(function(row, idx) {
        var rowId = row.dataset.rowId || row.getAttribute('data-row-id');
        if (rowId) {
            orders.push({ row_id: rowId, sort_order: idx + 1 });
        }
    });

    if (orders.length < 2) return; // 无需保存

    authFetch(API_BASE + '/reports/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: orders })
    })
    .then(r => r.json())
    .then(result => {
        if (result.success) {
            // 同步本地数据顺序
            var newOrder = [];
            orders.forEach(function(o) {
                var found = allReportGameData.find(function(r) { return r._id == o.row_id; });
                if (found) newOrder.push(found);
            });
            // 补上未在DOM中的行
            allReportGameData.forEach(function(r) {
                if (!newOrder.find(function(n) { return n._id === r._id; })) newOrder.push(r);
            });
            allReportGameData = newOrder;
            filteredReportGameData = [...allReportGameData];
        }
    })
    .catch(() => {});
}
