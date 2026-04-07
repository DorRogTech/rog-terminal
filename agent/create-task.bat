@echo off
schtasks /create /tn "RogTerminalAgent" /tr "wscript.exe C:\Users\Dor\rog-terminal\agent\run-hidden.vbs" /sc onlogon /rl highest /f
echo.
echo Done! Agent will auto-start on login.
pause
