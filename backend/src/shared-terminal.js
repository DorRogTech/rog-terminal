/**
 * Shared Terminal - Full interactive Claude Code session
 *
 * Spawns `claude` in a real PTY (pseudo-terminal) so ALL features work:
 * - Slash commands (/morning, /handoff, /babysit, etc.)
 * - Babysitter orchestration
 * - Plugins and Skills
 * - Plan mode
 * - Full interactive I/O
 *
 * Multiple users share the same terminal session via WebSocket.
 * Everyone sees the same output and anyone can type.
 */

const { EventEmitter } = require('events');

let pty;
try {
  pty = require('node-pty');
} catch {
  console.log('[SharedTerminal] node-pty not available (OK on cloud deployments)');
}

class SharedTerminal extends EventEmitter {
  constructor() {
    super();
    // Map<sessionId, { pty, history }>
    this.terminals = new Map();
  }

  /**
   * Create or get a shared terminal for a session
   */
  create(sessionId, options = {}) {
    if (this.terminals.has(sessionId)) {
      return this.terminals.get(sessionId);
    }

    if (!pty) {
      console.log('[SharedTerminal] node-pty not available, cannot create terminal');
      return null;
    }

    const cols = options.cols || 120;
    const rows = options.rows || 40;
    const cwd = options.cwd || process.env.HOME || process.cwd();

    // Determine shell and claude command
    const isWin = process.platform === 'win32';
    const shell = isWin ? 'cmd.exe' : '/bin/bash';
    const shellArgs = isWin ? [] : [];

    console.log(`[SharedTerminal] Creating terminal for session ${sessionId}`);

    const term = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    const session = {
      pty: term,
      history: '',     // Rolling buffer of terminal output
      maxHistory: 50000, // Keep last 50K chars for new joiners
      createdAt: new Date(),
      claudeStarted: false,
    };

    term.onData((data) => {
      // Append to history buffer
      session.history += data;
      if (session.history.length > session.maxHistory) {
        session.history = session.history.slice(-session.maxHistory);
      }

      // Broadcast to all connected clients
      this.emit('output', { sessionId, data });
    });

    term.onExit(({ exitCode }) => {
      console.log(`[SharedTerminal] Terminal exited for session ${sessionId} (code ${exitCode})`);
      this.terminals.delete(sessionId);
      this.emit('exit', { sessionId, exitCode });
    });

    this.terminals.set(sessionId, session);

    // Auto-start claude in the terminal
    setTimeout(() => {
      this.startClaude(sessionId);
    }, 500);

    return session;
  }

  /**
   * Start claude in the terminal
   */
  startClaude(sessionId) {
    const session = this.terminals.get(sessionId);
    if (!session || session.claudeStarted) return;

    const cmd = process.platform === 'win32'
      ? 'claude --dangerously-skip-permissions\r'
      : 'claude --dangerously-skip-permissions\n';

    session.pty.write(cmd);
    session.claudeStarted = true;
    console.log(`[SharedTerminal] Claude started in session ${sessionId}`);
  }

  /**
   * Write input to a terminal (from a user)
   */
  write(sessionId, data) {
    const session = this.terminals.get(sessionId);
    if (!session) {
      throw new Error('Terminal session not found');
    }
    session.pty.write(data);
  }

  /**
   * Resize terminal
   */
  resize(sessionId, cols, rows) {
    const session = this.terminals.get(sessionId);
    if (session) {
      session.pty.resize(cols, rows);
    }
  }

  /**
   * Get terminal history (for users joining mid-session)
   */
  getHistory(sessionId) {
    const session = this.terminals.get(sessionId);
    return session ? session.history : '';
  }

  /**
   * Check if terminal exists
   */
  has(sessionId) {
    return this.terminals.has(sessionId);
  }

  /**
   * Kill a terminal
   */
  kill(sessionId) {
    const session = this.terminals.get(sessionId);
    if (session) {
      session.pty.kill();
      this.terminals.delete(sessionId);
    }
  }

  /**
   * Kill all terminals
   */
  killAll() {
    for (const [id] of this.terminals) {
      this.kill(id);
    }
  }

  /**
   * Get status of all terminals
   */
  getStatus() {
    const status = {};
    for (const [id, session] of this.terminals) {
      status[id] = {
        claudeStarted: session.claudeStarted,
        historyLength: session.history.length,
        createdAt: session.createdAt,
      };
    }
    return status;
  }
}

module.exports = new SharedTerminal();
