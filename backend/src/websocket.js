const { WebSocketServer } = require('ws');
const { verifyToken } = require('./auth');
const { stmts } = require('./db');
const { v4: uuidv4 } = require('uuid');

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Track connected clients: Map<ws, { user, sessionId }>
  const clients = new Map();

  function broadcast(sessionId, data, excludeWs = null) {
    const message = JSON.stringify(data);
    for (const [ws, info] of clients) {
      if (info.sessionId === sessionId && ws !== excludeWs && ws.readyState === 1) {
        ws.send(message);
      }
    }
  }

  function broadcastAll(data) {
    const message = JSON.stringify(data);
    for (const [ws] of clients) {
      if (ws.readyState === 1) ws.send(message);
    }
  }

  function getOnlineUsers(sessionId) {
    const users = [];
    const seen = new Set();
    for (const [, info] of clients) {
      if (info.sessionId === sessionId && !seen.has(info.user.id)) {
        seen.add(info.user.id);
        users.push({
          id: info.user.id,
          username: info.user.username,
          displayName: info.user.displayName,
          deviceName: info.deviceName || '',
        });
      }
    }
    return users;
  }

  wss.on('connection', (ws, req) => {
    // Extract token from query string
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const user = verifyToken(token);

    if (!user) {
      ws.close(4001, 'Authentication failed');
      return;
    }

    const deviceName = url.searchParams.get('device') || '';
    clients.set(ws, { user, sessionId: null, deviceName });

    // Update last seen
    stmts.updateLastSeen.run(deviceName, user.id);

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      handleMessage(ws, data, user, deviceName);
    });

    ws.on('close', () => {
      const info = clients.get(ws);
      if (info && info.sessionId) {
        broadcast(info.sessionId, {
          type: 'user_left',
          user: { id: user.id, username: user.username, displayName: user.displayName },
        }, ws);
      }
      clients.delete(ws);
    });

    ws.send(JSON.stringify({ type: 'connected', user: { id: user.id, username: user.username, displayName: user.displayName } }));
  });

  function handleMessage(ws, data, user, deviceName) {
    switch (data.type) {
      case 'join_session': {
        const { sessionId } = data;
        const session = stmts.getSession.get(sessionId);
        if (!session) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
          return;
        }
        const info = clients.get(ws);
        info.sessionId = sessionId;

        // Send chat history
        const messages = stmts.getMessages.all(sessionId);
        ws.send(JSON.stringify({ type: 'history', messages, sessionId }));

        // Notify others
        broadcast(sessionId, {
          type: 'user_joined',
          user: { id: user.id, username: user.username, displayName: user.displayName, deviceName },
        }, ws);

        // Send online users
        ws.send(JSON.stringify({ type: 'online_users', users: getOnlineUsers(sessionId) }));
        break;
      }

      case 'create_session': {
        const sessionId = uuidv4();
        const name = data.name || 'New Session';
        stmts.createSession.run(sessionId, name, user.id);
        const session = stmts.getSession.get(sessionId);

        ws.send(JSON.stringify({ type: 'session_created', session }));
        broadcastAll({ type: 'sessions_updated' });
        break;
      }

      case 'chat_message': {
        const info = clients.get(ws);
        if (!info || !info.sessionId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not in a session' }));
          return;
        }

        const { content } = data;
        if (!content || !content.trim()) return;

        // Save user message
        const result = stmts.addMessage.run(info.sessionId, user.id, 'user', content, deviceName);
        stmts.updateSessionTime.run(info.sessionId);

        const userMessage = {
          id: result.lastInsertRowid,
          session_id: info.sessionId,
          user_id: user.id,
          role: 'user',
          content,
          device_name: deviceName,
          display_name: user.displayName,
          username: user.username,
          created_at: new Date().toISOString(),
        };

        // Broadcast to all in session
        broadcast(info.sessionId, { type: 'new_message', message: userMessage });

        // TODO: Forward to MCP and stream response back
        // For now, echo that message was received
        break;
      }

      case 'typing': {
        const info = clients.get(ws);
        if (info && info.sessionId) {
          broadcast(info.sessionId, {
            type: 'typing',
            user: { id: user.id, displayName: user.displayName },
            isTyping: data.isTyping,
          }, ws);
        }
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
    }
  }

  return wss;
}

module.exports = { setupWebSocket };
