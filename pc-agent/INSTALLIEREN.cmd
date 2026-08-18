@echo off
chcp 65001 >nul
title KI-Markt-Agent installieren
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
