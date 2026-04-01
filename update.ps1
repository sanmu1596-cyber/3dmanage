# 3D游戏适配管理系统 - 一键更新脚本 (PowerShell)
# 用法: .\update.ps1

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  更新 3D管理系统..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 停止服务
Write-Host "[1/5] 停止服务..." -ForegroundColor Yellow
pm2 stop 3dmanage 2>$null

# 清理本地改动
Write-Host "[2/5] 清理本地改动..." -ForegroundColor Yellow
git checkout -- .
git clean -fd

# 拉取最新代码
Write-Host "[3/5] 拉取最新代码..." -ForegroundColor Yellow
git pull

# 检查是否有迁移脚本需要执行
$migrateScripts = Get-ChildItem -Path "migrate_*.js" -ErrorAction SilentlyContinue
if ($migrateScripts) {
    Write-Host "[3.5] 发现迁移脚本，逐个执行..." -ForegroundColor Magenta
    foreach ($script in $migrateScripts) {
        Write-Host "  执行: $($script.Name)" -ForegroundColor Magenta
        node $script.Name
    }
}

# 启动服务
Write-Host "[4/5] 启动服务..." -ForegroundColor Yellow
pm2 start 3dmanage

# 检查状态
Write-Host "[5/5] 检查服务状态..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
pm2 status 3dmanage

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  更新完成！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
