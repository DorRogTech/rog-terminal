@echo off
echo.
echo   Installing Rog Terminal Agent as Windows Startup Task...
echo.

:: Create a VBS wrapper to run hidden (no cmd window)
echo Set WshShell = CreateObject("WScript.Shell") > "%APPDATA%\rog-agent-start.vbs"
echo WshShell.Run "cmd /c cd /d %~dp0 && node agent.js --server https://terminal.rog-tech.com --user dor@rog-tech.com --pass yovel1902avrahami", 0 >> "%APPDATA%\rog-agent-start.vbs"

:: Create scheduled task that runs at logon
schtasks /create /tn "RogTerminalAgent" /tr "\"%APPDATA%\rog-agent-start.vbs\"" /sc onlogon /rl highest /f

echo.
echo   Done! The Agent will start automatically when you log in.
echo   To remove: schtasks /delete /tn "RogTerminalAgent" /f
echo.
pause
