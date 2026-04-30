/**
 * 游戏问题模块 - 数据库修复迁移
 * 添加 API 需要的字段：issue_type, priority, issue_desc, owner, status, remarks
 */
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(path.join(__dirname, "database.sqlite"));

db.serialize(() => {
  console.log("检查并修复 game_issues 表...");

  // 先检查表是否存在，不存在则创建完整版
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='game_issues'", (err, row) => {
    if (!row) {
      console.log("表不存在，创建完整的 game_issues 表...");
      db.run(`CREATE TABLE game_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_name TEXT NOT NULL,
        issue_type TEXT DEFAULT '',
        priority TEXT DEFAULT '',
        issue_desc TEXT,
        owner TEXT DEFAULT '',
        status TEXT DEFAULT '待处理',
        remarks TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) console.error("创建表失败:", err.message);
        else console.log("✓ game_issues 表创建成功");
      });
    } else {
      console.log("表已存在，添加缺失字段...");
      // 逐个添加可能缺失的字段（SQLite 不支持 IF NOT EXISTS 语法，用 try-catch）
      const columns = [
        { name: 'issue_type', def: "TEXT DEFAULT ''" },
        { name: 'priority', def: "TEXT DEFAULT ''" },
        { name: 'issue_desc', def: "TEXT" },
        { name: 'owner', def: "TEXT DEFAULT ''" },
        { name: 'status', def: "TEXT DEFAULT '待处理'" },
        { name: 'remarks', def: "TEXT DEFAULT ''" }
      ];
      
      columns.forEach(col => {
        db.run(`ALTER TABLE game_issues ADD COLUMN ${col.name} ${col.def}`, (err) => {
          if (err) {
            if (err.message.includes('duplicate column')) {
              console.log(`  字段 ${col.name} 已存在`);
            } else {
              console.error(`  添加 ${col.name} 失败:`, err.message);
            }
          } else {
            console.log(`  ✓ 添加字段 ${col.name}`);
          }
        });
      });
    }
  });
});

setTimeout(() => {
  db.get("SELECT COUNT(*) as cnt FROM game_issues", (err, row) => {
    if (err) {
      console.error("查询失败:", err.message);
    } else {
      console.log("game_issues 表现在有", row ? row.cnt : 0, "条记录");
    }
    console.log("✓ 迁移完成！");
    db.close();
  });
}, 1500);
