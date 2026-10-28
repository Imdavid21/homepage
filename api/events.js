import { getJSON, send, collect } from "./_lib.js";

// Hosted events from our Luma profile, plus community events listed under co-hosts.
const PROFILE = "https://api.lu.ma/user/profile/events?username=Hyperliquid_In";
const EXTRA = ["non7u5kb"];

function norm(holder) {
  const e = holder.event || holder;
  const geo = e.geo_address_info || {};
  const hosts = (holder.hosts || e.hosts || []).map(h => h.name).filter(Boolean);
  return {
    slug: e.url,
    name: e.name,
    url: `https://luma.com/${e.url}`,
    start: e.start_at,
    end: e.end_at || null,
    tz: e.timezone || null,
    city: geo.city || geo.city_state || null,
    cover: e.cover_url || null,
    hosts,
  };
}

export default async function handler(req, res) {
  const found = new Map();
  const add = list => list.forEach(h => {
    const ev = norm(h);
    if (ev.slug && ev.name && ev.start && !found.has(ev.slug)) found.set(ev.slug, ev);
  });
  const isHolder = o => o.event && typeof o.event === "object" && o.event.url && o.event.name && o.event.start_at;

  const errors = [];
  try {
    add(collect(await getJSON(PROFILE), isHolder));
  } catch (e) { errors.push(String(e)); }

  await Promise.all(EXTRA.map(async slug => {
    if (found.has(slug)) return;
    try {
      const j = await getJSON(`https://api.lu.ma/url?url=${slug}`);
      add(collect(j, isHolder));
    } catch (e) { errors.push(String(e)); }
  }));

  const events = [...found.values()].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  send(res, { events, updatedAt: Date.now(), errors: errors.length ? errors : undefined }, 300, 3600);
}
