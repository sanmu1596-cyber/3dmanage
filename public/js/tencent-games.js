/**
 * 腾讯系游戏开发进展 — tencent-games.js（4分组并排看板版）
 * ============================================================
 * 忠实还原乔老师提供的看板布局：4 个大分组横向并排，每组子列不同、行数不齐。
 *   1. 适配进行中   → [游戏名称, 备注]
 *   2. 未来排期     → [游戏名称, 新游(可预约)]
 *   3. 已适配-修复BUG → [游戏名称, 备注]
 *   4. 已适配游戏列表 → [游戏名称A, 游戏名称B]（双子列）
 * 每个单元格可双击编辑；每组行尾"＋"可追加一行。
 * 数据：纯前端 localStorage（key: tx_board_data_v2）。
 * 后续接后端时把 loadTxBoard/saveTxBoard 换成 authFetch 即可。
 * ============================================================
 */

// ===== 全局（必须 var，踩坑#1）=====
var txBoard = null;             // { groups: [ {key, title, cols:[...], rows:[ [c0,c1], ... ] } ] }
var _txSubTabInited = false;

const TX_STORE_KEY = 'tx_board_data_v2';

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

// ===== 种子数据（忠实还原第二张截图）=====
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

// ===== 加载/保存 =====
function loadTxBoard() {
    try {
        const saved = localStorage.getItem(TX_STORE_KEY);
        txBoard = saved ? JSON.parse(saved) : getTxSeed();
    } catch (e) {
        console.error('[tx] 加载失败，用种子', e);
        txBoard = getTxSeed();
    }
    if (!isValidBoard(txBoard)) txBoard = getTxSeed();
    renderTxBoard();
}
function isValidBoard(b) { return b && Array.isArray(b.groups) && b.groups.length > 0; }
function saveTxBoard() {
    try { localStorage.setItem(TX_STORE_KEY, JSON.stringify(txBoard)); } catch (e) {}
}

// CSS class 安全化
function txCls(s) { return String(s || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]/g, ''); }

// 备注内"本周进展/本周无进展"高亮
function txHighlight(text) {
    let html = escapeHtml(text || '');
    html = html.replace(/本周无进展/g, '<span class="tx-hl-red">本周无进展</span>');
    html = html.replace(/(^|<br>|\n)(本周进展)/g, '$1<span class="tx-hl-green">本周进展</span>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

// 叶子列总数（所有分组的子列数之和）
function txLeafCount() {
    return txBoard.groups.reduce((n, g) => n + g.cols.length, 0);
}

// ===== 列宽 / 行高 持久化 =====
const TX_COLW_KEY = 'tx_board_colwidths_v2';
const TX_ROWH_KEY = 'tx_board_rowheights_v2';
function txGetColWidths() {
    try { const r = localStorage.getItem(TX_COLW_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function txSaveColWidths(arr) {
    try { localStorage.setItem(TX_COLW_KEY, JSON.stringify(arr)); } catch (e) {}
}
function txGetRowHeights() {
    try { const r = localStorage.getItem(TX_ROWH_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function txSaveRowHeights(obj) {
    try { localStorage.setItem(TX_ROWH_KEY, JSON.stringify(obj)); } catch (e) {}
}

// ===== 渲染整张看板（一张大 table，每组多列并排）=====
function renderTxBoard() {
    const table = document.getElementById('tx-board-table');
    if (!table || !txBoard) return;
    const groups = txBoard.groups;
    const maxRows = Math.max.apply(null, groups.map(g => g.rows.length));
    const leafCount = txLeafCount();
    const savedW = txGetColWidths();
    const savedH = txGetRowHeights();

    // —— colgroup：用 table-layout:fixed + col 宽度精确控制列宽（可拖拽持久化）——
    // 默认宽度：游戏名称类 150，备注类 360，其他 150
    let colgroup = '<colgroup>';
    let leafIdx = 0;
    groups.forEach(g => {
        g.cols.forEach(col => {
            let w = (savedW && savedW[leafIdx]) ? savedW[leafIdx]
                : (col.indexOf('备注') >= 0 ? 360 : 150);
            colgroup += `<col style="width:${w}px">`;
            leafIdx++;
        });
    });
    colgroup += '</colgroup>';

    // —— 表头（两行）——
    let thead = '<thead>';
    // 第一行：大分组标题（每组 colspan=该组列数）
    thead += '<tr>';
    groups.forEach((g, gi) => {
        thead += `<th class="tx-grp-h tx-grp-${txCls(g.key)}" colspan="${g.cols.length}" data-g="${gi}" ondblclick="startTxGroupTitleEdit(this)" title="双击编辑分组名">${escapeHtml(g.title)}</th>`;
    });
    thead += '</tr>';
    // 第二行：子列标题（可双击编辑列名 + 右侧列宽拖拽手柄）
    thead += '<tr>';
    leafIdx = 0;
    groups.forEach((g, gi) => {
        g.cols.forEach((col, ci) => {
            thead += `<th class="tx-sub-h s-${txCls(g.key)}" data-g="${gi}" data-c="${ci}" data-leaf="${leafIdx}" ondblclick="startTxColNameEdit(this)" title="双击编辑列名">`
                + `<span class="tx-colname">${escapeHtml(col)}</span>`
                + `<span class="tx-col-resize" onmousedown="startTxColResize(event, ${leafIdx})"></span>`
                + `</th>`;
            leafIdx++;
        });
    });
    thead += '</tr>';
    thead += '</thead>';

    // —— 表体（按 maxRows 对齐，缺的格留空）——
    let tbody = '<tbody>';
    for (let r = 0; r < maxRows; r++) {
        const rh = savedH[r] ? ` style="height:${savedH[r]}px"` : '';
        tbody += `<tr data-row="${r}"${rh}>`;
        groups.forEach((g, gi) => {
            const row = g.rows[r];
            g.cols.forEach((col, ci) => {
                if (!row) {
                    tbody += `<td class="tx-c-empty"></td>`;
                    return;
                }
                const val = row[ci] || '';
                const isNote = col.indexOf('备注') >= 0;
                const cls = isNote ? 'tx-c-note' : (ci === 0 ? 'tx-c-name' : 'tx-c-plain');
                const display = isNote ? txHighlight(val) : (escapeHtml(val).replace(/\n/g, '<br>') || '<span style="color:#c0c4cc">—</span>');
                // 第一组第一列的格子带行高拖拽手柄（每行底部一个即可）
                const rowHandle = (gi === 0 && ci === 0)
                    ? `<span class="tx-row-resize" onmousedown="startTxRowResize(event, ${r})"></span>` : '';
                tbody += `<td class="tx-editable ${cls}" data-g="${gi}" data-r="${r}" data-c="${ci}" ondblclick="startTxCellEdit(this)" title="双击编辑">${display}${rowHandle}</td>`;
            });
        });
        tbody += '</tr>';
    }
    // —— 追加行按钮行（每组一个＋，跨该组列数）——
    tbody += '<tr class="tx-add-row">';
    groups.forEach((g, gi) => {
        tbody += `<td colspan="${g.cols.length}"><button class="tx-add-btn" onclick="addTxRow(${gi})">＋ 追加一行</button></td>`;
    });
    tbody += '</tr>';
    tbody += '</tbody>';

    table.style.tableLayout = 'fixed';
    table.innerHTML = colgroup + thead + tbody;
}

// ===== 列宽拖拽（参考游戏列表 initColumnResize 做法）=====
function startTxColResize(e, leafIdx) {
    e.preventDefault();
    e.stopPropagation();
    const table = document.getElementById('tx-board-table');
    const cols = table.querySelectorAll('colgroup col');
    const col = cols[leafIdx];
    if (!col) return;
    const startX = e.pageX;
    const startW = parseInt(col.style.width) || 150;
    document.body.classList.add('col-resizing');

    const onMove = (ev) => {
        const w = Math.max(60, startW + (ev.pageX - startX));
        col.style.width = w + 'px';
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('col-resizing');
        // 保存所有列宽
        const widths = Array.from(cols).map(c => parseInt(c.style.width) || 150);
        txSaveColWidths(widths);
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
        const heights = txGetRowHeights();
        heights[rowIdx] = tr.offsetHeight;
        txSaveRowHeights(heights);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ===== 列名双击编辑 =====
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
    const finish = (save) => {
        if (done) return; done = true;
        if (save && input.value.trim()) {
            group.cols[ci] = input.value.trim();
            saveTxBoard();
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

// ===== 分组名双击编辑 =====
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
    const finish = (save) => {
        if (done) return; done = true;
        if (save && input.value.trim()) {
            group.title = input.value.trim();
            saveTxBoard();
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

// ===== 单元格双击编辑（textarea 浮层，回车/失焦保存）=====
function startTxCellEdit(td) {
    if (td.classList.contains('editing')) return;
    const gi = +td.dataset.g, r = +td.dataset.r, ci = +td.dataset.c;
    const group = txBoard.groups[gi];
    if (!group || !group.rows[r]) return;
    const cur = group.rows[r][ci] || '';

    td.classList.add('editing');
    const originalHtml = td.innerHTML;

    const ta = document.createElement('textarea');
    ta.className = 'tx-cell-input';
    ta.value = cur;
    ta.rows = Math.max(2, (cur.match(/\n/g) || []).length + 1);

    td.innerHTML = '';
    td.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    let done = false;
    const finish = (save) => {
        if (done) return; done = true;
        if (save) {
            group.rows[r][ci] = ta.value;
            saveTxBoard();
            if (typeof showToast === 'function') showToast('已保存', 'success');
        }
        td.classList.remove('editing');
        renderTxBoard();
    };
    ta.addEventListener('blur', () => finish(true));
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        // 普通回车保存；Shift+Enter 换行
        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
    });
}

// ===== 追加一行 =====
function addTxRow(gi) {
    const group = txBoard.groups[gi];
    if (!group) return;
    group.rows.push(group.cols.map(() => ''));
    saveTxBoard();
    renderTxBoard();
    if (typeof showToast === 'function') showToast('已追加一行（双击填写）', 'success');
}

// ===== 重置看板 =====
async function resetTxBoard() {
    const ok = (typeof uiConfirm === 'function')
        ? await uiConfirm('确定恢复为初始数据吗？当前编辑内容将丢失。', { danger: true, okText: '重置' })
        : confirm('确定恢复为初始数据吗？');
    if (!ok) return;
    txBoard = getTxSeed();
    saveTxBoard();
    renderTxBoard();
    if (typeof showToast === 'function') showToast('已重置', 'success');
}

// ===== 导出（CSV，按分组）=====
function exportTxBoard() {
    if (!txBoard) return;
    let csv = '\ufeff';
    txBoard.groups.forEach(g => {
        csv += g.title + '\n';
        csv += g.cols.map(c => '"' + c.replace(/"/g, '""') + '"').join(',') + '\n';
        g.rows.forEach(row => {
            csv += row.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',') + '\n';
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
