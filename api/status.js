import { getStatus } from "../lib/handlers.js";
export default async function handler(_req, res) {
  const [code, body] = await getStatus();
  res.setHeader("cache-control", "no-store");
  res.status(code).json(body);
}
