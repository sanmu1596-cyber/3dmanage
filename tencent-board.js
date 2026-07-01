/**
 * 腾讯系游戏开发进展 看板 — 后端 API
 * ============================================================
 * 表结构（server.js 启动时自动建表）：
 *   tx_board_groups  分组：id, group_key, title, cols(JSON数组), sort_order
 *   tx_board_rows    行：  id, group_id, cells(JSON数组), sort_order
 *   tx_board_meta    配置：单行，key='board'，value(JSON: {colWidths:[], rowHeights:{}})
 *
 * 设计：整板一次性 GET 返回；编辑走结构化接口（单格/行/分组）。
 * 权限：复用 'bugs' 资源（与游戏问题同级），无则放行（开发模式 auth 自动跳过）。
 * ============================================================
 */
const express = require('express');
const db = require('./database');
const auth = require('./auth');
const router = express.Router();

router.use(auth.verifyToken);

const J = (v, fallback) => { try { return JSON.parse(v); } catch { return fallback; } };

// ★ 看板标识：支持多块看板共用同一套表（board 列区分）。默认 'tencent' 兼容老数据。
//   - tencent  → 腾讯系游戏开发进展（4分组）
//   - customer → 各客户适配进展（单分组5列）
const boardOf = (req) => {
  const b = (req.query.board || req.body.board || 'tencent');
  return String(b).replace(/[^a-z0-9_-]/gi, '') || 'tencent';
};
const metaKeyOf = (board) => 'board:' + board;

// ============ 获取整张看板 ============
router.get('/', (req, res) => {
  const board = boardOf(req);
  db.all('SELECT * FROM tx_board_groups WHERE board = ? ORDER BY sort_order ASC, id ASC', [board], (err, groups) => {
    if (err) return res.status(500).json({ error: err.message });
    const gids = groups.map(g => g.id);
    const rowsSql = gids.length
      ? `SELECT * FROM tx_board_rows WHERE group_id IN (${gids.map(() => '?').join(',')}) ORDER BY sort_order ASC, id ASC`
      : 'SELECT * FROM tx_board_rows WHERE 0 ORDER BY sort_order ASC, id ASC';
    db.all(rowsSql, gids, (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.get('SELECT value FROM tx_board_meta WHERE key = ?', [metaKeyOf(board)], (err3, metaRow) => {
        const meta = metaRow ? J(metaRow.value, {}) : {};
        const groupMap = {};
        const out = groups.map(g => {
          const obj = {
            id: g.id,
            key: g.group_key,
            title: g.title,
            cols: J(g.cols, []),
            rows: []
          };
          groupMap[g.id] = obj;
          return obj;
        });
        rows.forEach(r => {
          const grp = groupMap[r.group_id];
          if (grp) grp.rows.push({ id: r.id, cells: J(r.cells, []), fills: J(r.fills, []), aligns: J(r.aligns, []), valigns: J(r.valigns, []) });
        });
        res.json({ groups: out, meta });
      });
    });
  });
});

// ============ 种子初始化（仅当该看板空表时写入） ============
router.post('/init-seed', (req, res) => {
  const board = boardOf(req);
  const seed = req.body && Array.isArray(req.body.groups) ? req.body.groups : null;
  if (!seed) return res.status(400).json({ error: '缺少种子数据' });
  db.get('SELECT COUNT(*) AS cnt FROM tx_board_groups WHERE board = ?', [board], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.cnt > 0) return res.json({ success: true, skipped: true }); // 已有数据不覆盖
    db.serialize(() => {
      const gStmt = db.prepare('INSERT INTO tx_board_groups (board, group_key, title, cols, sort_order) VALUES (?, ?, ?, ?, ?)');
      let pending = seed.length;
      if (pending === 0) return res.json({ success: true });
      seed.forEach((g, gi) => {
        gStmt.run([board, g.key || g.title, g.title || '', JSON.stringify(g.cols || []), gi], function (e) {
          if (e) { return; }
          const groupId = this.lastID;
          const rws = g.rows || [];
          if (rws.length) {
            const rStmt = db.prepare('INSERT INTO tx_board_rows (group_id, cells, sort_order) VALUES (?, ?, ?)');
            rws.forEach((cells, ri) => rStmt.run([groupId, JSON.stringify(cells), ri]));
            rStmt.finalize();
          }
          if (--pending === 0) { gStmt.finalize(); res.json({ success: true }); }
        });
      });
    });
  });
});

// ============ 单元格更新（行内编辑自动保存） ============
// body: { rowId, colIndex, value }
router.patch('/cell', (req, res) => {
  const { rowId, colIndex, value } = req.body;
  if (rowId == null || colIndex == null) return res.status(400).json({ error: '缺少 rowId/colIndex' });
  db.get('SELECT cells FROM tx_board_rows WHERE id = ?', [rowId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '行不存在' });
    const cells = J(row.cells, []);
    while (cells.length <= colIndex) cells.push('');
    cells[colIndex] = value == null ? '' : String(value);
    db.run('UPDATE tx_board_rows SET cells = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(cells), rowId], function (e) {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
      });
  });
});

// ============ 单元格填充色更新 ============
// body: { rowId, colIndex, color }  (color 为空字符串则清除该格填充)
router.patch('/fill', (req, res) => {
  const { rowId, colIndex, color } = req.body;
  if (rowId == null || colIndex == null) return res.status(400).json({ error: '缺少 rowId/colIndex' });
  db.get('SELECT fills FROM tx_board_rows WHERE id = ?', [rowId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '行不存在' });
    const fills = J(row.fills, []);
    while (fills.length <= colIndex) fills.push('');
    fills[colIndex] = color == null ? '' : String(color);
    db.run('UPDATE tx_board_rows SET fills = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(fills), rowId], function (e) {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
      });
  });
});

// ============ 单元格对齐更新 ============
// body: { rowId, colIndex, axis: 'h'|'v', value }
//   axis='h' → aligns（left/center/right，空则清除）
//   axis='v' → valigns（top/middle/bottom，空则清除）
router.patch('/align', (req, res) => {
  const { rowId, colIndex, axis, value } = req.body;
  if (rowId == null || colIndex == null) return res.status(400).json({ error: '缺少 rowId/colIndex' });
  const col = axis === 'v' ? 'valigns' : 'aligns';
  db.get(`SELECT ${col} FROM tx_board_rows WHERE id = ?`, [rowId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '行不存在' });
    const arr = J(row[col], []);
    while (arr.length <= colIndex) arr.push('');
    arr[colIndex] = value == null ? '' : String(value);
    db.run(`UPDATE tx_board_rows SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [JSON.stringify(arr), rowId], function (e) {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
      });
  });
});

// ============ 追加一行 ============
// body: { groupId, cells? }
router.post('/row', (req, res) => {
  const { groupId, cells } = req.body;
  if (groupId == null) return res.status(400).json({ error: '缺少 groupId' });
  db.get('SELECT MAX(sort_order) AS m FROM tx_board_rows WHERE group_id = ?', [groupId], (err, r) => {
    const nextOrder = (r && r.m != null ? r.m : -1) + 1;
    db.run('INSERT INTO tx_board_rows (group_id, cells, sort_order) VALUES (?, ?, ?)',
      [groupId, JSON.stringify(cells || []), nextOrder], function (e) {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true, id: this.lastID });
      });
  });
});

// ============ 删除一行 ============
router.delete('/row/:id', (req, res) => {
  db.run('DELETE FROM tx_board_rows WHERE id = ?', [req.params.id], function (e) {
    if (e) return res.status(500).json({ error: e.message });
    res.json({ success: true });
  });
});

// ============ 新增分组（创建新子表格块） ============
// body: { title, cols:[列名...], rows?:[[c0,c1],...] }
router.post('/group', (req, res) => {
  const board = boardOf(req);
  const title = (req.body && req.body.title != null) ? String(req.body.title).trim() : '';
  let cols = (req.body && Array.isArray(req.body.cols)) ? req.body.cols.map(c => String(c || '').trim()).filter(Boolean) : [];
  if (!title) return res.status(400).json({ error: '分组标题不能为空' });
  if (!cols.length) cols = ['游戏名称', '备注']; // 兜底默认两列
  const initRows = (req.body && Array.isArray(req.body.rows)) ? req.body.rows : [];
  const groupKey = title + '_' + Date.now();
  db.get('SELECT MAX(sort_order) AS m FROM tx_board_groups WHERE board = ?', [board], (err, r) => {
    if (err) return res.status(500).json({ error: err.message });
    const nextOrder = (r && r.m != null ? r.m : -1) + 1;
    db.run('INSERT INTO tx_board_groups (board, group_key, title, cols, sort_order) VALUES (?, ?, ?, ?, ?)',
      [board, groupKey, title, JSON.stringify(cols), nextOrder], function (e) {
        if (e) return res.status(500).json({ error: e.message });
        const groupId = this.lastID;
        // 写入初始行（若提供）；否则给一个空行方便直接编辑
        const rowsToInsert = initRows.length ? initRows : [cols.map(() => '')];
        const rStmt = db.prepare('INSERT INTO tx_board_rows (group_id, cells, sort_order) VALUES (?, ?, ?)');
        rowsToInsert.forEach((cells, ri) => rStmt.run([groupId, JSON.stringify(cells || []), ri]));
        rStmt.finalize((fe) => {
          if (fe) return res.status(500).json({ error: fe.message });
          res.json({ success: true, id: groupId, key: groupKey });
        });
      });
  });
});

// ============ 删除分组（连带删除其所有行） ============
router.delete('/group/:id', (req, res) => {
  const gid = req.params.id;
  db.serialize(() => {
    db.run('DELETE FROM tx_board_rows WHERE group_id = ?', [gid]);
    db.run('DELETE FROM tx_board_groups WHERE id = ?', [gid], function (e) {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true });
    });
  });
});

// ============ 更新分组标题 / 列名 ============
// body: { title? , cols? }
router.patch('/group/:id', (req, res) => {
  const { title, cols } = req.body;
  const sets = [], vals = [];
  if (title != null) { sets.push('title = ?'); vals.push(String(title)); }
  if (cols != null) { sets.push('cols = ?'); vals.push(JSON.stringify(cols)); }
  if (!sets.length) return res.status(400).json({ error: '没有可更新的字段' });
  vals.push(req.params.id);
  db.run(`UPDATE tx_board_groups SET ${sets.join(', ')} WHERE id = ?`, vals, function (e) {
    if (e) return res.status(500).json({ error: e.message });
    res.json({ success: true });
  });
});

// ============ 删除分组内的单列（连带删除所有行对应单元格） ============
// DELETE /group/:id/col/:ci  —— ci 为列索引；事务内删 cols[ci] + 每行 cells[ci]
router.delete('/group/:id/col/:ci', (req, res) => {
  const gid = req.params.id;
  const ci = parseInt(req.params.ci, 10);
  if (isNaN(ci) || ci < 0) return res.status(400).json({ error: '列索引无效' });
  db.get('SELECT cols FROM tx_board_groups WHERE id = ?', [gid], (err, g) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!g) return res.status(404).json({ error: '分组不存在' });
    const cols = J(g.cols, []);
    if (ci >= cols.length) return res.status(400).json({ error: '列索引超出范围' });
    if (cols.length <= 1) return res.status(400).json({ error: '至少保留 1 列，无法删除' });
    cols.splice(ci, 1);
    db.all('SELECT id, cells FROM tx_board_rows WHERE group_id = ?', [gid], (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.serialize(() => {
        db.run('BEGIN');
        db.run('UPDATE tx_board_groups SET cols = ? WHERE id = ?', [JSON.stringify(cols), gid]);
        const rStmt = db.prepare('UPDATE tx_board_rows SET cells = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        (rows || []).forEach(r => {
          const cells = J(r.cells, []);
          if (ci < cells.length) cells.splice(ci, 1);
          rStmt.run([JSON.stringify(cells), r.id]);
        });
        rStmt.finalize();
        db.run('COMMIT', (ce) => {
          if (ce) return res.status(500).json({ error: ce.message });
          res.json({ success: true, cols });
        });
      });
    });
  });
});

// ============ 保存看板配置（列宽/行高等） ============
// body: { colWidths?, rowHeights? }  — 整体覆盖式存 JSON（按 board 区分）
router.put('/meta', (req, res) => {
  const board = boardOf(req);
  const payload = Object.assign({}, req.body); delete payload.board;
  const value = JSON.stringify(payload || {});
  db.run(`INSERT INTO tx_board_meta (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [metaKeyOf(board), value], function (e) {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true });
    });
});

// ============ 重置（清空该看板，前端随后会重新 init-seed） ============
router.post('/reset', (req, res) => {
  const board = boardOf(req);
  db.serialize(() => {
    db.run('DELETE FROM tx_board_rows WHERE group_id IN (SELECT id FROM tx_board_groups WHERE board = ?)', [board]);
    db.run('DELETE FROM tx_board_groups WHERE board = ?', [board]);
    db.run('DELETE FROM tx_board_meta WHERE key = ?', [metaKeyOf(board)], function (e) {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true });
    });
  });
});

// ============================================================
// 看板注册表（报表子标签）：列表 / 新增 / 改名改图标 / 删除 / 排序
// ============================================================

// ---- 看板列表（按 sort_order 升序） ----
router.get('/boards', (req, res) => {
  db.all('SELECT board_key AS key, title, icon, kind, locked, sort_order FROM tx_boards ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ boards: (rows || []).map(r => ({ key: r.key, title: r.title, icon: r.icon || '📋', kind: r.kind || 'board', locked: !!r.locked })) });
  });
});

// ---- 新增看板（生成唯一 board_key，返回 key） ----
//   kind: 'richtext'(默认,新建标签=一块富文本) | 'board'(表格分组看板) | 'dashboard'(锁定)
router.post('/boards', (req, res) => {
  const title = (req.body && req.body.title || '').trim();
  const icon = (req.body && req.body.icon || '📋').trim() || '📋';
  let kind = (req.body && req.body.kind || 'richtext').trim();
  if (kind !== 'board' && kind !== 'richtext') kind = 'richtext'; // dashboard 只能内置
  if (!title) return res.status(400).json({ error: '看板名称不能为空' });
  const key = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  db.get('SELECT MAX(sort_order) AS mx FROM tx_boards WHERE locked = 0', [], (e0, r0) => {
    const nextSort = (r0 && typeof r0.mx === 'number' ? r0.mx : 0) + 1;
    db.run('INSERT INTO tx_boards (board_key, title, icon, kind, locked, sort_order) VALUES (?, ?, ?, ?, 0, ?)',
      [key, title, icon, kind, nextSort], function (e) {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true, key, title, icon, kind });
      });
  });
});

// ---- 富文本看板内容：读 / 写（存 tx_board_meta，key=richtext:<board>） ----
const rtKeyOf = (board) => 'richtext:' + String(board).replace(/[^a-z0-9_-]/gi, '');
router.get('/boards/:key/richtext', (req, res) => {
  const key = String(req.params.key);
  db.get('SELECT value FROM tx_board_meta WHERE key = ?', [rtKeyOf(key)], (e, row) => {
    if (e) return res.status(500).json({ error: e.message });
    res.json({ success: true, html: (row && row.value) || '' });
  });
});
router.put('/boards/:key/richtext', (req, res) => {
  const key = String(req.params.key);
  const html = (req.body && typeof req.body.html === 'string') ? req.body.html : '';
  db.run(`INSERT INTO tx_board_meta (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [rtKeyOf(key), html], function (e) {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true });
    });
});

// ---- 改名 / 改图标 ----
router.patch('/boards/:key', (req, res) => {
  const key = String(req.params.key);
  db.get('SELECT locked FROM tx_boards WHERE board_key = ?', [key], (e0, row) => {
    if (e0) return res.status(500).json({ error: e0.message });
    if (!row) return res.status(404).json({ error: '看板不存在' });
    if (row.locked) return res.status(403).json({ error: '该看板已锁定，不可修改' });
    const sets = [], vals = [];
    if (typeof req.body.title === 'string' && req.body.title.trim()) { sets.push('title = ?'); vals.push(req.body.title.trim()); }
    if (typeof req.body.icon === 'string' && req.body.icon.trim()) { sets.push('icon = ?'); vals.push(req.body.icon.trim()); }
    if (!sets.length) return res.status(400).json({ error: '没有可更新的字段' });
    vals.push(key);
    db.run('UPDATE tx_boards SET ' + sets.join(', ') + ' WHERE board_key = ?', vals, function (e) {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true });
    });
  });
});

// ---- 删除看板（彻底删除：注册项 + 该 board 全部 groups/rows/meta） ----
router.delete('/boards/:key', (req, res) => {
  const key = String(req.params.key);
  db.get('SELECT locked FROM tx_boards WHERE board_key = ?', [key], (e0, row) => {
    if (e0) return res.status(500).json({ error: e0.message });
    if (!row) return res.status(404).json({ error: '看板不存在' });
    if (row.locked) return res.status(403).json({ error: '该看板已锁定，不可删除' });
    db.serialize(() => {
      db.run('DELETE FROM tx_board_rows WHERE group_id IN (SELECT id FROM tx_board_groups WHERE board = ?)', [key]);
      db.run('DELETE FROM tx_board_groups WHERE board = ?', [key]);
      db.run('DELETE FROM tx_board_meta WHERE key = ?', [metaKeyOf(key)]);
      db.run('DELETE FROM tx_board_meta WHERE key = ?', ['richtext:' + String(key).replace(/[^a-z0-9_-]/gi, '')]);
      db.run('DELETE FROM tx_boards WHERE board_key = ?', [key], function (e) {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
      });
    });
  });
});

// ---- 排序（拖拽后整体提交有序 key 数组，locked 项不参与但保持其位置值不变） ----
router.put('/boards/reorder', (req, res) => {
  const keys = Array.isArray(req.body && req.body.keys) ? req.body.keys : null;
  if (!keys) return res.status(400).json({ error: '缺少 keys 数组' });
  db.serialize(() => {
    const stmt = db.prepare('UPDATE tx_boards SET sort_order = ? WHERE board_key = ? AND locked = 0');
    keys.forEach((k, i) => stmt.run(i, String(k)));
    stmt.finalize((e) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true });
    });
  });
});

module.exports = router;
