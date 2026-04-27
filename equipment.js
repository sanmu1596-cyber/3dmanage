const express = require('express');
const db = require('./database');
const auth = require('./auth');
const router = express.Router();

// 获取设备列表
router.get('/', auth.checkPermission('devices', 'view'), (req, res) => {
  const { search, keeper } = req.query;
  let sql = 'SELECT * FROM equipment WHERE 1=1';
  const params = [];
  if (search) { sql += ' AND (name LIKE ? OR equipment_no LIKE ? OR remarks LIKE ?)'; params.push('%'+search+'%', '%'+search+'%', '%'+search+'%'); }
  if (keeper) { sql += ' AND keeper = ?'; params.push(keeper); }
  sql += ' ORDER BY created_at DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 创建设备
router.post('/', auth.checkPermission('devices', 'create'), (req, res) => {
  const { name, equipment_no, keeper, date, remarks } = req.body;
  if (!name) return res.status(400).json({ error: '设备名称不能为空' });
  const sql = 'INSERT INTO equipment (name, equipment_no, keeper, date, remarks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)';
  db.run(sql, [name, equipment_no, keeper, date || new Date().toISOString().slice(0,10), remarks], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

// 更新设备
router.put('/:id', auth.checkPermission('devices', 'edit'), (req, res) => {
  const { name, equipment_no, keeper, date, remarks } = req.body;
  const sql = 'UPDATE equipment SET name=?, equipment_no=?, keeper=?, date=?, remarks=?, updated_at=CURRENT_TIMESTAMP WHERE id=?';
  db.run(sql, [name, equipment_no, keeper, date, remarks, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 删除设备
router.delete('/:id', auth.checkPermission('devices', 'delete'), (req, res) => {
  db.run('DELETE FROM equipment WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;
