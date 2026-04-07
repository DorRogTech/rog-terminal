import React, { useEffect, useRef, useState } from 'react';
import wsClient from '../utils/websocket';
import { ansiToHtml } from '../utils/ansi-to-html';

/**
 * Rich Terminal - renders Claude Code output as HTML with full RTL support.
 * Instead of xterm.js (which doesn't support BiDi), we render output
 * as styled HTML so the browser handles Hebrew/Arabic natively.
 * Input goes through a regular text field.
 */
export default function SharedTerminal({ active, onClose }) {
  const outputRef = useRef(null);
  const inputRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [outputHtml, setOutputHtml] = useState('');
  const bufferRef = useRef('');

  useEffect(() => {
    if (!active) return;

    const appendOutput = (data) => {
      bufferRef.current += data;
      const html = ansiToHtml(bufferRef.current);
      setOutputHtml(html);

      // Auto-scroll to bottom
      requestAnimationFrame(() => {
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      });
    };

    const unsubOutput = wsClient.on('terminal_output', (msg) => {
      appendOutput(msg.data);
    });

    const unsubHistory = wsClient.on('terminal_history', (msg) => {
      appendOutput(msg.data);
    });

    const unsubReady = wsClient.on('terminal_ready', () => {
      setReady(true);
      inputRef.current?.focus();
    });

    const unsubClosed = wsClient.on('terminal_closed', () => {
      appendOutput('\n\x1b[31m[Terminal closed]\x1b[0m\n');
      setReady(false);
    });

    // Request terminal from server
    wsClient.send({ type: 'terminal_open', cols: 120, rows: 40 });

    return () => {
      unsubOutput();
      unsubHistory();
      unsubReady();
      unsubClosed();
    };
  }, [active]);

  // Reset when becoming active
  useEffect(() => {
    if (active) {
      bufferRef.current = '';
      setOutputHtml('');
      setInputValue('');
    }
  }, [active]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!inputValue && !ready) return;

    // Send the input + Enter to the terminal
    wsClient.send({ type: 'terminal_input', data: inputValue + '\r' });
    setInputValue('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    // Ctrl+C
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      wsClient.send({ type: 'terminal_input', data: '\x03' });
      return;
    }
    // Ctrl+D
    if (e.key === 'd' && e.ctrlKey) {
      e.preventDefault();
      wsClient.send({ type: 'terminal_input', data: '\x04' });
      return;
    }
    // Arrow Up
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      wsClient.send({ type: 'terminal_input', data: '\x1b[A' });
      return;
    }
    // Arrow Down
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      wsClient.send({ type: 'terminal_input', data: '\x1b[B' });
      return;
    }
    // Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      wsClient.send({ type: 'terminal_input', data: '\t' });
      return;
    }
  }

  if (!active) return null;

  return (
    <div className="shared-terminal-overlay" onClick={onClose}>
      <div className="shared-terminal-container" onClick={(e) => e.stopPropagation()}>
        <div className="shared-terminal-header">
          <div className="shared-terminal-title">
            <span className={`terminal-dot ${ready ? 'green' : 'red'}`} />
            Claude Code — Shared Terminal
          </div>
          <div className="shared-terminal-actions">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {ready ? 'Connected — everyone sees this' : 'Connecting...'}
            </span>
            <button className="btn-terminal-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div
          className="rich-terminal-output"
          ref={outputRef}
          onClick={() => inputRef.current?.focus()}
          dangerouslySetInnerHTML={{ __html: outputHtml }}
        />

        <form className="rich-terminal-input-area" onSubmit={handleSubmit}>
          <span className="rich-terminal-prompt">&gt;</span>
          <input
            ref={inputRef}
            className="rich-terminal-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={ready ? 'Type a command... (/help, /babysit, etc.)' : 'Connecting...'}
            disabled={!ready}
            autoFocus
            dir="auto"
          />
          <button className="btn-send" type="submit" disabled={!ready}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
