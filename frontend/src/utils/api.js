const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('rog_token');
}

function setAuth(token, user) {
  localStorage.setItem('rog_token', token);
  localStorage.setItem('rog_user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('rog_token');
  localStorage.removeItem('rog_user');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('rog_user'));
  } catch {
    return null;
  }
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function login(username, password, deviceName) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, deviceName }),
  });
  setAuth(data.token, data.user);
  return data;
}

export async function register(username, password, displayName, deviceName) {
  const data = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, displayName, deviceName }),
  });
  setAuth(data.token, data.user);
  return data;
}

export function logout() {
  clearAuth();
  window.location.reload();
}

export async function getSessions() {
  return apiFetch('/sessions');
}

export async function createSession(name) {
  return apiFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function getMessages(sessionId) {
  return apiFetch(`/sessions/${sessionId}/messages`);
}

export { getToken, getUser, clearAuth };
