/**
 * 核心业务流程迁移脚本
 * 
 * 改动：
 * 1. plans 表：新增 status (draft/published), creator_id
 * 2. plan_games 表：新增 assigned_to (user_id), adapt_progress (0-100)
 * 3. 新增索引
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

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

async function migrate() {
  console.log('=== 核心业务流程迁移 ===\n');

  // 1. plans 表新增字段
  console.log('1. 为 plans 表添加 status 和 creator_id 字段...');
  
  try {
    await run("ALTER TABLE plans ADD COLUMN status TEXT DEFAULT 'draft'");
    console.log('   ✅ status 字段添加成功');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('   ⏭️  status 字段已存在，跳过');
    } else {
      throw e;
    }
  }

  try {
    await run("ALTER TABLE plans ADD COLUMN creator_id INTEGER DEFAULT NULL");
    console.log('   ✅ creator_id 字段添加成功');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('   ⏭️  creator_id 字段已存在，跳过');
    } else {
      throw e;
    }
  }

  // 2. plan_games 表新增字段
  console.log('\n2. 为 plan_games 表添加 assigned_to 和 adapt_progress 字段...');

  try {
    await run("ALTER TABLE plan_games ADD COLUMN assigned_to INTEGER DEFAULT NULL");
    console.log('   ✅ assigned_to 字段添加成功');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('   ⏭️  assigned_to 字段已存在，跳过');
    } else {
      throw e;
    }
  }

  try {
    await run("ALTER TABLE plan_games ADD COLUMN adapt_progress INTEGER DEFAULT 0");
    console.log('   ✅ adapt_progress 字段添加成功');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('   ⏭️  adapt_progress 字段已存在，跳过');
    } else {
      throw e;
    }
  }

  // 3. 新增索引
  console.log('\n3. 创建索引...');
  
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status)",
    "CREATE INDEX IF NOT EXISTS idx_plans_creator ON plans(creator_id)",
    "CREATE INDEX IF NOT EXISTS idx_plan_games_assigned ON plan_games(assigned_to)",
    "CREATE INDEX IF NOT EXISTS idx_plan_games_status ON plan_games(adapt_status)",
  ];

  for (const sql of indexes) {
    try {
      await run(sql);
      console.log('   ✅ ' + sql.match(/idx_\w+/)[0]);
    } catch (e) {
      console.log('   ⚠️  ' + e.message);
    }
  }

  // 4. 将现有计划标记为已发布（已创建的老数据）
  console.log('\n4. 将现有计划标记为 published...');
  const result = await run("UPDATE plans SET status = 'published' WHERE status = 'draft' OR status IS NULL");
  console.log(`   ✅ 更新了 ${result.changes} 条计划`);

  // 5. 将 plan_games 中已有的 owner_name 关联到 assigned_to
  console.log('\n5. 根据 owner_name 回填 assigned_to...');
  await run(`
    UPDATE plan_games SET assigned_to = (
      SELECT u.id FROM users u 
      WHERE u.is_member = 1 AND u.real_name = plan_games.owner_name
      LIMIT 1
    ) WHERE owner_name != '' AND owner_name IS NOT NULL AND assigned_to IS NULL
  `);
  const backfilled = await get("SELECT COUNT(*) as c FROM plan_games WHERE assigned_to IS NOT NULL");
  console.log(`   ✅ 回填了 ${backfilled.c} 条记录`);

  console.log('\n=== 迁移完成 ===');
  db.close();
}

migrate().catch(err => {
  console.error('迁移失败:', err);
  db.close();
  process.exit(1);
});
