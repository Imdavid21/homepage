// Wick Runner (STRAT x Hyperliquid India) leaderboard.
// One board for the House of HYPE night. Players give a display name and a Telegram handle.
// The Telegram handle is never returned publicly; it is only in the admin export.
// Scores stop counting at CLOSES_AT; the top PRIZE_SLOTS at that moment win.
import { get, put } from '@vercel/blob';

const KEY = 'wick-runner/house-of-hype-2026-11-03.json';
export const CLOSES_AT = Date.parse('2026-11-03T23:59:59+05:30');
const PRIZE_SLOTS = 10;
const MAX_ROWS = 500;
const MAX_SCORE = 5000000;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function read() {
  try {
    const r = await get(KEY, { access: 'private', useCache: false });
    if (!r) return [];
    const data = JSON.parse(await new Response(r.stream).text());
    return Array.isArray(data) ? data : [];
  } catch (e) { return []; }
}

const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().replace(/\s+/g, ' ').slice(0, 16);
const cleanTg = h => {
  const v = String(h || '').trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v) ? v.toLowerCase() : '';
};
const pub = rows => rows.filter(r => r.score > 0).slice(0, 100).map(({ name, score, at }) => ({ name, score, at }));
const meta = () => ({ closesAt: CLOSES_AT, closed: Date.now() > CLOSES_AT, slots: PRIZE_SLOTS });

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const rows = await read();
      const admin = process.env.WICK_ADMIN_KEY;
      if (admin && url.searchParams.get('admin') === admin) {
        return json({ ...meta(), winners: rows.slice(0, PRIZE_SLOTS), rows });
      }
      return json({ ...meta(), rows: pub(rows) });
    }
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (Date.now() > CLOSES_AT) return json({ error: 'closed', ...meta() }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'json' }, 400); }
    const name = cleanName(body.name), tg = cleanTg(body.tg), score = Math.floor(Number(body.score));
    if (name.length < 2 || !tg) return json({ error: 'invalid' }, 400);
    const rows = await read();
    const taken = rows.find(r => r.name.toLowerCase() === name.toLowerCase() && r.tg !== tg);
    if (taken) return json({ error: 'name_taken' }, 409);
    // score 0 registers the player without a run
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return json({ error: 'invalid' }, 400);
    const i = rows.findIndex(r => r.tg === tg);
    if (i >= 0) { rows[i].name = name; if (score > rows[i].score) { rows[i].score = score; rows[i].at = Date.now(); } }
    else rows.push({ name, tg, score, at: Date.now() });
    rows.sort((a, b) => b.score - a.score || a.at - b.at);
    const top = rows.slice(0, MAX_ROWS);
    await put(KEY, JSON.stringify(top), { access: 'private', contentType: 'application/json', allowOverwrite: true, addRandomSuffix: false });
    return json({ ok: true, ...meta(), rows: pub(top) });
  },
};
