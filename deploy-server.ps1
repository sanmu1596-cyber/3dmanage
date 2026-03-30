# ============================================
# 裸眼3D游戏适配管理系统 - 服务器首次部署脚本
# 在 Windows Server 上的 PowerShell 中执行
# ============================================

$APP_DIR = "C:\app\game-management"
$NODE_VERSION = "20.18.0"
$NODE_MSI_URL = "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-x64.msi"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  服务器首次部署脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---- Step 1: 检查/安装 Node.js ----
Write-Host "[1/5] 检查 Node.js..." -ForegroundColor Green
$nodeInstalled = $false
try {
    $nodeVer = node --version 2>$null
    if ($nodeVer) {
        Write-Host "  Node.js 已安装: $nodeVer" -ForegroundColor Yellow
        $nodeInstalled = $true
    }
} catch {}

if (-not $nodeInstalled) {
    Write-Host "  Node.js 未安装, 正在下载 v${NODE_VERSION}..." -ForegroundColor Yellow
    $msiPath = "C:\node-installer.msi"
    
    # 下载
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $NODE_MSI_URL -OutFile $msiPath -UseBasicParsing
    
    # 安装
    Write-Host "  正在安装..." -ForegroundColor Yellow
    Start-Process msiexec.exe -Wait -ArgumentList "/i $msiPath /qn /norestart"
    
    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    # 验证
    $nodeVer = node --version
    Write-Host "  安装完成: $nodeVer" -ForegroundColor Green
    
    # 清理安装包
    Remove-Item $msiPath -Force
}

# ---- Step 2: 创建项目目录 & 解压 ----
Write-Host ""
Write-Host "[2/5] 准备项目目录..." -ForegroundColor Green

if (!(Test-Path $APP_DIR)) {
    New-Item -ItemType Directory -Path $APP_DIR -Force | Out-Null
    Write-Host "  创建目录: $APP_DIR" -ForegroundColor Yellow
}

$packageFile = "C:\deploy-package.tar.gz"
if (Test-Path $packageFile) {
    Write-Host "  解压部署包..." -ForegroundColor Yellow
    tar -xzf $packageFile -C $APP_DIR
    Write-Host "  解压完成!" -ForegroundColor Green
} else {
    Write-Host "  !! 未找到部署包: $packageFile" -ForegroundColor Red
    Write-Host "  请先上传 deploy-package.tar.gz 到 C:\" -ForegroundColor Red
    exit 1
}

# ---- Step 3: 安装依赖 ----
Write-Host ""
Write-Host "[3/5] 安装 npm 依赖..." -ForegroundColor Green
Push-Location $APP_DIR
npm install --production
if ($LASTEXITCODE -ne 0) {
    Write-Host "  npm install 失败, 尝试安装构建工具..." -ForegroundColor Yellow
    npm install --global windows-build-tools
    npm install --production
}
Pop-Location

# ---- Step 4: 安装 PM2 & 启动 ----
Write-Host ""
Write-Host "[4/5] 安装 PM2 并启动服务..." -ForegroundColor Green
npm install -g pm2 2>$null

Push-Location $APP_DIR
# 先停止旧实例（如果有）
pm2 delete game-management 2>$null
# 启动
pm2 start server.js --name "game-management"
pm2 save
Pop-Location

# ---- Step 5: 配置防火墙 ----
Write-Host ""
Write-Host "[5/5] 配置防火墙规则..." -ForegroundColor Green

$ruleName = "Game Management System (Port 3000)"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
    Write-Host "  防火墙规则已存在" -ForegroundColor Yellow
} else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow | Out-Null
    Write-Host "  已添加防火墙入站规则: TCP 3000" -ForegroundColor Green
}

# ---- 完成 ----
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  部署完成!" -ForegroundColor Green
Write-Host "" -ForegroundColor Cyan
Write-Host "  项目路径: $APP_DIR" -ForegroundColor Yellow
Write-Host "  访问地址: http://21.214.83.112:3000" -ForegroundColor Yellow
Write-Host "  默认账号: admin / admin123" -ForegroundColor Yellow
Write-Host "" -ForegroundColor Cyan
Write-Host "  PM2 管理命令:" -ForegroundColor Yellow
Write-Host "    pm2 status              # 查看状态" -ForegroundColor White
Write-Host "    pm2 logs game-management # 查看日志" -ForegroundColor White
Write-Host "    pm2 restart game-management # 重启" -ForegroundColor White
Write-Host "    pm2 monit               # 监控面板" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "!! 别忘了在云服务商控制台的安全组中放行 TCP 3000 端口 !!" -ForegroundColor Red
Write-Host ""
