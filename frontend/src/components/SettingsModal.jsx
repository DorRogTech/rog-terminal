import React, { useState } from 'react';

export default function SettingsModal({ user, onClose, onSave }) {
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [deviceName, setDeviceName] = useState(user?.device_name || '');
  const [mcpCommand, setMcpCommand] = useState(localStorage.getItem('rog_mcp_command') || '');
  const [mcpArgs, setMcpArgs] = useState(localStorage.getItem('rog_mcp_args') || '');
  const [claudeApiKey, setClaudeApiKey] = useState(localStorage.getItem('rog_claude_api_key') || '');
  const [notifications, setNotifications] = useState(
    localStorage.getItem('rog_notifications') !== 'false'
  );
  const [sound, setSound] = useState(
    localStorage.getItem('rog_sound') !== 'false'
  );

  function handleSave() {
    localStorage.setItem('rog_mcp_command', mcpCommand);
    localStorage.setItem('rog_mcp_args', mcpArgs);
    localStorage.setItem('rog_claude_api_key', claudeApiKey);
    localStorage.setItem('rog_notifications', notifications);
    localStorage.setItem('rog_sound', sound);
    onSave({ displayName, deviceName, mcpCommand, mcpArgs, claudeApiKey, notifications, sound });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
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

          <div className="settings-section">
            <h3 className="settings-section-title">MCP Connection</h3>
            <div className="form-group">
              <label className="form-label">MCP Server Command</label>
              <input
                className="form-input"
                value={mcpCommand}
                onChange={(e) => setMcpCommand(e.target.value)}
                placeholder="e.g., npx -y @anthropic-ai/claude-code --mcp"
                dir="ltr"
              />
            </div>
            <div className="form-group">
              <label className="form-label">MCP Arguments (comma separated)</label>
              <input
                className="form-input"
                value={mcpArgs}
                onChange={(e) => setMcpArgs(e.target.value)}
                placeholder="e.g., --project, /path/to/project"
                dir="ltr"
              />
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Claude API</h3>
            <div className="form-group">
              <label className="form-label">API Key (for linked accounts)</label>
              <input
                className="form-input"
                type="password"
                value={claudeApiKey}
                onChange={(e) => setClaudeApiKey(e.target.value)}
                placeholder="sk-ant-..."
                dir="ltr"
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Add your Claude API key to enable shared project collaboration
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Notifications</h3>
            <label className="toggle-row">
              <span>Push Notifications</span>
              <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
            </label>
            <label className="toggle-row">
              <span>Sound</span>
              <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
