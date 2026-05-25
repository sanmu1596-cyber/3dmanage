# 3DPM 系统开发经验总结

> **项目**：裸眼3D游戏适配项目管理系统（3dpm / 3dmanage）
> **作者**：乔老师 + 大神（AI 搭档）
> **技术栈**：Node.js + Express + SQLite3 + 原生前端 SPA
> **开发周期**：2026-03 ~ 2026-05（约 2.5 个月）
> **代码量**：后端 server.js ~2600 行 / 前端 JS 模块合计 ~12000 行 / CSS ~3500 行
> **最后更新**：2026-05-21

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术架构](#2-技术架构)
3. [开发历程时间线](#3-开发历程时间线)
4. [重大踩坑记录（核心资产）](#4-重大踩坑记录核心资产)
5. [架构决策与设计模式](#5-架构决策与设计模式)
6. [代码规范清单](#6-代码规范清单)
7. [部署运维手册](#7-部署运维手册)
8. [功能模块总览](#8-功能模块总览)
9. [已知问题与技术债](#9-已知问题与技术债)
10. [给未来开发者的建议](#10-给未来开发者的建议)

---

## 1. 项目概述

### 1.1 定位

3DPM 是一个面向**裸眼3D游戏适配团队**的内部项目管理系统，用于管理：

- 团队成员与角色权限
- 裸眼3D显示设备库
- 待适配游戏库（110+ 款）
- 设备-游戏适配进度追踪
- 缺陷/问题管理
- 配置计划与需求管理
- 数据报表与领导汇报

### 1.2 核心用户角色

| 角色 | 说明 |
|------|------|
| 超级管理员 | 全部权限，管理者看板 |
| 项目经理 | 需求管理、计划发布、指派 |
| 开发者 | 适配进度填报、缺陷处理 |
| 测试人员 | 测试用例、执行记录 |
| 访客 | 只读查看 |

### 1.3 对标产品

交互设计和用户体验对标 **TAPD**（腾讯敏捷项目管理平台）和 **Linear**，追求：
- TAPD 风格的字段设置面板
- Click-to-Edit 行内编辑（单击下拉/双击文本）
- 列宽可拖拽调整 + localStorage 持久化
- 列拖拽重排 + 行拖拽排序
- 深色/浅色主题无缝切换

---

## 2. 技术架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────┐
│                  浏览器 (SPA)                 │
│  ┌───────────┬──────────┬──────────────────┐ │
│  │ index.html │ styles   │  JS 模块 (13个)   │ │
│  │           │ -tapd.css │ core→auth→router │ │
│  │           │          │ →entities→plans   │ │
│  └───────────┴──────────┴──────────────────┘ │
└────────────────────┬────────────────────────┘
                     │ HTTP API (JSON)
┌────────────────────▼────────────────────────┐
│              Express Server                  │
│  ┌─────────┬──────────┬───────────────────┐  │
│  │server.js │ auth.js  │  路由模块 (11个)    │  │
│  │(主文件)   │ (认证)    │ games/devices/... │  │
│  ├─────────┼──────────┼───────────────────┤  │
│  │database.js        │ p0_routes.js       │  │
│  │(DB连接+备份)      │ (增强功能)         │  │
│  └─────────┴──────────┴───────────────────┘  │
├──────────────────────────────────────────────┤
│              SQLite3 (WAL 模式)               │
│     31 张表 / 自动备份 / 完整性检查            │
└──────────────────────────────────────────────┘
```

### 2.2 前端模块加载顺序（重要！）

**`app.js` 已被拆分，不再被 index.html 加载！** 以下是实际加载顺序：

```
index.html
  ├── css/styles-tapd.css          ← 唯一 CSS 文件
  ├── js/core.js                   ← ① 全局变量(var!) + 核心函数
  ├── js/auth.js                   ← ② 认证相关
  ├── js/crud-module.js            ← ③ CRUD 通用模块
  ├── js/router.js                 ← ④ 各模块渲染函数（重点！）
  ├── js/entities.js               ← ⑤ 列配置系统 + 字段设置面板
  ├── js/plans.js                  ← ⑥ 配置计划/适配进展
  ├── js/dashboard.js              ← ⑦ 仪表盘统计
  ├── js/ui-features.js            ← ⑧ UI 交互功能
  ├── js/admin.js                  ← ⑨ 管理者看板
  ├── js/requirements.js           ← ⑩ 需求管理
  ├── js/testcases.js              ← ⑪ 测试用例
  ├── js/issues-versions.js        ← ⑫ 问题+版本管理
  ├── js/social.js                 ← ⑬ 搜索/导出/批量操作
  └── js/reports.js                ← ⑭ 汇报报表
```

> ⚠️ **修改渲染函数时必须改 `router.js`，不是 app.js！** app.js 仅作为 bak 备份保留。

### 2.3 后端路由结构

```
/api/members          → 成员 CRUD
/api/games            → 游戏 CRUD
/api/devices          → 设备 CRUD (+行排序)
/api/bugs             → 缺陷 CRUD
/api/tests            → 测试用例 CRUD
/api/plans            → 配置计划 CRUD
/api/requirements     → 需求 CRUD (p0_routes.js)
/api/comments         → 评论 CRUD (p0_routes.js)
/api/attachments      → 文件附件 (p0_routes.js)
/api/adaptations      → 适配进度记录
/api/reports/data     → 汇报报表数据聚合
/api/reports/save-row → 报表行编辑保存
/api/stats/*          → 统计数据 API
/api/activity-logs    → 操作日志 (p0_routes.js)
/api/db-health        → 数据库健康状态
/api/db-backup        → 手动触发备份
```

### 2.4 数据库核心表（31 张）

| 分类 | 表名 | 用途 |
|------|------|------|
| 用户 | users, roles, permissions | 成员/角色/权限 |
| 业务 | games, devices, bugs, tests | 游戏/设备/缺陷/测试 |
| 计划 | plans, plan_games, requirements, workflow_rules | 配置计划/需求 |
| 报表 | report_rows, report_overrides | 汇报数据 |
| 适配 | adaptation_records | 设备-游戏适配详情 |
| 系统 | activity_log, notifications, attachments, login_logs | 日志/通知/附件 |

---

## 3. 开发历程时间线

### 第一阶段：基础搭建（3月底）

- 项目初始化：Express + SQLite3 + 原生前端
- 6 大核心模块 CRUD：成员/游戏/设备/缺陷/测试/配置计划
- 认证系统：双模式（localhost 开发 / 外网登录）
- 首次部署到 WeTeam 服务器（免安装版 Node.js）

### 第二阶段：体验优化（4月）

- 深色模式实现（多轮迭代，最终根级 CSS 变量覆盖方案）
- P0 改进：输入校验全覆盖（validator.js）、全局错误处理
- P1 改进：PDF 导出、文件附件上传、操作日志审计
- app.js 模块化拆分（12069 行 → 13 个模块）
- 移动端响应式适配

### 第三阶段：高级交互（5月上旬）

- URL Hash 路由支持（书签/分享/前进后退）
- 表格列拖拽重排（TAPD 风格长按拖拽）
- 表头点击排序
- 批量操作（批量删除/状态变更/指派）
- CSV/JSON 数据导入导出
- 空状态引导、统计卡片下钻

### 第四阶段：功能深化（5月中旬）

- **需求管理系统**：CRUD + 工作流规则 + 评论@提及 + 管理者看板
- **汇报报表模块**：设备汇总 + 游戏状态详情 + Excel 导出（3 轮迭代）
- **Click-to-Edit 交互改造**：从 Always-Editable 统一为 TAPD 风格
- **数据库自动备份恢复系统**：根治数据反复丢失问题

### 第五阶段：精细化打磨（5月下旬至今）

- **字段设置面板全铺开**：通用工厂模式，6 个模块共用
- **列自定义 + 行拖拽排序**：设备列表先行，推广到全部核心列表
- **深色模式配色更新**：按设计稿精调色值
- **`let` → `var` 全局变量修复**：解决跨文件访问失效连环坑
- **适配进展列表**：Excel 批量导入 + 问题备注列

---

## 4. 重大踩坑记录（核心资产）

> 这是本项目最宝贵的财富。每个坑都曾导致真实的生产问题，按严重程度排列。

### 🟥 P0 — 系统崩溃级

#### 4.1 `let`/`const` 全局变量不挂载 window（2026-05-20）

**现象**：设备列表字段隐藏不生效、列拖拽松手后顺序不变。

**根因**：
```javascript
// ❌ core.js 中这样写
let deviceVisibleColumns = { name: true, model: false, ... };
// 浏览器中 let 声明的"全局"变量不会挂载到 window！
// window.deviceVisibleColumns === undefined → 所有判空跳过

// ✅ 必须用 var
var deviceVisibleColumns = { name: true, model: false, ... };
// var 声明的全局变量会挂载到 window → 跨文件访问正常
```

**教训**：浏览器环境下，**需要跨文件共享的全局变量必须用 `var` 声明**。`let`/`const` 只在词法作用域内可见。

**修复范围**：core.js 中 `deviceVisibleColumns`、`allDevicesData`、`allGamesData` 等 10+ 个变量全部改为 `var`。

---

#### 4.2 同名函数定义覆盖导致无限递归（2026-05-18）

**现象**：所有列表页表格为空，但仪表盘统计数字正确。

**根因**：
```javascript
// reports.js 中错误地定义了同名函数
function highlightSearch(text, tableId) {
    if (typeof window.highlightSearch === 'function') {
        return window.highlightSearch(text, tableId); // ← 调用自己！栈溢出！
    }
}
// reports.js 加载后覆盖了 core.js 的原始版本
// 所有调用 highlightSearch 的页面全部白屏
```

**教训**：**永远不要在模块中定义与全局函数同名的函数然后尝试"回退调用自身"！**

---

#### 4.3 并行查询重复响应导致 ERR_HTTP_HEADERS_SENT（2026-05-15 / 05-21 两次）

**现象**：报表接口 500 错误，PM2 日志大量 `ERR_HTTP_HEADERS_SENT`，服务反复崩溃重启（83 次+）。

**根因**：
```javascript
// ❌ 4 个并行查询，计数器触发 finishQuery4() 多次
let completed = 0;
function onFinish() {
    completed++;
    if (completed >= totalQueries - 1) finishQuery4(); // Q2/Q3 都触发
}
function finishQuery4() {
    res.json({ data }); // 第一次调用正常，第二次 → headers already sent!
}

// ✅ 加标志位防重复
let query4Finished = false;
function finishQuery4() {
    if (query4Finished) return; // 防止重复调用
    query4Finished = true;
    res.json({ data });
}
```

---

#### 4.4 Node.js 回调函数换行语法错误（2026-05-07）

**现象**：`SyntaxError: missing ) after argument list`

**根因**：Node.js 将行首 `function` 关键字解析为**函数声明**而非**函数表达式**。
```javascript
// ❌ 触发语法错误
db.run('sql', params,
  function(err) { ... }  // 行首 function → 函数声明 → 语法错误
);

// ✅ 使用箭头函数（项目统一风格）
db.run('sql', params, (err) => { ... });
```

---

#### 4.5 模块化拆分导致变量重复声明 SyntaxError（2026-05-09）

**现象**：`Identifier 'versionsReleasedData' has already been declared`

**根因**：模块拆分时 issues-versions.js 的内容被完整复制到 app.js，两个文件在全局作用域用 `let` 声明了相同变量名。涉及 7 个模块的代码全部重复。

**修复**：删除 app.js 中 7 个重复代码块（净减 1481 行）。

---

### 🟨 P1 — 功能异常级

#### 4.6 `app.js` 未被 index.html 加载，改动全部无效（2026-05-20）

**现象**：多次提交的设备面板/列拖拽/行拖拽改动全部不生效。

**根因**：app.js 已拆分为 13 个独立模块，index.html 只加载新模块。但开发过程中一直往 app.js 写代码，以为会被加载。

**检测方法**：每次修改渲染函数前，确认目标文件的 `<script>` 标签是否在 index.html 中存在！

**实际入口对照**：

| 你想改的功能 | 正确文件 | 错误文件（已废弃）|
|-------------|---------|------------------|
| renderDevicesTable | router.js | app.js |
| renderGamesTable | router.js | app.js |
| 字段设置面板 | entities.js | app.js |
| 列拖拽逻辑 | entities.js | app.js |

---

#### 4.6 Portal 下拉菜单关闭时报 null.classList 崩溃（2026-05-09）

**现象**："更多操作"展开后再次点击收起时报错 `Cannot read properties of null`。

**根因**：dropdown 被 Portal 移到 body 后，wrapper.querySelector 返回 null。
```javascript
// ✅ 改为判断按钮状态（按钮永远在 wrapper 中）
btn.classList.contains('active')
// 在 closeAllMoreActions() 归位后再查找 dropdown
```

---

#### 4.7 6 个路由缺少 verifyToken 中间件（2026-05-07）

**现象**：开发模式下频繁出现 "没有权限"+"加载xxx失败"。

**根因**：game-issues / client-issues / equipment 等 6 个路由用了 `checkPermission()` 但缺少前置 `verifyToken()`。verifyToken 负责设置 `req.isDevMode = true`，没有它开发模式跳过逻辑永远不生效。

**修复**：每个路由文件添加 `router.use(auth.verifyToken)`。

---

#### 4.8 SQLite ALTER TABLE 异步 error 事件导致进程崩溃

**现象**：服务启动崩溃，try/catch 无法捕获。

**根因**：Node.js sqlite3 的 ALTER TABLE error 是异步事件，try/catch 只能捕获同步异常。

**修复**：移除启动时 ALTER TABLE，改用 CREATE TABLE IF NOT EXISTS 幂等建表；旧库兼容 NULL 值。

---

### 🟩 P2 — 显示/样式级

#### 4.9 深色模式根级 CSS 变量缺失（2026-05-07）

**现象**：深色模式下大量组件仍使用浅色背景。

**根因**：CSS 变量（--bg-card/--bg-surface/--border-light 等）只在 :root 定义了浅色值，完全没有 `[data-theme="dark"]` 根级覆盖块。之前策略是逐个组件添加选择器覆盖，遗漏了大量使用 var() 的组件。

**修复**：在 :root 后新增 `[data-theme="dark"] { ... }` 根级变量重定义块（~20 个变量），一劳永逸。

---

#### 4.10 CRLF 换行符导致脚本替换位置偏移（2026-05-09）

**现象**：Windows 下 `\r\n` 导致 node.js 脚本计算行号偏移，批量替换失败。

**修复**：对 server.js 这类关键文件优先使用 Edit 工具逐处修改；脚本替换前先标准化换行符。

---

## 5. 架构决策与设计模式

### 5.1 通用工厂模式 — 字段设置面板

**问题**：6 个模块（游戏/设备/成员/测试/缺陷/配置计划）都需要字段设置面板，每个面板有 6 个相同的方法（toggle/close/cancel/selectAll/deselectAll/apply/load），手写会产生大量重复代码。

**解决方案**：
```javascript
function _genericColumnPanel(moduleKey, getVisibleObj, doRender) {
    return {
        toggle: function() { /* 通用切换 */ },
        close: function() { /* 通用关闭 */ },
        cancel: function() { /* 通用取消 */ },
        selectAll: function() { /* 通用全选 */ },
        deselectAll: function() { /* 通用取消全选 */ },
        apply: function() { /* 通用应用 */ },
        load: function() { /* 通用加载 localStorage */ }
    };
}

// 每个模块只需 7 行壳函数
var deviceColumnPanel = _genericColumnPanel('device', () => deviceVisibleColumns, renderDevicesTable);
```

**效果**：4 个新模块共 28 个方法，工厂一次性生成 + 每模块 7 行壳函数 = **极低维护成本**。

---

### 5.2 Click-to-Edit 编辑模式（TAPD 风格）

**决策**：放弃 Always-Editable（始终显示输入框），采用 Click-to-Edit（单击进入编辑态）。

**交互规格**：
- **文本字段**：双击进入编辑 → input 聚焦 → Enter 保存 / Esc 取消 / blur 自动保存
- **枚举字段**（下拉）：单击进入编辑 → select 下拉 → change 即保存 → blur 未变更还原
- **锁定尺寸**：编辑期间单元格尺寸固定，防止抖动
- **统一入口**：`startTextEdit(td, rowId, field)` / `startDropdownEdit(td, rowId, field, options)`

**优势**：表格更整洁、性能更好、用户体验接近桌面应用。

---

### 5.3 Portal 模式 — 下拉菜单溢出

**问题**：`.main-body { overflow: hidden }` 导致内部 absolute/fixed 下拉菜单被裁剪。

**方案**：JS 层 Portal —— 点击时将 dropdown `appendChild` 到 `document.body`，关闭时归位回原 wrapper。动态计算屏幕坐标定位。

---

### 5.4 数据库自动备份恢复系统

**问题**：服务器数据库数据多次莫名丢失。

**方案**（database.js）：
1. **启动备份**：每次 PM2 重启自动复制快照到 `backups/db_{timestamp}.sqlite`
2. **保留策略**：只保留最近 10 个备份
3. **完整性检查**：启动后 2 秒检查 games 表行数，为空则自动从最新备份恢复
4. **定时备份**：每 6 小时一次
5. **手动备份 API**：POST `/api/db-backup`（需登录）

---

### 5.5 双模式认证

```
请求进来
  ↓
DEV_MODE=true? ─是→ 开发模式（免登录，管理员权限）
  ↓ 否
localhost/127.0.0.1? ─是→ 开发模式
  ↓ 否
URL参数/Cookie带dev_key? ─是→ 开发模式
  ↓ 否
正式模式 → verifyToken → checkPermission → 通过/拒绝
```

---

## 6. 代码规范清单

### 6.1 JavaScript 规范

| 规范 | 说明 | 示例 |
|------|------|------|
| **全局变量声明** | 必须用 `var`，禁止 `let`/`const` | `var allGamesData = [];` |
| **回调函数** | 统一使用箭头函数，避免行首 function 陷阱 | `(err) => { ... }` |
| **函数命名** | camelCase，动词开头 | `renderDevicesTable()`, `loadGameData()` |
| **变量命名** | camelCase，语义明确 | `deviceVisibleColumns`, `filteredGameData` |
| **DOM ID** | kebab-case | `devices-table`, `column-settings-panel` |
| **CSS 类名** | kebab-case 或 BEM | `.editable-cell`, `.more-actions-dropdown` |
| **SQL 关键字大写** | 提高可读性 | `SELECT * FROM games WHERE id = ?` |
| **版本号机制** | 每次前端改动递增 JS 版本号 | `v=20260521` 强制缓存刷新 |

### 6.2 后端 API 规范

| 规范 | 说明 |
|------|------|
| **成功响应** | `{ success: true, data: [...] }` 或 `{ success: true, message: "..." }` |
| **错误响应** | `{ success: false, message: "错误描述" }` + HTTP 400/401/403/500 |
| **参数校验** | validator.js 规则链，400 + 详细错误信息 |
| **SQL 注入防护** | 全部使用参数化查询 (`?` 占位符) |
| **XSS 防护** | 输出时 escHtml() 转义 |
| **CORS** | 不配置（纯内部系统） |

### 6.3 Git 提交规范

| 类型 | 格式 | 示例 |
|------|------|------|
| 新功能 | `feat:` | `feat: 设备列表列自定义+行拖拽排序` |
| Bug 修复 | `fix:` | `fix: 修复 let 变量未挂载 window 问题` |
| 重构 | `refactor:` | `refactor: 报表模块改为 Click-to-Edit 模式` |
| 样式 | `style:` | `style: 深色模式配色按设计稿更新` |

### 6.4 文件修改前的必查清单

修改任何前端功能前，**必须**确认以下 5 点：

1. **目标文件是否被 index.html 实际加载？** （不是 app.js！）
2. **涉及的全局变量是否用 `var` 声明？**
3. **是否有同名函数可能造成覆盖冲突？**
4. **深色模式是否需要同步新增 CSS 规则？**
5. **修改后是否递增了 JS 版本号？**

---

## 7. 部署运维手册

### 7.1 环境信息

| 项目 | 本地 | 服务器 |
|------|------|--------|
| 地址 | http://localhost:3000 | https://3dpm.testsite.woa.com/ |
| IP | 127.0.0.1 | 21.214.83.112 |
| 项目路径 | `C:\Users\bf_joesyang\project-management` | `C:\Users\bf_joesyang\project-management` |
| PM2 进程名 | 3dmanage | 3dmanage |
| Node.js | v24.15.0 | v20.x（免安装版） |
| 数据库 | database.sqlite（WAL 模式） | database.sqlite（WAL 模式） |

### 7.2 日常部署流程

```bash
# 1. 本地验证通过后推送到 GitHub
git add -A && git commit -m "feat: xxx" && git push origin master

# 2. SSH 到服务器执行
cd C:\Users\bf_joesyang\project-management
git pull origin master
npm install  # 如果有新依赖
pm2 restart 3dmanage

# 3. 验证
pm2 logs 3dmanage --lines 20
```

### 7.3 本地开发流程

```bash
# ⚠️ 注意：本地 PM2 的 exec cwd 是 bf_joesyang 目录！
# 修改工作区文件后，必须复制过去：

cp public/js/router.js C:/Users/bf_joesyang/project-management/public/js/router.js
pm2 restart 3dmanage

# 或者直接在 bf_joesyang 目录下操作
```

### 7.4 常用命令速查

```bash
# PM2 管理
pm2 restart 3dmanage   # 重启
pm2 stop 3dmanage      # 停止
pm2 logs 3dmanage      # 查日志（Ctrl+C 退出）
pm2 list               # 查看所有进程

# 数据库
sqlite3 database.sqlite ".tables"                    # 查看所有表
sqlite3 database.sqlite "SELECT COUNT(*) FROM games;" # 快速统计
curl -s http://localhost:3000/api/db-health           # 数据库健康检查

# 前端调试
# 浏览器 F12 Console:
typeof allGamesData !== 'undefined'  // 检查全局变量是否存在
localStorage.getItem('colWidths_games-table')  // 检查列宽存储
```

### 7.5 故障排查速查

| 症状 | 最可能原因 | 排查命令 |
|------|-----------|---------|
| 页面空白 | JS 语法错误 | F12 → Console |
| 表格无数据 | highlightSearch 递归 / API 失败 | F12 → Network |
| 登录提示无权限 | 缺少 verifyToken 中间件 | 检查路由文件头部 |
| 深色模式白色 | CSS 变量未定义 / 硬编码白色 | 检查 --bg-card 等值 |
| 字段隐藏不生效 | let 变量未挂载 window | 检查 core.js 声明方式 |
| 数据丢失 | 服务器环境问题 | pm2 logs + db-health API |
| 500 错误 | 重复响应 / SQL 错误 | pm2 logs --err |

---

## 8. 功能模块总览

### 8.1 六大核心模块

| 模块 | 路由关键字 | 核心功能 | 特色交互 |
|------|-----------|---------|----------|
| **游戏管理** | games | 110+ 游戏库 CRUD | 行内编辑、搜索筛选、列拖拽、字段设置 |
| **设备管理** | devices | 设备库 CRUD | 行拖拽排序、列自定义、适配完成数编辑 |
| **成员管理** | members | 团队成员 CRUD | 角色分配、字段设置 |
| **缺陷管理** | bugs | BUG 跟踪 CRUD | 优先级/状态工作流、字段设置 |
| **测试管理** | tests | 测试用例 CRUD | 套件树、执行记录、字段设置 |
| **配置计划** | plans | 计划 CRUD | 适配进展矩阵、Excel 导入、甘特图视图 |

### 8.2 增强模块

| 模块 | 功能 |
|------|------|
| **需求管理** | 需求 CRUD、指派 PM、关联计划、评论@提及 |
| **管理者看板** | 6 项统计卡 + PM 绩效表 + 7 天趋势图 |
| **汇报报表** | 游戏适配状态汇总 + Click-to-Edit + Excel 导出 |
| **操作日志** | 多维筛选 + IP 脱敏 + 自动清理 90 天 |
| **文件附件** | 上传/预览/下载/删除（13 种格式） |
| **用户管理** | 成员角色编辑、权限配置 |

### 8.3 通用交互能力

以下能力已覆盖所有核心模块：

| 能力 | 覆盖范围 | 实现位置 |
|------|---------|---------|
| Click-to-Edit 行内编辑 | 游戏状态/名称/备注等 | entities.js |
| 列宽拖拽 + localStorage 持久化 | 全部表格 | plans.js/initColumnResize |
| 列拖拽重排（长按） | 全部表格 | entities.js/initHeaderDrag |
| 行拖拽排序 | 设备列表 | router.js/initRowDrag |
| 字段设置面板（6 种关闭方式） | 6 个模块 | entities.js/_genericColumnPanel |
| 表头点击排序 | 全部表格 | entities.js/initTableSort |
| 搜索 + 状态筛选 | 全部列表 | 各模块 filterXxx() |
| 批量选择/操作 | 5 个模块 | ui-features.js |
| CSV/JSON 导出 | 全部模块 | social.js |
| PDF 导出 | 3 个模块 | ui-features.js |
| 打印 | 全部模块 | ui-features.js |
| 深色/浅色切换 | 全局 | core.js/toggleTheme |
| 空状态引导 | 全部页面 | styles-tapd.css |
| 统计卡片 + 下钻 | 侧边栏 + 各模块底部 | dashboard.js |

---

## 9. 已知问题与技术债

### 9.1 已知限制

| # | 问题 | 影响 | 优先级 | 备注 |
|---|------|------|--------|------|
| 1 | SSH 连接不稳定，Connection reset 频繁 | 部署需手动执行 | P1 | 服务器网络问题 |
| 2 | 弹窗/编辑框点击空白处消失 | 用户体验 | P2 | 曾排查过，待彻底修复 |
| 3 | 无自动化测试 | 回归风险 | P1 | 建议 Playwright E2E |
| 4 | SQLite 并发写入锁竞争 | 高并发下可能排队 | P2 | 当前团队规模可接受 |
| 5 | 前端无构建步骤（直接源码） | 无法做 tree-shaking | P3 | 当前体量不需要 |
| 6 | 无 CI/CD 流水线 | 需手动部署 | P2 | 可接入 GitHub Actions |

### 9.2 可优化的方向

- **性能**：大数据量（1000+ 行）虚拟滚动
- **安全**：Rate Limiting、CSRF Token、更细粒度的权限控制
- **协作**：WebSocket 实时推送（多人同时操作提醒）
- **国际化**：i18n 支持（当前中文硬编码）

---

## 10. 给未来开发者的建议

### 10.1 上手第一件事

1. **阅读本文档**（特别是第 4 节踩坑记录和第 6 节代码规范）
2. **理解前端模块加载顺序**（第 2.2 节），知道该改哪个文件
3. **本地跑起来**：`cd C:\Users\bf_joesyang\project-management && pm2 restart 3dmanage`
4. **打开 localhost:3000，F12 开发者工具走一遍各模块**

### 10.2 开发新功能的 Checklist

- [ ] 确认要修改的目标文件（router.js 非 app.js！）
- [ ] 新增全局变量用 `var` 声明
- [ ] 回调函数使用箭头函数 `(x) => {...}`
- [ ] API 使用参数化查询（`?` 占位符）
- [ ] 前端加 try-catch + safeApiCall 包装
- [ ] 深色模式同步检查（新组件是否有硬编码颜色）
- [ ] 更新 JS 版本号 `v=YYYYMMDD`
- [ ] 本地 PM2 重启验证
- [ ] git commit + push
- [ ] 服务器 git pull + pm2 restart

### 10.3 调试三板斧

1. **先看 Console**：JS 报错是最快的线索
2. **再查 Network**：API 请求是否发出 / 返回什么
3. **最后看 pm2 logs**：服务端有没有报错

> **记住**：90% 的前端问题都是"改错文件了"或"全局变量没挂载上"，先排除这两个再深入。

---

## 附录 A：完整文件结构

```
project-management/
├── server.js                 # 主服务文件 (~2600 行)
├── database.js               # DB 连接 + 备份恢复
├── auth.js                   # 认证中间件
├── validator.js              # 输入校验器
├── p0_routes.js              # 增强功能路由
├── game-issues.js            # 游戏问题路由
├── client-issues.js          # 客户端问题路由
├── equipment.js              # 设备管理路由
├── game-versions.js          # 游戏版本路由
├── package.json
├── database.sqlite           # 主数据库 (WAL 模式)
├── backups/                  # 自动备份目录
│   └── db_*.sqlite
├── uploads/                  # 文件附件存储
└── public/
    ├── index.html            # 单页 HTML 入口
    ├── styles-tapd.css       # 唯一 CSS 文件 (~3500 行)
    └── js/
        ├── core.js           # ① 全局变量 + 核心函数
        ├── auth.js           # ② 认证
        ├── crud-module.js    # ③ CRUD 通用
        ├── router.js         # ④ 渲染函数 ★ 重点文件
        ├── entities.js       # ⑤ 列配置系统
        ├── plans.js          # ⑥ 配置计划
        ├── dashboard.js      # ⑦ 仪表盘
        ├── ui-features.js    # ⑧ UI 交互
        ├── admin.js          # ⑨ 管理者看板
        ├── requirements.js   # ⑩ 需求管理
        ├── testcases.js      # ⑪ 测试用例
        ├── issues-versions.js# ⑫ 问题+版本
        ├── social.js         # ⑬ 搜索/导出
        └── reports.js        # ⑭ 汇报报表
```

---

## 附录 B：环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 服务端口 |
| DEV_MODE | false | 强制开发模式 |
| DB_PATH | ./database.sqlite | 数据库路径 |
| SECRET_KEY | (随机生成) | JWT 密钥 |
| SESSION_SECRET | (随机生成) | 会话密钥 |

---

*本文档持续维护中。每次重大功能迭代后应同步更新。*
