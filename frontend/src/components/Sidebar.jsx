import React from 'react';
import { logout } from '../utils/api';

export default function Sidebar({
  sessions,
  activeSession,
  onSelectSession,
  onNewSession,
  onlineUsers,
  user,
  isOpen,
  onClose,
}) {
  function formatTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('he-IL');
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
            + session
          </button>
        </div>

        <div className="session-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${activeSession === s.id ? 'active' : ''}`}
              onClick={() => { onSelectSession(s.id); onClose(); }}
            >
              <div className="session-name">{s.name}</div>
              <div className="session-meta">
                {s.creator_name} &middot; {formatTime(s.updated_at)}
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No sessions yet
            </div>
          )}
        </div>

        {onlineUsers.length > 0 && (
          <div className="online-users">
            <div className="online-users-title">Online ({onlineUsers.length})</div>
            {onlineUsers.map((u) => (
              <div key={u.id} className="online-user">
                <span className="online-dot" />
                <span className="online-user-name">{u.displayName}</span>
                {u.deviceName && (
                  <span className="online-user-device">{u.deviceName}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="user-info">
          <div className="user-avatar">
            {user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="user-details">
            <div className="user-display-name">{user?.display_name || user?.username}</div>
            <div className="user-device">{user?.device_name || ''}</div>
          </div>
          <button className="btn-logout" onClick={logout}>Logout</button>
        </div>
      </aside>
    </>
  );
}
