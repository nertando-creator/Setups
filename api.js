// Весь доступ к данным в одном месте.
import { supabase } from './supabase'
const BUCKET = 'screenshots'
const DEFAULT_FACTORS = ['Дивергенция', 'Закол уровня', 'Трендовая линия', 'Ретест', 'Два касания', 'Наклонка']
const fail = (e) => { if (e) throw e }
const uid = async () => (await supabase.auth.getSession()).data.session.user.id

export async function listFactors() {
  let { data, error } = await supabase.from('factors').select('*').order('created_at')
  fail(error)
  if (!data.length) {
    const r = await supabase.from('factors').insert(DEFAULT_FACTORS.map((name) => ({ name }))).select()
    fail(r.error); data = r.data
  }
  return data
}
export async function addFactor(name) {
  const { data, error } = await supabase.from('factors').insert({ name }).select().single()
  fail(error); return data
}
export async function listShots() {
  const { data, error } = await supabase.from('shots').select('*, shot_factors(factor_id)').order('created_at', { ascending: false })
  fail(error); return data
}
export async function findDuplicate(hash) {
  const { data } = await supabase.from('shots').select('id,title,path_thumb').eq('file_hash', hash).limit(1)
  return data?.[0] || null
}
async function upload(path, blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' })
  fail(error)
}
export async function createShot({ title, comment, factorIds, img }) {
  const base = `${await uid()}/${crypto.randomUUID()}`
  const path_full = `${base}_full.webp`, path_thumb = `${base}_thumb.webp`
  await Promise.all([upload(path_full, img.full), upload(path_thumb, img.thumb)])
  const { data, error } = await supabase.from('shots').insert({ title, comment, path_full, path_thumb, file_hash: img.hash }).select().single()
  fail(error)
  if (factorIds.length) fail((await supabase.from('shot_factors').insert(factorIds.map((f) => ({ shot_id: data.id, factor_id: f })))).error)
  return { ...data, shot_factors: factorIds.map((f) => ({ factor_id: f })) }
}
export async function updateShot(id, patch) { fail((await supabase.from('shots').update(patch).eq('id', id)).error) }
export async function setShotFactor(shot_id, factor_id, on) {
  const q = supabase.from('shot_factors')
  const { error } = on ? await q.insert({ shot_id, factor_id }) : await q.delete().eq('shot_id', shot_id).eq('factor_id', factor_id)
  fail(error)
}
export async function deleteShot(s) {
  await supabase.storage.from(BUCKET).remove([s.path_full, s.path_thumb])
  fail((await supabase.from('shots').delete().eq('id', s.id)).error)
}

// Ссылки на картинки кешируются в браузере на 6 дней: повторные заходы без запросов и без повторной загрузки файлов.
const KEY = 'urlcache.v1'
const readCache = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
export async function signedUrls(paths) {
  const now = Date.now(), cache = readCache(), out = {}, miss = []
  for (const p of paths) { const c = cache[p]; if (c && c.exp > now) out[p] = c.url; else miss.push(p) }
  if (miss.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(miss, 7 * 24 * 3600)
    fail(error)
    for (const d of data) if (d.signedUrl) { out[d.path] = d.signedUrl; cache[d.path] = { url: d.signedUrl, exp: now + 6 * 24 * 3600 * 1000 } }
    for (const k of Object.keys(cache)) if (cache[k].exp <= now) delete cache[k]
    try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch {}
  }
  return out
}
