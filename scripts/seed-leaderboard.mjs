// Puts known .eth names on the public leaderboard by checking them the way a visitor would. Nothing is claimed.
// Usage: node scripts/seed-leaderboard.mjs [site]   (default https://www.hyperliquidindia.com/ens-card)
const site = (process.argv[2] || "https://www.hyperliquidindia.com/ens-card").replace(/\/$/, "");
const NAMES = ["nick.eth", "brantly.eth", "balajis.eth", "sassal.eth", "cdixon.eth", "hayden.eth", "pranksy.eth", "gregskril.eth", "jefflau.eth", "lefteris.eth"];
for (const name of NAMES) {
  try {
    const r = await fetch(`${site}/api/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json();
    console.log(name.padEnd(16), r.status, r.ok ? `score ${j.score}, claimed ${j.claimed}` : j.error);
  } catch (e) { console.log(name.padEnd(16), "failed", e.message); }
  await new Promise((s) => setTimeout(s, 7000)); // the API allows 12 checks a minute
}
const lb = await (await fetch(`${site}/api/leaderboard?fresh=1`)).json();
console.log(`\nleaderboard rows: ${lb.rows.length}`); lb.rows.forEach((x) => console.log(String(x.rank).padStart(3), x.name.padEnd(16), x.score, x.claimed ? "claimed" : ""));
