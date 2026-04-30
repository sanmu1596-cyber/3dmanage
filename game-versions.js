/**
 * 游戏版本管理 API
 */
const express = require('express');
const db = require('./database');
const auth = require('./auth');
const router = express.Router();

// 获取游戏版本列表
router.get('/', auth.checkPermission('games', 'view'), (req, res) => {
  const { search, status, game_id } = req.query;
  let sql = `SELECT gv.*, g.name as game_name FROM game_versions gv
             LEFT JOIN games g ON gv.game_id = g.id WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ' AND (gv.version_number LIKE ? OR g.name LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  if (status) { sql += ' AND gv.status = ?'; params.push(status); }
  if (game_id) { sql += ' AND gv.game_id = ?'; params.push(game_id); }
  sql += ' ORDER BY gv.created_at DESC';
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取单个游戏版本
router.get('/:id', auth.checkPermission('games', 'view'), (req, res) => {
  const sql = `SELECT gv.*, g.name as game_name FROM game_versions gv
               LEFT JOIN games g ON gv.game_id = g.id WHERE gv.id = ?`;
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!row) return res.status(404).json({ success: false, error: '版本不存在' });
    res.json({ success: true, data: row });
  });
});

// 创建游戏版本
router.post('/', auth.checkPermission('games', 'edit'), (req, res) => {
  const { game_id, version_number, status, version_date, changelog, notes } = req.body;
  if (!game_id || !version_number) {
    return res.status(400).json({ success: false, error: '缺少必填项' });
  }
  
  // 获取游戏名称
  db.get('SELECT name FROM games WHERE id = ?', [game_id], (err, game) => {
    const gameName = game ? game.name : '';
    const sql = `INSERT INTO game_versions (game_id, game_name, version_number, status, version_date, changelog, notes, updater_id, updater_name, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
    db.run(sql, [game_id, gameName, version_number, status || 'testing', version_date || '', changelog || '', notes || '', req.user?.id || null, req.user?.name || ''], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, id: this.lastID });
    });
  });
});

// 更新游戏版本
router.put('/:id', auth.checkPermission('games', 'edit'), (req, res) => {
  const { game_id, version_number, status, version_date, changelog, notes } = req.body;
  
  // 如果只是更新状态
  if (status && !game_id && !version_number) {
    const sql = `UPDATE game_versions SET status = ?, updater_id = ?, updater_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    return db.run(sql, [status, req.user?.id || null, req.user?.name || '', req.params.id], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    });
  }
  
  // 获取游戏名称
  db.get('SELECT name FROM games WHERE id = ?', [game_id], (err, game) => {
    const gameName = game ? game.name : '';
    const sql = `UPDATE game_versions SET game_id = ?, game_name = ?, version_number = ?, status = ?, version_date = ?, changelog = ?, notes = ?, updater_id = ?, updater_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(sql, [game_id, gameName, version_number, status, version_date, changelog, notes, req.user?.id || null, req.user?.name || '', req.params.id], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    });
  });
});

// 删除游戏版本
router.delete('/:id', auth.checkPermission('games', 'delete'), (req, res) => {
  db.run('DELETE FROM game_versions WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;
