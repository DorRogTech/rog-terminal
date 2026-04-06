const { spawn } = require('child_process');

class McpProxy {
  constructor() {
    this.processes = new Map(); // sessionId -> child process
  }

  /**
   * Start or get an MCP session.
   * This spawns a Claude Code process in MCP mode for the given session.
   */
  getOrCreateProcess(sessionId) {
    if (this.processes.has(sessionId)) {
      const proc = this.processes.get(sessionId);
      if (!proc.killed) return proc;
      this.processes.delete(sessionId);
    }
    return null;
  }

  /**
   * Send a message to the MCP server for a given session.
   * In a real implementation, this connects to the actual MCP server.
   * For now, it acts as a message relay that can be extended.
   */
  async sendMessage(sessionId, message) {
    // This is the integration point for MCP protocol.
    // The actual MCP communication will be implemented based on
    // the specific MCP server configuration.
    return {
      type: 'mcp_relay',
      sessionId,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Connect to an MCP server via stdio transport
   */
  connectStdio(sessionId, command, args = []) {
    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    proc.on('error', (err) => {
      console.error(`MCP process error [${sessionId}]:`, err.message);
      this.processes.delete(sessionId);
    });

    proc.on('exit', (code) => {
      console.log(`MCP process exited [${sessionId}] with code ${code}`);
      this.processes.delete(sessionId);
    });

    this.processes.set(sessionId, proc);
    return proc;
  }

  /**
   * Send JSON-RPC message to MCP process
   */
  sendJsonRpc(sessionId, method, params = {}, id = null) {
    const proc = this.getOrCreateProcess(sessionId);
    if (!proc) {
      throw new Error(`No MCP process for session ${sessionId}`);
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };
    if (id !== null) message.id = id;

    const json = JSON.stringify(message);
    proc.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  }

  disconnect(sessionId) {
    const proc = this.processes.get(sessionId);
    if (proc && !proc.killed) {
      proc.kill();
    }
    this.processes.delete(sessionId);
  }

  disconnectAll() {
    for (const [id, proc] of this.processes) {
      if (!proc.killed) proc.kill();
    }
    this.processes.clear();
  }
}

module.exports = new McpProxy();
