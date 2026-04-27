/**
 * 游戏问题模块 - 数据库迁移
 * 字段：序号、游戏名称、游戏平台、设备、模块(Launcher/Hook/交织)、版本号、问题描述、附件、日期
 */
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(path.join(__dirname, "database.sqlite"));

db.serialize(() => {
  console.log("开始创建 game_issues 表...");

  db.run(`CREATE TABLE IF NOT EXISTS game_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER,
    game_name TEXT NOT NULL,
    game_platform TEXT,
    device_id INTEGER,
    device_name TEXT,
    module TEXT NOT NULL DEFAULT 'Launcher',
    version_id INTEGER,
    version_number TEXT,
    description TEXT,
    attachments TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (version_id) REFERENCES versions(id)
  )`, (err) => {
    if (err) console.error("创建表失败:", err.message);
    else console.log("✓ game_issues 表创建成功");
  });

  db.run("CREATE INDEX IF NOT EXISTS idx_game_issues_game_id ON game_issues(game_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_game_issues_device_id ON game_issues(device_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_game_issues_module ON game_issues(module)");
  db.run("CREATE INDEX IF NOT EXISTS idx_game_issues_created_at ON game_issues(created_at DESC)");
});

setTimeout(() => {
  db.get("SELECT COUNT(*) as cnt FROM game_issues", (err, row) => {
    console.log("game_issues 表现在有", row ? row.cnt : 0, "条记录");
    db.close();
  });
}, 800);
