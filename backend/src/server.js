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
    const { username, email, password, displayName, deviceName } = req.body;
    if (!username || !email || !password || !displayName) {
      return res.status(400).json({ error: 'username, email, password, and displayName are required' });
    }
    if (username.length < 2 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be 2-30 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const result = await register(username, email, password, displayName, deviceName || '');
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

// === Claude Connection Status ===

// Check Claude connection - CLI locally, Agent on cloud
app.get('/api/claude/status', authMiddleware, async (req, res) => {
  try {
    const isCloud = !!process.env.FLY_APP_NAME;
    const agent = wss.isAgentConnected ? wss.isAgentConnected() : { connected: false };
    if (isCloud) {
      // On cloud: check if Agent is connected (Agent = local Claude via MCP)
      const dbUser = stmts.getUserById.get(req.user.id);
      const hasApiKey = !!(dbUser?.claude_api_key);
      res.json({
        agent,
        apiKey: { ready: hasApiKey },
        mode: 'cloud',
      });
    } else {
      // Local: check CLI + Agent
      const cliAvailable = await claudeCli.isAvailable();
      res.json({
        cli: { ready: cliAvailable },
        agent,
        mode: 'local',
      });
    }
  } catch (err) {
    res.json({ cli: { ready: false }, agent: { connected: false }, mode: process.env.FLY_APP_NAME ? 'cloud' : 'local' });
  }
});

// === MCP Bridge Routes ===

app.get('/api/mcp/status', authMiddleware, async (req, res) => {
  // Real ping - actually verify MCP is responsive
  const ping = await mcpBridge.ping();
  res.json({
    ready: ping.ok,
    tools: ping.ok ? mcpBridge.getTools().map(t => ({ name: t.name, description: t.description })) : [],
    error: ping.error || null,
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

// === Claude OAuth (same flow as Claude Code CLI) ===

const CLAUDE_OAUTH = {
  CLIENT_ID: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  AUTHORIZE_URL: 'https://claude.com/cai/oauth/authorize',
  TOKEN_URL: 'https://platform.claude.com/v1/oauth/token',
  SCOPES: 'user:inference user:profile org:create_api_key',
};

// Store PKCE verifiers per user (in-memory, keyed by state)
const oauthStates = new Map();

// Step 1: Generate OAuth URL for user to open
app.post('/api/claude/oauth/start', authMiddleware, async (req, res) => {
  const crypto = require('crypto');

  // PKCE: generate code_verifier and code_challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  // Store verifier for token exchange
  oauthStates.set(state, { codeVerifier, userId: req.user.id, createdAt: Date.now() });

  // Clean old states (>10 min)
  for (const [k, v] of oauthStates) {
    if (Date.now() - v.createdAt > 600000) oauthStates.delete(k);
  }

  // Build the redirect_uri - the callback on our server
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${protocol}://${host}/api/claude/oauth/callback`;

  const authUrl = `${CLAUDE_OAUTH.AUTHORIZE_URL}?` +
    `client_id=${encodeURIComponent(CLAUDE_OAUTH.CLIENT_ID)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(CLAUDE_OAUTH.SCOPES)}` +
    `&state=${state}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;

  res.json({ authUrl, state });
});

// Step 2: OAuth callback - exchange code for token
app.get('/api/claude/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  const stored = oauthStates.get(state);
  if (!stored) {
    return res.status(400).send('Invalid or expired state. Try again.');
  }
  oauthStates.delete(state);

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${protocol}://${host}/api/claude/oauth/callback`;

  try {
    // Exchange code for token
    const tokenRes = await fetch(CLAUDE_OAUTH.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: CLAUDE_OAUTH.CLIENT_ID,
        code,
        code_verifier: stored.codeVerifier,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[OAuth] Token exchange failed:', tokenData);
      return res.status(400).send(`OAuth failed: ${tokenData.error || 'unknown error'}`);
    }

    // Save the OAuth token as the user's API key
    const apiKey = tokenData.access_token;
    stmts.updateApiKey.run(apiKey, stored.userId);
    console.log(`[OAuth] User ${stored.userId} authenticated with Claude OAuth`);

    // Redirect back to the app with success
    res.send(`
      <!DOCTYPE html>
      <html dir="rtl"><head><meta charset="utf-8"><title>Claude Connected!</title>
      <style>body{background:#0a0e17;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
      .box{text-align:center;padding:40px}.ok{color:#22c55e;font-size:48px;margin-bottom:16px}</style></head>
      <body><div class="box"><div class="ok">&#10003;</div><h2>Claude מחובר!</h2><p>אפשר לסגור את הדף ולחזור ל-ROG Terminal</p>
      <script>setTimeout(()=>window.close(),2000)</script></div></body></html>
    `);

    // Broadcast updated status
    if (wss.broadcastAll) {
      wss.broadcastAll({ type: 'claude_status', cli: { ready: false }, agent: wss.isAgentConnected(), apiKey: { ready: true }, mode: process.env.FLY_APP_NAME ? 'cloud' : 'local' });
    }
  } catch (err) {
    console.error('[OAuth] Error:', err.message);
    res.status(500).send(`OAuth error: ${err.message}`);
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

// === User API Key ===

app.post('/api/auth/api-key', authMiddleware, (req, res) => {
  const { apiKey } = req.body;
  stmts.updateApiKey.run(apiKey || '', req.user.id);
  res.json({ ok: true });
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

// Broadcast Claude connection status to all clients
let lastClaudeStatus = null;
const isCloud = !!process.env.FLY_APP_NAME;

async function checkAndBroadcastClaudeStatus() {
  try {
    const agent = wss.isAgentConnected ? wss.isAgentConnected() : { connected: false };
    let status;
    if (isCloud) {
      status = { type: 'claude_status', agent, mode: 'cloud' };
    } else {
      const cliReady = await claudeCli.isAvailable();
      status = { type: 'claude_status', cli: { ready: cliReady }, agent, mode: 'local' };
    }
    const key = `${status.agent.connected}-${status.cli?.ready || false}`;
    if (key !== lastClaudeStatus) {
      lastClaudeStatus = key;
      console.log(`[Claude Status] Agent=${status.agent.connected}, CLI=${status.cli?.ready || 'N/A'}, mode=${status.mode}`);
      if (wss.broadcastAll) wss.broadcastAll(status);
    }
  } catch (err) {
    console.error('[Claude Status] Check failed:', err.message);
  }
}

mcpBridge.on('ready', ({ tools }) => {
  console.log(`[MCP] Ready with ${tools.length} tools`);
  checkAndBroadcastClaudeStatus();
});

mcpBridge.on('disconnected', () => {
  checkAndBroadcastClaudeStatus();
});

// Periodic health check every 30 seconds
setInterval(checkAndBroadcastClaudeStatus, 30000);

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
