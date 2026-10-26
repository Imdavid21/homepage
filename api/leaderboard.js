import { getLeaderboard } from "../lib/handlers.js";
export default async function handler(req, res) {
  const fresh = String(req.url).includes("fresh=1");
  const [code, body] = await getLeaderboard({ fresh });
  // a shared copy for 30 s keeps storage reads to a handful per minute; a user's own check asks for fresh=1
  res.setHeader("cache-control", code === 200 && !fresh ? "public, s-maxage=30, stale-while-revalidate=120" : "no-store");
  res.status(code).json(body);
}
