import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import * as api from './api'
import { processImage } from './image'

const RES = { success: 'Успех', fail: 'Провал', unclear: 'Неясно' }
const PH = { fast: 'Быстрая', slow: 'Медленная' }
const METRICS = ['Объём 24', 'Изм. цены 24', 'Волатильность 6h', 'NATR 2h', 'Сделки 24h', 'Корреляция 1h']
const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const fmtDate = (d) => new Date(d).toLocaleString('ru', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

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

function Card({ s, factors, urls, onOpen }) {
  const t = [...(s.screenshots || [])].sort((a, b) => a.sort_order - b.sort_order)[0]
  return (
    <div className="card" onClick={onOpen}>
      {t && urls[t.path_thumb] ? <img src={urls[t.path_thumb]} /> : <div className="noimg">нет скрина</div>}
      <div className="caps small">
        {s.setup_factors.map((x) => <span key={x.factor_id} className="cap">{factors.find((f) => f.id === x.factor_id)?.name}</span>)}
      </div>
    </div>
  )
}

function FactorPicker({ factors, sel, onToggle, onAdd }) {
  const [v, setV] = useState('')
  const add = async () => { const n = v.trim(); if (n) { await onAdd(n); setV('') } }
  return (
    <div className="caps">
      {factors.map((f) => (
        <button key={f.id} className={'cap btn' + (sel.includes(f.id) ? ' on' : '')} onClick={() => onToggle(f.id)}>{f.name}</button>
      ))}
      <input className="mini" placeholder="+ новый" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
    </div>
  )
}

function DropZone({ img, dup, onFile }) {
  const [over, setOver] = useState(false)
  useEffect(() => {
    const h = (e) => {
      const it = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))
      if (it) onFile(it.getAsFile())
    }
    document.addEventListener('paste', h)
    return () => document.removeEventListener('paste', h)
  }, [onFile])
  return (
    <>
      <label className={'drop' + (over ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]) }}>
        {img ? <img src={img.preview} /> : <span>Ctrl+V · перетащить · нажать для выбора файла</span>}
        <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files[0])} />
      </label>
      {dup && <p className="warn">Такой же скрин уже есть{dup.setups?.name ? ` в сетапе «${dup.setups.name}»` : ''}.</p>}
    </>
  )
}

function usePick() {
  const [img, setImg] = useState(null)
  const [dup, setDup] = useState(null)
  const pick = useCallback(async (file) => {
    if (!file) return
    const p = await processImage(file)
    setImg(p); setDup(await api.findDuplicate(p.hash))
  }, [])
  return { img, dup, pick }
}

function CreateModal({ factors, setFactors, onClose, onSaved }) {
  const { img, dup, pick } = usePick()
  const [comment, setComment] = useState('')
  const [sel, setSel] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const onAdd = async (n) => { const f = await api.addFactor(n); setFactors((x) => [...x, f]); setSel((s) => [...s, f.id]) }
  const save = async () => {
    if (!img) return setErr('Добавь скрин')
    setBusy(true)
    try { await api.createSetup({ name: '', comment, rating: null, factorIds: sel, img }); onSaved() }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <DropZone img={img} dup={dup} onFile={pick} />
        <FactorPicker factors={factors} sel={sel} onToggle={toggle} onAdd={onAdd} />
        <textarea placeholder="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <div className="row">
          <button onClick={onClose}>Отмена</button>
          <button className="primary" disabled={busy} onClick={save}>{busy ? 'Сохраняю…' : 'Создать'}</button>
        </div>
      </div>
    </div>
  )
}

function ObsForm({ setupId, onDone, onCancel }) {
  const { img, dup, pick } = usePick()
  const [f, setF] = useState({ coin: '', direction: '', timeframe: '', result: '', phase: '', comment: '', date: nowLocal(), m: {} })
  const [err, setErr] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    const metrics = {}
    Object.entries(f.m).forEach(([k, v]) => { if (v !== '') metrics[k] = isNaN(+v) ? v : +v })
    try {
      await api.addObservation(setupId, {
        coin: f.coin.trim().toUpperCase() || null, direction: f.direction || null, timeframe: f.timeframe || null,
        result: f.result || null, phase: f.phase || null, comment: f.comment, metrics, observed_at: new Date(f.date).toISOString(),
      }, img)
      onDone()
    } catch (e) { setErr(e.message) }
  }
  return (
    <div className="obsform">
      <DropZone img={img} dup={dup} onFile={pick} />
      <div className="fields">
        <input placeholder="Монета" value={f.coin} onChange={(e) => set('coin', e.target.value)} />
        <select value={f.direction} onChange={(e) => set('direction', e.target.value)}><option value="">Направление</option><option value="long">Long</option><option value="short">Short</option></select>
        <input placeholder="Таймфрейм" value={f.timeframe} onChange={(e) => set('timeframe', e.target.value)} />
        <select value={f.result} onChange={(e) => set('result', e.target.value)}><option value="">Результат</option>{Object.entries(RES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={f.phase} onChange={(e) => set('phase', e.target.value)}><option value="">Фаза</option>{Object.entries(PH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input type="datetime-local" value={f.date} onChange={(e) => set('date', e.target.value)} />
        {METRICS.map((m) => <input key={m} placeholder={m} value={f.m[m] || ''} onChange={(e) => set('m', { ...f.m, [m]: e.target.value })} />)}
      </div>
      <textarea placeholder="Комментарий / отклонения от оригинала" value={f.comment} onChange={(e) => set('comment', e.target.value)} />
      {err && <p className="err">{err}</p>}
      <div className="row"><button onClick={onCancel}>Отмена</button><button className="primary" onClick={save}>Добавить</button></div>
    </div>
  )
}

function History({ obs, urls }) {
  const [sort, setSort] = useState({ key: 'observed_at', dir: -1 })
  const val = (o, k) => (METRICS.includes(k) ? o.metrics?.[k] : o[k])
  const rows = [...obs].sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key)
    if (x == null) return 1
    if (y == null) return -1
    return (x > y ? 1 : x < y ? -1 : 0) * sort.dir
  })
  const cols = [['coin', 'Монета'], ['direction', 'Напр.'], ['timeframe', 'ТФ'], ...METRICS.map((m) => [m, m]), ['result', 'Результат'], ['phase', 'Фаза'], ['observed_at', 'Дата'], ['comment', 'Комментарий']]
  const click = (k) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th></th>{cols.map(([k, t]) => <th key={k} onClick={() => click(k)}>{t}{sort.key === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>)}</tr></thead>
        <tbody>
          {rows.map((o) => {
            const sh = o.screenshots?.[0]
            return (
              <tr key={o.id}>
                <td>{sh && urls[sh.path_thumb] && <img className="rowimg" src={urls[sh.path_thumb]} onClick={() => window.open(urls[sh.path_full])} />}</td>
                <td>{o.coin}</td><td>{o.direction}</td><td>{o.timeframe}</td>
                {METRICS.map((m) => <td key={m}>{o.metrics?.[m]}</td>)}
                <td className={'res ' + o.result}>{RES[o.result] || '–'}</td><td>{PH[o.phase]}</td>
                <td>{fmtDate(o.observed_at)}</td><td className="cm">{o.comment}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!rows.length && <p className="muted">История пуста.</p>}
    </div>
  )
}

function Detail({ id, factors, setFactors, onClose }) {
  const [s, setS] = useState(null)
  const [urls, setUrls] = useState({})
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    try {
      const d = await api.getSetup(id)
      setS(d)
      const shots = [...d.screenshots, ...d.observations.flatMap((o) => o.screenshots)]
      setUrls(await api.signedUrls(shots.flatMap((x) => [x.path_full, x.path_thumb])))
    } catch (e) { setErr(e.message) }
  }, [id])
  useEffect(() => { load() }, [load])
  if (!s) return <div className="overlay" onClick={onClose}><div className="modal">{err || 'Загрузка…'}</div></div>
  const sel = s.setup_factors.map((x) => x.factor_id)
  const { wr, n } = stats(s)
  const shot = s.screenshots[0]
  const toggle = async (fid) => { await api.toggleFactor(id, fid, !sel.includes(fid)); load() }
  const onAdd = async (nm) => { const f = await api.addFactor(nm); setFactors((x) => [...x, f]); await api.toggleFactor(id, f.id, true); load() }
  const del = async () => { if (confirm('Удалить сетап и всю его историю?')) { await api.deleteSetup(id); onClose(true) } }
  return (
    <div className="overlay" onClick={() => onClose(true)}>
      <div className="modal big" onClick={(e) => e.stopPropagation()}>
        <div className="top">
          <div className="left">{shot && urls[shot.path_full] && <img className="full" src={urls[shot.path_full]} />}</div>
          <div className="right">
            <FactorPicker factors={factors} sel={sel} onToggle={toggle} onAdd={onAdd} />
            <div className="stats">
              <label>Оценка <input type="number" min="0" max="10" defaultValue={s.rating ?? ''} onBlur={(e) => api.updateSetup(id, { rating: e.target.value === '' ? null : +e.target.value })} />/10</label>
              <span>Винрейт: {wr === null ? '–' : wr + '%'}</span><span>История: {n}</span>
            </div>
            <textarea placeholder="Комментарий: как устроена гипотеза" defaultValue={s.comment || ''} onBlur={(e) => api.updateSetup(id, { comment: e.target.value })} />
            <div className="row"><button className="danger" onClick={del}>Удалить сетап</button></div>
          </div>
        </div>
        <div className="histhead"><h3>История</h3><button className="primary sq" onClick={() => setAdding(true)}>+</button></div>
        {adding && <ObsForm setupId={id} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load() }} />}
        <History obs={s.observations} urls={urls} />
      </div>
    </div>
  )
}

function Main() {
  const [setups, setSetups] = useState([])
  const [factors, setFactors] = useState([])
  const [urls, setUrls] = useState({})
  const [open, setOpen] = useState(false)
  const [openId, setOpenId] = useState(null)
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
        <div><button className="primary sq" onClick={() => setOpen(true)}>+</button><button onClick={() => supabase.auth.signOut()}>Выйти</button></div>
      </header>
      {err && <p className="err">{err}</p>}
      <div className="grid">{setups.map((s) => <Card key={s.id} s={s} factors={factors} urls={urls} onOpen={() => setOpenId(s.id)} />)}</div>
      {!setups.length && !err && <p className="muted">Пока пусто. Нажми «+», чтобы добавить первую формацию.</p>}
      {open && <CreateModal factors={factors} setFactors={setFactors} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load() }} />}
      {openId && <Detail id={openId} factors={factors} setFactors={setFactors} onClose={(r) => { setOpenId(null); if (r) load() }} />}
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
