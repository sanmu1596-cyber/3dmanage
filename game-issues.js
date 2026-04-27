const express = require('express');
const db = require('./database');
const auth = require('./auth');
const router = express.Router();

// 获取游戏问题列表
router.get('/', auth.checkPermission('bugs', 'view'), (req, res) => {
  const { search, status, issue_type, priority } = req.query;
  let sql = 'SELECT * FROM game_issues WHERE 1=1';
  const params = [];
  if (search) { sql += ' AND (game_name LIKE ? OR issue_desc LIKE ? OR owner LIKE ?)'; params.push('%'+search+'%', '%'+search+'%', '%'+search+'%'); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (issue_type) { sql += ' AND issue_type = ?'; params.push(issue_type); }
  if (priority) { sql += ' AND priority = ?'; params.push(priority); }
  sql += ' ORDER BY created_at DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 创建游戏问题
router.post('/', auth.checkPermission('bugs', 'create'), (req, res) => {
  const { game_name, issue_type, priority, issue_desc, owner, status, remarks } = req.body;
  if (!game_name || !issue_desc || !owner) return res.status(400).json({ error: '缺少必填项' });
  const sql = `INSERT INTO game_issues (game_name, issue_type, priority, issue_desc, owner, status, remarks, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
  db.run(sql, [game_name, issue_type||'', priority||'', issue_desc, owner, status||'待处理', remarks||''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

// 更新游戏问题
router.put('/:id', auth.checkPermission('bugs', 'edit'), (req, res) => {
  const { game_name, issue_type, priority, issue_desc, owner, status, remarks } = req.body;
  const sql = `UPDATE game_issues SET game_name=?, issue_type=?, priority=?, issue_desc=?, owner=?, status=?, remarks=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`;
  db.run(sql, [game_name, issue_type, priority, issue_desc, owner, status, remarks, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 删除游戏问题
router.delete('/:id', auth.checkPermission('bugs', 'delete'), (req, res) => {
  db.run('DELETE FROM game_issues WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;
