const { WebSocketServer } = require('ws');
const { verifyToken } = require('./auth');
const { stmts } = require('./db');
const { v4: uuidv4 } = require('uuid');
const claudeApi = require('./claude-api');
const claudeCli = require('./claude-cli');
const sharedTerminal = require('./shared-terminal');

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Track connected clients: Map<ws, { user, sessionId, deviceName }>
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

  function getAllOnlineUsers() {
    const users = [];
    const seen = new Set();
    for (const [, info] of clients) {
      const key = `${info.user.id}-${info.deviceName}`;
      if (!seen.has(key)) {
        seen.add(key);
        users.push({
          id: info.user.id,
          username: info.user.username,
          displayName: info.user.displayName,
          deviceName: info.deviceName || '',
          sessionId: info.sessionId,
        });
      }
    }
    return users;
  }

  // Heartbeat to detect dead connections
  const heartbeatInterval = setInterval(() => {
    for (const [ws, info] of clients) {
      if (info.isAlive === false) {
        clients.delete(ws);
        ws.terminate();
        continue;
      }
      info.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const user = verifyToken(token);

    if (!user) {
      ws.close(4001, 'Authentication failed');
      return;
    }

    const deviceName = url.searchParams.get('device') || '';
    clients.set(ws, { user, sessionId: null, deviceName, isAlive: true });

    stmts.updateLastSeen.run(deviceName, user.id);

    ws.on('pong', () => {
      const info = clients.get(ws);
      if (info) info.isAlive = true;
    });

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
          timestamp: new Date().toISOString(),
        }, ws);

        // Send updated online users list
        setTimeout(() => {
          const onlineUsers = getOnlineUsers(info.sessionId);
          broadcast(info.sessionId, { type: 'online_users', users: onlineUsers });
        }, 100);
      }
      clients.delete(ws);
    });

    ws.send(JSON.stringify({
      type: 'connected',
      user: { id: user.id, username: user.username, displayName: user.displayName },
      serverTime: new Date().toISOString(),
    }));
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

        // Leave previous session if any
        const info = clients.get(ws);
        if (info.sessionId && info.sessionId !== sessionId) {
          broadcast(info.sessionId, {
            type: 'user_left',
            user: { id: user.id, username: user.username, displayName: user.displayName },
          }, ws);
        }

        info.sessionId = sessionId;

        // Send chat history
        const messages = stmts.getMessages.all(sessionId);
        ws.send(JSON.stringify({ type: 'history', messages, sessionId }));

        // Notify others
        broadcast(sessionId, {
          type: 'user_joined',
          user: { id: user.id, username: user.username, displayName: user.displayName, deviceName },
          timestamp: new Date().toISOString(),
        }, ws);

        // Send online users
        ws.send(JSON.stringify({ type: 'online_users', users: getOnlineUsers(sessionId) }));
        break;
      }

      case 'create_session': {
        const sessionId = uuidv4();
        const name = (data.name || 'New Session').slice(0, 100);
        stmts.createSession.run(sessionId, name, user.id);
        const session = stmts.getSession.get(sessionId);

        ws.send(JSON.stringify({ type: 'session_created', session }));
        broadcastAll({ type: 'sessions_updated' });
        break;
      }

      case 'delete_session': {
        const { sessionId } = data;
        const session = stmts.getSession.get(sessionId);
        if (!session) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
          return;
        }
        stmts.deleteSessionMessages.run(sessionId);
        stmts.deleteSession.run(sessionId);
        broadcastAll({ type: 'session_deleted', sessionId });
        broadcastAll({ type: 'sessions_updated' });
        break;
      }

      case 'rename_session': {
        const { sessionId, name } = data;
        if (!name || !name.trim()) return;
        stmts.renameSession.run(name.slice(0, 100), sessionId);
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

        // Broadcast to ALL in session (including sender for confirmation)
        broadcast(info.sessionId, { type: 'new_message', message: userMessage });

        // Send to Claude - server CLI, agent, or user's API key
        {
          const sessionId = info.sessionId;

          // Check if any agent is connected (any session)
          let agentWs = null;
          for (const [clientWs, clientInfo] of clients) {
            if (clientInfo.deviceName?.startsWith('Agent-') && clientWs.readyState === 1) {
              agentWs = clientWs;
              // If agent is not in this session, move it
              if (clientInfo.sessionId !== sessionId) {
                clientInfo.sessionId = sessionId;
                console.log(`[Chat] Moved agent to session ${sessionId}`);
              }
              break;
            }
          }

          // If an agent is connected, forward the message to it
          if (agentWs) {
            console.log(`[Chat] User "${user.displayName}" sent: "${content.slice(0, 80)}..." -> agent will handle`);
            // The agent already received the new_message broadcast, it will respond
            break;
          }

          console.log(`[Chat] User "${user.displayName}" sent: "${content.slice(0, 80)}..." -> calling Claude CLI`);

          // Show typing indicator
          broadcast(sessionId, {
            type: 'typing',
            user: { id: -1, displayName: 'Claude' },
            isTyping: true,
          });

          // Try Claude CLI first (uses server's Claude subscription)
          // Falls back to user's personal API key if CLI fails
          let responsePromise = claudeCli.sendMessage(sessionId, content)
            .then(r => r.text)
            .catch((cliErr) => {
              console.log(`[Chat] CLI failed: ${cliErr.message}, trying user API key...`);
              // Fallback: check if the user has their own API key
              const dbUser = stmts.getUserById.get(user.id);
              if (dbUser && dbUser.claude_api_key) {
                // Use user's personal API key
                if (!claudeApi.isConfigured(sessionId)) {
                  claudeApi.configureSession(sessionId, { apiKey: dbUser.claude_api_key });
                }
                const recentMsgs = stmts.getMessages.all(sessionId)
                  .slice(-20)
                  .map(m => ({ role: m.role, content: m.content }));
                return claudeApi.sendMessage(sessionId, recentMsgs);
              }
              throw new Error('Claude CLI not available and no API key configured. Add your API key in Settings.');
            });

          responsePromise
            .then((response) => {
              console.log(`[Chat] Claude responded: "${(response || '').slice(0, 100)}..."`);
              const aResult = stmts.addMessage.run(sessionId, null, 'assistant', response, '');
              stmts.updateSessionTime.run(sessionId);

              broadcast(sessionId, {
                type: 'typing',
                user: { id: -1, displayName: 'Claude' },
                isTyping: false,
              });
              broadcast(sessionId, {
                type: 'new_message',
                message: {
                  id: aResult.lastInsertRowid,
                  session_id: sessionId,
                  user_id: null,
                  role: 'assistant',
                  content: response,
                  device_name: '',
                  display_name: 'Claude',
                  username: null,
                  created_at: new Date().toISOString(),
                },
              });
            })
            .catch((err) => {
              console.error(`[Chat] Claude error:`, err.message);
              broadcast(sessionId, {
                type: 'typing',
                user: { id: -1, displayName: 'Claude' },
                isTyping: false,
              });
              broadcast(sessionId, {
                type: 'new_message',
                message: {
                  id: Date.now(),
                  session_id: sessionId,
                  user_id: null,
                  role: 'system',
                  content: `Error: ${err.message}`,
                  device_name: '',
                  display_name: 'System',
                  username: null,
                  created_at: new Date().toISOString(),
                },
              });
            });
        }
        break;
      }

      case 'system_message': {
        // Save a system/assistant message (from MCP response)
        const info = clients.get(ws);
        if (!info || !info.sessionId) return;

        const { content, role } = data;
        if (!content || !['assistant', 'system'].includes(role)) return;

        const result = stmts.addMessage.run(info.sessionId, null, role, content, '');
        stmts.updateSessionTime.run(info.sessionId);

        const msg = {
          id: result.lastInsertRowid,
          session_id: info.sessionId,
          user_id: null,
          role,
          content,
          device_name: '',
          display_name: role === 'assistant' ? 'Claude' : 'System',
          username: null,
          created_at: new Date().toISOString(),
        };

        broadcast(info.sessionId, { type: 'new_message', message: msg });
        break;
      }

      case 'typing': {
        const info = clients.get(ws);
        if (info && info.sessionId) {
          broadcast(info.sessionId, {
            type: 'typing',
            user: { id: user.id, displayName: user.displayName },
            isTyping: !!data.isTyping,
          }, ws);
        }
        break;
      }

      case 'get_online_users': {
        ws.send(JSON.stringify({
          type: 'all_online_users',
          users: getAllOnlineUsers(),
        }));
        break;
      }

      // === Shared Terminal (full interactive Claude) ===

      case 'terminal_open':
      case 'terminal_input':
      case 'terminal_resize':
      case 'terminal_kill': {
        const info = clients.get(ws);
        if (!info || !info.sessionId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Join a session first' }));
          return;
        }
        const sessionId = info.sessionId;

        // If local PTY exists for this session, use it
        if (sharedTerminal.has(sessionId)) {
          if (data.type === 'terminal_open') {
            const history = sharedTerminal.getHistory(sessionId);
            if (history) ws.send(JSON.stringify({ type: 'terminal_output', data: history }));
            ws.send(JSON.stringify({ type: 'terminal_ready', sessionId }));
          } else if (data.type === 'terminal_input') {
            sharedTerminal.write(sessionId, data.data);
          } else if (data.type === 'terminal_resize') {
            sharedTerminal.resize(sessionId, data.cols || 120, data.rows || 40);
          } else if (data.type === 'terminal_kill') {
            sharedTerminal.kill(sessionId);
            broadcast(sessionId, { type: 'terminal_closed' });
          }
          break;
        }

        // Find any connected Agent (any session)
        let agentWs = null;
        for (const [clientWs, clientInfo] of clients) {
          if (clientInfo.deviceName?.startsWith('Agent-') && clientWs !== ws && clientWs.readyState === 1) {
            agentWs = clientWs;
            // Move agent to this session
            clientInfo.sessionId = sessionId;
            break;
          }
        }

        if (agentWs) {
          agentWs.send(JSON.stringify(data));
          console.log(`[Terminal] Forwarded ${data.type} to Agent for session ${sessionId}`);
        } else {
          // Try local PTY as last resort
          if (data.type === 'terminal_open') {
            const created = sharedTerminal.create(sessionId, { cols: data.cols || 120, rows: data.rows || 40 });
            if (created) {
              ws.send(JSON.stringify({ type: 'terminal_ready', sessionId }));
              console.log(`[Terminal] Local PTY for session ${sessionId}`);
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'No Agent connected. Start the Agent on your machine.' }));
            }
          }
        }
        break;
      }

      // Agent sends terminal output back — broadcast to all users in session
      case 'terminal_output':
      case 'terminal_ready':
      case 'terminal_closed':
      case 'projects_list':
      case 'project_selected': {
        const info = clients.get(ws);
        if (info && info.sessionId) {
          broadcast(info.sessionId, data, ws);
        }
        break;
      }

      // Forward project commands to agent
      case 'list_projects':
      case 'select_project': {
        let agentWs = null;
        for (const [clientWs, clientInfo] of clients) {
          if (clientInfo.deviceName?.startsWith('Agent-') && clientWs !== ws && clientWs.readyState === 1) {
            agentWs = clientWs;
            break;
          }
        }
        if (agentWs) {
          agentWs.send(JSON.stringify(data));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'No Agent connected' }));
        }
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
    }
  }

  // Forward terminal output to all WebSocket clients in the session
  sharedTerminal.on('output', ({ sessionId, data: termData }) => {
    broadcast(sessionId, { type: 'terminal_output', data: termData });
  });

  sharedTerminal.on('exit', ({ sessionId }) => {
    broadcast(sessionId, { type: 'terminal_closed' });
  });

  // Expose broadcast function for external use (MCP proxy)
  wss.broadcastToSession = broadcast;
  wss.broadcastAll = broadcastAll;
  wss.getOnlineUsers = getOnlineUsers;

  return wss;
}

module.exports = { setupWebSocket };
