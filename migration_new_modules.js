/**
 * 迁移脚本：创建新模块表
 * - 游戏版本 (game_versions)
 * - 交织问题 (interlace_issues)
 * - 交织版本 (interlace_versions)
 * - 客户端问题 (client_issues)
 */

const db = require('./database');

console.log('开始迁移：创建新模块表...');

const migrations = [
  // 游戏版本表
  `CREATE TABLE IF NOT EXISTS game_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER,
    game_name TEXT,
    version_number TEXT NOT NULL,
    status TEXT DEFAULT 'testing',
    version_date TEXT,
    changelog TEXT,
    notes TEXT,
    updater_id INTEGER,
    updater_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  
  // 交织问题表
  `CREATE TABLE IF NOT EXISTS interlace_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_type TEXT,
    version TEXT,
    priority TEXT,
    issue_desc TEXT,
    owner TEXT,
    status TEXT DEFAULT '待处理',
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  
  // 交织版本表
  `CREATE TABLE IF NOT EXISTS interlace_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_number TEXT NOT NULL,
    status TEXT DEFAULT 'testing',
    version_date TEXT,
    changelog TEXT,
    notes TEXT,
    updater_id INTEGER,
    updater_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  
  // 客户端问题表
  `CREATE TABLE IF NOT EXISTS client_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_type TEXT,
    version TEXT,
    priority TEXT,
    issue_desc TEXT,
    owner TEXT,
    status TEXT DEFAULT '待处理',
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  
  // 索引
  'CREATE INDEX IF NOT EXISTS idx_game_versions_game ON game_versions(game_id)',
  'CREATE INDEX IF NOT EXISTS idx_game_versions_status ON game_versions(status)',
  'CREATE INDEX IF NOT EXISTS idx_interlace_issues_status ON interlace_issues(status)',
  'CREATE INDEX IF NOT EXISTS idx_interlace_versions_status ON interlace_versions(status)',
  'CREATE INDEX IF NOT EXISTS idx_client_issues_status ON client_issues(status)'
];

let completed = 0;
migrations.forEach((sql, index) => {
  db.run(sql, (err) => {
    if (err) {
      console.error(`  ✗ 迁移 ${index + 1} 失败:`, err.message);
    } else {
      console.log(`  ✓ 迁移 ${index + 1} 完成`);
    }
    completed++;
    if (completed === migrations.length) {
      console.log('\n所有迁移完成！');
      process.exit(0);
    }
  });
});
