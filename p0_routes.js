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

  // ========== 需求：指派给PM ==========
  app.put('/api/requirements/:id/assign', auth.verifyToken, auth.checkPermission('config_plan', 'edit'), (req, res) => {
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
        logActivity(db, 'assign', 'requirement', parseInt(req.params.id), '指派需求给PM');
        res.json({ success: true });
      }
    );
  });

  // ========== 需求：关联计划 ==========
  app.put('/api/requirements/:id/link-plan', auth.verifyToken, auth.checkPermission('config_plan', 'edit'), (req, res) => {
    const { plan_id } = req.body;
    db.run("UPDATE plans SET requirement_id = NULL WHERE requirement_id = ?", [req.params.id], () => {
      if (plan_id) {
        db.run("UPDATE plans SET requirement_id = ?, status = 'planned' WHERE id = ?", [req.params.id, plan_id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          db.run("UPDATE requirements SET plan_id = ?, status = 'planned', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [plan_id, req.params.id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            logActivity(db, 'link', 'requirement', parseInt(req.params.id), '关联计划');
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

  commentsRouter.post('/', (req, res) => {
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

  // ========== 增强版活动日志 API（支持筛选+分页） ==========
  app.get('/api/activity-logs', auth.verifyToken, (req, res) => {
    const { resource_type, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = 'SELECT * FROM activity_log';
    const params = [];
    if (resource_type && resource_type !== 'all') {
      sql += ' WHERE resource_type = ?';
      params.push(resource_type);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // 同时返回总数
      let countSql = 'SELECT COUNT(*) as total FROM activity_log';
      const countParams = [];
      if (resource_type && resource_type !== 'all') {
        countSql += ' WHERE resource_type = ?';
        countParams.push(resource_type);
      }
      db.get(countSql, countParams, (err2, countRow) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true, data: rows || [], total: countRow?.total || 0 });
      });
    });
  });

  // ========== 活动日志统计（各类型数量） ==========
  app.get('/api/activity-logs/stats', auth.verifyToken, (req, res) => {
    db.all("SELECT resource_type, COUNT(*) as cnt FROM activity_log GROUP BY resource_type ORDER BY cnt DESC", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: rows || [] });
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

function logActivity(db, action, entity, entityId, detail) {
  if (typeof global.logActivity === 'function') {
    global.logActivity(action, entity, entityId, detail);
  } else {
    db.run("INSERT INTO activity_log (action, resource_type, resource_id, resource_name, user_name, created_at) VALUES (?, ?, ?, ?, '系统', datetime('now'))",
      [action, 'requirement', entityId, detail]);
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
