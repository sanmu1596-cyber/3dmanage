#!/bin/bash
# 3D游戏适配管理系统 - 一键更新脚本
# 用法: bash update.sh

set -e

echo "========================================="
echo "  🔄 开始更新 3D管理系统..."
echo "========================================="

# 停止服务
echo "[1/5] 停止服务..."
pm2 stop 3dmanage 2>/dev/null || true

# 清理本地改动
echo "[2/5] 清理本地改动..."
git checkout -- .
git clean -fd

# 拉取最新代码
echo "[3/5] 拉取最新代码..."
git pull

# 检查是否有迁移脚本需要执行
if ls migrate_*.js 1>/dev/null 2>&1; then
    echo "[3.5] 发现迁移脚本，逐个执行..."
    for script in migrate_*.js; do
        echo "  执行: $script"
        node "$script"
    done
fi

# 启动服务
echo "[4/5] 启动服务..."
pm2 start 3dmanage

# 检查状态
echo "[5/5] 检查服务状态..."
sleep 2
pm2 status 3dmanage

echo ""
echo "========================================="
echo "  ✅ 更新完成！"
echo "========================================="
