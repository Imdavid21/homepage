import React, { useState, useRef, useEffect, memo, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStatus, useNow, windowState, pad, post } from "./hooks.js";
import { Brands, Button, Pair, Ring, Marquee, DitherBar, DitherSpot, DitherBlob, rise, ease } from "./ui.jsx";
import regions from "./regions.json";

const HL = () => window.HL;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- header ---------- */
function Masthead({ muted, setMuted }) {
  return (
    <header className="mast">
      <span className="mast-l" aria-hidden="true" />
      <Brands />
      <span className="mast-r"><button type="button" className="snd" aria-pressed={!muted} onClick={() => { setMuted(!muted); HL().setMuted(!muted); }}>{muted ? "Sound off" : "Sound on"}</button></span>
    </header>
  );
}

/* ---------- the card plate. The 3D engine owns #stage; the decode callouts sit around it. ---------- */
const OFF = { l: [0, 30, 8, 46, 16, 34], r: [36, 0, 24, 8, 42] };
const byY = (a, b) => a.y - b.y || a.x - b.x;
function Callout({ g, i, focus, setFocus }) {
  const left = g.side === "l", title = g.id === "card";
  const head = title
    ? <h3>{g.label}</h3>
    : left ? <><h4>{g.label}</h4><span className="sep">|</span><b>{g.n}</b></> : <><b>{g.n}</b><span className="sep">|</span><h4>{g.label}</h4></>;
  return (
    <motion.li data-co={g.id} className={"co " + g.side + (title ? " title" : "") + (focus === g.id ? " on" : "")} style={{ "--dy": (OFF[g.side][i % OFF[g.side].length]) + "px" }}
      initial={{ opacity: 0, x: left ? -18 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: .55, delay: .08 * i + .1, ease }}
      onMouseEnter={() => setFocus(g.id, true)} onMouseLeave={() => setFocus(null, false)} onClick={() => setFocus(g.id, true)}>
      <div className="co-h">{head}</div>
      <p className="co-m">{title ? g.kicker : g.meta}</p>
      <p className="co-d">{g.desc}</p>
    </motion.li>
  );
}

const Plate = memo(function Plate({ hot }) {
  const [decode, setDecode] = useState(true), [side, setSide] = useState("front"), [focus, setFocus] = useState(null), still = useRef(false);
  useEffect(() => { const f = e => setSide(e.detail); window.addEventListener("hl-side", f); return () => window.removeEventListener("hl-side", f); }, []);
  const on = decode && !hot;
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
    <section className={"plate" + (on ? " decoded" : "")} aria-label="Card preview and decode">
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
function verdictFor(j, st, phase) {
  if (phase === "engraving") return "Eligible. Etching your card";
  if (j.claimed) return "Your card is claimed. See you at House of HYPE.";
  if (!j.eligible) return "Not eligible this time. A score of 90 or more qualifies.";
  if (st === "closed") return "You're eligible, but claims are closed.";
  if (j.left <= 0) return "You're eligible, but all 25 cards are claimed.";
  if (st === "upcoming") return "You're eligible. Claims open on 22 Oct, 12:00 pm IST.";
  return "You're eligible. Claim your card before they run out.";
}

function Result({ j, phase, st, onClaim, claiming, onReplay, vid }) {
  const reduce = useReducedMotion(), busy = phase === "engraving", done = phase === "done";
  const canClaim = done && j.eligible && !j.claimed && st === "open" && j.left > 0;
  const addr = j.address ? j.address.slice(0, 6) + "…" + j.address.slice(-4) : "";
  return (
    <motion.section className="result" aria-live="polite" initial={reduce ? false : { opacity: 0, y: 36, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 140, damping: 20 }}>
      <Ring score={Math.max(0, Math.min(100, j.score || 0))} ok={j.eligible} />
      <p className="rlab">Hyperliquid onchain score</p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.h2 key={verdictFor(j, st, phase)} className={"verdict" + (j.eligible ? " ok" : "")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .35, ease }}>{verdictFor(j, st, phase)}</motion.h2>
      </AnimatePresence>
      <p className="who"><span>{j.name}</span>{addr && <span className="mono">{addr}</span>}</p>
      <AnimatePresence>
        {done && j.eligible && (
          <motion.div className="acts" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {canClaim && <Button variant="accent" onClick={onClaim} disabled={claiming}>{claiming ? "Claiming…" : "Claim your card"}</Button>}
            {vid.status !== "ready" && <Button variant="ghost" disabled>{vid.status === "error" ? "Video not supported here" : "Preparing your video"}</Button>}
            <Button variant="ghost" onClick={onReplay} disabled={vid.status === "rec"}>Replay engraving</Button>
          </motion.div>
        )}
      </AnimatePresence>
      {j.explorers && j.explorers.length > 0 && (
        <div className="chips"><span className="rlab">Verify onchain</span>
          {j.explorers.map((e, i) => <motion.a key={e.label} href={e.url} target="_blank" rel="noopener" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .5 + i * .08 }}>{e.label}</motion.a>)}
        </div>
      )}
    </motion.section>
  );
}

function VideoPanel({ vid }) {
  if (vid.status !== "ready") return null;
  return (
    <motion.section className="vidbox" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease }}>
      <video src={vid.url} controls playsInline loop autoPlay muted />
      <div className="vidside">
        <p className="rlab">Your video is ready</p>
        <p className="cap-text">{vid.caption}</p>
        <div className="acts left">
          <Button href={vid.url} download={vid.file}>Export video</Button>
          <Button variant="ghost" onClick={() => navigator.clipboard.writeText(vid.caption)}>Copy caption</Button>
          <Button variant="ghost" href={"https://twitter.com/intent/tweet?text=" + encodeURIComponent(vid.caption)} target="_blank" rel="noopener">Post on X</Button>
        </div>
        <p className="small">{vid.ext === "mp4" ? "Attach the video to your post. The caption is also burned into the video." : "This browser saved WebM. X needs MP4, so use Chrome for an MP4 file or convert this one first. The caption is also burned into the video."}</p>
      </div>
    </motion.section>
  );
}

/* ---------- leaderboard ---------- */
function Leaderboard({ me, refresh }) {
  const [lb, setLb] = useState(null), [open, setOpen] = useState(null), [all, setAll] = useState(false);
  useEffect(() => { let live = true; fetch("/api/leaderboard").then(r => r.json()).then(j => live && setLb(j)).catch(() => live && setLb({ rows: [], cards: 25 })); return () => { live = false; }; }, [refresh]);
  useEffect(() => { if (me) setOpen(me); }, [me]);
  const rows = lb?.rows || [], cards = lb?.cards || 25, shown = all ? rows : rows.slice(0, 10);
  return (
    <section className="lb" aria-label="Leaderboard">
      <div className="lb-h"><h2>Leaderboard</h2><span>Top {cards} get a card. Tap a row for the score breakdown.</span></div>
      {!lb ? <p className="lb-empty">Loading…</p> : !rows.length ? <p className="lb-empty">No names checked yet. Be the first.</p> : (
        <ol className="lb-list">
          {shown.map(r => {
            const on = open === r.name, you = me === r.name;
            return (
              <li key={r.name} className={"lb-row" + (on ? " on" : "") + (you ? " you" : "") + (r.rank === cards ? " cut" : "")}>
                <button type="button" className="lb-main" aria-expanded={on} onClick={() => setOpen(on ? null : r.name)}>
                  <span className="lb-rank">{String(r.rank).padStart(2, "0")}</span>
                  <span className="lb-name">{r.name}{you && <em>You</em>}{r.claimed && <em className="c">Claimed</em>}</span>
                  <span className="lb-bar"><i style={{ width: r.score + "%" }} /></span>
                  <span className="lb-score">{r.score}</span>
                  <span className="lb-chev" aria-hidden="true">{on ? "−" : "+"}</span>
                </button>
                {on && (
                  <ul className="lb-parts">
                    {r.parts.map(p => (
                      <li key={p.key}>
                        <span className="pl">{p.label}</span>
                        <span className="pp">{p.pts}<small> / {p.max}</small></span>
                        <span className="pb"><i style={{ width: (p.max ? (p.pts / p.max) * 100 : 0) + "%" }} /></span>
                        <span className="pd">{p.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {rows.length > 10 && <button type="button" className="lb-more" onClick={() => setAll(a => !a)}>{all ? "Show top 10" : `Show all ${rows.length}`}</button>}
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
      <p className="legal"><a href="/terms">Terms and conditions</a>. An independent community of Hyperliquid users. Not Hyperliquid, not Hyper Foundation, not officially affiliated.</p>
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
  const busy = phase === "reading" || phase === "engraving" || checking;
  const norm = v => v.trim().toLowerCase(), okName = n => HL().validHl(n) || HL().validEth(n);

  const onType = e => {
    if (busy) return; const v = e.target.value, n = norm(v); setName(v); setRes(null); setPhase("idle"); setVid({ status: "idle", left: 0 });
    setMsg(!n ? { t: "", err: false } : okName(n) ? { t: "This is how it will be etched.", err: false } : { t: "Names end in .hl or .eth", err: true });
    clearTimeout(deb.current); deb.current = setTimeout(() => HL().setName(n), 250);
  };
  const submit = async e => {
    e.preventDefault(); if (busy) return; const n = norm(name);
    if (!okName(n)) { setMsg({ t: "Enter a .hl or .eth name.", err: true }); return; }
    HL().unlock(); setChecking(true); setMsg({ t: "Checking " + n + "…", err: false }); setRes(null); setVid({ status: "idle", left: 0 }); HL().setName(n);
    try {
      const [ok, j] = await post("/api/check", { name: n });
      if (!ok) { setMsg({ t: j.error || "Something went wrong.", err: true }); setChecking(false); return; }
      apply(j); setMsg({ t: "", err: false }); setChecking(false); setPhase("reading");
      await sleep(reduce ? 200 : 1200);
      setRes(j);
      if (j.eligible) { setPhase("engraving"); await HL().engrave(); }
      setPhase("done");
      if (j.eligible) makeVideo(j);
    } catch (err) { console.error("CHK", err); setMsg({ t: "Network error. Try again.", err: true }); setChecking(false); setPhase("idle"); }
  };
  const replay = async () => { if (phase !== "done") return; setPhase("engraving"); await HL().engrave(); setPhase("done"); };
  const claim = async () => {
    setClaiming(true);
    try { const [ok, j] = await post("/api/claim", { name: norm(name) }); if (j && j.now) apply(j); if (ok) setRes(r => ({ ...r, claimed: true, left: j.left ?? r.left })); else setMsg({ t: j.error || "Couldn't claim. Try again.", err: true }); }
    catch { setMsg({ t: "Network error. Try again.", err: true }); }
    setClaiming(false);
  };
  const makeVideo = async j => {
    setVid({ status: "rec", left: 9.5 });
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
          <aside className="console" aria-label="Check your name">
            <motion.h1 {...rise(1, reduce)}>Your name, <i>laser etched</i> in metal.</motion.h1>
            <motion.p className="sub" {...rise(2, reduce)}>Get one of only 25 NFC metal cards from Hyperliquid India and ENS for House of HYPE.</motion.p>
            <motion.div className="full" {...rise(3, reduce)}><Meters info={info} now={now} /></motion.div>

            <motion.form className="apply" onSubmit={submit} noValidate {...rise(4, reduce)}>
              <label className="vh" htmlFor="name">Your .hl or .eth name</label>
              <div className="field">
                <input id="name" type="text" value={name} onChange={onType} placeholder="yourname.hl or yourname.eth" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64} />
                <Button type="submit" disabled={busy}>{checking ? "Checking…" : "Check eligibility"}</Button>
              </div>
              <span className={"status" + (msg.err ? " err" : "")} aria-live="polite">{msg.t}</span>
              <p className="getname">No name yet? Get a <a href="https://app.ens.domains" target="_blank" rel="noopener">.eth name</a> or a <a href="https://app.hlnames.xyz" target="_blank" rel="noopener">.hl name</a>.</p>
            </motion.form>

            <AnimatePresence>
              {(phase === "engraving" || phase === "reading") && (
                <motion.div key={phase} className="etch" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 34 }} exit={{ opacity: 0, height: 0 }}>
                  <span>{phase === "reading" ? "Reading the chain" : "Etching your name"}</span><div className="etch-bar"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: phase === "reading" ? 1.2 : 3.4, ease: "easeInOut" }} /></div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>{res && <Result key={res.name + res.score} j={res} phase={phase} st={st} onClaim={claim} claiming={claiming} onReplay={replay} vid={vid} />}</AnimatePresence>
            <VideoPanel vid={vid} />
          </aside>
        </div>
        <Leaderboard me={res?.name} refresh={res?.name} />
      </main>
      <Footer socials={socials} />
      <span id="stageTag" hidden /><aside id="notes" hidden />
    </div>
  );
}
