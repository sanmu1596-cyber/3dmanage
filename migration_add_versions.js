/**
 * 迁移脚本：添加版本管理表 (versions)
 * 
 * 用途：管理各设备的发布版本，支持"已发布"和"测试中"两种状态
 * 
 * 执行方式：node migration_add_versions.js
 */

const db = require('./database');

function runMigration() {
  return new Promise((resolve, reject) => {
    console.log('🚀 开始执行版本管理表迁移...\n');

    db.serialize(() => {
      // 1. 创建 versions 表
      db.run(`
        CREATE TABLE IF NOT EXISTS versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER NOT NULL,
          version_number TEXT NOT NULL,
          version_type TEXT NOT NULL DEFAULT '整合版',
          status TEXT NOT NULL DEFAULT 'testing',
          version_date TEXT,
          updater_id INTEGER,
          updater_name TEXT,
          download_url TEXT,
          file_size TEXT,
          changelog TEXT,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (device_id) REFERENCES devices(id),
          FOREIGN KEY (updater_id) REFERENCES users(id)
        )
      `, function(err) {
        if (err) {
          console.error('❌ 创建 versions 表失败:', err.message);
          reject(err);
          return;
        }
        console.log('  ✅ versions 表创建成功');
      });

      // 2. 创建索引
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_versions_device ON versions(device_id)',
        'CREATE INDEX IF NOT EXISTS idx_versions_status ON versions(status)',
        'CREATE INDEX IF NOT EXISTS idx_versions_type ON versions(version_type)',
        'CREATE INDEX IF NOT EXISTS idx_versions_date ON versions(version_date DESC)',
        'CREATE INDEX IF NOT EXISTS idx_versions_device_status ON versions(device_id, status)',
      ];

      indexes.forEach((sql, i) => {
        db.run(sql, function(err) {
          if (err) {
            console.error(`  ❌ 索引 ${i + 1} 创建失败:`, err.message);
          } else {
            console.log(`  ✅ 索引 ${i + 1}/${indexes.length} 就绪`);
          }
          if (i === indexes.length - 1) {
            console.log('\n🎉 版本管理表迁移完成！');
            resolve();
          }
        });
      });
    });
  });
}

runMigration()
  .then(() => {
    console.log('\n📋 版本管理表结构:');
    console.log('  - id: 主键');
    console.log('  - device_id: 关联设备');
    console.log('  - version_number: 版本号');
    console.log('  - version_type: 版本类型(整合版/Gateway/LITE/Transformer/TransformerPlus/HooK)');
    console.log('  - status: 状态(released/testing)');
    console.log('  - version_date: 版本日期');
    console.log('  - updater_id/updater_name: 更新者');
    console.log('  - download_url: 下载链接');
    console.log('  - file_size: 文件大小');
    console.log('  - changelog: 更新日志');
    console.log('  - notes: 问题备注');
    process.exit(0);
  })
  .catch(err => {
    console.error('迁移失败:', err);
    process.exit(1);
  });
