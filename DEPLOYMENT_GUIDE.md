# 🚀 裸眼3D游戏适配管理系统 — 部署运维学习手册

> **作者**: 乔老师 + 大神（AI 搭档）
> **项目**: 裸眼3D游戏适配项目管理系统
> **技术栈**: Node.js + Express + SQLite3 + 原生前端
> **最后更新**: 2026-03-31

---

## 目录

- [第一章：环境准备](#第一章环境准备)
- [第二章：首次上云部署实录](#第二章首次上云部署实录)
- [第三章：日常开发部署流程](#第三章日常开发部署流程)
- [第四章：数据库迁移操作](#第四章数据库迁移操作)
- [第五章：踩坑记录与解决方案](#第五章踩坑记录与解决方案)
- [第六章：常用运维命令速查](#第六章常用运维命令速查)
- [第七章：安全与备份](#第七章安全与备份)
- [附录：项目结构速览](#附录项目结构速览)

---

## 第一章：环境准备

### 1.1 开发环境（本地）

| 项目 | 说明 |
|------|------|
| 操作系统 | Windows 10/11 |
| Node.js | v20.x LTS |
| Git | 已安装 |
| 编辑器 | VS Code / WorkBuddy |
| 项目路径 | `C:\Users\joesyang\WorkBuddy\20260324104822\project-management` |

### 1.2 服务器环境（WeTeam 开发机）

| 项目 | 说明 |
|------|------|
| 平台 | WeTeam Windows Server 开发机 |
| 连接方式 | WeTeam 网页终端（PowerShell） |
| 用户 | `bf_joesyang` |
| 项目路径 | `C:\Users\bf_joesyang\project-management` |
| Node.js | v20.18.1（**免安装版 zip**） |
| Git | MinGit 2.47.1（**免安装版**） |
| 访问地址 | `http://21.214.83.112:3000` |

### 1.3 代码仓库

| 项目 | 说明 |
|------|------|
| 平台 | GitHub |
| 仓库地址 | `https://github.com/sanmu1596-cyber/3dmanage.git` |
| 分支 | `master` |
| Git 用户 | `sanmu1596-cyber`（仓库级别配置） |

---

## 第二章：首次上云部署实录

> 📅 2026-03-30 晚，我们第一次把系统部署到 WeTeam 开发机上。以下是完整的操作过程和踩过的坑。

### 2.1 为什么选择免安装版？

WeTeam 开发机是一台受限的 Windows Server，没有管理员安装权限，无法运行 `.msi` 安装包。所以我们选择了 **免安装版（portable）**：

- **Node.js**：下载 `node-v20.18.1-win-x64.zip`，解压即用
- **Git**：下载 `MinGit-2.47.1-64-bit.zip`，解压即用

### 2.2 安装 Node.js（免安装版）

```powershell
# 1. 创建工具目录
mkdir C:\Users\bf_joesyang\nodejs

# 2. 将下载好的 node zip 解压到该目录
#    解压后目录结构: C:\Users\bf_joesyang\nodejs\node-v20.18.1-win-x64\

# 3. 永久添加到 PATH（关键！关掉终端也不丢）
[Environment]::SetEnvironmentVariable(
    "PATH",
    [Environment]::GetEnvironmentVariable("PATH", "User") + ";C:\Users\bf_joesyang\nodejs\node-v20.18.1-win-x64",
    "User"
)

# 4. 当前终端立即生效
$env:PATH += ";C:\Users\bf_joesyang\nodejs\node-v20.18.1-win-x64"

# 5. 验证
node -v    # 应输出 v20.18.1
npm -v     # 应输出对应版本号
```

> 💡 **要点**：用 `[Environment]::SetEnvironmentVariable(...)` 设置 User 级环境变量，这样重新打开终端也能用。如果只设 `$env:PATH`，关终端就没了。

### 2.3 安装 Git（MinGit 免安装版）

```powershell
# 1. 创建工具目录
mkdir C:\Users\bf_joesyang\git

# 2. 解压 MinGit zip 到该目录
#    解压后: C:\Users\bf_joesyang\git\cmd\git.exe

# 3. 永久添加到 PATH
[Environment]::SetEnvironmentVariable(
    "PATH",
    [Environment]::GetEnvironmentVariable("PATH", "User") + ";C:\Users\bf_joesyang\git\cmd",
    "User"
)

# 4. 当前终端立即生效
$env:PATH += ";C:\Users\bf_joesyang\git\cmd"

# 5. 验证
git --version    # 应输出 git version 2.47.1.windows.1
```

### 2.4 克隆仓库并安装依赖

```powershell
# 克隆代码
cd C:\Users\bf_joesyang
git clone https://github.com/sanmu1596-cyber/3dmanage.git project-management

# 进入项目
cd project-management

# 安装依赖（使用腾讯内部镜像加速）
npm config set registry https://mirrors.tencent.com/npm/
npm install --production
```

> 💡 **腾讯内部 npm 镜像**：`https://mirrors.tencent.com/npm/`，比默认的 npmjs.org 快很多，内网环境强烈推荐。

### 2.5 启动服务

```powershell
cd C:\Users\bf_joesyang\project-management
node server.js
```

看到以下输出即成功：
```
数据库已连接
服务器运行在 http://0.0.0.0:3000
本机访问: http://localhost:3000
```

### 2.6 验证访问

- ✅ 本机: `http://localhost:3000`
- ✅ 内网: `http://21.214.83.112:3000`
- 默认账号: `admin` / `admin123`

---

## 第三章：日常开发部署流程

### 3.1 标准流程

```
本地开发 → 本地测试 → git push → 服务器 git pull → 运行迁移(如有) → 重启服务
```

### 3.2 本地推送代码

代码在本地开发完成并确认后，会自动推送：

```powershell
# 本地（由大神自动执行）
cd C:\Users\joesyang\WorkBuddy\20260324104822\project-management
git add .
git commit -m "feat: 功能描述"
git push origin master
```

### 3.3 服务器拉取更新

```powershell
# ⚠️ 第一步：先停服务！（防止 database.sqlite 被锁）
taskkill /F /IM node.exe
# 或者如果用了 PM2：
pm2 stop all

# 第二步：拉取代码
cd C:\Users\bf_joesyang\project-management
git pull origin master

# 第三步：如果有数据库迁移脚本，运行它
node migration_xxx.js

# 第四步：重启服务
node server.js
# 或者：
pm2 restart all
```

### 3.4 重要原则

| 原则 | 说明 |
|------|------|
| **先停后拉** | `git pull` 前必须停 Node 服务，否则 SQLite 文件被锁，pull 会失败 |
| **迁移脚本** | 涉及数据库表结构变更时，会提供 `migration_xxx.js` 脚本，必须手动运行 |
| **数据库不轻易覆盖** | 多人录入数据时，不要用 `git add -f database.sqlite` 覆盖服务器数据 |

---

## 第四章：数据库迁移操作

### 4.1 什么是数据库迁移？

当系统新增功能需要改数据库结构时（比如加新表、加新字段），需要运行一个迁移脚本来更新数据库，而不是直接删库重建。这样可以 **保留已有数据**。

### 4.2 迁移脚本命名规范

```
migration_<功能名>.js
```

例如：
- `migration_add_game_fields.js` — 给游戏表加新字段
- `migration_roles.js` — 创建角色和权限表

### 4.3 运行迁移

```powershell
# 进入项目目录
cd C:\Users\bf_joesyang\project-management

# 运行迁移脚本
node migration_roles.js
```

迁移脚本的特点：
- **幂等性**：脚本内部会检查表/字段是否已存在，重复运行不会报错
- **输出日志**：每一步操作都会打印到控制台，方便确认执行结果
- **运行一次即可**：拉取代码后运行一次，之后不用再运行

### 4.4 已执行的迁移记录

| 日期 | 脚本 | 说明 |
|------|------|------|
| 2026-03-26 | `migration_add_game_fields.js` | 游戏表新增 owner_id, online_status, quality 字段 |
| 2026-03-31 | `migration_roles.js` | 创建 roles 表 + role_permissions 表，6 个默认角色 + 54 权限位 |

---

## 第五章：踩坑记录与解决方案

### 🔥 坑 1：git pull 报 "Unlink of file 'database.sqlite' failed"

**场景**：服务器上直接 `git pull`，没有先停服务。

**报错**：
```
Unlink of file 'database.sqlite' failed. Should I try again? (y/n)
```

**原因**：Node.js 进程正在使用 SQLite 数据库文件，操作系统锁定了该文件，git 无法替换。

**解决**：
```powershell
# 先杀 Node 进程
taskkill /F /IM node.exe

# 再 pull
git pull origin master

# 最后重启
node server.js
```

**教训**：**永远先停服务，再 pull 代码。** 这个在日常流程中已经写入标准步骤。

---

### 🔥 坑 2：免安装版 Node/Git 关掉终端后找不到命令

**场景**：解压了 Node.js 和 Git，当前终端能用，但关掉终端再打开就报 "node 不是内部或外部命令"。

**原因**：只设置了 `$env:PATH`（临时环境变量），没有写入永久环境变量。

**解决**：
```powershell
# 永久设置 User 级 PATH（重启终端也生效）
[Environment]::SetEnvironmentVariable(
    "PATH",
    [Environment]::GetEnvironmentVariable("PATH", "User") + ";你的路径",
    "User"
)
```

**教训**：在受限环境安装免安装版工具时，一定要用 `[Environment]::SetEnvironmentVariable` 写入持久化 PATH。

---

### 🔥 坑 3：WeTeam 不支持 SSH 端口转发

**场景**：尝试用 SSH 隧道 `ssh -L 3000:localhost:3000` 来从本地访问开发机的 3000 端口。

**原因**：WeTeam 平台的网页终端不支持 SSH 端口转发。

**解决**：
- 方案 A：使用 WeTeam 平台的 **端口预览** 功能
- 方案 B：直接通过开发机内网 IP 访问 `http://21.214.83.112:3000`
- 方案 C：如果有 RDP 权限，远程桌面里打开浏览器访问 `http://localhost:3000`

---

### 🔥 坑 4：npm install 慢 / 超时

**场景**：开发机上 `npm install` 下载极慢或直接超时。

**原因**：默认 npm registry 是 `https://registry.npmjs.org`，需要访问外网。

**解决**：
```powershell
# 切换为腾讯内部镜像
npm config set registry https://mirrors.tencent.com/npm/

# 验证
npm config get registry
```

**教训**：腾讯内网环境务必先配镜像再 `npm install`。

---

### 🔥 坑 5：server.js 中 HOST 硬编码为 localhost

**场景**：服务器启动后，本机 `localhost:3000` 能访问，但其他机器通过 IP 访问不了。

**原因**：最初 `server.js` 中 `HOST` 硬编码为 `'localhost'`（即 `127.0.0.1`），只监听本地回环地址。

**解决**：
```javascript
// 修改前
const HOST = 'localhost';

// 修改后（支持环境变量覆盖，默认监听所有网卡）
const HOST = process.env.HOST || '0.0.0.0';
```

**教训**：服务器部署时，监听地址必须是 `0.0.0.0` 才能被外部访问。本地开发时 `localhost` 没问题，上服务器就得改。

---

### 🔥 坑 6：git 配置用户名的坑

**场景**：服务器上 `git commit` 时要求配置 user.name 和 user.email。

**解决**：
```powershell
# 仓库级别配置（推荐，不影响系统其他项目）
cd C:\Users\bf_joesyang\project-management
git config user.name "sanmu1596-cyber"
git config user.email "your-email@example.com"
```

> ⚠️ 不要用 `--global`，仓库级别配置更安全，不会污染其他项目。

---

### 🔥 坑 7：.gitignore 没有排除 database.sqlite

**场景**：早期 `database.sqlite` 被加入了 git 跟踪。后来想 ignore 却发现已经 tracked 的文件 `.gitignore` 不生效。

**解决**：
```powershell
# 如果想从 git 中移除跟踪（保留本地文件）
git rm --cached database.sqlite
git commit -m "chore: stop tracking database.sqlite"

# 在 .gitignore 中添加
# *.sqlite
```

**我们的选择**：目前故意保留 `database.sqlite` 在 git 中（用 `git add -f` 强制追踪），因为只有一台服务器，便于同步初始数据。多人协作时需要改变策略。

---

## 第六章：常用运维命令速查

### 6.1 服务管理

```powershell
# 启动服务
cd C:\Users\bf_joesyang\project-management
node server.js

# 后台启动（PM2）
pm2 start server.js --name "game-manager"
pm2 restart game-manager
pm2 stop game-manager
pm2 logs game-manager
pm2 status

# 杀掉所有 Node 进程（紧急情况）
taskkill /F /IM node.exe
```

### 6.2 代码更新

```powershell
# 标准更新流程
taskkill /F /IM node.exe          # 1. 停服务
git pull origin master             # 2. 拉代码
node migration_xxx.js              # 3. 跑迁移（如有）
node server.js                     # 4. 启服务
```

### 6.3 端口排查

```powershell
# 查看谁占了 3000 端口
netstat -ano | findstr :3000

# 根据 PID 杀进程
taskkill /PID <PID> /F
```

### 6.4 数据库操作

```powershell
# 备份数据库
Copy-Item database.sqlite database.sqlite.bak

# 查看数据库内容（需要 SQLite 工具，或在 Node 中查询）
node -e "const db=require('better-sqlite3')('database.sqlite'); console.log(db.prepare('SELECT count(*) as c FROM games').get())"
```

### 6.5 环境变量

```powershell
# 查看当前 PATH
$env:PATH -split ";"

# 永久添加 PATH
[Environment]::SetEnvironmentVariable("PATH", [Environment]::GetEnvironmentVariable("PATH","User") + ";新路径", "User")

# 查看 npm 镜像配置
npm config get registry
```

---

## 第七章：安全与备份

### 7.1 安全注意事项

| 项目 | 建议 |
|------|------|
| 默认密码 | 部署后立即修改 `admin` 的默认密码 `admin123` |
| DEV_MODE | 正式上线前将 `DEV_MODE` 设为 `false`，开启认证和权限检查 |
| HTTPS | 生产环境应配置 HTTPS（nginx 反代 + Let's Encrypt） |
| 防火墙 | 只开放必要端口（3000），其他端口保持关闭 |

### 7.2 数据库备份策略

```powershell
# 手动备份（建议每次更新前执行）
Copy-Item database.sqlite "database_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sqlite"

# 定时备份（Windows 计划任务）
schtasks /create /tn "DBBackup" /tr "powershell -Command Copy-Item C:\Users\bf_joesyang\project-management\database.sqlite C:\Users\bf_joesyang\project-management\db_backups\backup_$(Get-Date -Format 'yyyyMMdd').sqlite" /sc daily /st 02:00
```

> 💡 SQLite 的最大优势：数据库就是一个文件，备份就是复制文件，简单粗暴有效。

---

## 附录：项目结构速览

```
project-management/
├── server.js              # Express 服务器主文件（路由、API、启动）
├── auth.js                # 认证 & RBAC 权限模块
├── usersController.js     # 用户 & 角色控制器
├── database.sqlite        # SQLite 数据库文件
├── package.json           # 依赖配置
├── .gitignore             # Git 忽略规则
│
├── routes/                # 业务路由
│   ├── members.js         # 成员管理
│   ├── devices.js         # 设备管理
│   ├── games.js           # 游戏管理
│   ├── tests.js           # 测试管理
│   └── bugs.js            # 缺陷管理
│
├── public/                # 前端静态文件
│   ├── index.html         # 主页面
│   ├── login.html         # 登录页
│   ├── app.js             # 前端 JS（~4900行）
│   └── styles.css         # 样式文件（~2400行）
│
├── migration_roles.js     # 数据库迁移：角色权限表
├── migration_add_game_fields.js  # 数据库迁移：游戏新字段
│
├── DEPLOYMENT_GUIDE.md    # 👈 你正在看的这份文档
├── DEPLOY_WETEAM.md       # WeTeam 专用部署指南
├── REQUIREMENTS_LOG.md    # 需求记录文档
└── SYSTEM_CHECK.md        # 系统自检报告
```

---

## 快速参考卡片

```
┌─────────────────────────────────────────────────┐
│  🚀 日常部署速查                                   │
│                                                   │
│  服务器更新四步走：                                  │
│  ① taskkill /F /IM node.exe    ← 停服务           │
│  ② git pull origin master      ← 拉代码           │
│  ③ node migration_xxx.js       ← 跑迁移(如有)     │
│  ④ node server.js              ← 启服务           │
│                                                   │
│  ⚠️ 踩坑 TOP 1：pull 前一定要先停服务！             │
│  ⚠️ 踩坑 TOP 2：PATH 要用永久化写法！              │
│  ⚠️ 踩坑 TOP 3：监听地址用 0.0.0.0 不是 localhost！│
└─────────────────────────────────────────────────┘
```

---

_文档版本: v1.0 | 2026-03-31_
_下次更新时机: 新增部署相关踩坑或流程变更时_
