require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const { register, login, authMiddleware } = require('./auth');
const { stmts } = require('./db');
const { setupWebSocket } = require('./websocket');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static('../frontend/build'));

// === Auth Routes ===

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, displayName, deviceName } = req.body;
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'username, password, and displayName are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const result = await register(username, password, displayName, deviceName || '');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, deviceName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    const result = await login(username, password, deviceName || '');
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = stmts.getUserById.get(req.user.id);
  res.json({ user });
});

// === Session Routes ===

app.get('/api/sessions', authMiddleware, (req, res) => {
  const sessions = stmts.getAllSessions.all();
  res.json({ sessions });
});

app.post('/api/sessions', authMiddleware, (req, res) => {
  const id = uuidv4();
  const name = req.body.name || 'New Session';
  stmts.createSession.run(id, name, req.user.id);
  const session = stmts.getSession.get(id);
  res.json({ session });
});

app.get('/api/sessions/:id/messages', authMiddleware, (req, res) => {
  const messages = stmts.getMessages.all(req.params.id);
  res.json({ messages });
});

app.patch('/api/sessions/:id', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (name) stmts.renameSession.run(name, req.params.id);
  const session = stmts.getSession.get(req.params.id);
  res.json({ session });
});

// === Users Route ===

app.get('/api/users', authMiddleware, (req, res) => {
  const users = stmts.getAllUsers.all();
  res.json({ users });
});

// === Health check ===

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', name: 'Rog Terminal' });
});

// Setup WebSocket
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`🚀 Rog Terminal server running on port ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   API: http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close();
  process.exit(0);
});
