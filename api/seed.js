import { seedLegends } from "../lib/legends.js";
export default async function handler(_req, res) {
  try { res.status(200).json(await seedLegends()); } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
}
