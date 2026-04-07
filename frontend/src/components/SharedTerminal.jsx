import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import wsClient from '../utils/websocket';
import { processBidi } from '../utils/bidi';

export default function SharedTerminal({ active, onClose }) {
  const termRef = useRef(null);
  const termInstanceRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active || !termRef.current) return;

    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
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
      allowTransparency: true,
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(termRef.current);

    // Fit to container
    setTimeout(() => fitAddon.fit(), 100);

    termInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    // Send input to server
    term.onData((data) => {
      wsClient.send({ type: 'terminal_input', data });
    });

    // Listen for terminal output from server - apply BiDi processing
    const unsubOutput = wsClient.on('terminal_output', (msg) => {
      term.write(processBidi(msg.data));
    });

    const unsubReady = wsClient.on('terminal_ready', (msg) => {
      setReady(true);
      term.focus();
    });

    const unsubHistory = wsClient.on('terminal_history', (msg) => {
      term.write(processBidi(msg.data));
    });

    const unsubClosed = wsClient.on('terminal_closed', () => {
      term.write('\r\n\x1b[31m[Terminal closed]\x1b[0m\r\n');
      setReady(false);
    });

    // Request terminal from server
    const { cols, rows } = term;
    wsClient.send({ type: 'terminal_open', cols, rows });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        wsClient.send({
          type: 'terminal_resize',
          cols: term.cols,
          rows: term.rows,
        });
      } catch {}
    });
    resizeObserver.observe(termRef.current);

    // Focus terminal
    term.focus();

    return () => {
      unsubOutput();
      unsubReady();
      unsubHistory();
      unsubClosed();
      resizeObserver.disconnect();
      term.dispose();
      termInstanceRef.current = null;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="shared-terminal-overlay">
      <div className="shared-terminal-container">
        <div className="shared-terminal-header">
          <div className="shared-terminal-title">
            <span className="terminal-dot green" />
            Claude Code — Shared Terminal
          </div>
          <div className="shared-terminal-actions">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {ready ? 'Connected — everyone sees this' : 'Connecting...'}
            </span>
            <button className="btn-terminal-close" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div className="shared-terminal-body" ref={termRef} />
      </div>
    </div>
  );
}
