import { claim } from "../lib/handlers.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const [code, body] = await claim({ name: b.name, ip: (req.headers["x-forwarded-for"] || "").split(",")[0] || "x" });
  res.status(code).json(body);
}
