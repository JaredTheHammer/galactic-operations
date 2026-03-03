@echo off
title Galactic Operations - Static Server
echo =========================================
echo   GALACTIC OPERATIONS - Quick Start
echo   (Serves pre-built files, no install needed)
echo =========================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Install from https://nodejs.org  (LTS recommended)
    echo.
    pause
    exit /b 1
)

:: Check if dist exists
if not exist "packages\client\dist\index.html" (
    echo [ERROR] Built files not found.
    echo Run START.bat first to build the project.
    echo.
    pause
    exit /b 1
)

echo [OK] Built files found
echo.
echo =========================================
echo   Starting static server on http://localhost:3000
echo   For mobile/tablet: http://YOUR_PC_IP:3000
echo   Press Ctrl+C to stop
echo =========================================
echo.

cd packages\client\dist
call npx serve -l 3000

:: If we get here, the server stopped
echo.
echo [INFO] Server stopped.
pause
