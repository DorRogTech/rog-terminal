import React, { useEffect, useRef, useState, useCallback } from 'react';
import wsClient from '../utils/websocket';
import { ansiToHtml } from '../utils/ansi-to-html';

export default function SharedTerminal({ active, onClose, currentProjectName }) {
  const outputRef = useRef(null);
  const inputRef = useRef(null);
  const mobileInputRef = useRef(null);
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [outputHtml, setOutputHtml] = useState('');
  const bufferRef = useRef('');
  const [isMobile, setIsMobile] = useState(false);
  const [mobileInput, setMobileInput] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Reliable mobile detection: touch support + screen width
  useEffect(() => {
    function checkMobile() {
      const mobile = window.innerWidth <= 768 ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0);
      setIsMobile(mobile);
    }
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Detect virtual keyboard open/close via visualViewport API
  useEffect(() => {
    if (!active || !isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;

    function onResize() {
      // When keyboard opens, visualViewport.height shrinks
      const keyboardUp = vv.height < window.innerHeight * 0.75;
      setKeyboardVisible(keyboardUp);
      // Scroll output to bottom when keyboard opens
      if (keyboardUp && outputRef.current) {
        requestAnimationFrame(() => {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        });
      }
    }
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [active, isMobile]);

  useEffect(() => {
    if (!active) return;

    const appendOutput = (data) => {
      bufferRef.current += data;
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
      if (isMobile) {
        mobileInputRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    });
    const unsubClosed = wsClient.on('terminal_closed', () => {
      appendOutput('\n[Terminal closed]\n');
      setReady(false);
    });

    // Send smaller terminal size for mobile
    const cols = isMobile ? 80 : 120;
    const rows = isMobile ? 24 : 40;
    wsClient.send({ type: 'terminal_open', cols, rows });

    return () => {
      unsubOutput();
      unsubHistory();
      unsubReady();
      unsubClosed();
    };
  }, [active, isMobile]);

  useEffect(() => {
    if (active) {
      bufferRef.current = '';
      setOutputHtml('');
    }
  }, [active]);

  // Mobile input handlers
  const handleMobileSend = useCallback(() => {
    if (mobileInput && ready) {
      wsClient.send({ type: 'terminal_input', data: mobileInput + '\r' });
      setMobileInput('');
      // Keep focus on input so keyboard stays open
      setTimeout(() => mobileInputRef.current?.focus(), 50);
    }
  }, [mobileInput, ready]);

  const sendSpecialKey = useCallback((key) => {
    if (!ready) return;
    const keyMap = {
      'ctrl-c': '\x03',
      'ctrl-d': '\x04',
      'ctrl-z': '\x1a',
      'tab': '\t',
      'up': '\x1b[A',
      'down': '\x1b[B',
      'left': '\x1b[C',
      'right': '\x1b[D',
      'escape': '\x1b',
      'enter': '\r',
      'backspace': '\x7f',
    };
    if (keyMap[key]) {
      wsClient.send({ type: 'terminal_input', data: keyMap[key] });
    }
  }, [ready]);

  // Desktop keystroke handlers
  function handleKeyDown(e) {
    if (!ready) return;
    const keyMap = {
      'Enter': '\r', 'Backspace': '\x7f', 'Tab': '\t', 'Escape': '\x1b',
      'ArrowUp': '\x1b[A', 'ArrowDown': '\x1b[B',
      'ArrowRight': '\x1b[C', 'ArrowLeft': '\x1b[D',
      'Home': '\x1b[H', 'End': '\x1b[F', 'Delete': '\x1b[3~',
    };
    if (e.ctrlKey && e.key.length === 1) {
      e.preventDefault();
      const code = e.key.toLowerCase().charCodeAt(0) - 96;
      if (code > 0 && code < 27) {
        wsClient.send({ type: 'terminal_input', data: String.fromCharCode(code) });
      }
      return;
    }
    if (keyMap[e.key]) {
      e.preventDefault();
      wsClient.send({ type: 'terminal_input', data: keyMap[e.key] });
    }
  }

  function handleInput(e) {
    const data = e.target.value;
    if (data) {
      wsClient.send({ type: 'terminal_input', data });
      e.target.value = '';
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (text) wsClient.send({ type: 'terminal_input', data: text });
  }

  if (!active) return null;

  return (
    <div className="shared-terminal-overlay">
      <div
        className={`shared-terminal-container ${isMobile ? 'mobile' : ''} ${keyboardVisible ? 'keyboard-open' : ''}`}
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — compact on mobile */}
        <div className="shared-terminal-header">
          <div className="shared-terminal-title">
            <span className={`terminal-dot ${ready ? 'green' : 'red'}`} />
            {isMobile ? (currentProjectName || 'Terminal') : 'Claude Code — Shared Terminal'}
          </div>
          <div className="shared-terminal-actions">
            {!isMobile && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {ready ? 'Connected' : 'Connecting...'}
              </span>
            )}
            <button className="btn-terminal-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* Terminal output */}
        <div
          className="rich-terminal-output"
          ref={outputRef}
          onClick={() => !isMobile && inputRef.current?.focus()}
          dangerouslySetInnerHTML={{ __html: outputHtml }}
        />

        {/* Desktop: hidden input for keystroke capture */}
        {!isMobile && (
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
        )}

        {/* Mobile: full input area with quick keys */}
        {isMobile && (
          <div className="terminal-mobile-input-area">
            <div className="terminal-mobile-quick-actions">
              <button className="terminal-quick-btn" onTouchEnd={(e) => { e.preventDefault(); sendSpecialKey('ctrl-c'); }}>
                <span className="quick-key-label">^C</span>
              </button>
              <button className="terminal-quick-btn" onTouchEnd={(e) => { e.preventDefault(); sendSpecialKey('ctrl-d'); }}>
                <span className="quick-key-label">^D</span>
              </button>
              <button className="terminal-quick-btn" onTouchEnd={(e) => { e.preventDefault(); sendSpecialKey('tab'); }}>
                <span className="quick-key-label">Tab</span>
              </button>
              <button className="terminal-quick-btn" onTouchEnd={(e) => { e.preventDefault(); sendSpecialKey('up'); }}>
                &#9650;
              </button>
              <button className="terminal-quick-btn" onTouchEnd={(e) => { e.preventDefault(); sendSpecialKey('down'); }}>
                &#9660;
              </button>
              <button className="terminal-quick-btn" onTouchEnd={(e) => { e.preventDefault(); sendSpecialKey('left'); }}>
                &#9664;
              </button>
              <button className="terminal-quick-btn" onTouchEnd={(e) => { e.preventDefault(); sendSpecialKey('right'); }}>
                &#9654;
              </button>
              <button className="terminal-quick-btn" onTouchEnd={(e) => { e.preventDefault(); sendSpecialKey('escape'); }}>
                <span className="quick-key-label">Esc</span>
              </button>
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
                dir="ltr"
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

        {/* Status bar — hidden on mobile when keyboard is up */}
        {!(isMobile && keyboardVisible) && (
          <div className="rich-terminal-status-bar">
            <span>{currentProjectName || 'No project'}{!isMobile ? ' — Type to input' : ''}</span>
            <span>{ready ? (isMobile ? 'Connected' : 'Ctrl+C to cancel') : 'Connecting...'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
