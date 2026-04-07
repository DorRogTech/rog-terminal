/**
 * Claude CLI Integration
 *
 * Uses the locally installed `claude` CLI (Claude Code) to send messages.
 * This uses your regular Claude subscription - no API key needed!
 *
 * Features:
 * - Full conversation memory via --resume
 * - MCP tool access (Notion, Mail, etc.)
 * - Messages sent via stdin (not arguments) to avoid shell escaping issues
 * - --dangerously-skip-permissions for uninterrupted tool use
 */

const { spawn } = require('child_process');

class ClaudeCli {
  constructor() {
    // Map<rogSessionId, claudeSessionId>
    this.sessionMap = new Map();
    this.busy = new Set();
  }

  /**
   * Send a message to Claude using the CLI.
   * Message is piped via stdin to avoid shell escaping issues.
   */
  async sendMessage(sessionId, message) {
    if (this.busy.has(sessionId)) {
      throw new Error('Claude is still responding to the previous message. Please wait.');
    }

    this.busy.add(sessionId);
    console.log(`[Claude CLI] Sending to session ${sessionId}: "${message.slice(0, 60)}..."`);

    try {
      const args = [
        '-p',
        '--output-format', 'json',
        '--dangerously-skip-permissions',
      ];

      // Resume previous conversation for context
      const claudeSessionId = this.sessionMap.get(sessionId);
      if (claudeSessionId) {
        args.push('--resume', claudeSessionId);
        console.log(`[Claude CLI] Resuming Claude session: ${claudeSessionId}`);
      }

      const result = await this._runClaude(args, message);

      // Store Claude's session ID for conversation continuity
      if (result.session_id) {
        this.sessionMap.set(sessionId, result.session_id);
        console.log(`[Claude CLI] Stored session mapping: ${sessionId} -> ${result.session_id}`);
      }

      const text = result.result || '';
      console.log(`[Claude CLI] Got response (${text.length} chars): "${text.slice(0, 80)}..."`);

      return {
        text,
        sessionId: result.session_id,
        cost: result.total_cost_usd,
        model: Object.keys(result.modelUsage || {})[0] || 'unknown',
        duration: result.duration_ms,
      };
    } finally {
      this.busy.delete(sessionId);
    }
  }

  /**
   * Run claude CLI, piping the message via stdin.
   * Returns parsed JSON result.
   */
  _runClaude(args, stdinMessage) {
    return new Promise((resolve, reject) => {
      const cmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      const proc = spawn(cmd, args, {
        env: { ...process.env },
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[Claude CLI] Exit code ${code}, stderr: ${stderr.slice(0, 200)}`);
          reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          // If not JSON, wrap in result object
          resolve({ result: stdout.trim(), session_id: null });
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start claude: ${err.message}`));
      });

      // Pipe the message via stdin
      if (stdinMessage) {
        proc.stdin.write(stdinMessage);
        proc.stdin.end();
      }

      // 3 minute timeout (MCP tools can be slow)
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill();
          reject(new Error('Claude response timeout (3 min)'));
        }
      }, 180000);
    });
  }

  async isAvailable() {
    try {
      const cmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
      const proc = spawn(cmd, ['--version'], { shell: true });
      return new Promise((resolve) => {
        proc.on('exit', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }

  isBusy(sessionId) {
    return this.busy.has(sessionId);
  }

  resetSession(sessionId) {
    this.sessionMap.delete(sessionId);
    this.busy.delete(sessionId);
  }

  getStatus() {
    return {
      sessions: this.sessionMap.size,
      busy: [...this.busy],
    };
  }
}

module.exports = new ClaudeCli();
