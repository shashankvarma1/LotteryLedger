'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type TV = { ticket_number: number; value: number }

export default function SettingsPage() {
  const [tickets,    setTickets]    = useState<TV[]>([])
  const [loading,    setLoading]    = useState(true)
  const [userId,     setUserId]     = useState<string | null>(null)
  const [storeId,    setStoreId]    = useState<string | null>(null)
  const [storeName,  setStoreName]  = useState('')
  const [flash,      setFlash]      = useState('')
  const [editingNum, setEditingNum] = useState<number | null>(null)
  const [draft,      setDraft]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [showSetup,  setShowSetup]  = useState(false)
  const [lastTicket, setLastTicket] = useState('')
  const [defaultVal, setDefaultVal] = useState('')
  const [generating, setGenerating] = useState(false)
  const [newNum,     setNewNum]     = useState('')
  const [newVal,     setNewVal]     = useState('')
  const [adding,     setAdding]     = useState(false)
  const [search,     setSearch]     = useState('')
  const [lightMode,  setLightMode]  = useState(false)
  const [largeFonts, setLargeFonts] = useState(false)
  const editRef    = useRef<HTMLInputElement>(null)
  const redirected = useRef(false)

  useEffect(() => {
    // Load display preferences
    const lm = localStorage.getItem('light_mode') === 'true'
    const lf = localStorage.getItem('large_fonts') === 'true'
    setLightMode(lm)
    setLargeFonts(lf)
    if (lm) document.body.classList.add('light')
    if (lf) document.body.classList.add('text-lg')

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { if (!redirected.current) { redirected.current = true; window.location.href = '/auth' } return }
      const sid   = localStorage.getItem('selected_store_id')
      const sname = localStorage.getItem('selected_store_name')
      if (!sid) { window.location.href = '/stores'; return }
      setUserId(session.user.id); setStoreId(sid); setStoreName(sname || 'Store')
      const { data } = await supabase.from('ticket_values').select('*')
        .eq('user_id', session.user.id).eq('store_id', sid).order('ticket_number')
      setTickets(data || []); setLoading(false)
    })
  }, [])

  function toggleLightMode() {
    const next = !lightMode
    setLightMode(next)
    localStorage.setItem('light_mode', String(next))
    document.body.classList.toggle('light', next)
  }

  function toggleLargeFonts() {
    const next = !largeFonts
    setLargeFonts(next)
    localStorage.setItem('large_fonts', String(next))
    document.body.classList.toggle('text-lg', next)
  }

  function showFlash(msg: string) { setFlash(msg); setTimeout(() => setFlash(''), 2000) }

  const filtered = tickets.filter(t =>
    search === '' || String(t.ticket_number).includes(search) || String(t.value).includes(search)
  )

  async function handleGenerate() {
    const last = parseInt(lastTicket)
    const val  = parseFloat(defaultVal)
    if (!last || last < 1 || isNaN(val) || val < 0 || !userId || !storeId) return
    setGenerating(true)
    const rows = Array.from({ length: last }, (_, i) => ({
      ticket_number: i + 1, value: val, user_id: userId, store_id: storeId,
    }))
    for (let i = 0; i < rows.length; i += 50) await supabase.from('ticket_values').upsert(rows.slice(i, i + 50))
    const { data } = await supabase.from('ticket_values').select('*').eq('user_id', userId).eq('store_id', storeId).order('ticket_number')
    setTickets(data || []); setShowSetup(false); setLastTicket(''); setDefaultVal(''); setGenerating(false)
    showFlash(`✓ ${last} tickets created`)
  }

  async function addTicket() {
    const num = parseInt(newNum); const val = parseFloat(newVal)
    if (!num || isNaN(num) || isNaN(val) || val < 0 || !userId || !storeId) return
    setAdding(true)
    await supabase.from('ticket_values').upsert({ ticket_number: num, value: val, user_id: userId, store_id: storeId })
    setTickets(prev => {
      const rest = prev.filter(t => t.ticket_number !== num)
      return [...rest, { ticket_number: num, value: val }].sort((a, b) => a.ticket_number - b.ticket_number)
    })
    setNewNum(''); setNewVal(''); setAdding(false)
    showFlash(`✓ Ticket #${num} = $${val.toFixed(2)}`)
  }

  function startEdit(t: TV) {
    setEditingNum(t.ticket_number); setDraft(String(t.value))
    setTimeout(() => { editRef.current?.focus(); editRef.current?.select() }, 30)
  }

  async function commitEdit(ticket_number: number, moveToNext = false) {
    const value = parseFloat(draft)
    if (draft === '' || isNaN(value) || value < 0 || !userId || !storeId) { setEditingNum(null); return }
    setSaving(true)
    await supabase.from('ticket_values').upsert({ ticket_number, value, user_id: userId, store_id: storeId })
    setTickets(prev => prev.map(t => t.ticket_number === ticket_number ? { ...t, value } : t))
    setEditingNum(null); setSaving(false); showFlash('✓ Saved')
    if (navigator.vibrate) navigator.vibrate(40)
    if (moveToNext) {
      const currentIdx = filtered.findIndex(t => t.ticket_number === ticket_number)
      const next = filtered[currentIdx + 1]
      if (next) {
        setTimeout(() => {
          setEditingNum(next.ticket_number); setDraft(String(next.value))
          setTimeout(() => { editRef.current?.focus(); editRef.current?.select() }, 30)
        }, 50)
      }
    }
  }

  async function deleteTicket(ticket_number: number) {
    if (!confirm(`Delete ticket #${ticket_number}?`)) return
    await supabase.from('ticket_values').delete()
      .eq('ticket_number', ticket_number).eq('user_id', userId!).eq('store_id', storeId!)
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
          {saving && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)' }}>saving...</span>}
          <button onClick={signOut} className="btn btn-ghost btn-sm">Out</button>
        </div>
      </header>

      {/* Display preferences */}
      <div style={{ margin: '18px 18px 0', background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, color: 'var(--ink)' }}>Display</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Light mode */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Light Mode</div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>Better in bright environments</div>
            </div>
            <button
              onClick={toggleLightMode}
              style={{
                width: 48, height: 28, borderRadius: 100, border: 'none', cursor: 'pointer',
                background: lightMode ? 'var(--emerald)' : 'var(--line-dk)',
                position: 'relative', transition: 'background .2s',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3,
                left: lightMode ? 23 : 3,
                transition: 'left .2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </button>
          </div>

          {/* Large fonts */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Large Text</div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>Bigger numbers in the ledger</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => { if (largeFonts) toggleLargeFonts() }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line-dk)', background: !largeFonts ? 'var(--gold)' : 'var(--card)', color: !largeFonts ? 'var(--navy)' : 'var(--ink-faint)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                A
              </button>
              <button
                onClick={() => { if (!largeFonts) toggleLargeFonts() }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line-dk)', background: largeFonts ? 'var(--gold)' : 'var(--card)', color: largeFonts ? 'var(--navy)' : 'var(--ink-faint)', fontWeight: 700, fontSize: 18, cursor: 'pointer' }}>
                A
              </button>
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
              Creates tickets 1 through the last number. Edit values after. Use $0 for finished books.
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">Last Ticket #</label>
                <input type="number" inputMode="numeric" placeholder="69" value={lastTicket}
                  onChange={e => setLastTicket(e.target.value)} className="field-input" />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">Default Value ($)</label>
                <input type="number" inputMode="decimal" step="0.01" placeholder="1.00" value={defaultVal}
                  onChange={e => setDefaultVal(e.target.value)}
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

      {/* Add single */}
      <div style={{ margin: '12px 18px 0', background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, padding: '18px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--ink)' }}>Add / Update Ticket</div>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 14 }}>Set $0 for finished books.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="field-label">Ticket #</label>
            <input type="number" inputMode="numeric" placeholder="15" value={newNum}
              onChange={e => setNewNum(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); document.getElementById('newval')?.focus() } }}
              className="field-input" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field-label">Value ($)</label>
            <input id="newval" type="number" inputMode="decimal" step="0.01" placeholder="10" value={newVal}
              onChange={e => setNewVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTicket() }}
              className="field-input" />
          </div>
          <button className="btn btn-gold" onClick={addTicket}
            disabled={adding || !newNum || newVal === ''}
            style={{ padding: '10px 16px', flexShrink: 0 }}>
            {adding ? '...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Search */}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', padding: '8px 14px', borderBottom: '1px solid var(--line-dk)', background: 'var(--navy-mid)' }}>
              <span className="field-label" style={{ marginBottom: 0 }}>Ticket #</span>
              <span className="field-label" style={{ marginBottom: 0, textAlign: 'right' }}>Value</span>
              <span />
            </div>
            {filtered.map((t, i) => (
              <div key={t.ticket_number} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', alignItems: 'center', borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none', minHeight: 50 }}>
                <div style={{ padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 500, color: t.value === 0 ? 'var(--ink-faint)' : 'var(--ink)' }}>
                    #{t.ticket_number}
                  </span>
                  {t.value === 0 && <span className="badge badge-muted">DONE</span>}
                </div>
                <div style={{ padding: '0 10px', textAlign: 'right' }}>
                  {editingNum === t.ticket_number ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>$</span>
                      <input ref={editRef} type="number" inputMode="decimal"
                        value={draft} onChange={e => setDraft(e.target.value)}
                        onBlur={() => commitEdit(t.ticket_number)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdit(t.ticket_number, true)
                          if (e.key === 'Escape') setEditingNum(null)
                        }}
                        style={{ width: 72, height: 38, fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, textAlign: 'right', border: 'none', borderRadius: 6, background: 'var(--navy-lt)', outline: '2px solid var(--gold)', color: 'var(--ink)', padding: '0 8px' }}
                      />
                      <button onMouseDown={e => { e.preventDefault(); commitEdit(t.ticket_number) }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--emerald)', fontSize: 20, padding: '0 4px' }}>✓</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(t)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: t.value === 0 ? 'var(--ink-faint)' : 'var(--gold)', padding: '8px 10px', borderRadius: 6 }}>
                      ${t.value % 1 === 0 ? t.value : t.value.toFixed(2)}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button onClick={() => deleteTicket(t.ticket_number)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-ghost)', fontSize: 18, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}>×</button>
                </div>
              </div>
            ))}
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