@echo off
echo.
echo   ╔══════════════════════════════════════╗
echo   ║         ROG TERMINAL - START          ║
echo   ╚══════════════════════════════════════╝
echo.

:: Start backend
echo Starting backend server...
cd /d "%~dp0backend"
start "Rog Terminal Backend" cmd /k "npm run dev"

:: Wait for backend to start
timeout /t 3 /nobreak > nul

:: Start frontend dev server
echo Starting frontend...
cd /d "%~dp0frontend"
start "Rog Terminal Frontend" cmd /k "npm run dev"

:: Wait and open browser
timeout /t 3 /nobreak > nul
echo.
echo   Opening http://localhost:5173 ...
start http://localhost:5173

echo.
echo   Backend: http://localhost:3001
echo   Frontend: http://localhost:5173
echo   MCP: Auto-started with Claude Code
echo.
echo   Press any key to close this window...
pause > nul
