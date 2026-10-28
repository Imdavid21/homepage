import { getJSON, send } from "./_lib.js";

const ARCHIVE = "https://hyperliquidindia.substack.com/api/v1/archive?sort=new&limit=50";

export default async function handler(req, res) {
  try {
    const posts = await getJSON(ARCHIVE);
    const articles = (Array.isArray(posts) ? posts : [])
      .filter(p => p.title && (p.canonical_url || p.slug))
      .map(p => ({
        title: p.title,
        subtitle: p.subtitle || "",
        date: p.post_date,
        url: p.canonical_url || `https://hyperliquidindia.substack.com/p/${p.slug}`,
        cover: p.cover_image || null,
      }));
    send(res, { articles, updatedAt: Date.now() }, 600, 86400);
  } catch (e) {
    send(res, { articles: [], error: String(e) }, 30, 60);
  }
}
