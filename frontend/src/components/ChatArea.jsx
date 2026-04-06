import React, { useState, useRef, useEffect } from 'react';

export default function ChatArea({
  messages,
  onSendMessage,
  sessionName,
  typingUsers,
  onMenuClick,
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e) {
    setInput(e.target.value);
    // Auto-resize textarea
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
  }

  function formatTime(dateStr) {
    try {
      return new Date(dateStr).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  if (!sessionName) {
    return (
      <div className="chat-area">
        <div className="mobile-header">
          <button className="btn-menu" onClick={onMenuClick}>&#9776;</button>
          <span style={{ fontWeight: 600 }}>Rog Terminal</span>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">&#9002;</div>
          <div className="empty-state-text">Choose a session or create a new one</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      <div className="mobile-header">
        <button className="btn-menu" onClick={onMenuClick}>&#9776;</button>
        <span style={{ fontWeight: 600 }}>{sessionName}</span>
      </div>

      <div className="chat-header" style={{ display: 'var(--desktop-only, flex)' }}>
        <div className="chat-title">{sessionName}</div>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-header">
              <span className="message-author">
                {msg.role === 'assistant' ? 'Claude' : msg.display_name || msg.username || 'User'}
              </span>
              {msg.device_name && (
                <span className="message-device">{msg.device_name}</span>
              )}
              <span className="message-time">{formatTime(msg.created_at)}</span>
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}

        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            <div className="typing-dots">
              <span /><span /><span />
            </div>
            <span>
              {typingUsers.map((u) => u.displayName).join(', ')} typing...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
          />
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
