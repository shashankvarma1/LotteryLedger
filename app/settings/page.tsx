'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type TV = { ticket_number: number; value: number; book_size: number }

function InlineEdit({ value, prefix, onSave, onEnter, color }: {
  value: number
  prefix?: string
  onSave: (v: number) => void
  onEnter?: () => void
  color?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const ref = useRef<HTMLInputElement>(null)

  function startEdit() {
    setEditing(true)
    setDraft(String(value))
    setTimeout(() => { ref.current?.focus(); ref.current?.select() }, 20)
  }

  function commit() {
    setEditing(false)
    const parsed = parseFloat(draft)
    if (!isNaN(parsed) && parsed >= 0) onSave(parsed)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        type="number" inputMode="decimal"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); setTimeout(() => onEnter?.(), 60) }
          if (e.key === 'Escape') setEditing(false)
        }}
        style={{
          width: '100%', height: 48, padding: '0 10px',
          fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700,
          textAlign: 'right', border: 'none',
          background: 'rgba(240,165,0,0.08)',
          outline: '2px solid var(--gold)',
          color: 'var(--ink)', borderRadius: 0,
        }}
      />
    )
  }

  return (
    <div onClick={startEdit} style={{
      height: 48, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      padding: '0 10px', cursor: 'text',
      fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700,
      color: color || 'var(--ink)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {prefix && <span style={{ fontSize: 12, fontWeight: 400, opacity: .6 }}>{prefix}</span>}
        {value % 1 === 0 ? value : value.toFixed(2)}
        <span style={{ fontSize: 10, color: 'var(--ink-ghost)', marginLeft: 2 }}>✎</span>
      </span>
    </div>
  )
}

export default function SettingsPage() {
  const [tickets,    setTickets]    = useState<TV[]>([])
  const [loading,    setLoading]    = useState(true)
  const [ownerUserId,setOwnerUserId]= useState<string | null>(null) // store owner's user_id
  const [storeId,    setStoreId]    = useState<string | null>(null)
  const [storeName,  setStoreName]  = useState('')
  const [flash,      setFlash]      = useState('')
  const [showSetup,  setShowSetup]  = useState(false)
  const [lastTicket, setLastTicket] = useState('')
  const [defaultVal, setDefaultVal] = useState('')
  const [defaultSize,setDefaultSize]= useState('100')
  const [generating, setGenerating] = useState(false)
  const [newNum,     setNewNum]     = useState('')
  const [newVal,     setNewVal]     = useState('')
  const [newSize,    setNewSize]    = useState('100')
  const [adding,     setAdding]     = useState(false)
  const [search,     setSearch]     = useState('')
  const [lightMode,  setLightMode]  = useState(false)
  const [largeFonts, setLargeFonts] = useState(false)

  const valueCellRefs    = useRef<(HTMLDivElement | null)[]>([])
  const bookSizeCellRefs = useRef<(HTMLDivElement | null)[]>([])
  const redirected = useRef(false)

  useEffect(() => {
    const lm = localStorage.getItem('light_mode') === 'true'
    const lf = localStorage.getItem('large_fonts') === 'true'
    setLightMode(lm); setLargeFonts(lf)
    if (lm) document.body.classList.add('light')
    if (lf) document.body.classList.add('text-lg')

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!redirected.current) { redirected.current = true; window.location.href = '/auth' }
        return
      }
      const sid   = localStorage.getItem('selected_store_id')
      const sname = localStorage.getItem('selected_store_name')
      if (!sid) { window.location.href = '/stores'; return }
      setStoreId(sid)
      setStoreName(sname || 'Store')

      // Get store owner's user_id — ticket_values are stored under owner's user_id
      const { data: storeData } = await supabase
        .from('stores').select('user_id').eq('id', sid).single()
      const ownerId = storeData?.user_id || session.user.id
      setOwnerUserId(ownerId)

      // Load tickets by store_id only (works for both owner and shared users)
      const { data } = await supabase.from('ticket_values').select('*')
        .eq('store_id', sid).order('ticket_number')
      setTickets(data || [])
      setLoading(false)
    })
  }, [])

  function toggleLightMode() {
    const next = !lightMode; setLightMode(next)
    localStorage.setItem('light_mode', String(next))
    document.body.classList.toggle('light', next)
  }

  function toggleLargeFonts() {
    const next = !largeFonts; setLargeFonts(next)
    localStorage.setItem('large_fonts', String(next))
    document.body.classList.toggle('text-lg', next)
  }

  function showFlash(msg: string) { setFlash(msg); setTimeout(() => setFlash(''), 2500) }

  const filtered = tickets.filter(t =>
    search === '' || String(t.ticket_number).includes(search) || String(t.value).includes(search)
  )

  async function saveField(ticket_number: number, field: 'value' | 'book_size', val: number) {
    if (!ownerUserId || !storeId) return
    const existing = tickets.find(t => t.ticket_number === ticket_number)
    if (!existing) return
    const updated = { ...existing, [field]: val }
    await supabase.from('ticket_values').upsert({
      ticket_number,
      value:     updated.value,
      book_size: updated.book_size,
      user_id:   ownerUserId,  // always use owner's user_id
      store_id:  storeId,
    })
    setTickets(prev => prev.map(t => t.ticket_number === ticket_number ? updated : t))
    if (navigator.vibrate) navigator.vibrate(30)
  }

  async function handleGenerate() {
    const last = parseInt(lastTicket)
    const val  = parseFloat(defaultVal)
    const size = parseInt(defaultSize) || 100
    if (!last || last < 1 || isNaN(val) || val < 0 || !ownerUserId || !storeId) return
    setGenerating(true)
    const rows = Array.from({ length: last }, (_, i) => ({
      ticket_number: i + 1, value: val, book_size: size,
      user_id: ownerUserId, store_id: storeId,
    }))
    for (let i = 0; i < rows.length; i += 50)
      await supabase.from('ticket_values').upsert(rows.slice(i, i + 50))
    const { data } = await supabase.from('ticket_values').select('*')
      .eq('store_id', storeId).order('ticket_number')
    setTickets(data || [])
    setShowSetup(false); setLastTicket(''); setDefaultVal(''); setDefaultSize('100')
    setGenerating(false)
    showFlash(`✓ ${last} tickets created`)
  }

  async function addTicket() {
    const num  = parseInt(newNum)
    const val  = parseFloat(newVal)
    const size = parseInt(newSize) || 100
    if (!num || isNaN(num) || isNaN(val) || val < 0 || !ownerUserId || !storeId) return
    setAdding(true)
    await supabase.from('ticket_values').upsert({
      ticket_number: num, value: val, book_size: size,
      user_id: ownerUserId, store_id: storeId,
    })
    setTickets(prev => {
      const rest = prev.filter(t => t.ticket_number !== num)
      return [...rest, { ticket_number: num, value: val, book_size: size }]
        .sort((a, b) => a.ticket_number - b.ticket_number)
    })
    setNewNum(''); setNewVal(''); setNewSize('100'); setAdding(false)
    showFlash(`✓ Ticket #${num} = $${val.toFixed(2)} (${size}/book)`)
  }

  async function deleteTicket(ticket_number: number) {
    if (!confirm(`Delete ticket #${ticket_number}?`)) return
    await supabase.from('ticket_values').delete()
      .eq('ticket_number', ticket_number)
      .eq('store_id', storeId!)
    setTickets(prev => prev.filter(t => t.ticket_number !== ticket_number))
    showFlash('Deleted')
  }

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('selected_store_id'); localStorage.removeItem('selected_store_name')
    window.location.href = '/auth'
  }

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>
      <header className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/?noredirect=1" style={{ color: 'var(--ink-faint)', textDecoration: 'none', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</a>
          <div>
            <div className="hdr-title">TICKET VALUES</div>
            <div className="hdr-sub">{storeName} · {tickets.length} TICKETS</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {flash && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--emerald)', fontWeight: 600 }}>{flash}</span>}
          <button onClick={signOut} className="btn btn-ghost btn-sm">Out</button>
        </div>
      </header>

      {/* Display preferences */}
      <div style={{ margin: '18px 18px 0', background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, color: 'var(--ink)' }}>Display</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Light Mode</div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>Better in bright environments</div>
            </div>
            <button onClick={toggleLightMode} style={{ width: 48, height: 28, borderRadius: 100, border: 'none', cursor: 'pointer', background: lightMode ? 'var(--emerald)' : 'var(--line-dk)', position: 'relative', transition: 'background .2s' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: lightMode ? 23 : 3, transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Large Text</div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>Bigger numbers in the ledger</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => { if (largeFonts) toggleLargeFonts() }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line-dk)', background: !largeFonts ? 'var(--gold)' : 'var(--card)', color: !largeFonts ? 'var(--navy)' : 'var(--ink-faint)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>A</button>
              <button onClick={() => { if (!largeFonts) toggleLargeFonts() }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line-dk)', background: largeFonts ? 'var(--gold)' : 'var(--card)', color: largeFonts ? 'var(--navy)' : 'var(--ink-faint)', fontWeight: 700, fontSize: 18, cursor: 'pointer' }}>A</button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Setup */}
      <div style={{ margin: '12px 18px 0', background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, overflow: 'hidden' }}>
        <button onClick={() => setShowSetup(v => !v)}
          style={{ width: '100%', padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--gold)', fontWeight: 600, fontSize: 13 }}>
          <span>⚡ Quick Setup — Generate All Tickets</span>
          <span style={{ color: 'var(--ink-faint)' }}>{showSetup ? '▾' : '▸'}</span>
        </button>
        {showSetup && (
          <div style={{ padding: '0 18px 20px', borderTop: '1px solid var(--line)' }}>
            <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: '14px 0', lineHeight: 1.6 }}>
              Creates tickets 1 through the last number. Edit individual values after.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label className="field-label">Last Ticket #</label>
                <input type="number" inputMode="numeric" placeholder="69" value={lastTicket}
                  onChange={e => setLastTicket(e.target.value)} className="field-input" />
              </div>
              <div>
                <label className="field-label">Value ($)</label>
                <input type="number" inputMode="decimal" step="0.01" placeholder="1.00" value={defaultVal}
                  onChange={e => setDefaultVal(e.target.value)} className="field-input" />
              </div>
              <div>
                <label className="field-label">Tickets/Book</label>
                <input type="number" inputMode="numeric" placeholder="100" value={defaultSize}
                  onChange={e => setDefaultSize(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleGenerate() }}
                  className="field-input" />
              </div>
            </div>
            <button className="btn btn-gold" onClick={handleGenerate}
              disabled={generating || !lastTicket || defaultVal === ''}
              style={{ width: '100%', padding: '12px', fontSize: 13 }}>
              {generating ? 'Generating...' : `Generate Tickets 1–${lastTicket || '?'}`}
            </button>
          </div>
        )}
      </div>

      {/* Add single ticket */}
      <div style={{ margin: '12px 18px 0', background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, padding: '18px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--ink)' }}>Add / Update Ticket</div>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 14 }}>Set $0 for finished books.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <label className="field-label">Ticket #</label>
            <input type="number" inputMode="numeric" placeholder="15" value={newNum}
              onChange={e => setNewNum(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); document.getElementById('newval')?.focus() } }}
              className="field-input" />
          </div>
          <div>
            <label className="field-label">Value ($)</label>
            <input id="newval" type="number" inputMode="decimal" step="0.01" placeholder="10" value={newVal}
              onChange={e => setNewVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); document.getElementById('newsize')?.focus() } }}
              className="field-input" />
          </div>
          <div>
            <label className="field-label">Tickets/Book</label>
            <input id="newsize" type="number" inputMode="numeric" placeholder="100" value={newSize}
              onChange={e => setNewSize(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTicket() }}
              className="field-input" />
          </div>
          <button className="btn btn-gold" onClick={addTicket}
            disabled={adding || !newNum || newVal === ''}
            style={{ padding: '10px 16px', flexShrink: 0, marginBottom: 1 }}>
            {adding ? '...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Search + ticket list */}
      {tickets.length > 0 && (
        <div style={{ margin: '12px 18px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
            <span style={{ color: 'var(--ink-faint)' }}>🔍</span>
            <input type="search" placeholder="Search ticket # or value..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--ink)' }} />
            {search && <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 16 }}>✕</button>}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{filtered.length}/{tickets.length}</span>
          </div>

          <div style={{ background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, overflow: 'hidden' }}>
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 40px', background: 'var(--navy-mid)', borderBottom: '1px solid var(--line-dk)', padding: '0 12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', height: 36, display: 'flex', alignItems: 'center' }}>Ticket</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10 }}>Value</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10 }}>Tickets/Book</div>
              <div />
            </div>

            {filtered.map((t, i) => (
              <div key={t.ticket_number}
                style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 40px', alignItems: 'center', borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none', minHeight: 48 }}>

                {/* Ticket number */}
                <div style={{ paddingLeft: 14, display: 'flex', alignItems: 'center', gap: 8, height: 48 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: t.value === 0 ? 'var(--ink-faint)' : 'var(--ink)' }}>
                    #{t.ticket_number}
                  </span>
                  {t.value === 0 && <span className="badge badge-muted" style={{ fontSize: 9 }}>DONE</span>}
                </div>

                {/* Value — inline tap to edit */}
                <div ref={el => { valueCellRefs.current[i] = el }}>
                  <InlineEdit
                    value={t.value}
                    prefix="$"
                    color={t.value === 0 ? 'var(--ink-faint)' : 'var(--gold)'}
                    onSave={v => saveField(t.ticket_number, 'value', v)}
                    onEnter={() => bookSizeCellRefs.current[i]?.click()}
                  />
                </div>

                {/* Book size — inline tap to edit */}
                <div ref={el => { bookSizeCellRefs.current[i] = el }}>
                  <InlineEdit
                    value={t.book_size ?? 100}
                    color="var(--sky)"
                    onSave={v => saveField(t.ticket_number, 'book_size', Math.max(1, Math.round(v)))}
                    onEnter={() => valueCellRefs.current[i + 1]?.click()}
                  />
                </div>

                {/* Delete */}
                <button onClick={() => deleteTicket(t.ticket_number)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-ghost)', fontSize: 18, width: 40, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ×
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--navy-mid)', borderRadius: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '.04em' }}>
            💡 Tap any value to edit · Enter jumps to next cell · Tap ✎ to re-edit
          </div>
        </div>
      )}

      {tickets.length === 0 && (
        <div className="empty" style={{ marginTop: 40 }}>
          — NO TICKETS YET —<br />
          <span style={{ fontSize: 11, marginTop: 8, display: 'block' }}>Use Quick Setup above or add one by one</span>
        </div>
      )}
    </div>
  )
}