@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" goto :install
if not exist "node_modules\vite\package.json" goto :install
goto :launch
:install
call npm install --no-audit --no-fund
if errorlevel 1 (pause & exit /b 1)
:launch
call npm run dev
if errorlevel 1 pause
