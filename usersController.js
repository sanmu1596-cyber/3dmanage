const auth = require('./auth');
const db = require('./database');

// ==================== 认证 ====================

// 登录频率限制（防暴力破解）
const loginAttempts = new Map(); // key: ip, value: { count, firstAttempt, lockedUntil }
const LOGIN_LIMIT = 5;          // 最多连续失败次数
const LOGIN_WINDOW = 5 * 60 * 1000;  // 5分钟窗口
const LOCK_DURATION = 15 * 60 * 1000; // 锁定15分钟

function checkLoginRate(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true };
  
  // 如果在锁定期内
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainSec = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { allowed: false, remainSec };
  }
  
  // 锁定期已过，重置
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  
  // 窗口期已过，重置
  if (Date.now() - record.firstAttempt > LOGIN_WINDOW) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  
  return { allowed: true };
}

function recordFailedLogin(ip) {
  const record = loginAttempts.get(ip) || { count: 0, firstAttempt: Date.now() };
  record.count++;
  
  if (record.count >= LOGIN_LIMIT) {
    record.lockedUntil = Date.now() + LOCK_DURATION;
  }
  
  loginAttempts.set(ip, record);
  return record.count;
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

// 定时清理过期的频率限制记录（每10分钟）
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (record.lockedUntil && now >= record.lockedUntil) {
      loginAttempts.delete(ip);
    } else if (now - record.firstAttempt > LOGIN_WINDOW) {
      loginAttempts.delete(ip);
    }
  }
}, 10 * 60 * 1000);

// 登录
exports.login = (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  
  // 检查频率限制
  const rateCheck = checkLoginRate(ip);
  if (!rateCheck.allowed) {
    return res.status(429).json({ 
      error: `登录尝试次数过多，请${rateCheck.remainSec}秒后再试`,
      retryAfter: rateCheck.remainSec
    });
  }
  
  const hashedPassword = auth.hashPassword(password);
  
  const sql = `
    SELECT u.*, r.name as role_name, r.color as role_color
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.username = ? AND u.password = ? AND u.status = 'active'
  `;
  
  db.get(sql, [username, hashedPassword], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!user) {
      const failCount = recordFailedLogin(ip);
      const remaining = LOGIN_LIMIT - failCount;
      const msg = remaining > 0 
        ? `用户名或密码错误（还可尝试${remaining}次）` 
        : `登录尝试次数过多，账户已锁定15分钟`;
      return res.status(401).json({ error: msg });
    }
    
    // 登录成功，清除失败记录
    clearLoginAttempts(ip);
    
    // 清理该用户的旧session（只保留最新的，避免session泄露）
    db.run('DELETE FROM sessions WHERE user_id = ?', [user.id], () => {
      // 生成新token
      const token = auth.generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      const sessionSql = 'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)';
      db.run(sessionSql, [user.id, token, expiresAt.toISOString()], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        // 记录登录日志
        const logSql = 'INSERT INTO login_logs (user_id, ip_address, user_agent) VALUES (?, ?, ?)';
        const userAgent = req.headers['user-agent'];
        db.run(logSql, [user.id, ip, userAgent]);
        
        res.json({
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            realName: user.real_name,
            role: user.role_name || '未分配',
            role_id: user.role_id,
            roleColor: user.role_color
          }
        });
      });
    });
  });
};

// 登出
exports.logout = (req, res) => {
  const token = req.headers['x-auth-token'];
  
  if (token) {
    // 清除token缓存
    auth.clearTokenCache(token);
    
    // 先查session获取user_id，再删除session并更新登录日志
    db.get('SELECT user_id FROM sessions WHERE token = ?', [token], (err, session) => {
      if (session && session.user_id) {
        db.run('UPDATE login_logs SET logout_time = CURRENT_TIMESTAMP WHERE user_id = ? AND logout_time IS NULL', [session.user_id]);
      }
      db.run('DELETE FROM sessions WHERE token = ?', [token]);
    });
  }
  
  res.json({ success: true, message: '登出成功' });
};

// 获取当前用户信息
exports.getCurrentUser = (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
};

// ==================== 用户管理 ====================

// 创建用户
exports.createUser = (req, res) => {
  const { username, password, realName, role_id, wechat_id, project_role, duty, is_member } = req.body;
  
  if (!realName) {
    return res.status(400).json({ error: '真实姓名不能为空' });
  }
  
  // 如果提供了 username，则需要密码
  if (username && !password) {
    return res.status(400).json({ error: '设置了用户名则密码不能为空' });
  }
  
  const hashedPassword = password ? auth.hashPassword(password) : '';
  
  const sql = 'INSERT INTO users (username, password, real_name, role, role_id, wechat_id, project_role, duty, is_member) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
  
  // 查询角色名称用于存储到 role 字段（兼容旧代码）
  const getRoleName = (roleId, callback) => {
    if (!roleId) return callback('user');
    db.get('SELECT name FROM roles WHERE id = ?', [roleId], (err, row) => {
      callback(row ? row.name : 'user');
    });
  };

  getRoleName(role_id, (roleName) => {
    db.run(sql, [username || null, hashedPassword, realName, roleName, role_id || null, wechat_id || '', project_role || '', duty || '', is_member ? 1 : 0], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: '用户名已存在' });
        }
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ success: true, id: this.lastID });
    });
  });
};

// 获取所有用户列表
exports.getAllUsers = (req, res) => {
  const sql = `
    SELECT u.id, u.username, u.real_name, u.status, u.created_at,
           u.role_id, u.wechat_id, u.project_role, u.duty, u.is_member,
           r.name as role_name, r.color as role_color, r.description as role_description
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    ORDER BY u.created_at ASC
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const users = rows.map(user => ({
      id: user.id,
      username: user.username || '',
      realName: user.real_name,
      role: user.role_name || '未分配',
      role_id: user.role_id,
      roleColor: user.role_color || '#718096',
      roleDescription: user.role_description || '',
      status: user.status,
      createdAt: user.created_at,
      wechatId: user.wechat_id || '',
      projectRole: user.project_role || '',
      duty: user.duty || '',
      isMember: !!user.is_member
    }));
    
    res.json({ success: true, data: users });
  });
};

// 更新用户角色
exports.updateUserRole = (req, res) => {
  const { userId } = req.params;
  const { role_id } = req.body;
  
  if (role_id === undefined) {
    return res.status(400).json({ error: 'role_id 不能为空' });
  }

  // 查询角色名
  const getRoleName = (callback) => {
    if (!role_id) return callback('未分配');
    db.get('SELECT name FROM roles WHERE id = ?', [role_id], (err, row) => {
      callback(row ? row.name : '未分配');
    });
  };

  getRoleName((roleName) => {
    const sql = 'UPDATE users SET role_id = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    db.run(sql, [role_id, roleName, userId], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: '用户不存在' });
      }
      res.json({ success: true, message: '角色更新成功' });
    });
  });
};

// 更新用户信息（密码重置、状态等）
exports.updateUser = (req, res) => {
  const { userId } = req.params;
  const { realName, status, password, role_id, wechat_id, project_role, duty, is_member } = req.body;
  
  const updates = [];
  const params = [];

  if (realName !== undefined) {
    updates.push('real_name = ?');
    params.push(realName);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }
  if (password) {
    updates.push('password = ?');
    params.push(auth.hashPassword(password));
  }
  if (role_id !== undefined) {
    updates.push('role_id = ?');
    params.push(role_id);
  }
  if (wechat_id !== undefined) {
    updates.push('wechat_id = ?');
    params.push(wechat_id);
  }
  if (project_role !== undefined) {
    updates.push('project_role = ?');
    params.push(project_role);
  }
  if (duty !== undefined) {
    updates.push('duty = ?');
    params.push(duty);
  }
  if (is_member !== undefined) {
    updates.push('is_member = ?');
    params.push(is_member ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: '没有要更新的字段' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(userId);

  const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
  db.run(sql, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 如果更新了 role_id，同步更新 role 字段
    if (role_id !== undefined) {
      db.get('SELECT name FROM roles WHERE id = ?', [role_id], (err2, row) => {
        if (!err2 && row) {
          db.run('UPDATE users SET role = ? WHERE id = ?', [row.name, userId]);
        }
      });
    }

    res.json({ success: true, message: '用户更新成功' });
  });
};

// 删除用户
exports.deleteUser = (req, res) => {
  const { userId } = req.params;
  
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: '不能删除自己' });
  }
  
  const sql = 'DELETE FROM users WHERE id = ?';
  db.run(sql, [userId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ success: true, message: '用户删除成功' });
  });
};

// ==================== 角色管理 ====================

// 获取所有角色
exports.getAllRoles = (req, res) => {
  db.all('SELECT * FROM roles ORDER BY sort_order ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: rows });
  });
};

// 获取单个角色及权限
exports.getRolePermissions = (req, res) => {
  const { roleId } = req.params;
  
  db.get('SELECT * FROM roles WHERE id = ?', [roleId], (err, role) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!role) return res.status(404).json({ error: '角色不存在' });
    
    db.all('SELECT module, action, allowed FROM role_permissions WHERE role_id = ?', [roleId], (err2, perms) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      // 转成 { module: { action: boolean } } 格式
      const permMap = {};
      perms.forEach(p => {
        if (!permMap[p.module]) permMap[p.module] = {};
        permMap[p.module][p.action] = !!p.allowed;
      });
      
      res.json({ success: true, data: { ...role, permissions: permMap } });
    });
  });
};

// 获取所有角色的完整权限矩阵
exports.getPermissionMatrix = (req, res) => {
  db.all('SELECT * FROM roles ORDER BY sort_order ASC', [], (err, roles) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all('SELECT * FROM role_permissions', [], (err2, allPerms) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      // 按角色分组权限
      const permsByRole = {};
      allPerms.forEach(p => {
        if (!permsByRole[p.role_id]) permsByRole[p.role_id] = {};
        if (!permsByRole[p.role_id][p.module]) permsByRole[p.role_id][p.module] = {};
        permsByRole[p.role_id][p.module][p.action] = !!p.allowed;
      });
      
      const data = roles.map(role => ({
        ...role,
        permissions: permsByRole[role.id] || {}
      }));
      
      res.json({ success: true, data });
    });
  });
};

// 更新角色权限（批量更新）
exports.updateRolePermissions = (req, res) => {
  const { roleId } = req.params;
  const { permissions } = req.body; // { module: { action: boolean } }
  
  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ error: 'permissions 格式错误' });
  }

  // 检查角色是否存在
  db.get('SELECT id, name FROM roles WHERE id = ?', [roleId], (err, role) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!role) return res.status(404).json({ error: '角色不存在' });

    // 逐条更新权限
    const stmtUpdate = db.prepare(
      `INSERT OR REPLACE INTO role_permissions (role_id, module, action, allowed) VALUES (?, ?, ?, ?)`
    );

    let count = 0;
    Object.entries(permissions).forEach(([mod, actions]) => {
      Object.entries(actions).forEach(([act, allowed]) => {
        stmtUpdate.run([roleId, mod, act, allowed ? 1 : 0]);
        count++;
      });
    });

    stmtUpdate.finalize(() => {
      // 清除该角色的权限缓存
      auth.clearPermissionCache(parseInt(roleId));
      res.json({ success: true, message: `已更新 ${count} 条权限`, role: role.name });
    });
  });
};

// 创建自定义角色
exports.createRole = (req, res) => {
  const { name, description, color } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '角色名称不能为空' });
  }

  // 获取最大 sort_order
  db.get('SELECT MAX(sort_order) as maxOrder FROM roles', [], (err, row) => {
    const sortOrder = (row && row.maxOrder !== null) ? row.maxOrder + 1 : 0;
    
    const sql = 'INSERT INTO roles (name, description, is_system, color, sort_order) VALUES (?, ?, 0, ?, ?)';
    db.run(sql, [name, description || '', color || '#718096', sortOrder], function(err2) {
      if (err2) {
        if (err2.message.includes('UNIQUE')) {
          return res.status(409).json({ error: '角色名称已存在' });
        }
        return res.status(500).json({ error: err2.message });
      }
      res.json({ success: true, id: this.lastID });
    });
  });
};

// 删除自定义角色
exports.deleteRole = (req, res) => {
  const { roleId } = req.params;
  
  // 检查是否为系统角色
  db.get('SELECT id, name, is_system FROM roles WHERE id = ?', [roleId], (err, role) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!role) return res.status(404).json({ error: '角色不存在' });
    if (role.is_system) {
      return res.status(403).json({ error: '系统内置角色不可删除' });
    }
    
    // 检查是否有用户使用此角色
    db.get('SELECT COUNT(*) as count FROM users WHERE role_id = ?', [roleId], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (row.count > 0) {
        return res.status(400).json({ error: `还有 ${row.count} 个用户使用此角色，请先修改用户角色` });
      }
      
      // 删除权限和角色
      db.run('DELETE FROM role_permissions WHERE role_id = ?', [roleId], () => {
        db.run('DELETE FROM roles WHERE id = ?', [roleId], function(err3) {
          if (err3) return res.status(500).json({ error: err3.message });
          auth.clearPermissionCache(parseInt(roleId));
          res.json({ success: true, message: `角色 "${role.name}" 已删除` });
        });
      });
    });
  });
};

// 兼容旧的 updatePermissions 方法（废弃，但保留以免报错）
exports.updatePermissions = (req, res) => {
  res.status(410).json({ error: '此接口已废弃，请使用角色权限管理接口' });
};
