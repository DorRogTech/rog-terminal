import React, { useState, useEffect } from 'react';
import { configureClaude, getMcpStatus, startMcp, saveApiKey } from '../utils/api';

export default function SettingsModal({ user, activeSession, onClose, onSave }) {
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [deviceName, setDeviceName] = useState(user?.device_name || '');
  const [apiKey, setApiKey] = useState(user?.claude_api_key || localStorage.getItem('rog_claude_api_key') || '');
  const [model, setModel] = useState(localStorage.getItem('rog_claude_model') || 'claude-sonnet-4-20250514');
  const [notifications, setNotifications] = useState(
    localStorage.getItem('rog_notifications') !== 'false'
  );
  const [mcpStatus, setMcpStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getMcpStatus()
      .then(setMcpStatus)
      .catch(() => setMcpStatus({ ready: false }));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      localStorage.setItem('rog_claude_api_key', apiKey);
      localStorage.setItem('rog_claude_model', model);
      localStorage.setItem('rog_notifications', notifications);

      // Save API key to server (for fallback when CLI not available)
      if (apiKey) {
        await saveApiKey(apiKey);
      }

      setMessage('Settings saved!');

      onSave({ displayName, deviceName });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStartMcp() {
    try {
      setMessage('Starting MCP bridge...');
      await startMcp();
      const status = await getMcpStatus();
      setMcpStatus(status);
      setMessage(`MCP ready! ${status.tools?.length || 0} tools available.`);
    } catch (err) {
      setError(`MCP start failed: ${err.message}`);
    }
  }

  async function handleConfigureSession() {
    if (!activeSession) {
      setError('Join a session first');
      return;
    }
    if (!apiKey) {
      setError('Enter your Claude API key first');
      return;
    }
    try {
      setSaving(true);
      localStorage.setItem('rog_claude_api_key', apiKey);
      localStorage.setItem('rog_claude_model', model);
      await configureClaude(activeSession, apiKey, model);
      setMessage('Claude is now active for this session! Send a message to chat.');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Claude API Section */}
          <div className="settings-section">
            <h3 className="settings-section-title">Claude API - AI Chat</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              If the server has Claude Code installed, it works automatically.
              Otherwise, add your own Anthropic API key to connect your Claude account.
              Get a key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>console.anthropic.com</a>
            </p>
            <div className="form-group">
              <label className="form-label">API Key</label>
              <input
                className="form-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                dir="ltr"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Model</label>
              <select
                className="form-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                dir="ltr"
              >
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-opus-4-20250514">Claude Opus 4</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
              </select>
            </div>
            {activeSession && (
              <button
                className="btn-primary"
                style={{ width: 'auto', padding: '8px 16px', fontSize: '13px', marginTop: '4px' }}
                onClick={handleConfigureSession}
                disabled={saving || !apiKey}
              >
                {saving ? '...' : 'Activate Claude for this session'}
              </button>
            )}
          </div>

          {/* MCP Section */}
          <div className="settings-section">
            <h3 className="settings-section-title">MCP Bridge - Claude Code Tools</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Connect to Claude Code MCP server for file editing, terminal, and more.
              Requires Claude Code installed on the server machine.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`connection-badge ${mcpStatus?.ready ? 'connected' : 'disconnected'}`}>
                {mcpStatus?.ready ? `Connected (${mcpStatus.tools?.length || 0} tools)` : 'Disconnected'}
              </span>
              {!mcpStatus?.ready && (
                <button
                  className="btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                  onClick={handleStartMcp}
                >
                  Start MCP
                </button>
              )}
            </div>
            {mcpStatus?.tools?.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                Tools: {mcpStatus.tools.map(t => t.name).join(', ')}
              </div>
            )}
          </div>

          {/* Profile Section */}
          <div className="settings-section">
            <h3 className="settings-section-title">Profile</h3>
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input className="form-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Device Name</label>
              <input className="form-input" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
            </div>
          </div>

          {/* Notifications */}
          <div className="settings-section">
            <h3 className="settings-section-title">Notifications</h3>
            <label className="toggle-row">
              <span>Push Notifications</span>
              <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
            </label>
          </div>

          {/* Status messages */}
          {message && <div style={{ color: 'var(--success)', fontSize: '13px', textAlign: 'center', padding: '8px' }}>{message}</div>}
          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '10px 24px' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
