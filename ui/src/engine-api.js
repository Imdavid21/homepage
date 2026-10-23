  // ---------- API used by the React UI ----------
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const bytes = n => new TextEncoder().encode(n).length;
  const validHl = n => /^[a-z0-9 -\uffff]+\.hl$/u.test(n) && bytes(n) >= 4 && bytes(n) <= 32;
  const validEth = n => /^([a-z0-9 -\uffff]+\.)+eth$/u.test(n);
  // ---------- sound (synthesised, no files) ----------
  const AC = window.AudioContext || window.webkitAudioContext;
  let actx = null, muted = false;
  function ac() { if (!AC) return null; if (!actx) actx = new AC(); if (actx.state === "suspended") actx.resume(); return actx; }
  // ---------- the engraving plan ----------
  // One schedule drives everything: which pixel is etched when, where the beam is, and every sound. Times are 0..1 of the run.
  // The laser rasters the name in bidirectional passes, travels across, rasters the number, then the card locks at LOCK.
  const LOCK = .93, WARM = .05;
  function makePlan(jobs) {
    // jobs: [{ x0, x1, y0, y1, passes, t0, t1 }] in texture pixels; returns passes with start, end, direction and row
    const out = [];
    jobs.forEach(j => {
      const n = j.passes, pd = (j.t1 - j.t0) / n, on = pd * .84, hh = (j.y1 - j.y0) / n;
      for (let i = 0; i < n; i++) out.push({ t0: j.t0 + i * pd, t1: j.t0 + i * pd + on, x0: j.x0, x1: j.x1, y0: j.y0 + i * hh, y1: j.y0 + (i + 1) * hh, dir: i % 2 ? -1 : 1, job: j.id });
    });
    return out;
  }
  // without the 3D engine (or with reduced motion) the sound still needs a rhythm to follow
  const FALLBACK_PLAN = makePlan([{ id: "name", x0: 100, x1: 560, y0: 850, y1: 922, passes: 12, t0: WARM, t1: .74 }, { id: "no", x0: 1320, x1: 1485, y0: 872, y1: 920, passes: 6, t0: .79, t1: .9 }]);
  function headAt(plan, p) {
    // beam position at progress p, or null while the beam is blanked (between passes, before and after)
    for (const s of plan) if (p >= s.t0 && p <= s.t1) { const u = (p - s.t0) / (s.t1 - s.t0), a = s.dir > 0 ? s.x0 : s.x1, b = s.dir > 0 ? s.x1 : s.x0; return [a + (b - a) * u, (s.y0 + s.y1) / 2, s]; }
    return null;
  }

  // ---------- sound (synthesised, no files), scheduled from the same plan ----------
  function laserSound(dur, recDest, quiet, delay = 0.03, plan = FALLBACK_PLAN) {
    const c = ac(); if (!c) return null;
    const bus = c.createGain(); bus.gain.value = 1;
    const live = c.createGain(); live.gain.value = muted ? 0 : 1; if (!quiet) { bus.connect(live); live.connect(c.destination); }
    if (recDest) bus.connect(recDest);
    const t0 = c.currentTime + delay, at = p => t0 + p * dur, tl = at(LOCK), tEnd = tl + 1.4;
    const first = plan.length ? plan[0].t0 : WARM, last = plan.length ? plan[plan.length - 1].t1 : .9;
    // the source: a low hum that powers up before the first pass and drops away at lock
    const hum = c.createOscillator(); hum.type = "sawtooth"; hum.frequency.setValueAtTime(70, t0); hum.frequency.exponentialRampToValueAtTime(96, at(first));
    const hlp = c.createBiquadFilter(); hlp.type = "lowpass"; hlp.frequency.value = 420; const hg = c.createGain();
    hg.gain.setValueAtTime(0, t0); hg.gain.linearRampToValueAtTime(.07, at(first)); hg.gain.setValueAtTime(.07, at(last)); hg.gain.linearRampToValueAtTime(0, tl);
    hum.connect(hlp); hlp.connect(hg); hg.connect(bus);
    // the burn: band passed noise that is only open while the beam is firing. Its pitch glides with the head, up going right, down going left.
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ns = c.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 3.2; bp.frequency.setValueAtTime(2800, t0);
    const fizz = c.createBiquadFilter(); fizz.type = "highpass"; fizz.frequency.value = 7200;
    const bg = c.createGain(), fg = c.createGain(); bg.gain.setValueAtTime(0, t0); fg.gain.setValueAtTime(0, t0);
    ns.connect(bp); bp.connect(bg); bg.connect(bus); ns.connect(fizz); fizz.connect(fg); fg.connect(bus);
    // the galvo: a short tick each time the mirror steps to a new row
    const tick = c.createOscillator(); tick.type = "square"; tick.frequency.value = 2300; const tg = c.createGain(); tg.gain.setValueAtTime(0, t0); tick.connect(tg); tg.connect(bus);
    // a faint whine that follows the head's speed
    const wh = c.createOscillator(); wh.type = "sine"; wh.frequency.setValueAtTime(2900, t0); const wg = c.createGain(); wg.gain.setValueAtTime(0, t0); wh.connect(wg); wg.connect(bus);
    plan.forEach(s => {
      const a = at(s.t0), b = at(s.t1), lo = s.job === "no" ? 3300 : 2500, hi = s.job === "no" ? 4300 : 3600, f0 = s.dir > 0 ? lo : hi, f1 = s.dir > 0 ? hi : lo;
      bp.frequency.setValueAtTime(f0, a); bp.frequency.linearRampToValueAtTime(f1, b);
      bg.gain.setValueAtTime(0, a); bg.gain.linearRampToValueAtTime(.3, a + .006); bg.gain.setValueAtTime(.3, Math.max(a + .007, b - .012)); bg.gain.linearRampToValueAtTime(0, b);
      fg.gain.setValueAtTime(0, a); fg.gain.linearRampToValueAtTime(.05, a + .006); fg.gain.setValueAtTime(.05, Math.max(a + .007, b - .012)); fg.gain.linearRampToValueAtTime(0, b);
      tg.gain.setValueAtTime(0, a - .004); tg.gain.linearRampToValueAtTime(.035, a - .002); tg.gain.linearRampToValueAtTime(0, a + .006);
      wh.frequency.setValueAtTime(f0 + 300, a); wh.frequency.linearRampToValueAtTime(f1 + 300, b);
      wg.gain.setValueAtTime(0, a); wg.gain.linearRampToValueAtTime(.012, a + .01); wg.gain.setValueAtTime(.012, Math.max(a + .011, b - .01)); wg.gain.linearRampToValueAtTime(0, b);
    });
    // lock: a thump and a soft chord, at the same instant the card flashes
    const th = c.createOscillator(); th.type = "sine"; th.frequency.setValueAtTime(150, tl); th.frequency.exponentialRampToValueAtTime(42, tl + .25);
    const thg = c.createGain(); thg.gain.setValueAtTime(0, t0); thg.gain.setValueAtTime(.32, tl); thg.gain.exponentialRampToValueAtTime(.001, tl + .32); th.connect(thg); thg.connect(bus);
    [880, 1109, 1319, 1760].forEach((f, i) => { const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0, t0); g.gain.setValueAtTime(0, tl); g.gain.linearRampToValueAtTime(.07 - i * .012, tl + .015); g.gain.exponentialRampToValueAtTime(.0008, tEnd); o.connect(g); g.connect(bus); o.start(tl); o.stop(tEnd + .05); });
    [hum, ns, tick, wh].forEach(o => { o.start(t0); o.stop(tl + .05); }); th.start(tl); th.stop(tl + .4);
    return t0;
  }

  // ---------- laser engraving on the card texture ----------
  let eng = null;
  const PXW = () => TEX_W * SCALE, PXH = () => TEX_H * SCALE, HS = innerWidth < 700 ? 3 : 2; // reveal maps run at half or a third of the texture
  function prepEngrave() {
    const Cn = CONCEPTS[S.concept], d = data(), db = Object.assign({}, d, { base: "", tld: "", blank: true });
    const mk = dd => { const o = { col: cv(), rough: cv() }; const g = c => { const x = c.getContext("2d"); x.setTransform(SCALE, 0, 0, SCALE, 0, 0); return x; }; Cn.front(g(o.col), "color", dd); Cn.front(g(o.rough), "rough", dd); return o; };
    const full = mk(d), blank = mk(db), w = PXW(), h = PXH(), mw = Math.ceil(w / HS), mh = Math.ceil(h / HS), k2t = HS / SCALE;
    const a = full.col.getContext("2d").getImageData(0, 0, w, h).data, b = blank.col.getContext("2d").getImageData(0, 0, w, h).data;
    // what the laser has to write: every pixel that differs between the blank card and this holder's card, split into the name and the number
    const jobs = { name: { id: "name", x0: 1e9, x1: -1, y0: 1e9, y1: -1 }, no: { id: "no", x0: 1e9, x1: -1, y0: 1e9, y1: -1 } }, idx = [], who = [];
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const i = ((y * HS) * w + x * HS) * 4; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) <= 28) continue;
      const tx = x * k2t, ty = y * k2t, j = tx > 1250 && ty > 820 ? jobs.no : jobs.name;
      if (tx < j.x0) j.x0 = tx; if (tx > j.x1) j.x1 = tx; if (ty < j.y0) j.y0 = ty; if (ty > j.y1) j.y1 = ty; idx.push(y * mw + x); who.push(j.id === "no" ? 1 : 0);
    }
    const list = [];
    if (jobs.name.x1 >= 0) list.push(Object.assign(jobs.name, { passes: Math.max(6, Math.min(16, Math.round((jobs.name.y1 - jobs.name.y0) / 5))), t0: WARM, t1: jobs.no.x1 >= 0 ? .74 : .9 }));
    if (jobs.no.x1 >= 0) list.push(Object.assign(jobs.no, { passes: Math.max(4, Math.min(8, Math.round((jobs.no.y1 - jobs.no.y0) / 7))), t0: jobs.name.x1 >= 0 ? .79 : WARM, t1: .9 }));
    list.forEach(j => { j.x1 += k2t; j.y1 += k2t; });
    const plan = list.length ? makePlan(list) : FALLBACK_PLAN;
    // every etched pixel gets the moment the beam crosses it
    const T = new Float32Array(idx.length);
    for (let n = 0; n < idx.length; n++) {
      const k = idx[n], tx = (k % mw) * k2t, ty = ((k / mw) | 0) * k2t, id = who[n] ? "no" : "name";
      let s = plan.find(q => q.job === id && ty >= q.y0 && ty < q.y1) || plan.filter(q => q.job === id).pop() || plan[0];
      const u = Math.min(1, Math.max(0, (tx - s.x0) / Math.max(1, s.x1 - s.x0)));
      T[n] = s.t0 + (s.dir > 0 ? u : 1 - u) * (s.t1 - s.t0);
    }
    const mask = document.createElement("canvas"); mask.width = mw; mask.height = mh; const hot = document.createElement("canvas"); hot.width = mw; hot.height = mh;
    eng = { full, blank, T, idx, mw, mh, mask, hot, tmp: cv(), plan };
  }
  // the etched mask and the cooling trail at progress p
  function buildMaps(p) {
    const { T, idx, mw, mh, mask, hot } = eng, mx = mask.getContext("2d"), hx = hot.getContext("2d");
    const mi = eng.mi || (eng.mi = mx.createImageData(mw, mh)), hi = eng.hi || (eng.hi = hx.createImageData(mw, mh)), md = mi.data, hd = hi.data; md.fill(0); hd.fill(0);
    const HW = .055; // how long a spot glows after the beam has passed, as a share of the run
    for (let n = 0; n < idx.length; n++) { const t = T[n]; if (t > p) continue; const q = idx[n] * 4; md[q + 3] = 255;
      const age = (p - t) / HW; if (age < 1) { const e = 1 - age, w = e * e; hd[q] = 140 + 115 * w; hd[q + 1] = 252; hd[q + 2] = 228 + 27 * w; hd[q + 3] = 255 * e; } }
    mx.putImageData(mi, 0, 0); hx.putImageData(hi, 0, 0);
  }
  function comp(p, o, withBeam, frame) {
    const { full, blank, mask, hot, tmp } = eng, w = PXW(), h = PXH(), s = SCALE; buildMaps(p);
    for (const k of ["col", "rough"]) {
      const t = o[k].getContext("2d"), tx = tmp.getContext("2d");
      tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalCompositeOperation = "source-over"; tx.clearRect(0, 0, w, h); tx.drawImage(full[k], 0, 0);
      tx.globalCompositeOperation = "destination-in"; tx.imageSmoothingEnabled = true; tx.drawImage(mask, 0, 0, w, h);
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, w, h); t.drawImage(blank[k], 0, 0); t.drawImage(tmp, 0, 0);
    }
    if (!withBeam || p <= 0 || p >= 1) return;
    const t = o.col.getContext("2d"); t.save(); t.globalCompositeOperation = "lighter";
    // cooling metal: white, then aquamarine, then gone. Once sharp, once bloomed, with a slight chromatic split.
    t.globalAlpha = .9; t.drawImage(hot, 0, 0, w, h);
    t.globalAlpha = .65; t.filter = `blur(${5 * s}px)`; t.drawImage(hot, 0, 0, w, h); t.filter = "none";
    t.globalAlpha = .22; t.filter = "hue-rotate(-40deg)"; t.drawImage(hot, -2 * s, 0, w, h); t.filter = "hue-rotate(40deg)"; t.drawImage(hot, 2 * s, 0, w, h); t.filter = "none"; t.globalAlpha = 1;
    const hd = headAt(eng.plan, p);
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
  }
  async function engraveLive(dur = 4200, withSound = true) {
    if (!three || reduce) { if (withSound && !reduce) laserSound(1.6); await sleep(reduce ? 0 : 1600); return; }
    prepEngrave();
    if (shown !== "front") { showSide("front"); await sleep(900); }
    comp(0, faces.front, false); three.tex.forEach(t => t.needsUpdate = true);
    // the picture follows the audio clock, so the beam, the burn and the lock land on the same frame
    const c0 = withSound ? ac() : null, lat = c0 ? (c0.outputLatency || c0.baseLatency || 0) : 0;
    const at0 = withSound ? laserSound(dur / 1000, null, false, 0.15, eng.plan) : null;
    let flashed = false;
    await new Promise(res => {
      const t0 = performance.now() + 150; let f = 0;
      const step = now => {
        const p = at0 != null && c0 && c0.state === "running" ? Math.min(1, Math.max(0, (c0.currentTime - lat - at0) / (dur / 1000))) : Math.min(1, Math.max(0, (now - t0) / dur));
        comp(p, faces.front, true, f++); three.tex.forEach(t => t.needsUpdate = true);
        if (!flashed && p >= LOCK) { flashed = true; const fl = $("flash"); fl && fl.animate([{ opacity: .95 }, { opacity: 0 }], { duration: 1100, easing: "ease-out" }); }
        if (p < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    paintAll();
  }

  // ---------- video export (4:5, made in the browser) ----------
  const VW = 1080, VH = 1350, VD = 9.5, ENG0 = 1.2, ENG1 = 5.4;
  const logoImgs = {};
  const svgImage = str => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str); });
  async function loadLogos() {
    if (logoImgs.hl !== undefined) return;
    const hl = document.querySelector(".brands svg.hli").outerHTML.replace('class="hli"', "").replace(/class="cls-1"/g, 'fill="#EDEDED"').replace(/class="cls-2"/g, 'fill="#78cdce"').replace("<svg ", '<svg width="1145" height="156" ');
    const es = document.querySelector(".brands svg.ens"), e = { vb: es.getAttribute("viewBox"), d: es.querySelector("path").getAttribute("d") }, vb = e.vb.split(/[ ,]+/).map(Number);
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
    const ca = ease(Math.min(1, Math.max(0, (t - .5) / .7))), cw = 940, chh = cw * TEX_H / TEX_W, sc = .94 + .06 * ca, cx = VW / 2, cy = 640 + Math.sin(t * 1.1) * 7, ang = Math.sin(t * .8) * .012;
    x.save(); x.globalAlpha = ca; x.translate(cx, cy); x.rotate(ang); x.scale(sc, sc);
    x.save(); x.filter = "blur(26px)"; x.fillStyle = "rgba(0,0,0,.75)"; x.beginPath(); x.ellipse(0, chh / 2 + 36, cw * .42, 28, 0, 0, 7); x.fill(); x.restore();
    x.beginPath(); x.roundRect(-cw / 2, -chh / 2, cw, chh, R * K * cw / TEX_W); x.clip();
    const rev = Math.min(1, Math.max(0, (t - .5) / .9));
    const p = Math.min(1, Math.max(0, (t - ENG0) / (ENG1 - ENG0)));
    comp(p, vo, p > 0 && p < 1, Math.floor(t * 30));
    x.filter = "none";
    const lockFlash = p >= LOCK ? Math.max(0, 1 - (t - (ENG0 + LOCK * (ENG1 - ENG0))) / 1.1) : 0;
    if (rev < 1 && window.__dither) {
      // 1-bit reveal: the card arrives through an ordered dither
      const tc = vidTmp || (vidTmp = document.createElement("canvas")); tc.width = Math.round(cw); tc.height = Math.round(chh); const tx = tc.getContext("2d"); tx.clearRect(0, 0, tc.width, tc.height); tx.drawImage(vo.col, 0, 0, tc.width, tc.height);
      const im = tx.getImageData(0, 0, tc.width, tc.height), dd = im.data, bs = 4;
      for (let j = 0; j < tc.height; j++) for (let i = 0; i < tc.width; i++) if (__dither.bayer(i / bs | 0, j / bs | 0) >= rev) dd[(j * tc.width + i) * 4 + 3] = 0;
      tx.putImageData(im, 0, 0); x.drawImage(tc, -cw / 2, -chh / 2, cw, chh);
    } else x.drawImage(vo.col, -cw / 2, -chh / 2, cw, chh);
    x.filter = "none";
    if (lockFlash > 0) { const fg = x.createRadialGradient(0, 0, 0, 0, 0, cw * .5); fg.addColorStop(0, `rgba(151,252,228,${.4 * lockFlash})`); fg.addColorStop(1, "rgba(151,252,228,0)"); x.fillStyle = fg; x.fillRect(-cw / 2, -chh / 2, cw, chh); }
    const sh = ((t * .22) % 1.6 - .3) * cw, sg = x.createLinearGradient(-cw / 2 + sh - 160, -chh / 2, -cw / 2 + sh + 160, chh / 2); sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(.5, "rgba(255,255,255,.10)"); sg.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = sg; x.fillRect(-cw / 2, -chh / 2, cw, chh);
    x.restore(); x.save(); x.globalAlpha = ca; x.translate(cx, cy); x.rotate(ang); x.scale(sc, sc); x.strokeStyle = "rgba(255,255,255,.22)"; x.lineWidth = 2; x.beginPath(); x.roundRect(-cw / 2, -chh / 2, cw, chh, R * K * cw / TEX_W); x.stroke();
    x.restore();
    x.globalAlpha = 1; x.textAlign = "center"; x.fillStyle = "#6f6f6f"; x.font = '400 22px "Instrument Sans", sans-serif'; x.fillText("House of HYPE  ·  Mumbai  ·  3 Nov 2026", VW / 2, 1312);
  }

  async function recordVideo(j, onProgress) {
    if (!window.MediaRecorder) throw new Error("unsupported");
    await loadLogos(); prepEngrave();
    const cvs = document.createElement("canvas"); cvs.width = VW; cvs.height = VH; const x = cvs.getContext("2d");
    const vo = { col: cv(), rough: cv() };
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
    setName(n) { currentName = validHl(n) || validEth(n) ? n : "yourname.hl"; paintAll(); },
    showSide, unlock: ac, setMuted(m) { muted = m; },
    engrave: engraveLive, record: recordVideo,
    track: { set: trackSet, hide(v) { trk.hide = !!v; if (!v) trk.t0 = performance.now(); }, focus(id) { trk.focus = id; } },
    dump: () => ({ front: faces.front.col.toDataURL(), back: faces.back.col.toDataURL() }),
    plan: () => eng && eng.plan,
  };
