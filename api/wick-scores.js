// Wick Runner (STRAT x Hyperliquid India) leaderboard. Ported from the wick-runner Vercel project.
import { get, put } from '@vercel/blob';

const KEY = 'wick-runner/scores.json';
const MAX_ROWS = 200;
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

const clean = n => String(n || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().replace(/\s+/g, ' ').slice(0, 16);

export default {
  async fetch(request) {
    if (request.method === 'GET') return json({ rows: (await read()).slice(0, 100) });
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'json' }, 400); }
    const name = clean(body.name), score = Math.floor(Number(body.score));
    if (name.length < 2 || !Number.isFinite(score) || score <= 0 || score > MAX_SCORE) return json({ error: 'invalid' }, 400);
    const rows = await read();
    const k = name.toLowerCase();
    const i = rows.findIndex(r => r.name.toLowerCase() === k);
    if (i >= 0) { if (score > rows[i].score) rows[i] = { name, score, at: Date.now() }; }
    else rows.push({ name, score, at: Date.now() });
    rows.sort((a, b) => b.score - a.score);
    const top = rows.slice(0, MAX_ROWS);
    await put(KEY, JSON.stringify(top), { access: 'private', contentType: 'application/json', allowOverwrite: true, addRandomSuffix: false });
    return json({ ok: true, rows: top.slice(0, 100) });
  },
};
