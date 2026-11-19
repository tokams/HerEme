@echo off
setlocal
cd /d "%~dp0"
set "HEREME_PREVIEW=1"
call run.cmd
exit /b %errorlevel%
