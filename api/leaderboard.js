import { getLeaderboard } from "../lib/handlers.js";
export default async function handler(_req, res) {
  const [code, body] = await getLeaderboard();
  res.setHeader("cache-control", "public, s-maxage=10, stale-while-revalidate=30");
  res.status(code).json(body);
}
