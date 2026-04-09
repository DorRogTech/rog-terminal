/**
 * Claude API Integration Module
 *
 * Allows users to link their own Claude API keys (or share a team key)
 * so the team can collaborate on projects through shared MCP sessions.
 *
 * Flow:
 * 1. User A connects with their API key -> creates a shared session
 * 2. User B connects with their own API key (or joins without one)
 * 3. Messages from any user are sent to the active Claude API key
 * 4. Responses are broadcast to all users in the session
 */

const https = require('https');

class ClaudeApiClient {
  constructor() {
    // Map<sessionId, { apiKey, model, projectId }>
    this.sessionConfigs = new Map();
  }

  /**
   * Configure a session with a Claude API key
   */
  configureSession(sessionId, config) {
    this.sessionConfigs.set(sessionId, {
      apiKey: config.apiKey,
      model: config.model || 'claude-sonnet-4-20250514',
      systemPrompt: config.systemPrompt || '',
      projectId: config.projectId || null,
    });
  }

  /**
   * Check if a session has an API key configured
   */
  isConfigured(sessionId) {
    return this.sessionConfigs.has(sessionId);
  }

  /**
   * Remove session configuration
   */
  removeSession(sessionId) {
    this.sessionConfigs.delete(sessionId);
  }

  /**
   * Send a message to Claude API and return the response
   * Supports streaming by calling onChunk for each text chunk
   */
  async sendMessage(sessionId, messages, onChunk) {
    const config = this.sessionConfigs.get(sessionId);
    if (!config || !config.apiKey) {
      throw new Error('No API key configured for this session. Add one in Settings.');
    }

    const body = {
      model: config.model,
      max_tokens: 4096,
      stream: !!onChunk,
      messages: messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
    };

    if (config.systemPrompt) {
      body.system = config.systemPrompt;
    }

    const bodyStr = JSON.stringify(body);

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // API keys use x-api-key, OAuth tokens use Bearer + beta header
            ...(config.apiKey.startsWith('sk-')
              ? { 'x-api-key': config.apiKey }
              : { 'Authorization': `Bearer ${config.apiKey}`, 'anthropic-beta': 'oauth-2025-04-20' }),
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(bodyStr),
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            let errorBody = '';
            res.on('data', (chunk) => (errorBody += chunk));
            res.on('end', () => {
              try {
                const err = JSON.parse(errorBody);
                reject(new Error(err.error?.message || `API error ${res.statusCode}`));
              } catch {
                reject(new Error(`API error ${res.statusCode}: ${errorBody.slice(0, 200)}`));
              }
            });
            return;
          }

          if (onChunk) {
            // Streaming response
            let fullText = '';
            let buffer = '';

            res.on('data', (chunk) => {
              buffer += chunk.toString();
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  if (data === '[DONE]') continue;
                  try {
                    const event = JSON.parse(data);
                    if (event.type === 'content_block_delta' && event.delta?.text) {
                      fullText += event.delta.text;
                      onChunk(event.delta.text);
                    }
                  } catch {
                    // Skip malformed chunks
                  }
                }
              }
            });

            res.on('end', () => resolve(fullText));
          } else {
            // Non-streaming
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                const data = JSON.parse(body);
                const text = data.content
                  ?.filter((c) => c.type === 'text')
                  .map((c) => c.text)
                  .join('') || '';
                resolve(text);
              } catch (e) {
                reject(new Error('Failed to parse Claude response'));
              }
            });
          }
        }
      );

      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Get all session configs (for admin view)
   */
  getStatus() {
    const status = {};
    for (const [id, config] of this.sessionConfigs) {
      status[id] = {
        hasApiKey: !!config.apiKey,
        model: config.model,
        hasSystemPrompt: !!config.systemPrompt,
      };
    }
    return status;
  }
}

module.exports = new ClaudeApiClient();
