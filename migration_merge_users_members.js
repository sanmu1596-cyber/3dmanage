/**
 * 迁移脚本：合并 members 表到 users 表
 * 
 * 执行方式：node migration_merge_users_members.js
 * 
 * 操作内容：
 * 1. 给 users 表添加 wechat_id, project_role, duty, is_member 字段
 * 2. 将 members 表的 12 条数据迁移到 users 表（username/password 可为空，标记 is_member=1）
 * 3. 更新 games.owner_id, tests.tester_id, bugs.assignee_id, devices.assigned_to 外键
 *    从 members.id 映射到新的 users.id
 * 4. 更新 adaptation_records.owner_name（保持文本不变，无需迁移）
 * 5. 更新 Dashboard 统计 SQL（members_total 改为查 users WHERE is_member=1）
 * 6. 保留 members 表作为备份（重命名为 members_backup）
 */

const db = require('./database');

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
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
  console.log('========== 开始合并 members → users 迁移 ==========\n');

  // Step 1: 检查是否已经迁移过
  const usersCols = await all('PRAGMA table_info(users)');
  const hasWechatId = usersCols.some(c => c.name === 'wechat_id');
  if (hasWechatId) {
    console.log('⚠️  users 表已有 wechat_id 列，可能已经迁移过。跳过。');
    db.close();
    return;
  }

  // Step 2: 给 users 表添加新字段
  console.log('Step 1: 给 users 表添加 wechat_id, project_role, duty, is_member 字段...');
  
  // SQLite 不支持单语句 ADD MULTIPLE COLUMNS，需逐个添加
  await run('ALTER TABLE users ADD COLUMN wechat_id TEXT DEFAULT ""');
  await run('ALTER TABLE users ADD COLUMN project_role TEXT DEFAULT ""');
  await run('ALTER TABLE users ADD COLUMN duty TEXT DEFAULT ""');
  await run('ALTER TABLE users ADD COLUMN is_member INTEGER DEFAULT 0');
  
  // 把现有 admin 用户也标记为成员
  await run('UPDATE users SET is_member = 0 WHERE id = 1');
  
  console.log('   ✅ 字段添加完成\n');

  // Step 3: 放宽 username 和 password 的 NOT NULL 约束
  // SQLite 不能直接 ALTER COLUMN，需要重建表
  console.log('Step 2: 重建 users 表以允许 username/password 为空...');
  
  await run('BEGIN TRANSACTION');
  
  try {
    // 创建临时表（放宽约束）
    await run(`CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT DEFAULT '',
      real_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      role_id INTEGER DEFAULT NULL,
      wechat_id TEXT DEFAULT '',
      project_role TEXT DEFAULT '',
      duty TEXT DEFAULT '',
      is_member INTEGER DEFAULT 0
    )`);
    
    // 复制现有数据
    await run(`INSERT INTO users_new (id, username, password, real_name, role, status, created_at, updated_at, role_id, wechat_id, project_role, duty, is_member)
      SELECT id, username, password, real_name, role, status, created_at, updated_at, role_id, wechat_id, project_role, duty, is_member FROM users`);
    
    // 删除旧表，重命名新表
    await run('DROP TABLE users');
    await run('ALTER TABLE users_new RENAME TO users');
    
    await run('COMMIT');
    console.log('   ✅ users 表重建完成\n');
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }

  // Step 4: 将 members 数据迁移到 users
  console.log('Step 3: 将 members 数据迁移到 users 表...');
  
  const members = await all('SELECT * FROM members ORDER BY id');
  console.log(`   找到 ${members.length} 条成员数据`);
  
  // 建立 old_member_id -> new_user_id 的映射
  const idMapping = {};
  
  for (const m of members) {
    // 检查 users 中是否已有同名用户（通过 real_name 匹配）
    const existing = await get('SELECT id FROM users WHERE real_name = ?', [m.name]);
    
    if (existing) {
      // 已存在，更新其业务字段
      await run(
        'UPDATE users SET wechat_id = ?, project_role = ?, duty = ?, is_member = 1, status = ? WHERE id = ?',
        [m.wechat_id || '', m.role || '', m.duty || '', m.status || 'active', existing.id]
      );
      idMapping[m.id] = existing.id;
      console.log(`   📎 成员 "${m.name}" (old id=${m.id}) → 已存在用户 id=${existing.id}，更新业务字段`);
    } else {
      // 不存在，插入新用户（无 username/password，仅作为项目成员）
      const result = await run(
        'INSERT INTO users (username, password, real_name, role, status, created_at, updated_at, wechat_id, project_role, duty, is_member) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
        [null, '', m.name, 'user', m.status || 'active', m.created_at, m.updated_at, m.wechat_id || '', m.role || '', m.duty || '']
      );
      idMapping[m.id] = result.lastID;
      console.log(`   ➕ 成员 "${m.name}" (old id=${m.id}) → 新建用户 id=${result.lastID}`);
    }
  }
  
  console.log('\n   ID 映射表:');
  for (const [oldId, newId] of Object.entries(idMapping)) {
    console.log(`      members.id=${oldId} → users.id=${newId}`);
  }
  console.log('');

  // Step 5: 迁移外键引用
  console.log('Step 4: 迁移外键引用...');
  
  // games.owner_id
  for (const [oldId, newId] of Object.entries(idMapping)) {
    const result = await run('UPDATE games SET owner_id = ? WHERE owner_id = ?', [newId, parseInt(oldId)]);
    if (result.changes > 0) {
      console.log(`   games.owner_id: ${oldId} → ${newId} (${result.changes} 行)`);
    }
  }
  
  // tests.tester_id
  for (const [oldId, newId] of Object.entries(idMapping)) {
    const result = await run('UPDATE tests SET tester_id = ? WHERE tester_id = ?', [newId, parseInt(oldId)]);
    if (result.changes > 0) {
      console.log(`   tests.tester_id: ${oldId} → ${newId} (${result.changes} 行)`);
    }
  }
  
  // bugs.assignee_id
  for (const [oldId, newId] of Object.entries(idMapping)) {
    const result = await run('UPDATE bugs SET assignee_id = ? WHERE assignee_id = ?', [newId, parseInt(oldId)]);
    if (result.changes > 0) {
      console.log(`   bugs.assignee_id: ${oldId} → ${newId} (${result.changes} 行)`);
    }
  }
  
  // devices.assigned_to
  for (const [oldId, newId] of Object.entries(idMapping)) {
    const result = await run('UPDATE devices SET assigned_to = ? WHERE assigned_to = ?', [newId, parseInt(oldId)]);
    if (result.changes > 0) {
      console.log(`   devices.assigned_to: ${oldId} → ${newId} (${result.changes} 行)`);
    }
  }
  
  console.log('   ✅ 外键迁移完成\n');

  // Step 6: 备份 members 表
  console.log('Step 5: 将 members 表重命名为 members_backup...');
  await run('ALTER TABLE members RENAME TO members_backup');
  console.log('   ✅ members 表已备份为 members_backup\n');

  // Step 7: 验证
  console.log('Step 6: 验证迁移结果...');
  const userCount = await get('SELECT COUNT(*) as count FROM users');
  const memberCount = await get('SELECT COUNT(*) as count FROM users WHERE is_member = 1');
  console.log(`   users 总数: ${userCount.count}`);
  console.log(`   项目成员数: ${memberCount.count}`);
  
  const allUsers = await all('SELECT id, username, real_name, project_role, is_member, wechat_id FROM users ORDER BY id');
  console.log('\n   迁移后的 users 表:');
  allUsers.forEach(u => {
    const tag = u.is_member ? '👥成员' : '🔐仅系统';
    console.log(`      id=${u.id} ${tag} | ${u.real_name} | ${u.username || '(无账号)'} | ${u.project_role || '-'} | ${u.wechat_id || '-'}`);
  });

  console.log('\n========== 迁移完成 ==========');
  db.close();
}

migrate().catch(err => {
  console.error('❌ 迁移失败:', err);
  db.close();
  process.exit(1);
});
