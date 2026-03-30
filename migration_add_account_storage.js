const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// 添加游戏账号和存储位置字段
const migrations = [
  // 添加游戏账号字段
  'ALTER TABLE games ADD COLUMN game_account TEXT',

  // 添加存储位置字段,默认值为"硬盘1号"
  'ALTER TABLE games ADD COLUMN storage_location TEXT DEFAULT "硬盘1号"'
];

// 执行迁移
migrations.forEach((sql, index) => {
  db.run(sql, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`Migration ${index + 1}: Column already exists, skipping...`);
      } else {
        console.error(`Migration ${index + 1} error:`, err.message);
      }
    } else {
      console.log(`Migration ${index + 1} completed successfully:`, sql);
    }

    // 最后一个迁移完成后关闭连接
    if (index === migrations.length - 1) {
      db.close(() => {
        console.log('Database connection closed.');
      });
    }
  });
});
