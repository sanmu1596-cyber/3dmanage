/**
 * 迁移脚本：为 games 表添加 game_engine（游戏引擎）字段
 * 运行方式：node migration_add_game_engine.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

const migration = 'ALTER TABLE games ADD COLUMN game_engine TEXT';

console.log('开始执行迁移：添加 game_engine 字段...');

db.run(migration, (err) => {
  if (err && err.message.includes('duplicate column name')) {
    console.log('  ⚠ game_engine 字段已存在，跳过');
  } else if (err) {
    console.error('  ✗ 添加 game_engine 字段失败:', err.message);
  } else {
    console.log('  ✓ game_engine 字段添加成功');
  }
  db.close(() => {
    console.log('迁移完成。');
  });
});
