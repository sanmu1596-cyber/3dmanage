/**
 * 迁移脚本：为现有成员设置登录账号
 * - username = wechat_id（企微ID）
 * - password = sha256('123456')
 * 
 * 只影响 is_member=1 且 username 为空 且 wechat_id 有值的记录
 */

const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const defaultPassword = '123456';
const hashedPassword = crypto.createHash('sha256').update(defaultPassword).digest('hex');

console.log('========== 为成员设置登录账号 ==========\n');

db.serialize(() => {
    // 先查看哪些需要更新
    db.all(
        'SELECT id, real_name, wechat_id FROM users WHERE is_member = 1 AND username IS NULL AND wechat_id IS NOT NULL',
        (err, rows) => {
            if (err) {
                console.error('查询失败:', err.message);
                return;
            }
            
            if (rows.length === 0) {
                console.log('没有需要更新的记录（可能已经迁移过）。');
                db.close();
                return;
            }
            
            console.log(`找到 ${rows.length} 条待更新记录：`);
            rows.forEach(r => console.log(`  - [${r.id}] ${r.real_name} → ${r.wechat_id}`));
            console.log(`\n默认密码: ${defaultPassword}`);
            
            // 执行更新
            db.run(
                'UPDATE users SET username = wechat_id, password = ? WHERE is_member = 1 AND username IS NULL AND wechat_id IS NOT NULL',
                [hashedPassword],
                function(err) {
                    if (err) {
                        console.error('\n❌ 更新失败:', err.message);
                    } else {
                        console.log(`\n✅ 成功更新 ${this.changes} 条记录`);
                        console.log('所有成员现在可以用企微ID + 密码123456 登录');
                    }
                    db.close();
                }
            );
        }
    );
});
