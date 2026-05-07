/**
 * 交织版本管理 API
 */
const express = require('express');
const db = require('./database');
const auth = require('./auth');
const router = express.Router();

// 所有路由需要认证（开发模式自动跳过）
router.use(auth.verifyToken);

// 获取交织版本列表
router.get('/', auth.checkPermission('devices', 'view'), (req, res) => {
  const { search, status } = req.query;
  let sql = 'SELECT * FROM interlace_versions WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND version_number LIKE ?';
    params.push('%' + search + '%');
  }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取单个交织版本
router.get('/:id', auth.checkPermission('devices', 'view'), (req, res) => {
  db.get('SELECT * FROM interlace_versions WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!row) return res.status(404).json({ success: false, error: '版本不存在' });
    res.json({ success: true, data: row });
  });
});

// 创建交织版本
router.post('/', auth.checkPermission('devices', 'edit'), (req, res) => {
  const { version_number, status, version_date, changelog, notes } = req.body;
  if (!version_number) {
    return res.status(400).json({ success: false, error: '缺少版本号' });
  }
  
  const sql = `INSERT INTO interlace_versions (version_number, status, version_date, changelog, notes, updater_id, updater_name, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
  db.run(sql, [version_number, status || 'testing', version_date || '', changelog || '', notes || '', req.user?.id || null, req.user?.name || ''], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

// 更新交织版本
router.put('/:id', auth.checkPermission('devices', 'edit'), (req, res) => {
  const { version_number, status, version_date, changelog, notes } = req.body;
  
  // 如果只是更新状态
  if (status && !version_number) {
    const sql = `UPDATE interlace_versions SET status = ?, updater_id = ?, updater_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    return db.run(sql, [status, req.user?.id || null, req.user?.name || '', req.params.id], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    });
  }
  
  const sql = `UPDATE interlace_versions SET version_number = ?, status = ?, version_date = ?, changelog = ?, notes = ?, updater_id = ?, updater_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, [version_number, status, version_date, changelog, notes, req.user?.id || null, req.user?.name || '', req.params.id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

// 删除交织版本
router.delete('/:id', auth.checkPermission('devices', 'delete'), (req, res) => {
  db.run('DELETE FROM interlace_versions WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;
