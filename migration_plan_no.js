/**
 * 迁移脚本：给 plans 表添加 plan_no（计划编号）字段
 * 编号规则：PLAN-YYYYMMDD-HHmm-序号（如 PLAN-20260401-0038-01）
 * 回填已有计划的编号
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  console.log('=== 开始迁移：添加 plan_no 字段 ===');

  // 1. 检查字段是否已存在
  db.all("PRAGMA table_info(plans)", (err, columns) => {
    if (err) { console.error('检查表结构失败:', err); process.exit(1); }

    const hasPlanNo = columns.some(c => c.name === 'plan_no');
    if (hasPlanNo) {
      console.log('plan_no 字段已存在，跳过添加');
    } else {
      db.run("ALTER TABLE plans ADD COLUMN plan_no TEXT DEFAULT ''", (err2) => {
        if (err2) console.error('添加 plan_no 字段失败:', err2);
        else console.log('✅ 添加 plan_no 字段成功');
      });
    }

    // 2. 回填已有计划的编号
    db.all("SELECT id, created_at FROM plans ORDER BY id", (err3, rows) => {
      if (err3) { console.error('查询计划失败:', err3); process.exit(1); }
      if (!rows || rows.length === 0) {
        console.log('暂无已有计划，无需回填');
        finish();
        return;
      }

      console.log(`发现 ${rows.length} 条已有计划，开始回填编号...`);

      // 按日期分组计数
      const dayCounters = {};

      const stmt = db.prepare("UPDATE plans SET plan_no = ? WHERE id = ?");
      rows.forEach((row) => {
        const dateStr = row.created_at
          ? row.created_at.replace(/[-T: ]/g, '').substring(0, 12)
          : new Date().toISOString().replace(/[-T:\.Z]/g, '').substring(0, 12);
        const dayKey = dateStr.substring(0, 8);

        if (!dayCounters[dayKey]) dayCounters[dayKey] = 0;
        dayCounters[dayKey]++;

        const hhmm = dateStr.substring(8, 12) || '0000';
        const seq = String(dayCounters[dayKey]).padStart(2, '0');
        const planNo = `PLAN-${dayKey}-${hhmm}-${seq}`;

        stmt.run(planNo, row.id, (err4) => {
          if (err4) console.error(`回填计划 ${row.id} 失败:`, err4);
          else console.log(`  计划 #${row.id} → ${planNo}`);
        });
      });
      stmt.finalize(() => {
        console.log('✅ 回填完成');
        finish();
      });
    });
  });
});

function finish() {
  // 3. 创建索引
  db.run("CREATE INDEX IF NOT EXISTS idx_plans_plan_no ON plans(plan_no)", (err) => {
    if (err) console.error('创建索引失败:', err);
    else console.log('✅ 创建 plan_no 索引成功');

    db.close(() => {
      console.log('=== 迁移完成 ===');
      process.exit(0);
    });
  });
}
