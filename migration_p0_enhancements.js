/**
 * 迁移脚本：P0 功能增强 — 需求管理 + 工作流自动化 + 协作评论
 *
 * 新增表：
 *   1. requirements — 需求实体（支撑 管理者→PM→执行者 三级工作流）
 *   2. workflow_rules — 工作流自动化规则（状态变更触发动作）
 *   3. comments — 实体评论（缺陷/任务/计划的协作评论）
 *
 * 修改表：
 *   4. plans 表新增 requirement_id 外键字段
 *
 * 运行方式：node migration_p0_enhancements.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('=== P0 功能增强迁移开始 ===\n');

// ========== 1. 需求表 ==========
db.run(`
  CREATE TABLE IF NOT EXISTS requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','assigned','planned','in_progress','completed','closed')),
    creator_id INTEGER NOT NULL,
    assigned_pm_id INTEGER,
    deadline TEXT DEFAULT '',
    plan_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (assigned_pm_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  )
`, (err) => {
  if (err) {
    console.error('❌ 创建 requirements 表失败:', err.message);
  } else {
    console.log('✅ requirements 需求表已创建');
  }
});

// ========== 2. plans 表增加 requirement_id ==========
db.all("PRAGMA table_info(plans)", (err, columns) => {
  if (err) {
    console.error('❌ 查询 plans 表结构失败:', err.message);
    return;
  }
  const hasRequirementId = columns.some(col => col.name === 'requirement_id');
  if (!hasRequirementId) {
    db.run(`ALTER TABLE plans ADD COLUMN requirement_id INTEGER`, (err) => {
      if (err) {
        console.error('❌ plans 表添加 requirement_id 失败:', err.message);
      } else {
        console.log('✅ plans 表已添加 requirement_id 字段');
      }
    });
  } else {
    console.log('⏭️  plans 表已有 requirement_id 字段，跳过');
  }
});

// ========== 3. 工作流自动化规则表 ==========
db.run(`
  CREATE TABLE IF NOT EXISTS workflow_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                   -- 规则名称（如"缺陷新建自动通知"）
    is_active INTEGER DEFAULT 1,          -- 是否启用
    trigger_entity TEXT NOT NULL,        -- 触发实体: bug|task|plan|requirement
    trigger_from_status TEXT,            -- 触发前状态（NULL表示任意）
    trigger_to_status TEXT NOT NULL,     -- 触发后目标状态
    action_type TEXT NOT NULL,           -- 动作类型: notify|assign|update_status|create_comment
    action_config TEXT DEFAULT '{}',     -- 动作配置JSON（目标用户/消息模板等）
    created_by INTEGER,                  -- 创建人
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`, (err) => {
  if (err) {
    console.error('❌ 创建 workflow_rules 表失败:', err.message);
  } else {
    console.log('✅ workflow_rules 工作流规则表已创建');
  }
});

// ========== 4. 评论表 ==========
db.run(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('bug','task','plan','game_issue','client_issue','interlace_issue')),
    entity_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    mentions TEXT DEFAULT '[]',          -- JSON数组 [@user_id, ...]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`, (err) => {
  if (err) {
    console.error('❌ 创建 comments 表失败:', err.message);
  } else {
    console.log('✅ comments 评论表已创建');
  }
});

// ========== 5. 索引 ==========
const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements(status)',
  'CREATE INDEX IF NOT EXISTS idx_requirements_creator ON requirements(creator_id)',
  'CREATE INDEX IF NOT EXISTS idx_requirements_pm ON requirements(assigned_pm_id)',
  'CREATE INDEX IF NOT EXISTS idx_requirements_plan ON requirements(plan_id)',
  'CREATE INDEX IF NOT EXISTS idx_workflow_trigger ON workflow_rules(trigger_entity, trigger_to_status)',
  'CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id)',
];

let idxCount = 0;
indexes.forEach(sql => {
  db.run(sql, (err) => {
    if (!err) idxCount++;
    if (idxCount === indexes.length) {
      console.log(`✅ ${idxCount} 个索引已就绪`);
      finish();
    }
  });
});

// ========== 6. 插入默认工作流规则 ==========
const defaultRules = [
  {
    name: '缺陷新建→通知负责人',
    is_active: 1,
    trigger_entity: 'bug',
    trigger_from_status: null,
    trigger_to_status: 'new',
    action_type: 'notify',
    action_config: JSON.stringify({
      message: '{creator} 创建了新缺陷：{title}，请及时处理',
      target_role: 'assigned_to'  // 通知给缺陷的assigned_to
    }),
    created_by: 1
  },
  {
    name: '计划发布→通知所有负责人',
    is_active: 1,
    trigger_entity: 'plan',
    trigger_from_status: null,
    trigger_to_status: 'published',
    action_type: 'notify',
    action_config: JSON.stringify({
      message: '配置计划「{title}」已发布，请查看你的任务',
      target: 'all_assigned'  // 通知所有被指派的成员
    }),
    created_by: 1
  },
  {
    name: '需求指派→通知PM',
    is_active: 1,
    trigger_entity: 'requirement',
    trigger_from_status: 'draft',
    trigger_to_status: 'assigned',
    action_type: 'notify',
    action_config: JSON.stringify({
      message: '管理者将新需求「{title}」指派给你，请查看并转成配置计划',
      target: 'assigned_pm'
    }),
    created_by: 1
  },
  {
    name: '任务完成→更新设备适配率',
    is_active: 1,
    trigger_entity: 'task',
    trigger_from_status: 'in_progress',
    trigger_to_status: 'finished',
    action_type: 'update_status',
    action_config: JSON.stringify({
      target_entity: 'device',
      action: 'refresh_adaptation_rate'
    }),
    created_by: 1
  },
  {
    name: '缺陷修复中→通知测试员复测',
    is_active: 1,
    trigger_entity: 'bug',
    trigger_from_status: 'pending',
    trigger_to_status: 'fixing',
    action_type: 'notify',
    action_config: JSON.stringify({
      message: '缺陷「{title}」正在修复中，请准备验证',
      target_role: 'tester'  // 通知测试角色
    }),
    created_by: 1
  }
];

// 延迟插入默认规则（等表创建完）
setTimeout(() => {
  let ruleCount = 0;
  defaultRules.forEach(rule => {
    // 检查是否已存在同名规则
    db.get("SELECT COUNT(*) as cnt FROM workflow_rules WHERE name = ?", [rule.name], (err, row) => {
      if (err || row.cnt > 0) return;

      db.run(
        `INSERT INTO workflow_rules (name, is_active, trigger_entity, trigger_from_status, trigger_to_status, action_type, action_config, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [rule.name, rule.is_active, rule.trigger_entity, rule.trigger_from_status, rule.trigger_to_status, rule.action_type, rule.action_config, rule.created_by],
        (err) => {
          if (!err) ruleCount++;
          if (ruleCount === defaultRules.length) {
            console.log(`✅ ${ruleCount} 条默认工作流规则已插入`);
            finish();
          }
        }
      );
    });
  });
}, 500);

let finishedSteps = 0;
const totalSteps = 2; // 索引 + 默认规则

function finish() {
  finishedSteps++;
  if (finishedSteps >= totalSteps) {
    console.log('\n=== P0 功能增强迁移完成 ✅ ===');
    db.close();
  }
}

// 超时保护
setTimeout(() => { db.close(); }, 10000);
