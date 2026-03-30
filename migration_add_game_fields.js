const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');

// 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
    process.exit(1);
  } else {
    console.log('数据库连接成功');
  }
});

// 添加新字段到games表
const addNewFields = () => {
  db.serialize(() => {
    // 1. 添加负责人字段 (关联members表的id)
    db.run(`ALTER TABLE games ADD COLUMN owner_id INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('添加owner_id字段失败:', err.message);
      } else {
        console.log('✓ owner_id字段添加成功或已存在');
      }
    });

    // 2. 添加上线状态字段
    db.run(`ALTER TABLE games ADD COLUMN online_status TEXT DEFAULT 'pending'`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('添加online_status字段失败:', err.message);
      } else {
        console.log('✓ online_status字段添加成功或已存在');
      }
    });

    // 3. 添加品质字段
    db.run(`ALTER TABLE games ADD COLUMN quality TEXT DEFAULT 'normal'`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('添加quality字段失败:', err.message);
      } else {
        console.log('✓ quality字段添加成功或已存在');
      }
    });

    // 验证字段是否添加成功
    db.all("PRAGMA table_info(games)", (err, rows) => {
      if (err) {
        console.error('查询表结构失败:', err.message);
      } else {
        console.log('\n当前games表字段列表:');
        rows.forEach((row, index) => {
          console.log(`${index + 1}. ${row.name} (${row.type})`);
        });
        console.log('\n迁移完成!');
      }

      // 关闭数据库连接
      db.close();
    });
  });
};

addNewFields();
