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

// ========== 开发模式配置 ==========
// 现在默认是【正常模式】（需登录），只有本地localhost访问才自动进入开发模式
// 开发者密钥：本地开发时可通过 Cookie 或 URL 参数 ?dev_key=xxx 启用开发模式
const DEV_KEY = process.env.DEV_KEY || 'qiao2026dev';  // 开发者密钥，可通过环境变量自定义
const FORCE_DEV_MODE = process.env.DEV_MODE === 'true'; // 强制全局开发模式（仅调试用）

// 判断请求是否为开发模式
function isDevMode(req) {
  // 1. 强制全局开发模式（环境变量 DEV_MODE=true）
  if (FORCE_DEV_MODE) return true;
  
  // 2. 本地访问（localhost / 127.0.0.1）自动进入开发模式
  const ip = req.ip || req.connection?.remoteAddress || '';
  const host = req.get('host') || '';
  const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' 
                   || host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (isLocalhost) return true;
  
  // 3. 开发者密钥验证（Cookie 或 URL 参数）
  const devKeyFromQuery = req.query?.dev_key;
  const devKeyFromCookie = req.cookies?.dev_key;
  if (devKeyFromQuery === DEV_KEY || devKeyFromCookie === DEV_KEY) return true;
  
  // 默认：正常模式（需登录）
  return false;
}

// 兼容旧代码的全局变量（用于启动日志等）
const DEV_MODE = FORCE_DEV_MODE;

// 权限缓存（简单内存缓存，避免每次请求都查DB）
const permissionCache = new Map();
const CACHE_TTL = 60000; // 1分钟缓存

// Token认证缓存（避免每个请求都查sessions+users+roles三表JOIN）
const tokenCache = new Map();
const TOKEN_CACHE_TTL = 30000; // 30秒缓存

function clearPermissionCache(roleId) {
  if (roleId) {
    permissionCache.delete(roleId);
  } else {
    permissionCache.clear();
  }
}

function clearTokenCache(token) {
  if (token) {
    tokenCache.delete(token);
  } else {
    tokenCache.clear();
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
  // 动态判断：本地访问或有开发者密钥 → 开发模式，跳过验证
  if (isDevMode(req)) {
    req.user = {
      id: 1,
      username: 'admin',
      realName: '管理员',
      role: '超级管理员',
      role_id: 1,
      is_super_admin: true,
      permissions: {} // 超级管理员不需要查权限表，直接放行
    };
    req.isDevMode = true; // 标记为开发模式
    return next();
  }

  const token = req.headers['x-auth-token'];
  
  if (!token) {
    return res.status(401).json({ error: '未提供认证token' });
  }

  // 检查token缓存
  const cached = tokenCache.get(token);
  if (cached && Date.now() - cached.time < TOKEN_CACHE_TTL) {
    req.user = cached.user;
    return next();
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

    // 写入token缓存
    tokenCache.set(token, { user: req.user, time: Date.now() });
    
    next();
  });
};

// 检查权限中间件
// module: 模块名 (members/devices/games/tests/bugs/config_plan/adaptation/field_settings/user_management)
// action: 操作名 (view/create/edit/delete/export/import)
const checkPermission = (module, action) => {
  return (req, res, next) => {
    // 开发模式：跳过权限检查
    if (req.isDevMode) return next();

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
  DEV_MODE,
  isDevMode,
  hashPassword,
  generateToken,
  verifyToken,
  checkPermission,
  clearPermissionCache,
  clearTokenCache,
  loadRolePermissions
};
