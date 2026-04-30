/**
 * game_issues 表结构迁移 v2
 * 旧字段: game_id, game_name, game_platform, device_id, device_name, module, version_id, version_number, description, attachments
 * 新字段: game_name, issue_type, priority, issue_desc, owner, status, remarks
 * 策略: 添加新字段，并将旧数据映射到新字段
 */
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(path.join(__dirname, "database.sqlite"));

db.serialize(() => {
  console.log("开始迁移 game_issues 表到 v2...");

  // 添加新字段（如果不存在）
  const addColumns = [
    "ALTER TABLE game_issues ADD COLUMN issue_type TEXT DEFAULT ''",
    "ALTER TABLE game_issues ADD COLUMN priority TEXT DEFAULT ''",
    "ALTER TABLE game_issues ADD COLUMN issue_desc TEXT DEFAULT ''",
    "ALTER TABLE game_issues ADD COLUMN owner TEXT DEFAULT ''",
    "ALTER TABLE game_issues ADD COLUMN status TEXT DEFAULT '待处理'",
    "ALTER TABLE game_issues ADD COLUMN remarks TEXT DEFAULT ''",
  ];

  addColumns.forEach(sql => {
    db.run(sql, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error("添加字段失败:", err.message);
      }
    });
  });

  // 将旧数据映射到新字段
  // description -> issue_desc
  db.run(`UPDATE game_issues SET issue_desc = description WHERE issue_desc = '' AND description IS NOT NULL`, (err) => {
    if (err) console.error("迁移 description->issue_desc 失败:", err.message);
    else console.log("✓ description -> issue_desc 迁移完成");
  });

  // game_name 已存在，无需迁移
  // module -> issue_type (将 Launcher/Hook/交织 映射为对应类型)
  db.run(`UPDATE game_issues SET issue_type = CASE
    WHEN module LIKE '%Bug%' OR module LIKE '%bug%' THEN 'Bug'
    WHEN module LIKE '%优化%' THEN '优化'
    WHEN module LIKE '%新功能%' THEN '新功能'
    ELSE '其他'
  END WHERE (issue_type = '' OR issue_type IS NULL) AND module IS NOT NULL`, (err) => {
    if (err) console.error("迁移 module->issue_type 失败:", err.message);
    else console.log("✓ module -> issue_type 迁移完成");
  });

  console.log("迁移脚本执行完成（部分 ALTER 报错属正常，字段可能已存在）");
});

setTimeout(() => {
  db.get("SELECT COUNT(*) as cnt FROM game_issues", (err, row) => {
    if (err) { console.error(err.message); db.close(); process.exit(1); }
    console.log("game_issues 表现在有", row.cnt, "条记录");
    // 查看新字段情况
    db.all("SELECT id, game_name, issue_type, priority, issue_desc, owner, status FROM game_issues LIMIT 5", (err2, rows) => {
      if (!err2 && rows) {
        console.log("样本数据:", JSON.stringify(rows, null, 2));
      }
      db.close();
    });
  });
}, 1500);
