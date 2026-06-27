const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { prepare } = require('../db');

const SECRET = process.env.JWT_SECRET || 'ff-escrow-secret';
const EXPIRE = '7d';

function tokenAuth(req, res, next) {
  const auth = req.headers['x-ff-token'] || req.headers.authorization || '';
  const token = String(auth).replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = prepare().get('select id, username, email, phone, full_name, role, verification_status from users where id = ?', decoded.id);
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    return next();
  } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: EXPIRE });
}

function hash(password) { return bcrypt.hashSync(password, 10); }
function compare(password, hash) { return bcrypt.compareSync(password, hash); }

module.exports = {
  tokenAuth, requireAdmin, sign, hash, compare
};
