const db = require('./database');

// 创建用户表
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    real_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('创建users表失败:', err.message);
  } else {
    console.log('users表创建成功');
  }
});

// 创建权限表
db.run(`
  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    can_view_members INTEGER DEFAULT 0,
    can_edit_members INTEGER DEFAULT 0,
    can_delete_members INTEGER DEFAULT 0,
    can_view_devices INTEGER DEFAULT 0,
    can_edit_devices INTEGER DEFAULT 0,
    can_delete_devices INTEGER DEFAULT 0,
    can_view_games INTEGER DEFAULT 0,
    can_edit_games INTEGER DEFAULT 0,
    can_delete_games INTEGER DEFAULT 0,
    can_view_tests INTEGER DEFAULT 0,
    can_edit_tests INTEGER DEFAULT 0,
    can_delete_tests INTEGER DEFAULT 0,
    can_view_bugs INTEGER DEFAULT 0,
    can_edit_bugs INTEGER DEFAULT 0,
    can_delete_bugs INTEGER DEFAULT 0,
    can_manage_users INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`, (err) => {
  if (err) {
    console.error('创建permissions表失败:', err.message);
  } else {
    console.log('permissions表创建成功');
  }
});

// 创建登录日志表
db.run(`
  CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    logout_time DATETIME,
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`, (err) => {
  if (err) {
    console.error('创建login_logs表失败:', err.message);
  } else {
    console.log('login_logs表创建成功');
  }
});

// 创建会话表
db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`, (err) => {
  if (err) {
    console.error('创建sessions表失败:', err.message);
  } else {
    console.log('sessions表创建成功');
  }
});

console.log('用户认证相关表创建完成');

// 5分钟后关闭数据库连接
setTimeout(() => {
  db.close();
  console.log('数据库连接已关闭');
}, 5000);
