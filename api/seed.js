import { seedLegends } from "../lib/legends.js";
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  const t = Date.now();
  try { res.status(200).json({ ...(await seedLegends(String(req.url).includes("force=1"))), ms: Date.now() - t }); }
  catch (e) { res.status(200).json({ error: String(e && e.message || e), ms: Date.now() - t }); }
}
