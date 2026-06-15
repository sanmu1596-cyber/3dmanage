/**
 * 腾讯系游戏开发进展 — tencent-games.js
 * ============================================================
 * 汇报报表下的子集，标准可编辑表格（风格对齐游戏列表）：
 * - 单击下拉编辑：分组 / 下载状态 / 本周进展
 * - 双击文本编辑：游戏名称 / 备注 / 仅预约关联
 * - 列宽拖拽 / 排序 / tooltip 复用游戏列表的通用能力
 * 数据：当前阶段纯前端，持久化到 localStorage（key: tx_games_data）
 * 后续接后端时，把 loadTxGames/saveTxGamesLocal 换成 authFetch 即可。
 * ============================================================
 */

// ===== 全局变量（必须 var，踩坑#1）=====
var allTxGamesData = [];        // 全量
var filteredTxGamesData = [];   // 筛选后
var _txCurrentSubTab = 'report-main';

const TX_STORE_KEY = 'tx_games_data';
const TX_GROUPS = ['适配中', '已适配有BUG', '已适配'];
const TX_DOWNLOAD_OPTS = ['', '可下载', '仅预约'];
const TX_PROGRESS_OPTS = ['', '本周进展', '本周无进展'];

// ===== 子 Tab 切换 =====
function switchReportSubTab(subtab) {
    _txCurrentSubTab = subtab;
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
        loadTxGames();
    }
}

// ===== 默认种子数据（来自乔老师提供的截图）=====
function getTxSeedData() {
    let id = 1;
    const mk = (group, game_name, notes, download_status, reservation, progress_status) =>
        ({ id: id++, group, game_name, notes: notes || '', download_status: download_status || '', reservation: reservation || '', progress_status: progress_status || '' });
    return [
        // ===== 适配中 =====
        mk('适配中', '龙息：神寂', '本周无进展\n1、游戏中，2D状态下黑屏，再次交织-3D状态下也黑屏；\n2、游戏交互界面，部分UI消失，部分UI未分离；', '可下载', '穿越火线 - RUST玩法授权', '本周无进展'),
        mk('适配中', '王者荣耀世界', '1、分辨率为3840*2160时，游戏内黑屏，仅显示UI；\n2、鼠标放在"共鸣"上时，有另一个UI，debug抓不到；', '可下载', '终极角逐 THE FINALS', ''),
        mk('适配中', '洛克王国：世界', '本周无进展\n1、宠物界面周围多了一个黑框；\n2、我的衣柜和主界面切换时，编译条闪烁；\n3、和宠物对决，屏幕上方出现一条透明黑框；\n4、任务地点指引图标、左键长按击图标需要优化为UI不分离；\n5、内嵌的网页显示hook进度条；\n6、宠物界面displays不全；', '可下载', '星痕共鸣', ''),
        mk('适配中', '', '', '可下载', '彩虹六号：攻势', ''),
        mk('适配中', '', '', '', '王者万象棋', ''),
        mk('适配中', '', '', '', '粒粒的小人国', ''),
        mk('适配中', '', '', '', '地下城与勇士：卡赞', ''),
        mk('适配中', '', '', '仅预约', '失控进化 - RUST玩法授权', ''),
        mk('适配中', '', '', '仅预约', '异人之下', ''),
        mk('适配中', '', '', '仅预约', '灰境行者', ''),
        mk('适配中', '', '', '仅预约', '星际战甲', ''),
        // ===== 已适配有BUG =====
        mk('已适配有BUG', '全境封锁2', '本周进展\n1、游戏中的"交互点"，"任务指引点等UI贴屏，影响游戏体验；\n2、"准心"贴屏，影响命中率；\n3、敌人血条有拖影，血条改为不贴屏；', '', '', '本周进展'),
        mk('已适配有BUG', '无畏契约', '本周无进展\n研发测试版本：已解决"人物介绍UI"不抖动，但部分UI不分离；', '', '', '本周无进展'),
        mk('已适配有BUG', '石器时代：觉醒', '本周进展\n1、游戏内切换非极致画面后，UI消失', '', '', '本周进展'),
        mk('已适配有BUG', '元梦之星-山海寻灵（中低档）', '', '', '', ''),
        mk('已适配有BUG', '逆战：未来', '', '', '', ''),
        // ===== 已适配 =====
        mk('已适配', '流放之路', '', '', '天涯明月刀', ''),
        mk('已适配', '暗区突围', '', '', '流放之路：降临', ''),
        mk('已适配', 'NBA2KOL2', '', '', '卡拉彼丘', ''),
        mk('已适配', '逆战', '', '', '三角洲行动', ''),
        mk('已适配', '英雄联盟lol', '', '', '', ''),
        mk('已适配', '矩阵：零日危机', '', '', '', '')
    ];
}

// ===== 加载/保存（localStorage）=====
function loadTxGames() {
    try {
        const saved = localStorage.getItem(TX_STORE_KEY);
        if (saved) {
            allTxGamesData = JSON.parse(saved);
        } else {
            allTxGamesData = getTxSeedData();
            saveTxGamesLocal();
        }
    } catch (e) {
        console.error('[tx] 加载失败，使用种子数据', e);
        allTxGamesData = getTxSeedData();
    }
    filterTxGames();
}

function saveTxGamesLocal() {
    try { localStorage.setItem(TX_STORE_KEY, JSON.stringify(allTxGamesData)); } catch (e) {}
}

// ===== 筛选 =====
function filterTxGames() {
    const kw = (document.getElementById('tx-game-search')?.value || '').trim().toLowerCase();
    const grp = document.getElementById('tx-group-filter')?.value || '';
    const dl = document.getElementById('tx-download-filter')?.value || '';
    filteredTxGamesData = (allTxGamesData || []).filter(r => {
        if (grp && r.group !== grp) return false;
        if (dl) {
            if (dl === '可下载' || dl === '仅预约') { if (r.download_status !== dl) return false; }
            else if (dl === '本周进展' || dl === '本周无进展') { if (r.progress_status !== dl) return false; }
        }
        if (kw) {
            const hay = `${r.game_name} ${r.notes} ${r.reservation}`.toLowerCase();
            if (!hay.includes(kw)) return false;
        }
        return true;
    });
    renderTxGamesTable();
}

// ===== 渲染表格 =====
function renderTxGamesTable() {
    const tbody = document.getElementById('tx-games-table');
    if (!tbody) return;
    const data = filteredTxGamesData;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">
            <div class="empty-icon">🐧</div>
            <div class="empty-text">暂无腾讯系游戏</div>
            <div class="empty-sub">点击"新增游戏"添加第一条开发进展</div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((r, idx) => {
        const groupBadge = `<span class="tx-group-badge tx-group-${sanitizeTxClass(r.group)}">${escapeHtml(r.group)}</span>`;
        const notesHtml = escapeHtml(r.notes || '-').replace(/\n/g, '<br>');
        const progressCls = r.progress_status ? `tx-progress-${sanitizeTxClass(r.progress_status)}` : '';
        return `
        <tr data-id="${r.id}">
            <td>${idx + 1}</td>
            <td class="editable-cell" onclick="startTxDropdownEdit(this, ${r.id}, 'group')" title="点击选择">${groupBadge}</td>
            <td class="editable-cell" ondblclick="startTxTextEdit(this, ${r.id}, 'game_name')" title="双击编辑">${escapeHtml(r.game_name || '-')}</td>
            <td class="editable-cell tx-notes-cell" ondblclick="startTxTextEdit(this, ${r.id}, 'notes')" title="双击编辑">${notesHtml || '-'}</td>
            <td class="editable-cell" onclick="startTxDropdownEdit(this, ${r.id}, 'download_status')" title="点击选择">${escapeHtml(r.download_status || '-')}</td>
            <td class="editable-cell" ondblclick="startTxTextEdit(this, ${r.id}, 'reservation')" title="双击编辑">${escapeHtml(r.reservation || '-')}</td>
            <td class="editable-cell ${progressCls}" onclick="startTxDropdownEdit(this, ${r.id}, 'progress_status')" title="点击选择">${escapeHtml(r.progress_status || '-')}</td>
            <td>
                <button class="btn btn-small btn-edit" onclick="editTxGame(${r.id})">编辑</button>
                <button class="btn btn-small btn-delete" onclick="deleteTxGame(${r.id})">删除</button>
            </td>
        </tr>`;
    }).join('');

    // 复用游戏列表通用能力
    if (typeof applyCellTooltips === 'function') applyCellTooltips('tx-games-table');
    if (typeof initTableSort === 'function') initTableSort('tx-games-data-table');
    if (typeof initColumnResize === 'function') requestAnimationFrame(() => initColumnResize());
}

// CSS class 安全化（中文也可作为 class 后缀，但去掉空格/特殊符号）
function sanitizeTxClass(s) {
    return String(s || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]/g, '');
}

// ===== 行内编辑：下拉 =====
function startTxDropdownEdit(td, id, field) {
    if (td.classList.contains('editing')) return;
    const row = allTxGamesData.find(r => r.id === id);
    if (!row) return;
    td.classList.add('editing');
    td.style.position = 'relative';

    const opts = field === 'group' ? TX_GROUPS
        : field === 'download_status' ? TX_DOWNLOAD_OPTS
        : TX_PROGRESS_OPTS;
    const cur = row[field] || '';

    // 占位符撑住 td 尺寸（踩坑：absolute 浮层 + 占位符防 reflow）
    const originalHtml = td.innerHTML;
    const placeholder = document.createElement('span');
    placeholder.style.cssText = 'visibility:hidden;display:block;';
    placeholder.innerHTML = originalHtml;

    const sel = document.createElement('select');
    sel.className = 'inline-edit-select';
    sel.style.cssText = 'position:absolute;left:4px;top:50%;transform:translateY(-50%);width:calc(100% - 8px);z-index:30;';
    sel.innerHTML = opts.map(o => `<option value="${escapeHtml(o)}"${o === cur ? ' selected' : ''}>${escapeHtml(o || '（空）')}</option>`).join('');

    td.innerHTML = '';
    td.appendChild(placeholder);
    td.appendChild(sel);
    sel.focus();

    const finish = (save) => {
        if (save) {
            row[field] = sel.value;
            saveTxGamesLocal();
            if (typeof showToast === 'function') showToast('已保存', 'success');
        }
        td.classList.remove('editing');
        td.style.position = '';
        filterTxGames();
    };
    sel.addEventListener('change', () => finish(true));
    sel.addEventListener('blur', () => finish(false));
    sel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    });
}

// ===== 行内编辑：文本 =====
function startTxTextEdit(td, id, field) {
    if (td.classList.contains('editing')) return;
    const row = allTxGamesData.find(r => r.id === id);
    if (!row) return;
    td.classList.add('editing');
    td.style.position = 'relative';

    const isLong = field === 'notes';
    const cur = row[field] || '';

    const originalHtml = td.innerHTML;
    const placeholder = document.createElement('span');
    placeholder.style.cssText = 'visibility:hidden;display:block;';
    placeholder.innerHTML = originalHtml;

    const input = document.createElement(isLong ? 'textarea' : 'input');
    input.className = 'inline-edit-input';
    if (isLong) {
        input.rows = Math.max(3, (cur.match(/\n/g) || []).length + 1);
        input.style.cssText = 'position:absolute;left:4px;top:4px;width:calc(100% - 8px);min-height:80px;z-index:30;resize:vertical;';
    } else {
        input.type = 'text';
        input.style.cssText = 'position:absolute;left:4px;top:50%;transform:translateY(-50%);width:calc(100% - 8px);z-index:30;';
    }
    input.value = cur;

    td.innerHTML = '';
    td.appendChild(placeholder);
    td.appendChild(input);
    input.focus();
    if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length);

    let saved = false;
    const finish = (save) => {
        if (saved) return; saved = true;
        if (save) {
            row[field] = input.value;
            saveTxGamesLocal();
            if (typeof showToast === 'function') showToast('已保存', 'success');
        }
        td.classList.remove('editing');
        td.style.position = '';
        filterTxGames();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        // 单行输入回车保存；多行用 Ctrl+Enter 保存
        else if (e.key === 'Enter' && (!isLong || e.ctrlKey)) { e.preventDefault(); finish(true); }
    });
}

// ===== 新增/编辑弹窗 =====
function openTxGameModal(id) {
    document.getElementById('tx-game-form').reset();
    document.getElementById('tx-id').value = '';
    document.getElementById('tx-game-modal-title').textContent = id ? '编辑游戏' : '新增游戏';
    if (id) {
        const row = allTxGamesData.find(r => r.id === id);
        if (row) {
            document.getElementById('tx-id').value = row.id;
            document.getElementById('tx-group').value = row.group || '适配中';
            document.getElementById('tx-game-name').value = row.game_name || '';
            document.getElementById('tx-download-status').value = row.download_status || '';
            document.getElementById('tx-reservation').value = row.reservation || '';
            document.getElementById('tx-progress-status').value = row.progress_status || '';
            document.getElementById('tx-notes').value = row.notes || '';
        }
    }
    openModal('tx-game-modal');
}

function editTxGame(id) { openTxGameModal(id); }

function submitTxGameForm(event) {
    event.preventDefault();
    const id = document.getElementById('tx-id').value;
    const payload = {
        group: document.getElementById('tx-group').value,
        game_name: document.getElementById('tx-game-name').value.trim(),
        download_status: document.getElementById('tx-download-status').value,
        reservation: document.getElementById('tx-reservation').value.trim(),
        progress_status: document.getElementById('tx-progress-status').value,
        notes: document.getElementById('tx-notes').value.trim()
    };
    if (!payload.game_name) { if (typeof showToast === 'function') showToast('请输入游戏名称', 'warning'); return; }

    if (id) {
        const row = allTxGamesData.find(r => r.id === Number(id));
        if (row) Object.assign(row, payload);
    } else {
        const newId = (allTxGamesData.reduce((m, r) => Math.max(m, r.id), 0) || 0) + 1;
        allTxGamesData.push(Object.assign({ id: newId }, payload));
    }
    saveTxGamesLocal();
    closeModal('tx-game-modal');
    if (typeof showToast === 'function') showToast(id ? '更新成功' : '创建成功', 'success');
    filterTxGames();
}

async function deleteTxGame(id) {
    const ok = (typeof uiConfirm === 'function')
        ? await uiConfirm('确定要删除这条记录吗？', { danger: true, okText: '删除' })
        : confirm('确定要删除这条记录吗？');
    if (!ok) return;
    allTxGamesData = allTxGamesData.filter(r => r.id !== id);
    saveTxGamesLocal();
    if (typeof showToast === 'function') showToast('已删除', 'success');
    filterTxGames();
}
