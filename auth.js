const crypto = require('crypto');
const db = require('./database');

// 密码加密
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// 生成token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// ========== 开发模式开关 ==========
// TODO: 开发完成后将此值改为 false 以恢复登录认证
const DEV_MODE = true;

// 验证token中间件
const verifyToken = (req, res, next) => {
  // 开发模式：跳过token验证，赋予管理员全部权限
  if (DEV_MODE) {
    req.user = {
      id: 1,
      username: 'admin',
      realName: '管理员',
      role: 'admin',
      permissions: {
        members: { view: true, edit: true, delete: true },
        devices: { view: true, edit: true, delete: true },
        games: { view: true, edit: true, delete: true },
        tests: { view: true, edit: true, delete: true },
        bugs: { view: true, edit: true, delete: true },
        users: { manage: true }
      }
    };
    return next();
  }

  const token = req.headers['x-auth-token'];
  
  if (!token) {
    return res.status(401).json({ error: '未提供认证token' });
  }
  
  const sql = `
    SELECT s.*, u.id as user_id, u.username, u.real_name, u.role, u.status as user_status,
           p.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN permissions p ON p.user_id = u.id
    WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
  `;
  
  db.get(sql, [token], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!row) {
      return res.status(401).json({ error: '无效或已过期的token' });
    }
    
    if (row.user_status !== 'active') {
      return res.status(403).json({ error: '用户已被禁用' });
    }
    
    req.user = {
      id: row.user_id,
      username: row.username,
      realName: row.real_name,
      role: row.role,
      permissions: {
        members: {
          view: !!row.can_view_members,
          edit: !!row.can_edit_members,
          delete: !!row.can_delete_members
        },
        devices: {
          view: !!row.can_view_devices,
          edit: !!row.can_edit_devices,
          delete: !!row.can_delete_devices
        },
        games: {
          view: !!row.can_view_games,
          edit: !!row.can_edit_games,
          delete: !!row.can_delete_games
        },
        tests: {
          view: !!row.can_view_tests,
          edit: !!row.can_edit_tests,
          delete: !!row.can_delete_tests
        },
        bugs: {
          view: !!row.can_view_bugs,
          edit: !!row.can_edit_bugs,
          delete: !!row.can_delete_bugs
        },
        users: {
          manage: !!row.can_manage_users
        }
      }
    };
    
    next();
  });
};

// 检查权限中间件
const checkPermission = (resource, action) => {
  return (req, res, next) => {
    // 开发模式：跳过权限检查
    if (DEV_MODE) return next();

    if (!req.user || !req.user.permissions || !req.user.permissions[resource]) {
      return res.status(403).json({ error: '没有权限' });
    }
    
    if (!req.user.permissions[resource][action]) {
      return res.status(403).json({ error: `没有${resource}的${action}权限` });
    }
    
    next();
  };
};

module.exports = {
  hashPassword,
  generateToken,
  verifyToken,
  checkPermission
};
