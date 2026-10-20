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
  function laserSound(dur, recDest) {
    const c = ac(); if (!c) return;
    const bus = c.createGain(); bus.gain.value = 1;
    const live = c.createGain(); live.gain.value = muted ? 0 : 1; bus.connect(live); live.connect(c.destination);
    if (recDest) bus.connect(recDest);
    const t0 = c.currentTime + 0.03, t1 = t0 + dur;
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
  }

  // ---------- laser engraving on the card texture ----------
  let eng = null;
  const PXW = () => TEX_W * SCALE, PXH = () => TEX_H * SCALE;
  function prepEngrave() {
    const Cn = CONCEPTS[S.concept], d = data(), db = Object.assign({}, d, { base: "", tld: "" });
    const mk = dd => { const o = { col: cv(), rough: cv() }; const g = c => { const x = c.getContext("2d"); x.setTransform(SCALE, 0, 0, SCALE, 0, 0); return x; }; Cn.front(g(o.col), "color", dd); Cn.front(g(o.rough), "rough", dd); return o; };
    const full = mk(d), blank = mk(db), w = PXW(), h = PXH();
    const a = full.col.getContext("2d").getImageData(0, 0, w, h).data, b = blank.col.getContext("2d").getImageData(0, 0, w, h).data;
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const i = (y * w + x) * 4; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) { x0 = w * .1; x1 = w * .9; y0 = h * .4; y1 = h * .6; }
    eng = { full, blank, box: { x0: x0 - 14, x1: x1 + 14, y0, y1 } };
  }
  function beam(t, x, frame) {
    const { y0, y1 } = eng.box, cy = (y0 + y1) / 2, hh = (y1 - y0) / 2 + 70 * SCALE, s = SCALE;
    t.save(); t.globalCompositeOperation = "lighter";
    const g = t.createLinearGradient(x - 70 * s, 0, x + 70 * s, 0); g.addColorStop(0, "rgba(151,252,228,0)"); g.addColorStop(.5, "rgba(151,252,228,.55)"); g.addColorStop(1, "rgba(151,252,228,0)");
    t.fillStyle = g; t.fillRect(x - 70 * s, cy - hh, 140 * s, hh * 2);
    t.fillStyle = "rgba(255,255,255,.95)"; t.fillRect(x - 1.6 * s, cy - hh, 3.2 * s, hh * 2);
    const hy = cy + Math.sin(frame * .7) * (y1 - y0) * .42, r = 90 * s, rg = t.createRadialGradient(x, hy, 0, x, hy, r);
    rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(.18, "rgba(200,255,245,.85)"); rg.addColorStop(1, "rgba(151,252,228,0)"); t.fillStyle = rg; t.fillRect(x - r, hy - r, r * 2, r * 2);
    let sd = frame * 9301 + 49297; const rnd = () => (sd = (sd * 233280 + 1) % 2147483647) / 2147483647;
    t.lineCap = "round";
    for (let i = 0; i < 26; i++) { const ang = -Math.PI * .5 + (rnd() - .35) * 2.2, len = (14 + rnd() * 70) * s, sx = x + rnd() * 6 * s, sy = hy + (rnd() - .5) * 10 * s; t.strokeStyle = `rgba(${rnd() > .5 ? "255,236,190" : "190,255,245"},${.4 + rnd() * .6})`; t.lineWidth = (1 + rnd() * 1.8) * s; t.beginPath(); t.moveTo(sx, sy); t.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len * 1.0 - rnd() * 8 * s); t.stroke(); }
    t.restore();
  }
  function comp(p, o, withBeam, frame) {
    const { full, blank, box } = eng, w = PXW(), h = PXH(), x = box.x0 + (box.x1 - box.x0) * p;
    for (const k of ["col", "rough"]) {
      const t = o[k].getContext("2d"); t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = "source-over";
      t.clearRect(0, 0, w, h); t.drawImage(blank[k], 0, 0); t.save(); t.beginPath(); t.rect(0, 0, x, h); t.clip(); t.drawImage(full[k], 0, 0); t.restore();
    }
    if (withBeam && p > 0 && p < 1) beam(o.col.getContext("2d"), x, frame || 0);
  }
  async function engraveLive(dur = 3400, withSound = true) {
    if (!three || reduce) { if (withSound && !reduce) laserSound(1.6); await sleep(reduce ? 0 : 1600); return; }
    prepEngrave();
    if (shown !== "front") { showSide("front"); await sleep(900); }
    comp(0, faces.front, false); three.tex.forEach(t => t.needsUpdate = true);
    if (withSound) laserSound(dur / 1000);
    await new Promise(res => {
      const t0 = performance.now(); let f = 0;
      const step = now => {
        const p = Math.min(1, (now - t0) / dur), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        comp(p * .6 + e * .4, faces.front, true, f++); three.tex.forEach(t => t.needsUpdate = true);
        if (p < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    paintAll();
    const fl = $("flash"); fl.animate([{ opacity: .9 }, { opacity: 0 }], { duration: 1100, easing: "ease-out" });
  }

  // ---------- video export (4:5, made in the browser) ----------
  const VW = 1080, VH = 1350, VD = 9.5, ENG0 = 1.3, ENG1 = 4.6;
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
  function drawVideo(x, t, vo, j) {
    const bgp = Math.min(1, t / .8), ease = p => 1 - Math.pow(1 - p, 3);
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
    x.fillStyle = "#050505"; x.fillRect(0, 0, VW, VH);
    const g = x.createRadialGradient(VW / 2, 560, 0, VW / 2, 560, 760); g.addColorStop(0, `rgba(151,252,228,${.17 * bgp})`); g.addColorStop(1, "rgba(5,5,5,0)"); x.fillStyle = g; x.fillRect(0, 0, VW, VH);
    x.strokeStyle = "rgba(255,255,255,.035)"; x.lineWidth = 1; for (let i = 0; i < VW; i += 90) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, VH); x.stroke(); } for (let i = 0; i < VH; i += 90) { x.beginPath(); x.moveTo(0, i); x.lineTo(VW, i); x.stroke(); }
    // brands
    x.globalAlpha = ease(bgp);
    if (logoImgs.hl && logoImgs.ens) { const h = 34, wl = h * 1145 / 156, ve = logoImgs.ens, we = h * (ve.width / ve.height || 1), gap = 26, tot = wl + gap * 2 + 14 + we, sx = (VW - tot) / 2; x.drawImage(logoImgs.hl, sx, 70, wl, h); x.fillStyle = "#8C8C8C"; x.font = '500 24px "Instrument Sans", sans-serif'; x.textBaseline = "middle"; x.fillText("x", sx + wl + gap, 70 + h / 2 + 1); x.drawImage(ve, sx + wl + gap * 2 + 14, 70, we, h); }
    x.globalAlpha = 1;
    // card
    const ca = ease(Math.min(1, Math.max(0, (t - .5) / .7))), cw = 940, chh = cw * TEX_H / TEX_W, sc = .94 + .06 * ca, cx = VW / 2, cy = 560 + Math.sin(t * 1.1) * 7, ang = Math.sin(t * .8) * .012;
    x.save(); x.globalAlpha = ca; x.translate(cx, cy); x.rotate(ang); x.scale(sc, sc);
    x.save(); x.filter = "blur(26px)"; x.fillStyle = "rgba(0,0,0,.75)"; x.beginPath(); x.ellipse(0, chh / 2 + 36, cw * .42, 28, 0, 0, 7); x.fill(); x.restore();
    x.beginPath(); x.roundRect(-cw / 2, -chh / 2, cw, chh, R * K * cw / TEX_W); x.clip();
    const p = Math.min(1, Math.max(0, (t - ENG0) / (ENG1 - ENG0))), pe = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    comp(p * .6 + pe * .4, vo, p > 0 && p < 1, Math.floor(t * 30));
    x.filter = "brightness(1.9) contrast(1.12) saturate(1.1)"; x.drawImage(vo.col, -cw / 2, -chh / 2, cw, chh); x.filter = "none";
    const sh = ((t * .22) % 1.6 - .3) * cw, sg = x.createLinearGradient(-cw / 2 + sh - 160, -chh / 2, -cw / 2 + sh + 160, chh / 2); sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(.5, "rgba(255,255,255,.10)"); sg.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = sg; x.fillRect(-cw / 2, -chh / 2, cw, chh);
    x.restore(); x.save(); x.globalAlpha = ca; x.translate(cx, cy); x.rotate(ang); x.scale(sc, sc); x.strokeStyle = "rgba(255,255,255,.22)"; x.lineWidth = 2; x.beginPath(); x.roundRect(-cw / 2, -chh / 2, cw, chh, R * K * cw / TEX_W); x.stroke();
    x.restore();
    // result
    const ra = ease(Math.min(1, Math.max(0, (t - ENG1 - .2) / .6)));
    if (ra > 0) {
      x.save(); x.globalAlpha = ra; const rx = 190, ry = 1040, rr = 92, sv = j.score * ease(Math.min(1, Math.max(0, (t - ENG1 - .2) / 1.2)));
      x.lineWidth = 12; x.lineCap = "round"; x.strokeStyle = "#1a1a1a"; x.beginPath(); x.arc(rx, ry, rr, 0, 7); x.stroke();
      x.strokeStyle = "#97FCE4"; x.shadowColor = "rgba(151,252,228,.6)"; x.shadowBlur = 18; x.beginPath(); x.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sv / 100); x.stroke(); x.shadowBlur = 0;
      x.fillStyle = "#EDEDED"; x.textAlign = "center"; x.textBaseline = "alphabetic"; x.font = '500 76px "Instrument Sans", sans-serif'; x.fillText(String(Math.round(sv)), rx, ry + 20); x.fillStyle = "#8C8C8C"; x.font = '400 22px "Instrument Sans", sans-serif'; x.fillText("of 100", rx, ry + 52);
      x.textAlign = "left"; x.fillStyle = "#97FCE4"; x.font = '500 62px "Instrument Sans", sans-serif'; x.fillText(j.claimed ? "Claimed" : "Eligible", 340, 1030);
      x.fillStyle = "#EDEDED"; x.font = '500 38px "JetBrains Mono", monospace'; x.fillText(j.name, 340, 1084);
      x.restore();
    }
    const ta = ease(Math.min(1, Math.max(0, (t - ENG1 - 1.1) / .7)));
    if (ta > 0) {
      x.save(); x.globalAlpha = ta; x.textAlign = "left"; x.textBaseline = "alphabetic"; x.fillStyle = "#C9C9C9"; x.font = '400 31px "Instrument Sans", sans-serif';
      wrap(x, capFor(j), 900).forEach((l, i) => x.fillText(l, 90, 1180 + i * 42)); x.restore();
    }
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
    drawVideo(x, 0, vo, j); rec.start(250); if (c) setTimeout(() => laserSound(ENG1 - ENG0, rd), ENG0 * 1000);
    const t0 = performance.now();
    await new Promise(res => { const step = now => { const t = (now - t0) / 1000; onProgress && onProgress(Math.min(1, t / VD), Math.max(0, VD - t)); drawVideo(x, Math.min(t, VD), vo, j); if (t < VD) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
    rec.stop(); await done;
    const type = (rec.mimeType || mime || "video/webm").split(";")[0], ext = type.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type });
    return { url: URL.createObjectURL(blob), ext, caption: capFor(j), file: "hyperliquid-india-ens-card-" + j.name.replace(/[^a-z0-9.-]/g, "") + "." + ext };
  }
  window.HL = {
    validHl, validEth, reduce, caption: capFor,
    setName(n) { currentName = validHl(n) || validEth(n) ? n : "yourname.hl"; paintAll(); },
    showSide, unlock: ac, setMuted(m) { muted = m; },
    engrave: engraveLive, record: recordVideo,
  };
