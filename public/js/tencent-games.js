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

// ===== 子 Tab 切换 =====
function switchReportSubTab(subtab) {
    document.querySelectorAll('.report-sub-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.subtab === subtab);
    });
    document.querySelectorAll('.report-sub-panel').forEach(p => { p.style.display = 'none'; });
    if (subtab === 'report-main') {
        const m = document.getElementById('report-sub-main');
        if (m) m.style.display = 'flex';
    } else {
        const t = document.getElementById('report-sub-tencent');
        if (t) t.style.display = 'flex';
        loadTxBoard();
    }
}

// ===== 种子数据（首次为空时写入后端）=====
function getTxSeed() {
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

// ===== 数据加载（后端） =====
async function loadTxBoard() {
    if (_txLoading) return;
    _txLoading = true;
    const tableEl = document.getElementById('tx-board-table');
    if (tableEl) tableEl.innerHTML = '<tbody><tr><td class="table-loading"><span class="table-loading-spinner"></span>加载中...</td></tr></tbody>';
    try {
        let resp = await authFetch(TX_API);
        let data = await resp.json();
        // 空看板 → 推送种子初始化，再重新拉
        if (!data || !Array.isArray(data.groups) || data.groups.length === 0) {
            await authFetch(TX_API + '/init-seed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(getTxSeed())
            });
            resp = await authFetch(TX_API);
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
            fills: Array.isArray(r.fills) ? r.fills : []
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
        await authFetch(TX_API + '/meta', {
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
                    // ★ 空白格（该分组此行无数据）也支持单击编辑：自动为该分组补足空行后进入编辑
                    tbody += `<td class="tx-editable tx-c-empty" data-g="${gi}" data-r="${r}" data-c="${ci}" onclick="startTxCellEdit(this)">${rowHandle}</td>`;
                    return;
                }
                const val = (row.cells && row.cells[ci]) || '';
                const fill = (row.fills && row.fills[ci]) || '';
                const isNote = col.indexOf('备注') >= 0;
                const cls = isNote ? 'tx-c-note' : (ci === 0 ? 'tx-c-name' : 'tx-c-plain');
                const display = isNote ? txHighlight(val) : (txCellDisplay(val) || '<span style="color:#c0c4cc">—</span>');
                const fillStyle = fill ? ` style="background:${escapeHtml(fill)}"` : '';
                tbody += `<td class="tx-editable ${cls}" data-g="${gi}" data-r="${r}" data-c="${ci}"${fillStyle} onclick="startTxCellEdit(this)">${display}${rowHandle}</td>`;
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
        txExecOnEditor(() => document.execCommand('foreColor', false, color));
        const ico = document.getElementById('tx-fmt-fore-ico');
        if (ico) ico.style.borderBottom = '3px solid ' + color;
        txCloseMenus();
    });
    txRenderSwatches('tx-fmt-fill-swatches', (color) => { txApplyFill(color); txCloseMenus(); });

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

    // 直接命令按钮（B/I/U/S、撤销重做、清除格式）
    bar.querySelectorAll('.tx-fmt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            txExecOnEditor(() => {
                if (cmd === 'removeFormat') {
                    document.execCommand('removeFormat', false, null);
                    document.execCommand('unlink', false, null);
                } else {
                    document.execCommand(cmd, false, null);
                }
            });
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

    // 下拉项点击（execCommand / 行距 / 字体字号回显）
    bar.querySelectorAll('.tx-fmt-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.preventDefault();
            // 清除填充
            if (opt.classList.contains('tx-fmt-clearfill')) { txApplyFill(''); txCloseMenus(); return; }
            const cmd = opt.dataset.cmd;
            const val = opt.dataset.val;
            txExecOnEditor(() => {
                if (cmd === 'fontName') {
                    document.execCommand('fontName', false, val);
                    const lbl = document.getElementById('tx-fmt-font-label');
                    if (lbl) lbl.textContent = opt.textContent.trim();
                } else if (cmd === 'fontSize') {
                    txApplyFontSize(val);
                    const lbl = document.getElementById('tx-fmt-size-label');
                    if (lbl) lbl.textContent = opt.dataset.label || opt.textContent.trim();
                } else if (cmd === 'lineHeight') {
                    txApplyLineHeight(val);
                } else if (cmd) {
                    document.execCommand(cmd, false, null);
                }
            });
            txCloseMenus();
        });
    });

    // 文字颜色自定义
    const fore = document.getElementById('tx-fmt-fore');
    if (fore) fore.addEventListener('input', () => {
        txExecOnEditor(() => document.execCommand('foreColor', false, fore.value));
        const ico = document.getElementById('tx-fmt-fore-ico');
        if (ico) ico.style.borderBottom = '3px solid ' + fore.value;
    });

    // 单元格填充自定义
    const fill = document.getElementById('tx-fmt-fill');
    if (fill) fill.addEventListener('input', () => txApplyFill(fill.value));

    // 点工具栏外部关闭所有下拉（用 mousedown，与触发器同一阶段，避免 click 时序把刚开的菜单关掉）
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#tx-format-bar')) txCloseMenus();
    });
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

// 应用单元格填充色（空字符串=清除）
function txApplyFill(color) {
    if (!_txFmtEd || !_txFmtCtx) return;
    _txFmtEd.style.background = color || '';
    _txFmtCtx.rowObj.fills = _txFmtCtx.rowObj.fills || [];
    _txFmtCtx.rowObj.fills[_txFmtCtx.ci] = color || '';
    txApiPatchFill(_txFmtCtx.rowObj.id, _txFmtCtx.ci, color || '');
    const ico = document.getElementById('tx-fmt-fill-ico');
    if (ico) ico.style.background = color || '#fff3a8';
}

// 在编辑器上下文执行格式命令（先恢复选区，再执行，确保命令作用在选中文字上）
function txExecOnEditor(fn) {
    if (!_txFmtEd) return;
    // ★ 恢复点工具栏前保存的选区（否则 focus 会丢失选中文字 → 命令对空光标无效）
    txRestoreSelection();
    // ★ 用 CSS 内联样式实现格式（fontSize/foreColor 等用 styleWithCSS 才可靠生效）
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
    fn();
    // 命令执行后选区可能变化，重新保存供连续操作
    txSaveSelection();
}

// 字号：execCommand('fontSize') 只支持 1-7 档且生成 <font>，改用 CSS px 包裹选区
var TX_SIZE_PX = { '1': '10px', '2': '13px', '3': '14px', '4': '16px', '5': '20px', '6': '24px', '7': '32px' };
function txApplyFontSize(sizeKey) {
    if (!_txFmtEd) return;
    txRestoreSelection();
    const px = TX_SIZE_PX[sizeKey] || '14px';
    // 用 fontSize=7 做标记（styleWithCSS 下会生成 font-size:xxx-large 的 span/font），
    // 再统一改写为目标 px，规避 execCommand fontSize 只能 1-7 档的限制
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
    document.execCommand('fontSize', false, '7');
    _txFmtEd.querySelectorAll('font[size], [style*="xxx-large"]').forEach(el => {
        el.removeAttribute('size');
        el.style.fontSize = px;
    });
    txSaveSelection();
}

// 行距：对选区所在块级元素设置 line-height（execCommand 无原生命令）
function txApplyLineHeight(lh) {
    if (!_txFmtEd) return;
    txRestoreSelection();
    // 单元格内容通常为一段 → 整个编辑器统一行距
    _txFmtEd.style.lineHeight = lh;
    txSaveSelection();
}

// 同步按钮 active 态（粗/斜/下划线等）
function txSyncFmtState() {
    const bar = document.getElementById('tx-format-bar');
    if (!bar) return;
    ['bold', 'italic', 'underline', 'strikeThrough'].forEach(cmd => {
        const btn = bar.querySelector(`.tx-fmt-btn[data-cmd="${cmd}"]`);
        if (!btn) return;
        try { btn.classList.toggle('on', document.queryCommandState(cmd)); } catch (e) {}
    });
}

// ===== 单元格单击编辑（→ PATCH /cell）=====
async function startTxCellEdit(td) {
    if (td.classList.contains('editing')) return;
    // 忽略刚拖过列宽/行高的情况（拖拽后 mouseup 会触发一次 click）
    if (document.body.classList.contains('row-resizing') || document.body.classList.contains('col-resizing')) return;
    const gi = +td.dataset.g, r = +td.dataset.r, ci = +td.dataset.c;
    const group = txBoard.groups[gi];
    if (!group) return;

    // ★ 空白格：该分组在这一行还没有数据 → 先为其补足空行（含中间缺失的行）再编辑
    if (!group.rows[r]) {
        const created = await txEnsureRowsUpTo(group, r);
        if (!created) return;
        // 行已创建并重渲染，DOM 中原 td 已失效，需重新取新的 td 继续编辑
        renderTxBoard();
        const newTd = document.querySelector(
            `#tx-board-table td.tx-editable[data-g="${gi}"][data-r="${r}"][data-c="${ci}"]`);
        if (newTd && !newTd.classList.contains('editing')) {
            // 递归一次：此时 group.rows[r] 已存在，会走到下面正常编辑分支
            return startTxCellEdit(newTd);
        }
        return;
    }

    const rowObj = group.rows[r];
    const cur = (rowObj.cells && rowObj.cells[ci]) || '';

    td.classList.add('editing');
    // 富文本可编辑区（contenteditable）
    const ed = document.createElement('div');
    ed.className = 'tx-cell-rich';
    ed.setAttribute('contenteditable', 'true');
    ed.innerHTML = txIsHtml(cur) ? cur : escapeHtml(cur).replace(/\n/g, '<br>');
    td.innerHTML = '';
    td.appendChild(ed);
    // 应用已存的单元格填充色（若有）
    if (rowObj.fills && rowObj.fills[ci]) ed.style.background = rowObj.fills[ci];
    ed.focus();
    txPlaceCaretEnd(ed);

    // 激活工具栏，绑定当前编辑器
    txActivateFormatBar(ed, td, rowObj, ci);

    // ★ 单击进入编辑后，编辑器内的点击/选择都会被 selectionchange 捕获保存；
    //    阻止该 td 的 onclick 再次触发（contenteditable 已接管交互）
    ed.addEventListener('click', (ev) => ev.stopPropagation());

    let done = false;
    const finish = async (save) => {
        if (done) return; done = true;
        txDeactivateFormatBar();
        const html = txCleanHtml(ed.innerHTML);
        if (save && html !== cur) {
            while (rowObj.cells.length <= ci) rowObj.cells.push('');
            rowObj.cells[ci] = html;
            await txApiPatchCell(rowObj.id, ci, html);
            if (typeof showToast === 'function') showToast('已保存', 'success');
        }
        td.classList.remove('editing');
        renderTxBoard();
    };
    ed.addEventListener('blur', () => {
        // 延迟，避免点击工具栏按钮时误触发 blur 保存
        setTimeout(() => { if (!_txFmtInteracting) finish(true); }, 150);
    });
    ed.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        // Enter 默认换行（富文本多行）；Ctrl/Cmd+Enter 保存退出
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
    });
}

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
        const resp = await authFetch(TX_API + '/row', {
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
            const resp = await authFetch(TX_API + '/row', {
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
        await authFetch(TX_API + '/reset', { method: 'POST' });
        await authFetch(TX_API + '/init-seed', {
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
        await authFetch(TX_API + '/cell', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rowId, colIndex, value })
        });
    } catch (e) { console.error('[tx] 保存单元格失败', e); if (typeof showToast === 'function') showToast('保存失败', 'danger'); }
}
async function txApiPatchFill(rowId, colIndex, color) {
    try {
        await authFetch(TX_API + '/fill', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rowId, colIndex, color })
        });
    } catch (e) { console.error('[tx] 保存填充色失败', e); }
}
async function txApiPatchGroup(groupId, payload) {
    try {
        await authFetch(TX_API + '/group/' + groupId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) { console.error('[tx] 保存分组失败', e); if (typeof showToast === 'function') showToast('保存失败', 'danger'); }
}
