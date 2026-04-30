# ============================================
# 快速更新脚本 - 在服务器上执行
# ============================================

$APP_DIR = "C:\app\game-management"
$PACKAGE = "C:\deploy-update.tar.gz"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  快速更新 - 游戏问题模块修复" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查更新包
if (!(Test-Path $PACKAGE)) {
    Write-Host "!! 未找到更新包: $PACKAGE" -ForegroundColor Red
    Write-Host "请先上传 deploy-update.tar.gz 到 C:\" -ForegroundColor Red
    exit 1
}

# 停止服务
Write-Host "[1/3] 停止服务..." -ForegroundColor Yellow
pm2 stop game-management 2>$null

# 解压更新
Write-Host "[2/3] 解压更新文件..." -ForegroundColor Yellow
tar -xzvf $PACKAGE -C $APP_DIR
Write-Host "  更新完成!" -ForegroundColor Green

# 重启服务
Write-Host "[3/3] 重启服务..." -ForegroundColor Yellow
pm2 start game-management
Start-Sleep -Seconds 2
pm2 status

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  更新完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
