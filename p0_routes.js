/**
 * P0 增强功能路由 — 需求指派/关联计划 + 评论CRUD + 管理者看板 + 工作流引擎
 * 挂载位置：server.js 中 require('./p0_routes') 后调用 mountP0Routes(app)
 */

let mounted = false;

function mountP0Routes(app) {
  if (mounted) return;
  mounted = true;

  const db = require('./database');
  const auth = require('./auth');
  const { validate, rules } = require('./validator');
  const path = require('path');
  const multer = require('multer');
  const fs = require('fs');

  // 确保上传目录存在
  const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // Multer 配置：文件存储到 public/uploads/
  const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, UPLOAD_DIR); },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const safeName = file.originalname.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, '_').slice(0, 50);
      cb(null, `${Date.now()}_${safeName}${ext}`);
    }
  });
  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB限制
    fileFilter: (req, file, cb) => {
      const allowed = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.txt', '.csv', '.zip', '.log', '.json'
      ];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.includes(ext)) return cb(null, true);
      return cb(new Error(`不支持的文件类型: ${ext}`));
    }
  });

  // ========== 附件表 ==========
  db.run(`CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT DEFAULT '',
    size_bytes INTEGER DEFAULT 0,
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id)');

  // ========== 需求：指派给PM ==========
  app.put('/api/requirements/:id/assign', auth.verifyToken, auth.checkPermission('config_plan', 'edit'),
    validate({ assigned_pm_id: rules.optionalId() }),
    (req, res) => {
    const { assigned_pm_id } = req.body;
    db.run("UPDATE requirements SET assigned_pm_id = ?, status = CASE WHEN ? IS NOT NULL AND status='draft' THEN 'assigned' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [assigned_pm_id || null, assigned_pm_id, req.params.id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: '需求不存在' });
        triggerWorkflow('requirement', 'draft', 'assigned', req.params.id, { operatorId: req.user.id, operatorName: req.user.real_name || req.user.username });
        if (assigned_pm_id) {
          createNotification(db, assigned_pm_id, 'requirement_assigned', '新需求已指派给您',
            '管理者将一条需求指派给您处理，请查看并创建配置计划', 'requirement', parseInt(req.params.id));
        }
        logActivity(db, 'assign', 'requirement', parseInt(req.params.id), '指派需求给PM', req);
        res.json({ success: true });
      }
    );
  });

  // ========== 需求：关联计划 ==========
  app.put('/api/requirements/:id/link-plan', auth.verifyToken, auth.checkPermission('config_plan', 'edit'),
    validate({ plan_id: rules.optionalId() }),
    (req, res) => {
    const { plan_id } = req.body;
    db.run("UPDATE plans SET requirement_id = NULL WHERE requirement_id = ?", [req.params.id], () => {
      if (plan_id) {
        db.run("UPDATE plans SET requirement_id = ?, status = 'planned' WHERE id = ?", [req.params.id, plan_id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          db.run("UPDATE requirements SET plan_id = ?, status = 'planned', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [plan_id, req.params.id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            logActivity(db, 'link', 'requirement', parseInt(req.params.id), '关联计划', req);
            res.json({ success: true });
          });
        });
      } else {
        db.run("UPDATE requirements SET plan_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          logActivity(db, 'unlink', 'requirement', parseInt(req.params.id), '取消关联计划');
          res.json({ success: true });
        });
      }
    });
  });

  // ========== 评论 CRUD ==========
  const express = require('express');
  const commentsRouter = express.Router();
  commentsRouter.use(auth.verifyToken);

  commentsRouter.get('/', (req, res) => {
    const { entity_type, entity_id } = req.query;
    if (!entity_type || !entity_id) return res.status(400).json({ error: '缺少entity_type或entity_id' });
    db.all("SELECT c.*, u.real_name as user_name FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.entity_type = ? AND c.entity_id = ? ORDER BY c.created_at ASC",
      [entity_type, entity_id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: rows });
    });
  });

  commentsRouter.post('',
    validate({
      entity_type: rules.requiredEnum(['game','plan','requirement','test','bug','device','member'], '实体类型'),
      entity_id: rules.id(),
      content: rules.required().maxLen(5000).minLen(1),
    }),
    (req, res) => {
    const { entity_type, entity_id, content } = req.body;
    if (!entity_type || !entity_id || !content) return res.status(400).json({ error: '参数不完整' });
    const mentionIds = (content.match(/@\d+/g) || []).map(m => parseInt(m.substring(1)));
    const userId = req.user ? req.user.id : null;
    const stmt = db.run("INSERT INTO comments (entity_type, entity_id, user_id, content, mentions) VALUES (?, ?, ?, ?, ?)",
      [entity_type, entity_id, userId, content, JSON.stringify(mentionIds)],
      function(err) {  // 用function()确保this绑定到Statement对象
        if (err) return res.status(500).json({ error: err.message });
        const commentId = this.lastID;
        mentionIds.forEach((uid) => {
          if (uid !== userId) createNotification(db, uid, 'comment_mention', '有人在评论中提到了你',
            (req.user.real_name || req.user.username) + ' 在一条记录的评论中提到了你', entity_type, parseInt(entity_id));
        });
        notifyEntityOwner(db, entity_type, entity_id, userId,
          (req.user.real_name || req.user.username) + ' 发表了一条新评论');
        res.json({ success: true, id: commentId });
      });
  });

  commentsRouter.delete('/:id', (req, res) => {
    db.get("SELECT * FROM comments WHERE id = ?", [req.params.id], (err, row) => {
      if (err || !row) return res.status(404).json({ error: '评论不存在' });
      if (!req.user.is_super_admin && row.user_id !== req.user.id) return res.status(403).json({ error: '无权删除此评论' });
      db.run("DELETE FROM comments WHERE id = ?", [req.params.id], (e) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
      });
    });
  });

  app.use('/api/comments', commentsRouter);

  // ========== 增强版活动日志 API（审计日志，支持多维度筛选+分页） ==========
  app.get('/api/activity-logs', auth.verifyToken, (req, res) => {
    const { resource_type, action, user_id, date_from, date_to, keyword, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = 'SELECT * FROM activity_log';
    let countSql = 'SELECT COUNT(*) as total FROM activity_log';
    const params = [];
    const conditions = [];

    if (resource_type && resource_type !== 'all') { conditions.push('resource_type = ?'); params.push(resource_type); }
    if (action && action !== 'all') { conditions.push('action = ?'); params.push(action); }
    if (user_id) { conditions.push('user_id = ?'); params.push(parseInt(user_id)); }
    if (date_from) { conditions.push("created_at >= ?"); params.push(date_from + ' 00:00:00'); }
    if (date_to) { conditions.push("created_at <= ?"); params.push(date_to + ' 23:59:59'); }
    if (keyword) { conditions.push("(resource_name LIKE ? OR changes_json LIKE ? OR user_name LIKE ?)"); params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }

    const whereStr = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
    sql += whereStr + ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    countSql += whereStr;
    params.push(parseInt(limit), offset);

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(countSql, params.slice(0, -2), (err2, countRow) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true, data: rows || [], total: countRow?.total || 0 });
      });
    });
  });

  // ========== 活动日志统计（各类型数量 + 用户分布） ==========
  app.get('/api/activity-logs/stats', auth.verifyToken, (req, res) => {
    db.all("SELECT resource_type, COUNT(*) as cnt FROM activity_log GROUP BY resource_type ORDER BY cnt DESC", [], (err, typeRows) => {
      if (err) return res.status(500).json({ error: err.message });
      // 按用户统计
      db.all("SELECT user_name, user_id, COUNT(*) as cnt FROM activity_log GROUP BY user_id, user_name ORDER BY cnt DESC LIMIT 10", [], (err2, userRows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        // 按日期统计（最近30天）
        db.all("SELECT DATE(created_at) as date, COUNT(*) as cnt FROM activity_log WHERE created_at >= DATE('now', '-30 days') GROUP BY DATE(created_at) ORDER BY date ASC", [], (err3, trendRows) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({
            success: true,
            data: {
              by_type: typeRows || [],
              by_user: userRows || [],
              trends: trendRows || []
            }
          });
        });
      });
    });
  });

  // ========== 管理者看板 ==========
  app.get('/api/stats/admin-dashboard', auth.verifyToken, auth.checkPermission('user_management', 'view'), (req, res) => {

    db.all("SELECT ua.id as pm_id, ua.real_name as pm_name," +
            " COUNT(DISTINCT r.id) as total_requirements," +
            "SUM(CASE WHEN r.status IN ('draft','assigned') THEN 1 ELSE 0 END) as pending_reqs," +
            "SUM(CASE WHEN r.status IN ('planned','in_progress','completed') THEN 1 ELSE 0 END) as completed_reqs," +
            "COUNT(DISTINCT p.id) as total_plans," +
            "SUM(CASE WHEN p.status IN ('active','published') THEN 1 ELSE 0 END) as active_plans," +
            "SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) as completed_plans," +
            "COUNT(DISTINCT pg.id) as total_tasks," +
            "SUM(CASE WHEN pg.adapt_status = 'finished' THEN 1 ELSE 0 END) as finished_tasks," +
            "SUM(CASE WHEN pg.adapt_status IN ('adapting','in_progress') THEN 1 ELSE 0 END) as active_tasks " +
          "FROM users ua " +
          "LEFT JOIN requirements r ON ua.id = COALESCE(r.assigned_to, -9999) " +
          "LEFT JOIN plans p ON p.creator_id = ua.id OR p.requirement_id IN (SELECT id FROM requirements WHERE assigned_to = ua.id) " +
          "LEFT JOIN plan_games pg ON pg.plan_id = p.id " +
          "WHERE ua.is_member = 1 " +
          "GROUP BY ua.id ORDER BY finished_tasks DESC", [], (err, pmStats) => {

      db.get("SELECT " +
              "(SELECT COUNT(*) FROM requirements) as total_reqs," +
              "(SELECT COUNT(*) FROM requirements WHERE status IN ('draft','assigned')) as pending_reqs," +
              "(SELECT COUNT(*) FROM requirements WHERE status = 'completed') as completed_reqs," +
              "(SELECT COUNT(*) FROM plans) as total_plans," +
              "(SELECT COUNT(*) FROM plans WHERE status IN ('active','published')) as active_plans," +
              "(SELECT COUNT(*) FROM plan_games) as total_tasks," +
              "(SELECT COUNT(*) FROM plan_games WHERE adapt_status = 'finished') as finished_tasks," +
              "(SELECT COUNT(*) FROM bugs WHERE bug_status NOT IN ('closed','verified')) as open_bugs",
        (err2, overview) => {

          db.all("SELECT DATE(created_at) as date, COUNT(*) as cnt" +
                  " FROM activity_log WHERE created_at >= DATE('now', '-7 days')" +
                  " GROUP BY DATE(created_at) ORDER BY date ASC", (err3, trends) => {
            if (err || err2 || err3) return res.status(500).json({ error: ((err||err2||err3)||{}).message });
            res.json({ success: true, data: { overview: overview || {}, pm_stats: pmStats || [], trends: trends || [] } });
          });
        }
      );
    });
  });

  console.log('[P0] ✅ 需求指派/关联计划 + 评论CRUD + 管理者看板 + 工作流引擎 已挂载');

  // ========== 工作流引擎核心（暴露给其他路由复用） ==========
  global.triggerWorkflow = triggerWorkflow;

  // ========== 附件上传/管理 API ==========
  app.post('/api/attachments/upload', auth.verifyToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });
    const { entity_type, entity_id } = req.body;
    if (!entity_type || !entity_id) return res.status(400).json({ error: '缺少entity_type或entity_id' });
    db.run(`INSERT INTO attachments (entity_type, entity_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entity_type, entity_id, req.file.originalname, req.file.filename,
       req.file.mimetype || '', req.file.size, req.user?.id || null],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID, filename: req.file.originalname, size: req.file.size });
      });
  });

  // ========== 富文本编辑器专用图片上传（直接返回 url，不写附件表） ==========
  // 富文本里的图片是正文内容的一部分（存进 HTML 字符串），无需在 attachments 表登记
  app.post('/api/upload/image', auth.verifyToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    const imgExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!imgExt.includes(ext)) {
      // 非图片：删掉刚落盘的文件并拒绝
      fs.unlink(path.join(UPLOAD_DIR, req.file.filename), () => {});
      return res.status(400).json({ error: '仅支持图片文件（jpg/png/gif/webp/svg）' });
    }
    res.json({ success: true, url: `/uploads/${req.file.filename}`, alt: req.file.originalname });
  });

  app.get('/api/attachments/list/:entityType/:entityId', auth.verifyToken, (req, res) => {
    db.all('SELECT * FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC',
      [req.params.entityType, req.params.entityId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const items = (rows || []).map(a => ({ ...a, url: `/uploads/${a.stored_name}` }));
        res.json({ success: true, data: items });
      });
  });

  app.get('/api/attachments/:id', auth.verifyToken, (req, res) => {
    db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id], (err, row) => {
      if (err || !row) return res.status(404).json({ error: '附件不存在' });
      res.json({ success: true, data: { ...row, url: `/uploads/${row.stored_name}` } });
    });
  });

  app.delete('/api/attachments/:id', auth.verifyToken, (req, res) => {
    db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id], (err, row) => {
      if (err || !row) return res.status(404).json({ error: '附件不存在' });
      fs.unlink(path.join(UPLOAD_DIR, row.stored_name), () => {});
      db.run('DELETE FROM attachments WHERE id = ?', [req.params.id], function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true });
      });
    });
  });
  app.use('/uploads', require('express').static(UPLOAD_DIR));

  // ========== 批量操作 API ==========
  const BATCH_CONFIG = {
    games: { table: 'games', nameField: 'name', perm: 'games' },
    requirements: { table: 'requirements', nameField: 'title', perm: 'config_plan' },
    bugs: { table: 'bugs', nameField: 'title', perm: 'tests' },
    test_cases: { table: 'test_cases', nameField: 'name', perm: 'test-cases' },
    devices: { table: 'devices', nameField: 'name', perm: 'devices' }
  };

  // 批量删除
  app.post('/api/:resource/batch-delete', auth.verifyToken, (req, res) => {
    const { ids } = req.body;
    const resource = req.params.resource;
    const cfg = BATCH_CONFIG[resource];
    if (!cfg) return res.status(400).json({ error: '不支持的资源类型' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择要删除的记录' });
    if (ids.length > 50) return res.status(400).json({ error: '单次批量删除不能超过50条' });

    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM ${cfg.table} WHERE id IN (${placeholders}`, ids, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(db, 'batch_delete', resource, 0, `批量删除 ${this.changes} 条${resource}`, req);
      res.json({ success: true, deleted: this.changes });
    });
  });

  // 批量更新状态
  app.put('/api/:resource/batch-status', auth.verifyToken, (req, res) => {
    const { ids, status } = req.body;
    const resource = req.params.resource;
    const cfg = BATCH_CONFIG[resource];
    if (!cfg) return res.status(400).json({ error: '不支持的资源类型' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择记录' });
    if (!status) return res.status(400).json({ error: '请指定目标状态' });

    const placeholders = ids.map(() => '?').join(',');
    db.run(`UPDATE ${cfg.table} SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
      [status, ...ids], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(db, 'batch_update', resource, 0, `批量更新 ${this.changes} 条${resource} 状态为 ${status}`, req);
      res.json({ success: true, updated: this.changes });
    });
  });

  // 批量分配成员（仅支持有 assigned_to 字段的表）
  app.put('/api/:resource/batch-assign', auth.verifyToken, (req, res) => {
    const { ids, assignee_id } = req.body;
    const resource = req.params.resource;
    const cfg = BATCH_CONFIG[resource];
    if (!cfg) return res.status(400).json({ error: '不支持的资源类型' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择记录' });

    const placeholders = ids.map(() => '?').join('');
    const assignField = resource === 'bugs' ? 'assigned_to' : 'assigned_to';
    db.run(`UPDATE ${cfg.table} SET ${assignField} = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
      [assignee_id || null, ...ids], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, updated: this.changes });
    });
  });
}

// ========== 工作流引擎 ==========

/**
 * 触发工作流规则
 */
function triggerWorkflow(entity, fromStatus, toStatus, entityId, context) {
  context = context || {};
  const db = require('./database');
  db.all("SELECT * FROM workflow_rules WHERE is_active = 1 AND trigger_entity = ? AND trigger_to_status = ?",
    [entity, toStatus],
    (err, rules) => {
      if (err || !rules || rules.length === 0) return;
      rules.forEach((rule) => {
        if (rule.trigger_from_status && rule.trigger_from_status !== fromStatus) return;
        try {
          const config = typeof rule.action_config === 'string' ? JSON.parse(rule.action_config) : rule.action_config;
          executeAction(rule.action_type, config, entity, entityId, context);
        } catch(e) { console.error('[workflow] 规则执行失败 [' + rule.name + ']:', e.message); }
      });
    });
}

function executeAction(actionType, config, entityType, entityId, context) {
  switch(actionType) {
    case 'notify': handleNotify(config, entityType, entityId, context); break;
    case 'update_status': handleStatusUpdate(config, entityType, entityId); break;
    case 'create_comment': handleAutoComment(config, entityType, entityId, context); break;
  }
}

function handleNotify(config, entityType, entityId, context) {
  let msg = (config.message || '').replace('{title}','[相关记录]').replace('{creator}', context.operatorName || '系统');
  var target = config.target_role || config.target;

  if (target === 'assigned_to') {
    var tables = { bug:'bugs', task:'plan_games', plan:'plans', requirement:'requirements' };
    var fields = { bug:'assigned_to', task:'assigned_to', plan:'creator_id', requirement:'assigned_to' };
    if (tables[entityType] && fields[entityType]) {
      const db = require('./database');
      db.get('SELECT ' + fields[entityType] + ' as uid FROM ' + tables[entityType] + ' WHERE id = ?', [entityId],
        (e,r)=>{ if(r&&r.uid) createNotification(db,r.uid,'workflow_notify',config.name||'工作流通知',msg,entityType,entityId);});
    }
  } else if (target === 'all_assigned' && entityType === 'plan') {
    const db = require('./database');
    db.all('SELECT DISTINCT assigned_to FROM plan_games WHERE plan_id=? AND assigned_to IS NOT NULL',[entityId],
      (e,rows)=>{ rows.forEach((r)=>{ createNotification(db,r.assigned_to,'workflow_notify',config.name||'工作流通知',msg,entityType,entityId);});});
  } else if (target === 'assigned_pm') {
    const db = require('./database');
    db.get('SELECT assigned_pm_id as uid FROM requirements WHERE id=?',[entityId],
      (e,r)=>{ if(r&&r.uid) createNotification(db,r.uid,'workflow_notify',config.name||'工作流通知',msg,entityType,entityId);});
  } else if (target === 'tester') {
    const db = require('./database');
    db.all("SELECT id FROM users WHERE role_id=3 AND is_member=1",(e,rows)=>{
      rows.forEach((r)=>{ createNotification(db,r.id,'workflow_notify',config.name||'工作流通知',msg,entityType,entityId);});});
  }
}

function handleStatusUpdate(config, entityType, entityId) {
  if(config.target_entity==='device'&&config.action==='refresh_adaptation_rate')
    console.log('[workflow] 设备适配率刷新 by',entityType,'ID:',entityId);
}

function handleAutoComment(config, entityType, entityId, context) {
  var uid = context.operatorId||1;
  const db = require('./database');
  db.run("INSERT INTO comments (entity_type,entity_id,user_id,content,mentions) VALUES(?,?,?,?,'[]')",
    [entityType,entityId,uid,config.message||'[自动生成]'],()=>{});
}

// ========== 辅助函数 ==========
function createNotification(db, userId, type, title, message, entityType, entityId) {
  // 复用已有的全局 createNotification 或直接插入
  if (typeof global.createNotification === 'function') {
    global.createNotification(userId, type, title, message, entityType, entityId);
  } else {
    db.run("INSERT INTO notifications (user_id, type, title, content, related_type, related_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))",
      [userId, type, title, message, entityType, entityId]);
  }
}

function logActivity(db, action, entity, entityId, detail, req) {
  if (typeof global.logActivity === 'function') {
    global.logActivity(action, entity, entityId, detail, null, req);
  } else {
    const userName = (req && req.user) ? (req.user.real_name || req.user.username) : '系统';
    db.run("INSERT INTO activity_log (user_name, action, resource_type, resource_id, resource_name, ip_address, created_at) VALUES (?, ?, ?, ?, ?, '', datetime('now'))",
      [userName, action, entity, entityId, detail]);
  }
}

function notifyEntityOwner(entityType, entityId, commenterId, message) {
  const db = require('./database');
  var m={bug:{table:'bugs',field:'assigned_to'},game_issue:{table:'game_issues',field:'assigned_to'},
    client_issue:{table:'client_issues',field:'assigned_to'},interlace_issue:{table:'interlace_issues',field:'assigned_to'},
    task:{table:'plan_games',field:'assigned_to'},plan:{table:'plans',field:'creator_id'}};
  var map=m[entityType];if(!map)return;
  db.get('SELECT '+map.field+' as uid FROM '+map.table+' WHERE id=?',[entityId],(e,row)=>{
    if(row&&row.uid&&row.uid!==commenterId)
      createNotification(db,row.uid,'new_comment','新评论通知',message,entityType,parseInt(entityId));
  });
}

module.exports = { mountP0Routes, triggerWorkflow };
