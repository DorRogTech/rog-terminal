import React, { useEffect, useRef, useState } from 'react';
import wsClient from '../utils/websocket';
import { ansiToHtml } from '../utils/ansi-to-html';

export default function SharedTerminal({ active, onClose }) {
  const outputRef = useRef(null);
  const inputRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [outputHtml, setOutputHtml] = useState('');
  const bufferRef = useRef('');

  useEffect(() => {
    if (!active) return;

    const appendOutput = (data) => {
      bufferRef.current += data;
      // Keep buffer manageable
      if (bufferRef.current.length > 100000) {
        bufferRef.current = bufferRef.current.slice(-80000);
      }
      const html = ansiToHtml(bufferRef.current);
      setOutputHtml(html);

      requestAnimationFrame(() => {
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      });
    };

    const unsubOutput = wsClient.on('terminal_output', (msg) => appendOutput(msg.data));
    const unsubHistory = wsClient.on('terminal_history', (msg) => appendOutput(msg.data));
    const unsubReady = wsClient.on('terminal_ready', () => {
      setReady(true);
      inputRef.current?.focus();
    });
    const unsubClosed = wsClient.on('terminal_closed', () => {
      appendOutput('\n[Terminal closed]\n');
      setReady(false);
    });

    wsClient.send({ type: 'terminal_open', cols: 120, rows: 40 });

    return () => {
      unsubOutput();
      unsubHistory();
      unsubReady();
      unsubClosed();
    };
  }, [active]);

  useEffect(() => {
    if (active) {
      bufferRef.current = '';
      setOutputHtml('');
    }
  }, [active]);

  // Send each keystroke in real-time (enables autocomplete)
  function handleKeyDown(e) {
    if (!ready) return;

    // Special keys
    const keyMap = {
      'Enter':     '\r',
      'Backspace': '\x7f',
      'Tab':       '\t',
      'Escape':    '\x1b',
      'ArrowUp':   '\x1b[A',
      'ArrowDown': '\x1b[B',
      'ArrowRight':'\x1b[C',
      'ArrowLeft': '\x1b[D',
      'Home':      '\x1b[H',
      'End':       '\x1b[F',
      'Delete':    '\x1b[3~',
    };

    // Ctrl combinations
    if (e.ctrlKey && e.key.length === 1) {
      e.preventDefault();
      const code = e.key.toLowerCase().charCodeAt(0) - 96; // Ctrl+A=1, Ctrl+C=3, etc.
      if (code > 0 && code < 27) {
        wsClient.send({ type: 'terminal_input', data: String.fromCharCode(code) });
      }
      return;
    }

    if (keyMap[e.key]) {
      e.preventDefault();
      wsClient.send({ type: 'terminal_input', data: keyMap[e.key] });
      return;
    }

    // Regular character - let the input handle it via onInput
  }

  // Capture typed text and send character by character
  function handleInput(e) {
    const data = e.target.value;
    if (data) {
      wsClient.send({ type: 'terminal_input', data });
      e.target.value = ''; // Clear immediately - output comes from terminal
    }
  }

  // Handle paste
  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (text) {
      wsClient.send({ type: 'terminal_input', data: text });
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
              {ready ? 'Connected' : 'Connecting...'}
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

        {/* Hidden input that captures all keystrokes */}
        <input
          ref={inputRef}
          className="terminal-hidden-input"
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        <div className="rich-terminal-status-bar">
          <span>Type here — keystrokes sent live (autocomplete works)</span>
          <span>Ctrl+C to cancel</span>
        </div>
      </div>
    </div>
  );
}
