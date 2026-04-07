/**
 * Claude CLI Integration
 *
 * Uses the locally installed `claude` CLI (Claude Code) to send messages.
 * This uses your regular Claude subscription - no API key needed!
 *
 * Features:
 * - Full conversation memory via --resume
 * - MCP tool access (Notion, Mail, etc.)
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
   * Uses --resume to maintain conversation context.
   * Uses --dangerously-skip-permissions so MCP tools work without prompts.
   */
  async sendMessage(sessionId, message) {
    if (this.busy.has(sessionId)) {
      throw new Error('Claude is still responding to the previous message. Please wait.');
    }

    this.busy.add(sessionId);

    try {
      const args = [
        '-p', message,
        '--output-format', 'json',
        '--dangerously-skip-permissions',
      ];

      // Resume previous conversation for context
      const claudeSessionId = this.sessionMap.get(sessionId);
      if (claudeSessionId) {
        args.push('--resume', claudeSessionId);
      }

      const result = await this._runClaude(args);

      // Store Claude's session ID for conversation continuity
      if (result.session_id) {
        this.sessionMap.set(sessionId, result.session_id);
      }

      return {
        text: result.result || '',
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
   * Run claude CLI and return parsed JSON result
   */
  _runClaude(args) {
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
          reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ result: stdout.trim(), session_id: null });
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start claude: ${err.message}`));
      });

      // 2 minute timeout
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill();
          reject(new Error('Claude response timeout (2 min)'));
        }
      }, 120000);
    });
  }

  /**
   * Check if Claude CLI is available
   */
  async isAvailable() {
    try {
      await this._runClaude(['--version']);
      return true;
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
