# 启动项目管理服务器
$ErrorActionPreference = "SilentlyContinue"

# 检查是否已有服务器在运行
$existingProcess = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($existingProcess) {
    Write-Host "服务器已在运行" -ForegroundColor Green
    exit
}

# 启动服务器
Write-Host "正在启动服务器..." -ForegroundColor Cyan
$process = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory "c:\Users\joesyang\WorkBuddy\20260324104822\project-management" -WindowStyle Minimized -PassThru

# 等待服务器启动
Start-Sleep -Seconds 2

# 检查服务器是否启动成功
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
    Write-Host "服务器启动成功！" -ForegroundColor Green
    Write-Host "请在浏览器中打开: http://localhost:3000" -ForegroundColor Yellow
    Write-Host "服务器进程ID: $($process.Id)" -ForegroundColor Cyan
} catch {
    Write-Host "服务器启动失败" -ForegroundColor Red
    Write-Host "请检查 server.log 查看错误信息" -ForegroundColor Red
}
