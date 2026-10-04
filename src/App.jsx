import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import * as api from './api'
import { processImage } from './image'

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
      <input type="password" placeholder="Пароль" value={pass} onChange={(e) => setPass(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()} />
      <button className="primary" onClick={go}>Войти</button>
      {err && <p className="err">{err}</p>}
    </div>
  )
}

const stats = (s) => {
  const o = s.observations || []
  const w = o.filter((x) => x.result === 'success').length
  const l = o.filter((x) => x.result === 'fail').length
  return { wr: w + l ? Math.round((w / (w + l)) * 100) : null, n: o.length }
}

function Capsules({ ids, factors }) {
  return (
    <div className="caps">
      {ids.map((id) => <span key={id} className="cap">{factors.find((f) => f.id === id)?.name}</span>)}
    </div>
  )
}

function Card({ s, factors, urls }) {
  const thumb = [...(s.screenshots || [])].sort((a, b) => a.sort_order - b.sort_order)[0]
  const { wr, n } = stats(s)
  return (
    <div className="card">
      <div className="thumb">{thumb && urls[thumb.path_thumb] ? <img src={urls[thumb.path_thumb]} /> : <span>нет скрина</span>}</div>
      <h3>{s.name}</h3>
      <Capsules ids={s.setup_factors.map((x) => x.factor_id)} factors={factors} />
      <div className="meta">
        <span>Оценка: {s.rating ?? '–'}/10</span>
        <span>Винрейт: {wr === null ? '–' : wr + '%'}</span>
        <span>История: {n}</span>
      </div>
    </div>
  )
}

function Modal({ factors, setFactors, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [rating, setRating] = useState('')
  const [sel, setSel] = useState([])
  const [newF, setNewF] = useState('')
  const [img, setImg] = useState(null)
  const [dup, setDup] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const pick = useCallback(async (file) => {
    if (!file) return
    const p = await processImage(file)
    setImg(p)
    setDup(await api.findDuplicate(p.hash))
  }, [])

  useEffect(() => {
    const h = (e) => {
      const it = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))
      if (it) pick(it.getAsFile())
    }
    document.addEventListener('paste', h)
    return () => document.removeEventListener('paste', h)
  }, [pick])

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const add = async () => {
    const v = newF.trim()
    if (!v) return
    try {
      const f = await api.addFactor(v)
      setFactors((x) => [...x, f]); setSel((s) => [...s, f.id]); setNewF('')
    } catch (e) { setErr(e.message) }
  }
  const save = async () => {
    if (!name.trim()) return setErr('Введи название')
    setBusy(true)
    try {
      await api.createSetup({ name: name.trim(), comment, rating: rating === '' ? null : +rating, factorIds: sel, img })
      onSaved()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="left">
          <label className="drop">
            {img ? <img src={img.preview} /> : <span>Ctrl+V — вставить скрин<br />или нажми, чтобы выбрать файл</span>}
            <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files[0])} />
          </label>
          {img && <small className="muted">Нажми на скрин, чтобы заменить</small>}
          {dup && <p className="warn">Такой же скрин уже есть{dup.setups?.name ? ` в сетапе «${dup.setups.name}»` : ' (в неотсортированном)'}.</p>}
        </div>
        <div className="right">
          <input placeholder="Название сетапа" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="caps">
            {factors.map((f) => (
              <button key={f.id} className={'cap btn' + (sel.includes(f.id) ? ' on' : '')} onClick={() => toggle(f.id)}>{f.name}</button>
            ))}
            <input className="mini" placeholder="+ новый фактор" value={newF}
              onChange={(e) => setNewF(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <input type="number" min="0" max="10" placeholder="Оценка 0–10" value={rating} onChange={(e) => setRating(e.target.value)} />
          <textarea placeholder="Комментарий: как устроена гипотеза" value={comment} onChange={(e) => setComment(e.target.value)} />
          {err && <p className="err">{err}</p>}
          <div className="row">
            <button onClick={onClose}>Отмена</button>
            <button className="primary" disabled={busy} onClick={save}>{busy ? 'Сохраняю…' : 'Создать'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Main() {
  const [setups, setSetups] = useState([])
  const [factors, setFactors] = useState([])
  const [urls, setUrls] = useState({})
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([api.listFactors(), api.listSetups()])
      setFactors(f); setSetups(s)
      setUrls(await api.signedUrls(s.flatMap((x) => x.screenshots.map((y) => y.path_thumb))))
    } catch (e) { setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="app">
      <header>
        <h2>Сетапы</h2>
        <div>
          <button className="primary" onClick={() => setOpen(true)}>+</button>
          <button onClick={() => supabase.auth.signOut()}>Выйти</button>
        </div>
      </header>
      {err && <p className="err">{err}</p>}
      <div className="grid">{setups.map((s) => <Card key={s.id} s={s} factors={factors} urls={urls} />)}</div>
      {!setups.length && !err && <p className="muted">Пока пусто. Нажми «+», чтобы добавить первый сетап.</p>}
      {open && <Modal factors={factors} setFactors={setFactors} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load() }} />}
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
