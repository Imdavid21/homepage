import { getText, send, collect } from "./_lib.js";

// Recent original posts (no replies, no reposts) from the public profile timeline.
// The client merges these with a curated list, so an empty result is harmless.
const URL = "https://syndication.twitter.com/srv/timeline-profile/screen-name/Hyperliquid_In";

export default async function handler(req, res) {
  try {
    const html = await getText(URL);
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return send(res, { ids: [], source: "none" }, 300, 3600);
    const data = JSON.parse(m[1]);
    const tweets = collect(data, o => typeof o.id_str === "string" && o.user && typeof o.user.screen_name === "string" && ("full_text" in o || "text" in o));
    const ids = [...new Set(tweets
      .filter(t => t.user.screen_name.toLowerCase() === "hyperliquid_in")
      .filter(t => !t.in_reply_to_status_id_str && !t.retweeted_status && !(t.full_text || t.text || "").startsWith("RT @"))
      .map(t => t.id_str))];
    send(res, { ids, source: "live", updatedAt: Date.now() }, 300, 3600);
  } catch (e) {
    send(res, { ids: [], source: "none", error: String(e) }, 120, 600);
  }
}
