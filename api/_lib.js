export const UA = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  accept: "*/*",
};

export async function getJSON(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { ...UA, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function getText(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { ...UA, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

export function send(res, body, maxAge = 60, swr = 600) {
  res.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=${swr}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json(body);
}

// Walks any JSON and collects objects that satisfy test.
export function collect(node, test, out = [], seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return out;
  seen.add(node);
  if (test(node)) out.push(node);
  for (const v of Array.isArray(node) ? node : Object.values(node)) collect(v, test, out, seen);
  return out;
}
