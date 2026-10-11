@echo off
rem Keep the window open so success messages and errors remain visible.
powershell.exe -NoLogo -NoProfile -NoExit -File "%~dp0configure-database.ps1"
