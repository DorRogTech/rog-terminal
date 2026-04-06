import React, { useState } from 'react';
import { login, register } from '../utils/api';

export default function AuthPage({ onAuth }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [deviceName, setDeviceName] = useState(() => getDeviceName());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const data = await login(username, password, deviceName);
        onAuth(data.user, data.token);
      } else {
        if (!displayName.trim()) {
          setError('display name is required');
          setLoading(false);
          return;
        }
        const data = await register(username, password, displayName, deviceName);
        onAuth(data.user, data.token);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-title">Rog Terminal</div>
        <div className="auth-subtitle">
          {isLogin ? 'Login to your account' : 'Create new account'}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoComplete="username"
              dir="ltr"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              dir="ltr"
            />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                className="form-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Device Name</label>
            <input
              className="form-input"
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="My Phone / My PC"
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? '...' : isLogin ? 'Login' : 'Register'}
          </button>
        </form>

        <div className="auth-switch">
          {isLogin ? (
            <>No account? <a onClick={() => { setIsLogin(false); setError(''); }}>Register</a></>
          ) : (
            <>Have an account? <a onClick={() => { setIsLogin(true); setError(''); }}>Login</a></>
          )}
        </div>
      </div>
    </div>
  );
}

function getDeviceName() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}
