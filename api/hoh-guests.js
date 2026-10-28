// House of HYPE guest directory (/house-of-hype).
// GET  ?code=ATTENDEE_CODE           -> guests (name, socials, company, title). Needs the attendee code.
// POST body = Luma guest export CSV  -> replaces the guest list. Needs header x-admin-key.
// Only approved guests are kept. Email, phone and every other column are dropped on import.
// Codes live in Supabase table hoh_config (attendee_code, admin_key) so they can be changed without a deploy.

const SB = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SK = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function sb(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SK, authorization: `Bearer ${SK}`, 'content-type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`supabase ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function config() {
  const rows = await sb('hoh_config?select=key,value');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// Profile photos are resolved once at upload, so visitors never hit a rate-limited avatar service:
// X via the public fxtwitter API, then the Telegram public profile page (og:image).
async function grab(url, ms = 5000) {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (HouseOfHYPE guest list)' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(String(r.status));
  return r;
}
async function photoFor(g) {
  if (g.x) {
    try {
      const j = await (await grab(`https://api.fxtwitter.com/${encodeURIComponent(g.x)}`)).json();
      const u = j && j.user && j.user.avatar_url;
      if (u && !/default_profile/.test(u)) return u.replace(/_normal(\.\w+)$/, '_400x400$1');
    } catch (e) {}
  }
  if (g.tg) {
    try {
      const html = await (await grab(`https://t.me/${encodeURIComponent(g.tg)}`)).text();
      const m = html.match(/<meta property="og:image" content="([^"]+)"/);
      if (m && /^https:\/\/cdn\d*\.(telesco\.pe|cdn-telegram\.org)\//.test(m[1])) return m[1];
    } catch (e) {}
  }
  return null;
}
async function withPhotos(list, conc = 10) {
  let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < list.length) { const g = list[i++]; g.avatar = await photoFor(g); }
  }));
  return list;
}

// RFC 4180 CSV parser (quotes, escaped quotes, CRLF, newlines inside quotes)
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

const handle = (v, host) => {
  let s = String(v || '').trim();
  if (!s) return null;
  s = s.replace(new RegExp(`^https?://(www\\.)?(${host})/`, 'i'), '').replace(/^@/, '').split(/[/?#\s]/)[0];
  return /^[A-Za-z0-9_]{2,32}$/.test(s) ? s : null;
};
const clip = (v, n) => { const s = String(v || '').trim().replace(/\s+/g, ' '); return s ? s.slice(0, n) : null; };

function mapLuma(rows) {
  const head = rows[0].map(h => h.trim().toLowerCase());
  const find = (...res) => { for (const re of res) { const i = head.findIndex(h => re.test(h)); if (i >= 0) return i; } return -1; };
  const col = {
    id: find(/^api_id$/, /^guest_api_id$/, /^id$/),
    name: find(/^name$/, /^full name$/),
    first: find(/^first_name$/, /^first name$/),
    last: find(/^last_name$/, /^last name$/),
    approval: find(/^approval_status$/, /approval/, /^status$/),
    x: find(/twitter/, /(^|\W)x( |\W|$).*(handle|user|profile|account)/, /^x$/),
    tg: find(/telegram/),
    company: find(/company/, /organi[sz]ation/, /^project/, /protocol/, /firm|fund/),
    title: find(/job title/, /^title$/, /designation/, /role/, /position/),
    linkedin: find(/linkedin/),
  };
  const used = Object.fromEntries(Object.entries(col).filter(([, i]) => i >= 0).map(([k, i]) => [k, rows[0][i]]));
  const get = (r, k) => (col[k] >= 0 ? r[col[k]] : '') || '';
  const out = []; let skipped = 0; const seen = new Set();
  for (const r of rows.slice(1)) {
    const status = get(r, 'approval').trim().toLowerCase();
    if (col.approval >= 0 && status && status !== 'approved') { skipped++; continue; }
    const name = clip(get(r, 'name') || `${get(r, 'first')} ${get(r, 'last')}`, 80);
    if (!name) { skipped++; continue; }
    let id = clip(get(r, 'id'), 64) || 'n_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (seen.has(id)) { skipped++; continue; }
    seen.add(id);
    const li = clip(get(r, 'linkedin'), 200);
    out.push({
      id, name,
      x: handle(get(r, 'x'), 'x\\.com|twitter\\.com'),
      tg: handle(get(r, 'tg'), 't\\.me|telegram\\.me'),
      company: clip(get(r, 'company'), 80),
      title: clip(get(r, 'title'), 80),
      linkedin: li && /^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(li) ? li : null,
      updated_at: new Date().toISOString(),
    });
  }
  return { guests: out, skipped, used };
}

export default {
  async fetch(request) {
    if (!SB || !SK) return json({ error: 'not_configured' }, 500);
    const url = new URL(request.url);
    try {
      const cfg = await config();
      if (request.method === 'GET') {
        const code = (url.searchParams.get('code') || '').trim().toLowerCase();
        if (!code || code !== String(cfg.attendee_code || '').toLowerCase()) return json({ error: 'code' }, 401);
        const guests = await sb('hoh_guests?select=id,name,x,tg,company,title,linkedin,avatar&order=name.asc&limit=2000');
        return json({ guests });
      }
      if (request.method === 'POST') {
        if (!cfg.admin_key || request.headers.get('x-admin-key') !== cfg.admin_key) return json({ error: 'admin' }, 401);
        const rows = parseCSV(await request.text());
        if (rows.length < 2) return json({ error: 'empty_csv' }, 400);
        const { guests, skipped, used } = mapLuma(rows);
        if (!used.name && !used.first) return json({ error: 'no_name_column', headers: rows[0] }, 400);
        await withPhotos(guests);
        await sb('hoh_guests?id=not.is.null', { method: 'DELETE' });
        for (let i = 0; i < guests.length; i += 500) {
          await sb('hoh_guests', { method: 'POST', body: JSON.stringify(guests.slice(i, i + 500)), headers: { prefer: 'return=minimal' } });
        }
        return json({ ok: true, imported: guests.length, skipped, photos: guests.filter(g => g.avatar).length, columns: used });
      }
      return json({ error: 'method' }, 405);
    } catch (e) {
      console.error(e.message);
      return json({ error: 'server' }, 500);
    }
  },
};
