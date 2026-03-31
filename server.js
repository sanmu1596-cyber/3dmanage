const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./database');
const path = require('path');
const auth = require('./auth');
const usersController = require('./usersController');

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ==================== 操作日志表 ====================
db.run(`CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name TEXT DEFAULT 'admin',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  resource_name TEXT DEFAULT '',
  changes_json TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 记录操作日志的辅助函数
function logActivity(action, resourceType, resourceId, resourceName, changesJson) {
  db.run(
    `INSERT INTO activity_log (user_name, action, resource_type, resource_id, resource_name, changes_json) VALUES (?, ?, ?, ?, ?, ?)`,
    ['admin', action, resourceType, resourceId || 0, resourceName || '', changesJson || '{}']
  );
}

// ==================== 认证路由（不需要token） ====================
const authRouter = express.Router();
authRouter.post('/login', usersController.login);
authRouter.post('/logout', usersController.logout);
authRouter.get('/me', auth.verifyToken, usersController.getCurrentUser);

// ==================== 用户管理路由（需要认证） ====================
const usersRouter = express.Router();
usersRouter.use(auth.verifyToken);
usersRouter.get('/', auth.checkPermission('user_management', 'view'), usersController.getAllUsers);
usersRouter.post('/', auth.checkPermission('user_management', 'create'), usersController.createUser);
usersRouter.put('/:userId', auth.checkPermission('user_management', 'edit'), usersController.updateUser);
usersRouter.put('/:userId/role', auth.checkPermission('user_management', 'edit'), usersController.updateUserRole);
usersRouter.delete('/:userId', auth.checkPermission('user_management', 'delete'), usersController.deleteUser);

// ==================== 角色管理路由（需要认证） ====================
const rolesRouter = express.Router();
rolesRouter.use(auth.verifyToken);
rolesRouter.get('/', usersController.getAllRoles);
rolesRouter.get('/matrix', auth.checkPermission('user_management', 'view'), usersController.getPermissionMatrix);
rolesRouter.get('/:roleId/permissions', auth.checkPermission('user_management', 'view'), usersController.getRolePermissions);
rolesRouter.put('/:roleId/permissions', auth.checkPermission('user_management', 'edit'), usersController.updateRolePermissions);
rolesRouter.post('/', auth.checkPermission('user_management', 'create'), usersController.createRole);
rolesRouter.delete('/:roleId', auth.checkPermission('user_management', 'delete'), usersController.deleteRole);

// ==================== 受保护的API路由 ====================
const membersRouter = express.Router();
const devicesRouter = express.Router();
const gamesRouter = express.Router();
const testsRouter = express.Router();
const bugsRouter = express.Router();

// 应用认证中间件
membersRouter.use(auth.verifyToken);
devicesRouter.use(auth.verifyToken);
gamesRouter.use(auth.verifyToken);
testsRouter.use(auth.verifyToken);
bugsRouter.use(auth.verifyToken);

// ==================== 成员管理 API（已合并到 users 表，通过 is_member=1 标识项目成员）====================
membersRouter.get('/', auth.checkPermission('members', 'view'), (req, res) => {
  const sql = `SELECT id, real_name as name, wechat_id, project_role as role, duty, status, created_at, updated_at
               FROM users WHERE is_member = 1 ORDER BY created_at DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, data: rows });
  });
});

membersRouter.post('/', auth.checkPermission('members', 'edit'), (req, res) => {
  const { name, wechat_id, role, duty, status } = req.body;
  const sql = `INSERT INTO users (real_name, wechat_id, project_role, duty, status, is_member)
               VALUES (?, ?, ?, ?, ?, 1)`;
  db.run(sql, [name, wechat_id || '', role || '', duty || '', status || 'active'], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, id: this.lastID });
  });
});

membersRouter.put('/:id', auth.checkPermission('members', 'edit'), (req, res) => {
  const { name, wechat_id, role, duty, status } = req.body;
  const sql = `UPDATE users SET real_name = ?, wechat_id = ?, project_role = ?, duty = ?, status = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND is_member = 1`;
  db.run(sql, [name, wechat_id || '', role || '', duty || '', status || 'active', req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

membersRouter.delete('/:id', auth.checkPermission('members', 'delete'), (req, res) => {
  // 删除成员：将 is_member 设为 0（软删除），保留用户记录
  const sql = 'UPDATE users SET is_member = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_member = 1';
  db.run(sql, [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

// ==================== 设备管理 API ====================
devicesRouter.get('/', auth.checkPermission('devices', 'view'), (req, res) => {
  const sql = `SELECT d.*, u.real_name as assigned_to_name
               FROM devices d
               LEFT JOIN users u ON d.assigned_to = u.id
               ORDER BY d.created_at DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, data: rows });
  });
});

devicesRouter.post('/', auth.checkPermission('devices', 'edit'), (req, res) => {
  const { manufacturer, device_type, name, requirements, quantity, keeper,
          notes, adapter_completion_rate, total_bugs, completed_adaptations,
          total_games, status, assigned_to } = req.body;
  const sql = `INSERT INTO devices (manufacturer, device_type, name, requirements, quantity,
                                   keeper, notes, adapter_completion_rate, total_bugs,
                                   completed_adaptations, total_games, status, assigned_to)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [manufacturer, device_type, name, requirements, quantity, keeper,
               notes, adapter_completion_rate, total_bugs, completed_adaptations,
               total_games, status, assigned_to], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, id: this.lastID });
  });
});

devicesRouter.put('/:id', auth.checkPermission('devices', 'edit'), (req, res) => {
  const { manufacturer, device_type, name, requirements, quantity, keeper,
          notes, adapter_completion_rate, total_bugs, completed_adaptations,
          total_games, status, assigned_to } = req.body;
  const sql = `UPDATE devices SET manufacturer = ?, device_type = ?, name = ?, requirements = ?, quantity = ?,
                                 keeper = ?, notes = ?, adapter_completion_rate = ?, total_bugs = ?,
                                 completed_adaptations = ?, total_games = ?, status = ?, assigned_to = ?,
                                 updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  db.run(sql, [manufacturer, device_type, name, requirements, quantity, keeper,
               notes, adapter_completion_rate, total_bugs, completed_adaptations,
               total_games, status, assigned_to, req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

devicesRouter.delete('/:id', auth.checkPermission('devices', 'delete'), (req, res) => {
  const sql = 'DELETE FROM devices WHERE id = ?';
  db.run(sql, [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

// ==================== 游戏管理 API ====================
gamesRouter.get('/', auth.checkPermission('games', 'view'), (req, res) => {
  const sql = `SELECT g.*, u.real_name as owner_name
               FROM games g
               LEFT JOIN users u ON g.owner_id = u.id
               ORDER BY g.created_at DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, data: rows });
  });
});

gamesRouter.post('/', auth.checkPermission('games', 'edit'), (req, res) => {
  const { name, english_name, platform, game_id, game_type, description,
          developer, operator, release_date, config_path, adapter_progress,
          version, package_size, adaptation_status, adaptation_notes, owner_id, online_status, quality,
          game_account, storage_location } = req.body;
  const sql = `INSERT INTO games (name, english_name, platform, game_id, game_type, description,
                                  developer, operator, release_date, config_path, adapter_progress,
                                  version, package_size, adaptation_status, adaptation_notes, owner_id, online_status, quality,
                                  game_account, storage_location)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [name, english_name, platform, game_id, game_type, description,
               developer, operator, release_date, config_path, adapter_progress,
               version, package_size, adaptation_status, adaptation_notes, owner_id, online_status, quality,
               game_account, storage_location], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    logActivity('create', 'game', this.lastID, name);
    res.json({ success: true, id: this.lastID });
  });
});

gamesRouter.put('/:id', auth.checkPermission('games', 'edit'), (req, res) => {
  const { name, english_name, platform, game_id, game_type, description,
          developer, operator, release_date, config_path, adapter_progress,
          version, package_size, adaptation_status, adaptation_notes, owner_id, online_status, quality,
          game_account, storage_location } = req.body;
  const sql = `UPDATE games SET name = ?, english_name = ?, platform = ?, game_id = ?, game_type = ?,
                              description = ?, developer = ?, operator = ?, release_date = ?, config_path = ?,
                              adapter_progress = ?, version = ?, package_size = ?, adaptation_status = ?,
                              adaptation_notes = ?, owner_id = ?, online_status = ?, quality = ?,
                              game_account = ?, storage_location = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  db.run(sql, [name, english_name, platform, game_id, game_type, description,
               developer, operator, release_date, config_path, adapter_progress,
               version, package_size, adaptation_status, adaptation_notes, owner_id, online_status, quality,
               game_account, storage_location, req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    logActivity('update', 'game', parseInt(req.params.id), name);
    res.json({ success: true });
  });
});

gamesRouter.delete('/:id', auth.checkPermission('games', 'delete'), (req, res) => {
  db.get('SELECT name FROM games WHERE id = ?', [req.params.id], (e, row) => {
    const sql = 'DELETE FROM games WHERE id = ?';
    db.run(sql, [req.params.id], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      logActivity('delete', 'game', parseInt(req.params.id), row ? row.name : '');
      res.json({ success: true });
    });
  });
});

// ==================== 测试管理 API ====================
testsRouter.get('/', auth.checkPermission('tests', 'view'), (req, res) => {
  const sql = `SELECT t.*, g.name as game_name, d.name as device_name, u.real_name as tester_name
               FROM tests t
               LEFT JOIN games g ON t.game_id = g.id
               LEFT JOIN devices d ON t.device_id = d.id
               LEFT JOIN users u ON t.tester_id = u.id
               ORDER BY t.created_at DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, data: rows });
  });
});

testsRouter.post('/', auth.checkPermission('tests', 'edit'), (req, res) => {
  const { name, game_id, device_id, tester_id, test_date, status, priority, result, bugs_count, description } = req.body;
  const sql = `INSERT INTO tests (name, game_id, device_id, tester_id, test_date, status, priority, result, bugs_count, description)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [name, game_id, device_id, tester_id, test_date, status, priority, result, bugs_count, description], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, id: this.lastID });
  });
});

testsRouter.put('/:id', auth.checkPermission('tests', 'edit'), (req, res) => {
  const { name, game_id, device_id, tester_id, test_date, status, priority, result, bugs_count, description } = req.body;
  const sql = `UPDATE tests SET name = ?, game_id = ?, device_id = ?, tester_id = ?, test_date = ?, status = ?, priority = ?, result = ?, bugs_count = ?, description = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  db.run(sql, [name, game_id, device_id, tester_id, test_date, status, priority, result, bugs_count, description, req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

testsRouter.delete('/:id', auth.checkPermission('tests', 'delete'), (req, res) => {
  const sql = 'DELETE FROM tests WHERE id = ?';
  db.run(sql, [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

// ==================== 缺陷管理 API ====================
bugsRouter.get('/', auth.checkPermission('bugs', 'view'), (req, res) => {
  const sql = `SELECT b.*, t.name as test_name, u.real_name as assignee_name
               FROM bugs b
               LEFT JOIN tests t ON b.test_id = t.id
               LEFT JOIN users u ON b.assignee_id = u.id
               ORDER BY b.created_at DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, data: rows });
  });
});

bugsRouter.post('/', auth.checkPermission('bugs', 'edit'), (req, res) => {
  const { versions, actual_fix_time, planned_fix_time, device_name, discovery_time,
          owner, bug_status, priority, problem_type, description, steps, test_id, assignee_id } = req.body;
  const sql = `INSERT INTO bugs (versions, actual_fix_time, planned_fix_time, device_name, discovery_time,
                                owner, bug_status, priority, problem_type, description, steps, test_id, assignee_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [versions, actual_fix_time, planned_fix_time, device_name, discovery_time,
               owner, bug_status, priority, problem_type, description, steps, test_id, assignee_id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, id: this.lastID });
  });
});

bugsRouter.put('/:id', auth.checkPermission('bugs', 'edit'), (req, res) => {
  const { versions, actual_fix_time, planned_fix_time, device_name, discovery_time,
          owner, bug_status, priority, problem_type, description, steps, test_id, assignee_id } = req.body;
  const sql = `UPDATE bugs SET versions = ?, actual_fix_time = ?, planned_fix_time = ?, device_name = ?,
                            discovery_time = ?, owner = ?, bug_status = ?, priority = ?, problem_type = ?,
                            description = ?, steps = ?, test_id = ?, assignee_id = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  db.run(sql, [versions, actual_fix_time, planned_fix_time, device_name, discovery_time,
               owner, bug_status, priority, problem_type, description, steps, test_id, assignee_id, req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

bugsRouter.delete('/:id', auth.checkPermission('bugs', 'delete'), (req, res) => {
  const sql = 'DELETE FROM bugs WHERE id = ?';
  db.run(sql, [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

// ==================== 字段选项设置 API ====================
// 初始化 field_options 表
db.run(`CREATE TABLE IF NOT EXISTS field_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_group TEXT NOT NULL,
  options TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(field_key)
)`, (err) => {
  if (!err) {
    // 插入默认字段选项数据（仅在表为空时插入）
    db.get('SELECT COUNT(*) as count FROM field_options', (err, row) => {
      if (!err && row.count === 0) {
        const defaultOptions = [
          // 成员管理
          ['member_status', '成员状态', '成员管理', JSON.stringify([
            {value:'active',label:'活跃'},{value:'inactive',label:'非活跃'},{value:'archived',label:'已归档'}
          ]), 1],
          ['member_role', '成员角色', '成员管理', JSON.stringify([
            {value:'项目经理',label:'项目经理'},{value:'开发工程师',label:'开发工程师'},{value:'测试工程师',label:'测试工程师'},{value:'适配工程师',label:'适配工程师'},{value:'UI设计师',label:'UI设计师'}
          ]), 2],
          // 设备管理
          ['device_status', '设备状态', '设备管理', JSON.stringify([
            {value:'available',label:'可用'},{value:'assigned',label:'已分配'},{value:'maintenance',label:'维护中'},{value:'broken',label:'损坏'}
          ]), 3],
          // 游戏管理
          ['game_platform', '游戏平台', '游戏管理', JSON.stringify([
            {value:'Android',label:'Android'},{value:'iOS',label:'iOS'},{value:'PC',label:'PC'},{value:'Switch',label:'Switch'},{value:'PS5',label:'PS5'},{value:'Xbox',label:'Xbox'}
          ]), 4],
          ['game_type', '游戏类型', '游戏管理', JSON.stringify([
            {value:'MOBA',label:'MOBA'},{value:'FPS',label:'FPS'},{value:'RPG',label:'RPG'},{value:'MMORPG',label:'MMORPG'},{value:'SLG',label:'SLG'},{value:'卡牌',label:'卡牌'},{value:'体育',label:'体育'},{value:'竞速',label:'竞速'},{value:'模拟经营',label:'模拟经营'},{value:'益智休闲',label:'益智休闲'},{value:'动作冒险',label:'动作冒险'}
          ]), 5],
          ['adaptation_status', '适配状态', '游戏管理', JSON.stringify([
            {value:'pending',label:'待适配'},{value:'in_progress',label:'适配中'},{value:'completed',label:'已完成'},{value:'failed',label:'失败'}
          ]), 6],
          ['online_status', '上线状态', '游戏管理', JSON.stringify([
            {value:'pending',label:'待上线'},{value:'in_progress',label:'适配中'},{value:'paused',label:'暂停适配'},{value:'online',label:'已上线'}
          ]), 7],
          ['quality', '品质', '游戏管理', JSON.stringify([
            {value:'normal',label:'一般'},{value:'recommended',label:'推荐'}
          ]), 8],
          ['storage_location', '存储位置', '游戏管理', JSON.stringify([
            {value:'硬盘1号',label:'硬盘1号'},{value:'硬盘2号',label:'硬盘2号'},{value:'硬盘3号',label:'硬盘3号'},{value:'硬盘4号',label:'硬盘4号'},{value:'硬盘5号',label:'硬盘5号'},{value:'硬盘6号',label:'硬盘6号'},{value:'硬盘7号',label:'硬盘7号'},{value:'硬盘8号',label:'硬盘8号'},{value:'硬盘9号',label:'硬盘9号'},{value:'硬盘10号',label:'硬盘10号'}
          ]), 9],
          // 测试管理
          ['test_status', '测试状态', '测试管理', JSON.stringify([
            {value:'pending',label:'待测试'},{value:'in_progress',label:'测试中'},{value:'completed',label:'已完成'},{value:'failed',label:'失败'}
          ]), 10],
          ['test_priority', '优先级', '测试管理', JSON.stringify([
            {value:'low',label:'低'},{value:'medium',label:'中'},{value:'high',label:'高'},{value:'urgent',label:'紧急'}
          ]), 11],
          // 缺陷管理
          ['bug_status', '缺陷状态', '缺陷管理', JSON.stringify([
            {value:'open',label:'待处理'},{value:'in_progress',label:'处理中'},{value:'fixed',label:'已修复'},{value:'closed',label:'已关闭'},{value:'reopened',label:'重新打开'}
          ]), 12],
          ['bug_priority', '缺陷优先级', '缺陷管理', JSON.stringify([
            {value:'low',label:'低'},{value:'medium',label:'中'},{value:'high',label:'高'},{value:'urgent',label:'紧急'}
          ]), 13],
          ['severity', '严重程度', '缺陷管理', JSON.stringify([
            {value:'advice',label:'建议'},{value:'prompt',label:'提示'},{value:'normal',label:'一般'},{value:'serious',label:'严重'},{value:'fatal',label:'致命'}
          ]), 14],
          // 配置计划
          ['plan_adapt_status', '适配进展', '配置计划', JSON.stringify([
            {value:'not_started',label:'未开始'},{value:'adapting',label:'适配中'},{value:'finished',label:'已结束'}
          ]), 15],
          // 用户管理
          ['user_role', '用户角色', '用户管理', JSON.stringify([
            {value:'admin',label:'管理员'},{value:'user',label:'普通用户'}
          ]), 16],
        ];
        const stmt = db.prepare('INSERT INTO field_options (field_key, field_label, field_group, options, sort_order) VALUES (?, ?, ?, ?, ?)');
        defaultOptions.forEach(opt => stmt.run(opt));
        stmt.finalize();
        console.log('字段选项默认数据初始化完成');
      }
    });
  }
});

const fieldOptionsRouter = express.Router();
fieldOptionsRouter.use(auth.verifyToken);

// 获取所有字段选项
fieldOptionsRouter.get('/', (req, res) => {
  db.all('SELECT * FROM field_options ORDER BY sort_order ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // 解析 options JSON
    const data = rows.map(row => ({
      ...row,
      options: JSON.parse(row.options)
    }));
    res.json({ success: true, data });
  });
});

// 获取单个字段的选项
fieldOptionsRouter.get('/:fieldKey', (req, res) => {
  db.get('SELECT * FROM field_options WHERE field_key = ?', [req.params.fieldKey], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '字段不存在' });
    row.options = JSON.parse(row.options);
    res.json({ success: true, data: row });
  });
});

// 更新字段选项
fieldOptionsRouter.put('/:fieldKey', (req, res) => {
  const { options, field_label, field_group } = req.body;
  if (!options || !Array.isArray(options)) {
    return res.status(400).json({ error: 'options 必须是数组' });
  }
  const sql = `UPDATE field_options SET options = ?, field_label = COALESCE(?, field_label), 
               field_group = COALESCE(?, field_group), updated_at = CURRENT_TIMESTAMP 
               WHERE field_key = ?`;
  db.run(sql, [JSON.stringify(options), field_label, field_group, req.params.fieldKey], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '字段不存在' });
    res.json({ success: true });
  });
});

// 新增字段选项
fieldOptionsRouter.post('/', (req, res) => {
  const { field_key, field_label, field_group, options, sort_order } = req.body;
  if (!field_key || !field_label || !field_group || !options) {
    return res.status(400).json({ error: '缺少必要字段' });
  }
  const sql = `INSERT INTO field_options (field_key, field_label, field_group, options, sort_order) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [field_key, field_label, field_group, JSON.stringify(options), sort_order || 0], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '字段key已存在' });
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, id: this.lastID });
  });
});

// 删除字段选项
fieldOptionsRouter.delete('/:fieldKey', (req, res) => {
  db.run('DELETE FROM field_options WHERE field_key = ?', [req.params.fieldKey], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ==================== 适配记录 API ====================
const adaptationRouter = express.Router();
adaptationRouter.use(auth.verifyToken);

// 获取所有适配记录（按设备分组）
adaptationRouter.get('/', (req, res) => {
  const sql = `SELECT ar.*, d.name as device_name, g.name as game_name, 
               g.platform as game_platform, g.game_type
               FROM adaptation_records ar
               LEFT JOIN devices d ON ar.device_id = d.id
               LEFT JOIN games g ON ar.game_id = g.id
               ORDER BY ar.device_id, ar.created_at DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取指定设备的适配记录
adaptationRouter.get('/device/:deviceId', (req, res) => {
  const sql = `SELECT ar.*, g.name as game_name, g.platform as game_platform, g.game_type
               FROM adaptation_records ar
               LEFT JOIN games g ON ar.game_id = g.id
               WHERE ar.device_id = ?
               ORDER BY ar.created_at DESC`;
  db.all(sql, [req.params.deviceId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 添加适配记录
adaptationRouter.post('/', (req, res) => {
  const { device_id, game_id, adapter_progress, owner_name, online_status, quality } = req.body;
  const sql = `INSERT OR REPLACE INTO adaptation_records (device_id, game_id, adapter_progress, owner_name, online_status, quality)
               VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(sql, [device_id, game_id, adapter_progress || 0, owner_name || '', online_status || 'pending', quality || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

// 批量添加适配记录
adaptationRouter.post('/batch', (req, res) => {
  const { records } = req.body;
  if (!records || !Array.isArray(records)) return res.status(400).json({ error: 'records 必须是数组' });
  const stmt = db.prepare(`INSERT OR REPLACE INTO adaptation_records (device_id, game_id, adapter_progress, owner_name, online_status, quality) VALUES (?, ?, ?, ?, ?, ?)`);
  let errors = 0;
  records.forEach(r => {
    stmt.run([r.device_id, r.game_id, r.adapter_progress || 0, r.owner_name || '', r.online_status || 'pending', r.quality || ''], (err) => { if (err) errors++; });
  });
  stmt.finalize(() => {
    res.json({ success: true, count: records.length, errors });
  });
});

// 更新适配记录
adaptationRouter.put('/:id', (req, res) => {
  const { adapter_progress, owner_name, online_status, quality } = req.body;
  const sql = `UPDATE adaptation_records SET adapter_progress = COALESCE(?, adapter_progress), 
               owner_name = COALESCE(?, owner_name), online_status = COALESCE(?, online_status), 
               quality = COALESCE(?, quality), updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, [adapter_progress, owner_name, online_status, quality, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 删除适配记录
adaptationRouter.delete('/:id', (req, res) => {
  db.run('DELETE FROM adaptation_records WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ==================== 配置计划 API ====================
const plansRouter = express.Router();
plansRouter.use(auth.verifyToken);

// 获取所有计划
plansRouter.get('/', (req, res) => {
  db.all('SELECT * FROM plans ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const data = rows.map(r => ({ ...r, devices_json: JSON.parse(r.devices_json || '[]') }));
    res.json({ success: true, data });
  });
});

// 获取计划详情（含游戏列表）
plansRouter.get('/:id', (req, res) => {
  db.get('SELECT * FROM plans WHERE id = ?', [req.params.id], (err, plan) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!plan) return res.status(404).json({ error: '计划不存在' });
    plan.devices_json = JSON.parse(plan.devices_json || '[]');
    db.all('SELECT * FROM plan_games WHERE plan_id = ? ORDER BY sort_order', [plan.id], (err2, games) => {
      if (err2) return res.status(500).json({ error: err2.message });
      games = games.map(g => ({ ...g, bugs_json: JSON.parse(g.bugs_json || '[]') }));
      res.json({ success: true, data: { ...plan, games } });
    });
  });
});

// 创建计划
plansRouter.post('/', (req, res) => {
  const { title, plan_date, devices_json, interlace_version, client_version, goal, tab_name, games } = req.body;
  const sql = `INSERT INTO plans (title, plan_date, devices_json, interlace_version, client_version, goal, tab_name) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [title, plan_date, JSON.stringify(devices_json || []), interlace_version || '', client_version || '', goal || '', tab_name || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    const planId = this.lastID;
    // 插入计划内游戏
    if (games && games.length > 0) {
      const stmt = db.prepare(`INSERT INTO plan_games (plan_id, game_id, game_name, game_platform, game_type, owner_name, adapt_status, remark, bugs_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      games.forEach((g, i) => {
        stmt.run([planId, g.game_id || null, g.game_name, g.game_platform || '', g.game_type || '', g.owner_name || '', g.adapt_status || 'not_started', g.remark || '', JSON.stringify(g.bugs_json || []), i]);
      });
      stmt.finalize();
    }
    res.json({ success: true, id: planId });
  });
});

// 更新计划内游戏
plansRouter.put('/game/:gameId', (req, res) => {
  const { adapt_status, owner_name, remark } = req.body;
  const sql = `UPDATE plan_games SET adapt_status = COALESCE(?, adapt_status), owner_name = COALESCE(?, owner_name), remark = COALESCE(?, remark), updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, [adapt_status, owner_name, remark, req.params.gameId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 删除计划内单个游戏
plansRouter.delete('/game/:gameId', (req, res) => {
  db.run('DELETE FROM plan_games WHERE id = ?', [req.params.gameId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 删除计划
plansRouter.delete('/:id', (req, res) => {
  db.run('DELETE FROM plan_games WHERE plan_id = ?', [req.params.id], () => {
    db.run('DELETE FROM plans WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// ==================== Dashboard 统计 API ====================
const statsRouter = express.Router();
statsRouter.use(auth.verifyToken);

statsRouter.get('/dashboard', (req, res) => {
  const stats = {};
  const queries = [
    { key: 'games_total', sql: 'SELECT COUNT(*) as count FROM games' },
    { key: 'devices_total', sql: 'SELECT COUNT(*) as count FROM devices' },
    { key: 'members_total', sql: "SELECT COUNT(*) as count FROM users WHERE is_member = 1" },
    { key: 'bugs_open', sql: "SELECT COUNT(*) as count FROM bugs WHERE bug_status IN ('open','in_progress')" },
    { key: 'bugs_total', sql: 'SELECT COUNT(*) as count FROM bugs' },
    { key: 'tests_total', sql: 'SELECT COUNT(*) as count FROM tests' },
    { key: 'adaptation_total', sql: 'SELECT COUNT(*) as count FROM adaptation_records' },
    { key: 'adaptation_completed', sql: "SELECT COUNT(*) as count FROM adaptation_records WHERE online_status = 'online'" },
    { key: 'platform_distribution', sql: "SELECT platform, COUNT(*) as count FROM games WHERE platform IS NOT NULL AND platform != '' GROUP BY platform ORDER BY count DESC" },
    { key: 'online_status_distribution', sql: "SELECT online_status, COUNT(*) as count FROM games GROUP BY online_status" },
    { key: 'bug_status_distribution', sql: "SELECT bug_status, COUNT(*) as count FROM bugs GROUP BY bug_status" },
    { key: 'recent_games', sql: "SELECT name, platform, adaptation_status, created_at FROM games ORDER BY created_at DESC LIMIT 5" },
  ];

  let completed = 0;
  queries.forEach(q => {
    if (q.key.includes('distribution') || q.key.includes('recent')) {
      db.all(q.sql, [], (err, rows) => {
        stats[q.key] = err ? [] : rows;
        completed++;
        if (completed === queries.length) res.json({ success: true, data: stats });
      });
    } else {
      db.get(q.sql, [], (err, row) => {
        stats[q.key] = err ? 0 : (row ? row.count : 0);
        completed++;
        if (completed === queries.length) res.json({ success: true, data: stats });
      });
    }
  });
});

// ==================== 活动日志 API ====================
statsRouter.get('/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  db.all(
    `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?`,
    [limit], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: rows || [] });
    }
  );
});

// ==================== 适配矩阵 API ====================
statsRouter.get('/matrix', (req, res) => {
  // 获取所有设备
  db.all('SELECT id, name, device_type FROM devices ORDER BY id', [], (err, devices) => {
    if (err) return res.status(500).json({ error: err.message });
    // 获取有适配记录的游戏
    db.all(`SELECT DISTINCT g.id, g.name, g.platform FROM games g 
            INNER JOIN adaptation_records ar ON g.id = ar.game_id 
            ORDER BY g.name`, [], (err2, games) => {
      if (err2) return res.status(500).json({ error: err2.message });
      // 获取所有适配记录
      db.all('SELECT device_id, game_id, adapter_progress, online_status FROM adaptation_records', [], (err3, records) => {
        if (err3) return res.status(500).json({ error: err3.message });
        // 构建映射
        const recordMap = {};
        records.forEach(r => {
          recordMap[`${r.device_id}-${r.game_id}`] = { progress: r.adapter_progress, status: r.online_status };
        });
        res.json({ success: true, data: { devices, games, recordMap } });
      });
    });
  });
});

// ==================== 全局搜索 API ====================
statsRouter.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 1) return res.json({ success: true, data: [] });
  const like = `%${q}%`;
  const results = [];
  const searches = [
    { type: 'game', icon: '🎮', label: '游戏',
      sql: `SELECT id, name as title, platform as subtitle FROM games WHERE name LIKE ? OR english_name LIKE ? OR game_id LIKE ? LIMIT 8`,
      params: [like, like, like] },
    { type: 'device', icon: '📱', label: '设备',
      sql: `SELECT id, name as title, manufacturer as subtitle FROM devices WHERE name LIKE ? OR manufacturer LIKE ? LIMIT 5`,
      params: [like, like] },
    { type: 'member', icon: '👥', label: '成员',
      sql: `SELECT id, real_name as title, project_role as subtitle FROM users WHERE is_member = 1 AND (real_name LIKE ? OR project_role LIKE ? OR wechat_id LIKE ?) LIMIT 5`,
      params: [like, like, like] },
    { type: 'bug', icon: '🐛', label: '缺陷',
      sql: `SELECT id, description as title, device_name as subtitle FROM bugs WHERE description LIKE ? OR device_name LIKE ? OR owner LIKE ? LIMIT 5`,
      params: [like, like, like] },
    { type: 'test', icon: '🧪', label: '测试',
      sql: `SELECT id, name as title, '' as subtitle FROM tests WHERE name LIKE ? OR description LIKE ? LIMIT 5`,
      params: [like, like] },
    { type: 'plan', icon: '📋', label: '计划',
      sql: `SELECT id, title, tab_name as subtitle FROM plans WHERE title LIKE ? OR tab_name LIKE ? OR goal LIKE ? LIMIT 5`,
      params: [like, like, like] },
  ];
  let completed = 0;
  searches.forEach(s => {
    db.all(s.sql, s.params, (err, rows) => {
      if (!err && rows && rows.length > 0) {
        rows.forEach(r => results.push({ ...r, type: s.type, icon: s.icon, typeLabel: s.label }));
      }
      completed++;
      if (completed === searches.length) {
        res.json({ success: true, data: results.slice(0, 20) });
      }
    });
  });
});

// ==================== 通用批量删除 API ====================
const batchRouter = express.Router();
batchRouter.use(auth.verifyToken);

batchRouter.post('/delete', (req, res) => {
  const { resource, ids } = req.body;
  const allowedTables = { members: 'users', devices: 'devices', games: 'games', tests: 'tests', bugs: 'bugs', adaptations: 'adaptation_records' };
  const table = allowedTables[resource];
  if (!table) return res.status(400).json({ error: 'Invalid resource type' });
  if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids must be a non-empty array' });
  if (ids.length > 100) return res.status(400).json({ error: 'Maximum 100 items per batch' });
  
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity('batch_delete', resource, 0, `批量删除 ${this.changes} 条`, JSON.stringify({ ids }));
    res.json({ success: true, deleted: this.changes });
  });
});

// 注册路由
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/members', membersRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/games', gamesRouter);
app.use('/api/tests', testsRouter);
app.use('/api/bugs', bugsRouter);
app.use('/api/field-options', fieldOptionsRouter);
app.use('/api/adaptations', adaptationRouter);
app.use('/api/plans', plansRouter);
app.use('/api/stats', statsRouter);
app.use('/api/batch', batchRouter);

// 启动服务器 (监听所有网络接口，支持外网访问)
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`);
  console.log(`本机访问: http://localhost:${PORT}`);
});
