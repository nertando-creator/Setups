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

// Картинка вписывается в фиксированную область; обрезка нон-деструктивная (crop в setups.metrics)
function Cropped({ src, crop }) {
  if (!crop) return <div className="fit"><img className="fitimg" src={src} /></div>
  const A = (crop.w * crop.ar) / crop.h
  return (
    <div className="fit">
      <div className="cropbox" style={{ aspectRatio: A, width: `min(100cqw, ${A * 100}cqh)` }}>
        <img src={src} style={{ position: 'absolute', width: 100 / crop.w + '%', left: (-crop.x / crop.w) * 100 + '%', top: (-crop.y / crop.h) * 100 + '%' }} />
      </div>
    </div>
  )
}

const CROP_ASPECT = 1.6
function CropEditor({ src, initial, onApply, onClose }) {
  const [r, setR] = useState(null)
  const [ar, setAr] = useState(1)
  const [free, setFree] = useState(false)
  const box = useRef(null)
  const drag = useRef(null)
  const A = CROP_ASPECT
  const defRect = (a) => {
    let w = 1, h = a / A
    if (h > 1) { h = 1; w = A / a }
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
  }
  const pos = (e) => {
    const b = box.current.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }
  }
  const start = (e, mode) => { e.preventDefault(); drag.current = { mode, p0: pos(e), r0: r }; box.current.setPointerCapture(e.pointerId) }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    const p = pos(e), r0 = d.r0
    if (d.mode === 'move') {
      setR({ ...r0, x: Math.min(1 - r0.w, Math.max(0, r0.x + p.x - d.p0.x)), y: Math.min(1 - r0.h, Math.max(0, r0.y + p.y - d.p0.y)) })
      return
    }
    const sx = d.mode.includes('w') ? -1 : 1, sy = d.mode.includes('n') ? -1 : 1
    const o = { x: sx < 0 ? r0.x + r0.w : r0.x, y: sy < 0 ? r0.y + r0.h : r0.y }
    const maxW = sx > 0 ? 1 - o.x : o.x, maxH = sy > 0 ? 1 - o.y : o.y
    let w = Math.min(maxW, Math.max(0.05, (p.x - o.x) * sx)), h = Math.min(maxH, Math.max(0.05, (p.y - o.y) * sy))
    if (!free) {
      const hw = (w * ar) / A
      if (hw <= maxH) h = hw
      else { h = maxH; w = (h * A) / ar }
    }
    setR({ x: sx > 0 ? o.x : o.x - w, y: sy > 0 ? o.y : o.y - h, w, h })
  }
  return (
    <div className="overlay top3" onClick={onClose}>
      <div className="modal cropmodal" onClick={(e) => e.stopPropagation()}>
        <p className="muted">Двигай рамку и тяни за уголки. Оригинал сохраняется, обрезку можно сбросить.</p>
        <div className="cropedit" ref={box} onPointerMove={move} onPointerUp={() => (drag.current = null)}>
          <img src={src} draggable={false} onLoad={(e) => { const a = e.target.naturalWidth / e.target.naturalHeight; setAr(a); setR(initial ? { x: initial.x, y: initial.y, w: initial.w, h: initial.h } : defRect(a)) }} />
          {r && (
            <div className="sel" style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' }} onPointerDown={(e) => start(e, 'move')}>
              {['nw', 'ne', 'sw', 'se'].map((c) => <i key={c} className={'hd ' + c} onPointerDown={(e) => { e.stopPropagation(); start(e, c) }} />)}
            </div>
          )}
        </div>
        <div className="row">
          <label className="muted"><input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> Свободная пропорция</label>
          <button onClick={() => setR(defRect(ar))}>Рамка по умолчанию</button>
          <button onClick={() => onApply(null)}>Вернуть оригинал</button>
          <button onClick={onClose}>Отмена</button>
          <button className="primary" disabled={!r} onClick={() => onApply({ ...r, ar })}>Готово</button>
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
        <div className="fgrid">
          <label><b>Монета</b><input placeholder="BTC" value={f.coin} onChange={(e) => set('coin', e.target.value)} /></label>
          <label><b>Направление</b>
            <select style={{ color: f.direction === 'long' ? GREEN : f.direction === 'short' ? RED : undefined }} value={f.direction} onChange={(e) => set('direction', e.target.value)}>
              <option value="">–</option><option value="long">Long</option><option value="short">Short</option></select></label>
          <label><b>ТФ</b>
            <select value={f.timeframe} onChange={(e) => set('timeframe', e.target.value)}><option value="">–</option>{TFS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label><b>Результат</b>
            <select style={{ color: f.result === 'success' ? GREEN : f.result === 'fail' ? RED : f.result === 'unclear' ? '#c98a3d' : undefined }} value={f.result} onChange={(e) => set('result', e.target.value)}>
              <option value="">–</option>{Object.entries(RES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><b>Фаза</b>
            <select value={f.phase} onChange={(e) => set('phase', e.target.value)}><option value="">–</option>{Object.entries(PH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><b>День</b>
            <select value={f.day} onChange={(e) => set('day', +e.target.value)}>{DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>
          <label><b>Время</b><input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} /></label>
        </div>
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

function InlineInput({ initial = '', placeholder, onSubmit, onCancel }) {
  const [v, setV] = useState(initial)
  return (
    <input autoFocus className="inline" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) onSubmit(v.trim()); if (e.key === 'Escape') onCancel() }} onBlur={onCancel} />
  )
}

function Sidebar({ folders, setups, selId, onSelect, refresh, width }) {
  const [col, setCol] = useState({})
  const [edit, setEdit] = useState(null)
  const [menu, setMenu] = useState(null)
  const close = () => setMenu(null)
  const run = async (fn) => { try { await fn() } catch (x) { alert(x.message) } }
  const submit = async (name) => {
    const e = edit; setEdit(null)
    await run(async () => {
      if (e.kind === 'new-setup') { const s = await api.createSetupNamed(name, e.folder || null); await refresh(s.id) }
      else if (e.kind === 'new-folder') { await api.createFolder(name); await refresh() }
      else if (e.kind === 'ren-setup') { await api.updateSetup(e.id, { name }); await refresh() }
      else if (e.kind === 'ren-folder') { await api.renameFolder(e.id, name); await refresh() }
    })
  }
  const act = (fn) => { close(); run(async () => { await fn(); await refresh() }) }
  const box = (items) => (
    <>
      <div className="backdrop" onClick={(e) => { e.stopPropagation(); close() }} />
      <div className="menu" onClick={(e) => e.stopPropagation()}>{items}</div>
    </>
  )
  const input = (initial, placeholder) => <div className="trow"><InlineInput initial={initial} placeholder={placeholder} onSubmit={submit} onCancel={() => setEdit(null)} /></div>
  const plusRow = (folder) => (
    <>
      {edit?.kind === 'new-setup' && (edit.folder || null) === folder && input('', 'Название сетапа')}
      <div className="trow plus" onClick={() => setEdit({ kind: 'new-setup', folder })}>+ Создать</div>
    </>
  )
  const setupRow = (s) => {
    if (edit?.kind === 'ren-setup' && edit.id === s.id) return <div key={s.id}>{input(s.name, 'Название')}</div>
    return (
      <div key={s.id} className={'trow item' + (s.id === selId ? ' sel' : '')} onClick={() => onSelect(s.id)}>
        <span className="tname">{s.name || 'Без названия'}</span>
        <button className="dots" onClick={(e) => { e.stopPropagation(); setMenu({ k: 's', id: s.id }) }}>⋯</button>
        {menu?.k === 's' && menu.id === s.id && box(
          <>
            <div className="opt" onClick={() => { setEdit({ kind: 'ren-setup', id: s.id }); close() }}>Изменить</div>
            <div className="opt danger" onClick={() => { if (confirm(`Удалить сетап «${s.name || 'Без названия'}» и всю его историю?`)) act(() => api.deleteSetup(s.id)) }}>Удалить</div>
          </>
        )}
      </div>
    )
  }
  const folderRow = (f) => (
    <div key={f.id}>
      {edit?.kind === 'ren-folder' && edit.id === f.id ? input(f.name, 'Название папки') : (
        <div className="trow folder" onClick={() => setCol((c) => ({ ...c, [f.id]: !c[f.id] }))}>
          <span className="chev">{col[f.id] ? '▸' : '▾'}</span><span className="tname">{f.name}</span>
          <button className="dots" onClick={(e) => { e.stopPropagation(); setMenu({ k: 'f', id: f.id }) }}>⋯</button>
          {menu?.k === 'f' && menu.id === f.id && box(
            <>
              <div className="opt" onClick={() => { setEdit({ kind: 'ren-folder', id: f.id }); close() }}>Изменить</div>
              <div className="opt danger" onClick={() => { if (confirm('Удалить папку? Сетапы из неё останутся в списке без папки.')) act(() => api.deleteFolder(f.id)) }}>Удалить</div>
            </>
          )}
        </div>
      )}
      {!col[f.id] && <div className="children">{setups.filter((x) => x.folder_id === f.id).map(setupRow)}{plusRow(f.id)}</div>}
    </div>
  )
  return (
    <div className="side" style={{ width }}>
      <div className="sidehead"><b>Сетапы</b><button className="link" onClick={() => supabase.auth.signOut()}>Выйти</button></div>
      <div className="tree">
        {folders.map(folderRow)}
        {setups.filter((x) => !x.folder_id).map(setupRow)}
        {plusRow(null)}
        {edit?.kind === 'new-folder' && input('', 'Название папки')}
        <div className="trow plus root" onClick={() => setEdit({ kind: 'new-folder' })}>+ Папка</div>
      </div>
    </div>
  )
}

function Workspace({ id, factors, setFactors, onDeleted }) {
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
  const blocked = useRef(true)
  blocked.current = !s || s.screenshots.length > 0 || adding || !!view
  const addShot = useCallback(async (file) => {
    if (!file || blocked.current) return
    await api.addSetupShot(id, await processImage(file)); load()
  }, [id, load])
  usePaste(addShot)
  if (!s) return <p className="muted">{err || 'Загрузка…'}</p>
  const sel = s.setup_factors.map((x) => x.factor_id)
  const { wr, n } = stats(s)
  const shot = [...s.screenshots].sort((a, b) => a.sort_order - b.sort_order)[0]
  const toggle = async (fid) => { await api.toggleFactor(id, fid, !sel.includes(fid)); load() }
  const onAdd = async (nm) => { const f = await api.addFactor(nm); setFactors((x) => [...x, f]); await api.toggleFactor(id, f.id, true); load() }
  const del = async () => { if (confirm('Уверен, что хочешь удалить сетап и всю его историю?')) { await api.deleteSetup(id); onDeleted() } }
  const applyCrop = async (c) => { const m = { ...(s.metrics || {}) }; if (c) m.crop = c; else delete m.crop; await api.updateSetup(id, { metrics: m }); setCrop(false); load() }
  return (
    <div className="ws">
      <div className="wtop">
        <div className="imgwrap">
          {shot ? (urls[shot.path_full] && <Cropped src={urls[shot.path_full]} crop={s.metrics?.crop} />)
            : <Slot img={null} onFile={addShot} hint="Ctrl+V · перетащить · нажать для выбора скрина" />}
          <button className="ico tl" title="Удалить сетап" onClick={del}>🗑</button>
          {shot && <button className="ico tr" title="Обрезать" onClick={() => setCrop(true)}>✂</button>}
        </div>
        <div className="desc">
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
      {adding && <ObsForm setupId={id} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load() }} />}
      {view && <ObsView o={view} urls={urls} onClose={() => setView(null)} />}
      {crop && shot && <CropEditor src={urls[shot.path_full]} initial={s.metrics?.crop} onClose={() => setCrop(false)} onApply={applyCrop} />}
    </div>
  )
}

function Main() {
  const [setups, setSetups] = useState([])
  const [folders, setFolders] = useState([])
  const [factors, setFactors] = useState([])
  const [sel, setSel] = useState(localStorage.getItem('lastSetup'))
  const [err, setErr] = useState('')
  const [sw, setSw] = useState(() => +localStorage.getItem('sideW') || 0.3)
  const swRef = useRef(sw); swRef.current = sw
  const drag = useRef(false)
  useEffect(() => {
    const mv = (e) => { if (drag.current) setSw(Math.min(0.45, Math.max(0.2, e.clientX / window.innerWidth))) }
    const up = () => { if (drag.current) { drag.current = false; document.body.style.userSelect = ''; localStorage.setItem('sideW', swRef.current) } }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
  }, [])
  const select = useCallback((id) => { setSel(id); if (id) localStorage.setItem('lastSetup', id) }, [])
  const refresh = useCallback(async (selectId) => {
    try {
      const [f, s, fo] = await Promise.all([api.listFactors(), api.listSetups(), api.listFolders()])
      setFactors(f); setSetups(s); setFolders(fo); setErr('')
      if (selectId) select(selectId)
      else setSel((cur) => (cur && !s.some((x) => x.id === cur) ? null : cur))
    } catch (e) { setErr(e.message) }
  }, [select])
  useEffect(() => { refresh() }, [refresh])
  return (
    <div className="shell">
      <Sidebar width={sw * 100 + '%'} folders={folders} setups={setups} selId={sel} onSelect={select} refresh={refresh} />
      <div className="resizer" onPointerDown={() => { drag.current = true; document.body.style.userSelect = 'none' }} />
      <div className="work">
        {err && <p className="err">{err}</p>}
        {sel ? <Workspace key={sel} id={sel} factors={factors} setFactors={setFactors} onDeleted={() => { setSel(null); refresh() }} />
          : <p className="muted">Выбери сетап слева или создай новый.</p>}
      </div>
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
