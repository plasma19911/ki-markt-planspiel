@echo off
chcp 65001 >nul
title KI-Markt-Agent Cloudflare Secret
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0set-cloudflare-secret.ps1"
echo.
pause
