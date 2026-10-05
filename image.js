// Две версии скрина: полная (почти без потерь) и миниатюра для галереи. Хеш считается по исходному файлу.
function resize(bmp, max, q) {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((r) => c.toBlob(r, 'image/webp', q))
}
export async function processImage(file) {
  const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const hash = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const bmp = await createImageBitmap(file)
  let name = (file.name || '').replace(/\.[^.]+$/, '')
  if (/^image( \(\d+\))?$/i.test(name)) name = '' // у вставленных из буфера имени нет
  return {
    hash, name,
    full: await resize(bmp, 3200, 0.95),
    thumb: await resize(bmp, 1000, 0.85),
    preview: URL.createObjectURL(file),
  }
}
