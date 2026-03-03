@echo off
setlocal enabledelayedexpansion
title Galactic Operations - Dev Server
cd /d "%~dp0"

echo.
echo  =============================================
echo    GALACTIC OPERATIONS
echo    Tactical Campaign Game Prototype
echo  =============================================
echo.

:: ---------- Node.js ----------
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found on PATH.
    echo          Install from https://nodejs.org ^(LTS^)
    goto :fail
)
for /f "delims=" %%v in ('node -v') do echo  [OK] Node %%v

:: ---------- pnpm ----------
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo  [INFO] pnpm not found, installing via npm...
    call npm install -g pnpm
    if !errorlevel! neq 0 (
        echo  [ERROR] Could not install pnpm.
        echo          Run manually: npm install -g pnpm
        goto :fail
    )
)
for /f "delims=" %%v in ('pnpm -v') do echo  [OK] pnpm %%v

:: ---------- Dependencies ----------
if not exist "node_modules" (
    echo.
    echo  [INFO] First run -- installing dependencies...
    call pnpm install
    if !errorlevel! neq 0 (
        echo  [ERROR] pnpm install failed.
        echo          Delete node_modules + pnpm-lock.yaml and retry.
        goto :fail
    )
    echo  [OK] Dependencies installed
) else (
    echo  [OK] node_modules present
)

:: ---------- Launch ----------
echo.
echo  =============================================
echo    Starting Vite dev server...
echo    Local:   http://localhost:5173
echo    Network: http://YOUR_PC_IP:5173
echo    Press Ctrl+C to stop the server
echo  =============================================
echo.

:: Run and capture exit code
call pnpm dev
set EXIT_CODE=!errorlevel!

echo.
if !EXIT_CODE! neq 0 (
    echo  [ERROR] Dev server exited with code !EXIT_CODE!
) else (
    echo  [INFO] Dev server stopped.
)
echo.
echo  If the server never started, try these steps:
echo    1. Open PowerShell in this folder
echo    2. Run: pnpm install
echo    3. Run: pnpm dev
echo    4. Check the error output above
echo.
goto :fail

:fail
echo  Press any key to close this window...
pause >nul
exit /b 1
