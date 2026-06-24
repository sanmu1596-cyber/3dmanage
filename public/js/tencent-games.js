/**
 * 腾讯系游戏开发进展 — tencent-games.js（4分组并排看板版 · 后端持久化）
 * ============================================================
 * 4 大分组横向并排，每组子列不同、行数不齐：
 *   1. 适配进行中   → [游戏名称, 备注]
 *   2. 未来排期     → [游戏名称, 新游(可预约)]
 *   3. 已适配-修复BUG → [游戏名称, 备注]
 *   4. 已适配游戏列表 → [游戏名称A, 游戏名称B]（双子列）
 * 单元格双击编辑；每组行尾"＋"追加一行；列宽/行高 Excel 式拖拽。
 *
 * 数据：后端持久化（/api/tencent-board）。
 * 数据模型（内存）：
 *   txBoard = { groups: [ {id, key, title, cols:[...], rows:[ {id, cells:[c0,c1]} ] } ],
 *               meta: { colWidths:[], rowHeights:{} } }
 * ============================================================
 */

// ===== 全局（必须 var，踩坑#1）=====
var txBoard = null;
var _txLoading = false;

const TX_API = (typeof API_BASE !== 'undefined' ? API_BASE : '/api') + '/tencent-board';
// ★ 当前看板标识（多看板共用同一引擎）：tencent=腾讯系；customer=各客户适配进展
var _txBoardId = 'tencent';
// 给任意看板 API 路径拼上 ?board=<当前看板>，使一套引擎可服务多张看板
function txUrl(path) {
    const base = TX_API + (path || '');
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'board=' + encodeURIComponent(_txBoardId);
}

// ===== Excel 式选区模型 =====
// 选中的单元格集合：每项 { gi, r, ci }（仅含真实存在的格）
var _txSelected = [];           // 当前选中的单元格列表
var _txAnchor = null;           // 选区锚点 { gi, r, ci }（Shift/拖拽起点）
var _txSelecting = false;       // 鼠标拖拽框选中
var _txEditingCell = null;      // 当前正在「格内编辑」的 td（null=无格内编辑，仅选中态）
var _txTextSelecting = false;   // ★ 编辑态：正在编辑器内长按拖选文字（期间禁止 blur 退出/框选接管）
// 单元格唯一 key
function txKey(gi, r, ci) { return gi + ':' + r + ':' + ci; }

// ===== 子 Tab 切换 =====
function switchReportSubTab(subtab) {
    document.querySelectorAll('.report-sub-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.subtab === subtab);
    });
    document.querySelectorAll('.report-sub-panel').forEach(p => { p.style.display = 'none'; });
    if (subtab === 'report-main') {
        const m = document.getElementById('report-sub-main');
        if (m) m.style.display = 'flex';
        return;
    }
    // 腾讯系看板 / 各客户适配进展：共用同一看板引擎，仅切换 _txBoardId + 标题 + 数据
    const isCustomer = (subtab === 'report-customer');
    _txBoardId = isCustomer ? 'customer' : 'tencent';
    const title = document.getElementById('tx-board-title');
    if (title) title.textContent = isCustomer ? '各客户适配进展' : '腾讯系游戏开发进展';
    const t = document.getElementById('report-sub-tencent');
    if (t) t.style.display = 'flex';
    // 切看板前清空当前选区/编辑态，避免跨看板串状态
    _txSelected = []; _txAnchor = null; _txEditingCell = null;
    loadTxBoard();
}

// ===== 种子数据（首次为空时写入后端，按当前看板返回）=====
function getTxSeed() {
    if (_txBoardId === 'customer') return getCustomerSeed();
    return {
        groups: [
            {
                key: '适配进行中', title: '适配进行中',
                cols: ['游戏名称', '备注'],
                rows: [
                    ['逆战：未来', '1、有两个UI界面会闪失-正在优化中，预计本周解决上线；'],
                    ['龙息：神寂', '1、游戏中，2D状态下黑屏，再次交织-3D状态下也黑屏；\n2、游戏交互界面，部分UI消失，部分UI未分离；\n3、目前打开分析，游戏UI分离难度较大，暂时降低优先级，解决其他游戏问题；'],
                    ['矩阵：零日危机', '本周出版本顺利'],
                    ['石器时代：觉醒', '1、更改游戏分辨率，3840*2160改成2560*1440，游戏画面正常切换不卡死；\n2、争取本周解决上线；'],
                    ['《王者荣耀世界》', '分辨率部分UI后，游戏中画面黑屏，仅显示UI，本周完工优化中；'],
                    ['洛克王国：世界', '1、添加UPass，使用release hook打开游戏后，部分界面图标显示不全；']
                ]
            },
            {
                key: '未来排期', title: '未来排期',
                cols: ['游戏名称', '新游（可预约）'],
                rows: [
                    ['穿越火线', '失控进化 - RUST玩法授权'],
                    ['终极角逐\n(THE FINALS)', '异人之下'],
                    ['白荆回廊', '灰境行者'],
                    ['星展共鸣', '彩虹六号：攻势'],
                    ['星际战甲', '王者万象棋'],
                    ['桃源深处有人家', '粒粒的小人国'],
                    ['', '地下城与勇士：卡赞']
                ]
            },
            {
                key: '已适配-修复BUG', title: '已适配-修复BUG',
                cols: ['游戏名称', '备注'],
                rows: [
                    ['全境封锁2', '本周无进展\n1、红魔窗口模式黑屏；（截图文件物以可用，加用户提示）\n2、游戏中的"交互点"，"任务指引点等UI贴屏，影响游戏体验；\n3、"准心"贴屏，影响命中率；\n4、地图，重生界面，UI分离不合理，影响视觉效果；'],
                    ['无畏契约', '研发测试版本-已解决"人物介绍UI"不抖动，但部分UI无畏契约不分离;;']
                ]
            },
            {
                key: '已适配游戏列表', title: '已适配游戏列表',
                cols: ['游戏名称', '游戏名称'],
                rows: [
                    ['流放之路', '天涯明月刀'],
                    ['暗区突围', '流放之路：降临'],
                    ['NBA2KOL2', '卡拉彼丘'],
                    ['逆战', '三角洲行动'],
                    ['元梦之星-山海寻灵（中低档）', '英雄联盟lol']
                ]
            }
        ]
    };
}

// ===== 各客户适配进展 种子（单分组 5 列；累计适配数字标红，备注红字用 HTML）=====
function getCustomerSeed() {
    const RED = (t) => '<span style="color:#e23b3b">' + t + '</span>';
    return {
        groups: [
            {
                key: '各客户适配进展', title: '各客户适配进展',
                cols: ['序号', '项目', '类型', '累计适配', '备注'],
                rows: [
                    ['1', '泰坦-27', '显示器', RED('58'), 'wegame：16款　steam：42款　　' + RED('本周上线3款')],
                    ['2', 'ViewX', '显示器', RED('42'), '国内：wegame：8款　steam：34款\n海外：wegame：6款　steam：34款　　无更新'],
                    ['3', 'ACER-27', '显示器', RED('56'), 'wegame：15款　steam：40款　garena版：1款　　' + RED('本周上线4款')],
                    ['4', 'AOC-27', '显示器', RED('45'), 'wegame：15款　steam：30款　　' + RED('本周上线5款')],
                    ['5', 'Chill-blast-16', '笔记本', RED('35'), '国内：wegame：0款　steam：35款\n海外：wegame：0款　steam：35款　　' + RED('本周上线5款')],
                    ['6', '雷神-27', '显示器', RED('2'), '国内：wegame：1款　steam：1款　　' + RED('本周上线2款')],
                    ['7', 'BOE-GPR-27', '显示器', RED('7'), 'wegame：5款　steam：2款　　无更新'],
                    ['8', '视延-32', '显示器', RED('6'), 'wegame：4款　steam：2款　　无更新'],
                    ['9', 'BOE-18', '笔记本', RED('9'), 'wegame：2款　steam：7款　　无更新'],
                    ['10', '红魔', '笔记本', RED('39'), 'wegame：9款　steam：30款　　无更新']
                ]
            }
        ]
    };
}

// ===== 数据加载（后端） =====
async function loadTxBoard() {
    if (_txLoading) return;
    _txLoading = true;
    const tableEl = document.getElementById('tx-board-table');
    if (tableEl) tableEl.innerHTML = '<tbody><tr><td class="table-loading"><span class="table-loading-spinner"></span>加载中...</td></tr></tbody>';
    try {
        let resp = await authFetch(txUrl(''));
        let data = await resp.json();
        // 空看板 → 推送种子初始化，再重新拉
        if (!data || !Array.isArray(data.groups) || data.groups.length === 0) {
            await authFetch(txUrl('/init-seed'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(getTxSeed())
            });
            resp = await authFetch(txUrl(''));
            data = await resp.json();
        }
        txBoard = normalizeBoard(data);
    } catch (e) {
        console.error('[tx] 后端加载失败', e);
        if (typeof showToast === 'function') showToast('看板加载失败', 'danger');
        txBoard = { groups: [], meta: {} };
    } finally {
        _txLoading = false;
    }
    renderTxBoard();
}

// 后端返回结构 → 内存结构（rows 统一为 {id, cells}）
function normalizeBoard(data) {
    const meta = data.meta || {};
    const groups = (data.groups || []).map(g => ({
        id: g.id,
        key: g.key || g.title,
        title: g.title || '',
        cols: Array.isArray(g.cols) ? g.cols : [],
        rows: (g.rows || []).map(r => ({
            id: r.id,
            cells: Array.isArray(r.cells) ? r.cells : [],
            fills: Array.isArray(r.fills) ? r.fills : [],
            aligns: Array.isArray(r.aligns) ? r.aligns : [],
            valigns: Array.isArray(r.valigns) ? r.valigns : []
        }))
    }));
    return { groups, meta: { colWidths: meta.colWidths || null, rowHeights: meta.rowHeights || {} } };
}

// CSS class 安全化
function txCls(s) { return String(s || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]/g, ''); }

// 判断一个 cell 值是否已是 HTML（含标签）。新数据走富文本存 HTML，旧数据是纯文本。
function txIsHtml(s) { return /<[a-z!/][^>]*>/i.test(String(s || '')); }

// 单元格展示：HTML 内容直接渲染；纯文本转义 + 换行
function txCellDisplay(val) {
    const s = String(val || '');
    if (txIsHtml(s)) return s;                       // 富文本：原样渲染
    return escapeHtml(s).replace(/\n/g, '<br>');     // 纯文本：转义
}

// 备注内"本周进展/本周无进展"高亮（仅对纯文本生效；富文本由用户自定义颜色）
function txHighlight(text) {
    const s = String(text || '');
    if (txIsHtml(s)) return s;                        // 富文本不再二次高亮
    let html = escapeHtml(s);
    html = html.replace(/本周无进展/g, '<span class="tx-hl-red">本周无进展</span>');
    html = html.replace(/(^|<br>|\n)(本周进展)/g, '$1<span class="tx-hl-green">本周进展</span>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

// 叶子列总数
function txLeafCount() { return txBoard.groups.reduce((n, g) => n + g.cols.length, 0); }

// ===== 列宽/行高（来自 txBoard.meta，保存走后端 /meta）=====
function txGetColWidths() { return (txBoard && txBoard.meta && txBoard.meta.colWidths) || null; }
function txGetRowHeights() { return (txBoard && txBoard.meta && txBoard.meta.rowHeights) || {}; }
async function txSaveMeta() {
    if (!txBoard) return;
    try {
        await authFetch(txUrl('/meta'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ colWidths: txBoard.meta.colWidths || null, rowHeights: txBoard.meta.rowHeights || {} })
        });
    } catch (e) { console.error('[tx] 保存配置失败', e); }
}

// ===== 渲染整张看板 =====
function renderTxBoard() {
    const table = document.getElementById('tx-board-table');
    if (!table || !txBoard) return;
    const groups = txBoard.groups;
    if (!groups.length) {
        table.innerHTML = '<tbody><tr><td class="empty-state"><div class="empty-icon">🐧</div><div class="empty-text">暂无数据</div></td></tr></tbody>';
        return;
    }
    const maxRows = Math.max.apply(null, groups.map(g => g.rows.length));
    const savedW = txGetColWidths();
    const savedH = txGetRowHeights();

    // —— colgroup —— 
    let colgroup = '<colgroup>';
    let leafIdx = 0;
    let totalW = 0;
    groups.forEach(g => {
        g.cols.forEach(col => {
            let w = (savedW && savedW[leafIdx]) ? savedW[leafIdx]
                : (col.indexOf('备注') >= 0 ? 360 : 150);
            colgroup += `<col style="width:${w}px">`;
            totalW += w;
            leafIdx++;
        });
    });
    colgroup += '</colgroup>';

    // —— 表头（两行）——
    let thead = '<thead>';
    thead += '<tr>';
    groups.forEach((g, gi) => {
        thead += `<th class="tx-grp-h tx-grp-${txCls(g.key)}" colspan="${g.cols.length}" data-g="${gi}" ondblclick="startTxGroupTitleEdit(this)">${escapeHtml(g.title)}</th>`;
    });
    thead += '</tr>';
    thead += '<tr>';
    leafIdx = 0;
    groups.forEach((g, gi) => {
        g.cols.forEach((col, ci) => {
            thead += `<th class="tx-sub-h s-${txCls(g.key)}" data-g="${gi}" data-c="${ci}" data-leaf="${leafIdx}" ondblclick="startTxColNameEdit(this)">`
                + `<span class="tx-colname">${escapeHtml(col)}</span>`
                + `<span class="tx-col-resize" onmousedown="startTxColResize(event, ${leafIdx})"></span>`
                + `</th>`;
            leafIdx++;
        });
    });
    thead += '</tr>';
    thead += '</thead>';

    // —— 表体 —— 
    let tbody = '<tbody>';
    for (let r = 0; r < maxRows; r++) {
        const rh = savedH[r] ? ` style="height:${savedH[r]}px"` : '';
        tbody += `<tr data-row="${r}"${rh}>`;
        groups.forEach((g, gi) => {
            const row = g.rows[r];
            const rowHandleBase = (gi === 0)
                ? `<span class="tx-row-resize" onmousedown="startTxRowResize(event, ${r})"></span>` : '';
            g.cols.forEach((col, ci) => {
                const rowHandle = (gi === 0 && ci === 0) ? rowHandleBase : '';
                if (!row) {
                    // ★ 空白格（该分组此行无数据）：选中/双击编辑时自动为该分组补足空行
                    tbody += `<td class="tx-editable tx-c-empty" data-g="${gi}" data-r="${r}" data-c="${ci}">${rowHandle}</td>`;
                    return;
                }
                const val = (row.cells && row.cells[ci]) || '';
                const fill = (row.fills && row.fills[ci]) || '';
                const halign = (row.aligns && row.aligns[ci]) || '';
                const valign = (row.valigns && row.valigns[ci]) || '';
                const isNote = col.indexOf('备注') >= 0;
                const cls = isNote ? 'tx-c-note' : (ci === 0 ? 'tx-c-name' : 'tx-c-plain');
                const display = isNote ? txHighlight(val) : (txCellDisplay(val) || '<span style="color:#c0c4cc">—</span>');
                let st = '';
                if (fill) st += `background:${escapeHtml(fill)};`;
                if (halign) st += `text-align:${halign};`;
                if (valign) st += `vertical-align:${valign};`;
                const styleAttr = st ? ` style="${st}"` : '';
                // data-halign/data-valign 让 CSS 把对齐级联到块级子元素(ol/ul) → 列表也能真正对齐
                const alignAttr = (halign ? ` data-halign="${halign}"` : '') + (valign ? ` data-valign="${valign}"` : '');
                tbody += `<td class="tx-editable ${cls}" data-g="${gi}" data-r="${r}" data-c="${ci}"${styleAttr}${alignAttr}>${display}${rowHandle}</td>`;
            });
        });
        tbody += '</tr>';
    }
    // 追加行按钮行
    tbody += '<tr class="tx-add-row">';
    groups.forEach((g, gi) => {
        tbody += `<td colspan="${g.cols.length}"><button class="tx-add-btn" onclick="addTxRow(${gi})">＋ 追加一行</button></td>`;
    });
    tbody += '</tr>';
    tbody += '</tbody>';

    table.style.tableLayout = 'fixed';
    table.style.width = totalW + 'px';
    table.style.minWidth = totalW + 'px';
    table.innerHTML = colgroup + thead + tbody;

    // 绑定选区交互（一次性，事件委托在 table 上）
    txBindSelectionOnce(table);
    // 重渲染后恢复选区高亮 + 工具栏状态
    txRefreshSelectionUI();
}

// ============================================================
// Excel 式单元格选区交互（单击选中 / 拖拽框选 / Shift 连选 / 双击编辑）
// ============================================================
var _txSelBound = false;
function txBindSelectionOnce(table) {
    if (_txSelBound) return;
    _txSelBound = true;
    const container = table; // 委托在 table（每次 render 复用同一 table 节点）

    // mousedown：开始选择（区分 resize 手柄、表头、追加行按钮）
    container.addEventListener('mousedown', (e) => {
        // ★ 在富文本编辑器内按下 → 这是要「拖选文字」，标记之，且绝不进入框选/退出编辑
        if (e.target.closest('.tx-cell-rich')) {
            _txTextSelecting = true;
            _txSelecting = false; // 确保不触发单元格框选
            return;
        }
        if (e.target.closest('.tx-col-resize, .tx-row-resize, .tx-add-btn, thead')) return;
        const td = e.target.closest('td.tx-editable');
        if (!td) return;
        // 正在格内编辑时，点其它格先结束编辑
        if (_txEditingCell && _txEditingCell !== td) txFinishCellEdit(true);
        if (_txEditingCell === td) return; // 正在编辑当前格，交给 contenteditable

        const cell = { gi: +td.dataset.g, r: +td.dataset.r, ci: +td.dataset.c };
        if (e.shiftKey && _txAnchor) {
            txSelectRange(_txAnchor, cell);
        } else if (e.ctrlKey || e.metaKey) {
            txToggleCell(cell);
            _txAnchor = cell;
        } else {
            _txAnchor = cell;
            txSetSelection([cell]);
            _txSelecting = true; // 允许拖拽框选
        }
        txRefreshFormatBarForSelection();
    });

    // mousemove：拖拽框选
    container.addEventListener('mousemove', (e) => {
        if (_txTextSelecting) return; // ★ 编辑态拖选文字中，不接管为单元格框选
        if (!_txSelecting || !_txAnchor) return;
        const td = e.target.closest('td.tx-editable');
        if (!td) return;
        const cell = { gi: +td.dataset.g, r: +td.dataset.r, ci: +td.dataset.c };
        txSelectRange(_txAnchor, cell);
    });

    // 双击：进入格内编辑
    container.addEventListener('dblclick', (e) => {
        const td = e.target.closest('td.tx-editable');
        if (!td || e.target.closest('thead, .tx-col-resize, .tx-row-resize')) return;
        txEnterCellEdit(td);
    });
}

// 全局 mouseup 结束拖拽框选 / 文字拖选
document.addEventListener('mouseup', () => {
    _txSelecting = false;
    // 文字拖选结束：延迟清标志，确保紧随其后的 blur 判断仍能看到「刚才在拖选」
    if (_txTextSelecting) setTimeout(() => { _txTextSelecting = false; }, 0);
});

// 点击看板与工具栏之外 → 清空选区（结束批量模式）
document.addEventListener('mousedown', (e) => {
    if (!txBoard) return;
    if (e.target.closest('#tx-board-table, #tx-format-bar, .tx-board-container')) return;
    // 不在腾讯系看板子面板时不处理
    const panel = document.getElementById('report-sub-tencent');
    if (!panel || panel.style.display === 'none') return;
    if (_txSelected.length) {
        _txSelected = [];
        _txAnchor = null;
        txRefreshSelectionUI();
        txRefreshFormatBarForSelection();
    }
}, true);

// 设定选区
function txSetSelection(cells) {
    _txSelected = cells.slice();
    txRefreshSelectionUI();
}
// 切换单个格
function txToggleCell(cell) {
    const k = txKey(cell.gi, cell.r, cell.ci);
    const idx = _txSelected.findIndex(c => txKey(c.gi, c.r, c.ci) === k);
    if (idx >= 0) _txSelected.splice(idx, 1);
    else _txSelected.push(cell);
    txRefreshSelectionUI();
}
// 矩形范围选择（anchor → focus），按可视行列矩形选中（跨分组按 leaf 列号）
function txSelectRange(anchor, focus) {
    // 用「可视列序号(leaf)」+「行号」做矩形
    const aLeaf = txLeafIndex(anchor.gi, anchor.ci);
    const fLeaf = txLeafIndex(focus.gi, focus.ci);
    const c0 = Math.min(aLeaf, fLeaf), c1 = Math.max(aLeaf, fLeaf);
    const r0 = Math.min(anchor.r, focus.r), r1 = Math.max(anchor.r, focus.r);
    const cells = [];
    for (let r = r0; r <= r1; r++) {
        for (let leaf = c0; leaf <= c1; leaf++) {
            const pos = txLeafToCell(leaf);
            if (pos) cells.push({ gi: pos.gi, r: r, ci: pos.ci });
        }
    }
    txSetSelection(cells);
}
// gi,ci → 全局 leaf 列号
function txLeafIndex(gi, ci) {
    let leaf = 0;
    for (let g = 0; g < gi; g++) leaf += txBoard.groups[g].cols.length;
    return leaf + ci;
}
// 全局 leaf 列号 → {gi, ci}
function txLeafToCell(leaf) {
    let acc = 0;
    for (let g = 0; g < txBoard.groups.length; g++) {
        const n = txBoard.groups[g].cols.length;
        if (leaf < acc + n) return { gi: g, ci: leaf - acc };
        acc += n;
    }
    return null;
}

// 刷新选区高亮（给选中的 td 加 .tx-selected）
function txRefreshSelectionUI() {
    const table = document.getElementById('tx-board-table');
    if (!table) return;
    table.querySelectorAll('td.tx-selected').forEach(td => td.classList.remove('tx-selected', 'tx-sel-anchor'));
    _txSelected.forEach(c => {
        const td = table.querySelector(`td.tx-editable[data-g="${c.gi}"][data-r="${c.r}"][data-c="${c.ci}"]`);
        if (td) td.classList.add('tx-selected');
    });
    if (_txAnchor) {
        const a = table.querySelector(`td.tx-editable[data-g="${_txAnchor.gi}"][data-r="${_txAnchor.r}"][data-c="${_txAnchor.ci}"]`);
        if (a) a.classList.add('tx-sel-anchor');
    }
}

// ===== 列宽拖拽（Excel 式：只改当前列，总宽同步）=====
function startTxColResize(e, leafIdx) {
    e.preventDefault();
    e.stopPropagation();
    const table = document.getElementById('tx-board-table');
    const cols = table.querySelectorAll('colgroup col');
    const col = cols[leafIdx];
    if (!col) return;
    const startX = e.pageX;
    const startW = parseInt(col.style.width) || 150;
    const startTableW = table.offsetWidth;
    document.body.classList.add('col-resizing');

    const onMove = (ev) => {
        const delta = ev.pageX - startX;
        const w = Math.max(60, startW + delta);
        const realDelta = w - startW;
        col.style.width = w + 'px';
        table.style.width = (startTableW + realDelta) + 'px';
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('col-resizing');
        const widths = Array.from(cols).map(c => parseInt(c.style.width) || 150);
        txBoard.meta.colWidths = widths;
        txSaveMeta();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ===== 行高拖拽 =====
function startTxRowResize(e, rowIdx) {
    e.preventDefault();
    e.stopPropagation();
    const table = document.getElementById('tx-board-table');
    const tr = table.querySelector(`tbody tr[data-row="${rowIdx}"]`);
    if (!tr) return;
    const startY = e.pageY;
    const startH = tr.offsetHeight;
    document.body.classList.add('row-resizing');

    const onMove = (ev) => {
        const h = Math.max(32, startH + (ev.pageY - startY));
        tr.style.height = h + 'px';
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('row-resizing');
        txBoard.meta.rowHeights[rowIdx] = tr.offsetHeight;
        txSaveMeta();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ===== 列名双击编辑（→ PATCH /group 改 cols）=====
function startTxColNameEdit(th) {
    if (th.classList.contains('editing')) return;
    const gi = +th.dataset.g, ci = +th.dataset.c;
    const group = txBoard.groups[gi];
    if (!group) return;
    th.classList.add('editing');
    const cur = group.cols[ci] || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tx-colname-input';
    input.value = cur;
    th.innerHTML = '';
    th.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const finish = async (save) => {
        if (done) return; done = true;
        if (save && input.value.trim() && input.value.trim() !== cur) {
            group.cols[ci] = input.value.trim();
            await txApiPatchGroup(group.id, { cols: group.cols });
            if (typeof showToast === 'function') showToast('列名已更新', 'success');
        }
        th.classList.remove('editing');
        renderTxBoard();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
        else if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    });
}

// ===== 分组名双击编辑（→ PATCH /group 改 title）=====
function startTxGroupTitleEdit(th) {
    if (th.classList.contains('editing')) return;
    const gi = +th.dataset.g;
    const group = txBoard.groups[gi];
    if (!group) return;
    th.classList.add('editing');
    const cur = group.title || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tx-colname-input';
    input.style.textAlign = 'center';
    input.value = cur;
    th.innerHTML = '';
    th.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const finish = async (save) => {
        if (done) return; done = true;
        if (save && input.value.trim() && input.value.trim() !== cur) {
            group.title = input.value.trim();
            await txApiPatchGroup(group.id, { title: group.title });
            if (typeof showToast === 'function') showToast('分组名已更新', 'success');
        }
        th.classList.remove('editing');
        renderTxBoard();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
        else if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    });
}

// ============================================================
// 富文本格式工具栏（作用于当前正在编辑的单元格 contenteditable）
// ============================================================
var _txFmtEd = null;        // 当前绑定的编辑器
var _txFmtCtx = null;       // {td, rowObj, ci}
var _txFmtInteracting = false; // 工具栏交互中（防 blur 误保存）
var _txFmtBound = false;    // 工具栏事件是否已绑定
var _txSavedRange = null;   // ★ 保存编辑器内的选区（点工具栏时编辑器会失焦，需先存后恢复）

// 保存当前选区（仅当选区在编辑器内时）
function txSaveSelection() {
    if (!_txFmtEd) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        // 选区必须落在当前编辑器内
        if (_txFmtEd.contains(range.commonAncestorContainer)) {
            _txSavedRange = range.cloneRange();
        }
    }
}

// 恢复之前保存的选区
function txRestoreSelection() {
    if (!_txFmtEd) return false;
    _txFmtEd.focus();
    if (_txSavedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(_txSavedRange);
        return true;
    }
    return false;
}

// 激活工具栏并绑定到某个编辑器
function txActivateFormatBar(ed, td, rowObj, ci) {
    const bar = document.getElementById('tx-format-bar');
    if (!bar) return;
    _txFmtEd = ed;
    _txFmtCtx = { td, rowObj, ci };
    bar.classList.add('active');
    if (!_txFmtBound) { txBindFormatBar(bar); _txFmtBound = true; }
}

// 取消激活
function txDeactivateFormatBar() {
    const bar = document.getElementById('tx-format-bar');
    if (bar) bar.classList.remove('active');
    if (typeof txCloseMenus === 'function') txCloseMenus();
    _txFmtEd = null;
    _txFmtCtx = null;
}

// 仅根据「是否有选区」决定工具栏点亮（选中即可批量设格式，无需进编辑）
function txRefreshFormatBarForSelection() {
    const bar = document.getElementById('tx-format-bar');
    if (!bar) return;
    // 绑定一次
    if (!_txFmtBound) { txBindFormatBar(bar); _txFmtBound = true; }
    bar.classList.toggle('active', _txSelected.length > 0 || !!_txEditingCell);
}

// 常用颜色板
var TX_PALETTE = [
    '#1f2329', '#5e6470', '#8a909c', '#bcc0c7', '#dfe2e6', '#ffffff',
    '#e23b3b', '#fa8c16', '#faad14', '#52c41a', '#1677ff', '#722ed1',
    '#ff7875', '#ffc069', '#fff3a8', '#b7eb8f', '#91caff', '#d3adf7',
    '#cf1322', '#d46b08', '#d48806', '#389e0d', '#0958d9', '#531dab'
];

// 绑定工具栏一次（事件委托）
function txBindFormatBar(bar) {
    // 渲染颜色色板
    txRenderSwatches('tx-fmt-fore-swatches', (color) => {
        txApplyFormat('foreColor', color);
        const ico = document.getElementById('tx-fmt-fore-ico');
        if (ico) ico.style.borderBottom = '3px solid ' + color;
        txCloseMenus();
    });
    txRenderSwatches('tx-fmt-fill-swatches', (color) => { txApplyFormat('fill', color); txCloseMenus(); });

    // ★ mousedown 先保存选区（此刻编辑器尚未失焦），再阻止默认避免失焦
    bar.addEventListener('mousedown', (e) => {
        txSaveSelection();
        // input[type=color] / 自定义需要正常交互，其余阻止失焦
        if (!e.target.closest('input[type="color"]')) e.preventDefault();
        _txFmtInteracting = true;
    });
    // ★ 编辑器内选区实时变化时保存（鼠标选词、键盘 Shift 选择）
    document.addEventListener('selectionchange', () => {
        if (_txFmtEd && document.activeElement === _txFmtEd) txSaveSelection();
    });
    document.addEventListener('mouseup', () => {
        setTimeout(() => { _txFmtInteracting = false; }, 0);
    });

    // 直接命令按钮（B/I/U/S、撤销重做、清除格式、列表）
    bar.querySelectorAll('.tx-fmt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            txApplyFormat(cmd, null);
            txSyncFmtState();
        });
    });

    // 下拉触发器（mousedown 开/关；★必须 preventDefault 避免编辑器失焦被销毁）
    bar.querySelectorAll('.tx-fmt-menu').forEach(menu => {
        const trigger = menu.querySelector('.tx-fmt-trigger, .tx-fmt-split');
        if (trigger) {
            trigger.addEventListener('mousedown', (e) => {
                // ★ 关键：不能让编辑器失焦（失焦会触发 finish→renderTxBoard 销毁工具栏）
                e.preventDefault();
                _txFmtInteracting = true;
                txSaveSelection();
                const wasOpen = menu.classList.contains('open');
                txCloseMenus();
                if (!wasOpen) {
                    menu.classList.add('open');
                    // ★ 浮层用 position:fixed，按触发器位置定位（脱离表头/overflow 裁剪，永不被遮挡）
                    txPositionPop(trigger, menu.querySelector('.tx-fmt-pop'));
                }
                e.stopPropagation(); // 防止冒泡到 document 的关闭监听
            });
        }
    });

    // 下拉项点击（统一走 txApplyFormat：编辑态作用选中文字，选区态批量改格）
    bar.querySelectorAll('.tx-fmt-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.preventDefault();
            if (opt.classList.contains('tx-fmt-clearfill')) { txApplyFormat('fill', ''); txCloseMenus(); return; }
            const cmd = opt.dataset.cmd;
            const val = opt.dataset.val;
            if (cmd === 'fontName') {
                txApplyFormat('fontName', val);
                const lbl = document.getElementById('tx-fmt-font-label');
                if (lbl) lbl.textContent = opt.textContent.trim();
            } else if (cmd === 'fontSize') {
                txApplyFormat('fontSize', val);
                const lbl = document.getElementById('tx-fmt-size-label');
                if (lbl) lbl.textContent = opt.dataset.label || opt.textContent.trim();
            } else if (cmd === 'lineHeight') {
                txApplyFormat('lineHeight', val);
            } else if (cmd) {
                txApplyFormat(cmd, null);
            }
            txCloseMenus();
        });
    });

    // 文字颜色自定义
    const fore = document.getElementById('tx-fmt-fore');
    if (fore) fore.addEventListener('input', () => {
        txApplyFormat('foreColor', fore.value);
        const ico = document.getElementById('tx-fmt-fore-ico');
        if (ico) ico.style.borderBottom = '3px solid ' + fore.value;
    });

    // 单元格填充自定义
    const fill = document.getElementById('tx-fmt-fill');
    if (fill) fill.addEventListener('input', () => txApplyFormat('fill', fill.value));

    // 点工具栏外部关闭所有下拉（用 mousedown，与触发器同一阶段，避免 click 时序把刚开的菜单关掉）
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#tx-format-bar')) txCloseMenus();
    });
    // ★ 浮层是 position:fixed 不随滚动跟随触发器，滚动看板时直接关闭，避免"飘"在错误位置
    const boardContainer = document.querySelector('.tx-board-container');
    if (boardContainer) boardContainer.addEventListener('scroll', txCloseMenus, { passive: true });
    window.addEventListener('resize', txCloseMenus);
}

// 渲染色板
function txRenderSwatches(containerId, onPick) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    TX_PALETTE.forEach(c => {
        const sw = document.createElement('div');
        sw.className = 'tx-fmt-swatch';
        sw.style.background = c;
        sw.title = c;
        sw.addEventListener('click', (e) => { e.preventDefault(); onPick(c); });
        box.appendChild(sw);
    });
}

// 关闭所有下拉
function txCloseMenus() {
    document.querySelectorAll('#tx-format-bar .tx-fmt-menu.open').forEach(m => m.classList.remove('open'));
}

// 把 position:fixed 的下拉浮层定位到触发器正下方（脱离表头与 overflow 裁剪）
function txPositionPop(trigger, pop) {
    if (!trigger || !pop) return;
    const r = trigger.getBoundingClientRect();
    // 先显示出来才能量到尺寸（菜单已 add open → display:block）
    let left = r.left;
    let top = r.bottom + 4;
    // 量宽高做边界修正
    const pw = pop.offsetWidth || 160;
    const ph = pop.offsetHeight || 200;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);   // 右越界 → 左移
    if (top + ph > vh - 8) {                                    // 下越界 → 翻到触发器上方
        const up = r.top - 4 - ph;
        top = up > 8 ? up : Math.max(8, vh - ph - 8);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
}

var TX_SIZE_PX = { '1': '10px', '2': '13px', '3': '14px', '4': '16px', '5': '20px', '6': '24px', '7': '32px' };
// 对齐命令 → CSS 值映射（批量模式作用于 td；编辑态走 execCommand）
var TX_ALIGN_MAP = { justifyLeft: 'left', justifyCenter: 'center', justifyRight: 'right' };
var TX_VALIGN_MAP = { alignTop: 'top', alignMiddle: 'middle', alignBottom: 'bottom' };

// ============================================================
// ★★★ 统一格式入口：两种模式 ★★★
//   A) 正在格内编辑（_txEditingCell 有值）→ 作用于选中文字（execCommand）
//   B) 仅选中态（_txSelected 有格，无编辑）→ 对所有选中格的整格内容批量套格式
// ============================================================
function txApplyFormat(type, value) {
    // ★ 对齐是「单元格级」属性，无论编辑态/选中态都作用于 td（不嵌套 div、不动文字）
    if (TX_ALIGN_MAP[type] || TX_VALIGN_MAP[type]) {
        if (_txEditingCell && _txFmtCtx) {
            txApplyAlignInEditor(type);          // 编辑态：改当前格 td，不打断编辑
        } else if (_txSelected.length > 0) {
            txApplyFormatToSelection(type, value); // 选中态：批量改 td
        }
        return;
    }
    if (_txEditingCell && _txFmtEd) {
        // —— 模式A：格内编辑，作用于选中文字 ——
        txApplyFormatInEditor(type, value);
    } else if (_txSelected.length > 0) {
        // —— 模式B：批量对选中格 ——
        txApplyFormatToSelection(type, value);
    }
}

// 编辑态对齐：直接改当前编辑格 td 的 text-align/vertical-align + 存回 + 持久化（不重渲染，保持编辑不中断）
function txApplyAlignInEditor(type) {
    const ctx = _txFmtCtx;
    if (!ctx || !ctx.rowObj || !_txEditingCell) return;
    const isV = !!TX_VALIGN_MAP[type];
    const key = isV ? 'valigns' : 'aligns';
    const alignVal = isV ? TX_VALIGN_MAP[type] : TX_ALIGN_MAP[type];
    ctx.rowObj[key] = ctx.rowObj[key] || [];
    while (ctx.rowObj[key].length <= ctx.ci) ctx.rowObj[key].push('');
    const nextVal = (ctx.rowObj[key][ctx.ci] === alignVal) ? '' : alignVal; // 再点取消
    ctx.rowObj[key][ctx.ci] = nextVal;
    // 直接改正在编辑的 td 样式 + data 属性（不重渲染；data-* 让对齐级联到块级列表子元素）
    const td = ctx.td || _txEditingCell;
    if (td) {
        if (isV) {
            td.style.verticalAlign = nextVal || '';
            if (nextVal) td.setAttribute('data-valign', nextVal); else td.removeAttribute('data-valign');
        } else {
            td.style.textAlign = nextVal || '';
            if (nextVal) td.setAttribute('data-halign', nextVal); else td.removeAttribute('data-halign');
        }
    }
    txApiPatchAlign(ctx.rowObj.id, ctx.ci, isV ? 'v' : 'h', nextVal);
}

// 模式A：在 contenteditable 内对选中文字执行
function txApplyFormatInEditor(type, value) {
    if (!_txFmtEd) return;
    txRestoreSelection();
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
    switch (type) {
        case 'bold': case 'italic': case 'underline': case 'strikeThrough':
        case 'undo': case 'redo':
            document.execCommand(type, false, null); break;
        case 'removeFormat':
            document.execCommand('removeFormat', false, null);
            document.execCommand('unlink', false, null);
            _txFmtEd.style.lineHeight = '';
            break;
        case 'fontName': document.execCommand('fontName', false, value); break;
        case 'foreColor': document.execCommand('foreColor', false, value); break;
        case 'fontSize': {
            const px = TX_SIZE_PX[value] || '14px';
            document.execCommand('fontSize', false, '7');
            _txFmtEd.querySelectorAll('font[size], [style*="xxx-large"]').forEach(el => {
                el.removeAttribute('size'); el.style.fontSize = px;
            });
            break;
        }
        case 'lineHeight': _txFmtEd.style.lineHeight = value; break;
        case 'justifyLeft': case 'justifyCenter': case 'justifyRight':
            document.execCommand(type, false, null); break;
        case 'fill':
            _txFmtEd.style.background = value || '';
            if (_txFmtCtx) {
                _txFmtCtx.rowObj.fills = _txFmtCtx.rowObj.fills || [];
                _txFmtCtx.rowObj.fills[_txFmtCtx.ci] = value || '';
                txApiPatchFill(_txFmtCtx.rowObj.id, _txFmtCtx.ci, value || '');
            }
            const ico1 = document.getElementById('tx-fmt-fill-ico');
            if (ico1) ico1.style.background = value || '#fff3a8';
            break;
    }
    txSaveSelection();
}

// 模式B：对所有选中格的整格内容批量套用格式（包整段，存回 cells）
async function txApplyFormatToSelection(type, value) {
    const cells = _txSelected.slice();
    if (!cells.length) return;
    for (const c of cells) {
        const group = txBoard.groups[c.gi];
        if (!group) continue;
        // 填充色不改文字，单独处理
        if (type === 'fill') {
            if (!group.rows[c.r]) { await txEnsureRowsUpTo(group, c.r); }
            const rowObj = group.rows[c.r];
            if (!rowObj) continue;
            rowObj.fills = rowObj.fills || [];
            rowObj.fills[c.ci] = value || '';
            await txApiPatchFill(rowObj.id, c.ci, value || '');
            continue;
        }
        // ★ 水平/垂直对齐：作用于单元格(td)本身，互斥切换 + 持久化（不嵌套 div）
        if (TX_ALIGN_MAP[type] || TX_VALIGN_MAP[type]) {
            if (!group.rows[c.r]) { await txEnsureRowsUpTo(group, c.r); }
            const rowObj = group.rows[c.r];
            if (!rowObj) continue;
            const isV = !!TX_VALIGN_MAP[type];
            const key = isV ? 'valigns' : 'aligns';
            const alignVal = isV ? TX_VALIGN_MAP[type] : TX_ALIGN_MAP[type];
            rowObj[key] = rowObj[key] || [];
            while (rowObj[key].length <= c.ci) rowObj[key].push('');
            // 再点同一对齐 → 取消
            const nextVal = (rowObj[key][c.ci] === alignVal) ? '' : alignVal;
            rowObj[key][c.ci] = nextVal;
            await txApiPatchAlign(rowObj.id, c.ci, isV ? 'v' : 'h', nextVal);
            continue;
        }
        const rowObj = group.rows[c.r];
        if (!rowObj) continue; // 空白格不套文字格式（无内容）
        const cur = (rowObj.cells && rowObj.cells[c.ci]) || '';
        if (!cur && type !== 'lineHeight') continue; // 空内容跳过（行距除外）
        const next = txWrapWholeCell(cur, type, value);
        if (next !== cur) {
            while (rowObj.cells.length <= c.ci) rowObj.cells.push('');
            rowObj.cells[c.ci] = next;
            await txApiPatchCell(rowObj.id, c.ci, next);
        }
    }
    renderTxBoard();
    if (typeof showToast === 'function') showToast('已应用到 ' + cells.length + ' 个单元格', 'success');
}

// 把整格内容用统一容器 <div class="tx-cellfmt" style> 包裹（批量模式，作用于整格）
//   ★ 所有「整格级」样式都设在这个 wrapper 的 style 上：
//     - 它是最外层，CSS 层叠中作用于全部子内容；
//     - toggle 只需读 wrapper.style[属性] 有无值，不靠脆弱的字符串正则；
//     - 复用同一个 wrapper，多次设不同属性会叠加而非嵌套（修复"改完字体加粗又没了"）。
function txWrapWholeCell(html, type, value) {
    // 解析出 wrapper（若已有则复用，否则新建并把原内容塞进去）
    const tmp = document.createElement('div');
    tmp.innerHTML = (html || '').trim();
    let wrap = tmp.firstElementChild;
    if (!(wrap && wrap.classList && wrap.classList.contains('tx-cellfmt') && tmp.children.length === 1)) {
        wrap = document.createElement('div');
        wrap.className = 'tx-cellfmt';
        wrap.innerHTML = html || '';
    }
    const st = wrap.style;
    switch (type) {
        case 'bold':         st.fontWeight = st.fontWeight === '700' ? '' : '700'; break;
        case 'italic':       st.fontStyle = st.fontStyle === 'italic' ? '' : 'italic'; break;
        case 'underline':    txToggleDeco(st, 'underline'); break;
        case 'strikeThrough':txToggleDeco(st, 'line-through'); break;
        case 'fontName':     st.fontFamily = value || ''; break;
        case 'foreColor':    st.color = value || ''; break;
        case 'fontSize':     st.fontSize = TX_SIZE_PX[value] || '14px'; break;
        case 'lineHeight':   st.lineHeight = value || ''; break;
        case 'removeFormat': return txStripTags(html); // 清除 → 回纯文本
        // 对齐走 td 级 aligns/valigns，不在此处理
        case 'justifyLeft': case 'justifyCenter': case 'justifyRight':
        case 'alignTop': case 'alignMiddle': case 'alignBottom':
        case 'undo': case 'redo': return html;
        default: return html;
    }
    // wrapper 没有任何 style 了 → 拆掉容器还原裸内容
    if (!wrap.getAttribute('style')) return wrap.innerHTML;
    return wrap.outerHTML;
}
// text-decoration 可同时含 underline + line-through，需合并/移除单项
function txToggleDeco(st, deco) {
    const cur = (st.textDecoration || st.textDecorationLine || '').split(/\s+/).filter(Boolean);
    const idx = cur.indexOf(deco);
    if (idx >= 0) cur.splice(idx, 1); else cur.push(deco);
    st.textDecoration = cur.join(' ');
}
function txStripTags(html) {
    const d = document.createElement('div'); d.innerHTML = html;
    return d.textContent || '';
}
// 同步按钮 active 态（仅格内编辑时有意义）
function txSyncFmtState() {
    const bar = document.getElementById('tx-format-bar');
    if (!bar || !_txEditingCell) return;
    ['bold', 'italic', 'underline', 'strikeThrough'].forEach(cmd => {
        const btn = bar.querySelector(`.tx-fmt-btn[data-cmd="${cmd}"]`);
        if (!btn) return;
        try { btn.classList.toggle('on', document.queryCommandState(cmd)); } catch (e) {}
    });
}

// ===== 双击进入「格内编辑」（Excel 式）=====
var _txCellFinish = null;   // 当前编辑格的 finish 函数
async function txEnterCellEdit(td) {
    if (_txEditingCell === td) return;
    if (document.body.classList.contains('row-resizing') || document.body.classList.contains('col-resizing')) return;
    // 先结束上一个编辑
    if (_txEditingCell) txFinishCellEdit(true);

    const gi = +td.dataset.g, r = +td.dataset.r, ci = +td.dataset.c;
    const group = txBoard.groups[gi];
    if (!group) return;

    // ★ 空白格：补足空行后重渲染，再进入新 td
    if (!group.rows[r]) {
        const created = await txEnsureRowsUpTo(group, r);
        if (!created) return;
        renderTxBoard();
        const newTd = document.querySelector(
            `#tx-board-table td.tx-editable[data-g="${gi}"][data-r="${r}"][data-c="${ci}"]`);
        if (newTd) return txEnterCellEdit(newTd);
        return;
    }

    const rowObj = group.rows[r];
    const cur = (rowObj.cells && rowObj.cells[ci]) || '';

    td.classList.add('editing');
    _txEditingCell = td;
    // 进入编辑时也确保该格被选中
    txSetSelection([{ gi, r, ci }]);
    _txAnchor = { gi, r, ci };

    const ed = document.createElement('div');
    ed.className = 'tx-cell-rich';
    ed.setAttribute('contenteditable', 'true');
    ed.innerHTML = txIsHtml(cur) ? cur : escapeHtml(cur).replace(/\n/g, '<br>');
    td.innerHTML = '';
    td.appendChild(ed);
    if (rowObj.fills && rowObj.fills[ci]) ed.style.background = rowObj.fills[ci];
    ed.focus();
    txPlaceCaretEnd(ed);

    // 激活工具栏（绑定到当前编辑器 → 格式作用于选中文字）
    txActivateFormatBar(ed, td, rowObj, ci);
    ed.addEventListener('click', (ev) => ev.stopPropagation());

    let done = false;
    _txCellFinish = async (save) => {
        if (done) return; done = true;
        _txCellFinish = null;
        const html = txCleanHtml(ed.innerHTML);
        if (save && html !== cur) {
            while (rowObj.cells.length <= ci) rowObj.cells.push('');
            rowObj.cells[ci] = html;
            await txApiPatchCell(rowObj.id, ci, html);
            if (typeof showToast === 'function') showToast('已保存', 'success');
        }
        td.classList.remove('editing');
        _txEditingCell = null;
        // 编辑结束 → 工具栏切回「选区批量模式」
        _txFmtEd = null; _txFmtCtx = null;
        renderTxBoard();
    };
    ed.addEventListener('blur', () => {
        // ★ 正在拖选文字（鼠标越出编辑框导致的 blur）→ 不退出，把焦点抢回，保住选区
        if (_txTextSelecting) { return; }
        setTimeout(() => {
            if (_txFmtInteracting || _txTextSelecting) return; // 工具栏交互/文字拖选中，不退出
            if (_txEditingCell === td) txFinishCellEdit(true);
        }, 150);
    });
    ed.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); txFinishCellEdit(false); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); txFinishCellEdit(true); }
    });
}
// 结束当前格内编辑
function txFinishCellEdit(save) { if (_txCellFinish) _txCellFinish(save); }

// 光标移到末尾
function txPlaceCaretEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

// 清理粘贴/编辑产生的冗余（去掉空内容、统一空格），保留格式标签
function txCleanHtml(html) {
    let s = String(html || '').trim();
    // 空内容归一
    if (s === '<br>' || s === '<div><br></div>' || s === '&nbsp;') return '';
    return s;
}

// ===== 追加一行（→ POST /row）=====
async function addTxRow(gi) {
    const group = txBoard.groups[gi];
    if (!group) return;
    const cells = group.cols.map(() => '');
    try {
        const resp = await authFetch(txUrl('/row'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: group.id, cells })
        });
        const result = await resp.json();
        if (result.id) {
            group.rows.push({ id: result.id, cells });
            renderTxBoard();
            if (typeof showToast === 'function') showToast('已追加一行（双击填写）', 'success');
        }
    } catch (e) {
        console.error('[tx] 追加行失败', e);
        if (typeof showToast === 'function') showToast('追加失败', 'danger');
    }
}

// ===== 为分组补足空行到指定行索引（含中间缺失行）=====
// 用于"双击空白格直接编辑"：该分组 rows 不足 targetRow+1 时，逐行 POST 创建空行
async function txEnsureRowsUpTo(group, targetRow) {
    try {
        while (group.rows.length <= targetRow) {
            const cells = group.cols.map(() => '');
            const resp = await authFetch(txUrl('/row'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId: group.id, cells })
            });
            const result = await resp.json();
            if (!result || !result.id) throw new Error('创建行失败');
            group.rows.push({ id: result.id, cells });
        }
        return true;
    } catch (e) {
        console.error('[tx] 补足空行失败', e);
        if (typeof showToast === 'function') showToast('创建行失败', 'danger');
        return false;
    }
}

// ===== 重置看板（→ POST /reset 再 init-seed）=====
async function resetTxBoard() {
    const ok = (typeof uiConfirm === 'function')
        ? await uiConfirm('确定恢复为初始数据吗？当前编辑内容将全部丢失。', { danger: true, okText: '重置' })
        : confirm('确定恢复为初始数据吗？');
    if (!ok) return;
    try {
        await authFetch(txUrl('/reset'), { method: 'POST' });
        await authFetch(txUrl('/init-seed'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getTxSeed())
        });
        await loadTxBoard();
        if (typeof showToast === 'function') showToast('已重置', 'success');
    } catch (e) {
        console.error('[tx] 重置失败', e);
        if (typeof showToast === 'function') showToast('重置失败', 'danger');
    }
}

// ===== 导出 CSV =====
function exportTxBoard() {
    if (!txBoard) return;
    let csv = '\ufeff';
    txBoard.groups.forEach(g => {
        csv += g.title + '\n';
        csv += g.cols.map(c => '"' + c.replace(/"/g, '""') + '"').join(',') + '\n';
        g.rows.forEach(row => {
            csv += (row.cells || []).map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',') + '\n';
        });
        csv += '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '腾讯系游戏开发进展_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof showToast === 'function') showToast('已导出 CSV', 'success');
}

// ===== 后端 API helpers =====
async function txApiPatchCell(rowId, colIndex, value) {
    try {
        await authFetch(txUrl('/cell'), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rowId, colIndex, value })
        });
    } catch (e) { console.error('[tx] 保存单元格失败', e); if (typeof showToast === 'function') showToast('保存失败', 'danger'); }
}
async function txApiPatchFill(rowId, colIndex, color) {
    try {
        await authFetch(txUrl('/fill'), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rowId, colIndex, color })
        });
    } catch (e) { console.error('[tx] 保存填充色失败', e); }
}
async function txApiPatchAlign(rowId, colIndex, axis, value) {
    try {
        await authFetch(txUrl('/align'), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rowId, colIndex, axis, value })
        });
    } catch (e) { console.error('[tx] 保存对齐失败', e); }
}
async function txApiPatchGroup(groupId, payload) {
    try {
        await authFetch(txUrl('/group/' + groupId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) { console.error('[tx] 保存分组失败', e); if (typeof showToast === 'function') showToast('保存失败', 'danger'); }
}
