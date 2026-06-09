// =============================================
// hook开发状态 数据迁移脚本
// 用法: node migrate_hook_status.js
// =============================================
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 迁移前 ===');
const before = db.prepare("SELECT online_status, COUNT(*) as cnt FROM games GROUP BY online_status ORDER BY cnt DESC").all();
before.forEach(r => console.log(`  ${r.online_status || '(空)'} : ${r.cnt}条`));

const changes = [
  ["pending", "developing", "待上线→开发中"],
  ["pending_dev", "developing", "pending_dev→开发中"],
  ["online", "developing", "已上线→开发中"],
];

let totalChanged = 0;
for (const [oldVal, newVal, desc] of changes) {
  const result = db.prepare("UPDATE games SET online_status = ? WHERE online_status = ?").run(newVal, oldVal);
  console.log(`  ${desc} : ${result.changes}条`);
  totalChanged += result.changes;
}

// 空值
const emptyResult = db.prepare("UPDATE games SET online_status = 'developing' WHERE online_status = '' OR online_status IS NULL").run();
console.log(`  空/NULL→开发中 : ${emptyResult.changes}条`);
totalChanged += emptyResult.changes;

console.log('\n=== 迁移后 ===');
const after = db.prepare("SELECT online_status, COUNT(*) as cnt FROM games GROUP BY online_status ORDER BY cnt DESC").all();
after.forEach(r => console.log(`  ${r.online_status || '(空)'} : ${r.cnt}条`));

console.log(`\n✅ 共修改 ${totalChanged} 条记录`);
db.close();
