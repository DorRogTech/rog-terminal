import React, { useState } from 'react';
import { logout } from '../utils/api';

export default function Sidebar({
  sessions,
  activeSession,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onlineUsers,
  user,
  isOpen,
  onClose,
  onOpenSettings,
  connected,
  claudeStatus,
  onReconnectClaude,
  onClaudeAuth,
  oauthPending,
  onOAuthCode,
  onOAuthCancel,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [oauthCode, setOauthCode] = useState('');

  function formatTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('he-IL');
  }

  function handleContextMenu(e, session) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, session });
  }

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            ROG <span>Terminal</span>
          </div>
          <button className="btn-new-session" onClick={onNewSession}>
            + Session
          </button>
        </div>

        <div className="session-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${activeSession === s.id ? 'active' : ''}`}
              onClick={() => { onSelectSession(s.id); onClose(); }}
              onContextMenu={(e) => handleContextMenu(e, s)}
            >
              <div className="session-name">{s.name}</div>
              <div className="session-meta">
                {s.creator_name} &middot; {formatTime(s.updated_at)}
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              <div style={{ fontSize: '32px', opacity: 0.3, marginBottom: '12px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </div>
              No sessions yet.<br />
              Create one to start collaborating.
            </div>
          )}
        </div>

        {onlineUsers.length > 0 && (
          <div className="online-users">
            <div className="online-users-title">Online ({onlineUsers.length})</div>
            {onlineUsers.map((u) => (
              <div key={`${u.id}-${u.deviceName}`} className="online-user">
                <span className="online-dot" />
                <span className="online-user-name">{u.displayName}</span>
                {u.deviceName && (
                  <span className="online-user-device">{u.deviceName}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Claude Connection Status */}
        {claudeStatus && (() => {
          if (claudeStatus.checking) {
            return (
              <div className="mcp-status-bar">
                <div className="mcp-status-row">
                  <span className="mcp-dot checking" />
                  <span className="mcp-label">בודק חיבור ל-Claude...</span>
                </div>
              </div>
            );
          }
          const agentOk = claudeStatus.agent?.connected;
          const cliOk = claudeStatus.cli?.ready;
          const apiKeyOk = claudeStatus.apiKey?.ready;
          const isConnected = agentOk || cliOk || apiKeyOk;
          const statusClass = isConnected ? 'connected' : 'disconnected';
          const label = agentOk
            ? `Claude מחובר (${claudeStatus.agent.deviceName || 'Agent'})`
            : cliOk ? 'Claude מחובר (CLI)'
            : apiKeyOk ? 'Claude מחובר'
            : 'Claude מנותק';
          return (
            <div className="mcp-status-bar">
              <div className="mcp-status-row">
                <span className={`mcp-dot ${statusClass}`} />
                <span className="mcp-label">{label}</span>
              </div>
              {!isConnected && !oauthPending && (
                <div className="mcp-actions">
                  <button className="mcp-auth-link" onClick={onClaudeAuth}>
                    התחבר לחשבון Claude
                  </button>
                  <button className="mcp-reconnect-btn" onClick={onReconnectClaude}>
                    בדוק שוב
                  </button>
                </div>
              )}
              {oauthPending && (
                <div className="oauth-code-input">
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    התחבר ב-Claude והדבק את הקוד:
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      className="form-input"
                      style={{ flex: 1, padding: '6px 8px', fontSize: '12px', direction: 'ltr' }}
                      placeholder="הדבק קוד כאן..."
                      value={oauthCode}
                      onChange={(e) => setOauthCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && oauthCode.trim()) { onOAuthCode(oauthCode); setOauthCode(''); } }}
                      autoFocus
                    />
                    <button
                      className="mcp-auth-link"
                      style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}
                      onClick={() => { onOAuthCode(oauthCode); setOauthCode(''); }}
                      disabled={!oauthCode.trim()}
                    >
                      שלח
                    </button>
                  </div>
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '10px', cursor: 'pointer', marginTop: '4px', padding: 0 }}
                    onClick={onOAuthCancel}
                  >
                    ביטול
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        <div className="user-info">
          <div className="user-avatar">
            {user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="user-details">
            <div className="user-display-name">
              {user?.display_name || user?.username}
              <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
            </div>
            <div className="user-device">{user?.device_name || ''}</div>
          </div>
          <button className="btn-icon" onClick={onOpenSettings} title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button className="btn-logout" onClick={logout}>Logout</button>
        </div>
      </aside>

      {/* Context menu for sessions */}
      {contextMenu && (
        <>
          <div className="context-overlay" onClick={() => setContextMenu(null)} />
          <div
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button onClick={() => { onRenameSession(contextMenu.session.id); setContextMenu(null); }}>
              Rename
            </button>
            <button
              className="danger"
              onClick={() => { onDeleteSession(contextMenu.session.id); setContextMenu(null); }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </>
  );
}
