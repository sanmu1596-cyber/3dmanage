# 🚀 裸眼3D游戏适配项目管理系统 - 云服务器部署指南

> **服务器信息**: Windows Server | IP: 21.214.83.112
> **访问地址**: http://21.214.83.112:3000
> **部署时间**: 2026年3月30日

---

## 一、部署概览

```
┌──────────────┐     HTTP:3000     ┌──────────────────────┐
│   浏览器用户   │ ──────────────── │  Windows Server      │
│   任意设备     │                  │  21.214.83.112       │
└──────────────┘                   │                      │
                                   │  Node.js + Express   │
                                   │  SQLite3 数据库       │
                                   │  PM2 进程守护         │
                                   └──────────────────────┘
```

**部署步骤**:
1. 本地打包项目文件
2. SSH上传到服务器
3. 服务器安装 Node.js
4. 安装依赖 & 启动服务
5. 配置防火墙放行端口
6. 设置开机自启（PM2）

---

## 二、Step 1: 本地打包项目

在你的本地电脑（PowerShell）执行：

```powershell
# 进入项目目录
cd C:\Users\joesyang\WorkBuddy\20260324104822\project-management

# 打包（排除 node_modules、备份文件、Python脚本等无关文件）
# 使用 tar 命令（Windows 10+ 自带）
tar -czf ../deploy-package.tar.gz `
  --exclude="node_modules" `
  --exclude="*.bak" `
  --exclude="*.py" `
  --exclude="database.sqlite.bak*" `
  --exclude="server.js.bak" `
  --exclude="bg_backup.png" `
  --exclude="bgtest.html" `
  --exclude="test-game-accounts.html" `
  --exclude="excel_data.txt" `
  .
```

打包后文件位于: `C:\Users\joesyang\WorkBuddy\20260324104822\deploy-package.tar.gz`

---

## 三、Step 2: 上传到服务器

### 方式A: SCP 命令上传（推荐）

```powershell
# 在本地 PowerShell 执行
scp C:\Users\joesyang\WorkBuddy\20260324104822\deploy-package.tar.gz Administrator@21.214.83.112:C:\deploy-package.tar.gz
```

### 方式B: 使用 WinSCP / FileZilla
1. 连接 `21.214.83.112`，用你的账号密码
2. 把 `deploy-package.tar.gz` 上传到 `C:\`

---

## 四、Step 3: SSH 登录服务器并部署

### 4.1 SSH 登录

```powershell
# 从本地连接服务器
ssh Administrator@21.214.83.112
```

### 4.2 安装 Node.js

在服务器上执行（PowerShell）：

```powershell
# 方式一：直接下载安装（推荐）
# 下载 Node.js 20 LTS (Windows x64)
Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" -OutFile "C:\node-installer.msi"

# 静默安装
Start-Process msiexec.exe -Wait -ArgumentList '/i C:\node-installer.msi /qn /norestart'

# 刷新环境变量
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# 验证安装
node --version    # 应显示 v20.18.0
npm --version     # 应显示 10.x.x
```

如果上面的方式下载慢，可以用**方式二：手动安装**：
1. 在服务器浏览器打开 https://nodejs.org/zh-cn/download
2. 下载 Windows Installer (.msi) 64-bit
3. 双击运行安装，全部默认即可

### 4.3 创建项目目录 & 解压

```powershell
# 创建项目目录
mkdir C:\app\game-management

# 解压部署包
cd C:\
tar -xzf deploy-package.tar.gz -C C:\app\game-management

# 进入项目目录
cd C:\app\game-management
```

### 4.4 安装依赖

```powershell
cd C:\app\game-management
npm install --production
```

> ⚠️ **注意**: `sqlite3` 包需要编译原生模块。如果报错，需要先安装构建工具：
> ```powershell
> npm install --global windows-build-tools
> # 或者
> npm install --global --production windows-build-tools
> ```
> 然后重新 `npm install --production`

### 4.5 复制数据库

将本地的 `database.sqlite` 也上传到服务器：

```powershell
# 在本地执行
scp C:\Users\joesyang\WorkBuddy\20260324104822\project-management\database.sqlite Administrator@21.214.83.112:C:\app\game-management\database.sqlite
```

### 4.6 测试启动

```powershell
cd C:\app\game-management
node server.js
```

看到 `服务器运行在 http://localhost:3000` 就成功了！
先按 `Ctrl+C` 停掉，接下来配置为后台服务。

---

## 五、Step 4: 配置为后台服务（PM2）

### 5.1 安装 PM2

```powershell
npm install -g pm2
npm install -g pm2-windows-startup
```

### 5.2 用 PM2 启动

```powershell
cd C:\app\game-management
pm2 start server.js --name "game-management"

# 查看运行状态
pm2 status

# 查看日志
pm2 logs game-management
```

### 5.3 设置开机自启

```powershell
pm2-startup install

# 保存当前进程列表
pm2 save
```

这样即使服务器重启，应用也会自动启动。

---

## 六、Step 5: 配置防火墙

### 6.1 Windows 防火墙放行 3000 端口

在服务器上执行：

```powershell
# 添加入站规则
New-NetFirewallRule -DisplayName "Game Management System" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

# 验证规则是否生效
Get-NetFirewallRule -DisplayName "Game Management System"
```

### 6.2 云服务商安全组

> ⚠️ **这一步非常关键！** 除了 Windows 防火墙，还需要在云服务商控制台配置安全组。

在你的云服务商控制台（腾讯云/阿里云/华为云等）：

1. 找到这台服务器的 **安全组**
2. 添加 **入站规则**：
   - **协议**: TCP
   - **端口**: 3000
   - **来源**: 0.0.0.0/0（所有IP）
   - **策略**: 允许

---

## 七、访问系统

部署完成后，分享这个链接给团队成员：

### 🔗 访问地址

```
http://21.214.83.112:3000
```

### 默认登录账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 系统管理员 |

> ⚠️ **安全提醒**: 上线后请立即修改默认密码！

---

## 八、日常运维命令

```powershell
# 查看应用状态
pm2 status

# 查看实时日志
pm2 logs game-management

# 重启应用
pm2 restart game-management

# 停止应用
pm2 stop game-management

# 更新代码后重启
cd C:\app\game-management
pm2 restart game-management

# 监控资源使用
pm2 monit
```

---

## 九、更新部署（以后更新代码用）

每次有代码更新时：

```powershell
# 1. 本地重新打包
cd C:\Users\joesyang\WorkBuddy\20260324104822\project-management
tar -czf ../deploy-package.tar.gz --exclude="node_modules" --exclude="*.bak" --exclude="*.py" .

# 2. 上传到服务器
scp C:\Users\joesyang\WorkBuddy\20260324104822\deploy-package.tar.gz Administrator@21.214.83.112:C:\deploy-package.tar.gz

# 3. SSH 登录服务器，解压 & 重启
ssh Administrator@21.214.83.112
tar -xzf C:\deploy-package.tar.gz -C C:\app\game-management
cd C:\app\game-management
npm install --production
pm2 restart game-management
```

> 💡 **注意**: 更新代码时**不要覆盖 database.sqlite**，否则数据会丢失！

---

## 十、安全加固建议（后续优化）

| 措施 | 说明 | 优先级 |
|------|------|--------|
| 修改默认密码 | admin/admin123 → 强密码 | 🔴 立即 |
| 限制 SSH 端口 | 改为非标准端口 | 🟡 建议 |
| 安全组收紧 | 限制来源IP范围 | 🟡 建议 |
| 配置 HTTPS | 绑定域名 + SSL 证书 | 🟢 后续 |
| 配置 Nginx | 反向代理 + 静态资源缓存 | 🟢 后续 |
| 数据库备份 | 定期备份 database.sqlite | 🟡 建议 |

---

## 快速命令卡片

```
┌─────────────────────────────────────────────────┐
│  🏠 项目路径: C:\app\game-management            │
│  🌐 访问地址: http://21.214.83.112:3000         │
│  👤 默认账号: admin / admin123                   │
│  📋 进程管理: pm2 status / pm2 logs             │
│  🔄 重启服务: pm2 restart game-management       │
│  📊 监控面板: pm2 monit                          │
└─────────────────────────────────────────────────┘
```

---

*文档生成时间: 2026年3月30日 20:38*
