@echo off
chcp 65001 > nul
echo ============================================
echo   龙猫补跑海外后端服务启动脚本 (Windows)
echo ============================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ 错误: 未找到 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)

REM 检查依赖
if not exist "node_modules" (
    echo 📦 安装依赖...
    call npm install
)

REM 检查环境变量
if not exist ".env" (
    if exist ".env.example" (
        echo 📝 复制环境变量配置...
        copy .env.example .env
        echo ⚠️  请编辑 .env 文件填入正确的 Supabase 配置
    )
)

echo.
echo ▶️  启动服务...
echo.

REM 启动开发服务器
npm run dev

pause
