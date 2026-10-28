import { check, preview } from "../lib/handlers.js";
export default async function handler(req, res) {
  if (req.method === "GET" && req.query && req.query.dry) { const [c, b] = await preview({ name: req.query.name, ip: (req.headers["x-forwarded-for"] || "").split(",")[0] || "x" }); return res.status(c).json(b); }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const [code, body] = await check({ name: b.name, wallets: b.wallets, ip: (req.headers["x-forwarded-for"] || "").split(",")[0] || "x" });
  res.status(code).json(body);
}
