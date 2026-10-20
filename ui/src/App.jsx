import React, { useState, useRef, useEffect, memo, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStatus, useNow, windowState, pad, post } from "./hooks.js";
import { Brands, Button, Pair, Ring, Marquee, rise, ease } from "./ui.jsx";

const HL = () => window.HL;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- header ---------- */
function Masthead({ muted, setMuted }) {
  return (
    <header className="mast">
      <span className="mast-l">Edition of 25</span>
      <Brands />
      <span className="mast-r"><button type="button" className="snd" aria-pressed={!muted} onClick={() => { setMuted(!muted); HL().setMuted(!muted); }}>{muted ? "Sound off" : "Sound on"}</button></span>
    </header>
  );
}

/* ---------- the card plate. The 3D engine owns #stage and everything inside it. ---------- */
const Plate = memo(function Plate({ hot }) {
  return (
    <section className="plate" aria-label="Card preview">
      <aside className="marg l"><p className="k">Front</p><p className="t">Tide</p><p className="d">Your name, laser etched. Nothing is printed, so nothing can fade.</p></aside>
      <div className="plate-mid">
        <i className="cm tl" /><i className="cm tr" /><i className="cm bl" /><i className="cm br" />
        <div className="spot" aria-hidden="true" />
        <motion.div className="heat" aria-hidden="true" animate={{ opacity: hot ? 1 : 0 }} transition={{ duration: .8 }} />
        <div className="stage" id="stage" aria-label="3D preview of the card. Drag to turn it.">
          <div className="fallback" id="fallback" hidden><img id="fbImg" alt="Front of the card" /></div>
          <span className="hint">Drag to turn</span>
          <div className="flash" id="flash" aria-hidden="true" />
        </div>
        <div className="sides" role="group" aria-label="Show side">
          <button type="button" className="side" id="sideFront" aria-pressed="true"><img id="pvFront" alt="" />Front</button>
          <button type="button" className="side" id="sideBack" aria-pressed="false"><img id="pvBack" alt="" />Back</button>
        </div>
      </div>
      <aside className="marg r"><p className="k">Back</p><p className="t">Ledger</p><p className="d">The genesis record and a tap to verify. Numbered one of twenty five.</p></aside>
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
    <div className="meters">
      <div className="meter"><span className="lab">Cards left</span>
        <div className="big"><Pair v={pad(left)} /><span className="of">of {total}</span></div>
        <div className="bar"><motion.i animate={{ width: (left / total * 100) + "%" }} transition={{ duration: .8, ease }} /></div>
      </div>
      <div className="meter"><span className="lab">{label}</span>
        <div className="clock" role="timer">
          {[["days", D], ["hrs", H], ["min", M], ["sec", S]].map(([u, v]) => <div key={u}><Pair v={pad(v)} /><span className="u">{u}</span></div>)}
        </div>
      </div>
    </div>
  );
}

/* ---------- result ---------- */
function verdictFor(j, st, phase) {
  if (phase === "reading") return "Reading the chain";
  if (phase === "engraving") return "Eligible. Etching your card";
  if (j.claimed) return "Your card is claimed. See you at House of HYPE.";
  if (!j.eligible) return "Not eligible this time. A score of 90 or more qualifies.";
  if (st === "closed") return "You're eligible, but claims are closed.";
  if (j.left <= 0) return "You're eligible, but all 25 cards are claimed.";
  if (st === "upcoming") return "You're eligible. Claims open on 22 Oct, 12:00 pm IST.";
  return "You're eligible. Claim your card before they run out.";
}

function Result({ j, phase, st, onClaim, claiming, onReplay, onVideo, vid }) {
  const reduce = useReducedMotion(), busy = phase === "reading" || phase === "engraving", done = phase === "done";
  const canClaim = done && j.eligible && !j.claimed && st === "open" && j.left > 0;
  const addr = j.address ? j.address.slice(0, 6) + "…" + j.address.slice(-4) : "";
  return (
    <motion.section className="result" aria-live="polite" initial={reduce ? false : { opacity: 0, y: 36, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 140, damping: 20 }}>
      <Ring score={Math.max(0, Math.min(100, j.score || 0))} ok={j.eligible && phase !== "reading"} />
      <p className="rlab">Hyperliquid onchain score</p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.h2 key={verdictFor(j, st, phase)} className={"verdict" + (j.eligible && phase !== "reading" ? " ok" : "")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .35, ease }}>{verdictFor(j, st, phase)}</motion.h2>
      </AnimatePresence>
      <p className="who"><span>{j.name}</span>{addr && <span className="mono">{addr}</span>}</p>
      <AnimatePresence>
        {done && j.eligible && (
          <motion.div className="acts" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {canClaim && <Button variant="accent" onClick={onClaim} disabled={claiming}>{claiming ? "Claiming…" : "Claim your card"}</Button>}
            <Button variant="ghost" onClick={onVideo} disabled={vid.status === "rec"}>{vid.status === "rec" ? "Recording " + Math.ceil(vid.left) + "s" : "Make your video"}</Button>
            <Button variant="ghost" onClick={onReplay}>Replay engraving</Button>
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

function VideoPanel({ vid, caption }) {
  if (vid.status === "idle") return null;
  return (
    <motion.section className="vidbox" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease }}>
      {vid.status === "ready" && <video src={vid.url} controls playsInline loop autoPlay />}
      <div className="vidside">
        <p className="rlab">Your video</p>
        {vid.status === "rec" && <p className="cap-text">Recording your video. Keep this tab open for {Math.ceil(vid.left)} more seconds.</p>}
        {vid.status === "error" && <p className="cap-text">Couldn't make the video here. Try Chrome on desktop.</p>}
        {vid.status === "ready" && <>
          <p className="cap-text">{vid.caption}</p>
          <div className="acts left">
            <Button href={vid.url} download={vid.file}>Download video</Button>
            <Button variant="ghost" onClick={() => navigator.clipboard.writeText(vid.caption)}>Copy caption</Button>
            <Button variant="ghost" href={"https://twitter.com/intent/tweet?text=" + encodeURIComponent(vid.caption)} target="_blank" rel="noopener">Post on X</Button>
          </div>
          <p className="small">{vid.ext === "mp4" ? "Download the video, then attach it to your post. The caption is also burned into the video." : "Your browser saved WebM. X needs MP4, so use Chrome for an MP4 file or convert this one first. The caption is also burned into the video."}</p>
        </>}
      </div>
    </motion.section>
  );
}

/* ---------- footer ---------- */
const Soc = ({ href, icon, children }) => <a href={href} target="_blank" rel="noopener"><span dangerouslySetInnerHTML={{ __html: icon }} />{children}</a>;
function Footer({ socials }) {
  return (
    <footer className="site-foot">
      <Brands cls="brands foot-brands" />
      <nav className="soc" aria-label="Social links">{socials.map(s => <Soc key={s.label} href={s.url} icon={s.icon}>{s.label}</Soc>)}</nav>
      <p className="legal">An independent community of Hyperliquid users. Not Hyperliquid, not Hyper Foundation, not officially affiliated.</p>
    </footer>
  );
}

/* ---------- app ---------- */
export default function App({ socials }) {
  const reduce = useReducedMotion();
  const { info, apply, offset } = useStatus(), now = useNow(offset), st = windowState(info, now);
  const [name, setName] = useState(""), [phase, setPhase] = useState("idle"), [res, setRes] = useState(null);
  const [msg, setMsg] = useState({ t: "The card above updates as you type.", err: false }), [checking, setChecking] = useState(false), [claiming, setClaiming] = useState(false), [muted, setMuted] = useState(false);
  const [vid, setVid] = useState({ status: "idle", left: 0 }), deb = useRef();
  const busy = phase === "reading" || phase === "engraving" || checking;
  const norm = v => v.trim().toLowerCase(), okName = n => HL().validHl(n) || HL().validEth(n);

  const onType = e => {
    if (busy) return; const v = e.target.value, n = norm(v); setName(v); setRes(null); setPhase("idle"); setVid({ status: "idle", left: 0 });
    setMsg(!n ? { t: "The card above updates as you type.", err: false } : okName(n) ? { t: "This is how it will be etched.", err: false } : { t: "Names end in .hl or .eth", err: true });
    clearTimeout(deb.current); deb.current = setTimeout(() => HL().setName(n), 250);
  };
  const submit = async e => {
    e.preventDefault(); if (busy) return; const n = norm(name);
    if (!okName(n)) { setMsg({ t: "Enter a .hl or .eth name.", err: true }); return; }
    HL().unlock(); setChecking(true); setMsg({ t: "Checking " + n + "…", err: false }); setRes(null); setVid({ status: "idle", left: 0 }); HL().setName(n);
    try {
      const [ok, j] = await post("/api/check", { name: n });
      if (!ok) { setMsg({ t: j.error || "Something went wrong.", err: true }); setChecking(false); return; }
      apply(j); setMsg({ t: "", err: false }); setRes(j); setPhase("reading"); setChecking(false);
      await sleep(reduce ? 200 : 1700);
      if (j.eligible) { setPhase("engraving"); await HL().engrave(); }
      setPhase("done");
    } catch (err) { console.error("CHK", err); setMsg({ t: "Network error. Try again.", err: true }); setChecking(false); setPhase("idle"); }
  };
  const replay = async () => { if (phase !== "done") return; setPhase("engraving"); await HL().engrave(); setPhase("done"); };
  const claim = async () => {
    setClaiming(true);
    try { const [ok, j] = await post("/api/claim", { name: norm(name) }); if (j && j.now) apply(j); if (ok) setRes(r => ({ ...r, claimed: true, left: j.left ?? r.left })); else setMsg({ t: j.error || "Couldn't claim. Try again.", err: true }); }
    catch { setMsg({ t: "Network error. Try again.", err: true }); }
    setClaiming(false);
  };
  const makeVideo = async () => {
    if (!res || vid.status === "rec") return; setVid({ status: "rec", left: 9.5, p: 0 });
    try { const o = await HL().record(res, (p, left) => setVid(v => ({ ...v, left }))); setVid({ status: "ready", ...o }); }
    catch (err) { console.error("VID", err); setVid({ status: "error" }); }
  };
  useEffect(() => () => clearTimeout(deb.current), []);

  return (
    <div className="wrap">
      {info?.mock && <div className="demo">Demo data. Preview only.</div>}
      <Masthead muted={muted} setMuted={setMuted} />
      <Marquee items={["Hyperliquid India x ENS", "House of HYPE", "Mumbai", "3 November", "Twenty five pieces", "Laser etched on both faces"]} />

      <main className="hero">
        <motion.p className="eyebrow" {...rise(0, reduce)}><span>Limited edition</span></motion.p>
        <motion.h1 {...rise(1, reduce)}>Your name,<br /><i>laser etched</i><br />in metal.</motion.h1>
        <motion.p className="sub" {...rise(2, reduce)}>Hyperliquid India and ENS are giving away 25 NFC metal cards for House of HYPE. Enter your .hl or .eth name to see your card and check if you are eligible.</motion.p>
        <motion.div className="full" {...rise(3, reduce)}><Meters info={info} now={now} /></motion.div>
        <motion.div className="full" {...rise(4, reduce)}><Plate hot={phase === "engraving"} /></motion.div>

        <AnimatePresence>
          {phase === "engraving" && (
            <motion.div className="etch" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 34 }} exit={{ opacity: 0, height: 0 }}>
              <span>Etching your name</span><div className="etch-bar"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 3.4, ease: "easeInOut" }} /></div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.form className="apply" onSubmit={submit} noValidate {...rise(5, reduce)}>
          <label className="lab" htmlFor="name">Your .hl or .eth name</label>
          <div className="field">
            <input id="name" type="text" value={name} onChange={onType} placeholder="yourname.hl or yourname.eth" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64} />
            <Button type="submit" disabled={busy}>{checking ? "Checking…" : "Check eligibility"}</Button>
          </div>
          <span className={"status" + (msg.err ? " err" : "")} aria-live="polite">{msg.t}</span>
          <p className="getname">No name yet? Get a <a href="https://app.ens.domains" target="_blank" rel="noopener">.eth name</a> or a <a href="https://app.hlnames.xyz" target="_blank" rel="noopener">.hl name</a>.</p>
        </motion.form>

        <AnimatePresence>{res && <Result key={res.name + res.score} j={res} phase={phase} st={st} onClaim={claim} claiming={claiming} onReplay={replay} onVideo={makeVideo} vid={vid} />}</AnimatePresence>
        <VideoPanel vid={vid} />

        <motion.p className="fine" {...rise(6, reduce)}>Winners collect in person at the House of HYPE event in Mumbai on 3 November. At pickup, the winner shows proof of the wallet behind their name, so the card goes to the person who owns the name.</motion.p>
      </main>
      <Footer socials={socials} />
      <span id="stageTag" hidden /><aside id="notes" hidden />
    </div>
  );
}
