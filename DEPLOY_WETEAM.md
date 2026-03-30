# 🚀 WeTeam 开发机部署指南

> **环境**: WeTeam Windows Server 开发机 + 网页终端
> **项目**: 裸眼3D游戏适配项目管理系统
> **端口**: 3000

---

## 一、前置条件

| 项目 | 要求 |
|------|------|
| 开发机 | WeTeam Windows Server |
| 连接方式 | WeTeam 网页终端 |
| 网络访问 | WeTeam 平台端口预览功能 |

---

## 二、部署步骤

### Step 1: 安装 Node.js

在 WeTeam 网页终端中执行：

```powershell
# 方式A: 直接下载安装（推荐）
# 下载 Node.js 20 LTS Windows 安装包
curl -o C:\node-setup.msi https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi

# 静默安装
msiexec /i C:\node-setup.msi /qn /norestart

# 刷新环境变量（新开一个终端窗口，或执行）
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

# 验证安装
node -v
npm -v
```

```powershell
# 方式B: 使用 nvm-windows（如果 curl 不可用）
# 1. 手动下载 nvm-windows: https://github.com/coreybutler/nvm-windows/releases
# 2. 安装后执行:
nvm install 20
nvm use 20
```

> ⚠️ 如果以上方式都不行，可以在本地电脑下载 node-v20.18.1-win-x64.zip（免安装版），
> 解压后通过 WeTeam 文件传输功能上传到开发机，手动添加到 PATH。

---

### Step 2: 上传项目文件

**方式A: 通过 WeTeam 文件上传功能**

1. 在本地先打包项目（排除 node_modules）：
   - 在本地 PowerShell 中执行下方 [本地打包脚本](#附录a-本地打包脚本)
   - 生成 `project-management.zip`
2. 通过 WeTeam 网页终端的文件上传功能，将 zip 上传到开发机

**方式B: 通过 Git**

如果开发机可以访问 Git 仓库：
```powershell
cd C:\
git clone <你的仓库地址> project-management
```

**方式C: 通过 SCP/iFt**

如果有 SSH 权限或 iFt 工具：
```powershell
# 本地执行 SCP
scp project-management.zip user@<开发机IP>:C:\
```

---

### Step 3: 解压并安装依赖

```powershell
# 进入项目目录（根据你上传的位置调整路径）
cd C:\project-management

# 如果是 zip 上传的，先解压
Expand-Archive -Path C:\project-management.zip -DestinationPath C:\ -Force

# 安装依赖
npm install --production
```

---

### Step 4: 启动服务

```powershell
# 进入项目目录
cd C:\project-management

# 直接启动
node server.js
```

看到以下输出说明启动成功：
```
数据库已连接
服务器运行在 http://0.0.0.0:3000
本机访问: http://localhost:3000
```

---

### Step 5: 通过 WeTeam 预览访问

WeTeam 平台提供了端口预览功能，有以下几种方式访问你的服务：

#### 方式A: WeTeam 内置端口预览
1. 在 WeTeam 开发机管理页面找到 **"端口预览"** 或 **"Web 预览"** 功能
2. 输入端口号 `3000`
3. 平台会生成一个临时的预览 URL

#### 方式B: 开发机浏览器直接访问
如果开发机有远程桌面（RDP）：
1. 通过 WeTeam RDP 连接到开发机桌面
2. 打开浏览器访问 `http://localhost:3000`

#### 方式C: 通过开发机IP + 端口（需网络通）
如果你的办公电脑和开发机在同一网络内（如通过 VPN）：
```
http://<开发机内网IP>:3000
```

> ⚠️ 注意：WeTeam 不支持 SSH 端口转发。请使用 WeTeam 平台提供的预览机制。

---

### Step 6: 设置后台运行（保持服务不中断）

关闭终端窗口后服务会停止，需要设置后台运行：

#### 方案A: 使用 PM2（推荐）

```powershell
# 安装 PM2
npm install -g pm2

# 用 PM2 启动
cd C:\project-management
pm2 start server.js --name "game-manager"

# 查看状态
pm2 status

# 查看日志
pm2 logs game-manager

# 设置开机自启
pm2 save
pm2-startup install
```

#### 方案B: 使用 Windows 计划任务

```powershell
# 创建开机启动的计划任务
schtasks /create /tn "GameManager" /tr "node C:\project-management\server.js" /sc onstart /ru SYSTEM

# 查看任务
schtasks /query /tn "GameManager"

# 删除任务（需要时）
# schtasks /delete /tn "GameManager" /f
```

#### 方案C: 使用 nssm 创建 Windows 服务

```powershell
# 下载 nssm: https://nssm.cc/download
# 解压后执行:
nssm install GameManager "C:\Program Files\nodejs\node.exe" "C:\project-management\server.js"
nssm set GameManager AppDirectory "C:\project-management"
nssm start GameManager

# 查看服务状态
nssm status GameManager
```

---

### Step 7: 首次登录

1. 打开预览 URL（或 http://localhost:3000）
2. 使用默认账号登录：
   - 用户名: `admin`
   - 密码: `admin123`
3. **⚠️ 立即修改默认密码！**

---

## 三、常用运维命令

```powershell
# === PM2 管理 ===
pm2 status                    # 查看所有进程
pm2 logs game-manager         # 查看日志
pm2 restart game-manager      # 重启
pm2 stop game-manager         # 停止
pm2 delete game-manager       # 删除

# === 手动管理 ===
cd C:\project-management
node server.js                # 前台启动
Start-Process node server.js  # 后台启动（PowerShell）

# === 检查端口 ===
netstat -ano | findstr :3000  # 查看 3000 端口占用

# === 数据库备份 ===
Copy-Item C:\project-management\database.sqlite C:\project-management\database.sqlite.bak
```

---

## 四、更新部署

当有新版本需要更新时：

```powershell
# 1. 停止服务
pm2 stop game-manager

# 2. 备份数据库
Copy-Item C:\project-management\database.sqlite C:\project-management\database.sqlite.bak

# 3. 上传新文件（覆盖旧文件，但不要覆盖 database.sqlite）

# 4. 安装新依赖（如果 package.json 有变化）
cd C:\project-management
npm install --production

# 5. 重启服务
pm2 restart game-manager
```

---

## 五、故障排查

| 问题 | 排查方法 |
|------|----------|
| `node` 命令不存在 | 检查 PATH：`$env:PATH -split ";"` |
| 端口被占用 | `netstat -ano \| findstr :3000`，`taskkill /PID <PID> /F` |
| 启动报错 | 检查 `node server.js` 的错误输出 |
| 数据库锁定 | 停止所有 node 进程：`taskkill /IM node.exe /F` |
| 无法访问 | 确认 WeTeam 端口预览是否开启，服务是否在运行 |
| npm install 失败 | 检查网络，尝试 `npm config set registry https://mirrors.tencent.com/npm/` |

---

## 六、网络相关

### 使用腾讯内部 npm 镜像（加速）

```powershell
npm config set registry https://mirrors.tencent.com/npm/
```

### 如果需要通过防火墙开放端口

```powershell
# 开放 3000 端口（如果有 Windows 防火墙限制）
netsh advfirewall firewall add rule name="GameManager" dir=in action=allow protocol=TCP localport=3000
```

---

## 附录A: 本地打包脚本

在你的**本地电脑** PowerShell 中执行：

```powershell
# 进入项目目录
cd c:\Users\joesyang\WorkBuddy\20260324104822\project-management

# 打包（排除 node_modules 和不需要的文件）
$excludeList = @("node_modules", ".git", "*.zip", "deploy-*.ps1")
$source = Get-ChildItem -Path . -Exclude $excludeList
Compress-Archive -Path $source -DestinationPath .\project-management.zip -Force

Write-Host "打包完成: project-management.zip" -ForegroundColor Green
Write-Host "文件大小: $((Get-Item .\project-management.zip).Length / 1MB) MB" -ForegroundColor Cyan
```

---

## 附录B: 项目技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite3（文件数据库，零配置） |
| 前端 | 原生 HTML/CSS/JavaScript |
| 端口 | 3000（可通过 PORT 环境变量修改） |

> SQLite 的好处：不需要额外安装数据库服务，数据库就是一个文件 `database.sqlite`，备份就是复制这个文件。

---

_最后更新: 2026-03-30_
