/**
 * 修复孤儿数据：清理 devices 和 games 表中引用了不存在成员的 assigned_to 字段
 * 注意：服务器使用 users 表，本地使用 members 表
 * 会自动检测表结构，跳过不存在的列
 */
const db = require('./database.js');

console.log('=== 修复孤儿设备数据 ===\n');

// 先检测使用的是 users 还是 members 表
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", [], (err, row) => {
  const memberTable = row ? 'users' : 'members';
  console.log('检测到成员表:', memberTable);
  
  // 1. 查找孤儿设备数据
  db.all(`
    SELECT d.id, d.name, d.assigned_to 
    FROM devices d 
    WHERE d.assigned_to IS NOT NULL 
      AND d.assigned_to NOT IN (SELECT id FROM ${memberTable})
  `, [], (err, rows) => {
    if (err) {
      console.error('查询设备失败:', err.message);
      return;
    }
    
    console.log('\n发现孤儿设备数据:', rows.length, '条');
    if (rows.length > 0) {
      rows.forEach(r => console.log(`  - 设备 ID ${r.id} (${r.name}): assigned_to = ${r.assigned_to}`));
    }
    
    // 2. 修复设备表
    db.run(`
      UPDATE devices 
      SET assigned_to = NULL 
      WHERE assigned_to IS NOT NULL 
        AND assigned_to NOT IN (SELECT id FROM ${memberTable})
    `, [], function(err) {
      if (err) {
        console.error('修复设备失败:', err.message);
        return;
      }
      console.log('✅ 已修复', this.changes, '条设备记录');
      
      // 3. 检查 games 表是否有 assigned_to 列
      db.all("PRAGMA table_info(games)", [], (err, columns) => {
        if (err) {
          console.error('查询游戏表结构失败:', err.message);
          console.log('\n=== 修复完成 ===');
          return;
        }
        
        const hasAssignedTo = columns.some(col => col.name === 'assigned_to');
        
        if (!hasAssignedTo) {
          console.log('\n⚠️ games 表没有 assigned_to 列，跳过游戏表检查');
          console.log('\n=== 修复完成 ===');
          return;
        }
        
        // 4. 查找孤儿游戏数据
        db.all(`
          SELECT g.id, g.name, g.assigned_to 
          FROM games g 
          WHERE g.assigned_to IS NOT NULL 
            AND g.assigned_to NOT IN (SELECT id FROM ${memberTable})
        `, [], (err, rows) => {
          if (err) {
            console.error('查询游戏失败:', err.message);
            return;
          }
          
          console.log('\n发现孤儿游戏数据:', rows.length, '条');
          if (rows.length > 0) {
            rows.forEach(r => console.log(`  - 游戏 ID ${r.id} (${r.name}): assigned_to = ${r.assigned_to}`));
          }
          
          // 5. 修复游戏表
          db.run(`
            UPDATE games 
            SET assigned_to = NULL 
            WHERE assigned_to IS NOT NULL 
              AND assigned_to NOT IN (SELECT id FROM ${memberTable})
          `, [], function(err) {
            if (err) {
              console.error('修复游戏失败:', err.message);
              return;
            }
            console.log('✅ 已修复', this.changes, '条游戏记录');
            console.log('\n=== 修复完成 ===');
          });
        });
      });
    });
  });
});
