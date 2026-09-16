@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Ringo Local Preview

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-preview.ps1" %*
set "RINGO_EXIT_CODE=%ERRORLEVEL%"

if not "%RINGO_EXIT_CODE%"=="0" (
  echo.
  echo 미리보기를 시작하지 못했습니다. 위의 안내를 확인하세요.
  pause
)

exit /b %RINGO_EXIT_CODE%
