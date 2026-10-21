import re, os, json, subprocess
base = open('../site10/index.html').read()
HL_INDIA_X = ""   # add the Hyperliquid India X and Telegram URLs here and they lead the footer
HL_INDIA_TG = ""
X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
SUB_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/></svg>'
TG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.8 15.3l-.4 4.2c.6 0 .8-.3 1.1-.6l2.6-2.5 5.4 3.9c1 .5 1.7.3 1.9-.9L23.9 4c.3-1.5-.5-2.1-1.5-1.7L1.3 10.4c-1.4.5-1.4 1.3-.2 1.6l5.4 1.7L19 5.8c.6-.4 1.1-.2.7.2z"/></svg>'
socials = []
if HL_INDIA_X: socials.append({"label": "Hyperliquid India on X", "url": HL_INDIA_X, "icon": X_ICON})
if HL_INDIA_TG: socials.append({"label": "Telegram", "url": HL_INDIA_TG, "icon": TG_ICON})
socials += [{"label": "ENS on X", "url": "https://x.com/ensdomains", "icon": X_ICON}, {"label": "Hyperliquid on X", "url": "https://x.com/HyperliquidX", "icon": X_ICON}]

# brand data for the React bundle
svg = open('/root/.claude/uploads/841083e8-d418-5673-8989-520581d95cf2/724893ce-hl_india_logo_final.svg').read()
vb = re.search(r'viewBox="([^"]+)"', svg).group(1)
paths = [{"cls": c, "d": d} for c, d in re.findall(r'<path class="(cls-\d)" d="([^"]+)"', svg)]
SVGS, _ = json.JSONDecoder().raw_decode(base[base.index('const SVG = ') + len('const SVG = '):])
json.dump({"hli": {"vb": vb, "paths": paths}, "ens": SVGS["ens"], "blob": SVGS["blob"]["d"], "socials": socials}, open('ui/src/brand.json', 'w'))
subprocess.run(['node', 'build.mjs'], cwd='ui', check=True)
app = open('ui/dist/app.js').read().replace('</script', '<\\/script')

# card engine: the original painter and three.js scene, plus the API the UI calls
a = base.index('<script>', base.index('qrcode-generator'))
s = base.index('  // ---------- name input and Hyperliquid Names ----------'); e = base.index('  // ---------- boot ----------'); z = base.index('</script>', e)
eng_head = base[a + len('<script>'):s]
eng_head = re.sub(r'.*\$\("(hlLogo|ensLogo)"\).*\n', '', eng_head)
eng = eng_head + open('src/engine-api.js').read() + base[e:z]
eng = eng.replace('Math.sin(t * 0.6) * 0.32', 'Math.sin(t * 0.6) * 0.14').replace('Math.sin(t * 0.45) * 0.05', 'Math.sin(t * 0.45) * 0.02')
eng = eng.replace('return { tex };', 'return { tex, camera, card };').replace('function setPressed(s) { shown = s;', 'function setPressed(s) { shown = s; window.dispatchEvent(new CustomEvent("hl-side", { detail: s }));')
eng = eng.replace('front(x, mode, d) {\n        base(x, mode, false);', "front(x, mode, d) {\n        base(x, mode, false); " + ("" if os.environ.get('CLASSIC') else "ditherLayer(x, mode, 'front');") + "").replace('back(x, mode, d) {\n        base(x, mode, false);', "back(x, mode, d) {\n        base(x, mode, false); " + ("" if os.environ.get('CLASSIC') else "ditherLayer(x, mode, 'back');"))
import re as _re
_bk = open('src/back.js').read()
_fr = open('src/front.js').read()
if not os.environ.get('CLASSIC'):
  eng = _re.sub(r'      front\(x, mode, d\) \{\n        base\(x, mode, false\);.*?\n      \},\n(?=      back\()', lambda m: _fr, eng, count=1, flags=_re.S)
  assert 'the number out of 25' in eng
  eng = _re.sub(r'      back\(x, mode, d\) \{\n        base\(x, mode, false\);.*?\n      \},\n(?=      notes:)', lambda m: _bk, eng, count=1, flags=_re.S)
  assert 'KEY TO THE FRONT' in eng

# b/w brand assets: the supplied illustration (dithered 1-bit PNG) and the Hyperliquid India wordmark paths
_ill = open('assets/ill_bw.b64').read()
_hli = json.load(open('ui/src/brand.json'))['hli']
eng = 'window.__ILL__ = "data:image/png;base64,' + _ill + '";\n' + eng
eng = eng.replace('const [hl, blob, ens, ensmark] = await Promise.all([', 'const ill = await loadImg(window.__ILL__); const [hl, blob, ens, ensmark] = await Promise.all([').replace('IMG = { hl, blob, ens, ensmark };', 'IMG = { hl, blob, ens, ensmark, ill };')
_l2 = """const HLI = %s;
  function lockup2(x, c, X, Y, h) {
    const s = h / 156.45; x.save(); x.translate(X, Y); x.scale(s, s); x.fillStyle = c; HLI.paths.forEach(p => x.fill(new Path2D(p.d))); x.restore();
    const w = 1145.15 * s, xx = X + w + h * .55, cy = Y + h * .5, k = h * .14;
    x.lineWidth = Math.max(2, h * .07); x.strokeStyle = c; x.lineCap = "round"; x.beginPath(); x.moveTo(xx - k, cy - k); x.lineTo(xx + k, cy + k); x.moveTo(xx + k, cy - k); x.lineTo(xx - k, cy + k); x.stroke();
    return drawLogo(x, IMG.ens, c, xx + k + h * .45, Y - h * .02, h * .95) + xx + k + h * .45 - X;
  }
  function lockup(x, c, X, Y, h) {""" % json.dumps(_hli)
eng = eng.replace('function lockup(x, c, X, Y, h) {', _l2, 1)


if os.environ.get('CLASSIC'):
    _n = eng
    eng = eng.replace('nameSize(x, d, 900, 124, 44, v => SANS(500, v), SERIF)', 'nameSize(x, d, 580, 112, 36, v => SANS(500, v), SERIF)', 1)
    eng = eng.replace('const keep = [[1330, 40, 1540, 200], [M - 12', 'const keep = [[M - 12', 1)
    eng = eng.replace('          x.fillStyle = c; x.font = MONO(500, 50); x.textAlign = "left"; spaced(x, ")))", 1356, 136, -8);\n', '', 1)
    eng = eng.replace('          lockup(x, c, M, 854, 34);\n          x.fillStyle = c; x.font = MONO(400, 26); spaced(x, `${d.no}/${d.edition}`, RGT, 890, 3, "right");', '          lockup(x, c, M, 854, 34);\n          x.fillStyle = ink(mode, DIM); x.font = MONO(400, 26); x.textAlign = "left"; spaced(x, `${d.no}/${d.edition}`, M, 590 + Math.round(ns * .3) + 60, 3);', 1)
    _i = eng.index('front(x, mode, d) {'); _j = eng.index('back(x, mode, d) {', _i)
    _f = eng[_i:_j]
    _f = _f.replace('x.font = SANS(500, ns); let nw', 'const NY = 509; x.font = SANS(500, ns); let nw', 1)
    _f = _f.replace('590', 'NY').replace('lockup(x, c, M, 854, 34)', 'lockup(x, c, M, 866, 34)')
    _num = 'x.fillStyle = ink(mode, DIM); x.font = MONO(400, 26); x.textAlign = "left"; spaced(x, `${d.no}/${d.edition}`, M, NY + Math.round(ns * .3) + 60, 3);'
    assert _num in _f
    _f = _f.replace(_num, 'dotText(x, `${d.no}/${d.edition}`, M, NY + Math.round(ns * .3) + 92, 76, c, 6);')
    _dot = """
  function dotText(x, text, X, Y, size, color, pitch) {
    const oc = document.createElement("canvas"), o = oc.getContext("2d"); o.font = MONO(700, size);
    const w = Math.ceil(o.measureText(text).width) + 8, h = Math.ceil(size * 1.1); oc.width = w; oc.height = h;
    o.font = MONO(700, size); o.fillStyle = "#fff"; o.textBaseline = "alphabetic"; o.fillText(text, 2, h * .86);
    const px = o.getImageData(0, 0, w, h).data; x.save(); x.fillStyle = color;
    for (let yy = 0; yy < h; yy += pitch) for (let xx = 0; xx < w; xx += pitch) {
      let a = 0; for (let j = 0; j < pitch; j += 2) for (let i = 0; i < pitch; i += 2) a += px[((yy + j) * w + xx + i) * 4 + 3];
      if (a / 9 > 120) { x.beginPath(); x.arc(X + xx + pitch / 2 - 2, Y - h * .86 + yy + pitch / 2, pitch * .34, 0, 6.2832); x.fill(); }
    }
    x.restore();
  }
"""
    eng = eng[:_i] + _f + eng[_j:]
    eng = eng.replace('function lockup(x, c, X, Y, h) {', _dot + 'function lockup(x, c, X, Y, h) {', 1)
    eng = eng.replace('const bs = 1320 / 200, path = new Path2D(); path.addPath(new Path2D(SVG.blob.d), new DOMMatrix().translate(600, -160).scale(bs, bs));', 'const bs = 4.96, path = new Path2D(); path.addPath(new Path2D(SVG.blob.d), new DOMMatrix().translate(616.6, 4.2).scale(bs, bs));', 1)
    assert eng != _n and ')))' not in eng.split('back(x, mode, d)')[0].split('marks(x, mode')[-1]

eng = eng.replace('__REGIONS__', open('ui/src/regions_classic.json' if os.environ.get('CLASSIC') else 'ui/src/regions.json').read())
eng = eng.replace('H * 1.5 / 2', 'H * 1.22 / 2').replace('</script', '<\\/script')

css = open('src/app.css').read()
html = ('<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Hyperliquid India x ENS Card</title>\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap">\n'
        '<style>' + css + '</style>\n<div id="root"></div>\n'
        '<script src="three.min.js"></script>\n<script src="sha3.min.js"></script>\n<script src="qrcode.js"></script>\n'
        '<script>' + app + '</script>\n<script>' + eng + '</script>\n')
os.makedirs('public', exist_ok=True); open('public/index.html', 'w').write(html)

# local-font test copy
loc = open('../s25/local.html').read()
ff = ''.join(l.replace('../fonts/', 'fonts/') + '\n' for l in loc.split('\n') if l.startswith('@font-face'))
ff += '@font-face{font-family:"Instrument Serif";font-style:normal;font-weight:400;src:url("fonts/node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2") format("woff2")}\n'
t = re.sub(r'<link rel="preconnect"[^>]*>\s*', '', html); t = re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis[^>]*>', '<style>' + ff + '</style>', t)
os.makedirs('local', exist_ok=True); open('local/index.html', 'w').write(t)
print(len(html))
