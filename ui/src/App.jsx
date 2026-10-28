import React, { useState, useRef, useEffect, memo, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStatus, useNow, windowState, pad, post } from "./hooks.js";
import { Brands, Button, Pair, Ring, Marquee, DitherBar, DitherSpot, DitherBlob, rise, ease } from "./ui.jsx";
import regions from "./regions.json";

const HL = () => window.HL;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const STACKED = "(max-width:1240px)";
function useNarrow() {
  const [n, setN] = useState(() => matchMedia(STACKED).matches);
  useEffect(() => { const m = matchMedia(STACKED), f = () => setN(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return n;
}
// stacked layouts: keep the card in view while the laser runs, then bring the result up
const show = (sel, block) => { if (!matchMedia(STACKED).matches) return; const el = document.querySelector(sel); el && el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block }); };

/* ---------- header ---------- */
function Masthead({ muted, setMuted }) {
  return (
    <header className="mast">
      <span className="mast-l" aria-hidden="true" />
      <Brands />
      <span className="mast-r"><button type="button" className="snd" aria-pressed={!muted} onClick={() => { setMuted(!muted); HL().setMuted(!muted); }}>{muted ? "Sound off" : "Sound on"}</button><a className="snd luma" href="https://luma.com/x6m1zvfh" target="_blank" rel="noopener">Event on Luma</a></span>
    </header>
  );
}

/* ---------- the card plate. The 3D engine owns #stage; the decode callouts sit around it. ---------- */
const OFF = { l: [0, 30, 8, 46, 16, 34], r: [36, 0, 24, 8, 42] };
const byY = (a, b) => a.y - b.y || a.x - b.x;
function Callout({ g, i, focus, setFocus }) {
  const left = g.side === "l", title = g.id === "card";
  const head = title
    ? <h4>{g.label}</h4>
    : left ? <><h4>{g.label}</h4><span className="sep">|</span><b>{g.n}</b></> : <><b>{g.n}</b><span className="sep">|</span><h4>{g.label}</h4></>;
  return (
    <motion.li data-co={g.id} className={"co " + g.side + (title ? " title" : "") + (focus === g.id ? " on" : "")} style={{ "--dy": (OFF[g.side][i % OFF[g.side].length]) + "px" }}
      initial={{ opacity: 0, x: left ? -18 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: .55, delay: .08 * i + .1, ease }}
      onMouseEnter={() => setFocus(g.id, true)} onMouseLeave={() => setFocus(null, false)} onClick={() => setFocus(g.id, true)}>
      <div className="co-h">{head}</div>
      {(title ? g.kicker : g.meta) && <p className="co-m">{title ? g.kicker : g.meta}</p>}
      <p className="co-d">{g.desc}</p>
    </motion.li>
  );
}

const Plate = memo(function Plate({ hot }) {
  const [decode, setDecode] = useState(() => !matchMedia("(max-width:700px)").matches), [side, setSide] = useState("front"), [focus, setFocus] = useState(null), still = useRef(false), narrow = useNarrow();
  useEffect(() => { const f = e => setSide(e.detail); window.addEventListener("hl-side", f); return () => window.removeEventListener("hl-side", f); }, []);
  // on wide screens the map steps aside while the laser runs; stacked, it stays put (dimmed) so nothing below jumps
  const on = decode && (!hot || narrow);
  useEffect(() => {
    const go = () => { window.HL.track.set(decode); window.HL.track.hide(hot); };
    if (window.HL) go(); else { window.addEventListener("hl-ready", go, { once: true }); return () => window.removeEventListener("hl-ready", go); }
  }, [decode, hot]);
  const items = regions[side], L = items.filter(g => g.side === "l").sort((a, b) => (a.id === "card" ? -1 : b.id === "card" ? 1 : byY(a, b))), R = items.filter(g => g.side === "r").sort(byY);
  const pick = (id, hold) => { still.current = hold; setFocus(id); window.HL && window.HL.track.focus(id); };
  // when nobody is pointing at anything, the highlight walks through the callouts on its own
  useEffect(() => {
    if (!on) return; let k = 0; const ids = items.map(g => g.id);
    const t = setInterval(() => { if (still.current) return; k = (k + 1) % ids.length; setFocus(ids[k]); window.HL && window.HL.track.focus(ids[k]); }, 2600);
    return () => clearInterval(t);
  }, [on, side]);
  const col = (list, cls) => (
    <AnimatePresence mode="wait" initial={false}>
      {on && <motion.ol key={cls + side} className={"co-col " + cls} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: .25 } }}>
        {list.map((g, i) => <Callout key={g.id} g={g} i={i} focus={focus} setFocus={pick} />)}
      </motion.ol>}
    </AnimatePresence>
  );
  return (
    <section className={"plate" + (on ? " decoded" : "") + (hot ? " hot" : "")} aria-label="Card preview and decode">
      <div className="co-wrap l">{col(L, "l")}</div>
      <div className="plate-mid">
        <i className="cm tl" /><i className="cm tr" /><i className="cm bl" /><i className="cm br" />
        <DitherSpot />
        <motion.div className="heat" aria-hidden="true" animate={{ opacity: hot ? 1 : 0 }} transition={{ duration: .8 }} />
        <div className="stage" id="stage" aria-label="3D preview of the card. Drag to turn it.">
          <div className="fallback" id="fallback" hidden><img id="fbImg" alt="Front of the card" /></div>
          <span className="hint">Drag to turn</span>
          <div className="flash" id="flash" aria-hidden="true" />
        </div>
        <div className="sides" role="group" aria-label="Show side">
          <button type="button" className="side" id="sideFront" aria-pressed="true"><img id="pvFront" alt="" />Front</button>
          <button type="button" className="side" id="sideBack" aria-pressed="false"><img id="pvBack" alt="" />Back</button>
          <button type="button" className="side decode" aria-pressed={decode} onClick={() => setDecode(v => !v)}><i className="dot" aria-hidden="true" />{decode ? "Hide the map" : "Decode the card"}</button>
        </div>
      </div>
      <div className="co-wrap r">{col(R, "r")}</div>
    </section>
  );
});

/* ---------- timers ---------- */
function Meters({ info, now }) {
  const st = windowState(info, now), left = info ? info.left : 25, total = info ? info.cards : 25;
  const target = st === "upcoming" ? info?.opensAt : info?.closesAt;
  const d = info && st !== "closed" ? Math.max(0, target - now) : 0;
  const D = Math.floor(d / 864e5), H = Math.floor(d % 864e5 / 36e5), M = Math.floor(d % 36e5 / 6e4), S = Math.floor(d % 6e4 / 1e3);
  const label = st === "upcoming" ? "Claims open in" : st === "open" ? "Claims close in" : "Claims are closed";
  return (
    <div className="strip">
      <div className="st"><span className="lab">Cards left</span><Pair v={pad(left)} /><span className="of">of {total}</span></div>
      <i className="sep" aria-hidden="true">|</i>
      <div className="st" role="timer"><span className="lab">{label}</span>
        {st !== "closed" && [["d", D], ["h", H], ["m", M], ["s", S]].map(([u, v]) => <span key={u} className="cu"><Pair v={pad(v)} /><em>{u}</em></span>)}
      </div>
    </div>
  );
}

/* ---------- result ---------- */
const MAILRE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
function verdictFor(j, st, phase) {
  if (phase === "engraving") return "Eligible. Etching your card";
  if (j.claimed) return "Your card is claimed. See you at House of HYPE.";
  if (j.nameTaken) return "A card for \"" + j.name.replace(/\.(hl|eth)$/, "") + "\" has already been claimed.";
  if (!j.eligible) return "Not eligible this time. A score of " + (j.threshold || 80) + " or more is needed to claim.";
  if (st === "closed") return "You're eligible, but claims are closed.";
  if (j.left <= 0) return "You're eligible, but all 25 cards are claimed.";
  if (st === "upcoming") return "You're eligible. Claims open on " + fmtDay(j.opensAt) + ".";
  return "You're eligible. Claim your card before they run out.";
}

function ScoreCard({ j, phase, st, onClaim, claiming, onReplay, vid, onBack, email, setEmail, err }) {
  const ok = j.eligible && !j.nameTaken, done = phase === "done", canClaim = done && ok && !j.claimed && st === "open" && j.left > 0, mailOk = MAILRE.test(email.trim());
  const addr = j.address ? j.address.slice(0, 6) + "…" + j.address.slice(-4) : "";
  return (
    <div className="score" aria-live="polite">
      <div className="score-top">
        <Ring score={Math.max(0, Math.min(100, j.score || 0))} ok={ok} />
        <div className="score-id">
          <h2 className={"verdict" + (ok ? " ok" : "")}>{verdictFor(j, st, phase)}</h2>
          <p className="who"><span>{j.name}</span>{addr && <span className="mono">{addr}</span>}{j.wallets > 1 && <span className="mono">+{j.wallets - 1} paired</span>}</p>
        </div>
      </div>
      {phase === "engraving" && <p className="etch-note">Etching your card, front then back…</p>}
      <ul className="sc-parts">
        {(j.parts || []).map(p => (
          <li key={p.key}>
            <span className="pl">{p.label}</span><span className="pp">{p.pts}<small> / {p.max}</small></span>
            <span className="pb"><i style={{ width: (p.max ? (p.pts / p.max) * 100 : 0) + "%" }} /></span>
            <span className="pd">{p.detail}</span>
          </li>
        ))}
      </ul>
      {canClaim && (
        <form className="mail" onSubmit={e => { e.preventDefault(); if (mailOk && !claiming) onClaim(); }} noValidate>
          <label htmlFor="mail">Email you used on Luma</label>
          <div className="mail-row">
            <input id="mail" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} maxLength={254} placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            <Button type="submit" variant="accent" disabled={claiming || !mailOk}>{claiming ? "Claiming…" : "Claim your card"}</Button>
          </div>
          <p className={"mail-h" + (err ? " err" : "")}>{err || "Use the same email you registered with on Luma. We match it to the guest list when you collect your card."}</p>
        </form>
      )}
      {done && ok && (
        <div className="acts">
          {vid.status === "ready" ? <Button href={vid.url} download={vid.file}>Export video</Button> : <Button variant="ghost" disabled>{vid.status === "error" ? "Video not supported here" : "Preparing video…"}</Button>}
          <Button variant="ghost" onClick={onReplay} disabled={vid.status === "rec"}>Replay engraving</Button>
        </div>
      )}
      <button type="button" className="again" onClick={onBack}>Check another name</button>
    </div>
  );
}

/* ---------- leaderboard ---------- */
const Meter = ({ score }) => <span className="pxm" aria-hidden="true">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < Math.round(score / 5) ? "on" : ""} />)}</span>;
const Detail = ({ r }) => (
  <div className="lb-detail">
    <div className="lb-stack" aria-hidden="true">{r.parts.map((p, i) => <i key={p.key} style={{ width: p.pts + "%", opacity: 1 - i * .13 }} title={p.label} />)}</div>
    <ul className="lb-tiles">
      {r.parts.map(p => (
        <li key={p.key}>
          <span className="t-l">{p.label}</span>
          <span className="t-n">{p.pts}<small>/{p.max}</small></span>
          <span className="t-b"><i style={{ width: (p.max ? (p.pts / p.max) * 100 : 0) + "%" }} /></span>
          <span className="t-d">{p.detail}</span>
        </li>
      ))}
    </ul>
  </div>
);
// the board refreshes itself every 90 s and right away (uncached) after you check a name
function useLeaderboard(refresh) {
  const [lb, setLb] = useState(null), [tick, setTick] = useState(0), first = useRef(true);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 90000); return () => clearInterval(id); }, []);
  useEffect(() => {
    let live = true; const fresh = !first.current && !!refresh; first.current = false;
    fetch("/ens-card/api/leaderboard" + (fresh ? "?fresh=1&t=" + Date.now() : "")).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok || !j.rows) throw new Error(j.error || "unavailable"); return j; })
      .then(j => live && setLb(j)).catch(() => live && setLb(v => v && v.rows ? v : { rows: [], cards: 25, error: true }));
    return () => { live = false; };
  }, [refresh, tick]);
  return [lb, () => { setLb(null); setTick(t => t + 1); }];
}

/* ---------- how claiming works, with the top of the board, in the first screen ---------- */
const fmtDay = ms => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
function ClaimGuide({ info, st }) {
  const [open, setOpen] = useState(true);
  const step2 = !info ? <>Claim your card with the email you used to register on Luma.</>
    : st === "upcoming" ? <>Claim your card from {fmtDay(info.opensAt)} with the email you used to register on Luma.</>
    : st === "open" ? <>Claim your card before {fmtDay(info.closesAt)} with the email you used to register on Luma.</>
    : <>The claim window closed on {fmtDay(info.closesAt)}.</>;
  return (
    <details className="guide" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary><h2>How to claim</h2><i className="chev" aria-hidden="true" /></summary>
      <ol className="steps">
        <li><b>1</b><span>Check your .eth name. You need a score of {info?.threshold || 80} or more to claim.</span></li>
        <li><b>2</b><span>{step2}</span></li>
        <li><b>3</b><span>Collect it at House of HYPE, Mumbai, on 3 Nov. Bring the wallet behind your name.</span></li>
      </ol>
    </details>
  );
}

function Leaderboard({ me, lb, retry }) {
  const [open, setOpen] = useState(null);
  const rows = lb?.rows || [], cards = lb?.cards || 25;
  return (
    <section className="lb" aria-label="Leaderboard">
      <div className="lb-h"><h2>Leaderboard</h2></div>
      {!lb ? <p className="lb-empty">Loading…</p> : lb.error ? <p className="lb-empty">The leaderboard can't load right now. <button type="button" className="lb-retry" onClick={retry}>Try again</button></p> : !rows.length ? <p className="lb-empty">No names checked yet. Be the first.</p> : (
        <ol className="lb-list">
          {rows.map(r => {
            const on = open === r.name, you = me === r.name;
            return (
              <li key={r.name} className={"lb-row" + (on ? " on" : "") + (you ? " you" : "") + (r.rank === cards ? " cut" : "")}>
                <button type="button" className="lb-main" aria-expanded={on} onClick={() => setOpen(on ? null : r.name)}>
                  <span className="lb-rank">{String(r.rank).padStart(2, "0")}</span>
                  <span className="lb-name"><span className="nm">{r.name}</span>{you && <em>You</em>}</span>
                  <span className="lb-bar"><i style={{ width: r.score + "%" }} /></span>
                  <span className="lb-score">{r.score}</span>
                  <span className="lb-chev" aria-hidden="true">{on ? "−" : "+"}</span>
                </button>
                {on && <Detail r={r} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ---------- terms ---------- */
function Terms() {
  const T = [
    ["25", "Numbered cards", "NFC metal cards made by Hyperliquid India and ENS. One card per wallet, per email and per name."],
    ["28 to 29 Oct", "Claim window", "Opens 28 October, 8:00 PM IST. Closes 29 October, 8:00 PM IST. A score of 80 or more is needed, counted on Hyperliquid or Ethereum, whichever is higher. Claim with the email you used to register on Luma."],
    ["03 Nov", "Pickup in Mumbai", "Collect in person at House of HYPE. Show proof of the wallet behind your name."],
  ];
  return (
    <section className="tnc" aria-label="Terms and conditions">
      <h2>Terms and conditions</h2>
      <div className="tnc-g">{T.map(([k, t, d]) => (
        <div className="tnc-c" key={k}><b>{k}</b><h3>{t}</h3><p>{d}</p></div>
      ))}</div>
    </section>
  );
}

/* ---------- footer ---------- */
const Soc = ({ href, children }) => <a href={href} target="_blank" rel="noopener">{children}</a>;
function Footer({ socials }) {
  return (
    <footer className="site-foot">
      <Brands cls="brands foot-brands" />
      <nav className="soc" aria-label="Social links">{socials.map(s => <Soc key={s.label} href={s.url}>{s.label}</Soc>)}</nav>
    </footer>
  );
}

/* ---------- app ---------- */
export default function App({ socials }) {
  const reduce = useReducedMotion();
  const { info, apply, offset } = useStatus(), now = useNow(offset), st = windowState(info, now);
  const [name, setName] = useState(""), [phase, setPhase] = useState("idle"), [res, setRes] = useState(null);
  const [msg, setMsg] = useState({ t: "", err: false }), [checking, setChecking] = useState(false), [claiming, setClaiming] = useState(false), [muted, setMuted] = useState(false);
  const [vid, setVid] = useState({ status: "idle", left: 0 }), deb = useRef();
  const [wallets, setWallets] = useState([]), [pair, setPair] = useState(false);
  const [lb, retryLb] = useLeaderboard(res ? res.name + (res.claimed ? ":c" : "") : "");
  const [email, setEmail] = useState(""), [claimErr, setClaimErr] = useState("");
  const ADDR = /^0x[a-fA-F0-9]{40}$/, cleanW = () => wallets.map(w => w.trim()).filter(Boolean);
  const busy = phase === "reading" || phase === "engraving" || checking;
  const norm = v => v.trim().toLowerCase(), okName = n => HL().validHl(n) || HL().validEth(n);

  const onType = e => {
    if (busy) return; const v = e.target.value, n = norm(v); setName(v); setRes(null); setPhase("idle"); setVid({ status: "idle", left: 0 });
    setClaimErr(""); HL().clearName();
    setMsg(!n ? { t: "", err: false } : okName(n) ? { t: "", err: false } : { t: "Names end in .eth", err: true });
  };
  const submit = async e => {
    e.preventDefault(); if (busy) return; const n = norm(name);
    if (!okName(n)) { setMsg({ t: "Enter a .eth name.", err: true }); return; }
    if (cleanW().some(w => !ADDR.test(w))) { setMsg({ t: "Paired wallets must be 0x addresses.", err: true }); return; }
    HL().unlock(); setChecking(true); setMsg({ t: "Checking " + n + "…", err: false }); setRes(null); setClaimErr(""); setVid({ status: "idle", left: 0 });
    try {
      const [ok, j] = await post("/ens-card/api/check", { name: n, wallets: cleanW() });
      if (!ok) { setMsg({ t: j.error || "Something went wrong.", err: true }); setChecking(false); return; }
      apply(j); setMsg({ t: "", err: false }); setChecking(false); setPhase("reading");
      await sleep(reduce ? 200 : 1200);
      setRes(j);
      if (j.no) HL().setNo(j.no);
      if (j.eligible && !j.nameTaken) { HL().setName(j.name); setPhase("engraving"); show("#stage", "center"); await sleep(reduce ? 0 : 450); await HL().engrave(); await sleep(reduce ? 0 : 700); }
      setPhase("done"); show(".console", "start");
      if (j.eligible && !j.nameTaken) makeVideo(j);
    } catch (err) { console.error("CHK", err); setMsg({ t: "Network error. Try again.", err: true }); setChecking(false); setPhase("idle"); }
  };
  const again = () => { if (phase === "engraving" || phase === "reading") return; HL().clearName(); setClaimErr(""); setRes(null); setPhase("idle"); setVid({ status: "idle", left: 0 }); setMsg({ t: "", err: false }); };
  const replay = async () => { if (phase !== "done") return; setPhase("engraving"); show("#stage", "center"); await sleep(reduce ? 0 : 450); await HL().engrave(); await sleep(reduce ? 0 : 700); setPhase("done"); show(".console", "start"); };
  const claim = async () => {
    setClaiming(true); setClaimErr("");
    try { const [ok, j] = await post("/ens-card/api/claim", { name: norm(res?.name || name), wallets: cleanW(), email: email.trim() }); if (j && j.now) apply(j); if (ok) { if (j.no) { HL().setNo(j.no); if (res && j.no !== res.no) makeVideo({ ...res, claimed: true, no: j.no }); } setRes(r => ({ ...r, claimed: true, left: j.left ?? r.left, no: j.no || r.no })); } else setClaimErr(j.error || "Couldn't claim. Try again."); }
    catch { setClaimErr("Network error. Try again."); }
    setClaiming(false);
  };
  const makeVideo = async j => {
    setVid({ status: "rec", left: 14 });
    try { const o = await HL().record(j, (p, left) => setVid(v => v.status === "rec" ? { ...v, left } : v)); setVid({ status: "ready", ...o }); }
    catch (err) { console.error("VID", err); setVid({ status: "error" }); }
  };
  useEffect(() => () => clearTimeout(deb.current), []);

  return (
    <div className="wrap">
      {info?.mock && <div className="demo">Demo data. Preview only.</div>}
      <Masthead muted={muted} setMuted={setMuted} />

      <main className="hero">
        <div className="deck">
          <Plate hot={phase === "engraving"} />
          <aside className={"console flip" + (res ? " on" : "")} aria-label="Check your name">
            <div className="flip-in">
              <div className="face front" inert={!!res}>
                <motion.h1 {...rise(1, reduce)}>Your name, <i>laser etched</i> in metal.</motion.h1>
                <motion.p className="sub" {...rise(2, reduce)}>Get one of only 25 NFC metal cards from Hyperliquid India and ENS for House of HYPE.</motion.p>
                <motion.div className="full" {...rise(3, reduce)}><Meters info={info} now={now} /></motion.div>
                <motion.form className="apply" onSubmit={submit} noValidate {...rise(4, reduce)}>
                  <label className="vh" htmlFor="name">Your .eth name</label>
                  <div className="field">
                    <input id="name" type="text" value={name} onChange={onType} placeholder="yourname.eth" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64} />
                    <Button type="submit" disabled={busy}>{busy ? "Checking…" : "Check eligibility"}</Button>
                  </div>
                  <div className="wal">
                    {!pair ? <button type="button" className="wal-t" onClick={() => { setPair(true); if (!wallets.length) setWallets([""]); }}>Pair more wallets</button> : (
                      <div className="wal-box">
                        <span className="rlab">Paired wallets, up to 4. Their activity adds to your score. They are never shown publicly.</span>
                        {wallets.map((w, i) => (
                          <div className="wal-row" key={i}>
                            <input type="text" value={w} placeholder="0x…" spellCheck={false} autoComplete="off" maxLength={42} aria-label={"Paired wallet " + (i + 1)} onChange={e => setWallets(a => a.map((x, k) => k === i ? e.target.value : x))} />
                            <button type="button" aria-label="Remove wallet" onClick={() => setWallets(a => a.filter((_, k) => k !== i))}>×</button>
                          </div>
                        ))}
                        {wallets.length < 4 && <button type="button" className="wal-add" onClick={() => setWallets(a => [...a, ""])}>Add a wallet</button>}
                      </div>
                    )}
                  </div>
                  <span className={"status" + (msg.err ? " err" : "")} aria-live="polite">{msg.t}</span>
                  <p className="getname">No name yet? Get a <a href="https://app.ens.domains" target="_blank" rel="noopener">.eth name</a>.</p>
                </motion.form>
                <motion.div {...rise(5, reduce)}><ClaimGuide info={info} st={st} /></motion.div>
              </div>
              <div className="face back" inert={!res}>
                {res && <ScoreCard j={res} phase={phase} st={st} onClaim={claim} claiming={claiming} onReplay={replay} vid={vid} onBack={again} email={email} setEmail={setEmail} err={claimErr} />}
              </div>
            </div>
          </aside>
        </div>
        <Leaderboard me={res?.name} lb={lb} retry={retryLb} />
        <Terms />
      </main>
      <Footer socials={socials} />
      <span id="stageTag" hidden /><aside id="notes" hidden />
    </div>
  );
}
