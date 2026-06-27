(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  const $$ = (s,p=document)=>[...p.querySelectorAll(s)];

  let token = localStorage.getItem('ff_token') || '';
  let user = null;
  let authMode = 'login';

  function getHeaders(){
    const h = { 'Content-Type': 'application/json' };
    if (token) h['x-ff-token'] = token;
    return h;
  }
  async function api(path, opts){
    const res = await fetch('/api'+path, { headers: getHeaders(), ...((opts && opts.body && typeof opts.body === 'object') ? { body: JSON.stringify(opts.body) } : {}), ...(opts && opts.method ? { method: opts.method } : {}) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) throw new Error(data && data.error ? data.error : ('HTTP '+res.status));
    return data;
  }

  function toast(msg){
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(()=>{ el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(()=>el.remove(), 200); }, 3500);
  }

  function updateNav(){
    const nav = $('#mainNav');
    if (!nav) return;
    if (user && user.role === 'admin') {
      nav.innerHTML = '<a href="#/admin">Admin</a><a href="#/deals">Deals</a>';
    } else {
      nav.innerHTML = '<a href="#/browse">Browse</a><a href="#/sell">Sell</a><a href="#/deals">Deals</a>';
    }
    const actions = $('#navActions');
    if (!actions) return;
    if (token) {
      actions.innerHTML = '<span class="muted" style="color:var(--text-sec)">'+(user&&user.username?user.username:'')+'</span><a class="btn btn-ghost btn-sm" href="#/profile">Profile</a><a class="btn btn-ghost btn-sm" href="#" id="logoutBtn">Logout</a>';
      $('#logoutBtn').onclick = function(e){ e.preventDefault(); token=''; user=null; localStorage.removeItem('ff_token'); updateNav(); toast('Logged out'); };
    } else {
      actions.innerHTML = '<a class="btn btn-ghost btn-sm" href="#/login">Login</a><a class="btn btn-primary btn-sm" href="#/register">Register</a>';
    }
  }

  async function me(){
    try {
      const res = await fetch('/api/session', { headers: getHeaders() });
      const text2 = await res.text();
      let data;
      try { data = JSON.parse(text2); } catch { data = { authenticated: false }; }
      if (data && data.authenticated) user = data.user;
      else { token=''; user=null; localStorage.removeItem('ff_token'); }
    } catch { token=''; user=null; localStorage.removeItem('ff_token'); }
    updateNav();
  }

  function showSection(id){
    $$('.page').forEach(function(p){ p.classList.add('hidden'); });
    const el = $('#'+id);
    if (el) el.classList.remove('hidden');
  }

  async function loadBrowse(){
    const list = $('#listGrid');
    if (!list) return;
    list.innerHTML = '<div class="muted">Loading...</div>';
    try {
      const resp = await api('/listings');
      const listings = (resp && resp.listings) ? resp.listings : [];
      list.innerHTML = listings.map(function(l){
        return '<div class="listing"><div style="display:flex;justify-content:space-between;gap:10px"><div><h3>'+escapeHtml(l.title)+'</h3><div class="meta">'+escapeHtml(l.platform)+' · by '+escapeHtml(l.seller_name || '—')+'</div></div><div class="price">₦'+(Number(l.price_kobo)/100).toLocaleString()+'</div></div><div class="meta" style="margin-top:10px">'+escapeHtml(l.description||'').slice(0,180)+'</div><div style="margin-top:12px;display:flex;gap:10px"><button class="btn btn-primary btn-sm" onclick="buyListing('+Number(l.id)+')">Buy Now</button></div></div>';
      }).join('') || '<div class="muted">No listings yet</div>';
    } catch (e) {
      list.innerHTML = '<div class="muted">'+(e && e.message ? e.message : 'Error')+'</div>';
    }
  }

  async function loadDeals(){
    if (!token) return;
    const row = $('#dealList');
    if (!row) return;
    try {
      const resp = await api('/deals/my');
      const deals = (resp && resp.deals) ? resp.deals : [];
      if (!deals.length) { row.innerHTML = '<div class="muted">No deals yet</div>'; return; }
      row.innerHTML = deals.map(function(d){
        const amt = (Number(d.amount_kobo||0)/100).toLocaleString();
        const fee = (Number(d.middleman_fee_kobo||0)/100).toLocaleString();
        let actionsHtml = dealActions(d);
        return '<div class="deal"><div class="deal-head"><strong>Deal '+String(d.id).slice(0,8)+'</strong><span class="badge '+d.status+'">'+d.status.replace(/_/g,' ')+'</span></div><div class="meta">Amount: ₦'+amt+' · Fee: ₦'+fee+'</div><div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">'+actionsHtml+'</div></div>';
      }).join('');
    } catch (e) { row.innerHTML = '<div class="muted">'+(e && e.message ? e.message : 'Error')+'</div>'; }
  }

  function dealActions(d){
    const isBuyer = user && d.buyer_id === user.id;
    const isSeller = user && d.seller_id === user.id;
    if (d.status === 'pending_payment' && isBuyer) return '<button class="btn btn-primary btn-sm" onclick="payDeal(\''+d.id+'\')">Pay Now</button>';
    if (d.status === 'payment_confirmed' && isSeller) return '<button class="btn btn-primary btn-sm" onclick="uploadCreds(\''+d.id+'\')">Upload Credentials</button>';
    if (d.status === 'verified' && isBuyer) return '<button class="btn btn-primary btn-sm" onclick="viewCreds(\''+d.id+'\')">View Credentials</button><button class="btn btn-ghost btn-sm" onclick="confirmDeal(\''+d.id+'\')">Confirm Working</button>';
    if (d.status === 'verified' && isSeller) return '<span class="muted">Waiting for buyer confirmation</span>';
    if (d.status === 'disputed') return '<button class="btn btn-ghost btn-sm" onclick="alert(\'Open dispute manually in Admin\')">View Dispute</button>';
    return '<span class="muted">Waiting...</span>';
  }

  function authFormHTML(){
    const isReg = authMode === 'register';
    $('#authTitle').textContent = isReg ? 'Register' : 'Login';
    let html = '';
    if (isReg) html += '<div class="field"><label>Full name</label><input name="full_name" class="input"/></div>';
    html += '<div class="field"><label>Username</label><input name="username" class="input" required/></div>';
    if (isReg) html += '<div class="field"><label>Email</label><input name="email" class="input" required/></div>';
    if (isReg) html += '<div class="field"><label>Phone</label><input name="phone" class="input" required/></div>';
    html += '<div class="field"><label>Password</label><input name="password" type="password" class="input" required/></div>';
    html += '<button type="submit" class="btn btn-primary">'+(isReg ? 'Create account' : 'Login')+'</button>';
    $('#authForm').innerHTML = html;
    $('#authSwitch').innerHTML = isReg ? 'Have an account? <a href="#/login">Login</a>' : 'No account? <a href="#/register">Register</a>';
  }

  async function handleAuth(e){
    e.preventDefault();
    const form = new FormData(e.target);
    const payload = {};
    form.forEach(function(v,k){ payload[k]=v; });
    try {
      const resp = await api('/auth/'+(authMode==='register'?'register':'login'), { method: 'POST', body: payload });
      token = resp.token;
      user = resp.user;
      localStorage.setItem('ff_token', token);
      updateNav();
      showSection('browse');
      loadBrowse();
    } catch (err) { toast((err && err.message) ? err.message : 'Auth failed'); }
  }

  function escapeHtml(text){
    if (!text) return '';
    const map = {'&':'&','<':'<','>':'>','"':'"',"'":'''};
    return String(text).replace(/[&<>"']/g, function(m){ return map[m] || m; });
  }

  window.buyListing = async function(id){
    try { const resp = await api('/deals', { method: 'POST', body: { listing_id: id } }); toast('Deal created'); showSection('deals'); loadDeals(); }
    catch (e){ toast((e && e.message) ? e.message : 'Error', 'error'); }
  };
  window.payDeal = async function(id){
    const ref = prompt('Enter Paystack reference');
    try { await api('/deals/'+id+'/pay', { method:'POST', body: { paystack_ref: ref||'' } }); toast('Payment recorded'); loadDeals(); }
    catch (e){ toast((e && e.message) ? e.message : 'Error', 'error'); }
  };
  window.uploadCreds = async function(id){
    const ff_email = prompt('Free Fire email/phone');
    const ff_password = prompt('Free Fire password');
    const ff_uid = prompt('Free Fire UID (optional)');
    const notes = prompt('Notes for admin/buyer (optional)');
    try { await api('/deals/'+id+'/credentials', { method:'POST', body: { ff_email: ff_email, ff_password: ff_password, ff_uid: ff_uid, notes: notes } }); toast('Creds shared with admin'); loadDeals(); }
    catch (e){ toast((e && e.message) ? e.message : 'Error', 'error'); }
  };
  window.viewCreds = async function(id){
    try { const resp = await api('/deals/'+id+'/credentials'); alert('Creds:\n'+JSON.stringify(resp.credentials, null, 2)); }
    catch (e){ toast((e && e.message) ? e.message : 'Error', 'error'); }
  };
  window.confirmDeal = async function(id){
    try { await api('/deals/'+id+'/confirm', { method:'POST' }); toast('Deal completed'); loadDeals(); }
    catch (e){ toast((e && e.message) ? e.message : 'Error', 'error'); }
  };

  window.addEventListener('load', async function(){
    await me();
    authFormHTML();
    $('#authForm').onsubmit = handleAuth;
    $('#createForm').onsubmit = async function(e){
      e.preventDefault();
      try {
        const form = new FormData(e.target);
        const body = {};
        form.forEach(function(v,k){ body[k]=v; });
        body.price_kobo = Number(body.price_kobo)*100;
        await api('/listings', { method: 'POST', body: body });
        toast('Listing created');
        showSection('browse');
        loadBrowse();
      } catch (err) { toast((err && err.message) ? err.message : 'Failed to create listing', 'error'); }
    };
    route();
  });

  window.addEventListener('hashchange', route);

  function route(){
    const hash = location.hash.slice(1) || '#/browse';
    if (hash.startsWith('#/login')) { authMode='login'; showSection('authSection'); authFormHTML(); }
    else if (hash.startsWith('#/register')) { authMode='register'; showSection('authSection'); authFormHTML(); }
    else if (hash.startsWith('#/browse')) { showSection('browseSection'); loadBrowse(); }
    else if (hash.startsWith('#/sell')) { if (!token) { toast('Login required', 'error'); location.hash='#/login'; return; } showSection('sellSection'); }
    else if (hash.startsWith('#/deals')) { if (!token) { toast('Login required', 'error'); location.hash='#/login'; return; } showSection('dealsSection'); loadDeals(); }
    else if (hash.startsWith('#/admin')) { if (!user || user.role!=='admin') { toast('Admin only', 'error'); location.hash='#/browse'; return; } showSection('adminSection'); $('#adminPanel').innerHTML='<p class="muted">Use admin endpoints via API/Postman for now.</p>'; }
    else showSection('browseSection');
  }
})();
