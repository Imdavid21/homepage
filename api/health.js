import { health } from "../lib/store.js";
// Open /api/health to see how storage is wired. No secrets are returned.
export default async function handler(_req, res) {
  const h = await health();
  h.env = { SUPABASE_URL: !!process.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY, BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN, ETH_RPC: !!process.env.ETH_RPC };
  res.setHeader("cache-control", "no-store");
  res.status(200).json(h);
}
