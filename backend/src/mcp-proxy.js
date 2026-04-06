const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class McpProxy extends EventEmitter {
  constructor() {
    super();
    this.processes = new Map(); // sessionId -> { proc, buffer, messageId }
  }

  /**
   * Connect to an MCP server via stdio transport.
   * Returns an event emitter for the session.
   */
  connect(sessionId, command, args = []) {
    if (this.processes.has(sessionId)) {
      const existing = this.processes.get(sessionId);
      if (existing.proc && !existing.proc.killed) {
        return existing;
      }
    }

    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: true,
    });

    const session = {
      proc,
      buffer: '',
      messageId: 1,
      pendingRequests: new Map(),
    };

    // Parse JSON-RPC responses from stdout
    proc.stdout.on('data', (chunk) => {
      session.buffer += chunk.toString();
      this._parseMessages(sessionId, session);
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      this.emit('stderr', { sessionId, text });
    });

    proc.on('error', (err) => {
      console.error(`MCP process error [${sessionId}]:`, err.message);
      this.emit('process_error', { sessionId, error: err.message });
      this.processes.delete(sessionId);
    });

    proc.on('exit', (code, signal) => {
      console.log(`MCP process exited [${sessionId}] code=${code} signal=${signal}`);
      this.emit('process_exit', { sessionId, code, signal });
      this.processes.delete(sessionId);
    });

    this.processes.set(sessionId, session);

    // Send initialize request
    this._sendRequest(sessionId, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'rog-terminal', version: '1.0.0' },
    });

    return session;
  }

  /**
   * Parse LSP-style Content-Length delimited messages
   */
  _parseMessages(sessionId, session) {
    while (true) {
      const headerEnd = session.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = session.buffer.substring(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Skip malformed header
        session.buffer = session.buffer.substring(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (session.buffer.length < bodyEnd) break; // Wait for more data

      const body = session.buffer.substring(bodyStart, bodyEnd);
      session.buffer = session.buffer.substring(bodyEnd);

      try {
        const message = JSON.parse(body);
        this._handleMessage(sessionId, session, message);
      } catch (e) {
        console.error(`MCP parse error [${sessionId}]:`, e.message);
      }
    }
  }

  _handleMessage(sessionId, session, message) {
    if (message.id !== undefined && session.pendingRequests.has(message.id)) {
      // This is a response to a request we sent
      const { resolve, reject } = session.pendingRequests.get(message.id);
      session.pendingRequests.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message || 'MCP error'));
      } else {
        resolve(message.result);
      }
    }

    // Emit for WebSocket forwarding
    this.emit('message', { sessionId, message });
  }

  /**
   * Send a JSON-RPC request and return a promise for the response
   */
  _sendRequest(sessionId, method, params = {}) {
    const session = this.processes.get(sessionId);
    if (!session || !session.proc || session.proc.killed) {
      return Promise.reject(new Error(`No MCP process for session ${sessionId}`));
    }

    const id = session.messageId++;
    const message = { jsonrpc: '2.0', id, method, params };
    const json = JSON.stringify(message);
    const payload = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;

    return new Promise((resolve, reject) => {
      session.pendingRequests.set(id, { resolve, reject });
      session.proc.stdin.write(payload);

      // Timeout after 30s
      setTimeout(() => {
        if (session.pendingRequests.has(id)) {
          session.pendingRequests.delete(id);
          reject(new Error('MCP request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Send a notification (no response expected)
   */
  _sendNotification(sessionId, method, params = {}) {
    const session = this.processes.get(sessionId);
    if (!session || !session.proc || session.proc.killed) return;

    const message = { jsonrpc: '2.0', method, params };
    const json = JSON.stringify(message);
    const payload = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
    session.proc.stdin.write(payload);
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(sessionId) {
    return this._sendRequest(sessionId, 'tools/list', {});
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(sessionId, toolName, args = {}) {
    return this._sendRequest(sessionId, 'tools/call', { name: toolName, arguments: args });
  }

  /**
   * List available resources
   */
  async listResources(sessionId) {
    return this._sendRequest(sessionId, 'resources/list', {});
  }

  /**
   * Read a resource
   */
  async readResource(sessionId, uri) {
    return this._sendRequest(sessionId, 'resources/read', { uri });
  }

  /**
   * Send a prompt/completion request
   */
  async complete(sessionId, messages) {
    return this._sendRequest(sessionId, 'completion/complete', { messages });
  }

  /**
   * Check if a session is connected
   */
  isConnected(sessionId) {
    const session = this.processes.get(sessionId);
    return session && session.proc && !session.proc.killed;
  }

  /**
   * Disconnect a specific session
   */
  disconnect(sessionId) {
    const session = this.processes.get(sessionId);
    if (session && session.proc && !session.proc.killed) {
      session.proc.kill();
    }
    this.processes.delete(sessionId);
  }

  /**
   * Disconnect all sessions
   */
  disconnectAll() {
    for (const [id] of this.processes) {
      this.disconnect(id);
    }
  }

  /**
   * Get status of all connections
   */
  getStatus() {
    const status = {};
    for (const [id, session] of this.processes) {
      status[id] = {
        connected: session.proc && !session.proc.killed,
        pendingRequests: session.pendingRequests.size,
      };
    }
    return status;
  }
}

module.exports = new McpProxy();
