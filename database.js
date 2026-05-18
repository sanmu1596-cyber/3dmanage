const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 数据库文件路径
const DB_PATH = path.join(__dirname, 'database.sqlite');
const BACKUP_DIR = path.join(__dirname, 'backups');

// 导出路径供其他模块使用（健康检查 API 等）
module.exports.DB_PATH = DB_PATH;

// ==================== 自动备份与恢复系统 ====================

/**
 * 确保备份目录存在
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * 获取时间戳文件名
 */
function timestampFilename() {
  return `db_${new Date().toISOString().replace(/[:.]/g, '-').slice(0,19)}.sqlite`;
}

/**
 * 备份数据库到 backups/ 目录
 * @returns {string|null} 备份文件路径，失败返回 null
 */
function backupDatabase() {
  try {
    ensureBackupDir();
    const dest = path.join(BACKUP_DIR, timestampFilename());
    fs.copyFileSync(DB_PATH, dest);
    console.log(`  📦 数据库已备份 → ${path.basename(dest)}`);
    cleanupOldBackups();
    return dest;
  } catch(e) {
    console.error('  ❌ 数据库备份失败:', e.message);
    return null;
  }
}

/**
 * 清理旧备份，只保留最近 10 个
 */
function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('db_') && f.endsWith('.sqlite'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    
    // 删除超过10个的旧备份（但保留最近一次的）
    if (files.length > 10) {
      files.slice(10).forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f.name));
      });
      console.log(`  🧹 清理了 ${files.length - 10} 个旧备份`);
    }
  } catch(e) { /* 静默 */ }
}

/**
 * 获取最新的备份文件路径
 * @returns {string|null}
 */
function getLatestBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return null;
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('db_') && f.endsWith('.sqlite'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? path.join(BACKUP_DIR, files[0].name) : null;
  } catch(e) { return null; }
}

/**
 * 检查关键业务表是否有数据（启动时完整性检查）
 * @param {Function} callback - 回调函数 (hasData: boolean)
 */
function checkDataIntegrity(db, callback) {
  db.get("SELECT COUNT(*) as c FROM games", (err, row) => {
    if (err) {
      console.error('  ⚠️ 数据完整性检查失败:', err.message);
      return callback(true); // 无法判断时默认继续，不阻断
    }
    const hasGames = row.c > 0;
    if (!hasGames) {
      console.error(`  🔴 ⚠️ 警告：games 表为空！共 ${row.c} 条记录`);
      // 尝试从备份恢复
      const latestBackup = getLatestBackup();
      if (latestBackup) {
        console.log(`  🔙 发现备份 ${path.basename(latestBackup)}，尝试恢复...`);
        try {
          fs.copyFileSync(latestBackup, DB_PATH);
          console.log(`  ✅ 已从备份恢复数据库！请重启服务使恢复生效。`);
        } catch(copyErr) {
          console.error('  ❌ 从备份恢复失败:', copyErr.message);
        }
      } else {
        console.error('  💀 未找到任何备份！数据可能已永久丢失。');
        console.error('     请检查磁盘空间、权限或是否有人误操作删除了数据库文件。');
      }
    }
    callback(hasGames);
  });
}

// 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);

    // ★ 关键：如果主数据库文件不存在，尝试从备份恢复
    if (!fs.existsSync(DB_PATH)) {
      const latestBackup = getLatestBackup();
      if (latestBackup) {
        console.log(`  🔙 主数据库不存在，从备份恢复: ${path.basename(latestBackup)}`);
        try {
          fs.copyFileSync(latestBackup, DB_PATH);
          console.log('  ✅ 恢复成功！');
          // 注意：这里需要重新连接数据库，但由于是异步回调中，
          // 实际上需要外部重新 require 或重启 PM2 才能生效
          // 所以只是恢复了文件，用户需要重启服务
        } catch(e) {
          console.error('  ❌ 恢复失败:', e.message);
        }
      }
    }
  } else {
    console.log('数据库连接成功');

    // ========== 性能优化 PRAGMA ==========
    db.run('PRAGMA journal_mode=WAL', (e) => {
      if (!e) console.log('  ✓ WAL模式已启用');
    });
    db.run('PRAGMA busy_timeout=5000');
    db.run('PRAGMA synchronous=NORMAL');
    db.run('PRAGMA cache_size=-20000');
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

    // ========== 启动时自动备份（每次重启都保留一份快照） ==========
    setTimeout(() => {
      backupDatabase();

      // ========== 数据完整性检查 ==========
      checkDataIntegrity(db, (hasGames) => {
        if (hasGames) {
          console.log(`  ✓ 数据完整性检查通过（games 表有数据）`);
        }
      });
    }, 2000); // 等2秒让所有建表完成后再检查

    // ========== 定时清理过期Session ==========
    setInterval(() => {
      db.run('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP', function(e) {
        if (!e && this.changes > 0) {
          console.log(`  ♻ 清理了 ${this.changes} 条过期session`);
        }
      });
    }, 3600000);

    // ========== 定时自动备份（每6小时） ==========
    setInterval(() => {
      backupDatabase();
    }, 6 * 60 * 60 * 1000);
  }
});

module.exports = db;

// ==================== 导出备份/恢复工具（供 API 使用） ==========
module.exports.backupDatabase = backupDatabase;
module.exports.getLatestBackup = getLatestBackup;
module.exports.checkDataIntegrity = checkDataIntegrity;
module.exports.BACKUP_DIR = BACKUP_DIR;
