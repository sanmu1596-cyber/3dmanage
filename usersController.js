const auth = require('./auth');
const db = require('./database');

// 登录
exports.login = (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  
  const hashedPassword = auth.hashPassword(password);
  
  // 查询用户和权限
  const sql = `
    SELECT u.*, p.* FROM users u
    LEFT JOIN permissions p ON p.user_id = u.id
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
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时后过期
    
    // 保存会话
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
      
      // 返回用户信息和token
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          realName: user.real_name,
          role: user.role
        }
      });
    });
  });
};

// 登出
exports.logout = (req, res) => {
  const token = req.headers['x-auth-token'];
  
  if (token) {
    const sql = 'UPDATE login_logs SET logout_time = CURRENT_TIMESTAMP WHERE user_id = ? AND logout_time IS NULL';
    db.run(sql, [req.user.id]);
    
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

// 创建用户
exports.createUser = (req, res) => {
  const { username, password, realName, role = 'user' } = req.body;
  
  if (!username || !password || !realName) {
    return res.status(400).json({ error: '用户名、密码和真实姓名不能为空' });
  }
  
  const hashedPassword = auth.hashPassword(password);
  
  const sql = 'INSERT INTO users (username, password, real_name, role) VALUES (?, ?, ?, ?)';
  db.run(sql, [username, hashedPassword, realName, role], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: '用户名已存在' });
      }
      return res.status(500).json({ error: err.message });
    }
    
    // 创建默认权限
    const defaultPermissions = {
      can_view_members: 1,
      can_edit_members: 0,
      can_delete_members: 0,
      can_view_devices: 1,
      can_edit_devices: 0,
      can_delete_devices: 0,
      can_view_games: 1,
      can_edit_games: 0,
      can_delete_games: 0,
      can_view_tests: 1,
      can_edit_tests: 0,
      can_delete_tests: 0,
      can_view_bugs: 1,
      can_edit_bugs: 0,
      can_delete_bugs: 0,
      can_manage_users: 0
    };
    
    const permSql = `
      INSERT INTO permissions (
        user_id, can_view_members, can_edit_members, can_delete_members,
        can_view_devices, can_edit_devices, can_delete_devices,
        can_view_games, can_edit_games, can_delete_games,
        can_view_tests, can_edit_tests, can_delete_tests,
        can_view_bugs, can_edit_bugs, can_delete_bugs,
        can_manage_users
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(permSql, [
      this.lastID,
      defaultPermissions.can_view_members,
      defaultPermissions.can_edit_members,
      defaultPermissions.can_delete_members,
      defaultPermissions.can_view_devices,
      defaultPermissions.can_edit_devices,
      defaultPermissions.can_delete_devices,
      defaultPermissions.can_view_games,
      defaultPermissions.can_edit_games,
      defaultPermissions.can_delete_games,
      defaultPermissions.can_view_tests,
      defaultPermissions.can_edit_tests,
      defaultPermissions.can_delete_tests,
      defaultPermissions.can_view_bugs,
      defaultPermissions.can_edit_bugs,
      defaultPermissions.can_delete_bugs,
      defaultPermissions.can_manage_users
    ]);
    
    res.json({ success: true, id: this.lastID });
  });
};

// 获取所有用户列表
exports.getAllUsers = (req, res) => {
  const sql = `
    SELECT u.id, u.username, u.real_name, u.role, u.status, u.created_at,
           p.can_view_members, p.can_edit_members, p.can_delete_members,
           p.can_view_devices, p.can_edit_devices, p.can_delete_devices,
           p.can_view_games, p.can_edit_games, p.can_delete_games,
           p.can_view_tests, p.can_edit_tests, p.can_delete_tests,
           p.can_view_bugs, p.can_edit_bugs, p.can_delete_bugs,
           p.can_manage_users
    FROM users u
    LEFT JOIN permissions p ON p.user_id = u.id
    ORDER BY u.created_at DESC
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const users = rows.map(user => ({
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role,
      status: user.status,
      createdAt: user.created_at,
      permissions: {
        members: { view: !!user.can_view_members, edit: !!user.can_edit_members, delete: !!user.can_delete_members },
        devices: { view: !!user.can_view_devices, edit: !!user.can_edit_devices, delete: !!user.can_delete_devices },
        games: { view: !!user.can_view_games, edit: !!user.can_edit_games, delete: !!user.can_delete_games },
        tests: { view: !!user.can_view_tests, edit: !!user.can_edit_tests, delete: !!user.can_delete_tests },
        bugs: { view: !!user.can_view_bugs, edit: !!user.can_edit_bugs, delete: !!user.can_delete_bugs },
        users: { manage: !!user.can_manage_users }
      }
    }));
    
    res.json({ success: true, data: users });
  });
};

// 更新用户权限
exports.updatePermissions = (req, res) => {
  const { userId } = req.params;
  const permissions = req.body;
  
  const sql = `
    UPDATE permissions SET
      can_view_members = ?, can_edit_members = ?, can_delete_members = ?,
      can_view_devices = ?, can_edit_devices = ?, can_delete_devices = ?,
      can_view_games = ?, can_edit_games = ?, can_delete_games = ?,
      can_view_tests = ?, can_edit_tests = ?, can_delete_tests = ?,
      can_view_bugs = ?, can_edit_bugs = ?, can_delete_bugs = ?,
      can_manage_users = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `;
  
  db.run(sql, [
    permissions.members?.view ? 1 : 0,
    permissions.members?.edit ? 1 : 0,
    permissions.members?.delete ? 1 : 0,
    permissions.devices?.view ? 1 : 0,
    permissions.devices?.edit ? 1 : 0,
    permissions.devices?.delete ? 1 : 0,
    permissions.games?.view ? 1 : 0,
    permissions.games?.edit ? 1 : 0,
    permissions.games?.delete ? 1 : 0,
    permissions.tests?.view ? 1 : 0,
    permissions.tests?.edit ? 1 : 0,
    permissions.tests?.delete ? 1 : 0,
    permissions.bugs?.view ? 1 : 0,
    permissions.bugs?.edit ? 1 : 0,
    permissions.bugs?.delete ? 1 : 0,
    permissions.users?.manage ? 1 : 0,
    userId
  ], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({ success: true, message: '权限更新成功' });
  });
};

// 删除用户
exports.deleteUser = (req, res) => {
  const { userId } = req.params;
  
  // 不能删除自己
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
