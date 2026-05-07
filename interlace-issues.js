/**
 * 交织问题管理 API
 */
const express = require('express');
const db = require('./database');
const auth = require('./auth');
const router = express.Router();

// 所有路由需要认证（开发模式自动跳过）
router.use(auth.verifyToken);

// 获取交织问题列表
router.get('/', auth.checkPermission('bugs', 'view'), (req, res) => {
  const { search, status, issue_type, priority } = req.query;
  let sql = 'SELECT * FROM interlace_issues WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (issue_desc LIKE ? OR owner LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (issue_type) { sql += ' AND issue_type = ?'; params.push(issue_type); }
  if (priority) { sql += ' AND priority = ?'; params.push(priority); }
  sql += ' ORDER BY created_at DESC';
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取单个交织问题
router.get('/:id', auth.checkPermission('bugs', 'view'), (req, res) => {
  db.get('SELECT * FROM interlace_issues WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!row) return res.status(404).json({ success: false, error: '问题不存在' });
    res.json({ success: true, data: row });
  });
});

// 创建交织问题
router.post('/', auth.checkPermission('bugs', 'create'), (req, res) => {
  const { issue_type, version, priority, issue_desc, owner, status, remarks } = req.body;
  if (!issue_type || !issue_desc || !owner) {
    return res.status(400).json({ success: false, error: '缺少必填项' });
  }
  
  const sql = `INSERT INTO interlace_issues (issue_type, version, priority, issue_desc, owner, status, remarks, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
  db.run(sql, [issue_type, version || '', priority || '', issue_desc, owner, status || '待处理', remarks || ''], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

// 更新交织问题
router.put('/:id', auth.checkPermission('bugs', 'edit'), (req, res) => {
  const { issue_type, version, priority, issue_desc, owner, status, remarks } = req.body;
  const sql = `UPDATE interlace_issues SET issue_type = ?, version = ?, priority = ?, issue_desc = ?, owner = ?, status = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, [issue_type, version, priority, issue_desc, owner, status, remarks, req.params.id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

// 删除交织问题
router.delete('/:id', auth.checkPermission('bugs', 'delete'), (req, res) => {
  db.run('DELETE FROM interlace_issues WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;
