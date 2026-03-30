const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库文件路径
const DB_PATH = path.join(__dirname, 'database.sqlite');

// 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功');
    initDatabase();
  }
});

// 初始化数据库表
function initDatabase() {
  db.serialize(() => {
    // 删除旧表(仅用于开发环境)
    db.run(`DROP TABLE IF EXISTS bugs`);
    db.run(`DROP TABLE IF EXISTS tests`);
    db.run(`DROP TABLE IF EXISTS games`);
    db.run(`DROP TABLE IF EXISTS devices`);
    db.run(`DROP TABLE IF EXISTS members`);

    // 创建成员表
    db.run(`CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      wechat_id TEXT,
      role TEXT,
      duty TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 创建设备表
    db.run(`CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manufacturer TEXT,
      device_type TEXT,
      name TEXT NOT NULL,
      requirements TEXT,
      quantity INTEGER DEFAULT 1,
      keeper TEXT,
      notes TEXT,
      adapter_completion_rate TEXT DEFAULT '0%',
      total_bugs INTEGER DEFAULT 0,
      completed_adaptations INTEGER DEFAULT 0,
      total_games INTEGER DEFAULT 0,
      status TEXT DEFAULT 'available',
      assigned_to INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_to) REFERENCES members(id)
    )`);

    // 创建游戏表
    db.run(`CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      english_name TEXT,
      platform TEXT,
      game_id TEXT,
      game_type TEXT,
      description TEXT,
      developer TEXT,
      operator TEXT,
      release_date DATE,
      config_path TEXT,
      adapter_progress TEXT DEFAULT '0%',
      version TEXT,
      package_size TEXT,
      adaptation_status TEXT DEFAULT 'pending',
      adaptation_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 创建测试表
    db.run(`CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      game_id INTEGER,
      device_id INTEGER,
      tester_id INTEGER,
      test_date DATE,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      result TEXT,
      bugs_count INTEGER DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (device_id) REFERENCES devices(id),
      FOREIGN KEY (tester_id) REFERENCES members(id)
    )`);

    // 创建缺陷表
    db.run(`CREATE TABLE IF NOT EXISTS bugs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      versions TEXT,
      actual_fix_time DATE,
      planned_fix_time DATE,
      device_name TEXT,
      discovery_time DATE,
      owner TEXT,
      bug_status TEXT,
      priority TEXT,
      problem_type TEXT,
      description TEXT,
      steps TEXT,
      test_id INTEGER,
      assignee_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (test_id) REFERENCES tests(id),
      FOREIGN KEY (assignee_id) REFERENCES members(id)
    )`);

    console.log('数据库表初始化完成');
  });
}

module.exports = db;
