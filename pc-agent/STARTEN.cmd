@echo off
chcp 65001 >nul
title KI-Markt-Agent starten
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "E:\KI-Markt-Agent\start-agent.ps1"
echo.
pause
