// 指派需求给项目经理
requirementsRouter.put('/:id/assign', auth.checkPermission('config_plan', 'edit'), (req, res) => {
  const { assigned_pm_id } = req.body;
  db.run("UPDATE requirements SET assigned_pm_id = ?, status = CASE WHEN ? IS NOT NULL AND status='draft' THEN 'assigned' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [assigned_pm_id || null, assigned_pm_id, req.params.id],
  function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '需求不存在' });
    triggerWorkflow('requirement', 'draft', 'assigned', req.params.id, { operatorId: req.user.id });
    if (assigned_pm_id) {
      createNotification(assigned_pm_id, 'requirement_assigned', '新需求已指派给您',
        '管理者将一条需求指派给您处理，请查看并创建配置计划', 'requirement', parseInt(req.params.id));
    }
    logActivity('assign', 'requirement', parseInt(req.params.id), '指派需求给PM');
    res.json({ success: true });
  });
});

// 关联/取消关联配置计划
requirementsRouter.put('/:id/link-plan', auth.checkPermission('config_plan', 'edit'), (req, res) => {
  const { plan_id } = req.body;
  db.run("UPDATE plans SET requirement_id = NULL WHERE requirement_id = ?", [req.params.id], () => {
    if (plan_id) {
      db.run("UPDATE plans SET requirement_id = ?, status = 'planned' WHERE id = ?", [req.params.id, plan_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run("UPDATE requirements SET plan_id = ?, status = 'planned', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [plan_id, req.params.id], function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          logActivity('link', 'requirement', parseInt(req.params.id), '关联计划');
          res.json({ success: true });
        });
      });
    } else {
      db.run("UPDATE requirements SET plan_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity('unlink', 'requirement', parseInt(req.params.id), '取消关联计划');
        res.json({ success: true });
      });
    }
  });
});
