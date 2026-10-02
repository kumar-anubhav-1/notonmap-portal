'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let token = '';
  try { token = sessionStorage.getItem('nom_admin') || ''; } catch { /* ignore */ }
  let journeys = [];

  async function api(action, body) {
    const opt = { headers: { 'x-admin-token': token } };
    let url = '/api/admin?action=' + encodeURIComponent(action);
    if (body) { opt.method = 'POST'; opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify({ action, ...body }); url = '/api/admin'; }
    if (action === 'stats') url += '&days=' + $('days').value;
    const r = await fetch(url, opt);
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  }

  function drawJourneys() {
    $('journeys').innerHTML = journeys.map((j, i) => `
      <div class="jrow" data-i="${i}">
        <div class="top"><span class="code">${esc(j.code)}</span>
          ${j.ready ? '' : '<span class="tag">not ready: guidance still to be written</span>'}
          <label><input type="checkbox" class="live" ${j.live ? 'checked' : ''} ${j.ready ? '' : 'disabled'}> Live for hosts</label>
          <label>Order <input class="order" type="number" min="0" max="99" value="${esc(j.order)}" style="width:70px"></label></div>
        <div class="grid2">
          <input class="l-en" value="${esc(j.label.en)}" aria-label="Name (English)" placeholder="Name (English)">
          <input class="l-hi" value="${esc(j.label.hi)}" aria-label="Name (Hindi)" placeholder="Name (Hindi)" lang="hi">
          <input class="h-en" value="${esc(j.hint.en)}" aria-label="Short line (English)" placeholder="Short line (English)">
          <input class="h-hi" value="${esc(j.hint.hi)}" aria-label="Short line (Hindi)" placeholder="Short line (Hindi)" lang="hi">
        </div>
      </div>`).join('');
  }
  function readJourneys() {
    const out = {};
    document.querySelectorAll('.jrow').forEach((row) => {
      const j = journeys[Number(row.dataset.i)];
      out[j.code] = {
        live: row.querySelector('.live').checked, order: Number(row.querySelector('.order').value),
        label: { en: row.querySelector('.l-en').value, hi: row.querySelector('.l-hi').value },
        hint: { en: row.querySelector('.h-en').value, hi: row.querySelector('.h-hi').value },
      };
    });
    return out;
  }

  const pct = (x) => (x * 100).toFixed(0) + '%';
  function drawStats(res) {
    if (!res.storage) { $('cards').innerHTML = ''; $('dayTable').innerHTML = ''; $('rows').textContent = ''; return; }
    const s = res.stats;
    if (!s) { $('cards').innerHTML = '<p class="err">Could not read usage numbers just now.</p>'; return; }
    const t = s.total, d = s.derived;
    const card = (n, v) => `<div class="card">${esc(n)}<b>${esc(v)}</b></div>`;
    $('cards').innerHTML = [
      card('Questions answered', t.ok || 0), card('Errors', (t.errors || 0) + ' (' + pct(d.errorRate) + ')'), card('Average time', (d.avgMs / 1000).toFixed(1) + ' s'),
      card('Guides (PDF) made', t.sop || 0), card('Needed local check', t.verify || 0), card('Matched the knowledge bank', pct(d.kbMatchShare)),
      card('Saved by instruction cache', pct(d.cacheHitShare)), card('Tokens in / out', (t.tok_in || 0) + ' / ' + (t.tok_out || 0)),
    ].join('');
    const cols = ['turns', 'ok', 'errors', 'j_IMPROVE', 'j_START', 'lang_en', 'lang_hi', 'lang_hinglish', 'sop'];
    $('dayTable').innerHTML = '<tr><th>Day</th>' + cols.map((c) => `<th>${esc(c.replace(/^j_|^lang_/, ''))}</th>`).join('') + '</tr>' +
      s.days.map((x) => `<tr><td>${esc(x.day)}</td>${cols.map((c) => `<td>${x[c] || 0}</td>`).join('')}</tr>`).join('');
    $('rows').innerHTML = s.topRows.length ? s.topRows.map((r) => `${esc(r.id)} (${r.n})`).join(', ') : 'No data yet.';
  }

  async function load() {
    const j = await api('journeys');
    if (j.status === 401 || j.status === 404 || j.status === 429) {
      $('panel').hidden = true; $('login').hidden = false;
      $('loginErr').hidden = false;
      $('loginErr').textContent = j.status === 404 ? 'Admin is switched off. Set ADMIN_TOKEN in Vercel.' : j.status === 429 ? 'Too many wrong tries. Please wait an hour.' : 'That token did not work.';
      return;
    }
    $('login').hidden = true; $('panel').hidden = false;
    journeys = j.data.journeys || [];
    $('noStorage').hidden = Boolean(j.data.storage);
    drawJourneys();
    drawStats((await api('stats')).data);
  }

  $('loginForm').addEventListener('submit', (e) => {
    e.preventDefault(); token = $('token').value.trim();
    try { sessionStorage.setItem('nom_admin', token); } catch { /* ignore */ }
    $('loginErr').hidden = true; load();
  });
  $('days').addEventListener('change', async () => drawStats((await api('stats')).data));
  $('saveBtn').addEventListener('click', async () => {
    $('saveMsg').textContent = 'Saving...';
    const r = await api('save', { journeys: readJourneys() });
    $('saveMsg').textContent = r.data.ok ? 'Saved. Hosts will see this within about 30 seconds.' : (r.data.error === 'no_storage' ? 'Connect storage first (see README).' : 'Could not save. Please try again.');
    if (r.data.ok) load();
  });
  if (token) load();
})();
