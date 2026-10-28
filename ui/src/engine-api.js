  // ---------- API used by the React UI ----------
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const bytes = n => new TextEncoder().encode(n).length;
  const validHl = n => false;
  const validEth = n => /^([a-z0-9 -\uffff]+\.)+eth$/u.test(n);
  // ---------- sound (synthesised, no files) ----------
  const AC = window.AudioContext || window.webkitAudioContext;
  let actx = null, muted = false;
  function ac() { if (!AC) return null; if (!actx) actx = new AC(); if (actx.state === "suspended") actx.resume(); return actx; }
  // ---------- the engraving plan ----------
  // The whole card is engraved from blank brushed metal, on one timeline (0..1) that drives the reveal, the beam, the turn and every sound:
  // front: the Hyperliquid shape dot row by dot row, then the name, then the number. The card turns. Back: the hex dump row by row. Lock.
  const TL = { shape: [.02, .33], name: [.345, .44], no: [.45, .49], turn: .5, hex: [.585, .915] }, LOCK = .935, WARM = TL.shape[0];
  const JOBS = {
    front: (tx, ty) => tx > 1250 && ty > 820 ? "no" : ty > 820 ? "name" : "shape",
    back: () => "hex",
  };
  // rows per pass for each job, in texture pixels: two dot rows of the shape, a few scan lines of the name, one text row of the dump
  const PITCH = { shape: 18, name: 5, no: 7, get hex() { return backPitch(); } };
  const LIMIT = { shape: [10, 40], name: [6, 16], no: [4, 8], hex: [10, 24] };
  function planJob(id, face, px, idxs, k2t, mw) {
    // px: pixel list for this job [k...]. Returns passes, each with its own x span, and the time of every pixel.
    let y0 = 1e9, y1 = -1; for (const k of idxs) { const y = ((k / mw) | 0) * k2t; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    y1 += k2t; const [t0, t1] = TL[id], [lo, hi] = LIMIT[id];
    const n = Math.max(lo, Math.min(hi, Math.round((y1 - y0) / PITCH[id]))), hh = (y1 - y0) / n, pd = (t1 - t0) / n, on = pd * .84;
    const passes = Array.from({ length: n }, (_, i) => ({ face, job: id, t0: t0 + i * pd, t1: t0 + i * pd + on, x0: 1e9, x1: -1, y0: y0 + i * hh, y1: y0 + (i + 1) * hh, dir: i % 2 ? -1 : 1 }));
    const which = new Int16Array(idxs.length);
    idxs.forEach((k, n2) => { const x = (k % mw) * k2t, y = ((k / mw) | 0) * k2t, i = Math.min(n - 1, Math.max(0, Math.floor((y - y0) / hh))), s = passes[i]; which[n2] = i; if (x < s.x0) s.x0 = x; if (x + k2t > s.x1) s.x1 = x + k2t; });
    const T = idxs.map((k, n2) => { const s = passes[which[n2]], x = (k % mw) * k2t, u = Math.min(1, Math.max(0, (x - s.x0) / Math.max(1, s.x1 - s.x0))); return s.t0 + (s.dir > 0 ? u : 1 - u) * (s.t1 - s.t0); });
    return { passes: passes.filter(s => s.x1 >= 0), T };
  }
  // without the 3D engine (or with reduced motion) the sound still needs a rhythm to follow
  const fakePasses = (id, face, n, x0, x1, y0, y1) => { const [t0, t1] = TL[id], pd = (t1 - t0) / n; return Array.from({ length: n }, (_, i) => ({ face, job: id, t0: t0 + i * pd, t1: t0 + i * pd + pd * .84, x0, x1, y0: y0 + i * (y1 - y0) / n, y1: y0 + (i + 1) * (y1 - y0) / n, dir: i % 2 ? -1 : 1 })); };
  const FALLBACK_PLAN = [...fakePasses("shape", "front", 32, 400, 1190, 200, 790), ...fakePasses("name", "front", 9, 100, 460, 856, 906), ...fakePasses("no", "front", 7, 1320, 1475, 872, 920), ...fakePasses("hex", "back", backRows(), 100, 1485, 106, 898)];
  function headAt(plan, face, p) {
    // where the beam is at progress p on this face, or null while it is blanked (between passes, before, after)
    for (const s of plan) if (s.face === face && p >= s.t0 && p <= s.t1) { const u = (p - s.t0) / (s.t1 - s.t0), a = s.dir > 0 ? s.x0 : s.x1, b = s.dir > 0 ? s.x1 : s.x0; return [a + (b - a) * u, (s.y0 + s.y1) / 2, s]; }
    return null;
  }

  // ---------- sound (synthesised, no files), scheduled from the same plan ----------
  const PITCHES = { shape: [1900, 2900], name: [2500, 3600], no: [3300, 4300], hex: [2200, 3300] };
  function laserSound(dur, recDest, quiet, delay = 0.03, plan = FALLBACK_PLAN) {
    const c = ac(); if (!c) return null;
    const bus = c.createGain(); bus.gain.value = 1;
    const live = c.createGain(); live.gain.value = muted ? 0 : 1; if (!quiet) { bus.connect(live); live.connect(c.destination); }
    if (recDest) bus.connect(recDest);
    const t0 = c.currentTime + delay, at = p => t0 + p * dur, tl = at(LOCK), tEnd = tl + 1.4;
    // the source: a low hum that powers up before the first pass, dips while the card turns, and drops away at lock
    const hum = c.createOscillator(); hum.type = "sawtooth"; hum.frequency.setValueAtTime(70, t0); hum.frequency.exponentialRampToValueAtTime(96, at(WARM));
    const hlp = c.createBiquadFilter(); hlp.type = "lowpass"; hlp.frequency.value = 420; const hg = c.createGain();
    hg.gain.setValueAtTime(0, t0); hg.gain.linearRampToValueAtTime(.07, at(WARM)); hg.gain.setValueAtTime(.07, at(TL.no[1])); hg.gain.linearRampToValueAtTime(.035, at(TL.turn + .03)); hg.gain.linearRampToValueAtTime(.07, at(TL.hex[0])); hg.gain.setValueAtTime(.07, at(TL.hex[1])); hg.gain.linearRampToValueAtTime(0, tl);
    hum.connect(hlp); hlp.connect(hg); hg.connect(bus);
    // the burn: band passed noise, open only while the beam fires. Its pitch glides with the head, up going right, down going left.
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ns = c.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 3.2; bp.frequency.setValueAtTime(2800, t0);
    const fizz = c.createBiquadFilter(); fizz.type = "highpass"; fizz.frequency.value = 7200;
    const bg = c.createGain(), fg = c.createGain(); bg.gain.setValueAtTime(0, t0); fg.gain.setValueAtTime(0, t0);
    ns.connect(bp); bp.connect(bg); bg.connect(bus); ns.connect(fizz); fizz.connect(fg); fg.connect(bus);
    // the galvo: a short tick each time the mirror steps to a new row
    const tick = c.createOscillator(); tick.type = "square"; tick.frequency.value = 2300; const tg = c.createGain(); tg.gain.setValueAtTime(0, t0); tick.connect(tg); tg.connect(bus);
    // a faint whine that follows the head
    const wh = c.createOscillator(); wh.type = "sine"; wh.frequency.setValueAtTime(2900, t0); const wg = c.createGain(); wg.gain.setValueAtTime(0, t0); wh.connect(wg); wg.connect(bus);
    plan.forEach(s => {
      const a = at(s.t0), b = at(s.t1), [lo, hi] = PITCHES[s.job] || PITCHES.name, f0 = s.dir > 0 ? lo : hi, f1 = s.dir > 0 ? hi : lo, burn = s.job === "shape" ? .22 : .3;
      bp.frequency.setValueAtTime(f0, a); bp.frequency.linearRampToValueAtTime(f1, b);
      bg.gain.setValueAtTime(0, a); bg.gain.linearRampToValueAtTime(burn, a + .006); bg.gain.setValueAtTime(burn, Math.max(a + .007, b - .01)); bg.gain.linearRampToValueAtTime(0, b);
      fg.gain.setValueAtTime(0, a); fg.gain.linearRampToValueAtTime(.05, a + .006); fg.gain.setValueAtTime(.05, Math.max(a + .007, b - .01)); fg.gain.linearRampToValueAtTime(0, b);
      tg.gain.setValueAtTime(0, a - .004); tg.gain.linearRampToValueAtTime(.03, a - .002); tg.gain.linearRampToValueAtTime(0, a + .006);
      wh.frequency.setValueAtTime(f0 + 300, a); wh.frequency.linearRampToValueAtTime(f1 + 300, b);
      wg.gain.setValueAtTime(0, a); wg.gain.linearRampToValueAtTime(.012, a + .008); wg.gain.setValueAtTime(.012, Math.max(a + .009, b - .008)); wg.gain.linearRampToValueAtTime(0, b);
    });
    // the turn: a soft air swish as the card flips
    const ta = at(TL.turn), sw = c.createBufferSource(); sw.buffer = nb; const swf = c.createBiquadFilter(); swf.type = "bandpass"; swf.Q.value = .8; swf.frequency.setValueAtTime(500, ta); swf.frequency.exponentialRampToValueAtTime(1800, ta + .35); swf.frequency.exponentialRampToValueAtTime(600, ta + .7);
    const swg = c.createGain(); swg.gain.setValueAtTime(0, t0); swg.gain.setValueAtTime(0, ta); swg.gain.linearRampToValueAtTime(.16, ta + .3); swg.gain.linearRampToValueAtTime(0, ta + .75); sw.connect(swf); swf.connect(swg); swg.connect(bus); sw.start(ta); sw.stop(ta + .8);
    // lock: a thump and a soft chord, at the same instant the card flashes
    const th = c.createOscillator(); th.type = "sine"; th.frequency.setValueAtTime(150, tl); th.frequency.exponentialRampToValueAtTime(42, tl + .25);
    const thg = c.createGain(); thg.gain.setValueAtTime(0, t0); thg.gain.setValueAtTime(.32, tl); thg.gain.exponentialRampToValueAtTime(.001, tl + .32); th.connect(thg); thg.connect(bus);
    [880, 1109, 1319, 1760].forEach((f, i) => { const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0, t0); g.gain.setValueAtTime(0, tl); g.gain.linearRampToValueAtTime(.07 - i * .012, tl + .015); g.gain.exponentialRampToValueAtTime(.0008, tEnd); o.connect(g); g.connect(bus); o.start(tl); o.stop(tEnd + .05); });
    [hum, ns, tick, wh].forEach(o => { o.start(t0); o.stop(tl + .05); }); th.start(tl); th.stop(tl + .4);
    return t0;
  }

  // ---------- laser engraving on the card textures ----------
  let eng = null;
  const PXW = () => TEX_W * SCALE, PXH = () => TEX_H * SCALE, HS = innerWidth < 700 ? 3 : 2; // reveal maps run at half or a third of the texture
  function prepEngrave() {
    const Cn = CONCEPTS[S.concept], d = data(), w = PXW(), h = PXH(), mw = Math.ceil(w / HS), mh = Math.ceil(h / HS), k2t = HS / SCALE;
    const g = c => { const x = c.getContext("2d"); x.setTransform(SCALE, 0, 0, SCALE, 0, 0); return x; };
    const out = { plan: [] };
    for (const face of ["front", "back"]) {
      // the finished face, and the blank brushed metal it starts as
      const full = { col: cv(), rough: cv() }, blank = { col: cv(), rough: cv() };
      Cn[face](g(full.col), "color", d); Cn[face](g(full.rough), "rough", d); base(g(blank.col), "color", false); base(g(blank.rough), "rough", false);
      const a = full.col.getContext("2d").getImageData(0, 0, w, h).data, b = blank.col.getContext("2d").getImageData(0, 0, w, h).data;
      // everything the laser writes: every pixel that differs from blank metal, sorted into jobs
      const byJob = {};
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
        const i = ((y * HS) * w + x * HS) * 4; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) <= 24) continue;
        const id = JOBS[face](x * k2t, y * k2t); (byJob[id] || (byJob[id] = [])).push(y * mw + x);
      }
      const idx = [], T = [];
      for (const id of Object.keys(byJob)) { const r = planJob(id, face, null, byJob[id], k2t, mw); r.passes.forEach(q => out.plan.push(q)); for (let n = 0; n < byJob[id].length; n++) { idx.push(byJob[id][n]); T.push(r.T[n]); } }
      const mask = document.createElement("canvas"); mask.width = mw; mask.height = mh; const hot = document.createElement("canvas"); hot.width = mw; hot.height = mh;
      out[face] = { face, full, blank, idx: Int32Array.from(idx), T: Float32Array.from(T), mask, hot, tmp: cv(), mw, mh, last: -1 };
    }
    out.plan.sort((p, q) => p.t0 - q.t0);
    if (!out.plan.length) out.plan = FALLBACK_PLAN;
    eng = out;
  }
  // the etched mask and the cooling trail of one face at progress p
  function buildMaps(f, p) {
    const { T, idx, mw, mh, mask, hot } = f, mx = mask.getContext("2d"), hx = hot.getContext("2d");
    const mi = f.mi || (f.mi = mx.createImageData(mw, mh)), hi = f.hi || (f.hi = hx.createImageData(mw, mh)), md = mi.data, hd = hi.data; md.fill(0); hd.fill(0);
    const HW = .03; // how long a spot glows after the beam has passed, as a share of the run
    for (let n = 0; n < idx.length; n++) { const t = T[n]; if (t > p) continue; const q = idx[n] * 4; md[q + 3] = 255;
      const age = (p - t) / HW; if (age < 1) { const e = 1 - age, w = e * e; hd[q] = 140 + 115 * w; hd[q + 1] = 252; hd[q + 2] = 228 + 27 * w; hd[q + 3] = 255 * e; } }
    mx.putImageData(mi, 0, 0); hx.putImageData(hi, 0, 0);
  }
  // paints one face at progress p into o. Faces that are untouched (not started, or finished and cooled) are painted once and left alone.
  function compFace(f, p, o, withBeam, frame) {
    const w = PXW(), h = PXH(), s = SCALE;
    const start = eng.plan.find(q => q.face === f.face), end = [...eng.plan].reverse().find(q => q.face === f.face);
    const st = !start || p < start.t0 ? "blank" : p > end.t1 + .04 ? "done" : "live";
    if (st !== "live" && f.last === st && f.lastObj === o) return false;
    f.last = st; f.lastObj = o;
    for (const k of ["col", "rough"]) {
      const t = o[k].getContext("2d"); t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = "source-over"; t.globalAlpha = 1; t.filter = "none";
      if (st === "blank") { t.clearRect(0, 0, w, h); t.drawImage(f.blank[k], 0, 0); continue; }
      if (st === "done") { t.clearRect(0, 0, w, h); t.drawImage(f.full[k], 0, 0); continue; }
    }
    if (st !== "live") return true;
    buildMaps(f, p);
    for (const k of ["col", "rough"]) {
      const t = o[k].getContext("2d"), tx = f.tmp.getContext("2d");
      tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalCompositeOperation = "source-over"; tx.clearRect(0, 0, w, h); tx.drawImage(f.full[k], 0, 0);
      tx.globalCompositeOperation = "destination-in"; tx.imageSmoothingEnabled = true; tx.drawImage(f.mask, 0, 0, w, h);
      t.clearRect(0, 0, w, h); t.drawImage(f.blank[k], 0, 0); t.drawImage(f.tmp, 0, 0);
    }
    if (!withBeam) return true;
    const t = o.col.getContext("2d"); t.save(); t.globalCompositeOperation = "lighter";
    // cooling metal: white, then aquamarine, then gone. Once sharp, once bloomed, with a slight chromatic split.
    t.globalAlpha = .9; t.drawImage(f.hot, 0, 0, w, h);
    t.globalAlpha = .65; t.filter = `blur(${5 * s}px)`; t.drawImage(f.hot, 0, 0, w, h); t.filter = "none";
    t.globalAlpha = .22; t.filter = "hue-rotate(-40deg)"; t.drawImage(f.hot, -2 * s, 0, w, h); t.filter = "hue-rotate(40deg)"; t.drawImage(f.hot, 2 * s, 0, w, h); t.filter = "none"; t.globalAlpha = 1;
    const hd = headAt(eng.plan, f.face, p);
    if (hd) {
      // the beam: a white hot spot with bloom, a lens flare along the scan direction, and sparks thrown off the metal
      const hx = hd[0] * s, hy = hd[1] * s;
      const r = 46 * s, rg = t.createRadialGradient(hx, hy, 0, hx, hy, r); rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(.12, "rgba(225,255,248,.9)"); rg.addColorStop(.4, "rgba(151,252,228,.28)"); rg.addColorStop(1, "rgba(151,252,228,0)");
      t.fillStyle = rg; t.fillRect(hx - r, hy - r, r * 2, r * 2);
      const fl = 130 * s, lg = t.createLinearGradient(hx - fl, 0, hx + fl, 0); lg.addColorStop(0, "rgba(151,252,228,0)"); lg.addColorStop(.5, "rgba(230,255,250,.75)"); lg.addColorStop(1, "rgba(151,252,228,0)");
      t.fillStyle = lg; t.fillRect(hx - fl, hy - .8 * s, fl * 2, 1.6 * s);
      const vg = t.createLinearGradient(0, hy - 26 * s, 0, hy + 26 * s); vg.addColorStop(0, "rgba(151,252,228,0)"); vg.addColorStop(.5, "rgba(230,255,250,.6)"); vg.addColorStop(1, "rgba(151,252,228,0)");
      t.fillStyle = vg; t.fillRect(hx - .6 * s, hy - 26 * s, 1.2 * s, 52 * s);
      t.fillStyle = "#fff"; t.beginPath(); t.arc(hx, hy, 2.6 * s, 0, 6.2832); t.fill();
      let sd = frame * 9301 + 49297; const rnd = () => (sd = (sd * 233280 + 1) % 2147483647) / 2147483647;
      t.lineCap = "round"; const back = -hd[2].dir;
      for (let i = 0; i < 18; i++) { const ang = -Math.PI / 2 + back * .5 + (rnd() - .5) * 2.4, len = (6 + rnd() * 34) * s; t.strokeStyle = `rgba(${rnd() > .45 ? "255,240,205" : "200,255,245"},${.35 + rnd() * .6})`; t.lineWidth = (.8 + rnd() * 1.4) * s; t.beginPath(); t.moveTo(hx, hy); t.lineTo(hx + Math.cos(ang) * len, hy + Math.sin(ang) * len); t.stroke(); }
    }
    t.restore();
    return true;
  }
  function comp(p, objs, withBeam, frame) {
    // objs: { front: {col, rough}, back: {col, rough} }; returns which faces changed
    const a = compFace(eng.front, p, objs.front, withBeam, frame), b = compFace(eng.back, p, objs.back, withBeam, frame);
    return a || b;
  }
  const ENG_DUR = 10500;
  async function engraveLive(dur = ENG_DUR, withSound = true) {
    if (!three || reduce) { if (withSound && !reduce) laserSound(3, null, false, .03); await sleep(reduce ? 0 : 3000); return; }
    prepEngrave();
    if (shown !== "front") { showSide("front"); await sleep(900); }
    comp(0, faces, false, 0); three.tex.forEach(t => t.needsUpdate = true);
    // the picture follows the audio clock, so the beam, the burn, the turn and the lock land on the same frame
    const c0 = withSound ? ac() : null, lat = c0 ? (c0.outputLatency || c0.baseLatency || 0) : 0;
    const at0 = withSound ? laserSound(dur / 1000, null, false, 0.15, eng.plan) : null;
    let turned = false, flashed = false;
    await new Promise(res => {
      const t0 = performance.now() + 150; let f = 0;
      const step = now => {
        const p = at0 != null && c0 && c0.state === "running" ? Math.min(1, Math.max(0, (c0.currentTime - lat - at0) / (dur / 1000))) : Math.min(1, Math.max(0, (now - t0) / dur));
        if (comp(p, faces, true, f++)) three.tex.forEach(t => t.needsUpdate = true);
        if (!turned && p >= TL.turn) { turned = true; showSide("back"); }
        if (!flashed && p >= LOCK) { flashed = true; const fl = $("flash"); fl && fl.animate([{ opacity: .95 }, { opacity: 0 }], { duration: 1100, easing: "ease-out" }); }
        if (p < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    paintAll(); three.tex.forEach(t => t.needsUpdate = true);
    // hold on the finished back for a beat, then turn to the front so the name is the last thing seen
    await sleep(700); showSide("front"); await sleep(800);
  }

  // ---------- video export (4:5, made in the browser) ----------
  const VW = 1080, VH = 1350, ENG0 = 1.0, ENG1 = ENG0 + ENG_DUR / 1000, VD = ENG1 + 2.6;
  const logoImgs = {};
  const svgImage = str => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str); });
  const ENS_WHITE = "M38.03,93.59C37.93,93.37,37.61,93.06,37.33,92.91C37.04,92.77,36.38,92.32,35.86,91.93C35.34,91.54,34.69,91.09,34.42,90.94C34.14,90.78,33.58,90.40,33.17,90.08C32.75,89.76,32.20,89.36,31.93,89.20C31.67,89.05,31.29,88.77,31.11,88.58C30.73,88.21,29.98,87.73,28.81,87.10C28.39,86.87,28.00,86.57,27.94,86.43C27.89,86.29,27.60,86.06,27.30,85.92C27.00,85.78,26.38,85.36,25.92,84.99C25.46,84.62,24.82,84.17,24.50,83.99C24.18,83.81,23.58,83.40,23.17,83.08C22.75,82.76,22.20,82.36,21.93,82.20C21.67,82.05,21.29,81.77,21.11,81.58C20.74,81.22,19.98,80.73,18.92,80.16C18.55,79.96,18.14,79.66,18.00,79.48C17.86,79.31,17.51,79.03,17.23,78.87C15.86,78.11,14.16,76.66,11.40,73.90C9.74,72.24,8.21,70.58,7.98,70.21C7.76,69.84,7.28,69.10,6.92,68.57C5.86,67.04,5.65,66.68,4.28,64.04C4.13,63.74,3.89,63.27,3.75,63.00C3.61,62.73,3.40,62.29,3.27,62.04C2.70,60.91,2.27,59.84,1.99,58.83C1.82,58.24,1.53,57.23,1.35,56.58C1.17,55.94,1.01,55.12,1.01,54.75C1.00,54.37,0.78,53.62,0.50,53.03L-0.00,51.97L0.00,46.38L0.00,40.80L0.40,40.33C0.71,39.95,0.83,39.51,1.00,38.14C1.12,37.19,1.34,36.15,1.50,35.83C1.66,35.51,1.84,34.88,1.91,34.42C2.07,33.33,2.26,33.00,2.74,33.00C3.31,33.00,3.47,33.29,3.77,34.93C3.91,35.75,4.25,36.99,4.52,37.70C4.78,38.41,5.00,39.04,5.00,39.12C5.00,39.19,5.23,39.59,5.50,40.00C5.77,40.41,6.00,40.86,6.00,41.00C6.00,41.14,6.23,41.59,6.50,42.00C6.77,42.41,7.00,42.86,7.01,43.00C7.01,43.14,7.35,43.77,7.76,44.42C8.16,45.06,8.73,46.00,9.01,46.50C9.72,47.78,10.22,48.59,10.51,48.95C10.84,49.34,12.00,51.27,12.00,51.42C12.00,51.49,12.21,51.78,12.46,52.08C12.71,52.38,13.13,52.99,13.39,53.44C13.65,53.88,14.02,54.50,14.22,54.81C14.42,55.13,14.77,55.70,15.00,56.10C15.23,56.49,15.76,57.33,16.18,57.95C17.24,59.54,17.32,59.66,18.23,61.03C18.68,61.70,19.18,62.44,19.35,62.67C19.53,62.90,19.85,63.43,20.07,63.84C20.29,64.26,20.59,64.70,20.74,64.82C20.88,64.94,21.00,65.11,21.00,65.20C21.00,65.35,21.16,65.60,22.47,67.53C22.76,67.95,23.00,68.36,23.00,68.42C23.00,68.49,23.21,68.78,23.46,69.08C23.71,69.37,24.07,69.87,24.25,70.18C25.00,71.46,25.11,71.63,25.47,72.10C26.08,72.88,27.00,74.31,27.00,74.47C27.00,74.55,27.16,74.76,27.35,74.93C27.55,75.11,27.85,75.55,28.02,75.92C28.20,76.28,28.52,76.85,28.75,77.17C28.97,77.49,29.31,77.98,29.50,78.25C29.69,78.52,30.03,79.01,30.25,79.33C30.47,79.65,30.85,80.25,31.08,80.67C31.61,81.58,31.86,81.97,34.18,85.44C34.31,85.64,34.76,86.31,35.18,86.94C35.60,87.57,36.08,88.30,36.26,88.56C37.10,89.81,37.52,90.46,37.79,90.89C37.95,91.15,38.29,91.63,38.54,91.96C38.88,92.39,39.00,92.73,39.00,93.27C39.00,93.92,38.96,94.00,38.61,94.00C38.36,94.00,38.15,93.86,38.03,93.59ZM42.00,93.29C42.01,92.53,42.06,92.40,43.07,90.90C43.43,90.36,43.88,89.64,44.07,89.30C44.26,88.96,44.60,88.36,44.81,87.97C45.03,87.57,45.62,86.64,46.11,85.89C46.60,85.14,47.00,84.47,47.00,84.39C47.01,84.31,47.23,83.96,47.50,83.60C47.78,83.24,48.00,82.84,48.00,82.73C48.00,82.61,48.21,82.27,48.46,81.96C48.72,81.66,49.06,81.15,49.21,80.83C49.37,80.51,49.73,79.91,50.00,79.50C50.28,79.09,50.69,78.36,50.91,77.88C51.14,77.39,51.41,77.00,51.50,77.00C51.59,77.00,51.86,76.61,52.09,76.12C52.31,75.64,52.72,74.91,52.99,74.50C53.27,74.09,53.65,73.45,53.85,73.08C54.04,72.72,54.33,72.27,54.49,72.08C54.77,71.76,55.41,70.70,56.08,69.47C56.27,69.13,56.71,68.42,57.07,67.89C57.71,66.95,57.93,66.58,58.86,64.88C59.11,64.43,59.63,63.58,60.03,62.99C60.43,62.40,60.90,61.64,61.08,61.31C61.96,59.70,62.27,59.15,63.08,57.92C64.35,55.95,64.63,55.49,64.99,54.71C65.17,54.32,65.40,54.00,65.50,54.00C65.60,54.00,65.80,53.72,65.94,53.38C66.40,52.26,67.40,50.85,67.86,50.66C68.40,50.43,68.56,50.51,69.08,51.31C69.30,51.64,69.77,52.33,70.12,52.84C71.22,54.44,71.97,55.74,72.09,56.26C72.16,56.53,72.37,57.05,72.55,57.42C72.74,57.78,72.99,58.53,73.12,59.08C73.25,59.63,73.47,60.53,73.61,61.08C74.01,62.71,73.93,65.42,73.42,67.02C73.19,67.75,73.00,68.49,73.00,68.65C73.00,68.82,72.83,69.21,72.61,69.53C72.40,69.84,72.14,70.32,72.05,70.59C71.86,71.12,70.99,72.44,70.32,73.23C68.92,74.87,67.75,76.07,66.58,77.09C65.85,77.73,64.95,78.54,64.58,78.90C64.22,79.25,63.17,80.13,62.25,80.85C61.33,81.57,60.10,82.54,59.50,83.01C58.90,83.48,58.19,84.01,57.92,84.18C57.64,84.35,57.08,84.76,56.67,85.08C56.25,85.40,55.65,85.82,55.33,86.00C55.01,86.19,54.49,86.53,54.17,86.75C53.85,86.97,53.36,87.31,53.08,87.50C52.81,87.69,52.32,88.03,52.00,88.25C51.68,88.48,51.12,88.81,50.75,89.00C50.10,89.33,49.36,89.81,48.50,90.46C48.27,90.64,47.86,90.86,47.58,90.95C47.31,91.05,46.60,91.44,46.00,91.81C45.40,92.19,44.65,92.62,44.33,92.77C44.01,92.92,43.64,93.09,43.50,93.16C43.36,93.22,43.18,93.44,43.09,93.64C42.97,93.88,42.77,94.00,42.46,94.00C42.03,94.00,42.00,93.95,42.00,93.29ZM129.08,82.08C127.18,81.92,126.01,81.74,125.01,81.43C124.24,81.19,123.45,81.00,123.26,81.00C123.07,81.00,122.52,80.81,122.04,80.59C121.56,80.37,120.88,80.13,120.54,80.07C120.20,80.00,119.51,79.74,119.02,79.48C118.52,79.21,117.99,79.00,117.83,79.00C117.67,79.00,117.33,78.83,117.08,78.62C116.52,78.19,115.32,77.46,114.51,77.07C114.20,76.93,113.46,76.40,112.88,75.90C112.29,75.41,111.76,75.00,111.70,75.00C111.53,74.99,110.07,73.57,109.00,72.38C108.02,71.29,107.36,70.43,106.78,69.51C106.58,69.20,106.15,68.52,105.83,68.01C104.89,66.53,104.05,64.96,103.93,64.43C103.86,64.16,103.67,63.74,103.50,63.50C103.33,63.26,103.08,62.62,102.95,62.07C102.81,61.53,102.55,60.71,102.37,60.25C102.01,59.34,101.21,56.15,101.08,55.08C100.47,49.92,100.27,46.38,100.49,44.08C100.97,38.88,101.18,37.32,101.58,36.01C101.81,35.24,102.00,34.46,102.00,34.28C102.00,34.10,102.18,33.54,102.39,33.02C102.60,32.51,102.90,31.75,103.04,31.33C103.56,29.84,104.22,28.41,104.61,27.95C104.82,27.69,105.00,27.38,105.00,27.27C105.00,26.71,106.66,24.53,109.41,21.49C109.87,20.98,111.41,19.64,112.83,18.51C113.06,18.33,113.58,17.91,113.97,17.59C114.37,17.27,114.84,17.00,115.00,17.00C115.17,17.00,115.52,16.82,115.78,16.61C116.24,16.23,119.16,14.83,119.51,14.83C119.60,14.83,120.03,14.65,120.46,14.44C120.90,14.22,121.58,13.99,121.98,13.92C122.38,13.85,123.03,13.65,123.43,13.48C123.83,13.30,124.81,13.08,125.62,12.98C126.42,12.89,127.46,12.71,127.92,12.58C130.72,11.83,137.61,11.83,141.33,12.58C142.48,12.81,143.58,13.00,143.79,13.00C143.99,13.00,144.95,13.26,145.91,13.58C146.86,13.90,147.79,14.17,147.97,14.17C148.14,14.17,148.47,14.30,148.69,14.47C148.90,14.64,149.43,14.90,149.86,15.06C150.29,15.22,150.73,15.45,150.83,15.58C150.94,15.71,151.23,15.86,151.49,15.91C152.96,16.24,157.90,20.20,159.60,22.43C161.08,24.36,163.00,27.27,163.00,27.57C163.00,27.67,163.19,28.03,163.41,28.36C163.64,28.70,163.93,29.26,164.06,29.61C164.37,30.44,165.08,32.30,165.59,33.63C165.82,34.20,166.00,34.88,166.00,35.13C166.01,35.38,166.19,36.11,166.42,36.75C166.65,37.39,166.91,38.63,167.01,39.50C167.10,40.37,167.26,41.31,167.35,41.58C167.92,43.22,168.24,50.24,167.77,50.71C167.58,50.89,166.65,50.97,163.64,51.06C161.50,51.12,158.06,51.25,156.00,51.34C153.94,51.43,150.49,51.58,148.33,51.67C146.18,51.77,140.82,51.91,136.42,52.00C132.02,52.08,126.58,52.24,124.34,52.33C119.28,52.56,119.25,52.57,119.26,54.18C119.26,55.59,120.10,59.54,120.60,60.54C120.82,60.97,121.00,61.42,121.00,61.54C121.01,61.65,121.23,62.04,121.50,62.40C121.78,62.76,122.00,63.15,122.00,63.25C122.00,63.53,125.44,67.00,125.72,67.00C125.85,67.00,126.21,67.17,126.52,67.38C127.12,67.78,129.83,68.73,130.90,68.91C131.75,69.06,137.26,69.06,138.10,68.91C138.46,68.85,139.29,68.62,139.94,68.40C140.60,68.18,141.28,68.00,141.44,68.00C141.61,68.00,142.09,67.77,142.50,67.50C142.91,67.23,143.33,67.00,143.44,67.00C143.54,67.00,143.73,66.88,143.85,66.72C143.98,66.57,144.39,66.25,144.77,66.02C145.84,65.35,147.68,62.76,148.07,61.39C148.20,60.95,148.42,60.25,148.56,59.83C148.70,59.42,148.88,58.86,148.95,58.58L149.09,58.08L153.26,58.11C156.97,58.13,165.31,58.65,166.45,58.94C166.65,58.99,166.87,59.18,166.93,59.37C167.07,59.82,166.86,61.14,166.54,61.75C166.40,62.02,166.15,62.66,165.99,63.17C165.54,64.56,164.77,66.30,164.11,67.42C163.78,67.97,163.32,68.77,163.09,69.21C162.85,69.64,162.59,70.00,162.50,70.00C162.41,70.00,162.19,70.30,162.00,70.66C161.69,71.27,157.25,75.83,156.97,75.83C156.90,75.83,156.60,76.04,156.30,76.30C155.59,76.90,153.76,78.00,153.47,78.00C153.35,78.00,152.91,78.23,152.50,78.50C152.09,78.77,151.64,79.00,151.51,79.00C151.39,79.00,150.94,79.22,150.51,79.48C150.09,79.74,149.42,80.01,149.03,80.07C148.63,80.13,148.01,80.32,147.66,80.50C147.30,80.68,146.50,80.91,145.86,81.00C145.23,81.09,144.49,81.24,144.23,81.34C143.38,81.67,142.14,81.85,139.17,82.09C135.68,82.37,132.69,82.37,129.08,82.08ZM266.83,82.24C266.60,82.21,265.25,82.10,263.83,81.99C262.30,81.87,260.90,81.67,260.39,81.49C259.91,81.33,258.94,81.10,258.22,81.00C257.50,80.89,256.64,80.66,256.31,80.49C255.97,80.31,255.36,80.10,254.94,80.01C254.53,79.91,253.91,79.65,253.57,79.42C253.23,79.19,252.83,79.00,252.69,79.00C252.42,79.00,252.27,78.92,250.64,78.02C248.16,76.63,244.52,73.39,243.50,71.68C243.27,71.30,242.92,70.74,242.72,70.45C241.75,69.05,240.00,64.58,240.00,63.52C240.00,63.25,239.91,62.65,239.81,62.19C239.64,61.47,239.65,61.30,239.90,60.92C240.30,60.31,240.60,60.23,243.26,60.03C244.54,59.93,246.46,59.70,247.51,59.51C248.56,59.33,250.28,59.10,251.33,59.00C253.27,58.83,254.96,58.61,255.96,58.40C256.38,58.32,256.60,58.37,256.86,58.60C257.38,59.08,257.49,59.36,257.82,61.25C258.02,62.33,258.27,63.18,258.49,63.48C258.68,63.75,258.83,64.05,258.83,64.14C258.83,64.24,259.04,64.57,259.30,64.87C259.56,65.17,259.91,65.65,260.09,65.94C260.27,66.23,260.80,66.76,261.26,67.13C262.22,67.88,264.29,69.00,264.73,69.00C264.89,69.00,265.60,69.20,266.31,69.45C267.52,69.87,267.74,69.89,270.75,69.89C273.28,69.89,274.10,69.83,274.83,69.60C275.34,69.44,276.12,69.21,276.58,69.09C278.62,68.55,281.00,66.50,281.67,64.71C281.96,63.92,282.02,63.48,281.97,62.17C281.92,60.68,281.88,60.53,281.35,59.77C280.74,58.89,279.86,58.01,279.57,58.00C279.48,58.00,279.15,57.81,278.84,57.59C278.53,57.36,278.01,57.09,277.68,56.98C277.35,56.87,276.90,56.65,276.67,56.49C276.44,56.33,275.85,56.11,275.37,56.01C274.89,55.92,274.21,55.69,273.87,55.52C273.53,55.34,272.60,55.08,271.82,54.93C271.03,54.79,270.14,54.55,269.86,54.40C269.57,54.26,268.85,54.07,268.26,53.99C267.67,53.91,266.79,53.69,266.30,53.52C265.82,53.34,264.89,53.11,264.25,53.00C263.61,52.90,262.75,52.66,262.34,52.48C261.93,52.30,261.14,52.09,260.57,52.01C260.01,51.93,259.26,51.72,258.90,51.54C258.54,51.36,257.88,51.12,257.42,51.01C256.62,50.82,255.19,50.25,253.42,49.42C252.96,49.20,252.40,48.94,252.17,48.84C251.57,48.58,250.00,47.66,249.24,47.12C247.64,45.99,247.36,45.76,246.36,44.79C245.78,44.22,245.19,43.52,245.05,43.25C244.91,42.98,244.70,42.64,244.58,42.50C243.92,41.74,242.54,38.80,242.15,37.33C241.90,36.39,241.78,31.07,241.97,29.23C242.07,28.19,242.26,27.29,242.46,26.90C242.64,26.54,242.84,25.98,242.90,25.64C242.96,25.31,243.18,24.78,243.39,24.47C243.60,24.16,243.86,23.65,243.97,23.34C244.31,22.37,245.34,20.99,246.84,19.51C248.33,18.04,249.54,17.00,249.78,17.00C249.86,16.99,250.21,16.77,250.57,16.50C250.93,16.22,251.36,16.00,251.52,16.00C251.68,16.00,252.02,15.82,252.29,15.59C252.56,15.37,252.99,15.14,253.26,15.07C253.53,15.01,254.00,14.80,254.32,14.62C254.63,14.43,255.42,14.14,256.07,13.98C256.72,13.81,257.66,13.53,258.17,13.34C258.67,13.16,259.38,13.01,259.75,13.00C260.12,13.00,260.83,12.89,261.33,12.75C261.84,12.62,263.34,12.38,264.67,12.23C267.50,11.91,273.09,12.01,275.58,12.42C276.41,12.56,277.85,12.78,278.79,12.91C279.73,13.05,280.86,13.31,281.29,13.49C281.73,13.67,282.52,13.90,283.06,14.01C283.60,14.11,284.38,14.38,284.80,14.60C285.21,14.82,285.64,15.00,285.75,15.00C285.86,15.00,286.21,15.17,286.53,15.39C286.84,15.60,287.35,15.86,287.66,15.97C288.33,16.20,289.79,17.16,290.23,17.65C290.41,17.84,290.64,18.00,290.74,18.00C290.96,18.00,293.56,20.64,294.26,21.58C295.00,22.58,296.00,24.27,296.00,24.53C296.00,24.65,296.19,25.03,296.41,25.36C296.64,25.70,296.90,26.32,297.00,26.75C297.10,27.18,297.29,27.80,297.43,28.14C297.58,28.48,297.79,29.35,297.91,30.08C298.26,32.20,297.98,32.51,295.42,32.83C294.59,32.94,292.83,33.24,291.49,33.51C290.16,33.78,288.73,34.00,288.31,34.00C287.89,34.00,287.18,34.12,286.73,34.26C284.72,34.89,281.53,35.19,281.20,34.79C281.11,34.68,280.95,34.17,280.86,33.67C280.56,32.10,279.87,30.04,279.43,29.39C279.19,29.04,279.00,28.69,279.00,28.62C279.00,28.54,278.48,27.96,277.85,27.34C276.09,25.59,273.90,24.76,270.24,24.42C268.32,24.24,264.38,24.90,263.40,25.56C263.05,25.80,262.62,26.00,262.45,26.00C262.09,26.00,260.56,27.40,260.23,28.04C259.81,28.85,259.34,30.56,259.34,31.28C259.33,32.24,260.14,33.93,261.02,34.82C261.42,35.22,262.16,35.73,262.67,35.96C263.17,36.18,263.70,36.46,263.83,36.58C263.97,36.70,264.42,36.89,264.83,37.00C265.24,37.11,265.85,37.34,266.17,37.50C266.50,37.67,267.06,37.85,267.42,37.91C267.79,37.98,268.83,38.24,269.75,38.50C270.67,38.76,271.98,39.08,272.67,39.23C275.83,39.88,276.69,40.07,278.25,40.51C279.17,40.77,280.18,41.03,280.50,41.09C281.09,41.19,282.98,41.78,284.67,42.37C285.17,42.55,285.92,42.82,286.33,42.96C287.27,43.28,287.68,43.45,288.00,43.66C288.14,43.75,288.59,43.97,289.00,44.17C289.41,44.36,290.10,44.72,290.52,44.97C290.95,45.21,291.63,45.60,292.02,45.82C293.55,46.66,297.97,51.55,298.01,52.44C298.01,52.52,298.23,53.03,298.51,53.58C298.78,54.13,299.00,54.75,299.00,54.96C299.00,55.42,299.37,56.18,299.74,56.49C299.96,56.68,300.00,57.33,300.00,61.28C300.00,65.22,299.97,65.86,299.75,65.94C299.38,66.08,299.17,66.55,299.00,67.58C298.88,68.35,298.16,70.17,297.66,71.00C297.57,71.14,297.30,71.62,297.06,72.08C296.63,72.89,292.68,77.00,292.33,77.00C292.24,77.00,291.85,77.23,291.47,77.50C291.09,77.77,290.70,78.00,290.60,78.00C290.50,78.00,290.09,78.23,289.68,78.50C289.28,78.78,288.80,79.00,288.61,79.00C288.43,79.00,287.94,79.22,287.51,79.48C287.09,79.74,286.42,80.01,286.03,80.07C285.63,80.13,285.02,80.32,284.67,80.50C284.32,80.68,283.54,80.90,282.94,81.00C282.34,81.09,281.63,81.25,281.38,81.35C280.62,81.64,279.26,81.83,276.17,82.09C273.65,82.29,268.11,82.38,266.83,82.24ZM173.19,81.61C173.05,81.45,173.00,72.30,173.00,47.82C173.00,16.39,173.01,14.24,173.28,14.04C173.50,13.88,175.55,13.83,182.17,13.83L190.78,13.83L191.13,14.22C191.48,14.58,191.50,14.77,191.54,18.17L191.58,21.75L192.08,21.75C192.52,21.75,192.65,21.63,193.07,20.83C193.59,19.87,197.00,16.32,197.92,15.80C198.19,15.64,198.90,15.20,199.49,14.83C200.09,14.45,200.80,14.10,201.08,14.05C201.36,14.00,201.96,13.78,202.42,13.57C202.88,13.36,204.11,13.03,205.17,12.83C206.22,12.63,207.46,12.39,207.92,12.30C208.38,12.20,210.17,12.13,211.92,12.13C214.65,12.13,215.37,12.19,217.20,12.57C218.37,12.81,219.49,13.00,219.70,13.00C219.91,13.00,220.48,13.19,220.96,13.41C221.44,13.63,222.10,13.87,222.42,13.93C222.75,13.99,223.26,14.21,223.57,14.42C223.88,14.63,224.31,14.85,224.52,14.92C224.74,14.98,225.07,15.17,225.25,15.33C225.43,15.50,225.85,15.76,226.17,15.92C226.93,16.30,230.53,19.89,231.21,20.94C232.46,22.87,232.86,23.60,233.00,24.27C233.09,24.66,233.31,25.22,233.49,25.53C233.67,25.83,233.90,26.59,233.99,27.20C234.09,27.82,234.26,28.53,234.36,28.79C234.97,30.26,235.01,32.06,235.11,56.54C235.16,69.72,235.16,80.69,235.10,80.91C234.86,81.87,235.23,81.83,225.91,81.83C219.99,81.83,217.22,81.78,216.94,81.65C216.72,81.55,216.45,81.28,216.35,81.06C216.22,80.77,216.17,74.65,216.16,59.53C216.16,47.92,216.09,37.50,216.01,36.38C215.89,34.74,215.78,34.16,215.43,33.43C215.19,32.93,215.00,32.41,215.00,32.28C215.00,31.52,212.21,28.45,210.98,27.84C210.58,27.65,210.05,27.38,209.80,27.24C209.17,26.89,205.34,26.45,203.83,26.55C201.78,26.70,200.11,27.08,199.40,27.56C199.05,27.80,198.63,28.00,198.47,28.00C197.69,28.00,194.42,31.44,194.01,32.70C193.90,33.04,193.67,33.49,193.50,33.71C193.33,33.93,193.07,34.61,192.93,35.23C192.79,35.84,192.55,36.57,192.41,36.84C191.85,37.92,191.78,40.33,191.68,60.81L191.58,81.03L191.12,81.43L190.65,81.83L182.01,81.83C174.97,81.83,173.34,81.79,173.19,81.61ZM78.28,61.64C78.07,61.52,78.00,61.24,78.00,60.45C77.99,59.76,77.88,59.17,77.64,58.67C77.45,58.25,77.20,57.50,77.08,57.00C76.85,56.03,76.17,54.24,75.72,53.42C75.57,53.14,75.24,52.52,74.98,52.03C74.73,51.54,74.43,51.03,74.33,50.91C74.22,50.78,73.99,50.40,73.80,50.05C73.61,49.70,73.33,49.18,73.17,48.88C73.01,48.59,72.68,48.12,72.44,47.83C72.20,47.54,72.00,47.17,72.00,47.00C72.00,46.83,71.83,46.48,71.62,46.22C71.15,45.62,70.23,44.23,69.40,42.83C69.05,42.24,68.59,41.52,68.38,41.23C68.17,40.95,68.00,40.66,68.00,40.59C68.00,40.52,67.79,40.22,67.54,39.92C67.29,39.62,66.87,39.01,66.61,38.56C66.35,38.12,65.98,37.50,65.78,37.19C65.58,36.87,65.23,36.30,65.00,35.90C64.77,35.51,64.24,34.67,63.82,34.05C62.95,32.75,62.81,32.54,61.68,30.83C61.22,30.15,60.72,29.40,60.55,29.17C60.39,28.94,59.89,28.15,59.44,27.42C59.00,26.68,58.49,25.93,58.32,25.74C58.14,25.55,58.00,25.34,58.00,25.28C58.00,25.22,57.77,24.85,57.50,24.47C57.22,24.09,57.00,23.71,57.00,23.62C57.00,23.53,56.79,23.22,56.54,22.92C56.29,22.63,55.93,22.13,55.75,21.82C55.00,20.54,54.89,20.37,54.53,19.90C53.92,19.12,53.00,17.69,53.00,17.53C53.00,17.45,52.84,17.24,52.65,17.07C52.46,16.89,52.15,16.49,51.97,16.17C51.47,15.25,50.11,13.11,49.50,12.25C49.02,11.57,48.50,10.76,48.00,9.90C47.77,9.51,47.24,8.67,46.82,8.05C45.96,6.77,45.83,6.58,44.68,4.83C44.22,4.15,43.63,3.28,43.36,2.92C42.47,1.70,42.41,1.56,42.66,1.26C42.95,0.91,43.53,0.93,44.02,1.31C44.37,1.58,47.61,3.82,49.04,4.78C49.34,4.99,49.77,5.31,50.00,5.50C50.61,6.00,52.13,7.00,52.30,7.00C52.38,7.00,52.59,7.16,52.77,7.35C52.94,7.55,53.32,7.87,53.61,8.06C53.90,8.26,55.10,9.08,56.28,9.89C57.45,10.70,58.68,11.54,59.00,11.75C59.32,11.97,59.77,12.31,60.00,12.50C60.61,13.00,62.13,14.00,62.30,14.00C62.38,14.00,62.59,14.16,62.77,14.35C62.94,14.55,63.35,14.88,63.67,15.10C65.44,16.27,66.78,17.24,67.00,17.51C67.14,17.67,67.86,18.32,68.60,18.95C69.34,19.57,70.47,20.68,71.10,21.42C71.74,22.15,72.58,23.09,72.97,23.50C73.36,23.91,73.80,24.47,73.95,24.75C74.10,25.03,74.39,25.48,74.61,25.77C74.82,26.05,75.00,26.34,75.00,26.41C75.00,26.48,75.23,26.80,75.50,27.11C75.77,27.42,76.00,27.77,76.00,27.88C76.01,27.99,76.23,28.38,76.50,28.74C76.78,29.10,77.00,29.47,77.00,29.57C77.00,29.67,77.18,30.03,77.41,30.36C77.63,30.69,77.87,31.17,77.93,31.44C78.00,31.70,78.22,32.25,78.42,32.67C78.63,33.08,78.91,33.80,79.05,34.27C79.19,34.74,79.42,35.35,79.56,35.63C79.71,35.90,79.93,36.61,80.06,37.19C80.19,37.77,80.42,38.66,80.57,39.17C80.83,40.03,81.12,42.19,81.51,46.18C81.63,47.39,81.63,48.56,81.51,49.93C81.21,53.40,80.73,56.73,80.45,57.26C80.31,57.55,80.10,58.30,79.99,58.93C79.80,60.04,79.11,61.59,78.74,61.73C78.64,61.77,78.44,61.73,78.28,61.64ZM12.16,42.65C11.60,41.90,11.07,41.09,10.98,40.85C10.89,40.61,10.68,40.27,10.51,40.08C9.70,39.19,8.22,35.10,8.00,33.14C7.56,29.31,8.14,25.88,9.62,23.58C11.11,21.28,12.59,19.47,13.82,18.44C14.24,18.09,15.23,17.19,16.03,16.44C17.57,14.99,17.84,14.77,19.92,13.09C22.09,11.33,22.23,11.23,22.67,11.00C22.90,10.88,23.56,10.38,24.13,9.89C24.71,9.40,25.27,9.00,25.36,9.00C25.46,9.00,25.78,8.79,26.08,8.54C26.58,8.11,27.08,7.78,28.17,7.15C28.43,7.01,28.87,6.69,29.16,6.45C29.45,6.20,29.76,6.00,29.83,6.00C29.91,6.00,30.19,5.82,30.45,5.61C30.70,5.40,31.18,5.13,31.49,5.02C31.81,4.92,32.22,4.69,32.41,4.53C32.82,4.17,34.75,3.00,34.93,3.00C35.00,3.00,35.29,2.82,35.58,2.60C35.87,2.38,36.36,2.08,36.68,1.94C36.99,1.79,37.51,1.52,37.83,1.34C38.53,0.93,39.63,0.88,39.77,1.25C39.83,1.39,39.75,1.67,39.60,1.88C39.11,2.55,38.26,3.89,37.92,4.52C37.73,4.86,37.29,5.58,36.93,6.11C36.28,7.06,36.06,7.44,35.12,9.15C34.87,9.62,34.29,10.55,33.83,11.22C33.37,11.89,33.00,12.50,33.00,12.57C33.00,12.71,31.22,15.68,30.49,16.75C29.81,17.76,29.37,18.51,29.01,19.29C28.83,19.68,28.60,20.00,28.50,20.00C28.41,20.00,28.14,20.39,27.91,20.88C27.69,21.36,27.28,22.09,27.00,22.50C26.72,22.91,26.31,23.64,26.09,24.12C25.86,24.61,25.59,25.00,25.49,25.00C25.39,25.00,25.16,25.32,24.98,25.71C24.66,26.38,23.96,27.56,23.26,28.61C22.54,29.69,21.65,31.19,20.92,32.53C20.73,32.87,20.29,33.58,19.93,34.11C19.28,35.06,19.06,35.45,18.12,37.17C17.86,37.64,17.31,38.52,16.89,39.13C16.47,39.74,16.07,40.39,16.00,40.58C15.53,41.78,13.90,44.00,13.49,44.00C13.30,44.00,12.79,43.48,12.16,42.65ZM128.08,39.32C130.19,39.23,134.20,39.12,137.00,39.08C139.80,39.04,143.36,38.97,144.92,38.92C147.73,38.83,147.75,38.83,148.14,38.39C148.58,37.89,148.58,37.81,148.02,35.36C147.83,34.50,147.53,33.56,147.36,33.27C147.18,32.99,146.99,32.53,146.93,32.27C146.87,32.00,146.63,31.55,146.41,31.25C146.18,30.96,146.00,30.63,146.00,30.52C146.00,30.27,142.71,27.00,142.45,27.00C142.33,27.00,141.97,26.81,141.64,26.59C141.30,26.36,140.69,26.10,140.27,26.01C139.86,25.91,139.15,25.69,138.70,25.51C136.89,24.80,131.70,24.89,129.29,25.68C128.76,25.86,128.25,26.00,128.15,26.00C127.84,26.00,125.29,27.19,124.78,27.57C123.70,28.36,122.28,29.79,121.98,30.38C121.80,30.72,121.59,31.00,121.51,31.00C121.29,31.00,120.08,33.60,119.85,34.57C119.74,35.02,119.53,35.61,119.39,35.88C119.25,36.16,119.09,36.96,119.04,37.67C118.96,38.84,118.99,38.99,119.33,39.33C119.69,39.69,119.77,39.70,121.98,39.59C123.23,39.53,125.98,39.41,128.08,39.32Z";
  async function loadLogos() {
    if (logoImgs.hl !== undefined) return;
    const hl = document.querySelector(".brands svg.hli").outerHTML.replace('class="hli"', "").replace(/class="cls-1"/g, 'fill="#EDEDED"').replace(/class="cls-2"/g, 'fill="#78cdce"').replace("<svg ", '<svg width="1145" height="156" ');
    const es = document.querySelector(".brands svg.ens"), e = { vb: es.getAttribute("viewBox"), d: ENS_WHITE }, vb = e.vb.split(/[ ,]+/).map(Number); // the video keeps the white ENS mark, as before
    logoImgs.hl = await svgImage(hl); logoImgs.ens = await svgImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${e.vb}" width="${vb[2]}" height="${vb[3]}"><path fill="#EDEDED" fill-rule="evenodd" d="${e.d}"/></svg>`);
  }
  function wrap(x, text, w) { const out = []; let line = ""; text.split(" ").forEach(wd => { const t = line ? line + " " + wd : wd; if (x.measureText(t).width > w && line) { out.push(line); line = wd; } else line = t; }); if (line) out.push(line); return out; }
  const capFor = j => (j.claimed ? j.name + " scored " + j.score + "/100 on Hyperliquid onchain and claimed a laser etched ENS x Hyperliquid India metal card. " : j.name + " scored " + j.score + "/100 on Hyperliquid onchain and is eligible for a laser etched ENS x Hyperliquid India metal card. ") + "Collecting it at House of HYPE, Mumbai, 3 Nov.";
  let vidTmp = null, blobMask = null, blobCv = null;
  function drawVideo(x, t, vo, j) {
    const bgp = Math.min(1, t / .8), ease = p => 1 - Math.pow(1 - p, 3);
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
    x.fillStyle = "#060606"; x.fillRect(0, 0, VW, VH);
    // brands
    x.globalAlpha = ease(bgp);
    if (logoImgs.hl && logoImgs.ens) { const h = 34, wl = h * 1145 / 156, ve = logoImgs.ens, we = h * (ve.width / ve.height || 1), gap = 26, tot = wl + gap * 2 + 14 + we, sx = (VW - tot) / 2; x.drawImage(logoImgs.hl, sx, 70, wl, h); x.fillStyle = "#8C8C8C"; x.font = '500 24px "Instrument Sans", sans-serif'; x.textBaseline = "middle"; x.fillText("x", sx + wl + gap, 70 + h / 2 + 1); x.drawImage(ve, sx + wl + gap * 2 + 14, 70, we, h); }
    x.globalAlpha = 1;
    // card
    const ca = ease(Math.min(1, Math.max(0, (t - .5) / .7))), cw = 940, chh = cw * TEX_H / TEX_W, sc = .94 + .06 * ca, cx = VW / 2, cy = 640 + Math.sin(t * 1.1) * 7, tilt = Math.sin(t * .8) * .012;
    const rev = Math.min(1, Math.max(0, (t - .5) / .9));
    const p = Math.min(1, Math.max(0, (t - ENG0) / (ENG1 - ENG0)));
    comp(p, vo, p > 0 && p < 1, Math.floor(t * 30));
    // the card turns to the back at the same moment as on the page, and turns home again after the lock
    const tTurn = ENG0 + TL.turn * (ENG1 - ENG0), tHome = ENG1 + .5, sm = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
    const ang = Math.PI * (sm((t - tTurn) / .65) + sm((t - tHome) / .65)), cs = Math.cos(ang), face = cs >= 0 ? vo.front : vo.back, sx = Math.max(.02, Math.abs(cs));
    x.save(); x.globalAlpha = ca; x.translate(cx, cy); x.rotate(tilt);
    x.save(); x.scale(sc, sc); x.filter = "blur(26px)"; x.fillStyle = "rgba(0,0,0,.75)"; x.beginPath(); x.ellipse(0, chh / 2 + 36, cw * .42 * sx, 28, 0, 0, 7); x.fill(); x.restore();
    x.scale(sc * sx, sc);
    x.beginPath(); x.roundRect(-cw / 2, -chh / 2, cw, chh, R * K * cw / TEX_W); x.clip();
    x.filter = "none";
    const lockFlash = p >= LOCK ? Math.max(0, 1 - (t - (ENG0 + LOCK * (ENG1 - ENG0))) / 1.1) : 0;
    if (rev < 1 && window.__dither) {
      // 1-bit reveal: the card arrives through an ordered dither
      const tc = vidTmp || (vidTmp = document.createElement("canvas")); tc.width = Math.round(cw); tc.height = Math.round(chh); const tx = tc.getContext("2d"); tx.clearRect(0, 0, tc.width, tc.height); tx.drawImage(face.col, 0, 0, tc.width, tc.height);
      const im = tx.getImageData(0, 0, tc.width, tc.height), dd = im.data, bs = 4;
      for (let j = 0; j < tc.height; j++) for (let i = 0; i < tc.width; i++) if (__dither.bayer(i / bs | 0, j / bs | 0) >= rev) dd[(j * tc.width + i) * 4 + 3] = 0;
      tx.putImageData(im, 0, 0); x.drawImage(tc, -cw / 2, -chh / 2, cw, chh);
    } else x.drawImage(face.col, -cw / 2, -chh / 2, cw, chh);
    if (Math.abs(cs) < .999) { x.fillStyle = `rgba(0,0,0,${.55 * (1 - Math.abs(cs))})`; x.fillRect(-cw / 2, -chh / 2, cw, chh); }
    x.filter = "none";
    if (lockFlash > 0) { const fg = x.createRadialGradient(0, 0, 0, 0, 0, cw * .5); fg.addColorStop(0, `rgba(151,252,228,${.4 * lockFlash})`); fg.addColorStop(1, "rgba(151,252,228,0)"); x.fillStyle = fg; x.fillRect(-cw / 2, -chh / 2, cw, chh); }
    const sh = ((t * .22) % 1.6 - .3) * cw, sg = x.createLinearGradient(-cw / 2 + sh - 160, -chh / 2, -cw / 2 + sh + 160, chh / 2); sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(.5, "rgba(255,255,255,.10)"); sg.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = sg; x.fillRect(-cw / 2, -chh / 2, cw, chh);
    x.restore(); x.save(); x.globalAlpha = ca; x.translate(cx, cy); x.rotate(tilt); x.scale(sc * sx, sc); x.strokeStyle = "rgba(255,255,255,.22)"; x.lineWidth = 2; x.beginPath(); x.roundRect(-cw / 2, -chh / 2, cw, chh, R * K * cw / TEX_W); x.stroke();
    x.restore();
    x.globalAlpha = 1; x.textAlign = "center"; x.fillStyle = "#6f6f6f"; x.font = '400 22px "Instrument Sans", sans-serif'; x.fillText("House of HYPE  ·  Mumbai  ·  3 Nov 2026", VW / 2, 1312);
  }

  async function recordVideo(j, onProgress) {
    if (!window.MediaRecorder) throw new Error("unsupported");
    await loadLogos(); prepEngrave();
    const cvs = document.createElement("canvas"); cvs.width = VW; cvs.height = VH; const x = cvs.getContext("2d");
    const vo = { front: { col: cv(), rough: cv() }, back: { col: cv(), rough: cv() } };
    const c = ac(); const rd = c ? c.createMediaStreamDestination() : null;
    const stream = cvs.captureStream(30); if (rd) rd.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const mimes = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mime = mimes.find(m => MediaRecorder.isTypeSupported(m)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 7e6 } : {}); const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    drawVideo(x, 0, vo, j); rec.start(250); const ac0 = c ? c.currentTime : 0; if (c) laserSound(ENG1 - ENG0, rd, true, ENG0, eng.plan);
    const t0 = performance.now();
    await new Promise(res => { const step = now => { const t = c && c.state === "running" ? Math.max(0, c.currentTime - ac0) : (now - t0) / 1000; onProgress && onProgress(Math.min(1, t / VD), Math.max(0, VD - t)); drawVideo(x, Math.min(t, VD), vo, j); if (t < VD) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
    rec.stop(); await done;
    const type = (rec.mimeType || mime || "video/webm").split(";")[0], ext = type.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type });
    return { url: URL.createObjectURL(blob), ext, caption: capFor(j), file: "hyperliquid-india-ens-card-" + j.name.replace(/[^a-z0-9.-]/g, "") + "." + ext };
  }

  // ---------- 1-bit dither etched into the card ----------
  const BY = (() => { let m = [[0, 2], [3, 1]]; for (let n = 2; n < 8; n *= 2) { const q = n * 2, o = Array.from({ length: q }, () => Array(q).fill(0)); for (let y = 0; y < q; y++) for (let x = 0; x < q; x++) o[y][x] = 4 * m[y % n][x % n] + [[0, 2], [3, 1]][0 | y / n][0 | x / n]; m = o; } return m.flat().map(v => (v + .5) / 64); })();
  const bay = (x, y) => BY[((y & 7) << 3) | (x & 7)];
  const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const DCS = 3, dcache = {};
  function ditherArt(face, mode) {
    const key = face + mode; if (dcache[key]) return dcache[key];
    const c = document.createElement("canvas"); c.width = TEX_W; c.height = TEX_H; const g = c.getContext("2d");
    const cols = Math.ceil(TEX_W / DCS), rows = Math.ceil(TEX_H / DCS), S = 620, ox = 960, oy = 360;
    let mask = null;
    if (face === "back") { const m = document.createElement("canvas"); m.width = cols; m.height = rows; const mx = m.getContext("2d"); mx.translate(ox / DCS, oy / DCS); mx.scale(S / 200 / DCS, S / 200 / DCS); mx.fillStyle = "#fff"; mx.fill(new Path2D(SVG.blob.d)); mask = mx.getImageData(0, 0, cols, rows).data; }
    g.fillStyle = mode === "color" ? "rgba(216,216,214,.72)" : "#3A3A3A";
    const hit = (px, py, r) => px > r[0] && px < r[2] && py > r[1] && py < r[3];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const px = i * DCS + DCS / 2, py = j * DCS + DCS / 2; let v = 0;
      if (face === "back") {
        v = Math.pow(Math.max(0, 1 - Math.hypot((px - 1585) / 560, (py - 1000) / 300)), 1.6) * .5;
        if (hit(px, py, [1300, 840, 1585, 1000]) || py < 60) v = 0;
      } else {
        v = Math.pow(Math.max(0, 1 - Math.hypot(px / 760, py / 520)), 1.4) * .8 * sstep(600, 360, px);
        if (hit(px, py, [60, 430, 600, 650]) || hit(px, py, [60, 830, 540, 925])) v = 0;
      }
      if (face === "front") v = Math.max(v, py > 934 ? (py - 934) / 66 * .85 : 0, py < 52 ? (52 - py) / 52 * .5 : 0);
      if (v > bay(i, j)) g.fillRect(i * DCS, j * DCS, DCS, DCS);
    }
    return (dcache[key] = c);
  }
  function ditherLayer(x, mode, face) { x.save(); x.imageSmoothingEnabled = false; x.drawImage(ditherArt(face, mode), 0, 0); x.restore(); }

  // ---------- decode: boxes pinned to the card's elements, projected through the live camera ----------
  const REGIONS = __REGIONS__;
  const trk = { on: false, focus: null, side: "front", t0: 0, raf: 0, cv: null, fade: 1, hide: false };
  function trackDraw(now) {
    trk.raf = requestAnimationFrame(trackDraw);
    const stg = $("stage"), plate = stg.closest(".plate"), cvs = trk.cv; if (!three || !three.card || !plate) return;
    const pr = plate.getBoundingClientRect(), sr = stg.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2), cw = pr.width, ch = pr.height;
    if (cvs.width !== Math.round(cw * dpr) || cvs.height !== Math.round(ch * dpr)) { cvs.width = Math.round(cw * dpr); cvs.height = Math.round(ch * dpr); }
    const x = cvs.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, cw, ch);
    trk.fade += ((trk.hide ? 0 : 1) - trk.fade) * .14; if (trk.fade < .02) return;
    const c = Math.cos(three.card.rotation.y), side = c >= 0 ? "front" : "back";
    if (side !== trk.side) { trk.side = side; trk.t0 = now; }
    const vis = Math.pow(Math.abs(c), 3) * trk.fade; if (vis < .02) return;
    const narrow = cw < 1000, ox = sr.left - pr.left, oy = sr.top - pr.top, sgn = side === "front" ? 1 : -1, zf = .06 / 2 + .012 + .002;
    const proj = (px, py) => { const v = new THREE.Vector3(sgn * (px / TEX_W - .5) * W, (.5 - py / TEX_H) * H, sgn * zf).applyMatrix4(three.card.matrixWorld).project(three.camera); return [ox + (v.x * .5 + .5) * sr.width, oy + (-v.y * .5 + .5) * sr.height]; };
    x.font = '500 10px "JetBrains Mono", ui-monospace, monospace'; x.textBaseline = "middle"; x.textAlign = "left";
    REGIONS[side].forEach((g, i) => {
      const k = Math.min(1, Math.max(0, (now - trk.t0 - i * 110) / 420)), e = 1 - Math.pow(1 - k, 3); if (e <= 0) return;
      if (side === "front" && g.id === "name" && window.__nameBox) { const [bx, by, bw, bh] = window.__nameBox; g = Object.assign({}, g, { x: bx, y: by, w: bw, h: bh }); }
      const cs = [proj(g.x, g.y), proj(g.x + g.w, g.y), proj(g.x + g.w, g.y + g.h), proj(g.x, g.y + g.h)];
      let x0 = Math.min(...cs.map(q => q[0])), x1 = Math.max(...cs.map(q => q[0])), y0 = Math.min(...cs.map(q => q[1])), y1 = Math.max(...cs.map(q => q[1]));
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, gr = 1 + (1 - e) * .35; x0 = mx + (x0 - mx) * gr; x1 = mx + (x1 - mx) * gr; y0 = my + (y0 - my) * gr; y1 = my + (y1 - my) * gr;
      const isCard = g.id === "card", foc = trk.focus === g.id, dim = trk.focus && !foc ? .4 : 1, A = vis * e;
      x.strokeStyle = "#ECE7DF"; x.fillStyle = "#ECE7DF";
      if (isCard) {
        x.globalAlpha = A * dim; x.lineWidth = foc ? 2 : 1; const L = 26;
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]].forEach(([qx, qy, dx, dy]) => { x.beginPath(); x.moveTo(qx + dx * L, qy); x.lineTo(qx, qy); x.lineTo(qx, qy + dy * L); x.stroke(); });
      } else {
        x.globalAlpha = A * dim; if (foc) { x.globalAlpha = A * .14; x.fillRect(x0, y0, x1 - x0, y1 - y0); x.globalAlpha = A; }
        x.lineWidth = foc ? 2 : 1; x.strokeRect(Math.round(x0) + .5, Math.round(y0) + .5, Math.round(x1 - x0), Math.round(y1 - y0));
        [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(q => x.fillRect(Math.round(q[0]) - 2, Math.round(q[1]) - 2, 5, 5));
        const tw = 21, tx = Math.round(x0), ty = Math.round(y0) - 16 < 0 ? Math.round(y0) : Math.round(y0) - 16;
        x.globalAlpha = A * dim; x.fillRect(tx, ty, tw, 15); x.fillStyle = "#060606"; x.fillText(g.n, tx + 4, ty + 8); x.fillStyle = "#ECE7DF";
      }
      // leader line out to the callout
      const el = plate.querySelector('[data-co="' + g.id + '"]'); if (!el) return;
      const er = el.getBoundingClientRect(); if (!er.width) return;
      const right = g.side === "r", ey = er.top - pr.top, ex = er.left - pr.left; let a, b, tgt;
      if (!narrow) { a = [right ? ex - 4 : ex + er.width + 4, ey + 11]; b = [a[0] + (right ? -22 : 22), a[1]]; tgt = isCard ? (right ? [x1, y0] : [x0, y0]) : (right ? [x1, my] : [x0, my]); }
      else {
        // stacked layout: the leader leaves the callout's marker, runs out to the margin, climbs past the buttons and enters its box from the side
        const si = REGIONS[side].filter(q => q.side === g.side).indexOf(REGIONS[side].find(q => q.id === g.id)), lane = right ? cw - 4 - si * 5 : 4 + si * 5;
        const m = [right ? ex + er.width - 3 : ex + 3, ey + 12], ty = isCard ? y0 + (y1 - y0) * .22 : my, tx = isCard ? (right ? x1 : x0) : (right ? x1 : x0);
        const pts = [m, [lane, m[1]], [lane, ty], [tx, ty]], segs = pts.slice(1).map((q, k) => Math.hypot(q[0] - pts[k][0], q[1] - pts[k][1])), tot = segs.reduce((s, v) => s + v, 0);
        x.globalAlpha = A * (foc ? 1 : .5) * e; x.strokeStyle = foc ? "#97FCE4" : "#ECE7DF"; x.lineWidth = foc ? 1.5 : 1; x.setLineDash(foc ? [] : [2, 3]);
        let left = tot * e; x.beginPath(); x.moveTo(m[0], m[1]); for (let k = 0; k < segs.length && left > 0; k++) { const f = Math.min(1, left / (segs[k] || 1)); x.lineTo(pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f); left -= segs[k]; } x.stroke(); x.setLineDash([]);
        x.fillStyle = foc ? "#97FCE4" : "#ECE7DF"; x.fillRect(Math.round(m[0]) - 2, Math.round(m[1]) - 2, 4, 4); if (e >= 1) x.fillRect(Math.round(tx) - 2, Math.round(ty) - 2, 4, 4);
        return;
      }
      x.globalAlpha = A * (foc ? 1 : .55) * e; x.strokeStyle = foc ? "#97FCE4" : "#ECE7DF"; x.lineWidth = foc ? 1.5 : 1; x.setLineDash(foc ? [] : [2, 3]);
      const lx = a[0] + (b[0] - a[0]) * e, ly = a[1] + (b[1] - a[1]) * e, tx2 = b[0] + (tgt[0] - b[0]) * e, ty2 = b[1] + (tgt[1] - b[1]) * e;
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(lx, ly); x.lineTo(tx2, ty2); x.stroke(); x.setLineDash([]);
      x.fillStyle = foc ? "#97FCE4" : "#ECE7DF"; x.fillRect(Math.round(a[0]) - 2, Math.round(a[1]) - 2, 4, 4); x.fillRect(Math.round(tgt[0]) - 2, Math.round(tgt[1]) - 2, 4, 4);
    });
    x.globalAlpha = 1;
  }
  function trackSet(on) {
    trk.on = on; if (on) {
      if (!trk.cv) { trk.cv = document.createElement("canvas"); trk.cv.className = "track"; $("stage").closest(".plate").appendChild(trk.cv); }
      trk.cv.hidden = false; trk.t0 = performance.now(); cancelAnimationFrame(trk.raf); trk.raf = requestAnimationFrame(trackDraw);
    } else { cancelAnimationFrame(trk.raf); if (trk.cv) trk.cv.hidden = true; }
  }
  window.HL = {
    validHl, validEth, reduce, caption: capFor,
    setName(n) { named = validEth(n); currentName = named ? n : "yourname.eth"; paintAll(); },
    clearName() { if (!named) return; named = false; currentName = "yourname.eth"; paintAll(); },
    showSide, unlock: ac, setMuted(m) { muted = m; },
    engrave: engraveLive, record: recordVideo,
    track: { set: trackSet, hide(v) { trk.hide = !!v; if (!v) trk.t0 = performance.now(); }, focus(id) { trk.focus = id; } },
    dump: () => ({ front: faces.front.col.toDataURL(), back: faces.back.col.toDataURL() }),
    plan: () => eng && eng.plan,
  };