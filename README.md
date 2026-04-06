# Rog Terminal

Cross-platform collaborative Claude Code MCP client.

Multiple users can connect to the same MCP server from different devices (Android, iOS, Windows, Mac), see shared conversation history, and identify who sent each message.

## Features

- **Cross-platform**: Works on Android, iOS, Windows, Mac via web browser or PWA
- **Real-time collaboration**: Multiple users share the same MCP session
- **Full RTL support**: Native Hebrew/Arabic interface
- **User identification**: Each message shows username + device name
- **Secure**: JWT auth, bcrypt passwords, Helmet security headers
- **Chat history**: All conversations are persisted and shared

## Architecture

```
frontend/     React + Vite (RTL UI)
backend/      Node.js + Express + WebSocket + SQLite
```

## Quick Start

```bash
# Backend
cd backend
cp .env.example .env
npm install
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Tech Stack

- **Frontend**: React 18, Vite, WebSocket, CSS (RTL-first)
- **Backend**: Node.js, Express, ws, better-sqlite3, JWT, bcrypt
- **Protocol**: WebSocket for real-time, REST for auth/sessions

## Security

- Password hashing with bcrypt (12 rounds)
- JWT token authentication
- Helmet security headers
- CORS protection
- Input validation

---

Built by ROG-Tech
