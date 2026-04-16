# 需求分析：管理者 → PM → 执行者 三级工作流

> 分析日期：2026-04-14
> 状态：✅ 系统完全满足，方案可行

---

## 一、现有系统能力盘点

### ✅ 已有基础（可直接复用）

| 能力模块 | 现有状态 | 说明 |
|---------|---------|------|
| **角色权限系统** | ✅ 已完整 | `roles` 表 + `role_permissions` 表 + 9个模块×6种操作=54个权限位 |
| **用户管理** | ✅ 已完整 | `users` 表含 `role_id` 字段，支持编辑角色（下拉选择）|
| **适配计划** | ✅ 已完整 | `plans` 表 + `plan_games` 表，支持创建/发布/详情/统计 |
| **我的任务** | ✅ 已完整 | `/api/my-tasks` 按登录用户过滤 `assigned_to`，含进度更新、测试用例、批量提交 |
| **通知系统** | ✅ 已存在 | `notifications` 表已建好（server.js:1530行）|
| **卡片视图** | ✅ 已有 | 适配计划 + 我的任务均已有卡片展示 |

### 📋 现有角色体系

```
1. 超级管理员（红） - 全部权限
2. 项目经理（蓝）  - 大部分权限，可创建/编辑计划，可分配任务
3. 测试人员（绿）  - 测试+缺陷相关权限
4. 开发人员（紫）  - 适配进展查看+编辑
5. 产品人员（黄）  - 游戏全权 + 计划CRUD
6. 运维人员（灰）  - 设备全权
```

### 📋 现有数据库核心表结构

```sql
-- 用户表（已有 role_id 关联）
users (id, username, real_name, role, role_id, is_member, ...)

-- 角色表（6个默认角色）
roles (id, name, description, is_system, color, sort_order)

-- 角色权限表
role_permissions (id, role_id, module, action, allowed)

-- 配置计划表（已有 creator_id）
plans (id, title, plan_date, status, creator_id, plan_no, ...)

-- 计划内游戏表（已有 assigned_to）
plan_games (id, plan_id, game_name, owner_name, assigned_to, adapt_status, adapt_progress, ...)
```

---

## 二、需求拆解与可行性评估

### 需求1️⃣：管理者发布需求 → 指派给项目经理

**当前状态**：❌ 不存在「需求」这个实体。现有的 plans 就是「配置计划」，直接由 PM 创建。

**方案**：新增 `requirements`（需求）表

```sql
CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,                    -- 需求标题
  description TEXT DEFAULT '',             -- 详细描述
  priority TEXT DEFAULT 'medium',          -- 优先级: high/medium/low
  status TEXT DEFAULT 'draft',             -- draft(草稿)→assigned(已指派)→planned(已转计划)→closed(关闭)
  creator_id INTEGER NOT NULL,            -- 创建者(管理者)
  assigned_pm_id INTEGER,                 -- 指派的项目经理
  deadline TEXT DEFAULT '',               -- 截止日期
  plan_id INTEGER,                        -- 关联的计划(可选)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id),
  FOREIGN KEY (assigned_pm_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);
```

**改动范围**：
- 后端：新增 `requirementsRouter`（CRUD API）
- 前端：新增「需求管理」页面/入口
- 权限：超级管理员可创建/指派；项目经理可查看被指派的需求

---

### 需求2️⃣：项目经理收到需求后 → 发布配置计划 → 指派给游戏负责人

**当前状态**：✅ 基本满足！PM 已经可以创建计划并分配给各负责人。

**需要增强的点**：
1. 创建计划时可**关联到某个需求**（新增 `requirement_id` 字段到 plans 表）
2. 发布时自动**生成通知**给被指派的游戏负责人（notifications 表已就绪）

**改动范围**：
- `plans` 表加 `requirement_id` 字段（可为空，PM自行发起时为 NULL）
- 发布计划逻辑中增加：遍历 `plan_games` 的 `assigned_to`，插入 notifications
- 前端创建计划弹窗增加「关联需求」下拉（可选）

---

### 需求3️⃣：游戏负责人收到任务 → 进入「我的任务」界面工作

**当前状态**：✅ 完全满足！`/api/my-tasks` 已按 `assigned_to` 过滤。

**无需额外开发**，现有流程已经跑通。

---

### 补充说明1：管理者和项目经理各有进度看板

**当前状态**：
- ✅ 适配计划页面 = PM 的看板（所有计划的汇总统计）
- ❌ 管理者的全局看板不存在

**方案**：

| 角色 | 看板内容 | 数据来源 |
|------|---------|---------|
| **管理者** | 所有需求的整体进度（按PM分组展示每个PM手上有多少需求/计划/任务） | requirements + plans 聚合 |
| **项目经理** | 自己名下所有计划的进度（现有适配计划页面升级） | plans WHERE creator_id = 当前用户 |

前端增加一个「管理者看板」tab/页面，展示：
- 各PM的需求完成情况（需求数 → 已转计划数 → 任务进行中数）
- 全局进度概览

---

### 补充说明2：PM 可自行发布配置计划（无需从需求触发）

**当前状态**：✅ 完全满足！现有创建计划功能就是独立操作。

**补充**：当 PM 自行创建计划时，`requirement_id = NULL`，此时只有 PM 看板能看到，不进入管理者看板的「需求追踪」视图。

---

### 补充说明3：列表视图 + 卡片视图切换

**当前状态**：❌ 只有卡片视图

**方案**：在前端增加视图切换按钮（📋列表 / 🗂️卡片）

| 对比项 | 列表视图 | 卡片视图 |
|-------|---------|---------|
| 适用场景 | 数据量大时快速浏览 | 数据量少时直观展示 |
| 排序 | 统一按日期降序 | 统一按日期降序 |
| 信息密度 | 高（一行一条）| 中（一张卡多条）|
| 操作 | 行内按钮 | 底部按钮组 |

**适用页面**：需求列表、适配计划列表、我的任务列表（三个页面都需要切换能力）

---

### 补充说明4：成员列表编辑界面角色下拉选择

**当前状态**：✅ 已基本实现！`usersController.js:250-277` 有 `updateUserRole` 方法，接收 `role_id` 并更新。

**需确认**：前端编辑弹窗是否已经有角色下拉？如果还没有，只需要把 `<select>` 加上即可（数据源：`/api/roles` 接口）。

---

## 三、实施方案总览

### Phase 1：数据层（数据库迁移）

| 序号 | 迁移内容 | 文件 |
|-----|---------|------|
| 1 | 新增 `requirements` 表 | 新建 `migration_requirements.js` |
| 2 | `plans` 表新增 `requirement_id` 字段 | 同上或追加到迁移脚本 |

### Phase 2：后端API

| 序号 | API | 说明 |
|-----|-----|------|
| 1 | `GET /api/requirements` | 需求列表（含PM姓名、关联计划信息）|
| 2 | `POST /api/requirements` | 创建需求（管理者专用）|
| 3 | `PUT /api/requirements/:id` | 编辑需求 |
| 4 | `DELETE /api/requirements/:id` | 删除需求 |
| 5 | `PUT /api/requirements/:id/assign` | 指派给PM |
| 6 | `PUT /api/requirements/:id/link-plan` | 关联到计划 |
| 7 | `GET /api/dashboard/admin` | 管理者看板数据（聚合统计）|
| 8 | `GET /api/roles` | 角色列表（用于下拉）|

**修改现有API：**
- `POST /api/plans` — body 增加 `requirement_id`
- `PUT /api/plans/:id/publish` — 发布时自动发通知

### Phase 3：前端页面

| 页面 | 改动 |
|------|------|
| **导航栏** | 新增「需求管理」入口 + 「管理者看板」入口（仅管理员可见）|
| **需求管理页** | 需求列表（卡片/列表双视图）+ 创建/编辑/指派弹窗 |
| **适配计划页** | 创建计划弹窗增加「关联需求」下拉；增加列表/卡片切换 |
| **我的任务页** | 增加列表/卡片切换 |
| **成员管理页** | 编辑弹窗角色改为下拉选择 |
| **管理者看板页** | 新页面，展示全局进度（按PM维度聚合）|

### Phase 4：通知集成

发布计划时 → 自动给所有 `assigned_to != NULL` 的游戏负责人推送通知。

---

## 四、工作量估算

| 模块 | 复杂度 | 预估代码量 |
|------|-------|-----------|
| 数据库迁移 | 低 | ~60行 |
| 需求CRUD API | 中 | ~300行 |
| 管理者看板API | 中 | ~100行 |
| 通知触发逻辑 | 低 | ~30行 |
| 需求管理前端页 | 高 | ~500行 |
| 列表/卡片切换组件 | 中 | ~200行 |
| 创建计划关联需求 | 低 | ~50行 |
| 成员编辑角色下拉 | 低 | ~20行 |
| 管理者看板前端页 | 中 | ~300行 |
| **合计** | | **~1560行** |

---

## 五、风险与注意事项

1. **向后兼容**：`plans.requirement_id` 必须允许 NULL，不影响现有计划数据
2. **权限控制**：需求管理页面仅「超级管理员」和「项目经理」可见
3. **性能**：管理者看板的聚合查询需要做好索引（现有索引已覆盖大部分场景）
4. **通知去重**：同一负责人在同一计划下只推一次通知，不要每个游戏推一条

---

## 六、结论

**✅ 系统完全能够支撑此需求。**

现有架构（角色权限 + 计划 + 任务 + 通知四件套）已经具备了三级工作流的基础骨架。主要工作是：

1. **新增「需求」实体**（唯一的新概念）
2. **计划和需求建立关联**（一个外键字段）
3. **前端UI改造**（列表视图 + 双视图切换 + 看板页面）
4. **成员编辑优化**（角色下拉选择）

建议分两批交付：
- **第一批**：需求管理 + 成员角色下拉（先跑通 管理者→PM 流程）
- **第二批**：列表/卡片切换 + 管理者看板（体验优化）
