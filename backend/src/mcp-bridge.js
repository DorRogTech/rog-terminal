/**
 * MCP Bridge - Connects Rog Terminal to Claude Code's MCP server
 *
 * This module spawns `claude mcp serve` as a child process and communicates
 * with it using the MCP protocol (JSON-RPC over stdio with Content-Length headers).
 *
 * Flow:
 * 1. User sends a message in Rog Terminal
 * 2. Backend saves the message and broadcasts to all users
 * 3. Backend sends the message to Claude via MCP bridge
 * 4. Claude's response streams back and is broadcast to all users
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class McpBridge extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.buffer = '';
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.initialized = false;
    this.tools = [];
    this._healthInterval = null;
    this._lastPingOk = false;
  }

  /**
   * Start the Claude Code MCP server
   */
  async start() {
    if (this.proc && !this.proc.killed) {
      console.log('[MCP Bridge] Already running');
      return;
    }

    console.log('[MCP Bridge] Starting claude mcp serve...');

    try {
      // Find claude binary
      const claudePath = process.platform === 'win32'
        ? 'claude.cmd'
        : 'claude';

      this.proc = spawn(claudePath, ['mcp', 'serve'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        shell: true,
      });

      this.proc.stdout.on('data', (chunk) => {
        this.buffer += chunk.toString();
        this._parseMessages();
      });

      this.proc.stderr.on('data', (chunk) => {
        const text = chunk.toString().trim();
        if (text) {
          console.log('[MCP Bridge stderr]', text);
          this.emit('log', text);
        }
      });

      this.proc.on('error', (err) => {
        console.error('[MCP Bridge] Process error:', err.message);
        this.emit('error', err.message);
      });

      this.proc.on('exit', (code) => {
        console.log(`[MCP Bridge] Process exited with code ${code}`);
        this.initialized = false;
        this.proc = null;
        this.emit('disconnected');
      });

      // Initialize MCP connection
      const initResult = await this._sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'rog-terminal', version: '1.0.0' },
      });

      console.log('[MCP Bridge] Initialized:', JSON.stringify(initResult).slice(0, 200));

      // Send initialized notification
      this._sendNotification('notifications/initialized', {});

      // List available tools
      const toolsResult = await this._sendRequest('tools/list', {});
      this.tools = toolsResult?.tools || [];
      console.log(`[MCP Bridge] ${this.tools.length} tools available`);

      this.initialized = true;
      this.emit('ready', { tools: this.tools });
    } catch (err) {
      console.warn('[MCP Bridge] Start failed (claude CLI may not be available):', err.message);
      this.initialized = false;
      if (this.proc && !this.proc.killed) {
        this.proc.kill();
      }
      this.proc = null;
    }
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name, args = {}) {
    if (!this.initialized) {
      throw new Error('MCP Bridge not initialized. Call start() first.');
    }

    console.log(`[MCP Bridge] Calling tool: ${name}`);
    const result = await this._sendRequest('tools/call', {
      name,
      arguments: args,
    });

    return result;
  }

  /**
   * Get list of available tools
   */
  getTools() {
    return this.tools;
  }

  /**
   * Check if bridge is running and initialized (basic check, use ping() for real verification)
   */
  isReady() {
    return this.initialized && this.proc && !this.proc.killed;
  }

  /**
   * Real health check - sends a tools/list request to verify MCP is actually responsive
   * Returns { ok, tools, error }
   */
  async ping() {
    if (!this.proc || this.proc.killed || !this.initialized) {
      this._lastPingOk = false;
      return { ok: false, error: 'MCP process not running' };
    }
    try {
      const result = await this._sendRequest('tools/list', {});
      this.tools = result?.tools || [];
      this._lastPingOk = true;
      return { ok: true, tools: this.tools.length };
    } catch (err) {
      console.error('[MCP Bridge] Ping failed:', err.message);
      this._lastPingOk = false;
      // Process is dead/unresponsive, clean up
      this.initialized = false;
      return { ok: false, error: err.message };
    }
  }

  stopHealthCheck() {
    if (this._healthInterval) {
      clearInterval(this._healthInterval);
      this._healthInterval = null;
    }
  }

  /**
   * Parse Content-Length delimited JSON-RPC messages from stdout
   */
  _parseMessages() {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.substring(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.substring(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (this.buffer.length < bodyEnd) break;

      const body = this.buffer.substring(bodyStart, bodyEnd);
      this.buffer = this.buffer.substring(bodyEnd);

      try {
        const message = JSON.parse(body);
        this._handleMessage(message);
      } catch (e) {
        console.error('[MCP Bridge] Parse error:', e.message);
      }
    }
  }

  _handleMessage(message) {
    // Response to a request
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timer } = this.pendingRequests.get(message.id);
      clearTimeout(timer);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
      return;
    }

    // Notification from server
    if (message.method) {
      this.emit('notification', message);
    }
  }

  _sendRequest(method, params = {}) {
    if (!this.proc || this.proc.killed) {
      return Promise.reject(new Error('MCP process not running'));
    }

    const id = this.requestId++;
    const message = { jsonrpc: '2.0', id, method, params };
    const json = JSON.stringify(message);
    const payload = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }, 60000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.proc.stdin.write(payload);
      } catch (e) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(new Error(`Failed to write to MCP: ${e.message}`));
      }
    });
  }

  _sendNotification(method, params = {}) {
    if (!this.proc || this.proc.killed) return;
    const message = { jsonrpc: '2.0', method, params };
    const json = JSON.stringify(message);
    const payload = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
    try {
      this.proc.stdin.write(payload);
    } catch (e) {
      console.error('[MCP Bridge] Write error:', e.message);
    }
  }

  /**
   * Stop the MCP server
   */
  stop() {
    if (this.proc && !this.proc.killed) {
      this.proc.kill();
    }
    this.proc = null;
    this.initialized = false;
    this.pendingRequests.clear();
  }
}

// Singleton
module.exports = new McpBridge();
