import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from './supabase'
import * as api from './api'
import { processImage } from './image'

function usePaste(cb) {
  useEffect(() => {
    const h = (e) => {
      const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
      if (it) cb(it.getAsFile())
    }
    document.addEventListener('paste', h)
    return () => document.removeEventListener('paste', h)
  }, [cb])
}

function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const go = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
    if (error) setErr(error.message)
  }
  return (
    <div className="login">
      <h2>Setups</h2>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Пароль" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <button className="btn primary" onClick={go}>Войти</button>
      {err && <p className="err">{err}</p>}
    </div>
  )
}

function Lightbox({ src, onClose }) {
  const [full, setFull] = useState(false)
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={src} className={full ? 'lb-100' : 'lb-fit'} onClick={(e) => { e.stopPropagation(); setFull((f) => !f) }} />
    </div>
  )
}

function FactorChips({ factors, sel, onToggle, onAdd }) {
  const [v, setV] = useState('')
  const add = async () => { const n = v.trim(); if (n) { await onAdd(n); setV('') } }
  return (
    <div className="fchips">
      {factors.map((f) => (
        <button key={f.id} type="button" className={'fc' + (sel.includes(f.id) ? ' on' : '')} onClick={() => onToggle(f.id)}>{f.name}</button>
      ))}
      <input className="fnew" placeholder="+ новая" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
    </div>
  )
}

/* ---------- Верхняя плашка: поиск по факторам + список + плюс ---------- */
function TopBar({ factors, sel, setSel, onAddFactor, onPlus }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const query = q.trim().toLowerCase()
  const sug = query ? factors.filter((f) => !sel.includes(f.id) && f.name.toLowerCase().includes(query)).slice(0, 8) : []
  const pick = (id) => { setSel([...sel, id]); setQ('') }
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
  const nameOf = (id) => factors.find((f) => f.id === id)?.name
  const close = () => { setOpen(false); setQ('') }
  return (
    <div className="topbar">
      {(open || sug.length > 0) && <div className="scrim" onClick={close} />}
      <div className="pill">
        {sel.map((id) => (
          <span key={id} className="chip">{nameOf(id)}<b onClick={() => toggle(id)}>×</b></span>
        ))}
        <input value={q} placeholder={sel.length ? '' : 'Поиск по факторам…'} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && sug[0]) pick(sug[0].id)
            if (e.key === 'Backspace' && !q && sel.length) setSel(sel.slice(0, -1))
          }} />
        <button className="tog" title="Все факторы" onClick={() => setOpen((o) => !o)}>{open ? '▴' : '▾'}</button>
        {sug.length > 0 && (
          <div className="sugs">{sug.map((f) => <div key={f.id} className="sug" onClick={() => pick(f.id)}>{f.name}</div>)}</div>
        )}
        {open && (
          <div className="allf">
            <FactorChips factors={factors} sel={sel} onToggle={toggle} onAdd={onAddFactor} />
          </div>
        )}
      </div>
      <button className="addbtn" title="Добавить скрин" onClick={onPlus}>+</button>
      <button className="link" onClick={() => supabase.auth.signOut()}>Выйти</button>
    </div>
  )
}

/* ---------- Галерея ---------- */
function Gallery({ shots, factors, urls, onOpen }) {
  const nameOf = (id) => factors.find((f) => f.id === id)?.name
  return (
    <div className="gallery">
      {shots.map((s) => (
        <div key={s.id} className="gcell" onClick={() => onOpen(s.id)}>
          <div className="gthumb">{urls[s.path_thumb] && <img loading="lazy" decoding="async" src={urls[s.path_thumb]} />}</div>
          <div className="gmeta">
            <div className={'gtitle' + (s.title ? '' : ' none')}>{s.title || 'Без названия'}</div>
            <div className="gcaps">{s.shot_factors.map((f) => <span key={f.factor_id} className="gcap">{nameOf(f.factor_id)}</span>)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- Окно просмотра ---------- */
function ViewDialog({ shot, factors, thumbUrl, onClose, onPatch, onToggle, onDelete, onAddFactor }) {
  const [full, setFull] = useState(null)
  const [zoom, setZoom] = useState(false)
  useEffect(() => { api.signedUrls([shot.path_full]).then((u) => setFull(u[shot.path_full])) }, [shot.path_full])
  const sel = shot.shot_factors.map((f) => f.factor_id)
  const date = new Date(shot.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dlg view" onClick={(e) => e.stopPropagation()}>
        <div className="vleft">
          <img src={full || thumbUrl} onClick={() => full && setZoom(true)} style={{ cursor: full ? 'zoom-in' : 'default' }} />
        </div>
        <div className="vright">
          <input className="vtitle" placeholder="Название" defaultValue={shot.title} key={'t' + shot.id}
            onBlur={(e) => e.target.value !== shot.title && onPatch(shot.id, { title: e.target.value })} />
          <FactorChips factors={factors} sel={sel} onToggle={(fid) => onToggle(shot.id, fid)}
            onAdd={async (n) => { const f = await onAddFactor(n); onToggle(shot.id, f.id, true) }} />
          <textarea className="vcomment" placeholder="Комментарий" defaultValue={shot.comment} key={'c' + shot.id}
            onBlur={(e) => e.target.value !== shot.comment && onPatch(shot.id, { comment: e.target.value })} />
          <div className="vfoot">
            <span className="muted">{date}</span>
            <button className="btn danger" title="Удалить" onClick={() => confirm('Уверен, что хочешь удалить этот скрин?') && onDelete(shot.id)}>🗑 Удалить</button>
          </div>
        </div>
      </div>
      {zoom && full && <Lightbox src={full} onClose={() => setZoom(false)} />}
    </div>
  )
}

/* ---------- Окно добавления ---------- */
function AddDialog({ initFile, factors, onAddFactor, onClose, onCreated, onOpenExisting }) {
  const [img, setImg] = useState(null)
  const [dup, setDup] = useState(null)
  const [dupUrl, setDupUrl] = useState(null)
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [sel, setSel] = useState([])
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [err, setErr] = useState('')
  const pick = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const p = await processImage(file)
    setImg(p); setTitle(p.name)
    const d = await api.findDuplicate(p.hash)
    setDup(d)
    if (d) api.signedUrls([d.path_thumb]).then((u) => setDupUrl(u[d.path_thumb]))
  }, [])
  useEffect(() => { if (initFile) pick(initFile) }, [initFile, pick])
  usePaste(pick)
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const addF = async (n) => { const f = await onAddFactor(n); setSel((s) => (s.includes(f.id) ? s : [...s, f.id])) }
  const save = async () => {
    setBusy(true)
    try { onCreated(await api.createShot({ title: title.trim(), comment, factorIds: sel, img })) } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className={'dlg add' + (img ? ' loaded' : '')} onClick={(e) => e.stopPropagation()}>
        {dup && (
          <div className="dupwarn">
            {dupUrl && <img src={dupUrl} />}
            <span>⚠ Такой же скрин уже добавлен{dup.title ? ` («${dup.title}»)` : ''}.</span>
            <button className="btn" onClick={() => onOpenExisting(dup.id)}>Открыть</button>
          </div>
        )}
        <div className="addbody">
          <label className={'dropzone' + (over ? ' over' : '') + (img ? ' has' : '')}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]) }}>
            {img ? <img src={img.preview} /> : <span>Ctrl+V · перетащить файл · нажать, чтобы выбрать</span>}
            <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files[0])} />
          </label>
          {img && (
            <div className="addside">
              <input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
              <FactorChips factors={factors} sel={sel} onToggle={toggle} onAdd={addF} />
              <textarea placeholder="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          )}
        </div>
        {err && <p className="err">{err}</p>}
        <div className="row">
          <button className="btn" onClick={onClose}>Отмена</button>
          {img && <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>}
        </div>
      </div>
    </div>
  )
}

/* ---------- Главный экран ---------- */
function Main() {
  const [shots, setShots] = useState([])
  const [factors, setFactors] = useState([])
  const [urls, setUrls] = useState({})
  const [sel, setSel] = useState([])
  const [viewId, setViewId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [initFile, setInitFile] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const shotsRef = useRef(shots); shotsRef.current = shots
  const factorsRef = useRef(factors); factorsRef.current = factors
  const blocked = useRef(false); blocked.current = addOpen || !!viewId

  useEffect(() => {
    (async () => {
      try {
        const [f, s] = await Promise.all([api.listFactors(), api.listShots()])
        setFactors(f); setShots(s); setLoading(false)
        setUrls(await api.signedUrls(s.map((x) => x.path_thumb)))
      } catch (e) { setErr(e.message); setLoading(false) }
    })()
  }, [])

  usePaste(useCallback((file) => { if (!blocked.current) { setInitFile(file); setAddOpen(true) } }, []))

  const addFactor = useCallback(async (name) => {
    const ex = factorsRef.current.find((f) => f.name.toLowerCase() === name.toLowerCase())
    if (ex) return ex
    const f = await api.addFactor(name)
    setFactors((x) => [...x, f])
    return f
  }, [])
  const patchLocal = (id, p) => setShots((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const savePatch = async (id, p) => {
    const old = shotsRef.current.find((x) => x.id === id)
    patchLocal(id, p)
    try { await api.updateShot(id, p) } catch (e) { patchLocal(id, old); alert(e.message) }
  }
  const toggleFactor = async (id, fid, force) => {
    const s = shotsRef.current.find((x) => x.id === id)
    if (!s) return
    const has = s.shot_factors.some((f) => f.factor_id === fid)
    const on = force ?? !has
    if (on === has) return
    patchLocal(id, { shot_factors: on ? [...s.shot_factors, { factor_id: fid }] : s.shot_factors.filter((f) => f.factor_id !== fid) })
    try { await api.setShotFactor(id, fid, on) } catch (e) { patchLocal(id, { shot_factors: s.shot_factors }); alert(e.message) }
  }
  const remove = async (id) => {
    const s = shotsRef.current.find((x) => x.id === id)
    setShots((a) => a.filter((x) => x.id !== id)); setViewId(null)
    try { await api.deleteShot(s) } catch (e) { setShots((a) => [s, ...a]); alert(e.message) }
  }
  const created = async (shot) => {
    setShots((a) => [shot, ...a]); setAddOpen(false); setInitFile(null)
    const u = await api.signedUrls([shot.path_thumb]); setUrls((x) => ({ ...x, ...u }))
  }
  const shown = useMemo(() => shots.filter((s) => sel.every((id) => s.shot_factors.some((f) => f.factor_id === id))), [shots, sel])
  const view = shots.find((s) => s.id === viewId)

  return (
    <div className="app">
      <TopBar factors={factors} sel={sel} setSel={setSel} onAddFactor={addFactor} onPlus={() => { setInitFile(null); setAddOpen(true) }} />
      {err && <p className="err pad">{err}</p>}
      {!loading && !shots.length && !err && <p className="muted pad">Пока пусто. Вставь скрин через Ctrl+V или нажми «+».</p>}
      {!!shots.length && !shown.length && <p className="muted pad">Нет скринов с такими факторами.</p>}
      <Gallery shots={shown} factors={factors} urls={urls} onOpen={setViewId} />
      {addOpen && <AddDialog initFile={initFile} factors={factors} onAddFactor={addFactor} onClose={() => { setAddOpen(false); setInitFile(null) }} onCreated={created} onOpenExisting={setViewId} />}
      {view && <ViewDialog shot={view} factors={factors} thumbUrl={urls[view.path_thumb]} onClose={() => setViewId(null)} onPatch={savePatch} onToggle={toggleFactor} onDelete={remove} onAddFactor={addFactor} />}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return null
  return session ? <Main /> : <Login />
}
