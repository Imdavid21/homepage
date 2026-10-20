// 1-bit ordered dithering. Every pixel is either fully on or fully off, using an 8x8 Bayer threshold map.
const B = (() => { let m = [[0, 2], [3, 1]]; for (let n = 2; n < 8; n *= 2) { const q = n * 2, o = Array.from({ length: q }, () => Array(q).fill(0)); for (let y = 0; y < q; y++) for (let x = 0; x < q; x++) o[y][x] = 4 * m[y % n][x % n] + [[0, 2], [3, 1]][0 | y / n][0 | x / n]; m = o; } return m.flat().map(v => (v + .5) / 64); })();
export const bayer = (x, y) => B[((y & 7) << 3) | (x & 7)];

// fn(x, y) returns 0..1 brightness. Pixels at or above the threshold are drawn in `color`.
export function paint(canvas, w, h, fn, color = [236, 231, 223]) {
  if (canvas.width !== w) canvas.width = w; if (canvas.height !== h) canvas.height = h;
  const x = canvas.getContext("2d"), im = x.createImageData(w, h), d = im.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if (fn(i, j) > bayer(i, j)) { const k = (j * w + i) * 4; d[k] = color[0]; d[k + 1] = color[1]; d[k + 2] = color[2]; d[k + 3] = 255; } }
  x.putImageData(im, 0, 0);
}

// Coverage mask of a 200x200 viewBox path (the Hyperliquid mark) at w x h.
export function pathMask(d, w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
  x.scale(w / 200, h / 200); x.fillStyle = "#fff"; x.fill(new Path2D(d));
  const a = x.getImageData(0, 0, w, h).data, m = new Float32Array(w * h); for (let i = 0; i < m.length; i++) m[i] = a[i * 4 + 3] / 255; return m;
}
// Lit from the upper left with a slow pulse. t is seconds.
export function paintBlob(canvas, w, h, mask, t, color, gain = 1) {
  paint(canvas, w, h, (i, j) => {
    const m = mask[j * w + i]; if (m < .5) return 0;
    const u = i / w, v = j / h, light = 1 - Math.hypot(u - .3, v - .25) * 1.25, wave = .08 * Math.sin(t * 1.3 + u * 6 + v * 4);
    return Math.max(0, Math.min(1, (light * .95 + wave + .12) * gain));
  }, color);
}
