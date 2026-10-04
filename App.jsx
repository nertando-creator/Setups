import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import * as api from './api'
import { processImage } from './image'

const RES = { success: 'Успех', fail: 'Провал', unclear: 'Неясно' }
const RES_CLS = { success: 'g', fail: 'r', unclear: 'o' }
const PH = { fast: 'Быстрая', slow: 'Медленная' }
const TFS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const METRICS = [['vol', 'Объём (24h)'], ['chg', 'Изм. цены (24h)'], ['volat', 'Волатильность (6h)'], ['natr', 'NATR (2h)'], ['trades', 'Сделки (24h)'], ['corr', 'Корреляция (1h)']]
const GREEN = '#4aa66f', RED = '#c75a5a', YEL = '#c9a23d'
const ratingColor = (r) => (r == null ? '#7a7c80' : r >= 8 ? GREEN : r >= 5 ? YEL : RED)
const nowTime = () => new Date().toTimeString().slice(0, 5)
const nowDay = () => (new Date().getDay() + 6) % 7

const stats = (s) => {
  const o = s.observations || []
  const w = o.filter((x) => x.result === 'success').length
  const l = o.filter((x) => x.result === 'fail').length
  return { wr: w + l ? Math.round((w / (w + l)) * 100) : null, n: o.length }
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
      <button className="primary" onClick={go}>Войти</button>
      {err && <p className="err">{err}</p>}
    </div>
  )
}

// Картинка с нон-деструктивной обрезкой (рамка хранится в setups.metrics.crop, оригинал не меняется)
function Cropped({ src, crop, onClick }) {
  if (!crop) return <img className="cimg" src={src} onClick={onClick} />
  return (
    <div className="cropbox" style={{ aspectRatio: (crop.w * crop.ar) / crop.h }} onClick={onClick}>
      <img src={src} style={{ position: 'absolute', width: 100 / crop.w + '%', left: (-crop.x / crop.w) * 100 + '%', top: (-crop.y / crop.h) * 100 + '%' }} />
    </div>
  )
}

function CropEditor({ src, onApply, onClose }) {
  const [r, setR] = useState(null)
  const [ar, setAr] = useState(1)
  const box = useRef(null)
  const st = useRef(null)
  const pos = (e) => {
    const b = box.current.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }
  }
  const down = (e) => { e.preventDefault(); st.current = pos(e); setR({ ...st.current, w: 0, h: 0 }); box.current.setPointerCapture(e.pointerId) }
  const move = (e) => {
    if (!st.current) return
    const p = pos(e), s = st.current
    setR({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const ok = r && r.w > 0.03 && r.h > 0.03
  return (
    <div className="overlay top3" onClick={onClose}>
      <div className="modal cropmodal" onClick={(e) => e.stopPropagation()}>
        <p className="muted">Выдели область мышью, затем «Применить». Оригинал сохраняется, обрезку можно сбросить.</p>
        <div className="cropedit" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={() => (st.current = null)}>
          <img src={src} draggable={false} onLoad={(e) => setAr(e.target.naturalWidth / e.target.naturalHeight)} />
          {r && <div className="sel" style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' }} />}
        </div>
        <div className="row">
          <button onClick={() => onApply(null)}>Вернуть оригинал</button>
          <button onClick={onClose}>Отмена</button>
          <button className="primary" disabled={!ok} onClick={() => onApply({ ...r, ar })}>Применить</button>
        </div>
      </div>
    </div>
  )
}

function usePaste(cb) {
  useEffect(() => {
    const h = (e) => {
      const it = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))
      if (it) cb(it.getAsFile())
    }
    document.addEventListener('paste', h)
    return () => document.removeEventListener('paste', h)
  }, [cb])
}
function Slot({ img, onFile, hint, small }) {
  const [over, setOver] = useState(false)
  return (
    <label className={'drop' + (small ? ' small' : '') + (over ? ' over' : '')}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]) }}>
      {img ? <img src={img.preview} /> : <span>{hint}</span>}
      <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files[0])} />
    </label>
  )
}
function Pills({ opts, value, onChange, cls = {} }) {
  return (
    <div className="pills">
      {opts.map(([v, t]) => (
        <button key={v} type="button" className={'pill ' + (cls[v] || '') + (value === v ? ' on' : '')} onClick={() => onChange(value === v ? '' : v)}>{t}</button>
      ))}
    </div>
  )
}

function Card({ s, factors, urls, onOpen }) {
  const t = [...(s.screenshots || [])].sort((a, b) => a.sort_order - b.sort_order)[0]
  const { wr, n } = stats(s)
  return (
    <div className="card" onClick={onOpen}>
      {t && urls[t.path_full] ? <Cropped src={urls[t.path_full]} crop={s.metrics?.crop} /> : <div className="noimg">нет скрина</div>}
      <div className="foot">
        <div className="caps small">
          {s.setup_factors.map((x) => <span key={x.factor_id} className="cap">{factors.find((f) => f.id === x.factor_id)?.name}</span>)}
        </div>
        <div className="cstats">
          <span>Rate <b style={{ color: ratingColor(s.rating) }}>{s.rating ?? '–'}/10</b></span>
          <span className="wr">Winrate {wr === null ? '–' : wr + '%'}</span>
          <span>History {n}</span>
        </div>
      </div>
    </div>
  )
}

function FactorPicker({ factors, sel, onToggle, onAdd }) {
  const [v, setV] = useState('')
  const add = async () => { const n = v.trim(); if (n) { await onAdd(n); setV('') } }
  return (
    <div className="caps">
      {factors.map((f) => <button key={f.id} className={'cap btn' + (sel.includes(f.id) ? ' on' : '')} onClick={() => onToggle(f.id)}>{f.name}</button>)}
      <input className="mini" placeholder="+ новый" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
    </div>
  )
}
function FactorBar({ factors, sel, onToggle, onAdd }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const add = async () => { const n = v.trim(); if (n) { await onAdd(n); setV('') } }
  return (
    <div className="fbar">
      <div className="caps">
        {sel.map((id) => <span key={id} className="cap">{factors.find((f) => f.id === id)?.name}</span>)}
        <button className="plus" onClick={() => setOpen((o) => !o)}>+</button>
      </div>
      {open && (
        <div className="pop">
          {factors.map((f) => <div key={f.id} className={'opt' + (sel.includes(f.id) ? ' on' : '')} onClick={() => onToggle(f.id)}>{sel.includes(f.id) ? '✓ ' : ''}{f.name}</div>)}
          <input placeholder="Добавить новый…" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </div>
      )}
    </div>
  )
}

function CreateModal({ factors, setFactors, onClose, onSaved }) {
  const [img, setImg] = useState(null)
  const [dup, setDup] = useState(null)
  const [comment, setComment] = useState('')
  const [sel, setSel] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pick = useCallback(async (file) => {
    if (!file) return
    const p = await processImage(file)
    setImg(p); setDup(await api.findDuplicate(p.hash))
  }, [])
  usePaste(pick)
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const onAdd = async (n) => { const f = await api.addFactor(n); setFactors((x) => [...x, f]); setSel((s) => [...s, f.id]) }
  const save = async () => {
    if (!img) return setErr('Добавь скрин')
    setBusy(true)
    try { await api.createSetup({ comment, factorIds: sel, img }); onSaved() } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <Slot img={img} onFile={pick} hint="Ctrl+V · перетащить · нажать для выбора файла" />
        {dup && <p className="warn">Такой же скрин уже есть{dup.setups?.name ? ` в сетапе «${dup.setups.name}»` : ''}.</p>}
        <FactorPicker factors={factors} sel={sel} onToggle={toggle} onAdd={onAdd} />
        <textarea placeholder="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <div className="row"><button onClick={onClose}>Отмена</button><button className="primary" disabled={busy} onClick={save}>{busy ? 'Сохраняю…' : 'Создать'}</button></div>
      </div>
    </div>
  )
}

function ObsForm({ setupId, onDone, onCancel }) {
  const [imgs, setImgs] = useState([null, null, null])
  const ref = useRef(imgs); ref.current = imgs
  const [dup, setDup] = useState(null)
  const [f, setF] = useState({ coin: '', direction: '', timeframe: '', result: '', phase: '', day: nowDay(), time: nowTime(), comment: '', m: {} })
  const [err, setErr] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const put = useCallback(async (file, idx) => {
    if (!file) return
    const p = await processImage(file)
    const e = ref.current.indexOf(null)
    const k = idx ?? (e < 0 ? 0 : e)
    setImgs((a) => a.map((x, j) => (j === k ? p : x)))
    if (k === 0) setDup(await api.findDuplicate(p.hash))
  }, [])
  usePaste((file) => put(file))
  const save = async () => {
    const metrics = { _day: f.day, _time: f.time }
    Object.entries(f.m).forEach(([k, v]) => { if (v !== '') metrics[k] = isNaN(+v) ? v : +v })
    try {
      await api.addObservation(setupId, {
        coin: f.coin.trim().toUpperCase() || null, direction: f.direction || null, timeframe: f.timeframe || null,
        result: f.result || null, phase: f.phase || null, comment: f.comment, metrics,
      }, imgs)
      onDone()
    } catch (e) { setErr(e.message) }
  }
  return (
    <div className="overlay top2" onClick={onCancel}>
      <div className="modal obsmodal" onClick={(e) => e.stopPropagation()}>
        <div className="imgs">
          <Slot img={imgs[0]} onFile={(x) => put(x, 0)} hint="Основной скрин: Ctrl+V · перетащить · выбрать" />
          <div className="side">
            <Slot small img={imgs[1]} onFile={(x) => put(x, 1)} hint="Доп. скрин 1" />
            <Slot small img={imgs[2]} onFile={(x) => put(x, 2)} hint="Доп. скрин 2" />
          </div>
        </div>
        {dup && <p className="warn">Такой же скрин уже есть{dup.setups?.name ? ` в сетапе «${dup.setups.name}»` : ''}.</p>}
        <div className="frow"><input placeholder="Монета" value={f.coin} onChange={(e) => set('coin', e.target.value)} />
          <Pills opts={[['long', 'Long'], ['short', 'Short']]} value={f.direction} onChange={(v) => set('direction', v)} cls={{ long: 'g', short: 'r' }} /></div>
        <div className="frow"><span className="lbl">ТФ</span><Pills opts={TFS.map((t) => [t, t])} value={f.timeframe} onChange={(v) => set('timeframe', v)} /></div>
        <div className="frow"><span className="lbl">Результат</span><Pills opts={Object.entries(RES)} value={f.result} onChange={(v) => set('result', v)} cls={RES_CLS} />
          <span className="lbl">Фаза</span><Pills opts={Object.entries(PH)} value={f.phase} onChange={(v) => set('phase', v)} /></div>
        <div className="frow"><span className="lbl">День</span><Pills opts={DAYS.map((d, i) => [i, d])} value={f.day} onChange={(v) => set('day', v === '' ? f.day : v)} />
          <input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} /></div>
        <div className="fields">{METRICS.map(([k, t]) => <input key={k} placeholder={t} value={f.m[k] || ''} onChange={(e) => set('m', { ...f.m, [k]: e.target.value })} />)}</div>
        <textarea placeholder="Комментарий / отклонения от оригинала" value={f.comment} onChange={(e) => set('comment', e.target.value)} />
        {err && <p className="err">{err}</p>}
        <div className="row"><button onClick={onCancel}>Отмена</button><button className="primary" onClick={save}>Добавить</button></div>
      </div>
    </div>
  )
}

const num = (v) => typeof v === 'number'
const volM = (v) => (v >= 1e6 ? v / 1e6 : v)
const whenVal = (o) => (o.metrics?._day ?? 0) * 1440 + (+(o.metrics?._time || '0:0').split(':')[0]) * 60 + +(o.metrics?._time || '0:0').split(':')[1]
const whenTxt = (o) => (o.metrics?._day != null ? `${DAYS[o.metrics._day]} ${o.metrics._time || ''}` : '')
const signed = (v) => (num(v) ? <span style={{ color: v < 0 ? RED : GREEN }}>{v > 0 ? '+' : ''}{v}</span> : v ?? '')
function cell(o, k) {
  const v = o.metrics?.[k]
  if (k === 'vol') return num(v) ? <span style={{ color: volM(v) > 250 ? YEL : undefined }}>{+volM(v).toFixed(1)}M$</span> : v ?? ''
  if (k === 'chg' || k === 'corr') return signed(v)
  return v ?? ''
}

function History({ obs, urls, onOpen }) {
  const [sort, setSort] = useState({ key: 'created_at', dir: -1 })
  const val = (o, k) => (k === 'when' ? whenVal(o) : METRICS.some((m) => m[0] === k) ? o.metrics?.[k] : o[k])
  const rows = [...obs].sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key)
    if (x == null) return 1
    if (y == null) return -1
    return (x > y ? 1 : x < y ? -1 : 0) * sort.dir
  })
  const cols = [['coin', 'Монета'], ['direction', 'Напр.'], ['timeframe', 'ТФ'], ...METRICS, ['result', 'Результат'], ['phase', 'Фаза'], ['when', 'День / время'], ['comment', 'Комментарий']]
  const click = (k) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th></th>{cols.map(([k, t]) => <th key={k} onClick={() => click(k)}>{t}{sort.key === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>)}</tr></thead>
        <tbody>
          {rows.map((o) => {
            const sh = [...o.screenshots].sort((a, b) => a.sort_order - b.sort_order)[0]
            return (
              <tr key={o.id}>
                <td>{sh && urls[sh.path_thumb] ? <img className="rowimg" src={urls[sh.path_thumb]} onClick={() => onOpen(o)} /> : <span className="rowimg ph" />}</td>
                <td>{o.coin}</td>
                <td>{o.direction && <span className={'tag ' + (o.direction === 'long' ? 'g' : 'r')}>{o.direction === 'long' ? 'Long' : 'Short'}</span>}</td>
                <td>{o.timeframe}</td>
                {METRICS.map(([k]) => <td key={k}>{cell(o, k)}</td>)}
                <td>{o.result && <span className={'tag ' + RES_CLS[o.result]}>{RES[o.result]}</span>}</td>
                <td>{PH[o.phase]}</td><td>{whenTxt(o)}</td><td className="cm">{o.comment}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!rows.length && <p className="muted">История пуста.</p>}
    </div>
  )
}

function ObsView({ o, urls, onClose }) {
  const shots = [...o.screenshots].sort((a, b) => a.sort_order - b.sort_order)
  const [i, setI] = useState(0)
  return (
    <div className="overlay top2" onClick={onClose}>
      <div className="modal obsview" onClick={(e) => e.stopPropagation()}>
        <div className="left">
          {shots[i] && urls[shots[i].path_full] && <img className="full" src={urls[shots[i].path_full]} />}
          <div className="thumbs">{shots.map((s, j) => <img key={s.id} className={j === i ? 'on' : ''} src={urls[s.path_thumb]} onClick={() => setI(j)} />)}</div>
        </div>
        <div className="right">
          <div className="box info">
            <div><b>{o.coin || '–'}</b> {o.direction && <span className={'tag ' + (o.direction === 'long' ? 'g' : 'r')}>{o.direction === 'long' ? 'Long' : 'Short'}</span>} {o.timeframe} {o.result && <span className={'tag ' + RES_CLS[o.result]}>{RES[o.result]}</span>} {PH[o.phase]}</div>
            <div className="muted">{whenTxt(o)}</div>
            {METRICS.map(([k, t]) => o.metrics?.[k] != null && <div key={k}><span className="muted">{t}: </span>{cell(o, k)}</div>)}
          </div>
          <div className="box grow">{o.comment || <span className="muted">Без комментария</span>}</div>
        </div>
      </div>
    </div>
  )
}

function Detail({ id, factors, setFactors, onClose }) {
  const [s, setS] = useState(null)
  const [urls, setUrls] = useState({})
  const [adding, setAdding] = useState(false)
  const [view, setView] = useState(null)
  const [crop, setCrop] = useState(false)
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
  if (!s) return <div className="overlay" onClick={() => onClose(false)}><div className="modal narrow">{err || 'Загрузка…'}</div></div>
  const sel = s.setup_factors.map((x) => x.factor_id)
  const { wr, n } = stats(s)
  const shot = s.screenshots[0]
  const toggle = async (fid) => { await api.toggleFactor(id, fid, !sel.includes(fid)); load() }
  const onAdd = async (nm) => { const f = await api.addFactor(nm); setFactors((x) => [...x, f]); await api.toggleFactor(id, f.id, true); load() }
  const del = async () => { if (confirm('Уверен, что хочешь удалить сетап и всю его историю?')) { await api.deleteSetup(id); onClose(true) } }
  const applyCrop = async (c) => { const m = { ...(s.metrics || {}) }; if (c) m.crop = c; else delete m.crop; await api.updateSetup(id, { metrics: m }); setCrop(false); load() }
  return (
    <div className="overlay" onClick={() => onClose(true)}>
      <div className="modal big" onClick={(e) => e.stopPropagation()}>
        <div className="top">
          <div className="left imgwrap">
            {shot && urls[shot.path_full] && <Cropped src={urls[shot.path_full]} crop={s.metrics?.crop} />}
            <button className="ico tl" title="Удалить сетап" onClick={del}>🗑</button>
            <button className="ico tr" title="Обрезать" onClick={() => setCrop(true)}>✂</button>
          </div>
          <div className="right">
            <div className="box"><FactorBar factors={factors} sel={sel} onToggle={toggle} onAdd={onAdd} /></div>
            <div className="box stats">
              <label>Rate <select value={s.rating ?? ''} style={{ color: ratingColor(s.rating) }} onChange={async (e) => { await api.updateSetup(id, { rating: e.target.value === '' ? null : +e.target.value }); load() }}>
                <option value="">–</option>{[...Array(10)].map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select> /10</label>
              <span className="wr">Winrate {wr === null ? '–' : wr + '%'}</span><span>History {n}</span>
            </div>
            <div className="box grow"><textarea placeholder="Комментарий: как устроена гипотеза" defaultValue={s.comment || ''} onBlur={(e) => api.updateSetup(id, { comment: e.target.value })} /></div>
          </div>
        </div>
        <div className="histhead"><h3>История</h3><button className="gray" onClick={() => setAdding(true)}>+ Добавить</button></div>
        <History obs={s.observations} urls={urls} onOpen={setView} />
      </div>
      {adding && <ObsForm setupId={id} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load() }} />}
      {view && <ObsView o={view} urls={urls} onClose={() => setView(null)} />}
      {crop && shot && <CropEditor src={urls[shot.path_full]} onClose={() => setCrop(false)} onApply={applyCrop} />}
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
      setUrls(await api.signedUrls(s.flatMap((x) => x.screenshots.map((y) => y.path_full))))
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
