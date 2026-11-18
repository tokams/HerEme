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

if not exist ".hereme-deps-ready" (
  echo  Installing dependencies - first launch only...
  if exist "package-lock.json" (
    call npm.cmd ci --no-audit --no-fund
  ) else (
    call npm.cmd install --no-audit --no-fund
  )
  if errorlevel 1 (
    echo  [ERROR] npm installation failed.
    pause
    exit /b 1
  )
  type nul > ".hereme-deps-ready"
)

echo.
echo  Starting HerEme...
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
