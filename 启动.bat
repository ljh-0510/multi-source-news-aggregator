@echo off
chcp 65001 >nul
title 多元信息台 · 聚合服务
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 没有检测到 Node.js
  echo.
  echo   请先安装 Node.js LTS 版本: https://nodejs.org
  echo   安装后重新双击本文件即可。
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动聚合服务...
echo   启动后请访问: http://127.0.0.1:5178
echo   关闭本窗口即停止服务。
echo.

node server.js 5178

echo.
echo   服务已停止。
pause