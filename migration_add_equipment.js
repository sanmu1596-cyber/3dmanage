/**
 * 设备管理模块 - 数据库迁移
 * 字段：设备名称、设备编号、保管人、日期、备注
 */
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(path.join(__dirname, "database.sqlite"));

db.serialize(() => {
  console.log("开始创建 equipment 表...");

  db.run(`CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    equipment_no TEXT,
    keeper TEXT,
    date TEXT DEFAULT CURRENT_DATE,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error("创建表失败:", err.message);
    else console.log("✓ equipment 表创建成功");
  });

  db.run("CREATE INDEX IF NOT EXISTS idx_equipment_no ON equipment(equipment_no)");
  db.run("CREATE INDEX IF NOT EXISTS idx_equipment_keeper ON equipment(keeper)");
});

setTimeout(() => {
  db.get("SELECT COUNT(*) as cnt FROM equipment", (err, row) => {
    console.log("equipment 表现在有", row ? row.cnt : 0, "条记录");
    db.close();
  });
}, 800);
