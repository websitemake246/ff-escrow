const express = require('express');
const router = express.Router();
const { prepare } = require('../db');
const { hash, compare } = require('../middleware/auth');

router.post('/register', (req, res) => {
  const { username, email, phone, password, full_name } = req.body || {};
  if (!username || !phone || !password) return res.status(400).json({ error: 'Missing fields' });
  const live = prepare().get('select username, email from users where username = ? or email = ?', username, email);
  if (live.username === username) return res.status(409).json({ error: 'Username in use' });
  if (live.email === email) return res.status(409).json({ error: 'Email in use' });
  const info = prepare().run('insert into users (username, email, phone, password, full_name) values (?, ?, ?, ?, ?)', username, email, phone, hash(password), full_name || username);
  const user = prepare().get('select id, username, email, phone, full_name, role from users where id = ?', info.lastInsertRowid);
  const token = require('../middleware/auth').sign(user);
  res.status(201).json({ token, user });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = prepare().get('select * from users where username = ?', username);
  if (!row || !compare(password, row.password)) return res.status(401).json({ error: 'Invalid credentials' });
  delete row.password;
  res.json({ token: require('../middleware/auth').sign(row), user: row });
});

module.exports = router;
