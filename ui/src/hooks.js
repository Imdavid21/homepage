import { useEffect, useRef, useState, useCallback } from "react";

export const post = (p, body) => fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async r => [r.ok, await r.json()]);

// Server clock + claim window. Polls every 60 s and accepts fresher status from check/claim replies.
export function useStatus() {
  const [info, setInfo] = useState(null);
  const offset = useRef(0);
  const apply = useCallback(j => { if (!j || !j.now) return; offset.current = j.now - Date.now(); setInfo(j); }, []);
  useEffect(() => {
    let live = true;
    const load = () => fetch("/ens-card/api/status").then(r => r.json()).then(j => live && apply(j)).catch(() => {});
    load(); const id = setInterval(load, 60000); return () => { live = false; clearInterval(id); };
  }, [apply]);
  return { info, apply, offset };
}

export function useNow(offset) {
  const [now, setNow] = useState(() => Date.now() + offset.current);
  useEffect(() => { const id = setInterval(() => setNow(Date.now() + offset.current), 1000); return () => clearInterval(id); }, [offset]);
  return now;
}

export const windowState = (info, now) => !info ? "upcoming" : now < info.opensAt ? "upcoming" : now < info.closesAt ? "open" : "closed";
export const pad = n => String(n).padStart(2, "0");
