# ============================================
# 裸眼3D游戏适配管理系统 - 本地打包上传脚本
# 用法: 在 PowerShell 中执行此脚本
# ============================================

$SERVER_IP = "21.214.83.112"
$SERVER_USER = "Administrator"
$SERVER_PATH = "C:\app\game-management"
$PROJECT_DIR = $PSScriptRoot  # 脚本所在目录即项目目录

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  裸眼3D游戏适配管理系统 - 部署工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "服务器: $SERVER_IP" -ForegroundColor Yellow
Write-Host "项目目录: $PROJECT_DIR" -ForegroundColor Yellow
Write-Host ""

# Step 1: 打包
Write-Host "[1/3] 正在打包项目文件..." -ForegroundColor Green
$DEPLOY_FILE = Join-Path $PROJECT_DIR "..\deploy-package.tar.gz"

Push-Location $PROJECT_DIR
tar -czf $DEPLOY_FILE `
  --exclude="node_modules" `
  --exclude="*.bak" `
  --exclude="*.py" `
  --exclude="database.sqlite.bak*" `
  --exclude="server.js.bak" `
  --exclude="bg_backup.png" `
  --exclude="bgtest.html" `
  --exclude="test-game-accounts.html" `
  --exclude="excel_data.txt" `
  --exclude="deploy-local.ps1" `
  --exclude="deploy-server.ps1" `
  --exclude="DEPLOY_GUIDE.md" `
  .
Pop-Location

$fileSize = [math]::Round((Get-Item $DEPLOY_FILE).Length / 1MB, 2)
Write-Host "  打包完成! 文件大小: ${fileSize}MB" -ForegroundColor Green

# Step 2: 上传
Write-Host ""
Write-Host "[2/3] 正在上传到服务器..." -ForegroundColor Green
scp $DEPLOY_FILE "${SERVER_USER}@${SERVER_IP}:C:\deploy-package.tar.gz"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  上传完成!" -ForegroundColor Green
} else {
    Write-Host "  上传失败! 请检查 SSH 连接" -ForegroundColor Red
    exit 1
}

# Step 3: 询问是否上传数据库
Write-Host ""
$uploadDB = Read-Host "是否同步上传数据库文件 database.sqlite? (y/N)"
if ($uploadDB -eq "y" -or $uploadDB -eq "Y") {
    Write-Host "  正在上传数据库..." -ForegroundColor Yellow
    scp (Join-Path $PROJECT_DIR "database.sqlite") "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}\database.sqlite"
    Write-Host "  数据库上传完成!" -ForegroundColor Green
}

# Step 4: 远程解压 & 重启
Write-Host ""
Write-Host "[3/3] 正在远程部署..." -ForegroundColor Green
ssh "${SERVER_USER}@${SERVER_IP}" "powershell -Command `"if (!(Test-Path '${SERVER_PATH}')) { New-Item -ItemType Directory -Path '${SERVER_PATH}' -Force }; tar -xzf C:\deploy-package.tar.gz -C '${SERVER_PATH}'; cd '${SERVER_PATH}'; npm install --production; pm2 restart game-management 2>`$null; if (`$LASTEXITCODE -ne 0) { pm2 start server.js --name game-management }; pm2 save`""

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  部署完成!" -ForegroundColor Green
Write-Host "  访问地址: http://${SERVER_IP}:3000" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
