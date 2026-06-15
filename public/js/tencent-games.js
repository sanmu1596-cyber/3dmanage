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
            cells: Array.isArray(r.cells) ? r.cells : []
        }))
    }));
    return { groups, meta: { colWidths: meta.colWidths || null, rowHeights: meta.rowHeights || {} } };
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
        thead += `<th class="tx-grp-h tx-grp-${txCls(g.key)}" colspan="${g.cols.length}" data-g="${gi}" ondblclick="startTxGroupTitleEdit(this)" title="双击编辑分组名">${escapeHtml(g.title)}</th>`;
    });
    thead += '</tr>';
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

    // —— 表体 —— 
    let tbody = '<tbody>';
    for (let r = 0; r < maxRows; r++) {
        const rh = savedH[r] ? ` style="height:${savedH[r]}px"` : '';
        tbody += `<tr data-row="${r}"${rh}>`;
        groups.forEach((g, gi) => {
            const row = g.rows[r];
            g.cols.forEach((col, ci) => {
                if (!row) { tbody += `<td class="tx-c-empty"></td>`; return; }
                const val = (row.cells && row.cells[ci]) || '';
                const isNote = col.indexOf('备注') >= 0;
                const cls = isNote ? 'tx-c-note' : (ci === 0 ? 'tx-c-name' : 'tx-c-plain');
                const display = isNote ? txHighlight(val) : (escapeHtml(val).replace(/\n/g, '<br>') || '<span style="color:#c0c4cc">—</span>');
                const rowHandle = (gi === 0 && ci === 0)
                    ? `<span class="tx-row-resize" onmousedown="startTxRowResize(event, ${r})"></span>` : '';
                tbody += `<td class="tx-editable ${cls}" data-g="${gi}" data-r="${r}" data-c="${ci}" ondblclick="startTxCellEdit(this)" title="双击编辑">${display}${rowHandle}</td>`;
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

// ===== 单元格双击编辑（→ PATCH /cell）=====
function startTxCellEdit(td) {
    if (td.classList.contains('editing')) return;
    const gi = +td.dataset.g, r = +td.dataset.r, ci = +td.dataset.c;
    const group = txBoard.groups[gi];
    if (!group || !group.rows[r]) return;
    const rowObj = group.rows[r];
    const cur = (rowObj.cells && rowObj.cells[ci]) || '';

    td.classList.add('editing');
    const ta = document.createElement('textarea');
    ta.className = 'tx-cell-input';
    ta.value = cur;
    ta.rows = Math.max(2, (cur.match(/\n/g) || []).length + 1);
    td.innerHTML = '';
    td.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    let done = false;
    const finish = async (save) => {
        if (done) return; done = true;
        if (save && ta.value !== cur) {
            while (rowObj.cells.length <= ci) rowObj.cells.push('');
            rowObj.cells[ci] = ta.value;
            await txApiPatchCell(rowObj.id, ci, ta.value);
            if (typeof showToast === 'function') showToast('已保存', 'success');
        }
        td.classList.remove('editing');
        renderTxBoard();
    };
    ta.addEventListener('blur', () => finish(true));
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
    });
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
async function txApiPatchGroup(groupId, payload) {
    try {
        await authFetch(TX_API + '/group/' + groupId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) { console.error('[tx] 保存分组失败', e); if (typeof showToast === 'function') showToast('保存失败', 'danger'); }
}
