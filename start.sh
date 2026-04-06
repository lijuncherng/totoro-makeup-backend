#!/bin/bash

# 龙猫补跑海外后端服务启动脚本

echo "🚀 启动龙猫补跑海外后端服务..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 检查环境变量
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "📝 复制环境变量配置..."
        cp .env.example .env
        echo "⚠️  请编辑 .env 文件填入正确的 Supabase 配置"
    fi
fi

# 启动服务
echo "▶️  启动服务..."
npm run dev
