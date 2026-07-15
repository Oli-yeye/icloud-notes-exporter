@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0.."
title iCloud Notes Exporter
echo ============================================
echo   iCloud Notes to Markdown Exporter
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install from https://nodejs.org/
    pause
    exit /b 1
)

:: Check ws module
node -e "require('ws')" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing dependencies...
    call npm install --silent
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

:: Start or check Edge with remote debugging enabled
echo Starting or checking Edge debug browser...
call npm run start-edge
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start Edge with remote debugging enabled.
    pause
    exit /b 1
)

echo.
echo If iCloud asks you to sign in, finish login in the browser first.
echo Make sure you can see the iCloud Notes three-column page.
echo Then come back here and press any key to continue.
pause >nul

:: Run environment check
echo Checking environment...
node src/verify-env.mjs
if %errorlevel% neq 0 (
    echo.
    echo Fix the issues above, then try again.
    pause
    exit /b 1
)

:: Start export
echo.
echo Starting export...
node src/main.mjs
pause
