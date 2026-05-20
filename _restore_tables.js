const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
console.log('DB:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) { console.error('Connection failed:', err.message); process.exit(1); }
  console.log('Connected');

  db.serialize(() => {
    const tables = [
      ['users', `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        real_name TEXT NOT NULL,
        role_id INTEGER DEFAULT 1,
        is_member INTEGER DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`],
      ['roles', `CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`],
      ['role_permissions', `CREATE TABLE IF NOT EXISTS role_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id INTEGER NOT NULL,
        module TEXT NOT NULL,
        action TEXT NOT NULL,
        granted INTEGER DEFAULT 1,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        UNIQUE(role_id, module, action)
      )`],
      ['sessions', `CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`],
      ['members', `CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        wechat_id TEXT,
        role TEXT,
        duty TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`],
      ['devices', `CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        manufacturer TEXT,
        device_type TEXT,
        name TEXT NOT NULL,
        requirements TEXT,
        quantity INTEGER DEFAULT 1,
        keeper TEXT,
        notes TEXT,
        adapter_completion_rate TEXT DEFAULT '0%',
        total_bugs INTEGER DEFAULT 0,
        completed_adaptations INTEGER DEFAULT 0,
        total_games INTEGER DEFAULT 0,
        online_games INTEGER DEFAULT 0,
        status TEXT DEFAULT 'available',
        assigned_to INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES members(id)
      )`],
      ['games', `CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        english_name TEXT,
        platform TEXT,
        game_id TEXT,
        game_type TEXT,
        description TEXT,
        developer TEXT,
        operator TEXT,
        release_date DATE,
        config_path TEXT,
        adapter_progress TEXT DEFAULT '0%',
        owner TEXT,
        online_status TEXT,
        quality TEXT,
        game_account TEXT,
        storage_location TEXT,
        game_engine TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`],
      ['tests', `CREATE TABLE IF NOT EXISTS tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        game_id INTEGER,
        device_id INTEGER,
        tester_id INTEGER,
        test_date DATE,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'medium',
        result TEXT,
        bugs_count INTEGER DEFAULT 0,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id),
        FOREIGN KEY (device_id) REFERENCES devices(id),
        FOREIGN KEY (tester_id) REFERENCES members(id)
      )`],
      ['bugs', `CREATE TABLE IF NOT EXISTS bugs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        versions TEXT,
        actual_fix_time DATE,
        planned_fix_time DATE,
        device_name TEXT,
        discovery_time DATE,
        owner TEXT,
        bug_status TEXT,
        priority TEXT,
        problem_type TEXT,
        description TEXT,
        steps TEXT,
        test_id INTEGER,
        assignee_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (test_id) REFERENCES tests(id),
        FOREIGN KEY (assignee_id) REFERENCES members(id)
      )`]
    ];

    let done = 0;
    tables.forEach(([name, sql]) => {
      db.run(sql, (err) => {
        done++;
        if (err) console.log('❌ ' + name + ':', err.message);
        else console.log('✅ ' + name);

        if (done === tables.length) {
          // Seed admin
          db.run("INSERT OR IGNORE INTO roles (id, name, description) VALUES (1, 'admin', '管理员')", () => {
            const hash = crypto.createHash('sha256').update('admin123').digest('hex');
            db.run("INSERT OR IGNORE INTO users (username, password, real_name, role_id) VALUES ('admin', ?, '管理员', 1)", [hash], () => {
              console.log('\n✅ Admin seeded (admin/admin123)');

              // Verify
              db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", [], (e, rows) => {
                console.log('\n=== All tables (' + rows.length + ') ===');
                rows.forEach(r => console.log('  ' + r.name));
                const core = ['bugs','devices','games','members','roles','role_permissions','sessions','tests','users'];
                const missing = core.filter(t => !rows.some(r => r.name === t));
                if (missing.length) console.log('❌ Still missing: ' + missing.join(','));
                else console.log('\n🎉 All core tables restored!');
                db.close();
              });
            });
          });
        }
      });
    });
  });
});
