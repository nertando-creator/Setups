// Весь доступ к данным здесь. Хранилище можно сменить, не трогая интерфейс.
import { supabase } from './supabase'
const BUCKET = 'screenshots'
const DEFAULT_FACTORS = ['Дивергенция', 'Закол уровня', 'Трендовая линия', 'Ретест', 'Два касания', 'Наклонка']

export async function listFactors() {
  let { data, error } = await supabase.from('factors').select('*').order('created_at')
  if (error) throw error
  if (!data.length) {
    const r = await supabase.from('factors').insert(DEFAULT_FACTORS.map((name) => ({ name }))).select()
    if (r.error) throw r.error
    data = r.data
  }
  return data
}
export async function addFactor(name) {
  const { data, error } = await supabase.from('factors').insert({ name }).select().single()
  if (error) throw error
  return data
}
export async function listSetups() {
  const { data, error } = await supabase
    .from('setups')
    .select('*, setup_factors(factor_id), screenshots(id,path_thumb,sort_order), observations(result)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function signedUrls(paths) {
  if (!paths.length) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
  if (error) throw error
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
}
export async function findDuplicate(hash) {
  const { data } = await supabase
    .from('screenshots')
    .select('id,setup_id,observation_id,setups(name)')
    .eq('file_hash', hash)
    .limit(1)
  return data?.[0] || null
}
async function upload(path, blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp' })
  if (error) throw error
}
export async function createSetup({ name, comment, rating, factorIds, img }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: s, error } = await supabase.from('setups').insert({ name, comment, rating }).select().single()
  if (error) throw error
  if (factorIds.length) {
    const r = await supabase.from('setup_factors').insert(factorIds.map((f) => ({ setup_id: s.id, factor_id: f })))
    if (r.error) throw r.error
  }
  if (img) {
    const base = `${user.id}/${crypto.randomUUID()}`
    await upload(`${base}_full.webp`, img.full)
    await upload(`${base}_thumb.webp`, img.thumb)
    const r = await supabase.from('screenshots').insert({
      setup_id: s.id, label: 'Формация',
      path_full: `${base}_full.webp`, path_thumb: `${base}_thumb.webp`, file_hash: img.hash,
    })
    if (r.error) throw r.error
  }
  return s
}

// ---------- v1.2 ----------
async function saveShot(img, col, id, label) {
  const { data: { user } } = await supabase.auth.getUser()
  const base = `${user.id}/${crypto.randomUUID()}`
  await upload(`${base}_full.webp`, img.full)
  await upload(`${base}_thumb.webp`, img.thumb)
  const r = await supabase.from('screenshots').insert({
    [col]: id, label, path_full: `${base}_full.webp`, path_thumb: `${base}_thumb.webp`, file_hash: img.hash,
  })
  if (r.error) throw r.error
}
export async function getSetup(id) {
  const { data, error } = await supabase
    .from('setups')
    .select('*, setup_factors(factor_id), screenshots(id,path_full,path_thumb,label,sort_order), observations(*, screenshots(id,path_full,path_thumb,label,sort_order))')
    .eq('id', id).single()
  if (error) throw error
  return data
}
export async function updateSetup(id, patch) {
  const { error } = await supabase.from('setups').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
export async function toggleFactor(setup_id, factor_id, on) {
  const q = supabase.from('setup_factors')
  const { error } = on
    ? await q.insert({ setup_id, factor_id })
    : await q.delete().eq('setup_id', setup_id).eq('factor_id', factor_id)
  if (error) throw error
}
export async function addObservation(setup_id, o, img) {
  const { data, error } = await supabase.from('observations').insert({ setup_id, ...o }).select().single()
  if (error) throw error
  if (img) await saveShot(img, 'observation_id', data.id, 'Формация')
}
export async function deleteSetup(id) {
  const { data } = await supabase.from('screenshots').select('path_full,path_thumb').eq('setup_id', id)
  const { data: obs } = await supabase.from('observations').select('screenshots(path_full,path_thumb)').eq('setup_id', id)
  const paths = [...(data || []), ...(obs || []).flatMap((o) => o.screenshots)].flatMap((s) => [s.path_full, s.path_thumb])
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  await supabase.from('observations').delete().eq('setup_id', id)
  const { error } = await supabase.from('setups').delete().eq('id', id)
  if (error) throw error
}
