// Весь доступ к данным здесь.
import { supabase } from './supabase'
const BUCKET = 'screenshots'
const DEFAULT_FACTORS = ['Дивергенция', 'Закол уровня', 'Трендовая линия', 'Ретест', 'Два касания', 'Наклонка']
const fail = (e) => { if (e) throw e }

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
export async function listSetups() {
  const { data, error } = await supabase.from('setups').select('id,name,folder_id,created_at').order('created_at', { ascending: false })
  fail(error); return data
}
export async function listFolders() {
  const { data, error } = await supabase.from('folders').select('*').order('created_at')
  fail(error); return data
}
export async function createFolder(name) { fail((await supabase.from('folders').insert({ name })).error) }
export async function renameFolder(id, name) { fail((await supabase.from('folders').update({ name }).eq('id', id)).error) }
export async function deleteFolder(id) { fail((await supabase.from('folders').delete().eq('id', id)).error) }
export async function createSetupNamed(name, folder_id) {
  const { data, error } = await supabase.from('setups').insert({ name, folder_id }).select().single()
  fail(error); return data
}
export async function addSetupShot(id, img) { await saveShot(img, 'setup_id', id, 'Формация', 0) }

export async function signedUrls(paths) {
  if (!paths.length) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
  fail(error)
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
}
export async function findDuplicate(hash) {
  const { data } = await supabase.from('screenshots').select('id,setup_id,observation_id,setups(name)').eq('file_hash', hash).limit(1)
  return data?.[0] || null
}
async function upload(path, blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp' })
  fail(error)
}
async function saveShot(img, col, id, label, sort_order) {
  const { data: { user } } = await supabase.auth.getUser()
  const base = `${user.id}/${crypto.randomUUID()}`
  await upload(`${base}_full.webp`, img.full)
  await upload(`${base}_thumb.webp`, img.thumb)
  const r = await supabase.from('screenshots').insert({
    [col]: id, label, sort_order, path_full: `${base}_full.webp`, path_thumb: `${base}_thumb.webp`, file_hash: img.hash,
  })
  fail(r.error)
}
export async function createSetup({ comment, factorIds, img }) {
  const { data: s, error } = await supabase.from('setups').insert({ name: '', comment }).select().single()
  fail(error)
  if (factorIds.length) fail((await supabase.from('setup_factors').insert(factorIds.map((f) => ({ setup_id: s.id, factor_id: f })))).error)
  if (img) await saveShot(img, 'setup_id', s.id, 'Формация', 0)
  return s
}
export async function getSetup(id) {
  const { data, error } = await supabase
    .from('setups')
    .select('*, setup_factors(factor_id), screenshots(id,path_full,path_thumb,label,sort_order), observations(*, screenshots(id,path_full,path_thumb,label,sort_order))')
    .eq('id', id).single()
  fail(error); return data
}
export async function updateSetup(id, patch) {
  fail((await supabase.from('setups').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)).error)
}
export async function toggleFactor(setup_id, factor_id, on) {
  const q = supabase.from('setup_factors')
  const { error } = on ? await q.insert({ setup_id, factor_id }) : await q.delete().eq('setup_id', setup_id).eq('factor_id', factor_id)
  fail(error)
}
const LABELS = ['Основной', 'Доп. 1', 'Доп. 2']
export async function addObservation(setup_id, o, imgs) {
  const { data, error } = await supabase.from('observations').insert({ setup_id, ...o }).select().single()
  fail(error)
  for (let i = 0; i < imgs.length; i++) if (imgs[i]) await saveShot(imgs[i], 'observation_id', data.id, LABELS[i], i)
}
export async function deleteSetup(id) {
  const { data } = await supabase.from('screenshots').select('path_full,path_thumb').eq('setup_id', id)
  const { data: obs } = await supabase.from('observations').select('screenshots(path_full,path_thumb)').eq('setup_id', id)
  const paths = [...(data || []), ...(obs || []).flatMap((o) => o.screenshots)].flatMap((s) => [s.path_full, s.path_thumb])
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  await supabase.from('observations').delete().eq('setup_id', id)
  fail((await supabase.from('setups').delete().eq('id', id)).error)
}
