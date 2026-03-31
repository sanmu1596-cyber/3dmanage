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

// 权限缓存（简单内存缓存，避免每次请求都查DB）
const permissionCache = new Map();
const CACHE_TTL = 60000; // 1分钟缓存

function clearPermissionCache(roleId) {
  if (roleId) {
    permissionCache.delete(roleId);
  } else {
    permissionCache.clear();
  }
}

// 从数据库加载角色权限
function loadRolePermissions(roleId) {
  return new Promise((resolve, reject) => {
    // 检查缓存
    const cached = permissionCache.get(roleId);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return resolve(cached.permissions);
    }

    const sql = `SELECT module, action, allowed FROM role_permissions WHERE role_id = ?`;
    db.all(sql, [roleId], (err, rows) => {
      if (err) return reject(err);
      
      const permissions = {};
      (rows || []).forEach(row => {
        if (!permissions[row.module]) permissions[row.module] = {};
        permissions[row.module][row.action] = !!row.allowed;
      });

      // 写入缓存
      permissionCache.set(roleId, { permissions, time: Date.now() });
      resolve(permissions);
    });
  });
}

// 验证token中间件
const verifyToken = (req, res, next) => {
  // 开发模式：跳过token验证，赋予管理员全部权限
  if (DEV_MODE) {
    req.user = {
      id: 1,
      username: 'admin',
      realName: '管理员',
      role: '超级管理员',
      role_id: 1,
      is_super_admin: true,
      permissions: {} // 超级管理员不需要查权限表，直接放行
    };
    return next();
  }

  const token = req.headers['x-auth-token'];
  
  if (!token) {
    return res.status(401).json({ error: '未提供认证token' });
  }
  
  const sql = `
    SELECT s.*, u.id as user_id, u.username, u.real_name, u.status as user_status,
           u.role_id, r.name as role_name, r.is_system
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
  `;
  
  db.get(sql, [token], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!row) {
      return res.status(401).json({ error: '无效或已过期的token' });
    }
    
    if (row.user_status !== 'active') {
      return res.status(403).json({ error: '用户已被禁用' });
    }

    // 判断是否为超级管理员（role_id = 1 的系统角色）
    const isSuperAdmin = row.role_id === 1;

    let permissions = {};
    if (!isSuperAdmin && row.role_id) {
      try {
        permissions = await loadRolePermissions(row.role_id);
      } catch (e) {
        console.error('加载权限失败:', e);
      }
    }
    
    req.user = {
      id: row.user_id,
      username: row.username,
      realName: row.real_name,
      role: row.role_name || '未分配',
      role_id: row.role_id,
      is_super_admin: isSuperAdmin,
      permissions
    };
    
    next();
  });
};

// 检查权限中间件
// module: 模块名 (members/devices/games/tests/bugs/config_plan/adaptation/field_settings/user_management)
// action: 操作名 (view/create/edit/delete/export/import)
const checkPermission = (module, action) => {
  return (req, res, next) => {
    // 开发模式：跳过权限检查
    if (DEV_MODE) return next();

    if (!req.user) {
      return res.status(403).json({ error: '没有权限' });
    }

    // 超级管理员直接放行
    if (req.user.is_super_admin) {
      return next();
    }

    // 检查角色权限
    const modulePerms = req.user.permissions[module];
    if (!modulePerms || !modulePerms[action]) {
      return res.status(403).json({ error: `没有${module}的${action}权限` });
    }
    
    next();
  };
};

module.exports = {
  hashPassword,
  generateToken,
  verifyToken,
  checkPermission,
  clearPermissionCache,
  loadRolePermissions
};
