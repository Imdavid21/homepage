import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";
import brand from "./brand.json";

export const ease = [0.2, 0.8, 0.2, 1];

// Staggered rise used by every section on first paint.
export const rise = (i = 0, reduce = false) => reduce ? {} : ({ initial: { opacity: 0, y: 22, filter: "blur(6px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, transition: { duration: .9, delay: .08 * i, ease } });

export function HlLogo({ id }) {
  return (
    <svg id={id} className="hli" xmlns="http://www.w3.org/2000/svg" viewBox={brand.hli.vb} role="img" aria-label="Hyperliquid India">
      {brand.hli.paths.map((p, i) => <path key={i} className={p.cls} d={p.d} />)}
    </svg>
  );
}
export function EnsLogo() {
  return <svg className="ens" viewBox={brand.ens.vb} role="img" aria-label="ENS" fill="currentColor"><path d={brand.ens.d} /></svg>;
}
export const Brands = ({ cls = "brands" }) => <div className={cls}><HlLogo /><span className="x">x</span><EnsLogo /></div>;

export function Button({ variant = "solid", children, href, ...p }) {
  const reduce = useReducedMotion();
  const Tag = href ? motion.a : motion.button;
  return <Tag className={"btn " + variant} href={href} whileHover={reduce ? undefined : { y: -2 }} whileTap={reduce ? undefined : { scale: .97 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} {...p}>{children}</Tag>;
}

function Digit({ v }) {
  return (
    <span className="dg"><AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={v} initial={{ y: "70%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-70%", opacity: 0 }} transition={{ duration: .3, ease }}>{v}</motion.span>
    </AnimatePresence></span>
  );
}
export const Pair = ({ v }) => <span className="pair">{String(v).split("").map((c, i, a) => <Digit key={a.length - i} v={c} />)}</span>;

export function Ring({ score, ok }) {
  const mv = useMotionValue(0), reduce = useReducedMotion();
  const shown = useTransform(mv, v => Math.round(v)), len = useTransform(mv, v => v / 100);
  useEffect(() => { const c = animate(mv, score, { duration: reduce ? 0 : 1.4, ease }); return () => c.stop(); }, [score, reduce, mv]);
  return (
    <div className={"ring" + (ok ? " ok" : "")}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="track" cx="60" cy="60" r="52" />
        <g transform="rotate(-90 60 60)"><motion.circle className="arc" cx="60" cy="60" r="52" style={{ pathLength: len }} /></g>
      </svg>
      <div className="num"><motion.b>{shown}</motion.b><span>of 100</span></div>
    </div>
  );
}

export function Marquee({ items }) {
  const reduce = useReducedMotion();
  const row = <span className="mq-row">{items.map((t, i) => <span key={i}>{t}<i aria-hidden="true">|</i></span>)}</span>;
  return (
    <div className="mq" aria-hidden="true">
      <motion.div className="mq-track" animate={reduce ? undefined : { x: ["0%", "-50%"] }} transition={{ duration: 46, ease: "linear", repeat: Infinity }}>{row}{row}{row}{row}</motion.div>
    </div>
  );
}

/* ---------- 1-bit dither pieces ---------- */
import { paint, pathMask, paintBlob } from "./dither.js";

// A fading band of dots, used as a divider.
export function DitherBar({ className = "" }) {
  const ref = useRef(null);
  useEffect(() => { paint(ref.current, 220, 7, (x, y) => Math.pow(1 - Math.abs(x / 110 - 1), 0.9) * (1 - y / 7) * 1.3); }, []);
  return <canvas ref={ref} className={"dbar " + className} aria-hidden="true" />;
}

// The light on the card, drawn in dots that slowly shimmer.
export function DitherSpot() {
  const ref = useRef(null), reduce = useReducedMotion();
  useEffect(() => {
    const W = 300, H = 150; let raf, last = 0;
    const draw = t => paint(ref.current, W, H, (x, y) => {
      const dx = (x - W / 2) / (W * .42), dy = (y - H * .46) / (H * .5), r = Math.sqrt(dx * dx + dy * dy);
      const cone = Math.max(0, 1 - Math.abs(x - W / 2) / (4 + y * .55)) * Math.max(0, 1 - y / (H * .6)) * .55;
      return Math.max(0, (1 - r) * .75 + cone) * (.9 + .1 * Math.sin(t * .9)) * .8;
    });
    const loop = ms => { if (ms - last > 110) { last = ms; draw(ms / 1000); } raf = requestAnimationFrame(loop); };
    if (reduce) draw(0); else raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);
  return <canvas ref={ref} className="dspot" aria-hidden="true" />;
}

// The Hyperliquid mark as a 1-bit dithered plate behind the headline.
export function DitherBlob() {
  const ref = useRef(null), reduce = useReducedMotion();
  useEffect(() => {
    const S = 220, mask = pathMask(brand.blob, S, S); let raf, last = 0;
    const draw = t => paintBlob(ref.current, S, S, mask, t, [236, 231, 223]);
    const loop = ms => { if (ms - last > 120) { last = ms; draw(ms / 1000); } raf = requestAnimationFrame(loop); };
    if (reduce) draw(0); else raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);
  return <canvas ref={ref} className="dblob" aria-hidden="true" />;
}
