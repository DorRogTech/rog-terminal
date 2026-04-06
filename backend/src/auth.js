const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { stmts } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'rog-terminal-default-secret-change-me';
const TOKEN_EXPIRY = '7d';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function register(username, password, displayName, deviceName = '') {
  const existing = stmts.getUserByUsername.get(username);
  if (existing) {
    throw new Error('Username already exists');
  }
  const hash = await bcrypt.hash(password, 12);
  const result = stmts.createUser.run(username, hash, displayName, deviceName);
  const user = stmts.getUserById.get(result.lastInsertRowid);
  return { user, token: generateToken(user) };
}

async function login(username, password, deviceName = '') {
  const user = stmts.getUserByUsername.get(username);
  if (!user) {
    throw new Error('Invalid credentials');
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }
  stmts.updateLastSeen.run(deviceName, user.id);
  const safeUser = stmts.getUserById.get(user.id);
  return { user: safeUser, token: generateToken(safeUser) };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const decoded = verifyToken(header.slice(7));
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = decoded;
  next();
}

module.exports = { generateToken, verifyToken, register, login, authMiddleware };
