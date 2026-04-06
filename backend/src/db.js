const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'rog-terminal.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    device_name TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'New Session',
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_id INTEGER,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    device_name TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
`);

// Prepared statements
const stmts = {
  createUser: db.prepare(
    'INSERT INTO users (username, password_hash, display_name, device_name) VALUES (?, ?, ?, ?)'
  ),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserById: db.prepare('SELECT id, username, display_name, device_name, last_seen FROM users WHERE id = ?'),
  updateLastSeen: db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP, device_name = ? WHERE id = ?'),
  getAllUsers: db.prepare('SELECT id, username, display_name, device_name, last_seen FROM users'),

  createSession: db.prepare('INSERT INTO sessions (id, name, created_by) VALUES (?, ?, ?)'),
  getSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  getAllSessions: db.prepare('SELECT s.*, u.display_name as creator_name FROM sessions s JOIN users u ON s.created_by = u.id ORDER BY s.updated_at DESC'),
  updateSessionTime: db.prepare('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  renameSession: db.prepare('UPDATE sessions SET name = ? WHERE id = ?'),

  addMessage: db.prepare(
    'INSERT INTO messages (session_id, user_id, role, content, device_name) VALUES (?, ?, ?, ?, ?)'
  ),
  getMessages: db.prepare(
    'SELECT m.*, u.display_name, u.username FROM messages m LEFT JOIN users u ON m.user_id = u.id WHERE m.session_id = ? ORDER BY m.created_at ASC'
  ),
  getRecentMessages: db.prepare(
    'SELECT m.*, u.display_name, u.username FROM messages m LEFT JOIN users u ON m.user_id = u.id WHERE m.session_id = ? ORDER BY m.created_at DESC LIMIT ?'
  ),
};

module.exports = { db, stmts };
