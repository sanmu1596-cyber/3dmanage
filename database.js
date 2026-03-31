const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库文件路径
const DB_PATH = path.join(__dirname, 'database.sqlite');

// 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功');

    // ========== 性能优化 PRAGMA ==========
    // WAL模式：允许读写并发，多用户同时操作不阻塞
    db.run('PRAGMA journal_mode=WAL', (e) => {
      if (!e) console.log('  ✓ WAL模式已启用');
    });
    // 写锁等待5秒，避免并发写入直接报SQLITE_BUSY
    db.run('PRAGMA busy_timeout=5000');
    // NORMAL同步：性能更好，WAL模式下仍然安全
    db.run('PRAGMA synchronous=NORMAL');
    // 缓存扩大到20MB（默认约8MB）
    db.run('PRAGMA cache_size=-20000');
    // 启用外键约束
    db.run('PRAGMA foreign_keys=ON');

    // ========== 关键索引 ==========
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_is_member ON users(is_member)',
      'CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_adaptation_device ON adaptation_records(device_id)',
      'CREATE INDEX IF NOT EXISTS idx_adaptation_game ON adaptation_records(game_id)',
      'CREATE INDEX IF NOT EXISTS idx_adaptation_device_game ON adaptation_records(device_id, game_id)',
      'CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(bug_status)',
      'CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform)',
      'CREATE INDEX IF NOT EXISTS idx_games_owner ON games(owner_id)',
      'CREATE INDEX IF NOT EXISTS idx_plan_games_plan ON plan_games(plan_id)',
      'CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_field_options_key ON field_options(field_key)',
    ];
    let idxCount = 0;
    indexes.forEach(sql => {
      db.run(sql, (e) => {
        if (!e) idxCount++;
        if (idxCount === indexes.length) console.log(`  ✓ ${idxCount} 个索引就绪`);
      });
    });

    // ========== 定时清理过期Session ==========
    setInterval(() => {
      db.run('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP', function(e) {
        if (!e && this.changes > 0) {
          console.log(`  ♻ 清理了 ${this.changes} 条过期session`);
        }
      });
    }, 3600000); // 每小时清理一次
  }
});

module.exports = db;
