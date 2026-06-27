const express = require('express');
const router = express.Router();
const { prepare } = require('../db');
const { tokenAuth } = require('../middleware/auth');

router.get('/', tokenAuth, (req, res) => res.json({ listings: prepare().all('select * from listings where status = "open" order by created_at desc') || [] }));
router.get('/mine', tokenAuth, (req, res) => res.json({ listings: prepare().all('select * from listings where user_id = ? order by created_at desc', req.user.id) || [] }));
router.post('/', tokenAuth, (req, res) => {
  const { title, platform, description, price_kobo, evidence_urls } = req.body || {};
  if (!title || !platform || !Number(price_kobo)) return res.status(400).json({ error: 'Invalid listing' });
  const info = prepare().run('insert into listings (user_id, title, platform, description, price_kobo, evidence_urls) values (?, ?, ?, ?, ?, ?)', req.user.id, title, platform, description || '', Number(price_kobo), JSON.stringify(evidence_urls || []));
  const listing = prepare().get('select * from listings where id = ?', info.lastInsertRowid);
  res.status(201).json({ listing });
});
router.put('/:id', tokenAuth, (req, res) => {
  const list = prepare().get('select * from listings where id = ?', req.params.id);
  if (!list || list.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  const { title, platform, description, price_kobo, evidence_urls } = req.body || {};
  prepare().run('update listings set title=?, platform=?, description=?, price_kobo=?, evidence_urls=?, updated_at=? where id=?', title, platform, description, Number(price_kobo), JSON.stringify(evidence_urls || []), new Date().toISOString(), req.params.id);
  res.json({ listing: prepare().get('select * from listings where id = ?', req.params.id) });
});
router.delete('/:id', tokenAuth, (req, res) => {
  const list = prepare().get('select * from listings where id = ?', req.params.id);
  if (!list || list.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  prepare().run('delete from listings where id = ?', req.params.id);
  res.json({ ok: true });
});
module.exports = router;
