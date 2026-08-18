@echo off
chcp 65001 >nul
schtasks /Run /TN "KI-Markt-Agent"
echo.
echo KI-Markt-Agent wurde gestartet.
pause
