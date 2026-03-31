const auth = require('./auth');
const db = require('./database');

// ==================== 认证 ====================

// 登录
exports.login = (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
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
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 生成token
    const token = auth.generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const sessionSql = 'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)';
    db.run(sessionSql, [user.id, token, expiresAt.toISOString()], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // 记录登录日志
      const logSql = 'INSERT INTO login_logs (user_id, ip_address, user_agent) VALUES (?, ?, ?)';
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];
      db.run(logSql, [user.id, ipAddress, userAgent]);
      
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
};

// 登出
exports.logout = (req, res) => {
  const token = req.headers['x-auth-token'];
  
  if (token) {
    if (req.user && req.user.id) {
      const sql = 'UPDATE login_logs SET logout_time = CURRENT_TIMESTAMP WHERE user_id = ? AND logout_time IS NULL';
      db.run(sql, [req.user.id]);
    }
    const deleteSessionSql = 'DELETE FROM sessions WHERE token = ?';
    db.run(deleteSessionSql, [token]);
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
  const { username, password, realName, role_id } = req.body;
  
  if (!username || !password || !realName) {
    return res.status(400).json({ error: '用户名、密码和真实姓名不能为空' });
  }
  
  const hashedPassword = auth.hashPassword(password);
  
  const sql = 'INSERT INTO users (username, password, real_name, role, role_id) VALUES (?, ?, ?, ?, ?)';
  
  // 查询角色名称用于存储到 role 字段（兼容旧代码）
  const getRoleName = (roleId, callback) => {
    if (!roleId) return callback('user');
    db.get('SELECT name FROM roles WHERE id = ?', [roleId], (err, row) => {
      callback(row ? row.name : 'user');
    });
  };

  getRoleName(role_id, (roleName) => {
    db.run(sql, [username, hashedPassword, realName, roleName, role_id || null], function(err) {
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
           u.role_id, r.name as role_name, r.color as role_color, r.description as role_description
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
      username: user.username,
      realName: user.real_name,
      role: user.role_name || '未分配',
      role_id: user.role_id,
      roleColor: user.role_color || '#718096',
      roleDescription: user.role_description || '',
      status: user.status,
      createdAt: user.created_at
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
  const { realName, status, password, role_id } = req.body;
  
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
