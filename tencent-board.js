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

// ============ 获取整张看板 ============
router.get('/', (req, res) => {
  db.all('SELECT * FROM tx_board_groups ORDER BY sort_order ASC, id ASC', [], (err, groups) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all('SELECT * FROM tx_board_rows ORDER BY sort_order ASC, id ASC', [], (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.get("SELECT value FROM tx_board_meta WHERE key = 'board'", [], (err3, metaRow) => {
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
          if (grp) grp.rows.push({ id: r.id, cells: J(r.cells, []), fills: J(r.fills, []) });
        });
        res.json({ groups: out, meta });
      });
    });
  });
});

// ============ 种子初始化（仅当空表时写入） ============
router.post('/init-seed', (req, res) => {
  const seed = req.body && Array.isArray(req.body.groups) ? req.body.groups : null;
  if (!seed) return res.status(400).json({ error: '缺少种子数据' });
  db.get('SELECT COUNT(*) AS cnt FROM tx_board_groups', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.cnt > 0) return res.json({ success: true, skipped: true }); // 已有数据不覆盖
    db.serialize(() => {
      const gStmt = db.prepare('INSERT INTO tx_board_groups (group_key, title, cols, sort_order) VALUES (?, ?, ?, ?)');
      let pending = seed.length;
      if (pending === 0) return res.json({ success: true });
      seed.forEach((g, gi) => {
        gStmt.run([g.key || g.title, g.title || '', JSON.stringify(g.cols || []), gi], function (e) {
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

// ============ 保存看板配置（列宽/行高等） ============
// body: { colWidths?, rowHeights? }  — 整体覆盖式存 JSON
router.put('/meta', (req, res) => {
  const value = JSON.stringify(req.body || {});
  db.run(`INSERT INTO tx_board_meta (key, value, updated_at) VALUES ('board', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [value], function (e) {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true });
    });
});

// ============ 重置（清空所有，前端随后会重新 init-seed） ============
router.post('/reset', (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM tx_board_rows');
    db.run('DELETE FROM tx_board_groups');
    db.run("DELETE FROM tx_board_meta WHERE key = 'board'", function (e) {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true });
    });
  });
});

module.exports = router;
