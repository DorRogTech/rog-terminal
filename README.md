# Rog Terminal

Cross-platform collaborative Claude Code MCP client. Multiple users can connect from different devices, share conversation history, and collaborate on AI-assisted projects together.

**Live:** https://rog-terminal.fly.dev

## Features

- **Cross-platform**: Android, iOS, Windows, Mac - via PWA, Capacitor, or Electron
- **Real-time collaboration**: Multiple users share the same sessions via WebSocket
- **Claude API integration**: Link your Claude API key for shared AI conversations
- **Multi-account support**: Each team member connects with their own Claude account
- **Full RTL support**: Native Hebrew/Arabic interface with IBM Plex Sans Hebrew
- **User identification**: Every message shows username + device name
- **Secure**: JWT auth, bcrypt passwords, Helmet security headers
- **PWA**: Install as a native app on any device from the browser
- **Desktop app**: Electron wrapper for Windows/Mac with system tray
- **Mobile app**: Capacitor-based native Android/iOS builds
- **Offline support**: Service Worker caching for offline access
- **Push notifications**: Browser notifications for new messages

## Architecture

```
frontend/     React + Vite (RTL-first UI, PWA, Capacitor)
backend/      Node.js + Express + WebSocket + SQLite
desktop/      Electron wrapper for Windows/Mac
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

## Multi-Account Collaboration

1. User A registers and creates a session
2. User A adds their Claude API key in Settings
3. User B registers (from any device) and joins the same session
4. All messages and Claude responses are shared in real-time
5. Each message shows who sent it and from which device

## Mobile (Android/iOS)

```bash
cd frontend
npm run build
npx cap add android   # or: npx cap add ios
npx cap sync
npx cap open android  # Opens in Android Studio
```

## Desktop (Windows/Mac)

```bash
cd desktop
npm install
npm start              # Dev mode
npm run build:win      # Build Windows installer
npm run build:mac      # Build Mac DMG
```

## Deploy

Deployed on Fly.io:

```bash
flyctl deploy
```

## Tech Stack

- **Frontend**: React 18, Vite, WebSocket, CSS (RTL-first), react-markdown
- **Backend**: Node.js, Express, ws, better-sqlite3, JWT, bcrypt
- **Mobile**: Capacitor 6 (Android/iOS)
- **Desktop**: Electron 33
- **Deploy**: Fly.io, Docker
- **Protocol**: WebSocket (real-time), REST (auth/sessions), MCP (AI tools)

## Security

- Password hashing with bcrypt (12 rounds)
- JWT token authentication (7-day expiry)
- Helmet security headers
- CORS protection
- Input validation and sanitization
- SQLite WAL mode for concurrent access
- Heartbeat-based dead connection detection

---

Built by ROG-Tech
