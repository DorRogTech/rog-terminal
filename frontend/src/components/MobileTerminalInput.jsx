import React, { useState, useRef, useCallback } from 'react';
import useCommandHistory from '../hooks/useCommandHistory';

/**
 * Sticky bottom input bar for mobile terminal.
 * - Text input (16px font to prevent iOS zoom, dir="auto", enterKeyHint="send")
 * - Send button
 * - Horizontal scroll quick-action buttons (Ctrl+C, Ctrl+D, Tab, Up, Down, Esc) at 44x44px min
 * - Uses useCommandHistory for up/down recall
 * - Only uses onTouchEnd (with preventDefault) for buttons, no onClick to prevent double-fire
 */
export default function MobileTerminalInput({ onSend, onSpecialKey, ready }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  const { addCommand, navigateUp, navigateDown, resetNavigation } = useCommandHistory();

  const handleSend = useCallback(() => {
    if (!input || !ready) return;
    addCommand(input);
    onSend(input + '\r');
    setInput('');
    resetNavigation();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [input, ready, onSend, addCommand, resetNavigation]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const val = navigateUp(input);
      setInput(val);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const val = navigateDown();
      setInput(val);
    }
  }, [handleSend, navigateUp, navigateDown, input]);

  const handleSpecialTouch = useCallback((key, e) => {
    e.preventDefault();
    onSpecialKey(key);
  }, [onSpecialKey]);

  const quickActions = [
    { key: 'ctrl-c', label: '^C' },
    { key: 'ctrl-d', label: '^D' },
    { key: 'tab', label: 'Tab' },
    { key: 'up', label: '\u25B2' },
    { key: 'down', label: '\u25BC' },
    { key: 'escape', label: 'Esc' },
  ];

  return (
    <div className="mobile-terminal-input-bar">
      <div className="mobile-terminal-quick-actions">
        {quickActions.map(({ key, label }) => (
          <button
            key={key}
            className="terminal-quick-btn"
            onTouchEnd={(e) => handleSpecialTouch(key, e)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mobile-terminal-input-row">
        <input
          ref={inputRef}
          className="mobile-terminal-text-input"
          type="text"
          inputMode="text"
          enterKeyHint="send"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="\u05D4\u05E7\u05DC\u05D3 \u05E4\u05E7\u05D5\u05D3\u05D4..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          dir="auto"
          disabled={!ready}
        />
        <button
          className="mobile-terminal-send-btn"
          onTouchEnd={(e) => { e.preventDefault(); handleSend(); }}
          disabled={!input || !ready}
        >
          &#9654;
        </button>
      </div>
    </div>
  );
}
