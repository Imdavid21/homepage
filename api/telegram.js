import { getText, send } from "./_lib.js";

const INVITE = "https://t.me/+gZ4QCmWBfzg5MDFl";

export default async function handler(req, res) {
  try {
    const html = await getText(INVITE);
    const extra = (html.match(/tgme_page_extra[^>]*>([^<]+)</) || [])[1] || "";
    const num = s => (s ? parseInt(s.replace(/[^\d]/g, ""), 10) : null);
    const members = num((extra.match(/([\d][\d\s,. ]*)\s*(members|subscribers)/i) || [])[1]);
    const online = num((extra.match(/([\d][\d\s,. ]*)\s*online/i) || [])[1]);
    send(res, { members, online, updatedAt: Date.now() }, 300, 3600);
  } catch (e) {
    send(res, { members: null, error: String(e) }, 30, 60);
  }
}
