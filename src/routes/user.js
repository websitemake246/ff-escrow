const express = require('express');
const router = express.Router();
const { prepare } = require('../db');
const { tokenAuth } = require('../middleware/auth');

router.get('/profile', tokenAuth, (req, res) => {
  const user = prepare().get('select id, username, email, phone, full_name, role, bank_name, account_number, account_name from users where id = ?', req.user.id);
  res.json({ user });
});
router.put('/profile', tokenAuth, (req, res) => {
  const { phone, full_name, bank_name, account_number, account_name } = req.body || {};
  prepare().run('update users set phone=?, full_name=?, bank_name=?, account_number=?, account_name=?, updated_at=? where id=?', phone || '', full_name || '', bank_name || '', account_number || '', account_name || '', new Date().toISOString(), req.user.id);
  res.json({ user: prepare().get('select id, username, email, phone, full_name, role from users where id = ?', req.user.id) });
});
module.exports = router;
