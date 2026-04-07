#!/usr/bin/env node
/**
 * Rog Terminal Agent
 *
 * Run this on YOUR machine to connect YOUR Claude subscription to Rog Terminal.
 * No API key needed - uses your local `claude` CLI login.
 *
 * Usage:
 *   node agent.js --server http://localhost:3001 --user ronen --pass 123456
 *
 * What it does:
 *   1. Logs into Rog Terminal with your account
 *   2. Connects via WebSocket
 *   3. Listens for messages in sessions you join
 *   4. Runs them through YOUR local `claude` CLI
 *   5. Sends Claude's response back to everyone
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const pty = require('node-pty');

// --- Parse arguments ---
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  args[key] = process.argv[i + 1];
}

const SERVER = args.server || process.env.ROG_SERVER || 'http://localhost:3001';
const USERNAME = args.user || args.username || process.env.ROG_USER;
const PASSWORD = args.pass || args.password || process.env.ROG_PASS;
const SESSION = args.session || process.env.ROG_SESSION; // optional: auto-join a session

if (!USERNAME || !PASSWORD) {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║       ROG TERMINAL - CLAUDE AGENT         ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log('  Connects YOUR Claude to Rog Terminal.');
  console.log('');
  console.log('  Usage:');
  console.log('    node agent.js --server URL --user USERNAME --pass PASSWORD');
  console.log('');
  console.log('  Example:');
  console.log('    node agent.js --server http://localhost:3001 --user ronen --pass mypass123');
  console.log('');
  console.log('  Options:');
  console.log('    --server    Rog Terminal server URL (default: http://localhost:3001)');
  console.log('    --user      Your Rog Terminal username');
  console.log('    --pass      Your Rog Terminal password');
  console.log('    --session   Auto-join a session ID');
  console.log('');
  process.exit(1);
}

const fs = require('fs');
const pathModule = require('path');

// --- State ---
const claudeSessions = new Map(); // rogSessionId -> claudeSessionId
let currentSessionId = null;
let ws = null;
let token = null;
let terminalProc = null; // PTY process for shared terminal
let currentProject = null; // Current working directory for Claude

// --- Find git projects ---
function findProjects() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const projects = [];
  try {
    const entries = fs.readdirSync(home, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const gitPath = pathModule.join(home, entry.name, '.git');
      try {
        if (fs.statSync(gitPath).isDirectory()) {
          projects.push({
            name: entry.name,
            path: pathModule.join(home, entry.name),
          });
        }
      } catch {}
    }
    // Also check Desktop subfolder
    const desktopPath = pathModule.join(home, 'Desktop');
    try {
      const desktopEntries = fs.readdirSync(desktopPath, { withFileTypes: true });
      for (const entry of desktopEntries) {
        if (!entry.isDirectory()) continue;
        const gitPath = pathModule.join(desktopPath, entry.name, '.git');
        try {
          if (fs.statSync(gitPath).isDirectory()) {
            projects.push({
              name: `Desktop/${entry.name}`,
              path: pathModule.join(desktopPath, entry.name),
            });
          }
        } catch {}
      }
    } catch {}
  } catch {}
  return projects;
}

// --- HTTP helper ---
function apiFetch(path, options = {}) {
  const url = new URL(path, SERVER);
  const mod = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const req = mod.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(data)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// --- Claude CLI ---
async function askClaude(rogSessionId, message) {
  const args = ['-p', '--output-format', 'json', '--dangerously-skip-permissions'];

  const claudeSessionId = claudeSessions.get(rogSessionId);
  if (claudeSessionId) {
    args.push('--resume', claudeSessionId);
  }

  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    const proc = spawn(cmd, args, { shell: true, env: process.env });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (c) => stdout += c);
    proc.stderr.on('data', (c) => stderr += c);

    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `claude exit code ${code}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.session_id) {
          claudeSessions.set(rogSessionId, result.session_id);
        }
        resolve(result.result || '');
      } catch {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => reject(new Error(`Claude not found: ${err.message}`)));

    // Send message via stdin
    proc.stdin.write(message);
    proc.stdin.end();

    // Timeout
    setTimeout(() => {
      if (!proc.killed) { proc.kill(); reject(new Error('Timeout (3 min)')); }
    }, 180000);
  });
}

// --- Main ---
async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║       ROG TERMINAL - CLAUDE AGENT         ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  Server:   ${SERVER}`);
  console.log(`  User:     ${USERNAME}`);
  console.log('');

  // Step 1: Login
  console.log('  [1/3] Logging in...');
  try {
    const loginResult = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { username: USERNAME, password: PASSWORD, deviceName: `Agent-${require('os').hostname()}` },
    });
    token = loginResult.token;
    console.log(`  [1/3] Logged in as ${loginResult.user.display_name}`);
  } catch (err) {
    console.error(`  ERROR: Login failed - ${err.message}`);
    process.exit(1);
  }

  // Step 2: Check Claude CLI
  console.log('  [2/3] Checking Claude CLI...');
  try {
    const cmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    const proc = spawn(cmd, ['--version'], { shell: true });
    await new Promise((resolve, reject) => {
      proc.on('exit', (code) => code === 0 ? resolve() : reject());
      proc.on('error', reject);
    });
    console.log('  [2/3] Claude CLI is available');
  } catch {
    console.error('  ERROR: Claude CLI not found. Install it: npm install -g @anthropic-ai/claude-code');
    process.exit(1);
  }

  // Step 3: Connect WebSocket
  console.log('  [3/3] Connecting to WebSocket...');
  connectWs();
}

function connectWs() {
  const wsUrl = SERVER.replace('http', 'ws') + `/ws?token=${token}&device=Agent-${require('os').hostname()}`;
  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('  [3/3] Connected!');
    console.log('');
    console.log('  ✓ Agent is running. Messages will be answered by YOUR Claude.');
    console.log('  ✓ Press Ctrl+C to stop.');
    console.log('');

    // Auto-join session
    if (SESSION) {
      ws.send(JSON.stringify({ type: 'join_session', sessionId: SESSION }));
      currentSessionId = SESSION;
      console.log(`  Auto-joined session: ${SESSION}`);
    } else {
      // Join the most recent session automatically
      apiFetch('/api/sessions').then(({ sessions }) => {
        if (sessions && sessions.length > 0) {
          const latest = sessions[0];
          ws.send(JSON.stringify({ type: 'join_session', sessionId: latest.id }));
          currentSessionId = latest.id;
          console.log(`  Auto-joined latest session: ${latest.name}`);
        }
      }).catch(() => {});
    }
  });

  ws.on('message', async (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    switch (data.type) {
      case 'new_message': {
        const msg = data.message;
        // Only respond to user messages (not our own responses or system)
        if (msg.role !== 'user') break;
        // Don't respond to our own messages
        if (msg.device_name && msg.device_name.startsWith('Agent-')) break;

        console.log(`  [${msg.display_name}] ${msg.content.slice(0, 60)}...`);

        // Show typing
        ws.send(JSON.stringify({
          type: 'typing',
          user: { id: -1, displayName: 'Claude' },
          isTyping: true,
        }));

        try {
          const response = await askClaude(sessionId, msg.content);
          console.log(`  [Claude] ${response.slice(0, 60)}...`);

          // Send response as system message
          ws.send(JSON.stringify({
            type: 'system_message',
            role: 'assistant',
            content: response,
          }));
        } catch (err) {
          console.error(`  [Error] ${err.message}`);
          ws.send(JSON.stringify({
            type: 'system_message',
            role: 'system',
            content: `Agent error: ${err.message}`,
          }));
        }

        // Stop typing
        ws.send(JSON.stringify({
          type: 'typing',
          user: { id: -1, displayName: 'Claude' },
          isTyping: false,
        }));
        break;
      }

      case 'history': {
        console.log(`  Loaded ${data.messages.length} messages from history`);
        currentSessionId = data.sessionId;
        break;
      }

      // === Shared Terminal (remote PTY via Agent) ===

      case 'terminal_open': {
        if (terminalProc) {
          // Already running, send ready
          ws.send(JSON.stringify({ type: 'terminal_ready', sessionId: currentSessionId }));
          break;
        }

        console.log('  [Terminal] Opening shared terminal...');
        const isWin = process.platform === 'win32';
        const shell = isWin ? 'cmd.exe' : '/bin/bash';

        const cwd = currentProject || process.env.HOME || process.cwd();
        console.log(`  [Terminal] CWD: ${cwd}`);

        terminalProc = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols: data.cols || 120,
          rows: data.rows || 40,
          cwd,
          env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
        });

        terminalProc.onData((termData) => {
          if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'terminal_output', data: termData }));
          }
        });

        terminalProc.onExit(() => {
          console.log('  [Terminal] Closed');
          terminalProc = null;
          if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'terminal_closed' }));
          }
        });

        // Auto-start claude
        setTimeout(() => {
          if (terminalProc) {
            const cmd = isWin ? 'claude --dangerously-skip-permissions\r' : 'claude --dangerously-skip-permissions\n';
            terminalProc.write(cmd);
            console.log('  [Terminal] Claude started');
          }
        }, 500);

        ws.send(JSON.stringify({ type: 'terminal_ready', sessionId: currentSessionId }));
        break;
      }

      case 'terminal_input': {
        if (terminalProc) {
          terminalProc.write(data.data);
        }
        break;
      }

      case 'terminal_resize': {
        if (terminalProc) {
          terminalProc.resize(data.cols || 120, data.rows || 40);
        }
        break;
      }

      case 'terminal_kill': {
        if (terminalProc) {
          terminalProc.kill();
          terminalProc = null;
        }
        ws.send(JSON.stringify({ type: 'terminal_closed' }));
        break;
      }

      // === Project management ===

      case 'list_projects': {
        const projects = findProjects();
        ws.send(JSON.stringify({ type: 'projects_list', projects, current: currentProject }));
        console.log(`  [Projects] Found ${projects.length} git projects`);
        break;
      }

      case 'select_project': {
        const { path: projectPath } = data;
        if (projectPath) {
          currentProject = projectPath;
          console.log(`  [Projects] Selected: ${projectPath}`);
          // If terminal is running, kill it so it restarts in the new dir
          if (terminalProc) {
            terminalProc.kill();
            terminalProc = null;
          }
          ws.send(JSON.stringify({ type: 'project_selected', path: projectPath, name: pathModule.basename(projectPath) }));
        }
        break;
      }

      case 'sessions_updated':
      case 'session_created': {
        // If we don't have a session, list available ones
        if (!currentSessionId) {
          try {
            const { sessions } = await apiFetch('/api/sessions');
            if (sessions.length > 0) {
              console.log('  Available sessions:');
              sessions.forEach(s => console.log(`    - ${s.id} : ${s.name}`));
              // Auto-join the first/latest session
              const latest = sessions[0];
              ws.send(JSON.stringify({ type: 'join_session', sessionId: latest.id }));
              currentSessionId = latest.id;
              console.log(`  Auto-joined: ${latest.name}`);
            }
          } catch {}
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log('  Disconnected. Reconnecting in 5s...');
    setTimeout(connectWs, 5000);
  });

  ws.on('error', (err) => {
    console.error(`  WebSocket error: ${err.message}`);
  });
}

main().catch(console.error);
