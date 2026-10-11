@echo off
cd /d "%~dp0..\..\.."
set "POSTIZ_PROCESS_ROLE=account"
"local-data\runtime\node-v22.23.3-win-x64\node.exe" --require "./var/local/windows/bootstrap.cjs" "var/local/account.cjs" create
echo.
pause
