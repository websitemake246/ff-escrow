const fs = require('fs');
const path = require('path');

const DATA_DIR = () => path.join(__dirname, '..', '..', 'data');
const DATA_FILE = () => path.join(DATA_DIR(), 'escrow.json');

function ensureStore() {
  fs.mkdirSync(DATA_DIR(), { recursive: true });
  if (!fs.existsSync(DATA_FILE())) {
    fs.writeFileSync(DATA_FILE(), JSON.stringify({ users: [], listings: [], deals: [], disputes: [], dispute_messages: [], activity_logs: [] }, null, 2));
  }
}

function read() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8')); } catch { return { users: [], listings: [], deals: [], disputes: [], dispute_messages: [], activity_logs: [] }; }
}

function write(store) { fs.writeFileSync(DATA_FILE(), JSON.stringify(store, null, 2)); }

function nextId(list) {
  if (!list || !list.length) return 1;
  return Math.max(1, ...list.map((x) => Number(x.id || 0))) + 1;
}

const SEED_USERS = [
  { id: 1, username: 'admin', email: 'admin@ff.com', phone: '2347014748748', password: '$2a$10$rBV2Tm9H6rNZJ3H5q8ZzE.8q7Z8R9S0T1U2V3W4X5Y6Z7A8B9C0D1E2F3G4H', full_name: 'FF Admin', role: 'admin', verification_status: 'verified', is_verified: 1, bank_name: '', account_number: '', account_name: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
];

function buildDB() {
  let _db = null;
  function load() { if (!_db) { ensureStore(); _db = read(); } return _db; }

  const prepare = () => {
    const db = load();
    return {
      get(...args) { return this.all(...args)[0] || { count: 0 }; },
      all(...args) {
        const sql = String(args[0] || '').trim().toLowerCase();
        if (sql.startsWith('select count(*)')) {
          if (sql.includes("role = 'user'")) return [{ count: (db.users || []).filter((x) => x.role === 'user').length }];
          if (sql.includes("role = 'admin'")) return [{ count: (db.users || []).filter((x) => x.role === 'admin').length }];
          if (sql.includes('from listings')) {
            if (sql.includes("status = 'open'")) return [{ count: (db.listings || []).filter((x) => x.status === 'open').length }];
            return [{ count: (db.listings || []).length }];
          }
          if (sql.includes('from deals')) {
            if (sql.includes("status = 'pending_payment'")) return [{ count: (db.deals || []).filter((x) => x.status === 'pending_payment').length }];
            if (sql.includes("status in ('payment_confirmed','accounts_shared')")) return [{ count: (db.deals || []).filter((x) => ['payment_confirmed','accounts_shared'].includes(x.status)).length }];
            if (sql.includes("status = 'completed'")) return [{ count: (db.deals || []).filter((x) => x.status === 'completed').length }];
            if (sql.includes("status = 'disputed'")) return [{ count: (db.deals || []).filter((x) => x.status === 'disputed').length }];
            return [{ count: (db.deals || []).length }];
          }
          return [{ count: 0 }];
        }

        if (sql.startsWith('select * from users where username = ?')) {
          return [(db.users || []).find((x) => (x.username || '').toLowerCase() === String(args[1] || '').toLowerCase())].filter(Boolean);
        }
        if (sql.startsWith('select * from users where email = ?')) return [(db.users || []).find((x) => (x.email || '').toLowerCase() === String(args[1] || '').toLowerCase())].filter(Boolean);
        if (sql.startsWith('select * from users where id = ?')) return [(db.users || []).find((x) => Number(x.id) === Number(args[1]))].filter(Boolean);
        if (sql.startsWith('select * from listings where user_id = ?')) return JSON.parse(JSON.stringify((db.listings || []).filter((x) => Number(x.user_id) === Number(args[1])))) || [];
        if (sql.includes('from listings l join users u on l.user_id = u.id')) {
          return JSON.parse(JSON.stringify((db.listings || []).map((l) => {
            const u = (db.users || []).find((x) => Number(x.id) === Number(l.user_id));
            return { ...l, seller_email: u ? u.email : '', seller_name: u ? u.full_name : '' };
          })));
        }
        if (sql.includes('from deals d join listings l on d.listing_id = l.id')) {
          return JSON.parse(JSON.stringify((db.deals || []).map((d) => {
            const l = (db.listings || []).find((x) => Number(x.id) === Number(d.listing_id));
            return { ...d, title: l ? l.title : '', platform: l ? l.platform : '', price_kobo: l ? l.price_kobo : 0 };
          })));
        }
        if (sql.startsWith('select * from deals where id = ?')) return [(db.deals || []).find((x) => String(x.id) === String(args[1]))].filter(Boolean);
        if (sql.startsWith('select * from deals where buyer_id = ? or seller_id = ?')) {
          return JSON.parse(JSON.stringify((db.deals || []).filter((x) => Number(x.buyer_id) === Number(args[1]) || Number(x.seller_id) === Number(args[2])))) || [];
        }
        if (sql.startsWith('select * from disputes where deal_id = ?')) {
          return JSON.parse(JSON.stringify((db.disputes || []).filter((x) => String(x.deal_id) === String(args[1])))) || [];
        }
        return [];
      },
      run(...args) {
        const out = { changes: 0, lastInsertRowid: null };
        const sql = String(args[0] || '').trim();

        function updUsers(id, changes) {
          const arr = db.users || [];
          const idx = arr.findIndex((x) => Number(x.id) === Number(id));
          if (idx >= 0) { arr[idx] = { ...arr[idx], ...changes, updated_at: new Date().toISOString() }; out.changes = 1; }
        }
        function updListings(id, changes) {
          const arr = db.listings || [];
          const idx = arr.findIndex((x) => String(x.id) === String(id));
          if (idx >= 0) { arr[idx] = { ...arr[idx], ...changes, updated_at: new Date().toISOString() }; out.changes = 1; }
        }
        function updDeals(id, changes) {
          const arr = db.deals || [];
          const idx = arr.findIndex((x) => String(x.id) === String(id));
          if (idx >= 0) { arr[idx] = { ...arr[idx], ...changes, updated_at: new Date().toISOString() }; out.changes = 1; }
        }
        function updDisputes(id, changes) {
          const arr = db.disputes || [];
          const idx = arr.findIndex((x) => String(x.id) === String(id));
          if (idx >= 0) { arr[idx] = { ...arr[idx], ...changes, updated_at: new Date().toISOString() }; out.changes = 1; }
        }

        if (/update listings set view_count = view_count \+ 1 where id = \?/.test(sql)) {
          const row = (db.listings || []).find((x) => String(x.id) === String(args[1]));
          updListings(args[1], { view_count: Number(row?.view_count || 0) + 1 });
          return out;
        }
        if (/update listings set title=\?, platform=\?, description=\?, price_kobo=\?, evidence_urls=\?, updated_at=\? where id=\?/.test(sql)) {
          updListings(args[7], { title: args[1], platform: args[2], description: args[3], price_kobo: Number(args[4]), evidence_urls: typeof args[5] === 'string' ? args[5] : JSON.stringify(args[5] || []) });
          return out;
        }
        if (/update deals set status = 'completed'/.test(sql)) {
          updDeals(args[3], { status: 'completed', completed_at: args[1] });
          return out;
        }
        if (/update deals set status = \?, updated_at = \? where id = \?/.test(sql)) {
          updDeals(args[3], { status: args[1] });
          return out;
        }
        if (/update deals set seller_account_details = \?, status = 'accounts_shared', accounts_shared_at = \?, updated_at = \? where id = \?/.test(sql)) {
          updDeals(args[4], { seller_account_details: args[1], status: 'accounts_shared', accounts_shared_at: args[2] });
          return out;
        }
        if (/insert into users/.test(sql)) {
          const rec = {
            id: nextId(db.users), username: args[1], email: args[2], phone: args[3] || '', password: args[4], full_name: args[5],
            role: 'user', verification_status: 'unverified', is_verified: 0, bank_name: '', account_number: '', account_name: '',
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
          };
          db.users.push(rec); write(db); out.lastInsertRowid = rec.id; out.changes = 1; return out;
        }
        if (/insert into listings/.test(sql)) {
          const rec = { id: nextId(db.listings), user_id: Number(args[1]), title: args[2], platform: args[3], description: args[4] || '', price_kobo: Number(args[5]), evidence_urls: typeof args[6] === 'string' ? args[6] : JSON.stringify(args[6] || []), status: 'open', verified: 0, view_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          db.listings.push(rec); write(db); out.lastInsertRowid = rec.id; out.changes = 1; return out;
        }
        if (/insert into deals/.test(sql)) {
          const rec = {
            id: args[1] || String(Date.now()), listing_id: Number(args[2]), buyer_id: Number(args[3]), seller_id: Number(args[4]),
            amount_kobo: Number(args[5]), middleman_fee_kobo: Number(args[6]) || 0, paystack_ref: args[7] || null,
            status: args[8] || 'pending_payment', auto_release_at: args[9] || new Date(Date.now() + 7*24*60*60*1000).toISOString(),
            buyer_confirmed: 0, seller_confirmed: 0, accounts_shared_at: null, completed_at: null, disputed_at: null, dispute_reason: null,
            seller_account_details: null, evidence_urls: '[]', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
          };
          db.deals.push(rec);
          const l = (db.listings || []).find((x) => Number(x.id) === Number(args[2]));
          if (l) l.status = 'pending_payment';
          write(db); out.lastInsertRowid = rec.id; out.changes = 1; return out;
        }
        if (/insert into disputes/.test(sql)) {
          db.disputes = db.disputes || [];
          db.disputes.push({ id: args[1], deal_id: String(args[2]), opened_by: Number(args[3]), reason: args[4], status: 'open', resolution: null, admin_notes: null, assigned_admin_id: null, resolved_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          write(db); out.changes = 1; return out;
        }
        if (/insert into dispute_messages/.test(sql)) {
          db.dispute_messages = db.dispute_messages || [];
          db.dispute_messages.push({ id: nextId(db.dispute_messages || []), dispute_id: String(args[1]), user_id: Number(args[2]), message: args[3], attachment_url: args[4] || null, created_at: new Date().toISOString() });
          write(db); out.changes = 1; return out;
        }
        if (/insert into activity_logs/.test(sql)) {
          db.activity_logs = db.activity_logs || [];
          db.activity_logs.push({ id: nextId(db.activity_logs || []), admin_id: Number(args[1]), action: args[2], target_type: args[3], target_id: args[4], details: args[5], ip_address: args[6] || null, created_at: new Date().toISOString() });
          write(db); out.changes = 1; return out;
        }
        return out;
      }
    };
  }

  ensureStore();
  const singleton = prepare();

  return { init: () => singleton, prepare: () => singleton };
}

function initDB() {
  const db = buildDB();
  db.init();
  return db.prepare();
}

module.exports = { prepare: initDB, init: initDB };
