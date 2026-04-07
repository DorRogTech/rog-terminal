import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

export default function ChatArea({
  messages,
  onSendMessage,
  sessionName,
  typingUsers,
  onMenuClick,
  currentUser,
  onOpenTerminal,
  onOpenProjects,
  hasActiveSession,
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typingUsers, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(atBottom);
  }, []);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput('');
    setAutoScroll(true);
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

  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) return 'Today';
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
      return d.toLocaleDateString('he-IL');
    } catch {
      return '';
    }
  }

  // Group messages by date
  function getDateSeparators() {
    const dates = new Map();
    messages.forEach((msg, idx) => {
      const date = formatDate(msg.created_at);
      if (!dates.has(date)) {
        dates.set(date, idx);
      }
    });
    return dates;
  }

  const dateSeparators = getDateSeparators();

  if (!sessionName) {
    return (
      <div className="chat-area">
        <div className="mobile-header">
          <button className="btn-menu" onClick={onMenuClick}>&#9776;</button>
          <span style={{ fontWeight: 600, flex: 1 }}>Rog Terminal</span>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </div>
          <div className="empty-state-text">Select a session or create a new one</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Collaborative MCP Terminal
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      <div className="mobile-header">
        <button className="btn-menu" onClick={onMenuClick}>&#9776;</button>
        <span style={{ fontWeight: 600, flex: 1 }}>{sessionName}</span>
        {hasActiveSession && (
          <>
            <button className="btn-terminal" onClick={onOpenProjects} style={{ padding: '6px 10px', fontSize: '14px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button className="btn-terminal" onClick={onOpenTerminal} style={{ padding: '6px 10px' }}>
              >_
            </button>
          </>
        )}
      </div>

      <div className="chat-header desktop-only">
        <div className="chat-title">{sessionName}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasActiveSession && (
            <>
              <button className="btn-terminal" onClick={onOpenProjects}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Project
              </button>
              <button className="btn-terminal" onClick={onOpenTerminal}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                Terminal
              </button>
            </>
          )}
          <span className="connection-badge connected">Connected</span>
        </div>
      </div>

      <div
        className="chat-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {messages.length === 0 && (
          <div className="empty-state" style={{ padding: '40px 0' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              No messages yet. Start the conversation!
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const dateLabel = [...dateSeparators.entries()].find(([, i]) => i === idx)?.[0];
          const isOwnMessage = currentUser && msg.user_id === currentUser.id;

          return (
            <React.Fragment key={msg.id}>
              {dateLabel && (
                <div className="date-separator">
                  <span>{dateLabel}</span>
                </div>
              )}
              <div className={`message ${msg.role} ${isOwnMessage ? 'own' : ''}`}>
                <div className="message-header">
                  {msg.role === 'assistant' ? (
                    <span className="message-author assistant-name">Claude</span>
                  ) : (
                    <span className="message-author">{msg.display_name || msg.username || 'User'}</span>
                  )}
                  {msg.device_name && (
                    <span className="message-device">{msg.device_name}</span>
                  )}
                  <span className="message-time">{formatTime(msg.created_at)}</span>
                </div>
                <div className="message-content">
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}

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

      {!autoScroll && messages.length > 0 && (
        <button
          className="scroll-to-bottom"
          onClick={() => {
            setAutoScroll(true);
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          &#8595;
        </button>
      )}

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Write a message..."
            rows={1}
          />
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={!input.trim()}
            title="Send (Enter)"
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
