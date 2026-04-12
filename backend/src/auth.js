const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { stmts } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
const TOKEN_EXPIRY = '7d';
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'rog-tech.com';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, displayName: user.display_name },
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

function validateEmail(email) {
  if (!email || !email.includes('@')) {
    throw new Error('Valid email is required');
  }
  const domain = email.split('@')[1].toLowerCase();
  if (domain !== ALLOWED_DOMAIN) {
    throw new Error(`Only @${ALLOWED_DOMAIN} emails are allowed`);
  }
  return email.toLowerCase().trim();
}

async function register(username, email, password, displayName, deviceName = '') {
  // Validate email domain
  email = validateEmail(email);

  const existingUser = stmts.getUserByUsername.get(username);
  if (existingUser) {
    throw new Error('Username already exists');
  }

  const existingEmail = stmts.getUserByEmail.get(email);
  if (existingEmail) {
    throw new Error('Email already registered');
  }

  const hash = await bcrypt.hash(password, 12);
  const result = stmts.createUser.run(username, email, hash, displayName, deviceName);
  const user = stmts.getUserById.get(result.lastInsertRowid);
  return { user, token: generateToken(user) };
}

async function login(username, password, deviceName = '') {
  // Allow login with username or email
  let user = stmts.getUserByUsername.get(username);
  if (!user) {
    user = stmts.getUserByEmail.get(username.toLowerCase());
  }
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

module.exports = { generateToken, verifyToken, register, login, authMiddleware, ALLOWED_DOMAIN };
