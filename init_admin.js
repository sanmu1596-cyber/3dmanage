const auth = require('./auth');
const db = require('./database');

// 创建默认管理员账户
const createDefaultAdmin = () => {
  const username = 'admin';
  const password = 'admin123';
  const realName = '系统管理员';
  const role = 'admin';
  
  const hashedPassword = auth.hashPassword(password);
  
  // 检查是否已存在管理员
  const checkSql = 'SELECT id FROM users WHERE username = ?';
  db.get(checkSql, [username], (err, user) => {
    if (err) {
      console.error('检查管理员失败:', err.message);
      return;
    }
    
    if (user) {
      console.log('管理员账户已存在，跳过创建');
      process.exit(0);
    }
    
    // 创建管理员用户
    const userSql = 'INSERT INTO users (username, password, real_name, role) VALUES (?, ?, ?, ?)';
    db.run(userSql, [username, hashedPassword, realName, role], function(err) {
      if (err) {
        console.error('创建管理员失败:', err.message);
        process.exit(1);
      }
      
      console.log('管理员用户创建成功');
      
      // 创建管理员权限（所有权限为1）
      const permSql = `
        INSERT INTO permissions (
          user_id, can_view_members, can_edit_members, can_delete_members,
          can_view_devices, can_edit_devices, can_delete_devices,
          can_view_games, can_edit_games, can_delete_games,
          can_view_tests, can_edit_tests, can_delete_tests,
          can_view_bugs, can_edit_bugs, can_delete_bugs,
          can_manage_users
        ) VALUES (?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
      `;
      
      db.run(permSql, [this.lastID], (err) => {
        if (err) {
          console.error('创建管理员权限失败:', err.message);
          process.exit(1);
        }
        
        console.log('管理员权限创建成功');
        console.log('\n默认管理员账户信息：');
        console.log('用户名:', username);
        console.log('密码:', password);
        console.log('\n请登录后立即修改密码！');
        
        process.exit(0);
      });
    });
  });
};

createDefaultAdmin();
