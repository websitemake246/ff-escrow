const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();
const { prepare } = require('../db');
const { tokenAuth } = require('../middleware/auth');

router.get('/my', tokenAuth, (req, res) => {
  const rows = prepare().all('select * from deals where buyer_id = ? or seller_id = ? order by created_at desc', req.user.id, req.user.id);
  res.json({ deals: rows || [] });
});

router.post('/', tokenAuth, (req, res) => {
  const { listing_id } = req.body || {};
  const listing = prepare().get('select l.*, u.id as seller_id, u.username as seller_username from listings l join users u on l.user_id = u.id where l.id = ? and l.status = "open"', listing_id);
  if (!listing) return res.status(404).json({ error: 'Listing unavailable' });
  if (listing.seller_id === req.user.id) return res.status(400).json({ error: 'Cannot buy your own listing' });
  const middlemanFee = 100000;
  const dealId = uuid();
  const deal = {
    id: dealId, listing_id: Number(listing_id), buyer_id: req.user.id, seller_id: listing.seller_id,
    amount_kobo: Number(listing.price_kobo), middleman_fee_kobo: middlemanFee,
    paystack_ref: null, status: 'pending_payment', auto_release_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
    buyer_confirmed: 0, seller_confirmed: 0, accounts_shared_at: null, completed_at: null,
    disputed_at: null, dispute_reason: null, seller_account_details: null, evidence_urls: '[]',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  prepare().run('insert into deals (id, listing_id, buyer_id, seller_id, amount_kobo, middleman_fee_kobo, status) values (?, ?, ?, ?, ?, ?, ?)', deal.id, deal.listing_id, deal.buyer_id, deal.seller_id, deal.amount_kobo, deal.middleman_fee_kobo, deal.status);
  prepare().run('update listings set status="pending_payment", updated_at=? where id=?', new Date().toISOString(), listing.id);
  res.status(201).json({ deal });
});

router.post('/:id/pay', tokenAuth, (req, res) => {
  const deal = prepare().get('select * from deals where id = ?', req.params.id);
  if (!deal || deal.buyer_id !== req.user.id) return res.status(404).json({ error: 'Deal not found' });
  const { paystack_ref } = req.body || {};
  if (deal.status !== 'pending_payment') return res.status(400).json({ error: 'Cannot update payment' });
  prepare().run('update deals set status = "payment_confirmed", paystack_ref = ?, updated_at = ? where id = ?', paystack_ref || null, new Date().toISOString(), deal.id);
  res.json({ ok: true, deal: prepare().get('select * from deals where id = ?', req.params.id) });
});

router.get('/:id/credentials', tokenAuth, (req, res) => {
  const deal = prepare().get('select * from deals where id = ?', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Not found' });
  if (![deal.buyer_id, deal.seller_id].includes(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json({ credentials: deal.seller_account_details || {} });
});

router.post('/:id/credentials', tokenAuth, (req, res) => {
  const deal = prepare().get('select * from deals where id = ?', req.params.id);
  if (!deal || deal.seller_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  if (deal.status !== 'payment_confirmed') return res.status(400).json({ error: 'Cannot upload now' });
  const details = { ff_email: req.body.ff_email || req.body.username, ff_password: req.body.ff_password, ff_uid: req.body.ff_uid || '', notes: req.body.notes || '' };
  prepare().run('update deals set seller_account_details = ?, status = "accounts_shared", accounts_shared_at = ?, updated_at = ? where id = ?', JSON.stringify(details), new Date().toISOString(), new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

router.post('/:id/verify', tokenAuth, (req, res) => {
  const deal = prepare().get('select * from deals where id = ?', req.params.id);
  if (!deal || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  if (!['accounts_shared', 'payment_confirmed'].includes(deal.status)) return res.status(400).json({ error: 'Invalid state' });
  prepare().run('update deals set status = "verified", updated_at = ? where id = ?', new Date().toISOString(), req.params.id);
  res.json({ ok: true, status: 'verified' });
});

router.post('/:id/confirm', tokenAuth, (req, res) => {
  const deal = prepare().get('select * from deals where id = ?', req.params.id);
  if (!deal || deal.buyer_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  if (deal.status !== 'verified') return res.status(400).json({ error: 'Not verifiable' });
  prepare().run('update deals set status = "completed", buyer_confirmed = 1, completed_at = ?, updated_at = ? where id = ?', new Date().toISOString(), new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

router.post('/:id/dispute', tokenAuth, (req, res) => {
  const { reason } = req.body || {};
  if (!reason || reason.length < 10) return res.status(400).json({ error: 'Provide a reason (min 10 chars)' });
  const disputeId = uuid();
  prepare().run('insert into disputes (id, deal_id, opened_by, reason, status) values (?, ?, ?, ?, ?)', disputeId, req.params.id, req.user.id, reason, 'open');
  prepare().run('update deals set status = "disputed", dispute_reason = ?, disputed_at = ?, updated_at = ? where id = ?', reason, new Date().toISOString(), new Date().toISOString(), req.params.id);
  res.status(201).json({ dispute: prepare().get('select * from disputes where id = ?', disputeId) });
});

router.get('/:id', tokenAuth, (req, res) => {
  const deal = prepare().get('select * from deals where id = ?', req.params.id);
  if (!deal || (deal.buyer_id !== req.user.id && deal.seller_id !== req.user.id && req.user.role !== 'admin')) return res.status(404).json({ error: 'Not found' });
  res.json({ deal });
});

module.exports = router;
