/**
 * P0 数据库迁移 - 适配进展 & 配置计划持久化
 * 运行: node migration_p0.js
 */
const db = require('./database');

const migrations = [
  // 1. 适配记录表 (替代前端内存中的 progressData)
  `CREATE TABLE IF NOT EXISTS adaptation_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    game_id INTEGER NOT NULL,
    adapter_progress INTEGER DEFAULT 0,
    owner_name TEXT DEFAULT '',
    online_status TEXT DEFAULT 'pending',
    quality TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    UNIQUE(device_id, game_id)
  )`,

  // 2. 配置计划表 (替代前端内存中的 configPlans)
  `CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    plan_date TEXT NOT NULL,
    devices_json TEXT NOT NULL DEFAULT '[]',
    interlace_version TEXT DEFAULT '',
    client_version TEXT DEFAULT '',
    goal TEXT DEFAULT '',
    tab_name TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // 3. 计划内游戏表
  `CREATE TABLE IF NOT EXISTS plan_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    game_id INTEGER,
    game_name TEXT NOT NULL,
    game_platform TEXT DEFAULT '',
    game_type TEXT DEFAULT '',
    owner_name TEXT DEFAULT '',
    adapt_status TEXT DEFAULT 'not_started',
    remark TEXT DEFAULT '',
    bugs_json TEXT DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
  )`,

  // 4. 统计视图用的汇总 API 数据
  `CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT DEFAULT 'admin',
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id INTEGER,
    resource_name TEXT DEFAULT '',
    changes_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
];

console.log('开始执行 P0 数据库迁移...');

let completed = 0;
migrations.forEach((sql, index) => {
  db.run(sql, (err) => {
    if (err) {
      console.error(`迁移 ${index + 1} 失败:`, err.message);
    } else {
      console.log(`迁移 ${index + 1}/${migrations.length} 完成`);
    }
    completed++;
    if (completed === migrations.length) {
      console.log('\nP0 数据库迁移全部完成!');
      console.log('新增表: adaptation_records, plans, plan_games, activity_log');

      // 从已有的适配进展前端数据迁移现有数据
      // 由于目前数据是前端随机生成的，这里只建表，不迁移假数据
      db.close(() => {
        console.log('数据库连接已关闭');
        process.exit(0);
      });
    }
  });
});
