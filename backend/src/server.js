require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { register, login, authMiddleware } = require('./auth');
const { stmts } = require('./db');
const { setupWebSocket } = require('./websocket');
const mcpBridge = require('./mcp-bridge');
const claudeApi = require('./claude-api');
const claudeCli = require('./claude-cli');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Serve frontend static files in production
const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'build');
app.use(express.static(frontendPath));

// === Auth Routes ===

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, displayName, deviceName } = req.body;
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'username, password, and displayName are required' });
    }
    if (username.length < 2 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be 2-30 characters' });
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
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// === Session Routes ===

app.get('/api/sessions', authMiddleware, (req, res) => {
  const sessions = stmts.getAllSessions.all();
  res.json({ sessions });
});

app.post('/api/sessions', authMiddleware, (req, res) => {
  const id = uuidv4();
  const name = (req.body.name || 'New Session').slice(0, 100);
  stmts.createSession.run(id, name, req.user.id);
  const session = stmts.getSession.get(id);
  res.json({ session });
});

app.get('/api/sessions/:id', authMiddleware, (req, res) => {
  const session = stmts.getSession.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ session });
});

app.get('/api/sessions/:id/messages', authMiddleware, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  const messages = stmts.getMessages.all(req.params.id);
  res.json({ messages: messages.slice(-limit) });
});

app.patch('/api/sessions/:id', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (name) stmts.renameSession.run(name.slice(0, 100), req.params.id);
  const session = stmts.getSession.get(req.params.id);
  res.json({ session });
});

app.delete('/api/sessions/:id', authMiddleware, (req, res) => {
  const session = stmts.getSession.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  stmts.deleteSessionMessages.run(req.params.id);
  stmts.deleteSession.run(req.params.id);
  res.json({ ok: true });
});

// === Users Route ===

app.get('/api/users', authMiddleware, (req, res) => {
  const users = stmts.getAllUsers.all();
  res.json({ users });
});

// === MCP Bridge Routes ===

app.get('/api/mcp/status', authMiddleware, (req, res) => {
  res.json({
    ready: mcpBridge.isReady(),
    tools: mcpBridge.getTools().map(t => ({ name: t.name, description: t.description })),
  });
});

app.post('/api/mcp/start', authMiddleware, async (req, res) => {
  try {
    await mcpBridge.start();
    res.json({ ok: true, tools: mcpBridge.getTools().length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mcp/stop', authMiddleware, (req, res) => {
  mcpBridge.stop();
  res.json({ ok: true });
});

app.post('/api/mcp/call-tool', authMiddleware, async (req, res) => {
  try {
    const { name, args } = req.body;
    if (!name) return res.status(400).json({ error: 'Tool name is required' });
    const result = await mcpBridge.callTool(name, args || {});
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mcp/tools', authMiddleware, (req, res) => {
  res.json({ tools: mcpBridge.getTools() });
});

// === Claude API Routes ===

app.post('/api/claude/configure', authMiddleware, (req, res) => {
  try {
    const { sessionId, apiKey, model, systemPrompt } = req.body;
    if (!sessionId || !apiKey) {
      return res.status(400).json({ error: 'sessionId and apiKey are required' });
    }
    claudeApi.configureSession(sessionId, { apiKey, model, systemPrompt });
    res.json({ ok: true, message: 'Claude API configured for session' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/claude/send', authMiddleware, async (req, res) => {
  try {
    const { sessionId, messages } = req.body;
    if (!sessionId || !messages) {
      return res.status(400).json({ error: 'sessionId and messages are required' });
    }

    const response = await claudeApi.sendMessage(sessionId, messages);

    // Save assistant response to DB
    const result = stmts.addMessage.run(sessionId, null, 'assistant', response, '');
    stmts.updateSessionTime.run(sessionId);

    const assistantMsg = {
      id: result.lastInsertRowid,
      session_id: sessionId,
      user_id: null,
      role: 'assistant',
      content: response,
      device_name: '',
      display_name: 'Claude',
      username: null,
      created_at: new Date().toISOString(),
    };

    // Broadcast to all users in session
    if (wss.broadcastToSession) {
      wss.broadcastToSession(sessionId, { type: 'new_message', message: assistantMsg });
    }

    res.json({ message: assistantMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/claude/status', authMiddleware, (req, res) => {
  res.json({ sessions: claudeApi.getStatus() });
});

// === Claude CLI Routes ===

app.get('/api/claude-cli/status', authMiddleware, async (req, res) => {
  const available = await claudeCli.isAvailable();
  res.json({
    available,
    ...claudeCli.getStatus(),
  });
});

app.post('/api/claude-cli/reset', authMiddleware, (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) {
    claudeCli.resetSession(sessionId);
  }
  res.json({ ok: true });
});

// === Health check ===

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    name: 'Rog Terminal',
    mcpReady: mcpBridge.isReady(),
    claudeCliAvailable: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
      if (err) res.status(200).send('Rog Terminal - Frontend not built yet. Run: cd frontend && npm run build');
    });
  }
});

// Setup WebSocket
const wss = setupWebSocket(server);

// Forward MCP bridge events to WebSocket
mcpBridge.on('log', (text) => {
  if (wss.broadcastAll) {
    wss.broadcastAll({ type: 'mcp_log', text });
  }
});

mcpBridge.on('ready', ({ tools }) => {
  console.log(`[MCP] Ready with ${tools.length} tools`);
  if (wss.broadcastAll) {
    wss.broadcastAll({
      type: 'mcp_ready',
      tools: tools.map(t => ({ name: t.name, description: t.description })),
    });
  }
});

mcpBridge.on('disconnected', () => {
  if (wss.broadcastAll) {
    wss.broadcastAll({ type: 'mcp_disconnected' });
  }
});

// Auto-start MCP bridge on server start (local mode only)
if (!process.env.FLY_APP_NAME) {
  mcpBridge.start().catch((err) => {
    console.log('[MCP] Auto-start failed (this is OK if claude is not installed):', err.message);
    console.log('[MCP] You can start it manually via POST /api/mcp/start');
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║         ROG TERMINAL SERVER           ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  API:       http://localhost:${PORT}/api`);
  console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`  Health:    http://localhost:${PORT}/api/health`);
  console.log(`  MCP:       ${mcpBridge.isReady() ? 'Connected' : 'Starting...'}`);
  console.log('');
});

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down...');
  mcpBridge.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
