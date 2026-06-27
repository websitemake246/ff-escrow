const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();
const { prepare } = require('../db');
const { tokenAuth, requireAdmin } = require('../middleware/auth');

router.get('/stats', tokenAuth, requireAdmin, (req, res) => {
  const totalUsers = prepare().get('select count(*) as count from users where role = ?', 'user').count;
  const totalDeals = prepare().get('select count(*) as count from deals').count;
  const openListings = prepare().get('select count(*) as count from listings where status = ?', 'open').count;
  const pendingDeals = prepare().get('select count(*) as count from deals where status = ?', 'pending_payment').count;
  const activeDeals = prepare().get('select count(*) as count from deals where status in (?, ?, ?, ?)', 'payment_confirmed', 'accounts_shared', 'verified', 'disputed').count;
  const completedDeals = prepare().get('select count(*) as count from deals where status = ?', 'completed').count;
  const disputedDeals = prepare().get('select count(*) as count from deals where status = ?', 'disputed').count;
  res.json({ totalUsers, totalDeals, openListings, pendingDeals, activeDeals, completedDeals, disputedDeals });
});

router.get('/users', tokenAuth, requireAdmin, (req, res) => res.json({ users: prepare().all('select id, username, email, phone, full_name, role, verification_status, created_at from users order by created_at desc') || [] }));

router.get('/deals', tokenAuth, requireAdmin, (req, res) => res.json({ deals: prepare().all('select * from deals order by created_at desc') || [] }));

router.get('/deals/:id', tokenAuth, requireAdmin, (req, res) => {
  const deal = prepare().get('select * from deals where id = ?', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Not found' });
  const seller = prepare().get('select username, email, phone, bank_name, account_number, account_name from users where id = ?', deal.seller_id);
  const buyer = prepare().get('select username, email, phone from users where id = ?', deal.buyer_id);
  res.json({ deal, buyer, seller });
});

router.post('/deals/:id/verify', tokenAuth, requireAdmin, (req, res) => {
  const deal = prepare().get('select * from deals where id = ?', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Not found' });
  if (!['accounts_shared', 'payment_confirmed'].includes(deal.status)) return res.status(400).json({ error: 'Invalid state' });
  prepare().run('update deals set status = "verified", updated_at = ? where id = ?', new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

router.post('/deals/:id/reject', tokenAuth, requireAdmin, (req, res) => {
  const deal = prepare().get('select * from deals where id = ?', req.params.id);
  if (!deal || deal.status !== 'accounts_shared') return res.status(400).json({ error: 'Invalid state' });
  prepare().run('update deals set status = "payment_confirmed", seller_account_details = NULL, updated_at = ? where id = ?', new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

router.get('/disputes', tokenAuth, requireAdmin, (req, res) => {
  const disputes = prepare().all('select * from disputes order by created_at desc') || [];
  res.json({ disputes });
});

router.get('/disputes/:id', tokenAuth, requireAdmin, (req, res) => {
  const dispute = prepare().get('select * from disputes where id = ?', req.params.id);
  if (!dispute) return res.status(404).json({ error: 'Not found' });
  const deal = prepare().get('select * from deals where id = ?', dispute.deal_id);
  const buyer = prepare().get('select username, email from users where id = ?', deal.buyer_id);
  const seller = prepare().get('select username, email from users where id = ?', deal.seller_id);
  const messages = prepare().all('select dm.*, u.username as user_username, u.role as user_role from dispute_messages dm join users u on dm.user_id = u.id where dm.dispute_id = ? order by dm.created_at asc', dispute.id);
  res.json({ dispute, deal, buyer, seller, messages });
});

router.post('/disputes/:id/message', tokenAuth, requireAdmin, (req, res) => {
  const dispute = prepare().get('select * from disputes where id = ?', req.params.id);
  if (!dispute) return res.status(404).json({ error: 'Not found' });
  prepare().run('insert into dispute_messages (id, dispute_id, user_id, message, attachment_url) values (?, ?, ?, ?, ?)', uuid(), dispute.id, req.user.id, req.body.message, null);
  res.json({ ok: true });
});

router.post('/disputes/:id/resolve', tokenAuth, requireAdmin, (req, res) => {
  const dispute = prepare().get('select * from disputes where id = ?', req.params.id);
  if (!dispute) return res.status(404).json({ error: 'Not found' });
  const { resolution, refund_buyer } = req.body || {};
  prepare().run('update disputes set status = "resolved", resolution = ?, resolved_at = ?, updated_at = ? where id = ?', resolution, new Date().toISOString(), new Date().toISOString(), dispute.id);
  prepare().run('update deals set status = ?, updated_at = ? where id = ?', refund_buyer ? 'refunded' : 'released', new Date().toISOString(), dispute.deal_id);
  res.json({ ok: true });
});

router.get('/activity', tokenAuth, requireAdmin, (req, res) => res.json({ activities: prepare().all('select * from activity_logs order by created_at desc') || [] }));
module.exports = router;
