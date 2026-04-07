#!/bin/bash
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║         ROG TERMINAL - START          ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Start backend in background
echo "Starting backend..."
cd "$(dirname "$0")/backend"
npm run dev &
BACKEND_PID=$!

sleep 2

# Start frontend in background
echo "Starting frontend..."
cd "$(dirname "$0")/frontend"
npm run dev &
FRONTEND_PID=$!

sleep 2

echo ""
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo "  MCP:      Auto-started with Claude Code"
echo ""
echo "  Press Ctrl+C to stop"

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
