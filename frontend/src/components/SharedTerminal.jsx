import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import wsClient from '../utils/websocket';

export default function SharedTerminal({ active, onClose, currentProjectName }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileInput, setMobileInput] = useState('');
  const [agentError, setAgentError] = useState(null);
  const mobileInputRef = useRef(null);

  // Mobile detection
  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024));
    }
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize xterm.js when terminal becomes active
  useEffect(() => {
    if (!active || !terminalRef.current) return;

    setAgentError(null);
    setReady(false);

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: isMobile ? 12 : 14,
      fontFamily: "'IBM Plex Mono', 'Courier New', 'Menlo', monospace",
      theme: {
        background: '#0a0e17',
        foreground: '#e2e8f0',
        cursor: '#3b82f6',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
        black: '#1a2236',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a78bfa',
        cyan: '#06b6d4',
        white: '#e2e8f0',
        brightBlack: '#64748b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c4b5fd',
        brightCyan: '#22d3ee',
        brightWhite: '#f8fafc',
      },
      scrollback: 5000,
      convertEol: false,
      allowProposedApi: true,
      disableStdin: isMobile,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(terminalRef.current);

    setTimeout(() => {
      try { fitAddon.fit(); } catch {}
    }, 100);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Desktop: send keystrokes to server
    if (!isMobile) {
      term.onData((data) => {
        wsClient.send({ type: 'terminal_input', data });
      });
    }

    // Receive output from server
    const unsubOutput = wsClient.on('terminal_output', (msg) => {
      if (msg.data) term.write(msg.data);
    });
    const unsubHistory = wsClient.on('terminal_history', (msg) => {
      if (msg.data) term.write(msg.data);
    });
    const unsubReady = wsClient.on('terminal_ready', () => {
      setReady(true);
      setAgentError(null);
      if (isMobile) {
        mobileInputRef.current?.focus();
      } else {
        term.focus();
      }
    });
    const unsubClosed = wsClient.on('terminal_closed', () => {
      term.write('\r\n[Terminal closed]\r\n');
      setReady(false);
    });

    // Listen for error (Agent not connected)
    const unsubError = wsClient.on('error', (msg) => {
      if (msg.message && msg.message.includes('Agent')) {
        setAgentError(msg.message);
      }
    });

    // Send terminal_open after xterm is ready
    setTimeout(() => {
      const cols = isMobile ? 80 : term.cols || 120;
      const rows = isMobile ? 24 : term.rows || 40;
      wsClient.send({ type: 'terminal_open', cols, rows });
    }, 200);

    // Handle window resize
    function handleResize() {
      try {
        fitAddon.fit();
        wsClient.send({ type: 'terminal_resize', cols: term.cols, rows: term.rows });
      } catch {}
    }
    window.addEventListener('resize', handleResize);

    const vv = window.visualViewport;
    function handleVvResize() {
      try { fitAddon.fit(); } catch {}
    }
    if (vv) vv.addEventListener('resize', handleVvResize);

    return () => {
      unsubOutput();
      unsubHistory();
      unsubReady();
      unsubClosed();
      unsubError();
      window.removeEventListener('resize', handleResize);
      if (vv) vv.removeEventListener('resize', handleVvResize);
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [active, isMobile]);

  // Retry connecting terminal
  function retryConnect() {
    setAgentError(null);
    const cols = isMobile ? 80 : 120;
    const rows = isMobile ? 24 : 40;
    wsClient.send({ type: 'terminal_open', cols, rows });
  }

  // Mobile input handlers
  const handleMobileSend = useCallback(() => {
    if (mobileInput && ready) {
      wsClient.send({ type: 'terminal_input', data: mobileInput + '\r' });
      setMobileInput('');
      setTimeout(() => mobileInputRef.current?.focus(), 50);
    }
  }, [mobileInput, ready]);

  const sendSpecialKey = useCallback((key) => {
    if (!ready) return;
    const keyMap = {
      'ctrl-c': '\x03', 'ctrl-d': '\x04', 'ctrl-z': '\x1a',
      'tab': '\t', 'up': '\x1b[A', 'down': '\x1b[B',
      'left': '\x1b[D', 'right': '\x1b[C', 'escape': '\x1b',
    };
    if (keyMap[key]) {
      wsClient.send({ type: 'terminal_input', data: keyMap[key] });
    }
  }, [ready]);

  if (!active) return null;

  return (
    <div className="shared-terminal-overlay">
      <div className={`shared-terminal-container ${isMobile ? 'mobile' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="shared-terminal-header">
          <div className="shared-terminal-title">
            <span className={`terminal-dot ${ready ? 'green' : agentError ? 'red' : 'yellow'}`} />
            {isMobile ? (currentProjectName || 'Terminal') : `Claude Code — ${currentProjectName || 'Shared Terminal'}`}
          </div>
          <div className="shared-terminal-actions">
            {!isMobile && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {ready ? 'Connected' : agentError ? 'Agent Disconnected' : 'Connecting...'}
              </span>
            )}
            <button className="btn-terminal-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* Agent disconnected overlay */}
        {agentError && (
          <div className="terminal-agent-error">
            <div className="terminal-agent-error-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <div className="terminal-agent-error-title">Agent לא מחובר</div>
            <div className="terminal-agent-error-text">
              כדי להשתמש בטרמינל, צריך להפעיל את ה-Agent על המחשב:
            </div>
            <div className="terminal-agent-error-cmd" dir="ltr">
              node agent/agent.js --server https://rog-terminal.fly.dev --user YOUR_USER --pass YOUR_PASS
            </div>
            <button className="terminal-agent-error-retry" onClick={retryConnect}>
              נסה שוב
            </button>
          </div>
        )}

        {/* xterm.js terminal */}
        <div
          className="xterm-container"
          ref={terminalRef}
          onClick={() => !isMobile && xtermRef.current?.focus()}
          style={{ display: agentError ? 'none' : undefined }}
        />

        {/* Mobile: input area with quick keys */}
        {isMobile && !agentError && (
          <div className="terminal-mobile-input-area">
            <div className="terminal-mobile-quick-actions">
              {[
                { key: 'ctrl-c', label: '^C' },
                { key: 'ctrl-d', label: '^D' },
                { key: 'tab', label: 'Tab' },
                { key: 'up', label: '▲' },
                { key: 'down', label: '▼' },
                { key: 'left', label: '◀' },
                { key: 'right', label: '▶' },
                { key: 'escape', label: 'Esc' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className="terminal-quick-btn"
                  onTouchEnd={(e) => { e.preventDefault(); sendSpecialKey(key); }}
                  onClick={() => sendSpecialKey(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="terminal-mobile-input-row">
              <input
                ref={mobileInputRef}
                className="terminal-mobile-input"
                type="text"
                inputMode="text"
                enterKeyHint="send"
                value={mobileInput}
                onChange={(e) => setMobileInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleMobileSend();
                  }
                }}
                placeholder="הקלד פקודה..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                dir="auto"
              />
              <button
                className="terminal-mobile-send-btn"
                onTouchEnd={(e) => { e.preventDefault(); handleMobileSend(); }}
                onClick={handleMobileSend}
                disabled={!mobileInput || !ready}
              >
                &#9654;
              </button>
            </div>
          </div>
        )}

        {/* Status bar */}
        {!isMobile && !agentError && (
          <div className="rich-terminal-status-bar">
            <span>{currentProjectName || 'No project'} — Click to type</span>
            <span>{ready ? 'Ctrl+C to cancel' : 'Connecting...'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
