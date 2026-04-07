/**
 * Claude CLI Integration
 *
 * Uses the locally installed `claude` CLI (Claude Code) to send messages.
 * This uses your regular Claude subscription - no API key needed!
 *
 * Each session maintains its own conversation via --resume flag.
 */

const { spawn } = require('child_process');
const path = require('path');

class ClaudeCli {
  constructor() {
    // Map<rogSessionId, claudeSessionId> - maps our sessions to Claude session IDs
    this.sessionMap = new Map();
    this.busy = new Set(); // sessions currently waiting for a response
  }

  /**
   * Send a message to Claude using the CLI.
   * Returns the response text.
   */
  async sendMessage(sessionId, message, onPartial) {
    if (this.busy.has(sessionId)) {
      throw new Error('Claude is still responding to the previous message. Please wait.');
    }

    this.busy.add(sessionId);

    try {
      const args = ['-p', message, '--output-format', 'json'];

      // If we have a previous Claude session for this Rog session, resume it
      const claudeSessionId = this.sessionMap.get(sessionId);
      if (claudeSessionId) {
        args.push('--resume', claudeSessionId);
      }

      const result = await this._runClaude(args);

      // Store the Claude session ID for conversation continuity
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
   * Send a message with streaming output (partial results via callback)
   */
  async sendMessageStreaming(sessionId, message, onChunk) {
    if (this.busy.has(sessionId)) {
      throw new Error('Claude is still responding. Please wait.');
    }

    this.busy.add(sessionId);

    try {
      const args = ['-p', message, '--output-format', 'stream-json', '--verbose'];

      const claudeSessionId = this.sessionMap.get(sessionId);
      if (claudeSessionId) {
        args.push('--resume', claudeSessionId);
      }

      let fullText = '';
      let resultSessionId = null;

      await new Promise((resolve, reject) => {
        const proc = this._spawnClaude(args);
        let buffer = '';

        proc.stdout.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);

              if (event.type === 'assistant' && event.message?.content) {
                for (const block of event.message.content) {
                  if (block.type === 'text' && block.text) {
                    fullText += block.text;
                    if (onChunk) onChunk(block.text);
                  }
                }
              } else if (event.type === 'result') {
                resultSessionId = event.session_id;
                if (event.result && !fullText) {
                  fullText = event.result;
                }
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        });

        proc.stderr.on('data', (chunk) => {
          const text = chunk.toString().trim();
          if (text) console.log('[Claude CLI stderr]', text);
        });

        proc.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Claude exited with code ${code}`));
        });

        proc.on('error', reject);
      });

      if (resultSessionId) {
        this.sessionMap.set(sessionId, resultSessionId);
      }

      return fullText;
    } finally {
      this.busy.delete(sessionId);
    }
  }

  /**
   * Run claude CLI and return parsed JSON result
   */
  _runClaude(args) {
    return new Promise((resolve, reject) => {
      const proc = this._spawnClaude(args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Claude exited with code ${code}`));
          return;
        }
        try {
          const data = JSON.parse(stdout);
          resolve(data);
        } catch {
          // If JSON parse fails, treat stdout as plain text
          resolve({ result: stdout.trim(), session_id: null });
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start claude: ${err.message}. Is Claude Code installed?`));
      });
    });
  }

  /**
   * Spawn claude process
   */
  _spawnClaude(args) {
    const cmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    return spawn(cmd, args, {
      env: { ...process.env },
      shell: true,
      timeout: 120000, // 2 min timeout
    });
  }

  /**
   * Check if Claude CLI is available
   */
  async isAvailable() {
    try {
      const result = await this._runClaude(['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a session is busy (waiting for response)
   */
  isBusy(sessionId) {
    return this.busy.has(sessionId);
  }

  /**
   * Reset a session (start fresh conversation)
   */
  resetSession(sessionId) {
    this.sessionMap.delete(sessionId);
    this.busy.delete(sessionId);
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      sessions: this.sessionMap.size,
      busy: [...this.busy],
      sessionMappings: Object.fromEntries(this.sessionMap),
    };
  }
}

module.exports = new ClaudeCli();
