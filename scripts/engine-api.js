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
  function laserSound(dur, recDest, quiet, delay = 0.03) {
    const c = ac(); if (!c) return null;
    const bus = c.createGain(); bus.gain.value = 1;
    const live = c.createGain(); live.gain.value = muted ? 0 : 1; if (!quiet) { bus.connect(live); live.connect(c.destination); }
    if (recDest) bus.connect(recDest);
    const t0 = c.currentTime + delay, t1 = t0 + dur;
    const env = (g, peak, a, r) => { g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.setValueAtTime(peak, t1 - r); g.gain.linearRampToValueAtTime(0, t1); };
    // sizzle: band passed noise with a fast tremolo
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ns = c.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(3200, t0); bp.frequency.linearRampToValueAtTime(5200, t1); bp.Q.value = 0.9;
    const am = c.createGain(); am.gain.value = 0.5; const lfo = c.createOscillator(); lfo.frequency.value = 53; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
    const ng = c.createGain(); env(ng, 0.5, 0.08, 0.25); ns.connect(bp); bp.connect(am); am.connect(ng); ng.connect(bus);
    // hum and whine
    const saw = c.createOscillator(); saw.type = "sawtooth"; saw.frequency.setValueAtTime(110, t0); saw.frequency.linearRampToValueAtTime(150, t1);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; const sg = c.createGain(); env(sg, 0.09, 0.1, 0.25); saw.connect(lp); lp.connect(sg); sg.connect(bus);
    const wh = c.createOscillator(); wh.type = "sine"; wh.frequency.setValueAtTime(1300, t0); wh.frequency.exponentialRampToValueAtTime(2900, t1);
    const wg = c.createGain(); env(wg, 0.05, 0.1, 0.2); wh.connect(wg); wg.connect(bus);
    // finish: two soft bell tones
    [1319, 1976].forEach((f, i) => { const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0, t1); g.gain.linearRampToValueAtTime(i ? .1 : .16, t1 + .01); g.gain.exponentialRampToValueAtTime(.0008, t1 + 1.4); o.connect(g); g.connect(bus); o.start(t1); o.stop(t1 + 1.5); });
    [ns, lfo, saw, wh].forEach(o => { o.start(t0); o.stop(t1 + .05); });
    return t0;
  }

  // ---------- laser engraving: a galvo raster. Every etched pixel gets a time; the head is wherever time equals now. ----------
  let eng = null;
  const PXW = () => TEX_W * SCALE, PXH = () => TEX_H * SCALE, HS = innerWidth < 700 ? 3 : 2; // reveal maps run at half resolution
  function prepEngrave() {
    const Cn = CONCEPTS[S.concept], d = data(), db = Object.assign({}, d, { base: "", tld: "", blank: true });
    const mk = dd => { const o = { col: cv(), rough: cv() }; const g = c => { const x = c.getContext("2d"); x.setTransform(SCALE, 0, 0, SCALE, 0, 0); return x; }; Cn.front(g(o.col), "color", dd); Cn.front(g(o.rough), "rough", dd); return o; };
    const full = mk(d), blank = mk(db), w = PXW(), h = PXH(), mw = Math.ceil(w / HS), mh = Math.ceil(h / HS);
    const a = full.col.getContext("2d").getImageData(0, 0, w, h).data, b = blank.col.getContext("2d").getImageData(0, 0, w, h).data;
    // which pixels change, and which part of the card they belong to
    const diff = new Uint8Array(mw * mh); let n0 = 1e9, n1 = -1, bx0 = 1e9, bx1 = -1, by0 = 1e9, by1 = -1;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const i = ((y * HS) * w + x * HS) * 4; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 28) { diff[y * mw + x] = 1; const tx = x * HS / SCALE, ty = y * HS / SCALE; if (tx < 700 && ty > 440 && ty < 640) { if (x < n0) n0 = x; if (x > n1) n1 = x; } else if (tx > 600 && ty > 60 && ty < 940) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; } } }
    if (n1 < 0) { n0 = 0; n1 = mw * .35; } if (bx1 < 0) { bx0 = mw * .4; bx1 = mw; by0 = 0; by1 = mh; }
    // reveal order: the name is rastered left to right in fast rows (0 to .42), the mark sweeps round like a clock (.46 to .9), the rest last
    const T = new Float32Array(mw * mh), cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const k = y * mw + x; if (!diff[k]) { T[k] = 2; continue; } const tx = x * HS / SCALE, ty = y * HS / SCALE;
      if (tx < 700 && ty > 440 && ty < 640) T[k] = .42 * ((x - n0) / (n1 - n0 + 1)) + .012 * ((ty - 440) / 200);
      else if (tx > 600 && ty > 60 && ty < 940) { const ang = (Math.atan2(y - cy, x - cx) + Math.PI * 2.5) % (Math.PI * 2); T[k] = .46 + .44 * ang / (Math.PI * 2); }
      else T[k] = .92 + .08 * (tx / TEX_W); }
    const mask = document.createElement("canvas"); mask.width = mw; mask.height = mh; const hot = document.createElement("canvas"); hot.width = mw; hot.height = mh;
    const tmp = cv();
    eng = { full, blank, T, mw, mh, mask, hot, tmp, head: [n0 * HS, h / 2], smoke: [] };
  }
  // builds the etched mask and the heat layer for progress p, and finds where the head is
  function buildMaps(p) {
    const { T, mw, mh, mask, hot } = eng, mx = mask.getContext("2d"), hx = hot.getContext("2d");
    const mi = eng.mi || (eng.mi = mx.createImageData(mw, mh)), hi = eng.hi || (eng.hi = hx.createImageData(mw, mh)), md = mi.data, hd = hi.data; md.fill(0); hd.fill(0); let sx = 0, sy = 0, sn = 0;
    const HW = .035; // how long a spot stays hot after the beam passes
    for (let k = 0; k < T.length; k++) { const t = T[k]; if (t > p) continue; const q = k * 4; md[q + 3] = 255;
      const age = (p - t) / HW; if (age < 1) { const e = 1 - age, w = e * e; hd[q] = 255; hd[q + 1] = 200 + 55 * w; hd[q + 2] = 150 + 105 * w; hd[q + 3] = 255 * e; if (age < .12) { sx += k % mw; sy += (k / mw) | 0; sn++; } } }
    mx.putImageData(mi, 0, 0); hx.putImageData(hi, 0, 0);
    if (sn) eng.head = [sx / sn * HS, sy / sn * HS];
    return sn > 0;
  }
  function comp(p, o, withBeam, frame) {
    const { full, blank, mask, hot, tmp } = eng, w = PXW(), h = PXH(), s = SCALE, live = buildMaps(p);
    for (const k of ["col", "rough"]) {
      const t = o[k].getContext("2d"), tx = tmp.getContext("2d");
      tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalCompositeOperation = "source-over"; tx.clearRect(0, 0, w, h); tx.drawImage(full[k], 0, 0);
      tx.globalCompositeOperation = "destination-in"; tx.imageSmoothingEnabled = true; tx.drawImage(mask, 0, 0, w, h);
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, w, h); t.drawImage(blank[k], 0, 0); t.drawImage(tmp, 0, 0);
    }
    if (!withBeam || p <= 0 || p >= 1) return;
    const t = o.col.getContext("2d"), [hxp, hyp] = eng.head; t.save(); t.globalCompositeOperation = "lighter";
    // cooling metal: the trail glows white, then mint, then dies. Drawn twice, once sharp and once bloomed.
    t.globalAlpha = .9; t.drawImage(hot, 0, 0, w, h);
    t.globalAlpha = .7; t.filter = `blur(${6 * s}px)`; t.drawImage(hot, 0, 0, w, h); t.filter = "none";
    // chromatic fringe on the heat
    t.globalAlpha = .25; t.globalCompositeOperation = "lighter"; t.filter = "hue-rotate(-40deg)"; t.drawImage(hot, -2.5 * s, 0, w, h); t.filter = "hue-rotate(40deg)"; t.drawImage(hot, 2.5 * s, 0, w, h); t.filter = "none"; t.globalAlpha = 1;
    if (live) {
      // the beam comes down from the galvo head above the card, slightly off axis
      const g = t.createLinearGradient(hxp + 90 * s, -h * .3, hxp, hyp); g.addColorStop(0, "rgba(151,252,228,0)"); g.addColorStop(.7, "rgba(151,252,228,.25)"); g.addColorStop(1, "rgba(255,255,255,.95)");
      t.strokeStyle = g; t.lineWidth = 1.6 * s; t.beginPath(); t.moveTo(hxp + 90 * s, -h * .3); t.lineTo(hxp, hyp); t.stroke();
      t.lineWidth = 8 * s; t.globalAlpha = .18; t.stroke(); t.globalAlpha = 1;
      // white-hot spot and an anamorphic streak
      const r = 34 * s, rg = t.createRadialGradient(hxp, hyp, 0, hxp, hyp, r); rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(.3, "rgba(230,255,250,.75)"); rg.addColorStop(1, "rgba(151,252,228,0)"); t.fillStyle = rg; t.fillRect(hxp - r, hyp - r, r * 2, r * 2);
      const sw = 260 * s, sg = t.createLinearGradient(hxp - sw, 0, hxp + sw, 0); sg.addColorStop(0, "rgba(151,252,228,0)"); sg.addColorStop(.5, "rgba(190,255,245,.55)"); sg.addColorStop(1, "rgba(151,252,228,0)"); t.fillStyle = sg; t.fillRect(hxp - sw, hyp - 1.2 * s, sw * 2, 2.4 * s);
      // smoke: a few wisps rise from the spot and drift
      const sm = eng.smoke; if (frame % 2 === 0) sm.push({ x: hxp, y: hyp, a: .35, r: 6 * s, vx: (Math.random() - .3) * 1.2 * s, vy: -(1.5 + Math.random()) * s });
      t.globalCompositeOperation = "source-over";
      for (let i = sm.length - 1; i >= 0; i--) { const q = sm[i]; q.x += q.vx; q.y += q.vy; q.r += .9 * s; q.a -= .012; if (q.a <= 0) { sm.splice(i, 1); continue; } const gg = t.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r); gg.addColorStop(0, `rgba(200,200,200,${q.a})`); gg.addColorStop(1, "rgba(200,200,200,0)"); t.fillStyle = gg; t.fillRect(q.x - q.r, q.y - q.r, q.r * 2, q.r * 2); }
    }
    t.restore();
  }
  async function engraveLive(dur = 4200, withSound = true) {
    if (!three || reduce) { if (withSound && !reduce) laserSound(1.6); await sleep(reduce ? 0 : 1600); return; }
    prepEngrave();
    if (shown !== "front") { showSide("front"); await sleep(900); }
    comp(0, faces.front, false); three.tex.forEach(t => t.needsUpdate = true);
    const c0 = withSound ? ac() : null, lat = c0 ? (c0.outputLatency || c0.baseLatency || 0) : 0;
    const at0 = withSound ? laserSound(dur / 1000, null, false, 0.15) : null;
    await new Promise(res => {
      const t0 = performance.now() + 150; let f = 0;
      const step = now => {
        const p = at0 != null && c0 && c0.state === "running" ? Math.min(1, Math.max(0, (c0.currentTime - lat - at0) / (dur / 1000))) : Math.min(1, Math.max(0, (now - t0) / dur));
        comp(p, faces.front, true, f++); three.tex.forEach(t => t.needsUpdate = true);
        if (p < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    paintAll();
    const fl = $("flash"); fl.animate([{ opacity: .9 }, { opacity: 0 }], { duration: 1100, easing: "ease-out" });
  }

  // ---------- video export (4:5, made in the browser) ----------
  const VW = 1080, VH = 1350, VD = 9.5, ENG0 = 1.2, ENG1 = 5.4;
  const logoImgs = {};
  const svgImage = str => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str); });
  async function loadLogos() {
    if (logoImgs.hl !== undefined) return;
    const hl = document.querySelector(".brands svg.hli").outerHTML.replace('class="hli"', "").replace(/class="cls-1"/g, 'fill="#EDEDED"').replace(/class="cls-2"/g, 'fill="#78cdce"').replace("<svg ", '<svg width="1145" height="156" ');
    const e = SVG.ens, vb = e.vb.split(/[ ,]+/).map(Number);
    logoImgs.hl = await svgImage(hl); logoImgs.ens = await svgImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${e.vb}" width="${vb[2]}" height="${vb[3]}"><path fill="#EDEDED" d="${e.d}"/></svg>`);
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
    if (rev < 1 && window.__dither) {
      // 1-bit reveal: the card arrives through an ordered dither
      const tc = vidTmp || (vidTmp = document.createElement("canvas")); tc.width = Math.round(cw); tc.height = Math.round(chh); const tx = tc.getContext("2d"); tx.clearRect(0, 0, tc.width, tc.height); tx.drawImage(vo.col, 0, 0, tc.width, tc.height);
      const im = tx.getImageData(0, 0, tc.width, tc.height), dd = im.data, bs = 4;
      for (let j = 0; j < tc.height; j++) for (let i = 0; i < tc.width; i++) if (__dither.bayer(i / bs | 0, j / bs | 0) >= rev) dd[(j * tc.width + i) * 4 + 3] = 0;
      tx.putImageData(im, 0, 0); x.drawImage(tc, -cw / 2, -chh / 2, cw, chh);
    } else x.drawImage(vo.col, -cw / 2, -chh / 2, cw, chh);
    x.filter = "none";
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
    drawVideo(x, 0, vo, j); rec.start(250); const ac0 = c ? c.currentTime : 0; if (c) laserSound(ENG1 - ENG0, rd, true, ENG0);
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
      const el = plate.querySelector('[data-co="' + g.id + '"]'); if (!el || (narrow && !foc)) return;
      const er = el.getBoundingClientRect(); if (!er.width) return;
      const right = g.side === "r", ey = er.top - pr.top, ex = er.left - pr.left; let a, b, tgt;
      if (!narrow) { a = [right ? ex - 4 : ex + er.width + 4, ey + 11]; b = [a[0] + (right ? -22 : 22), a[1]]; tgt = isCard ? (right ? [x1, y0] : [x0, y0]) : (right ? [x1, my] : [x0, my]); }
      else { a = [ex + 10, ey - 4]; b = [a[0], a[1] - 14]; tgt = isCard ? [x0, y1] : [mx, y1]; }
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
    setName(n) { currentName = validEth(n) ? n : "yourname.eth"; paintAll(); },
    showSide, unlock: ac, setMuted(m) { muted = m; },
    engrave: engraveLive, record: recordVideo,
    track: { set: trackSet, hide(v) { trk.hide = !!v; if (!v) trk.t0 = performance.now(); }, focus(id) { trk.focus = id; } },
    dump: () => ({ front: faces.front.col.toDataURL(), back: faces.back.col.toDataURL() }),
  };
  window.dispatchEvent(new Event("hl-ready"));
