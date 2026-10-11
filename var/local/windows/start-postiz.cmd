@echo off
cd /d "%~dp0..\..\.."
"local-data\runtime\node-v22.23.3-win-x64\node.exe" "var/local/windows/start-local.cjs"
echo.
pause
