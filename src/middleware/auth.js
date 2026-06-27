const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { prepare } = require('../db');

const SECRET=(process.env && process.env.JWT_SECRET) ? String(process.env.JWT_SECRET) : 'ff-escrow-secret';
const EXPIRE = '7d';

const tokenAuth = (req, res, next) => {
  const auth = req.headers['x-ff-token'] || req.headers.authorization || '';
  const token = String(auth).replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  let decoded;
  try { decoded = jwt.verify(token, SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  const user = prepare().get('select id, username, email, phone, full_name, role, verification_status from users where id = ?', decoded.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};

const sign = (user) => jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: EXPIRE });

const hash = (password) => bcrypt.hashSync(password, 10);
const compare = (password, h) => bcrypt.compareSync(password, h);

module.exports = { tokenAuth, requireAdmin, sign, hash, compare };
