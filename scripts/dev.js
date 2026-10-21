import http from "node:http";
import fs from "node:fs";
import { check, claim, getStatus, getLeaderboard } from "./lib/handlers.js";
import { CONFIG } from "./lib/config.js";
const port = process.env.PORT || 8791;
// Preview only: PREVIEW_STATE=open|upcoming|closed shifts the window around now
if (process.env.PREVIEW_STATE) {
  const n = Date.now(), H = 36e5;
  const w = { open: [n - 20 * H, n + 28 * H], upcoming: [n + 40 * H, n + 88 * H], closed: [n - 60 * H, n - 12 * H] }[process.env.PREVIEW_STATE];
  CONFIG.opensAt = w[0]; CONFIG.closesAt = w[1];
}
http.createServer(async (req, res) => {
  const send = (c, b, t = "application/json") => { res.writeHead(c, { "content-type": t }); res.end(typeof b === "string" ? b : JSON.stringify(b)); };
  if (req.url.startsWith("/api/leaderboard")) { const [c, b] = await getLeaderboard(); return send(c, b); }
  if (req.url.startsWith("/api/status")) { const [c, b] = await getStatus(); return send(c, b); }
  if (req.method === "POST" && /^\/api\/(check|claim)/.test(req.url)) {
    let d = ""; for await (const x of req) d += x; const j = JSON.parse(d || "{}");
    const [c, b] = await (req.url.startsWith("/api/claim") ? claim : check)({ ...j, ip: Math.random() + "" }); return send(c, b);
  }
  const u = req.url.split("?")[0];
  { const m = u.match(/^\/local\/(f[vw][a-z\d]?)$/); if (m) return send(200, fs.readFileSync("local/" + m[1] + ".html", "utf8"), "text/html"); }
  if (u === "/terms") return send(200, fs.readFileSync("public/terms.html", "utf8"), "text/html");
  if (u === "/local") return send(200, fs.readFileSync("local/index.html", "utf8"), "text/html");
  if (/^\/(three|sha3)\.min\.js$|^\/qrcode\.js$/.test(u)) return send(200, fs.readFileSync("public" + u, "utf8"), "text/javascript");
  if (u.startsWith("/fonts/")) { try { res.writeHead(200, { "content-type": "font/woff2" }); return res.end(fs.readFileSync("local" + u)); } catch { return send(404, "nf", "text/plain"); } }
  send(200, fs.readFileSync("public/index.html", "utf8"), "text/html");
}).listen(port, () => console.log("http://localhost:" + port, process.env.MOCK === "1" ? "(MOCK data)" : ""));
