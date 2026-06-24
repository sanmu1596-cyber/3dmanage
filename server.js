const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const db = require('./database');
const path = require('path');
const auth = require('./auth');
const usersController = require('./usersController');
const gameIssuesRouter = require('./game-issues');
const equipmentRouter = require('./equipment');
const gameVersionsRouter = require('./game-versions');
const interlaceIssuesRouter = require('./interlace-issues');
const interlaceVersionsRouter = require('./interlace-versions');
const clientIssuesRouter = require('./client-issues');
const tencentBoardRouter = require('./tencent-board');
const { validate, rules } = require('./validator');

const app = express();
const PORT = 3000;

// 中间件
app.use(compression()); // gzip压缩：~13MB静态资源压缩后约2-3MB
app.use(cors());
app.use(cookieParser()); // 解析Cookie（用于开发者密钥验证）

app.use(bodyParser.json({ limit: '30mb' })); // 30MB 上限：支持游戏问题/评论里的 base64 图片视频
// 静态文件：开发阶段禁用缓存，确保每次加载最新；生产环境可改回 maxAge: '1d'
app.use(express.static('public', {
  maxAge: 0,
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// ==================== 操作日志表 ====================
db.run(`CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER DEFAULT 0,
  user_name TEXT DEFAULT 'system',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  resource_name TEXT DEFAULT '',
  changes_json TEXT DEFAULT '{}',
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
// 注：已有数据库的activity_log表可能缺少user_id/ip_address/user_agent列
// 新建数据库已包含这些列。旧库兼容：INSERT时新列为NULL/默认值，不影响功能

// ==================== 新模块表（原 migration_new_modules）====================
// 启动时自动确保这些表存在，避免手动执行遗漏
const newModuleTables = [
  // 游戏版本表
  `CREATE TABLE IF NOT EXISTS game_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER,
    game_name TEXT,
    version_number TEXT NOT NULL,
    status TEXT DEFAULT 'testing',
    version_date TEXT,
    changelog TEXT,
    notes TEXT,
    updater_id INTEGER,
    updater_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // 交织问题表
  `CREATE TABLE IF NOT EXISTS interlace_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_type TEXT,
    version TEXT,
    priority TEXT,
    issue_desc TEXT,
    owner TEXT,
    status TEXT DEFAULT '待处理',
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // 交织版本表
  `CREATE TABLE IF NOT EXISTS interlace_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_number TEXT NOT NULL,
    status TEXT DEFAULT 'testing',
    version_date TEXT,
    changelog TEXT,
    notes TEXT,
    updater_id INTEGER,
    updater_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // 客户端问题表
  `CREATE TABLE IF NOT EXISTS client_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_type TEXT,
    version TEXT,
    priority TEXT,
    issue_desc TEXT,
    owner TEXT,
    status TEXT DEFAULT '待处理',
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // 腾讯系游戏开发进展 看板（分组 + 行 + 配置）
  `CREATE TABLE IF NOT EXISTS tx_board_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board TEXT DEFAULT 'tencent',
    group_key TEXT,
    title TEXT,
    cols TEXT DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tx_board_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER,
    cells TEXT DEFAULT '[]',
    fills TEXT DEFAULT '[]',
    aligns TEXT DEFAULT '[]',
    valigns TEXT DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tx_board_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // 索引
  'CREATE INDEX IF NOT EXISTS idx_game_versions_game ON game_versions(game_id)',
  'CREATE INDEX IF NOT EXISTS idx_game_versions_status ON game_versions(status)',
  'CREATE INDEX IF NOT EXISTS idx_interlace_issues_status ON interlace_issues(status)',
  'CREATE INDEX IF NOT EXISTS idx_interlace_versions_status ON interlace_versions(status)',
  'CREATE INDEX IF NOT EXISTS idx_client_issues_status ON client_issues(status)',
  'CREATE INDEX IF NOT EXISTS idx_tx_board_rows_group ON tx_board_rows(group_id)'
];
newModuleTables.forEach((sql, i) => {
  db.run(sql, (err) => {
    if (err) console.error(`  [启动] 新模块建表 ${i+1} 失败:`, err.message);
  });
});

// 兼容旧库：确保 tx_board_rows 表有 fills / aligns / valigns 列（JSON 数组）
db.all("PRAGMA table_info(tx_board_rows)", [], (err, columns) => {
  if (err || !columns) return;
  if (!columns.some(c => c.name === 'fills')) {
    db.run("ALTER TABLE tx_board_rows ADD COLUMN fills TEXT DEFAULT '[]'", (e) => {
      if (e) console.error('  [启动] tx_board_rows添加fills失败:', e.message);
      else console.log('  [启动] tx_board_rows表已添加fills列');
    });
  }
  if (!columns.some(c => c.name === 'aligns')) {
    db.run("ALTER TABLE tx_board_rows ADD COLUMN aligns TEXT DEFAULT '[]'", (e) => {
      if (e) console.error('  [启动] tx_board_rows添加aligns失败:', e.message);
      else console.log('  [启动] tx_board_rows表已添加aligns列（水平对齐）');
    });
  }
  if (!columns.some(c => c.name === 'valigns')) {
    db.run("ALTER TABLE tx_board_rows ADD COLUMN valigns TEXT DEFAULT '[]'", (e) => {
      if (e) console.error('  [启动] tx_board_rows添加valigns失败:', e.message);
      else console.log('  [启动] tx_board_rows表已添加valigns列（垂直对齐）');
    });
  }
});

// 兼容旧库：确保 tx_board_groups 表有 board 列（多看板区分，旧数据归入 'tencent'）
db.all("PRAGMA table_info(tx_board_groups)", [], (err, columns) => {
  if (err || !columns) return;
  if (!columns.some(c => c.name === 'board')) {
    db.run("ALTER TABLE tx_board_groups ADD COLUMN board TEXT DEFAULT 'tencent'", (e) => {
      if (e) console.error('  [启动] tx_board_groups添加board失败:', e.message);
      else {
        db.run("UPDATE tx_board_groups SET board = 'tencent' WHERE board IS NULL OR board = ''");
        console.log('  [启动] tx_board_groups表已添加board列（多看板区分）');
      }
    });
  }
});

// 兼容旧库：旧的 meta key='board' 迁移为 key='board:tencent'
db.run("UPDATE tx_board_meta SET key = 'board:tencent' WHERE key = 'board'", () => {});

// 兼容旧库：确保 devices 表有 sort_order 列
db.all("PRAGMA table_info(devices)", [], (err, columns) => {
  if (err || !columns) return;
  const hasSortOrder = columns.some(c => c.name === 'sort_order');
  if (!hasSortOrder) {
    db.run("ALTER TABLE devices ADD COLUMN sort_order INTEGER DEFAULT 0", (e) => {
      if (e) console.error('  [启动] devices添加sort_order失败:', e.message);
      else console.log('  [启动] devices表已添加sort_order列');
    });
  }
  const hasOnlineGames = columns.some(c => c.name === 'online_games');
  if (!hasOnlineGames) {
    db.run("ALTER TABLE devices ADD COLUMN online_games INTEGER DEFAULT 0", (e) => {
      if (e) console.error('  [启动] devices添加online_games失败:', e.message);
      else console.log('  [启动] devices表已添加online_games列');
    });
  }
  const hasTotalGames = columns.some(c => c.name === 'total_games');
  if (!hasTotalGames) {
    db.run("ALTER TABLE devices ADD COLUMN total_games INTEGER DEFAULT 0", (e) => {
      if (e) console.error('  [启动] devices添加total_games失败:', e.message);
      else console.log('  [启动] devices表已添加total_games列');
    });
  }
});

// 兼容旧库：确保 adaptation_records 表有 issue_notes 列
db.all("PRAGMA table_info(adaptation_records)", [], (err, columns) => {
  if (err || !columns) return;
  const hasIssueNotes = columns.some(c => c.name === 'issue_notes');
  if (!hasIssueNotes) {
    db.run("ALTER TABLE adaptation_records ADD COLUMN issue_notes TEXT DEFAULT ''", (e) => {
      if (e) console.error('  [启动] adaptation_records添加issue_notes失败:', e.message);
      else console.log('  [启动] adaptation_records表已添加issue_notes列');
    });
  }
});

// 兼容旧库：确保 bugs 表有 game_name / impact_scope 列（P0-1 + P1-2）
db.all("PRAGMA table_info(bugs)", [], (err, columns) => {
  if (err || !columns) return;
  const hasGameName = columns.some(c => c.name === 'game_name');
  if (!hasGameName) {
    db.run("ALTER TABLE bugs ADD COLUMN game_name TEXT", (e) => {
      if (e) console.error('  [启动] bugs添加game_name失败:', e.message);
      else console.log('  [启动] bugs表已添加game_name列');
    });
  }
  // P1-2: 影响范围 single=仅该客户 / all=影响所有客户
  const hasImpactScope = columns.some(c => c.name === 'impact_scope');
  if (!hasImpactScope) {
    db.run("ALTER TABLE bugs ADD COLUMN impact_scope TEXT DEFAULT 'single'", (e) => {
      if (e) console.error('  [启动] bugs添加impact_scope失败:', e.message);
      else console.log('  [启动] bugs表已添加impact_scope列');
    });
  }
});

// 记录操作日志的辅助函数（增强版：req可选，传入时记录用户信息+IP审计）
function logActivity(action, resourceType, resourceId, resourceName, changesJson, req) {
  const userName = (req && req.user) ? (req.user.real_name || req.user.username) : 'system';
  const userId = (req && req.user) ? req.user.id : 0;
  const ip = req ? (req.ip || req.headers['x-forwarded-for'] || '') : '';
  const ua = req ? (req.headers['user-agent'] || '').slice(0, 200) : '';
  db.run(
    `INSERT INTO activity_log (user_id, user_name, action, resource_type, resource_id, resource_name, changes_json, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, userName, action, resourceType, resourceId || 0, resourceName || '', changesJson || '{}', ip, ua]
  );
}

// 审计日志自动清理（保留90天）
setInterval(() => {
  db.run("DELETE FROM activity_log WHERE created_at < datetime('now', '-90 days')", () => {});
}, 24 * 60 * 60 * 1000);

// ==================== 公开接口（不需要token） ====================
// 前端通过此接口判断是否需要登录（根据访问来源动态判断）
app.get('/api/config', (req, res) => {
  const devMode = auth.isDevMode(req);
  res.json({ success: true, devMode });
});

// ==================== 认证路由（不需要token） ====================
const authRouter = express.Router();
authRouter.post('/login', usersController.login);
authRouter.post('/logout', usersController.logout);
authRouter.get('/me', auth.verifyToken, usersController.getCurrentUser);
authRouter.get('/permissions', auth.verifyToken, usersController.getCurrentUserPermissions);

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
const versionsRouter = express.Router();

// 应用认证中间件
membersRouter.use(auth.verifyToken);
devicesRouter.use(auth.verifyToken);
gamesRouter.use(auth.verifyToken);
testsRouter.use(auth.verifyToken);
bugsRouter.use(auth.verifyToken);
versionsRouter.use(auth.verifyToken);

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

membersRouter.post('/', auth.checkPermission('members', 'edit'),
  validate({
    name: rules.name(50).required(),
  }),
  (req, res) => {
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

membersRouter.put('/:id', auth.checkPermission('members', 'edit'),
  validate({ name: rules.name(50) }),
  (req, res) => {
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

// 单字段更新（行内编辑用）
membersRouter.patch('/:id', auth.checkPermission('members', 'edit'), (req, res) => {
  const allowedFields = ['real_name', 'wechat_id', 'project_role', 'duty', 'status'];
  const fieldMap = { name: 'real_name', role: 'project_role' }; // 前端字段名 → 数据库字段名
  const updates = [];
  const values = [];
  for (const [key, val] of Object.entries(req.body)) {
    const dbField = fieldMap[key] || key;
    if (allowedFields.includes(dbField)) {
      updates.push(`${dbField} = ?`);
      values.push(val);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: '没有可更新的字段' });
  values.push(req.params.id);
  const sql = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_member = 1`;
  db.run(sql, values, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '成员不存在' });
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
               ORDER BY d.sort_order ASC, d.id ASC`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, data: rows });
  });
});

devicesRouter.post('/', auth.checkPermission('devices', 'edit'),
  validate({
    name: rules.name(100),
    manufacturer: rules.required().maxLen(100),
    device_type: rules.optional(50),
  }),
  (req, res) => {
  const { manufacturer, device_type, name, requirements, quantity, keeper,
          notes, adapter_completion_rate, total_bugs, completed_adaptations,
          total_games, status, assigned_to } = req.body;
  const sql = `INSERT INTO devices (manufacturer, device_type, name, requirements, quantity,
                                   keeper, notes, adapter_completion_rate, total_bugs,
                                   completed_adaptations, total_games, status, assigned_to,
                                   sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM devices))`;
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

devicesRouter.put('/:id', auth.checkPermission('devices', 'edit'),
  validate({ name: rules.name(100), manufacturer: rules.required().maxLen(100) }),
  (req, res) => {
  const { manufacturer, device_type, name, requirements, quantity, keeper,
          notes, adapter_completion_rate, total_bugs, completed_adaptations,
          total_games, status, assigned_to } = req.body;
  const sql = `UPDATE devices SET manufacturer = ?, device_type = ?, name = ?, requirements = ?, quantity = ?,
                                 keeper = ?, notes = ?, adapter_completion_rate = ?, total_bugs = ?,
                                 completed_adaptations = ?, total_games = ?, status = ?, assigned_to = ?,
                                 updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  console.log('[PUT /devices/:id] 请求数据:', req.body);
  db.run(sql, [manufacturer, device_type, name, requirements, quantity, keeper,
               notes, adapter_completion_rate, total_bugs, completed_adaptations,
               total_games, status, assigned_to, req.params.id], function(err) {
    if (err) {
      console.error('[PUT /devices/:id] 数据库错误:', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log('[PUT /devices/:id] 更新成功, ID:', req.params.id);
    res.json({ success: true });
  });
});

// 设备行拖拽排序（必须在 /:id 路由之前）
devicesRouter.patch('/reorder', auth.checkPermission('devices', 'edit'), (req, res) => {
  const { orders } = req.body;
  if (!Array.isArray(orders) || orders.length === 0) {
    return res.status(400).json({ error: 'orders 必须是非空数组' });
  }
  const validIds = orders.filter(o => Number.isInteger(o.id) && Number.isInteger(o.sort_order));
  if (validIds.length !== orders.length) {
    return res.status(400).json({ error: '每项必须包含有效的 id 和 sort_order 整数' });
  }
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    const sql = 'UPDATE devices SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    let pending = validIds.length;
    let hasError = false;
    validIds.forEach(({ id, sort_order }) => {
      if (hasError) return;
      db.run(sql, [sort_order, id], (err) => {
        if (err) { hasError = true; return; }
        if (--pending === 0 && !hasError) {
          db.run('COMMIT');
          console.log('[PATCH /devices/reorder] 排序更新成功，共', validIds.length, '条');
          res.json({ success: true, updated: validIds.length });
        } else if (pending === 0 && hasError) {
          db.run('ROLLBACK');
          res.status(500).json({ error: '排序更新失败' });
        }
      });
    });
    if (validIds.length === 0) {
      db.run('ROLLBACK');
      res.status(400).json({ error: '无有效数据' });
    }
  });
});

// 单字段更新（行内编辑用）
devicesRouter.patch('/:id', auth.checkPermission('devices', 'edit'), (req, res) => {
  const allowedFields = ['requirements', 'quantity', 'keeper', 'notes', 'manufacturer',
                         'device_type', 'name', 'status', 'adapter_completion_rate',
                         'total_bugs', 'completed_adaptations', 'total_games', 'assigned_to'];
  const updates = [];
  const values = [];
  for (const [key, val] of Object.entries(req.body)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: '没有可更新的字段' });
  values.push(req.params.id);
  const sql = `UPDATE devices SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, values, function(err) {
    if (err) return res.status(500).json({ error: err.message });
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

gamesRouter.post('/', auth.checkPermission('games', 'edit'),
  validate({
    name: rules.name(100),
    platform: rules.optional(30),
    game_type: rules.optional(50),
    description: rules.textArea(2000),
  }),
  (req, res) => {
  const { name, english_name, platform, game_id, game_type, description,
          developer, operator, release_date, config_path, adapter_progress,
          version, package_size, adaptation_status, adaptation_notes, owner_id, online_status, quality,
          game_account, storage_location, game_engine } = req.body;
  const sql = `INSERT INTO games (name, english_name, platform, game_id, game_type, description,
                                  developer, operator, release_date, config_path, adapter_progress,
                                  version, package_size, adaptation_status, adaptation_notes, owner_id, online_status, quality,
                                  game_account, storage_location, game_engine)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [name, english_name, platform, game_id, game_type, description,
               developer, operator, release_date, config_path, adapter_progress,
               version, package_size, adaptation_status, adaptation_notes, owner_id, online_status, quality,
               game_account, storage_location, game_engine], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    logActivity('create', 'game', this.lastID, name);
    res.json({ success: true, id: this.lastID });
  });
});

gamesRouter.put('/:id', auth.checkPermission('games', 'edit'),
  validate({ name: rules.name(100), platform: rules.optional(30) }),
  (req, res) => {
  const { name, english_name, platform, game_id, game_type, description,
          developer, operator, release_date, config_path, adapter_progress,
          version, package_size, adaptation_status, adaptation_notes, owner_id, online_status, quality,
          game_account, storage_location, game_engine } = req.body;
  const sql = `UPDATE games SET name = ?, english_name = ?, platform = ?, game_id = ?, game_type = ?,
                              description = ?, developer = ?, operator = ?, release_date = ?, config_path = ?,
                              adapter_progress = ?, version = ?, package_size = ?, adaptation_status = ?,
                              adaptation_notes = ?, owner_id = ?, online_status = ?, quality = ?,
                              game_account = ?, storage_location = ?, game_engine = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  db.run(sql, [name, english_name, platform, game_id, game_type, description,
               developer, operator, release_date, config_path, adapter_progress,
               version, package_size, adaptation_status, adaptation_notes, owner_id, online_status, quality,
               game_account, storage_location, game_engine, req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    logActivity('update', 'game', parseInt(req.params.id), name);
    res.json({ success: true });
  });
});

// 单字段行内编辑（PATCH）
gamesRouter.patch('/:id', auth.checkPermission('games', 'edit'), (req, res) => {
  // ★ 与游戏列表所有可编辑字段保持一致（昨天新增了 online_status 等9个可双击编辑的字段，必须同步白名单）
  const allowedFields = [
    'name', 'english_name', 'platform', 'game_id', 'game_type',
    'description', 'developer', 'operator', 'release_date', 'config_path',
    'adapter_progress', 'owner_id', 'online_status', 'quality',
    'game_account', 'storage_location', 'game_engine'
  ];
  const updates = [];
  const values = [];
  for (const [key, val] of Object.entries(req.body)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: '没有可更新的字段' });
  values.push(req.params.id);
  const sql = `UPDATE games SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, values, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '游戏不存在' });
    // 如果更新了 owner_id，返回关联的 owner_name
    if (req.body.owner_id !== undefined) {
      db.get('SELECT u.real_name as owner_name FROM games g LEFT JOIN users u ON g.owner_id = u.id WHERE g.id = ?', [req.params.id], (e, row) => {
        res.json({ success: true, owner_name: row ? row.owner_name : null });
      });
    } else {
      res.json({ success: true });
    }
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

testsRouter.post('/', auth.checkPermission('tests', 'edit'),
  validate({
    name: rules.name(100),
    status: rules.statusEnum(['pending','in_progress','passed','failed','blocked','skipped']),
    priority: rules.requiredEnum(['low','medium','high'], '优先级'),
    description: rules.textArea(2000),
  }),
  (req, res) => {
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

testsRouter.put('/:id', auth.checkPermission('tests', 'edit'),
  validate({ name: rules.name(100), priority: rules.requiredEnum(['low','medium','high'], '优先级') }),
  (req, res) => {
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

bugsRouter.post('/', auth.checkPermission('bugs', 'edit'),
  validate({
    device_name: rules.name(100),
    priority: rules.requiredEnum(['low','medium','high','urgent'], '优先级'),
    bug_status: rules.statusEnum(['new','in_progress','fixed','verified','closed','wontfix','reopened']),
    description: rules.textArea(2000),
    steps: rules.textArea(3000),
  }),
  (req, res) => {
  const { versions, actual_fix_time, planned_fix_time, device_name, game_name, impact_scope, discovery_time,
          owner, bug_status, priority, problem_type, description, steps, test_id, assignee_id } = req.body;
  const scope = (impact_scope === 'all') ? 'all' : 'single';
  // 影响所有客户时不绑定具体客户名
  const deviceNameVal = (scope === 'all') ? '' : device_name;
  const sql = `INSERT INTO bugs (versions, actual_fix_time, planned_fix_time, device_name, game_name, impact_scope, discovery_time,
                                owner, bug_status, priority, problem_type, description, steps, test_id, assignee_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [versions, actual_fix_time, planned_fix_time, deviceNameVal, game_name, scope, discovery_time,
               owner, bug_status, priority, problem_type, description, steps, test_id, assignee_id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const bugId = this.lastID;
    // 如果指定了负责人，生成通知
    if (assignee_id) {
      const shortDesc = (description || '').slice(0, 50);
      createNotification(assignee_id, 'bug_assigned', '新缺陷分配给您', `缺陷「${shortDesc}...」已分配给您处理`, 'bug', bugId);
    }
    // 高优先级缺陷通知所有人
    if (priority === '高' || priority === 'high' || priority === '紧急') {
      const shortDesc = (description || '').slice(0, 50);
      createNotification(null, 'bug_high_priority', '高优先级缺陷', `发现高优先级缺陷「${shortDesc}...」，请关注`, 'bug', bugId);
    }
    res.json({ success: true, id: bugId });
  });
});

bugsRouter.put('/:id', auth.checkPermission('bugs', 'edit'),
  validate({
    device_name: rules.name(100),
    priority: rules.requiredEnum(['low','medium','high','urgent'], '优先级'),
    bug_status: rules.statusEnum(['new','in_progress','fixed','verified','closed','wontfix','reopened']),
    description: rules.textArea(2000),
  }),
  (req, res) => {
  const { versions, actual_fix_time, planned_fix_time, device_name, game_name, impact_scope, discovery_time,
          owner, bug_status, priority, problem_type, description, steps, test_id, assignee_id } = req.body;
  const scope = (impact_scope === 'all') ? 'all' : 'single';
  const deviceNameVal = (scope === 'all') ? '' : device_name;
  const sql = `UPDATE bugs SET versions = ?, actual_fix_time = ?, planned_fix_time = ?, device_name = ?, game_name = ?, impact_scope = ?,
                            discovery_time = ?, owner = ?, bug_status = ?, priority = ?, problem_type = ?,
                            description = ?, steps = ?, test_id = ?, assignee_id = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  db.run(sql, [versions, actual_fix_time, planned_fix_time, deviceNameVal, game_name, scope, discovery_time,
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
          ['online_status', '适配状态', '游戏管理', JSON.stringify([
            {value:'undeveloped',label:'未开始'},{value:'developing',label:'开发中'},{value:'completed',label:'已发布'},{value:'anticheat',label:'反外挂'},{value:'not_applicable',label:'不适用'}
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
    // 注：online_status「适配状态」的字段名与选项迁移统一在文件末尾的数据迁移段执行（单一数据源）
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
adaptationRouter.post('',
  validate({
    device_id: rules.id(),
    game_id: rules.id(),
    adapter_progress: rules.optional().isInt().min(0).max(100),
  }),
  (req, res) => {
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
adaptationRouter.put('/:id',
  validate({ adapter_progress: rules.optional().isInt().min(0).max(100) }),
  (req, res) => {
  const { adapter_progress, owner_name, online_status, quality, issue_notes } = req.body;
  const sql = `UPDATE adaptation_records SET adapter_progress = COALESCE(?, adapter_progress), 
               owner_name = COALESCE(?, owner_name), online_status = COALESCE(?, online_status), 
               quality = COALESCE(?, quality), issue_notes = COALESCE(?, issue_notes),
               updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, [adapter_progress, owner_name, online_status, quality, issue_notes, req.params.id], function(err) {
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

// 获取所有计划（含创建者信息 + 游戏统计）
plansRouter.get('/', (req, res) => {
  db.all(`SELECT p.*, u.real_name as creator_name,
          r.title as requirement_title, r.req_no as requirement_no,
          (SELECT COUNT(*) FROM plan_games pg WHERE pg.plan_id = p.id) as game_count,
          (SELECT COUNT(*) FROM plan_games pg WHERE pg.plan_id = p.id AND pg.adapt_status = 'finished') as finished_count,
          (SELECT COUNT(*) FROM plan_games pg WHERE pg.plan_id = p.id AND pg.adapt_status = 'adapting') as adapting_count,
          (SELECT COUNT(DISTINCT pg.assigned_to) FROM plan_games pg WHERE pg.plan_id = p.id AND pg.assigned_to IS NOT NULL) as assignee_count,
          (SELECT ROUND(AVG(pg.adapt_progress), 0) FROM plan_games pg WHERE pg.plan_id = p.id) as avg_progress
          FROM plans p LEFT JOIN users u ON p.creator_id = u.id
          LEFT JOIN requirements r ON p.requirement_id = r.id
          ORDER BY p.created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const data = rows.map(r => ({ ...r, devices_json: JSON.parse(r.devices_json || '[]') }));
    res.json({ success: true, data });
  });
});

// 获取计划详情（含游戏列表+负责人信息）
plansRouter.get('/:id', (req, res) => {
  db.get('SELECT * FROM plans WHERE id = ?', [req.params.id], (err, plan) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!plan) return res.status(404).json({ error: '计划不存在' });
    plan.devices_json = JSON.parse(plan.devices_json || '[]');
    db.all(`SELECT pg.*, u.real_name as assigned_name 
            FROM plan_games pg LEFT JOIN users u ON pg.assigned_to = u.id 
            WHERE pg.plan_id = ? ORDER BY pg.sort_order`, [plan.id], (err2, games) => {
      if (err2) return res.status(500).json({ error: err2.message });
      games = games.map(g => ({ ...g, bugs_json: JSON.parse(g.bugs_json || '[]') }));
      res.json({ success: true, data: { ...plan, games } });
    });
  });
});

// 创建计划（默认草稿状态，自动生成编号）
plansRouter.post('',
  validate({
    title: rules.name(200),
    status: rules.statusEnum(['draft','planned','in_progress','completed','cancelled']),
    goal: rules.textArea(2000),
  }),
  (req, res) => {
  const { title, plan_date, devices_json, interlace_version, client_version, goal, tab_name, games, status, requirement_id } = req.body;
  const planStatus = status || 'draft';
  const creatorId = req.user ? req.user.id : null;

  // 生成计划编号：PLAN-YYYYMMDD-HHmm-序号
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const timeStr = String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');

  // 查询当天已有计划数量来确定序号
  db.get("SELECT COUNT(*) as cnt FROM plans WHERE plan_no LIKE ?", [`PLAN-${dateStr}-%`], (cntErr, cntRow) => {
    const seq = String((cntRow ? cntRow.cnt : 0) + 1).padStart(2, '0');
    const planNo = `PLAN-${dateStr}-${timeStr}-${seq}`;

    const sql = `INSERT INTO plans (title, plan_date, devices_json, interlace_version, client_version, goal, tab_name, status, creator_id, plan_no, requirement_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [title, plan_date, JSON.stringify(devices_json || []), interlace_version || '', client_version || '', goal || '', tab_name || '', planStatus, creatorId, planNo, requirement_id || null], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const planId = this.lastID;
      if (games && games.length > 0) {
        const stmt = db.prepare(`INSERT INTO plan_games (plan_id, game_id, game_name, game_platform, game_type, owner_name, assigned_to, adapt_status, adapt_progress, remark, bugs_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        games.forEach((g, i) => {
          stmt.run([planId, g.game_id || null, g.game_name, g.game_platform || '', g.game_type || '', g.owner_name || '', g.assigned_to || null, g.adapt_status || 'not_started', g.adapt_progress || 0, g.remark || '', JSON.stringify(g.bugs_json || []), i]);
        });
        stmt.finalize();
      }
      logActivity('create', 'plan', planId, title);
      res.json({ success: true, id: planId, plan_no: planNo });
    });
  });
});

// 更新计划元信息
plansRouter.put('/:id',
  validate({ title: rules.name(200), status: rules.statusEnum(['draft','planned','in_progress','completed','cancelled']) }),
  (req, res) => {
  const { title, plan_date, devices_json, interlace_version, client_version, goal, tab_name, status } = req.body;
  const sql = `UPDATE plans SET title = COALESCE(?, title), plan_date = COALESCE(?, plan_date), 
               devices_json = COALESCE(?, devices_json), interlace_version = COALESCE(?, interlace_version),
               client_version = COALESCE(?, client_version), goal = COALESCE(?, goal), 
               tab_name = COALESCE(?, tab_name), status = COALESCE(?, status),
               updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, [title, plan_date, devices_json ? JSON.stringify(devices_json) : null, interlace_version, client_version, goal, tab_name, status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 发布计划（状态从 draft 改为 published）
plansRouter.post('/:id/publish', (req, res) => {
  const planId = req.params.id;
  
  db.run("UPDATE plans SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [planId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '计划不存在' });
    
    logActivity('publish', 'plan', parseInt(planId), '发布计划');
    
    // 获取计划信息并通知所有负责人
    db.get("SELECT title, plan_date FROM plans WHERE id = ?", [planId], (err2, plan) => {
      if (!err2 && plan) {
        // 通知全体
        createNotification(null, 'plan_published', '配置计划已发布', `配置计划「${plan.title}」已发布，请及时查看并完成任务`, 'plan', parseInt(planId));
        
        // 查找所有负责人并单独通知
        db.all("SELECT DISTINCT assigned_to, game_name FROM plan_games WHERE plan_id = ? AND assigned_to IS NOT NULL", [planId], (err3, games) => {
          if (!err3 && games) {
            games.forEach(g => {
              createNotification(g.assigned_to, 'task_assigned', '新任务分配', `您被分配到配置计划「${plan.title}」的游戏「${g.game_name}」适配任务`, 'plan', parseInt(planId));
            });
          }
        });
      }
    });
    
    res.json({ success: true });
  });
});

// 更新计划内游戏（扩展：支持 assigned_to, adapt_progress）
plansRouter.put('/game/:gameId', (req, res) => {
  const { adapt_status, owner_name, assigned_to, adapt_progress, remark } = req.body;
  const sql = `UPDATE plan_games SET 
    adapt_status = COALESCE(?, adapt_status), 
    owner_name = COALESCE(?, owner_name), 
    assigned_to = COALESCE(?, assigned_to),
    adapt_progress = COALESCE(?, adapt_progress),
    remark = COALESCE(?, remark), 
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, [adapt_status, owner_name, assigned_to, adapt_progress, remark, req.params.gameId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 批量更新计划内游戏的负责人
plansRouter.put('/:id/assign', (req, res) => {
  const { assignments } = req.body; // [{plan_game_id, assigned_to, owner_name}]
  if (!assignments || !Array.isArray(assignments)) return res.status(400).json({ error: 'assignments必须是数组' });
  
  const stmt = db.prepare(`UPDATE plan_games SET assigned_to = ?, owner_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND plan_id = ?`);
  let errors = 0;
  assignments.forEach(a => {
    stmt.run([a.assigned_to, a.owner_name || '', a.plan_game_id, req.params.id], (err) => { if (err) errors++; });
  });
  stmt.finalize(() => {
    res.json({ success: true, count: assignments.length, errors });
  });
});

// 向已有计划批量添加游戏
plansRouter.post('/:id/games', (req, res) => {
  const planId = req.params.id;
  const { games } = req.body;
  if (!games || !Array.isArray(games) || games.length === 0) {
    return res.status(400).json({ error: 'games 不能为空' });
  }
  // 获取当前最大 sort_order
  db.get('SELECT MAX(sort_order) as maxSort FROM plan_games WHERE plan_id = ?', [planId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    let sortStart = (row && row.maxSort != null ? row.maxSort : -1) + 1;
    const stmt = db.prepare(`INSERT INTO plan_games (plan_id, game_id, game_name, game_platform, game_type, owner_name, assigned_to, adapt_status, adapt_progress, remark, bugs_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let count = 0;
    games.forEach((g, i) => {
      stmt.run([planId, g.game_id || null, g.game_name, g.game_platform || '', g.game_type || '', g.owner_name || '', g.assigned_to || null, g.adapt_status || 'not_started', g.adapt_progress || 0, g.remark || '', JSON.stringify(g.bugs_json || []), sortStart + i]);
      count++;
    });
    stmt.finalize(() => {
      logActivity('update', 'plan', parseInt(planId), `添加 ${count} 款游戏`);
      res.json({ success: true, count });
    });
  });
});

// 删除计划内单个游戏
plansRouter.delete('/game/:gameId', (req, res) => {
  db.run('DELETE FROM plan_games WHERE id = ?', [req.params.gameId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 删除计划（事务保护）
plansRouter.delete('/:id', (req, res) => {
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM plan_games WHERE plan_id = ?', [req.params.id], (err1) => {
      if (err1) { db.run('ROLLBACK'); return res.status(500).json({ error: err1.message }); }
      db.run('DELETE FROM plans WHERE id = ?', [req.params.id], function(err2) {
        if (err2) { db.run('ROLLBACK'); return res.status(500).json({ error: err2.message }); }
        db.run('COMMIT');
        logActivity('delete', 'plan', parseInt(req.params.id), '删除计划');
        res.json({ success: true });
      });
    });
  });
});

// ==================== 我的任务 API ====================
const myTasksRouter = express.Router();
myTasksRouter.use(auth.verifyToken);

// 获取当前用户的所有任务（已发布计划中分配给我的游戏）
myTasksRouter.get('/', (req, res) => {
  const userId = req.user ? req.user.id : null;
  const devMode = req.isDevMode; // 使用动态判断结果
  
  // 开发模式下返回所有已发布计划的任务，正式模式下只返回分配给当前用户的
  let sql, params;
  if (devMode) {
    sql = `SELECT pg.*, p.title as plan_title, p.plan_no, p.plan_date, p.status as plan_status,
               p.devices_json, p.interlace_version, p.client_version, p.goal as plan_goal,
               p.created_at as plan_created_at,
               g.platform as game_platform_full, g.game_type as game_type_full,
               u.real_name as assigned_name
               FROM plan_games pg
               INNER JOIN plans p ON pg.plan_id = p.id
               LEFT JOIN games g ON pg.game_id = g.id
               LEFT JOIN users u ON pg.assigned_to = u.id
               WHERE p.status = 'published'
               ORDER BY p.plan_date DESC, pg.sort_order`;
    params = [];
  } else {
    if (!userId) return res.json({ success: true, data: [] });
    sql = `SELECT pg.*, p.title as plan_title, p.plan_no, p.plan_date, p.status as plan_status,
               p.devices_json, p.interlace_version, p.client_version, p.goal as plan_goal,
               p.created_at as plan_created_at,
               g.platform as game_platform_full, g.game_type as game_type_full,
               u.real_name as assigned_name
               FROM plan_games pg
               INNER JOIN plans p ON pg.plan_id = p.id
               LEFT JOIN games g ON pg.game_id = g.id
               LEFT JOIN users u ON pg.assigned_to = u.id
               WHERE pg.assigned_to = ? AND p.status = 'published'
               ORDER BY p.plan_date DESC, pg.sort_order`;
    params = [userId];
  }
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // 获取每个 plan_game 的测试用例统计
    const planGameIds = rows.map(r => r.id);
    if (planGameIds.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    const placeholders = planGameIds.map(() => '?').join(',');
    const tcStatsSql = `SELECT plan_game_id,
      COUNT(*) as tc_total,
      SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) as tc_pass,
      SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as tc_fail,
      SUM(CASE WHEN status = 'block' THEN 1 ELSE 0 END) as tc_block,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as tc_pending
      FROM plan_test_cases WHERE plan_game_id IN (${placeholders}) GROUP BY plan_game_id`;
    
    db.all(tcStatsSql, planGameIds, (tcErr, tcStats) => {
      const tcStatsMap = {};
      if (!tcErr && tcStats) {
        tcStats.forEach(s => { tcStatsMap[s.plan_game_id] = s; });
      }
      
      const data = rows.map(r => {
        const tcStat = tcStatsMap[r.id] || { tc_total: 0, tc_pass: 0, tc_fail: 0, tc_block: 0, tc_pending: 0 };
        return {
          ...r,
          devices_json: JSON.parse(r.devices_json || '[]'),
          bugs_json: JSON.parse(r.bugs_json || '[]'),
          tc_total: tcStat.tc_total,
          tc_pass: tcStat.tc_pass,
          tc_fail: tcStat.tc_fail,
          tc_block: tcStat.tc_block,
          tc_pending: tcStat.tc_pending,
          tc_progress: tcStat.tc_total > 0 ? Math.round((tcStat.tc_total - tcStat.tc_pending) / tcStat.tc_total * 100) : 0
        };
      });
      res.json({ success: true, data });
    });
  });
});

// 获取某任务关联的测试用例列表（用于 Checklist 展示）
myTasksRouter.get('/:planGameId/test-cases', (req, res) => {
  const sql = `SELECT ptc.id, ptc.test_case_id, ptc.status, ptc.remark, ptc.executed_at,
               tc.name, tc.code, tc.category, tc.priority, tc.steps, tc.expected_result, tc.precondition
               FROM plan_test_cases ptc
               JOIN test_cases tc ON ptc.test_case_id = tc.id
               WHERE ptc.plan_game_id = ?
               ORDER BY 
                 CASE tc.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                 tc.id`;
  db.all(sql, [req.params.planGameId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 负责人提交进展（单条）
myTasksRouter.put('/:planGameId',
  validate({
    adapt_status: rules.statusEnum(['not_started','in_progress','testing','completed','blocked']),
    adapt_progress: rules.optional().isInt().min(0).max(100),
  }),
  (req, res) => {
  const userId = req.user ? req.user.id : null;
  const devMode = req.isDevMode; // 使用动态判断结果
  const { adapt_status, adapt_progress, remark } = req.body;
  
  // 先验证这条任务确实分配给了当前用户（开发模式跳过）
  const checkSql = devMode 
    ? 'SELECT pg.*, p.devices_json FROM plan_games pg INNER JOIN plans p ON pg.plan_id = p.id WHERE pg.id = ?'
    : 'SELECT pg.*, p.devices_json FROM plan_games pg INNER JOIN plans p ON pg.plan_id = p.id WHERE pg.id = ? AND pg.assigned_to = ?';
  const checkParams = devMode ? [req.params.planGameId] : [req.params.planGameId, userId];
  
  db.get(checkSql, checkParams, (err, task) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!task) return res.status(403).json({ error: '无权操作此任务' });
    
    // 更新 plan_games
    const updateSql = `UPDATE plan_games SET 
      adapt_status = COALESCE(?, adapt_status),
      adapt_progress = COALESCE(?, adapt_progress), 
      remark = COALESCE(?, remark),
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(updateSql, [adapt_status, adapt_progress, remark, req.params.planGameId], function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      
      // 自动同步到 adaptation_records（遍历计划中的所有设备）
      if (task.game_id) {
        const devices = JSON.parse(task.devices_json || '[]');
        if (devices.length > 0) {
          const syncStmt = db.prepare(`INSERT OR REPLACE INTO adaptation_records 
            (device_id, game_id, adapter_progress, owner_name, online_status, quality) 
            VALUES (?, ?, ?, ?, ?, ?)`);
          
          const progressVal = adapt_progress !== undefined ? adapt_progress : (task.adapt_progress || 0);
          const statusMap = { 'not_started': 'pending', 'adapting': 'in_progress', 'finished': 'online' };
          const finalStatus = adapt_status ? (statusMap[adapt_status] || adapt_status) : (statusMap[task.adapt_status] || 'pending');
          
          devices.forEach(d => {
            const deviceId = d.id || d;
            syncStmt.run([deviceId, task.game_id, progressVal, task.owner_name || '', finalStatus, '']);
          });
          syncStmt.finalize(() => {
            // 同步完成后重新计算所有涉及设备的统计
            devices.forEach(d => recalcDeviceStats(d.id || d));
          });
        }
      }
      
      res.json({ success: true });
    });
  });
});

// 负责人批量提交进展
myTasksRouter.post('/batch-submit', (req, res) => {
  const userId = req.user ? req.user.id : null;
  const { items } = req.body; // [{plan_game_id, adapt_status, adapt_progress, remark}]
  if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'items必须是数组' });
  
  let processed = 0;
  let errors = 0;
  
  items.forEach(item => {
    // 更新 plan_games
    const sql = `UPDATE plan_games SET 
      adapt_status = COALESCE(?, adapt_status),
      adapt_progress = COALESCE(?, adapt_progress),
      remark = COALESCE(?, remark),
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(sql, [item.adapt_status, item.adapt_progress, item.remark, item.plan_game_id], function(err) {
      if (err) errors++;
      processed++;
      if (processed === items.length) {
        // 同步到 adaptation_records: 获取所有涉及的 plan_games 数据
        syncPlanGamesToAdaptation(items.map(i => i.plan_game_id), () => {
          res.json({ success: true, count: items.length, errors });
        });
      }
    });
  });
});

// 辅助函数：同步 plan_games 数据到 adaptation_records
function syncPlanGamesToAdaptation(planGameIds, callback) {
  if (!planGameIds || planGameIds.length === 0) return callback();
  
  const placeholders = planGameIds.map(() => '?').join(',');
  const sql = `SELECT pg.*, p.devices_json FROM plan_games pg 
               INNER JOIN plans p ON pg.plan_id = p.id 
               WHERE pg.id IN (${placeholders})`;
  db.all(sql, planGameIds, (err, rows) => {
    if (err) return callback();
    
    const statusMap = { 'not_started': 'pending', 'adapting': 'in_progress', 'finished': 'online' };
    const stmt = db.prepare(`INSERT OR REPLACE INTO adaptation_records 
      (device_id, game_id, adapter_progress, owner_name, online_status, quality) 
      VALUES (?, ?, ?, ?, ?, ?)`);
    
    rows.forEach(pg => {
      if (!pg.game_id) return;
      const devices = JSON.parse(pg.devices_json || '[]');
      const onlineStatus = statusMap[pg.adapt_status] || 'pending';
      devices.forEach(d => {
        const deviceId = d.id || d;
        stmt.run([deviceId, pg.game_id, pg.adapt_progress || 0, pg.owner_name || '', onlineStatus, '']);
      });
    });
    stmt.finalize(() => {
      // 同步完成后重新计算所有涉及设备的统计
      const allDeviceIds = new Set();
      rows.forEach(pg => {
        const devices = JSON.parse(pg.devices_json || '[]');
        devices.forEach(d => allDeviceIds.add(d.id || d));
      });
      allDeviceIds.forEach(deviceId => recalcDeviceStats(deviceId));
      callback();
    });
  });
}

// ==================== 测试用例 API ====================
const testCasesRouter = express.Router();
testCasesRouter.use(auth.verifyToken);

// 初始化测试用例表（使用 serialize 确保同步执行）
db.serialize(() => {
  // 测试套件表
  db.run(`CREATE TABLE IF NOT EXISTS test_suites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT,
    category TEXT DEFAULT '功能测试',
    game_type TEXT,
    priority TEXT DEFAULT 'medium',
    precondition TEXT,
    steps TEXT,
    expected_result TEXT,
    is_template INTEGER DEFAULT 0,
    tags TEXT,
    suite_id INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE SET NULL
  )`);

  // 给 test_cases 表添加 suite_id 列（已有表迁移）
  db.run(`ALTER TABLE test_cases ADD COLUMN suite_id INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('test_cases加列suite_id失败:', err.message);
    }
  });

  // 初始化计划-用例关联表
  db.run(`CREATE TABLE IF NOT EXISTS plan_test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    plan_game_id INTEGER,
    test_case_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    executor_id INTEGER,
    executed_at DATETIME,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES plans(id),
    FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
  )`);

  // 添加索引
  db.run('CREATE INDEX IF NOT EXISTS idx_test_cases_category ON test_cases(category)');
  db.run('CREATE INDEX IF NOT EXISTS idx_test_cases_priority ON test_cases(priority)');
  db.run('CREATE INDEX IF NOT EXISTS idx_test_cases_suite ON test_cases(suite_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_plan_test_cases_plan ON plan_test_cases(plan_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_plan_test_cases_status ON plan_test_cases(status)');
});

// ==================== 测试套件 API ====================
// 获取所有测试套件（含用例数量统计）
testCasesRouter.get('/suites', (req, res) => {
  db.all(`SELECT ts.*, u.real_name as creator_name,
          (SELECT COUNT(*) FROM test_cases tc WHERE tc.suite_id = ts.id) as case_count
          FROM test_suites ts
          LEFT JOIN users u ON ts.created_by = u.id
          ORDER BY ts.sort_order, ts.created_at`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取单个测试套件
testCasesRouter.get('/suites/:id', (req, res) => {
  db.get(`SELECT ts.*, u.real_name as creator_name FROM test_suites ts
          LEFT JOIN users u ON ts.created_by = u.id WHERE ts.id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '套件不存在' });
    res.json({ success: true, data: row });
  });
});

// 创建测试套件
testCasesRouter.post('/suites', (req, res) => {
  const { name, description, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: '套件名称不能为空' });
  const creatorId = req.user ? req.user.id : null;
  db.run(`INSERT INTO test_suites (name, description, sort_order, created_by) VALUES (?, ?, ?, ?)`,
    [name, description || '', sort_order || 0, creatorId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity('create', 'test_suite', this.lastID, name);
    res.json({ success: true, id: this.lastID });
  });
});

// 更新测试套件
testCasesRouter.put('/suites/:id', (req, res) => {
  const { name, description, sort_order } = req.body;
  db.run(`UPDATE test_suites SET name = COALESCE(?, name), description = COALESCE(?, description),
          sort_order = COALESCE(?, sort_order), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [name, description, sort_order, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '套件不存在' });
    res.json({ success: true });
  });
});

// 删除测试套件（用例的 suite_id 会被自动 SET NULL）
testCasesRouter.delete('/suites/:id', (req, res) => {
  // 先将该套件下的用例解绑
  db.run('UPDATE test_cases SET suite_id = NULL WHERE suite_id = ?', [req.params.id], () => {
    db.run('DELETE FROM test_suites WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity('delete', 'test_suite', parseInt(req.params.id), '删除测试套件');
      res.json({ success: true });
    });
  });
});

// 批量移动用例到某套件
testCasesRouter.post('/suites/move-cases', (req, res) => {
  const { case_ids, suite_id } = req.body;
  if (!case_ids || !Array.isArray(case_ids) || case_ids.length === 0) {
    return res.status(400).json({ error: 'case_ids 必须是非空数组' });
  }
  const targetSuiteId = suite_id === null || suite_id === undefined ? null : suite_id;
  const placeholders = case_ids.map(() => '?').join(',');
  db.run(`UPDATE test_cases SET suite_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
    [targetSuiteId, ...case_ids], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, updated: this.changes });
  });
});

// 获取所有测试用例
testCasesRouter.get('/', (req, res) => {
  const { category, priority, game_type, is_template, search, suite_id } = req.query;
  let sql = `SELECT tc.*, u.real_name as creator_name, ts.name as suite_name FROM test_cases tc 
             LEFT JOIN users u ON tc.created_by = u.id
             LEFT JOIN test_suites ts ON tc.suite_id = ts.id WHERE 1=1`;
  const params = [];
  
  if (category) { sql += ' AND tc.category = ?'; params.push(category); }
  if (priority) { sql += ' AND tc.priority = ?'; params.push(priority); }
  if (game_type) { sql += ' AND tc.game_type = ?'; params.push(game_type); }
  if (is_template !== undefined) { sql += ' AND tc.is_template = ?'; params.push(is_template); }
  if (suite_id !== undefined) {
    if (suite_id === 'null' || suite_id === '0') {
      sql += ' AND (tc.suite_id IS NULL OR tc.suite_id = 0)';
    } else {
      sql += ' AND tc.suite_id = ?'; params.push(suite_id);
    }
  }
  if (search) { 
    sql += ' AND (tc.name LIKE ? OR tc.code LIKE ? OR tc.tags LIKE ?)'; 
    const like = `%${search}%`;
    params.push(like, like, like); 
  }
  
  sql += ' ORDER BY tc.created_at DESC';
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取单个测试用例
testCasesRouter.get('/:id', (req, res) => {
  db.get(`SELECT tc.*, u.real_name as creator_name FROM test_cases tc 
          LEFT JOIN users u ON tc.created_by = u.id WHERE tc.id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '用例不存在' });
    res.json({ success: true, data: row });
  });
});

// 创建测试用例
testCasesRouter.post('',
  validate({
    name: rules.name(200),
    priority: rules.requiredEnum(['low','medium','high','critical'], '优先级'),
    steps: rules.textArea(5000),
    expected_result: rules.textArea(3000),
  }),
  (req, res) => {
  const { name, code, category, game_type, priority, precondition, steps, expected_result, is_template, tags } = req.body;
  if (!name) return res.status(400).json({ error: '用例名称不能为空' });
  
  const creatorId = req.user ? req.user.id : null;
  const suiteId = req.body.suite_id !== undefined ? req.body.suite_id : null;
  const sql = `INSERT INTO test_cases (name, code, category, game_type, priority, precondition, steps, expected_result, is_template, tags, suite_id, created_by) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [name, code || '', category || '功能测试', game_type || '', priority || 'medium', 
               precondition || '', steps || '', expected_result || '', is_template || 0, tags || '', suiteId, creatorId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity('create', 'test_case', this.lastID, name);
    res.json({ success: true, id: this.lastID });
  });
});

// 批量创建测试用例
testCasesRouter.post('/batch', (req, res) => {
  const { cases, suite_id } = req.body;
  if (!cases || !Array.isArray(cases) || cases.length === 0) {
    return res.status(400).json({ error: 'cases 必须是非空数组' });
  }
  
  const creatorId = req.user ? req.user.id : null;
  const batchSuiteId = suite_id !== undefined ? suite_id : null;
  const stmt = db.prepare(`INSERT INTO test_cases (name, code, category, game_type, priority, precondition, steps, expected_result, is_template, tags, suite_id, created_by) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let count = 0;
  let errors = 0;
  
  cases.forEach(c => {
    if (!c.name) { errors++; return; }
    const cSuiteId = c.suite_id !== undefined ? c.suite_id : batchSuiteId;
    stmt.run([c.name, c.code || '', c.category || '功能测试', c.game_type || '', c.priority || 'medium',
              c.precondition || '', c.steps || '', c.expected_result || '', c.is_template || 0, c.tags || '', cSuiteId, creatorId], (err) => {
      if (err) errors++; else count++;
    });
  });
  
  stmt.finalize(() => {
    res.json({ success: true, created: count, errors });
  });
});

// 更新测试用例
testCasesRouter.put('/:id',
  validate({ name: rules.name(200), priority: rules.requiredEnum(['low','medium','high','critical'], '优先级') }),
  (req, res) => {
  const { name, code, category, game_type, priority, precondition, steps, expected_result, is_template, tags, suite_id } = req.body;
  // suite_id 需要特殊处理：允许设为 null（从套件中移除）
  const hasSuiteId = suite_id !== undefined;
  let sql = `UPDATE test_cases SET name = COALESCE(?, name), code = COALESCE(?, code), 
               category = COALESCE(?, category), game_type = COALESCE(?, game_type),
               priority = COALESCE(?, priority), precondition = COALESCE(?, precondition),
               steps = COALESCE(?, steps), expected_result = COALESCE(?, expected_result),
               is_template = COALESCE(?, is_template), tags = COALESCE(?, tags)`;
  const sqlParams = [name, code, category, game_type, priority, precondition, steps, expected_result, is_template, tags];
  if (hasSuiteId) {
    sql += ', suite_id = ?';
    sqlParams.push(suite_id);
  }
  sql += ', updated_at = CURRENT_TIMESTAMP WHERE id = ?';
  sqlParams.push(req.params.id);
  db.run(sql, sqlParams, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '用例不存在' });
    res.json({ success: true });
  });
});

// 删除测试用例
testCasesRouter.delete('/:id', (req, res) => {
  db.run('DELETE FROM test_cases WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 批量删除测试用例
testCasesRouter.post('/batch-delete', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids 必须是非空数组' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM test_cases WHERE id IN (${placeholders})`, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// 复制测试用例（用于从模板创建）
testCasesRouter.post('/:id/copy', (req, res) => {
  db.get('SELECT * FROM test_cases WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '用例不存在' });
    
    const creatorId = req.user ? req.user.id : null;
    const newName = req.body.name || `${row.name} (副本)`;
    const sql = `INSERT INTO test_cases (name, code, category, game_type, priority, precondition, steps, expected_result, is_template, tags, created_by) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`;
    db.run(sql, [newName, row.code, row.category, row.game_type, row.priority, row.precondition, row.steps, row.expected_result, row.tags, creatorId], function(e) {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true, id: this.lastID });
    });
  });
});

// 获取用例分类统计
testCasesRouter.get('/stats/summary', (req, res) => {
  const queries = [
    { key: 'total', sql: 'SELECT COUNT(*) as count FROM test_cases' },
    { key: 'by_category', sql: 'SELECT category, COUNT(*) as count FROM test_cases GROUP BY category' },
    { key: 'by_priority', sql: 'SELECT priority, COUNT(*) as count FROM test_cases GROUP BY priority' },
    { key: 'templates', sql: 'SELECT COUNT(*) as count FROM test_cases WHERE is_template = 1' },
  ];
  
  const stats = {};
  let completed = 0;
  
  queries.forEach(q => {
    if (q.key === 'total' || q.key === 'templates') {
      db.get(q.sql, [], (err, row) => {
        stats[q.key] = err ? 0 : (row ? row.count : 0);
        completed++;
        if (completed === queries.length) res.json({ success: true, data: stats });
      });
    } else {
      db.all(q.sql, [], (err, rows) => {
        stats[q.key] = err ? [] : rows;
        completed++;
        if (completed === queries.length) res.json({ success: true, data: stats });
      });
    }
  });
});

// ==================== 计划-游戏-用例关联 API ====================
// 获取某个 plan_game 关联的测试用例
testCasesRouter.get('/plan-game/:planGameId', (req, res) => {
  const sql = `SELECT ptc.*, tc.name, tc.code, tc.category, tc.priority, tc.steps, tc.expected_result
               FROM plan_test_cases ptc
               JOIN test_cases tc ON ptc.test_case_id = tc.id
               WHERE ptc.plan_game_id = ?
               ORDER BY tc.priority DESC, ptc.id`;
  db.all(sql, [req.params.planGameId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 为 plan_game 关联测试用例（批量）
testCasesRouter.post('/plan-game/:planGameId/link', (req, res) => {
  const { plan_id, test_case_ids } = req.body;
  const planGameId = req.params.planGameId;
  
  if (!test_case_ids || !Array.isArray(test_case_ids) || test_case_ids.length === 0) {
    return res.status(400).json({ error: 'test_case_ids 必须是非空数组' });
  }
  
  // 先删除已有关联，再批量插入
  db.run('DELETE FROM plan_test_cases WHERE plan_game_id = ?', [planGameId], function(delErr) {
    if (delErr) return res.status(500).json({ error: delErr.message });
    
    const stmt = db.prepare(`INSERT INTO plan_test_cases (plan_id, plan_game_id, test_case_id, status) VALUES (?, ?, ?, 'pending')`);
    let count = 0;
    test_case_ids.forEach(tcId => {
      stmt.run([plan_id, planGameId, tcId], (err) => { if (!err) count++; });
    });
    stmt.finalize(() => {
      res.json({ success: true, linked: count });
    });
  });
});

// 更新单条 plan_test_case 的执行状态 (pass/fail/block/pending)
testCasesRouter.put('/execution/:ptcId',
  validate({
    status: rules.requiredEnum(['pass','fail','block','pending','skipped'], '执行结果'),
    remark: rules.textArea(1000),
  }),
  (req, res) => {
  const { status, remark } = req.body;
  const executorId = req.user ? req.user.id : null;
  const executedAt = (status && status !== 'pending') ? new Date().toISOString() : null;
  
  db.run(`UPDATE plan_test_cases SET status = ?, remark = ?, executor_id = ?, executed_at = ? WHERE id = ?`,
    [status, remark || '', executorId, executedAt, req.params.ptcId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '记录不存在' });
    res.json({ success: true });
  });
});

// 批量更新用例执行状态
testCasesRouter.post('/execution/batch', (req, res) => {
  const { updates } = req.body; // [{id, status, remark}]
  if (!updates || !Array.isArray(updates)) {
    return res.status(400).json({ error: 'updates 必须是数组' });
  }
  
  const executorId = req.user ? req.user.id : null;
  const stmt = db.prepare(`UPDATE plan_test_cases SET status = ?, remark = ?, executor_id = ?, executed_at = ? WHERE id = ?`);
  let count = 0;
  
  updates.forEach(u => {
    const executedAt = (u.status && u.status !== 'pending') ? new Date().toISOString() : null;
    stmt.run([u.status, u.remark || '', executorId, executedAt, u.id], (err) => { if (!err) count++; });
  });
  
  stmt.finalize(() => {
    res.json({ success: true, updated: count });
  });
});

// 获取 plan_game 的用例执行进度统计
testCasesRouter.get('/plan-game/:planGameId/progress', (req, res) => {
  const sql = `SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) as passed,
    SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as failed,
    SUM(CASE WHEN status = 'block' THEN 1 ELSE 0 END) as blocked,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM plan_test_cases WHERE plan_game_id = ?`;
  db.get(sql, [req.params.planGameId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = row?.total || 0;
    const executed = total - (row?.pending || 0);
    const passRate = total > 0 ? Math.round((row?.passed || 0) / total * 100) : 0;
    const progress = total > 0 ? Math.round(executed / total * 100) : 0;
    res.json({ success: true, data: { ...row, progress, passRate } });
  });
});

// ==================== 设备适配统计自动计算 API ====================
// 重新计算某设备的适配统计（基于 adaptation_records）
function recalcDeviceStats(deviceId) {
  db.get(`SELECT 
    COUNT(*) as total_games,
    SUM(CASE WHEN online_status = 'online' THEN 1 ELSE 0 END) as completed,
    ROUND(AVG(adapter_progress), 0) as avg_progress
    FROM adaptation_records WHERE device_id = ?`, [deviceId], (err, row) => {
    if (err || !row) return;
    const rate = row.total_games > 0 ? Math.round((row.completed / row.total_games) * 100) + '%' : '0%';
    db.run(`UPDATE devices SET total_games = ?, completed_adaptations = ?, adapter_completion_rate = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [row.total_games, row.completed, rate, deviceId]);
  });
}

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

  // 使用 serialize 保证12个查询数据一致性
  db.serialize(() => {
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
    { type: 'requirement', icon: '📄', label: '需求',
      sql: `SELECT id, title, req_no as subtitle FROM requirements WHERE title LIKE ? OR description LIKE ? OR req_no LIKE ? LIMIT 5`,
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

// ==================== 通知提醒 API ====================
// 创建通知表
db.run(`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  related_type TEXT,
  related_id INTEGER,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

const notificationsRouter = express.Router();
notificationsRouter.use(auth.verifyToken);

// 获取通知列表
notificationsRouter.get('/', (req, res) => {
  const { unread_only, limit = 20 } = req.query;
  const userId = req.user?.id || 0;
  
  let sql = `SELECT * FROM notifications WHERE (user_id = ? OR user_id IS NULL OR user_id = 0)`;
  const params = [userId];
  
  if (unread_only === 'true') {
    sql += ` AND is_read = 0`;
  }
  
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(parseInt(limit) || 20);
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取未读通知数量
notificationsRouter.get('/unread-count', (req, res) => {
  const userId = req.user?.id || 0;
  db.get(`SELECT COUNT(*) as count FROM notifications WHERE (user_id = ? OR user_id IS NULL OR user_id = 0) AND is_read = 0`, [userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, count: row?.count || 0 });
  });
});

// 标记通知已读
notificationsRouter.put('/:id/read', (req, res) => {
  db.run(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 全部标记已读
notificationsRouter.put('/read-all', (req, res) => {
  const userId = req.user?.id || 0;
  db.run(`UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR user_id IS NULL OR user_id = 0) AND is_read = 0`, [userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, updated: this.changes });
  });
});

// 删除通知
notificationsRouter.delete('/:id', (req, res) => {
  db.run(`DELETE FROM notifications WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ==================== 近期关注事项（大事）API ====================

// 建表：大事
db.run(`CREATE TABLE IF NOT EXISTS focus_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL DEFAULT '游戏',
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  sort_order INTEGER DEFAULT 0,
  created_by TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 建表：评论
db.run(`CREATE TABLE IF NOT EXISTS focus_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  images TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES focus_items(id) ON DELETE CASCADE
)`);

// 索引
db.run('CREATE INDEX IF NOT EXISTS idx_focus_items_status ON focus_items(status)');
db.run('CREATE INDEX IF NOT EXISTS idx_focus_comments_item ON focus_comments(item_id)');

const focusItemsRouter = express.Router();
focusItemsRouter.use(auth.verifyToken);

// GET /api/focus-items — 列表（含评论数）
focusItemsRouter.get('/', (req, res) => {
  const sql = `SELECT fi.*,
    (SELECT COUNT(*) FROM focus_comments fc WHERE fc.item_id = fi.id) as comment_count
    FROM focus_items fi ORDER BY fi.sort_order ASC, fi.id DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows || [] });
  });
});

// POST /api/focus-items — 新建大事
focusItemsRouter.post('/', (req, res) => {
  const { module, content, status } = req.body;
  if (!module || !content) {
    return res.status(400).json({ error: '模块和内容不能为空' });
  }
  // 获取最大 sort_order
  db.get('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM focus_items', [], (err, row) => {
    const nextOrder = row ? row.max_order + 1 : 0;
    const sql = `INSERT INTO focus_items (module, content, status, sort_order, created_by)
                 VALUES (?, ?, ?, ?, ?)`;
    const author = req.user?.real_name || req.user?.username || '';
    db.run(sql, [module || '游戏', content, status || 'new', nextOrder, author], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    });
  });
});

// PUT /api/focus-items/:id — 更新大事
focusItemsRouter.put('/:id', (req, res) => {
  const { id } = req.params;
  const { module, content, status } = req.body;
  const sets = [];
  const params = [];

  if (module !== undefined) { sets.push('module = ?'); params.push(module); }
  if (content !== undefined) { sets.push('content = ?'); params.push(content); }
  if (status !== undefined) { sets.push('status = ?'); params.push(status); }

  if (sets.length === 0) return res.status(400).json({ error: '没有可更新的字段' });

  sets.push("updated_at = datetime('now','localtime')");
  params.push(id);

  const sql = `UPDATE focus_items SET ${sets.join(', ')} WHERE id = ?`;
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, changes: this.changes });
  });
});

// DELETE /api/focus-items/:id — 删除大事（级联删除评论）
focusItemsRouter.delete('/:id', (req, res) => {
  db.run('DELETE FROM focus_items WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// PUT /api/focus-items/reorder — 拖拽排序（批量更新 sort_order）
focusItemsRouter.put('/reorder', (req, res) => {
  const { order } = req.body; // [{id: 5}, {id: 3}, {id: 1}]
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order 必须是数组' });

  let completed = 0;
  order.forEach((item, index) => {
    db.run('UPDATE focus_items SET sort_order = ? WHERE id = ?', [index, item.id], (err) => {
      if (err) console.error('Reorder error:', err);
      completed++;
      if (completed === order.length) {
        res.json({ success: true });
      }
    });
  });

  if (order.length === 0) res.json({ success: true });
});

// GET /api/focus-items/:id/comments — 某条大事的评论列表
focusItemsRouter.get('/:id/comments', (req, res) => {
  const sql = `SELECT * FROM focus_comments WHERE item_id = ? ORDER BY id ASC`;
  db.all(sql, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // 解析 images JSON
    const comments = (rows || []).map(r => ({
      ...r,
      imageList: r.images && r.images !== '[]' ? JSON.parse(r.images) : []
    }));
    res.json({ success: true, data: comments });
  });
});

// POST /api/focus-items/:id/comments — 新增评论
focusItemsRouter.post('/:id/comments', (req, res) => {
  const { content, images } = req.body;
  if (!content) return res.status(400).json({ error: '评论内容不能为空' });

  const author = req.user?.real_name || req.user?.username || '';
  const imagesJson = Array.isArray(images) ? JSON.stringify(images) : '[]';
  const sql = `INSERT INTO focus_comments (item_id, author, content, images) VALUES (?, ?, ?, ?)`;

  db.run(sql, [req.params.id, author, content, imagesJson], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

// DELETE /api/focus-comments/:id — 删除评论
focusItemsRouter.delete('/comments/:commentId', (req, res) => {
  db.run('DELETE FROM focus_comments WHERE id = ?', [req.params.commentId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 创建通知的辅助函数
function createNotification(userId, type, title, content, relatedType = null, relatedId = null) {
  db.run(
    `INSERT INTO notifications (user_id, type, title, content, related_type, related_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, title, content, relatedType, relatedId],
    (err) => { if (err) console.error('创建通知失败:', err.message); }
  );
}

// 检查计划截止日期的定时任务（每小时执行一次）
function checkPlanDeadlines() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  
  // 查找明天到期的计划
  db.all(`SELECT id, name, end_date FROM plans WHERE end_date = ? AND status != 'completed'`, [tomorrowStr], (err, plans) => {
    if (!err && plans && plans.length > 0) {
      plans.forEach(plan => {
        // 检查是否已有相同通知
        db.get(`SELECT id FROM notifications WHERE related_type = 'plan' AND related_id = ? AND type = 'deadline_warning' AND DATE(created_at) = ?`, 
          [plan.id, today], (err2, existing) => {
          if (!err2 && !existing) {
            createNotification(null, 'deadline_warning', `计划即将到期`, `配置计划「${plan.name}」将于明天(${plan.end_date})到期，请及时完成！`, 'plan', plan.id);
          }
        });
      });
    }
  });
  
  // 查找今天到期但未完成的计划
  db.all(`SELECT id, name, end_date FROM plans WHERE end_date = ? AND status != 'completed'`, [today], (err, plans) => {
    if (!err && plans && plans.length > 0) {
      plans.forEach(plan => {
        db.get(`SELECT id FROM notifications WHERE related_type = 'plan' AND related_id = ? AND type = 'deadline_today' AND DATE(created_at) = ?`,
          [plan.id, today], (err2, existing) => {
          if (!err2 && !existing) {
            createNotification(null, 'deadline_today', `计划今日到期`, `配置计划「${plan.name}」今天(${plan.end_date})到期！`, 'plan', plan.id);
          }
        });
      });
    }
  });
}

// 启动时执行一次，然后每小时执行
setTimeout(checkPlanDeadlines, 5000);
setInterval(checkPlanDeadlines, 60 * 60 * 1000);

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

// ==================== 需求管理 API ====================
// 创建 requirements 表（用 serialize 确保顺序执行）
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    req_no TEXT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'draft',
    assigned_to INTEGER,
    creator_id INTEGER,
    deadline TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (creator_id) REFERENCES users(id)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_requirements_assigned ON requirements(assigned_to)');

  // 给 plans 表添加 requirement_id 字段（关联需求）
  db.run(`ALTER TABLE plans ADD COLUMN requirement_id INTEGER`, (err) => {
    // 忽略"列已存在"的错误
    if (err && !err.message.includes('duplicate column')) {
      console.error('plans加列失败:', err.message);
    }
  });
});

const requirementsRouter = express.Router();
requirementsRouter.use(auth.verifyToken);

// 获取所有需求（含创建者和指派人信息 + 关联计划统计）
requirementsRouter.get('/', (req, res) => {
  db.all(`SELECT r.*, 
          uc.real_name as creator_name,
          ua.real_name as assigned_name,
          (SELECT COUNT(*) FROM plans p WHERE p.requirement_id = r.id) as plan_count,
          (SELECT COUNT(*) FROM plans p INNER JOIN plan_games pg ON pg.plan_id = p.id WHERE p.requirement_id = r.id) as total_games,
          (SELECT COUNT(*) FROM plans p INNER JOIN plan_games pg ON pg.plan_id = p.id WHERE p.requirement_id = r.id AND pg.adapt_status = 'finished') as finished_games
          FROM requirements r
          LEFT JOIN users uc ON r.creator_id = uc.id
          LEFT JOIN users ua ON r.assigned_to = ua.id
          ORDER BY r.created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取单个需求详情
requirementsRouter.get('/:id', (req, res) => {
  db.get(`SELECT r.*, 
          uc.real_name as creator_name,
          ua.real_name as assigned_name
          FROM requirements r
          LEFT JOIN users uc ON r.creator_id = uc.id
          LEFT JOIN users ua ON r.assigned_to = ua.id
          WHERE r.id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '需求不存在' });
    // 获取关联的配置计划
    db.all(`SELECT p.id, p.title, p.plan_no, p.status, p.plan_date,
            (SELECT COUNT(*) FROM plan_games pg WHERE pg.plan_id = p.id) as game_count,
            (SELECT COUNT(*) FROM plan_games pg WHERE pg.plan_id = p.id AND pg.adapt_status = 'finished') as finished_count
            FROM plans p WHERE p.requirement_id = ? ORDER BY p.created_at DESC`, [row.id], (err2, plans) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true, data: { ...row, plans: plans || [] } });
    });
  });
});

// 创建需求
requirementsRouter.post('',
  validate({
    title: rules.name(200),
    priority: rules.requiredEnum(['low','medium','high','urgent'], '优先级'),
    status: rules.statusEnum(['draft','assigned','in_progress','planned','completed','closed','cancelled']),
    description: rules.textArea(5000),
    deadline: rules.optional(), // 日期格式由前端保证
  }),
  (req, res) => {
  const { title, description, priority, assigned_to, deadline, status } = req.body;
  if (!title) return res.status(400).json({ error: '需求标题不能为空' });
  const creatorId = req.user ? req.user.id : null;
  const reqStatus = status || 'draft';

  // 生成编号 REQ-YYYYMMDD-序号
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  db.get("SELECT COUNT(*) as cnt FROM requirements WHERE req_no LIKE ?", [`REQ-${dateStr}-%`], (cntErr, cntRow) => {
    const seq = String((cntRow ? cntRow.cnt : 0) + 1).padStart(3, '0');
    const reqNo = `REQ-${dateStr}-${seq}`;

    const sql = `INSERT INTO requirements (req_no, title, description, priority, status, assigned_to, creator_id, deadline)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [reqNo, title, description || '', priority || 'medium', reqStatus, assigned_to || null, creatorId, deadline || null], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const reqId = this.lastID;
      logActivity('create', 'requirement', reqId, title);
      res.json({ success: true, id: reqId, req_no: reqNo });
    });
  });
});

// 更新需求
requirementsRouter.put('/:id',
  validate({
    title: rules.name(200),
    priority: rules.requiredEnum(['low','medium','high','urgent'], '优先级'),
    status: rules.statusEnum(['draft','assigned','in_progress','planned','completed','closed','cancelled']),
  }),
  (req, res) => {
  const { title, description, priority, assigned_to, deadline, status } = req.body;
  const sql = `UPDATE requirements SET 
    title = COALESCE(?, title), description = COALESCE(?, description),
    priority = COALESCE(?, priority), assigned_to = COALESCE(?, assigned_to),
    deadline = COALESCE(?, deadline), status = COALESCE(?, status),
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, [title, description, priority, assigned_to, deadline, status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '需求不存在' });
    logActivity('update', 'requirement', parseInt(req.params.id), title || '');
    res.json({ success: true });
  });
});

// 发布需求（draft → published，同时通知指派的项目经理）
requirementsRouter.post('/:id/publish', (req, res) => {
  const reqId = req.params.id;
  db.run("UPDATE requirements SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'draft'", [reqId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(400).json({ error: '需求不存在或不是草稿状态' });
    logActivity('publish', 'requirement', parseInt(reqId), '发布需求');
    // 通知指派人
    db.get("SELECT title, assigned_to FROM requirements WHERE id = ?", [reqId], (err2, req_) => {
      if (!err2 && req_ && req_.assigned_to) {
        createNotification(req_.assigned_to, 'requirement_published', '新需求分配给您',
          `需求「${req_.title}」已发布并分配给您，请查看并创建配置计划`, 'requirement', parseInt(reqId));
      }
    });
    res.json({ success: true });
  });
});

// 关闭需求
requirementsRouter.post('/:id/close', (req, res) => {
  db.run("UPDATE requirements SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 删除需求
requirementsRouter.delete('/:id', (req, res) => {
  // 先解除关联的计划
  db.run("UPDATE plans SET requirement_id = NULL WHERE requirement_id = ?", [req.params.id], () => {
    db.run('DELETE FROM requirements WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity('delete', 'requirement', parseInt(req.params.id), '删除需求');
      res.json({ success: true });
    });
  });
});

// ==================== 版本管理 API ====================

// 获取版本列表（支持按状态筛选）
versionsRouter.get('/', auth.checkPermission('devices', 'view'), (req, res) => {
  const { status, device_id, version_type } = req.query;
  let sql = `SELECT v.*, d.name as device_name
             FROM versions v
             LEFT JOIN devices d ON v.device_id = d.id
             WHERE 1=1`;
  const params = [];
  if (status) {
    sql += ' AND v.status = ?';
    params.push(status);
  }
  if (device_id) {
    sql += ' AND v.device_id = ?';
    params.push(device_id);
  }
  if (version_type) {
    sql += ' AND v.version_type = ?';
    params.push(version_type);
  }
  sql += ' ORDER BY v.version_date DESC, v.created_at DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取单个版本详情
versionsRouter.get('/:id', auth.checkPermission('devices', 'view'), (req, res) => {
  const sql = `SELECT v.*, d.name as device_name
               FROM versions v
               LEFT JOIN devices d ON v.device_id = d.id
               WHERE v.id = ?`;
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '版本不存在' });
    res.json({ success: true, data: row });
  });
});

// 创建版本
versionsRouter.post('/', auth.checkPermission('devices', 'edit'),
  validate({
    device_id: rules.id(),
    version_number: rules.name(50),
    version_type: rules.statusEnum(['firmware','driver','adapter','config','game','other']),
    status: rules.statusEnum(['draft','testing','released','deprecated']),
    changelog: rules.textArea(2000),
    notes: rules.textArea(1000),
  }),
  (req, res) => {
  const { device_id, version_number, version_type, status, version_date,
          download_url, file_size, changelog, notes } = req.body;
  if (!device_id || !version_number) {
    return res.status(400).json({ error: '设备和版本号为必填项' });
  }
  const updater_id = req.user ? req.user.id : null;
  const updater_name = req.user ? (req.user.real_name || req.user.username) : '';
  const sql = `INSERT INTO versions (device_id, version_number, version_type, status, version_date,
                                     updater_id, updater_name, download_url, file_size, changelog, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [device_id, version_number, version_type || '整合版', status || 'testing',
               version_date || new Date().toISOString().slice(0, 10),
               updater_id, updater_name, download_url || '', file_size || '', changelog || '', notes || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity('create', 'version', this.lastID, `新增版本 ${version_number}`);
      res.json({ success: true, id: this.lastID });
    }
  );
});

// 更新版本（完整更新）
versionsRouter.put('/:id', auth.checkPermission('devices', 'edit'),
  validate({
    device_id: rules.id(),
    version_number: rules.name(50),
    version_type: rules.statusEnum(['firmware','driver','adapter','config','game','other']),
    status: rules.statusEnum(['draft','testing','released','deprecated']),
  }),
  (req, res) => {
  const { device_id, version_number, version_type, status, version_date,
          download_url, file_size, changelog, notes } = req.body;
  const updater_id = req.user ? req.user.id : null;
  const updater_name = req.user ? (req.user.real_name || req.user.username) : '';
  const sql = `UPDATE versions SET device_id = ?, version_number = ?, version_type = ?, status = ?,
                                   version_date = ?, updater_id = ?, updater_name = ?,
                                   download_url = ?, file_size = ?, changelog = ?, notes = ?,
                                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  db.run(sql, [device_id, version_number, version_type, status, version_date,
               updater_id, updater_name, download_url, file_size, changelog, notes, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity('update', 'version', parseInt(req.params.id), `更新版本 ${version_number}`);
      res.json({ success: true });
    }
  );
});

// 单字段更新（行内编辑用）
versionsRouter.patch('/:id', auth.checkPermission('devices', 'edit'), (req, res) => {
  const allowedFields = ['device_id', 'version_number', 'version_type', 'status', 'version_date',
                         'download_url', 'file_size', 'changelog', 'notes'];
  const updates = [];
  const values = [];
  for (const [key, val] of Object.entries(req.body)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: '没有可更新的字段' });
  // 自动更新 updater 信息
  updates.push('updater_id = ?', 'updater_name = ?');
  values.push(req.user ? req.user.id : null);
  values.push(req.user ? (req.user.real_name || req.user.username) : '');
  values.push(req.params.id);
  const sql = `UPDATE versions SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, values, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 发布版本（从测试中→已发布）
versionsRouter.post('/:id/release', auth.checkPermission('devices', 'edit'), (req, res) => {
  const updater_id = req.user ? req.user.id : null;
  const updater_name = req.user ? (req.user.real_name || req.user.username) : '';
  const sql = `UPDATE versions SET status = 'released', updater_id = ?, updater_name = ?,
                                   updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, [updater_id, updater_name, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity('update', 'version', parseInt(req.params.id), '版本发布');
    res.json({ success: true });
  });
});

// 删除版本
versionsRouter.delete('/:id', auth.checkPermission('devices', 'delete'), (req, res) => {
  db.run('DELETE FROM versions WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logActivity('delete', 'version', parseInt(req.params.id), '删除版本');
    res.json({ success: true });
  });
});

// 注册路由
app.use('/api/versions', versionsRouter);
app.use('/api/requirements', requirementsRouter);
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
app.use('/api/my-tasks', myTasksRouter);
app.use('/api/test-cases', testCasesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/batch', batchRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/game-issues', gameIssuesRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/game-versions', gameVersionsRouter);
app.use('/api/interlace-issues', interlaceIssuesRouter);
app.use('/api/interlace-versions', interlaceVersionsRouter);
app.use('/api/client-issues', clientIssuesRouter);
app.use('/api/tencent-board', tencentBoardRouter);
app.use('/api/focus-items', focusItemsRouter);

// ==================== 汇报报表 API ====================
const reportsRouter = express.Router();
reportsRouter.use(auth.verifyToken);

// 创建 report_overrides 表（用于存储手动修正值）
db.run(`CREATE TABLE IF NOT EXISTS report_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT,
  updated_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(report_type, entity_key, field)
)`);

// 获取报表数据（一次性返回两个表全部数据）
reportsRouter.get('/data', (req, res) => {
  const result = { deviceSummary: [], gameStatus: { inProgress: [], hasBugs: [], completed: [] } };
  let completed = 0;
  const totalQueries = 4;

  // Q1: 设备汇总 — 从 devices 表获取设备列表（容错：online_games/total_games 列可能不存在）
  // 用闭包包装内部逻辑，便于在退化分支中复用
  const _runDeviceSummary = (devices) => {
    result.devices = devices || [];

    // 获取手动修正值
    db.all("SELECT * FROM report_overrides WHERE report_type = 'device_summary'", (err2, overrides) => {
      const overrideMap = {};
      if (!err2 && overrides) overrides.forEach(o => { overrideMap[o.entity_key + '|' + o.field] = o.value; });

      // Q1b: 统计每台设备关联的游戏数（通过 plan_games + plans.devices_json）
      db.all(`
        SELECT pg.game_name, pg.game_platform, p.devices_json, p.title as plan_title
        FROM plan_games pg
        JOIN plans p ON pg.plan_id = p.id
        WHERE p.status = 'published'
        ORDER BY p.id, pg.id
      `, (err3, planGameRows) => {
        // 按设备聚合游戏
        const deviceGameMap = {}; // { deviceName: { total, wegame, steam } }
        devices.forEach(d => { deviceGameMap[d.name] = { total: 0, wegame: 0, steam: 0 }; });

        if (planGameRows) {
          planGameRows.forEach(row => {
            try {
              const devList = typeof row.devices_json === 'string' ? JSON.parse(row.devices_json || '[]') : (row.devices_json || []);
              devList.forEach(dev => {
                const dName = dev.name || '';
                if (deviceGameMap[dName]) {
                  deviceGameMap[dName].total++;
                  if ((row.game_platform || '').toUpperCase() === 'WEGAME' || (row.game_platform || '').includes('WeGame')) {
                    deviceGameMap[dName].wegame++;
                  } else if ((row.game_platform || '').toUpperCase() === 'STEAM' || (row.game_platform || '').includes('Steam')) {
                    deviceGameMap[dName].steam++;
                  }
                }
              });
            } catch(e) {}
          });
        }

        // 如果 plan_games 没有关联数据，用 games 全局分布按设备均分作为兜底
        const hasAnyData = Object.values(deviceGameMap).some(v => v.total > 0);

        // 构建设备汇总行
        result.deviceSummary = devices.map(d => {
          const keyPrefix = d.name;
          const autoData = hasAnyData ? deviceGameMap[d.name] || { total:0, wegame:0, steam:0 } : null;
          const totalCount = overrideMap[keyPrefix + '|totalCount']
            ? parseInt(overrideMap[keyPrefix + '|totalCount'])
            : (autoData ? autoData.total : (parseInt(d.completed_adaptations) || 0));
          const wegameCount = overrideMap[keyPrefix + '|wegameCount']
            ? parseInt(overrideMap[keyPrefix + '|wegameCount'])
            : (autoData ? autoData.wegame : 0);
          const steamCount = overrideMap[keyPrefix + '|steamCount']
            ? parseInt(overrideMap[keyPrefix + '|steamCount'])
            : (autoData ? autoData.steam : 0);
          const weeklyNote = overrideMap[keyPrefix + '|weeklyNote'] || '';

          return {
            id: d.id,
            name: d.name,
            type: (d.device_type === 'Laptop' ? '笔记本' :
                 (d.device_type || '').includes('显示器') ? '显示器' :
                 (d.device_type || '').includes('带交织') ? '显示器' :
                 d.device_type === '笔电' ? '笔记本' : (d.device_type || '-')),
            totalCount: totalCount || 0,
            wegameCount: wegameCount || 0,
            steamCount: steamCount || 0,
            weeklyNote: weeklyNote,
            autoTotal: autoData ? autoData.total : (parseInt(d.completed_adaptations) || 0)
          };
        });

        completed++;
        if (completed >= totalQueries - 1) finishQuery4();

        // Q2: 游戏状态 — 适配中
        db.all(`
          SELECT g.id, g.name, g.platform,
                 COALESCE(g.adaptation_notes,
                   (SELECT pg.remark FROM plan_games pg WHERE pg.game_id = g.id
                     AND pg.adapt_status IN ('adapting','in_progress') LIMIT 1), '') as notes
          FROM games g
          WHERE g.adaptation_status IN ('adapting', 'in_progress', 'testing')
             OR g.id IN (SELECT game_id FROM plan_games WHERE adapt_status IN ('adapting', 'in_progress'))
             OR g.online_status IN ('in_progress', 'adapting')
          ORDER BY g.name
        `, (err4, inProgressGames) => {
          result.gameStatus.inProgress = (inProgressGames || []).map(g => ({
            name: g.name, notes: g.notes || '', platform: g.platform || ''
          }));
          completed++;
          if (completed >= totalQueries - 1) finishQuery4();
        });

        // Q3: 游戏状态 — 已适配有BUG
        db.all(`
          SELECT DISTINCT g.id, g.name,
                 COALESCE(b.description, '') as bugNotes,
                 b.bug_status, b.priority, b.device_name
          FROM games g
          LEFT JOIN bugs b ON g.name LIKE ('%' || b.game_name || '%') OR b.game_name LIKE ('%' || g.name || '%')
          WHERE b.id IS NOT NULL AND b.bug_status NOT IN ('fixed', 'closed', '已验证')
          ORDER BY g.name
        `, (err5, bugGames) => {
          const seen = new Set();
          result.gameStatus.hasBugs = (bugGames || [])
            .filter(g => { if (seen.has(g.name)) return false; seen.add(g.name); return true; })
            .map(g => ({
              name: g.name,
              bugNotes: `优先级:${g.priority||'-'} | ${g.bugNotes}${g.device_name?' | '+g.device_name:''}`,
              deviceName: g.device_name || ''
            }));
          completed++;
          if (completed >= totalQueries - 1) finishQuery4();
        });

        // Q4: 游戏状态 — 已适配完成
        function finishQuery4() {
          db.all(`
            SELECT g.id, g.name, g.platform, g.quality, g.online_status,
                   COALESCE(g.adaptation_notes,
                     (SELECT pg.remark FROM plan_games pg WHERE pg.game_id = g.id
                       AND pg.adapt_status = 'finished' LIMIT 1), '') as notes
            FROM games g
            WHERE g.online_status = 'online'
               OR g.id IN (SELECT game_id FROM plan_games WHERE adapt_status = 'finished')
               OR g.adaptation_status = 'completed'
            ORDER BY g.name
          `, (err6, doneGames) => {
            result.gameStatus.completed = (doneGames || []).map(g => ({
              name: g.name, quality: g.quality || '', notes: g.notes || ''
            }));

            // 获取游戏状态的手动修正
            db.all("SELECT * FROM report_overrides WHERE report_type = 'game_status'", (err7, go) => {
              const gOverrideMap = {};
              if (!err7 && go) go.forEach(o => { gOverrideMap[o.entity_key + '|' + o.field] = o.value; });

              // 应用修正到 gameStatus
              ['inProgress','hasBugs','completed'].forEach(section => {
                result.gameStatus[section].forEach(item => {
                  for (const [k,v] of Object.entries(gOverrideMap)) {
                    const [ek, f] = k.split('|');
                    if (ek === item.name && f) item[f] = v;
                  }
                });
              });

              result.lastUpdated = new Date().toISOString();

              // 追加用户自定义报表行数据
              db.all(
                'SELECT * FROM report_rows ORDER BY sort_order ASC, id ASC',
                [],
                (errR, customRows) => {
                  if (!errR && customRows) {
                    result.customRows = customRows.map((r) => ({
                      _id: r.row_id,
                      name: r.name,
                      status: r.status,
                      platform: r.platform,
                      notes: r.notes,
                    }));
                  } else {
                    result.customRows = [];
                  }
                  res.json({ success: true, data: result });
                }
              );
            });
          });
        }
        // Q2/Q3完成后通过计数器自动触发Q4（不再显式调用）
      });
    });
  };

  // 主查询：先尝试带 online_games/total_games 的查询，失败时退化
  db.all('SELECT id, name, device_type, manufacturer, adapter_completion_rate, completed_adaptations, COALESCE(online_games, 0) as online_games, COALESCE(total_games, 0) as total_games FROM devices ORDER BY id', (err, devices) => {
    if (err) {
      console.warn('[reports/data] 设备查询失败，使用退化查询:', err.message);
      db.all('SELECT id, name, device_type, manufacturer, adapter_completion_rate, completed_adaptations FROM devices ORDER BY id', (err0, devices0) => {
        if (err0) return res.status(500).json({ error: err0.message });
        const fallback = (devices0 || []).map(d => ({ ...d, online_games: 0, total_games: 0 }));
        _runDeviceSummary(fallback);
      });
      return;
    }
    _runDeviceSummary(devices || []);
  });
});

// 保存手动修正值
reportsRouter.post('/overrides', auth.checkPermission('games', 'edit'), (req, res) => {
  const { report_type, entity_key, field, value } = req.body;
  if (!report_type || !entity_key || !field) {
    return res.status(400).json({ error: '缺少必要字段: report_type, entity_key, field' });
  }
  db.run(
    `INSERT INTO report_overrides (report_type, entity_key, field, value, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(report_type, entity_key, field) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=datetime('now')`,
    [report_type, entity_key, field, value, req.user?.id || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity('update', 'report_override', this.lastID, `修正${report_type}/${entity_key}/${field}`);
      res.json({ success: true, id: this.lastID });
    }
  );
});

// ==================== 报表行 CRUD ====================

// 保存/更新报表行（UPSERT）
reportsRouter.post('/save-row', auth.checkPermission('games', 'edit'), (req, res) => {
  const { _id, name, status, platform, notes } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '游戏名称不能为空' });
  }

  if (_id && String(_id).startsWith('new_')) {
    // 新行：INSERT
    db.run(
      `INSERT INTO report_rows (row_id, name, status, platform, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM report_rows))`,
      [_id, name.trim(), status || 'pending', platform || '', notes || ''],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity('create', 'report_row', this.lastID, `新增报表行:${name.trim()}`);
        res.json({ success: true, id: this.lastID, row_id: _id });
      }
    );
  } else {
    // 已有行：UPDATE
    db.run(
      `UPDATE report_rows SET name=?, status=?, platform=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE row_id=?`,
      [name.trim(), status || 'pending', platform || '', notes || '', _id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity('update', 'report_row', null, `更新报表行:${_id}`);
        res.json({ success: true, id: this.changes, row_id: _id });
      }
    );
  }
});

// 删除报表行
reportsRouter.post('/delete-row', auth.checkPermission('games', 'edit'), (req, res) => {
  const { _id } = req.body;
  if (!_id) {
    return res.status(400).json({ error: '缺少行标识(_id)' });
  }
  db.run(`DELETE FROM report_rows WHERE row_id = ?`, [_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logActivity('delete', 'report_row', null, `删除报表行:${_id}`);
    res.json({ success: true, deleted: this.changes });
  });
});

// 报表行排序
reportsRouter.patch('/reorder', auth.checkPermission('games', 'edit'), (req, res) => {
  const { orders } = req.body;
  if (!Array.isArray(orders)) {
    return res.status(400).json({ error: 'orders必须是数组' });
  }
  const validOrders = orders.filter((o) => o.row_id && Number.isInteger(o.sort_order));
  if (validOrders.length === 0) {
    return res.status(400).json({ error: '无效的排序数据' });
  }

  let completed = 0;
  validOrders.forEach(({ row_id, sort_order }) => {
    db.run(
      'UPDATE report_rows SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE row_id = ?',
      [sort_order, row_id],
      (err) => { if (!err) completed++; }
    );
  });

  console.log(`[PATCH /reports/reorder] 排序更新成功，共 ${completed} 条`);
  res.json({ success: true, updated: completed });
});

// 查询报表自定义行数据（用于 /data 接口补充）
reportsRouter.get('/rows', (req, res) => {
  db.all(
    'SELECT * FROM report_rows ORDER BY sort_order ASC, id ASC',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: rows || [] });
    }
  );
});

app.use('/api/reports', reportsRouter);

// [P0] 挂载增强功能：需求指派/关联计划 + 评论CRUD + 管理者看板 + 工作流引擎
require('./p0_routes').mountP0Routes(app);

// 定期清理过期session（每小时执行一次）
setInterval(() => {
  db.run('DELETE FROM sessions WHERE expires_at < datetime("now")', function(err) {
    if (!err && this.changes > 0) {
      console.log(`[Session清理] 已清理 ${this.changes} 个过期session`);
    }
  });
}, 60 * 60 * 1000);

// ========== 数据迁移：hook开发状态旧值 → 新值 ==========
// 1. 迁移 games 表中的遗留值
const hookStatusMigrations = [
    { old: 'pending',      new: 'developing', label: '待上线→开发中' },
    { old: 'pending_dev',  new: 'developing', label: 'pending_dev→开发中' },
    { old: 'online',       new: 'developing', label: '已上线→开发中' },
    { old: 'fixing',       new: 'developing', label: '待修复→开发中' },
];
try {
    let totalMigrated = 0;
    for (const m of hookStatusMigrations) {
        const result = db.prepare("UPDATE games SET online_status = ? WHERE online_status = ?").run(m.new, m.old);
        if (result.changes > 0) {
            console.log(`[数据迁移] ${m.label}: ${result.changes}条`);
            totalMigrated += result.changes;
        }
    }
    // 空值/NULL
    const emptyResult = db.prepare("UPDATE games SET online_status = 'developing' WHERE online_status = '' OR online_status IS NULL").run();
    if (emptyResult.changes > 0) {
        console.log(`[数据迁移] 空/NULL→开发中: ${emptyResult.changes}条`);
        totalMigrated += emptyResult.changes;
    }
    if (totalMigrated > 0) {
        console.log(`[数据迁移] hook开发状态(值)共迁移 ${totalMigrated} 条记录`);
    }
} catch(e) {
    console.error('[数据迁移] hook开发状态值迁移失败:', e.message);
}

// 2. 更新 field_options 表中的「适配状态」(online_status) 字段名 + 下拉选项
//    value 不变（completed/developing/undeveloped/anticheat/not_applicable），仅改显示名：
//    completed: 已完成→已发布；undeveloped: 未开发→未开始；field_label: hook开发状态→适配状态
//    幂等执行，确保线上 git pull + pm2 restart 后自动生效（单一数据源，勿在别处重复迁移）
try {
    const newOptions = JSON.stringify([
        {value:'undeveloped',label:'未开始'},
        {value:'developing',label:'开发中'},
        {value:'completed',label:'已发布'},
        {value:'anticheat',label:'反外挂'},
        {value:'not_applicable',label:'不适用'}
    ]);
    const row = db.prepare("SELECT field_label, options FROM field_options WHERE field_key = 'online_status'").get();
    if (row && (row.options !== newOptions || row.field_label !== '适配状态')) {
        const result = db.prepare("UPDATE field_options SET field_label = '适配状态', options = ? WHERE field_key = 'online_status'").run(newOptions);
        if (result.changes > 0) {
            console.log(`[数据迁移] 适配状态(online_status)字段名+下拉选项已统一为: 未开始/开发中/已发布/反外挂/不适用`);
        }
    }
} catch(e) {
    console.error('[数据迁移] 适配状态选项迁移失败:', e.message);
}

// 启动服务器 (监听所有网络接口，支持外网访问)
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`);
  console.log(`本机访问: http://localhost:${PORT}`);
  console.log(`认证模式: 智能模式`);
  console.log(`  - localhost 本地访问 → 开发模式（免登录）`);
  console.log(`  - 外网/远程访问 → 正式模式（需登录）`);
  if (auth.DEV_MODE) {
    console.log(`  - 强制开发模式已启用 (DEV_MODE=true)`);
  }
});
