@echo off
setlocal
cd /d "%~dp0"
title HerEme - Local Forum

echo.
echo  ======================================================
echo                 HerEme - Local Forum
echo  ======================================================
echo.
where node.exe >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Node.js not found. Install Node.js 24 LTS:
  echo          https://nodejs.org/
  echo  Then close and reopen this window and run again.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo  [ERROR] Node.js 24 or newer is required.
  node --version
  pause
  exit /b 1
)

node scripts\ensure-deps.js
if errorlevel 1 (
  echo [ERROR] Dependency check failed.
  pause
  exit /b 1
)

echo.
echo  Starting HerEme...
echo  Worktrees use preview data and start at port 3001.
echo  If a port is busy, the server tries the next port and prints the actual URL.
echo  Keep this window open while the forum is running.
echo  Press Ctrl+C to stop it.
echo.
node server\index.js
if errorlevel 1 (
  echo.
  echo  The server stopped with an error.
  pause
  exit /b 1
)
pause
