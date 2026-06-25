/**
 * FAQ 知识库 API (P2-1)
 * 客户常见问题 + 快速解决方案，供 TPM/测试人员快速查询
 */
const express = require('express');
const db = require('./database');
const auth = require('./auth');
const router = express.Router();

// 所有路由需要认证（开发模式自动跳过）
router.use(auth.verifyToken);

// 获取 FAQ 列表（支持关键词搜索、分类筛选）
router.get('/', auth.checkPermission('bugs', 'view'), (req, res) => {
  const { search, category } = req.query;
  let sql = 'SELECT * FROM faqs WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (question LIKE ? OR answer LIKE ? OR keywords LIKE ?)';
    const kw = '%' + search + '%';
    params.push(kw, kw, kw);
  }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  // 置顶优先，其次按浏览量、更新时间
  sql += ' ORDER BY is_pinned DESC, view_count DESC, updated_at DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取所有分类及其条目数（用于左侧分类标签）
router.get('/categories', auth.checkPermission('bugs', 'view'), (req, res) => {
  const sql = `SELECT category, COUNT(*) AS count FROM faqs
               WHERE category IS NOT NULL AND category != ''
               GROUP BY category ORDER BY count DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取单个 FAQ（并自增浏览量）
router.get('/:id', auth.checkPermission('bugs', 'view'), (req, res) => {
  db.get('SELECT * FROM faqs WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!row) return res.status(404).json({ success: false, error: 'FAQ不存在' });
    db.run('UPDATE faqs SET view_count = view_count + 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: row });
  });
});

// 创建 FAQ
router.post('/', auth.checkPermission('bugs', 'create'), (req, res) => {
  const { category, question, answer, keywords, is_pinned } = req.body;
  if (!question || !answer) {
    return res.status(400).json({ success: false, error: '问题和解决方案为必填项' });
  }
  const author = (req.user && (req.user.name || req.user.username)) || '系统';
  const sql = `INSERT INTO faqs (category, question, answer, keywords, is_pinned, author, view_count, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
  db.run(sql, [category || '未分类', question, answer, keywords || '', is_pinned ? 1 : 0, author], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

// 更新 FAQ
router.put('/:id', auth.checkPermission('bugs', 'edit'), (req, res) => {
  const { category, question, answer, keywords, is_pinned } = req.body;
  const sql = `UPDATE faqs SET category = ?, question = ?, answer = ?, keywords = ?, is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, [category || '未分类', question, answer, keywords || '', is_pinned ? 1 : 0, req.params.id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

// 切换置顶
router.patch('/:id/pin', auth.checkPermission('bugs', 'edit'), (req, res) => {
  db.run('UPDATE faqs SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [req.params.id], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    });
});

// 删除 FAQ
router.delete('/:id', auth.checkPermission('bugs', 'delete'), (req, res) => {
  db.run('DELETE FROM faqs WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;
