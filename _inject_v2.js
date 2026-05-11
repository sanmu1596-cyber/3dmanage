/**
 * 安全注入脚本 v2 — 从文件读取代码片段再拼接
 */
const fs = require('fs');

// 1. 恢复原始server.js
console.log('步骤1: 检查当前状态...');
let content = fs.readFileSync('server.js', 'utf8');

// 2. 定义要插入的代码（用普通字符串拼接避免反引号嵌套）
const part1 = fs.readFileSync('_p0_part1.js', 'utf8');

const part2 = [
  '',
  '// ==================== 评论 API ====================',
  "const commentsRouter = express.Router();",
  "commentsRouter.use(auth.verifyToken);",
  '',
  "commentsRouter.get('/', (req, res) => {",
  '  const { entity_type, entity_id } = req.query;',
  "  if (!entity_type || !entity_id) return res.status(400).json({ error: '\u7F3A\u5C11entity_type\u6216entity_id' });",
  "  db.all(`SELECT c.*, u.real_name as user_name FROM comments c LEFT JOIN users u ON c.user_id = u.id` +",
  "          ` WHERE c.entity_type = ? AND c.entity_id = ? ORDER BY c.created_at ASC`,",
  '    [entity_type, entity_id], (err, rows) => {',
  '    if (err) return res.status(500).json({ error: err.message });',
  "    res.json({ success: true, data: rows });",
  '  });',
  '});',
  '',
  "commentsRouter.post('/', (req, res) => {",
  '  const { entity_type, entity_id, content } = req.body;',
  "  if (!entity_type || !entity_id || !content) return res.status(400).json({ error: '\u53C2\u6570\u4E0D\u5B8C\u6574' });",
  "  const mentionIds = (content.match(/@\\d+/g) || []).map(m => parseInt(m.substring(1)));",
  '  const userId = req.user ? req.user.id : null;',
  "  db.run(`INSERT INTO comments (entity_type, entity_id, user_id, content, mentions) VALUES (?, ?, ?, ?, ?)`,",
  '    [entity_type, entity_id, userId, content, JSON.stringify(mentionIds)],',
  '    function(err) {',
  '      if (err) return res.status(500).json({ error: err.message });',
  '      mentionIds.forEach(uid => {',
  "        if (uid !== userId) createNotification(uid, 'comment_mention', '\u6709\u4EBA\u5728\u8BC4\u8BBA\u4E2D\u63D0\u5230\u4E86\u4F60',",
  "          (req.user.real_name || req.user.username) + ' \u5728\u4E00\u6761\u8BB0\u5F55\u7684\u8BC4\u8BBA\u4E2D\u63D0\u5230\u4E86\u4F60', entity_type, parseInt(entity_id));",
  '      });',
  '      notifyEntityOwner(entity_type, entity_id, userId,',
  "        (req.user.real_name || req.user.username) + ' \u53D1\u8868\u4E86\u4E00\u6761\u65B0\u8BC4\u8BBA');",
  "      res.json({ success: true, id: this.lastID });",
  '    });',
  '});',
  '',
  "commentsRouter.delete('/:id', (req, res) => {",
  "  db.get(\"SELECT * FROM comments WHERE id = ?\", [req.params.id], (err, row) => {",
  "    if (err || !row) return res.status(404).json({ error: '\u8BC4\u8BBA\u4E0D\u5B58\u5728' });",
  "    if (!req.user.is_super_admin && row.user_id !== req.user.id) return res.status(403).json({ error: '\u65E0\u6743\u5220\u9664\u6B64\u8BC4\u8BBA' });",
  "    db.run(\"DELETE FROM comments WHERE id = ?\", [req.params.id], function(e) {",
  '      if (e) return res.status(500).json({ error: e.message });',
  "      res.json({ success: true });",
  '    });',
  '  });',
  '});',
].join('\n');

const part3 = [
  '',
  '// ==================== 管理者看板 API ====================',
  "statsRouter.get('/admin-dashboard', auth.checkPermission('user_management', 'view'), (req, res) => {",
  "  db.all(`SELECT ua.id as pm_id, ua.real_name as pm_name,",
  "            COUNT(DISTINCT r.id) as total_requirements,",
  "            SUM(CASE WHEN r.status IN ('draft','assigned') THEN 1 ELSE 0 END) as pending_reqs,",
  "            SUM(CASE WHEN r.status IN ('planned','in_progress','completed') THEN 1 ELSE 0 END) as completed_reqs,",
  "            COUNT(DISTINCT p.id) as total_plans,",
  "            SUM(CASE WHEN p.status IN ('active','published') THEN 1 ELSE 0 END) as active_plans,",
  "            SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) as completed_plans,",
  "            COUNT(DISTINCT pg.id) as total_tasks,",
  "            SUM(CASE WHEN pg.adapt_status = 'finished' THEN 1 ELSE 0 END) as finished_tasks,",
  "            SUM(CASE WHEN pg.adapt_status IN ('adapting','in_progress') THEN 1 ELSE 0 END) as active_tasks",
  "          FROM users ua",
  "          LEFT JOIN requirements r ON ua.id = COALESCE(r.assigned_to, -9999)",
  "          LEFT JOIN plans p ON p.creator_id = ua.id OR p.requirement_id IN (SELECT id FROM requirements WHERE assigned_to = ua.id)",
  "          LEFT JOIN plan_games pg ON pg.plan_id = p.id",
  "          WHERE ua.is_member = 1",
  "          GROUP BY ua.id ORDER BY finished_tasks DESC`, [], (err, pmStats) => {",
  '',
  "    db.get(`(SELECT COUNT(*) FROM requirements) as total_reqs,",
  "              (SELECT COUNT(*) FROM requirements WHERE status IN ('draft','assigned')) as pending_reqs,",
  "              (SELECT COUNT(*) FROM requirements WHERE status = 'completed') as completed_reqs,",
  "              (SELECT COUNT(*) FROM plans) as total_plans,",
  "              (SELECT COUNT(*) FROM plans WHERE status IN ('active','published')) as active_plans,",
  "              (SELECT COUNT(*) FROM plan_games) as total_tasks,",
  "              (SELECT COUNT(*) FROM plan_games WHERE adapt_status = 'finished') as finished_tasks,",
  "              (SELECT COUNT(*) FROM bugs WHERE bug_status NOT IN ('closed','verified')) as open_bugs`,",
  "      (err2, overview) => {",
  "        db.all(`SELECT DATE(created_at) as date, COUNT(*) as cnt",
  "                FROM activity_log WHERE created_at >= DATE('now', '-7 days')",
  "                GROUP BY DATE(created_at) ORDER BY date ASC`, (err3, trends) => {",
  "          if (err || err2 || err3) return res.status(500).json({ error: ((err||err2||err3)||{}).message });",
  "          res.json({ success: true, data: { overview: overview || {}, pm_stats: pmStats || [], trends: trends || [] } });",
  '        });',
  '      }',
  '    });',
  '});',
].join('\n');

// 3. 执行替换
const marker = "// 删除需求\nrequirementsRouter.delete('/:id', (req, res) => {\n  // 先解除关联的计划\n  db.run(\"UPDATE plans SET requirement_id = NULL WHERE requirement_id = ?\", [req.params.id], () => {\n    db.run('DELETE FROM requirements WHERE id = ?', [req.params.id], function(err) {\n      if (err) return res.status(500).json({ error: err.message });\n      logActivity('delete', 'requirement', parseInt(req.params.id), '删除需求');\n      res.json({ success: true });\n    });\n  });\n});";

if (!content.includes(marker)) {
  console.log('⚠️ 未找到标记，可能已注入');
} else {
  const newCode = marker + '\n\n' + part1 + '\n\n' + part2 + '\n\n' + part3;
  content = content.replace(marker, newCode);
  fs.writeFileSync('server.js', content);
  console.log('✅ 注入成功');
}

// 4. 挂载comments路由
content = fs.readFileSync('server.js', 'utf8');
if (content.includes("app.use('/api/client-issues', clientIssuesRouter);") && !content.includes("app.use('/api/comments'")) {
  content = content.replace(
    "app.use('/api/client-issues', clientIssuesRouter);",
    "app.use('/api/client-issues', clientIssuesRouter);\napp.use('/api/comments', commentsRouter);"
  );
  fs.writeFileSync('server.js', content);
  console.log('✅ comments路由已挂载');
}

// 5. 验证
try {
  new Function(content);
  console.log('✅ 语法验证通过！');
} catch(e) {
  console.log('❌ 语法错误:', e.message);
}
