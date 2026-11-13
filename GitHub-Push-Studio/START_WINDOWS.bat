@echo off
setlocal
cd /d "%~dp0"
title GitHub Push Studio v1.0.1
color 0B
echo.
echo  ====================================
echo       GITHUB PUSH STUDIO v1.0.1
echo  ====================================
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is required. Install Node.js LTS from https://nodejs.org/en/download
  echo Then close this window and double-click START_WINDOWS.bat again.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js LTS with npm enabled.
  pause
  exit /b 1
)
if not exist "node_modules\electron\package.json" goto :install
if not exist "node_modules\vite\package.json" goto :install
if not exist "node_modules\react\package.json" goto :install
if not exist "node_modules\react-dom\package.json" goto :install
if not exist "node_modules\.bin\electron.cmd" goto :install
if not exist "node_modules\.bin\vite.cmd" goto :install
if not exist "node_modules\electron\dist\electron.exe" goto :install
echo [1/3] Dependencies already installed.
goto :build
:install
echo [1/3] Installing app dependencies for first launch...
call npm install --no-audit --no-fund
if errorlevel 1 goto :install_failed
:build
echo [2/3] Building interface...
call npm run build
if errorlevel 1 goto :failed
echo [3/3] Opening desktop app...
call npm run desktop
if errorlevel 1 goto :failed
exit /b 0
:install_failed
echo.
echo [ERROR] npm failed to install the app dependencies.
echo Check your internet connection and npm registry access.
echo If an ETARGET error names a package, the requested version is not available to npm.
echo Try extracting the latest GitHub Push Studio ZIP into a NEW folder.
echo.
goto :failed
:failed
echo.
echo [ERROR] Launch failed. See the details above.
pause
exit /b 1
