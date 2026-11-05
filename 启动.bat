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
echo.
echo   [1] 仅本机访问     →  http://127.0.0.1:5178
echo   [2] 允许手机访问   →  http://192.168.x.x:5178  (同一 Wi-Fi 下)
echo.
choice /c 12 /n /t 8 /d 1 /m "请选择 [1/2]（8 秒后默认 1）: "
if errorlevel 2 goto lanmode

echo.
echo   启动后请访问: http://127.0.0.1:5178
echo   关闭本窗口即停止服务。
echo.

node server.js 5178

echo.
echo   服务已停止。
pause
exit /b 0

:lanmode
echo.
echo   正在以局域网模式启动...
echo   启动后请用手机浏览器访问下方显示的地址。
echo   ! 同一 Wi-Fi 下的其他设备也能访问，仅建议在可信网络中使用。
echo   关闭本窗口即停止服务。
echo.

node server.js 5178 --host=0.0.0.0

echo.
echo   服务已停止。
pause
