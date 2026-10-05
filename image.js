// Три версии скрина: full (почти без потерь, для лайтбокса), view (для окна), thumb (для галереи).
// Уменьшение идёт ступенями (в 2 раза за шаг) и с лёгким повышением резкости: тонкие линии графика остаются чёткими.
function draw(src, w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const x = c.getContext('2d')
  x.imageSmoothingEnabled = true
  x.imageSmoothingQuality = 'high'
  x.drawImage(src, 0, 0, w, h)
  return c
}
function toCanvas(bmp, max) {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const tw = Math.max(1, Math.round(bmp.width * k)), th = Math.max(1, Math.round(bmp.height * k))
  let cur = bmp, w = bmp.width, h = bmp.height
  while (w / 2 >= tw) { w = Math.round(w / 2); h = Math.round(h / 2); cur = draw(cur, w, h) }
  return draw(cur, tw, th)
}
function sharpen(c, k) {
  const w = c.width, h = c.height, ctx = c.getContext('2d')
  const src = ctx.getImageData(0, 0, w, h), out = ctx.createImageData(w, h), s = src.data, d = out.data
  d.set(s)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4
      for (let ch = 0; ch < 3; ch++) {
        const j = i + ch
        const v = s[j] * (1 + 4 * k) - k * (s[j - 4] + s[j + 4] + s[j - w * 4] + s[j + w * 4])
        d[j] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
  }
  ctx.putImageData(out, 0, 0)
}
const blob = (c, q) => new Promise((r) => c.toBlob(r, 'image/webp', q))

export async function processImage(file) {
  const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const hash = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const bmp = await createImageBitmap(file)
  let name = (file.name || '').replace(/\.[^.]+$/, '')
  if (/^image( \(\d+\))?$/i.test(name)) name = '' // у вставленных из буфера имени нет
  const view = toCanvas(bmp, 1800); sharpen(view, 0.25)
  const thumb = toCanvas(bmp, 1000); sharpen(thumb, 0.4)
  const viewBlob = await blob(view, 0.9)
  return {
    hash, name,
    full: await blob(toCanvas(bmp, 3200), 0.95),
    view: viewBlob,
    thumb: await blob(thumb, 0.85),
    preview: URL.createObjectURL(viewBlob),
  }
}
