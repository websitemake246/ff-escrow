const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./src/routes/auth');
const listingRoutes = require('./src/routes/listings');
const dealRoutes = require('./src/routes/deals');
const adminRoutes = require('./src/routes/admin');
const userRoutes = require('./src/routes/user');
const jwtFunc = require('./src/middleware/auth');
const { init: initDB } = require('./src/db');

const { tokenAuth, requireAdmin } = jwtFunc;
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

const db = initDB();
app.use((req, res, next) => { req.db = db; next(); });

app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/user', tokenAuth, userRoutes);
app.use('/api/admin', tokenAuth, requireAdmin, adminRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/session', (req, res) => {
  const token = req.cookies?.ff_token || '';
  if (!token) return res.json({ authenticated: false });
  try {
    const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'ff-escrow-secret');
    const user = db.prepare('SELECT id, username, email, phone, full_name, role FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.json({ authenticated: false });
    res.json({ authenticated: true, user });
  } catch {
    res.json({ authenticated: false });
  }
});

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/portal', tokenAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal.html')));
app.get('/admin', tokenAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', details: process.env.NODE_ENV === 'production' ? undefined : err.message });
});

app.listen(PORT, '0.0.0.0', () => console.log('FF Escrow running on', PORT));
