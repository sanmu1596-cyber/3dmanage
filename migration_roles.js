/**
 * 迁移脚本：创建角色权限系统
 * - 新建 roles 表
 * - 新建 role_permissions 表
 * - 为 users 表添加 role_id 字段
 * - 插入 6 个默认角色及默认权限
 * - admin 用户设为超级管理员（全部权限）
 * 
 * 运行方式：node migration_roles.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// 9 个模块
const MODULES = [
  'members', 'devices', 'games', 'tests', 'bugs',
  'config_plan', 'adaptation', 'field_settings', 'user_management'
];

// 6 种操作
const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'import'];

// 6 个默认角色及其默认权限
const DEFAULT_ROLES = [
  {
    name: '超级管理员',
    description: '拥有系统全部权限',
    is_system: 1,
    color: '#e53e3e',
    sort_order: 0,
    // 全部权限
    permissions: (() => {
      const p = {};
      MODULES.forEach(m => {
        ACTIONS.forEach(a => { p[`${m}:${a}`] = 1; });
      });
      return p;
    })()
  },
  {
    name: '项目经理',
    description: '管理项目整体进度，拥有大部分模块的完整权限',
    is_system: 1,
    color: '#3182ce',
    sort_order: 1,
    permissions: (() => {
      const p = {};
      // 项目经理：全部模块的查看+创建+编辑+导出，大部分可删除
      MODULES.forEach(m => {
        p[`${m}:view`] = 1;
        p[`${m}:create`] = 1;
        p[`${m}:edit`] = 1;
        p[`${m}:export`] = 1;
        // 除了用户管理和字段设置，其余可删除
        if (m !== 'user_management' && m !== 'field_settings') {
          p[`${m}:delete`] = 1;
        }
        // 游戏可导入
        if (m === 'games') {
          p[`${m}:import`] = 1;
        }
      });
      // 用户管理：可查看、创建
      p['user_management:create'] = 1;
      return p;
    })()
  },
  {
    name: '测试人员',
    description: '负责游戏测试和缺陷管理',
    is_system: 1,
    color: '#38a169',
    sort_order: 2,
    permissions: (() => {
      const p = {};
      // 游戏：查看+导出
      p['games:view'] = 1;
      p['games:export'] = 1;
      // 设备：查看
      p['devices:view'] = 1;
      // 成员：查看
      p['members:view'] = 1;
      // 测试：全部
      ['view', 'create', 'edit', 'delete', 'export'].forEach(a => { p[`tests:${a}`] = 1; });
      // 缺陷：全部
      ['view', 'create', 'edit', 'delete', 'export'].forEach(a => { p[`bugs:${a}`] = 1; });
      // 适配进展：查看
      p['adaptation:view'] = 1;
      // 配置计划：查看
      p['config_plan:view'] = 1;
      return p;
    })()
  },
  {
    name: '开发人员',
    description: '负责游戏适配开发',
    is_system: 1,
    color: '#805ad5',
    sort_order: 3,
    permissions: (() => {
      const p = {};
      // 游戏：查看
      p['games:view'] = 1;
      // 设备：查看
      p['devices:view'] = 1;
      // 成员：查看
      p['members:view'] = 1;
      // 缺陷：查看+编辑
      p['bugs:view'] = 1;
      p['bugs:edit'] = 1;
      // 测试：查看
      p['tests:view'] = 1;
      // 适配进展：查看+编辑
      p['adaptation:view'] = 1;
      p['adaptation:edit'] = 1;
      // 配置计划：查看
      p['config_plan:view'] = 1;
      return p;
    })()
  },
  {
    name: '产品人员',
    description: '负责产品规划和游戏管理',
    is_system: 1,
    color: '#d69e2e',
    sort_order: 4,
    permissions: (() => {
      const p = {};
      // 游戏：全部
      ['view', 'create', 'edit', 'delete', 'export', 'import'].forEach(a => { p[`games:${a}`] = 1; });
      // 设备：查看
      p['devices:view'] = 1;
      // 成员：查看
      p['members:view'] = 1;
      // 配置计划：全部
      ['view', 'create', 'edit', 'delete'].forEach(a => { p[`config_plan:${a}`] = 1; });
      // 适配进展：查看
      p['adaptation:view'] = 1;
      // 测试：查看
      p['tests:view'] = 1;
      // 缺陷：查看
      p['bugs:view'] = 1;
      p['bugs:export'] = 1;
      return p;
    })()
  },
  {
    name: '运维人员',
    description: '负责设备管理和系统维护',
    is_system: 1,
    color: '#718096',
    sort_order: 5,
    permissions: (() => {
      const p = {};
      // 设备：全部
      ['view', 'create', 'edit', 'delete', 'export'].forEach(a => { p[`devices:${a}`] = 1; });
      // 成员：查看
      p['members:view'] = 1;
      // 游戏：查看
      p['games:view'] = 1;
      // 字段设置：全部
      ['view', 'edit', 'delete'].forEach(a => { p[`field_settings:${a}`] = 1; });
      p['field_settings:create'] = 1;
      // 适配进展：查看
      p['adaptation:view'] = 1;
      // 测试：查看
      p['tests:view'] = 1;
      // 缺陷：查看
      p['bugs:view'] = 1;
      return p;
    })()
  }
];

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function migrate() {
  console.log('========== 开始角色权限系统迁移 ==========\n');

  // 1. 创建 roles 表
  console.log('1. 创建 roles 表...');
  await run(`CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    is_system INTEGER DEFAULT 0,
    color TEXT DEFAULT '#718096',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('   ✅ roles 表创建成功');

  // 2. 创建 role_permissions 表
  console.log('2. 创建 role_permissions 表...');
  await run(`CREATE TABLE IF NOT EXISTS role_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id INTEGER NOT NULL,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    allowed INTEGER DEFAULT 0,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    UNIQUE(role_id, module, action)
  )`);
  console.log('   ✅ role_permissions 表创建成功');

  // 3. 为 users 表添加 role_id 字段
  console.log('3. 为 users 表添加 role_id 字段...');
  try {
    await run(`ALTER TABLE users ADD COLUMN role_id INTEGER DEFAULT NULL`);
    console.log('   ✅ role_id 字段添加成功');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('   ⏭️  role_id 字段已存在，跳过');
    } else {
      throw e;
    }
  }

  // 4. 插入默认角色
  console.log('4. 插入默认角色...');
  const roleIds = {};
  for (const role of DEFAULT_ROLES) {
    // 检查是否已存在
    const existing = await get('SELECT id FROM roles WHERE name = ?', [role.name]);
    if (existing) {
      roleIds[role.name] = existing.id;
      console.log(`   ⏭️  "${role.name}" 已存在 (id=${existing.id})，跳过`);
      continue;
    }
    const result = await run(
      'INSERT INTO roles (name, description, is_system, color, sort_order) VALUES (?, ?, ?, ?, ?)',
      [role.name, role.description, role.is_system, role.color, role.sort_order]
    );
    roleIds[role.name] = result.lastID;
    console.log(`   ✅ 角色 "${role.name}" 创建成功 (id=${result.lastID})`);
  }

  // 5. 插入角色权限
  console.log('5. 插入角色权限...');
  for (const role of DEFAULT_ROLES) {
    const roleId = roleIds[role.name];
    // 先清除旧权限
    await run('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    
    // 插入所有模块×操作的权限
    for (const mod of MODULES) {
      for (const act of ACTIONS) {
        const key = `${mod}:${act}`;
        const allowed = role.permissions[key] ? 1 : 0;
        await run(
          'INSERT INTO role_permissions (role_id, module, action, allowed) VALUES (?, ?, ?, ?)',
          [roleId, mod, act, allowed]
        );
      }
    }
    
    // 统计已授权数量
    const grantedCount = Object.values(role.permissions).filter(v => v).length;
    const totalCount = MODULES.length * ACTIONS.length;
    console.log(`   ✅ "${role.name}" 权限设置完成 (${grantedCount}/${totalCount})`);
  }

  // 6. 将 admin 用户设置为超级管理员
  console.log('6. 关联 admin 用户到超级管理员角色...');
  const adminRoleId = roleIds['超级管理员'];
  const adminUser = await get("SELECT id FROM users WHERE username = 'admin'");
  if (adminUser) {
    await run('UPDATE users SET role_id = ? WHERE id = ?', [adminRoleId, adminUser.id]);
    console.log(`   ✅ admin 用户 (id=${adminUser.id}) 已设为超级管理员`);
  } else {
    console.log('   ⚠️  admin 用户不存在，请手动关联');
  }

  // 7. 更新 field_options 中的 user_role 字段
  console.log('7. 更新字段选项中的用户角色...');
  const roleOptions = DEFAULT_ROLES.map(r => ({
    value: r.name,
    label: r.name
  }));
  await run(
    "UPDATE field_options SET options = ?, updated_at = CURRENT_TIMESTAMP WHERE field_key = 'user_role'",
    [JSON.stringify(roleOptions)]
  );
  console.log('   ✅ user_role 字段选项已更新');

  console.log('\n========== 迁移完成 ==========');
  console.log('\n权限矩阵概览：');
  console.log('模块:', MODULES.join(', '));
  console.log('操作:', ACTIONS.join(', '));
  console.log('角色:', DEFAULT_ROLES.map(r => r.name).join(', '));
  console.log(`\n共 ${MODULES.length} 个模块 × ${ACTIONS.length} 种操作 = ${MODULES.length * ACTIONS.length} 个权限位`);

  db.close();
}

migrate().catch(err => {
  console.error('❌ 迁移失败:', err);
  db.close();
  process.exit(1);
});
