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
  const editRef    = useRef<HTMLInputElement>(null)
  const redirected = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!redirected.current) { redirected.current = true; window.location.href = '/auth' }
        return
      }
      const sid   = localStorage.getItem('selected_store_id')
      const sname = localStorage.getItem('selected_store_name')
      if (!sid) { window.location.href = '/stores'; return }

      setUserId(session.user.id)
      setStoreId(sid)
      setStoreName(sname || 'Store')

      const { data } = await supabase
        .from('ticket_values').select('*')
        .eq('user_id', session.user.id)
        .eq('store_id', sid)
        .order('ticket_number')
      setTickets(data || [])
      setLoading(false)
    })
  }, [])

  function showFlash(msg: string) {
    setFlash(msg); setTimeout(() => setFlash(''), 2000)
  }

  async function handleGenerate() {
    const last = parseInt(lastTicket)
    const val  = parseFloat(defaultVal)
    if (!last || last < 1 || isNaN(val) || val < 0 || !userId || !storeId) return
    setGenerating(true)

    const rows = Array.from({ length: last }, (_, i) => ({
      ticket_number: i + 1,
      value: val,
      user_id: userId,
      store_id: storeId,
    }))

    for (let i = 0; i < rows.length; i += 50) {
      await supabase.from('ticket_values').upsert(rows.slice(i, i + 50))
    }

    const { data } = await supabase
      .from('ticket_values').select('*')
      .eq('user_id', userId).eq('store_id', storeId)
      .order('ticket_number')

    setTickets(data || [])
    setShowSetup(false)
    setLastTicket('')
    setDefaultVal('')
    setGenerating(false)
    showFlash(`✓ ${last} tickets created`)
  }

  async function addTicket() {
    const num = parseInt(newNum)
    const val = parseFloat(newVal)
    if (!num || isNaN(num) || isNaN(val) || val < 0 || !userId || !storeId) return
    setAdding(true)

    await supabase.from('ticket_values').upsert({
      ticket_number: num, value: val,
      user_id: userId, store_id: storeId,
    })

    setTickets(prev => {
      const rest = prev.filter(t => t.ticket_number !== num)
      return [...rest, { ticket_number: num, value: val }].sort((a, b) => a.ticket_number - b.ticket_number)
    })
    setNewNum(''); setNewVal('')
    setAdding(false)
    showFlash(`✓ Ticket #${num} = $${val.toFixed(2)}`)
  }

  function startEdit(t: TV) {
    setEditingNum(t.ticket_number)
    setDraft(String(t.value))
    setTimeout(() => { editRef.current?.focus(); editRef.current?.select() }, 30)
  }

  async function commitEdit(ticket_number: number) {
    const value = parseFloat(draft)
    if (draft === '' || isNaN(value) || value < 0 || !userId || !storeId) { setEditingNum(null); return }
    setSaving(true)
    await supabase.from('ticket_values').upsert({
      ticket_number, value, user_id: userId, store_id: storeId,
    })
    setTickets(prev => prev.map(t => t.ticket_number === ticket_number ? { ...t, value } : t))
    setEditingNum(null)
    setSaving(false)
    showFlash('✓ Saved')
  }

  async function deleteTicket(ticket_number: number) {
    if (!confirm(`Delete ticket #${ticket_number}?`)) return
    await supabase.from('ticket_values').delete()
      .eq('ticket_number', ticket_number)
      .eq('user_id', userId!)
      .eq('store_id', storeId!)
    setTickets(prev => prev.filter(t => t.ticket_number !== ticket_number))
    showFlash('Deleted')
  }

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('selected_store_id')
    localStorage.removeItem('selected_store_name')
    window.location.href = '/auth'
  }

  const filtered = tickets.filter(t =>
    search === '' || String(t.ticket_number).includes(search) || String(t.value).includes(search)
  )

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>
      <header className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/?noredirect=1" style={{ color: 'var(--ink)', textDecoration: 'none', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</a>
          <div>
            <div className="hdr-title">TICKET VALUES</div>
            <div className="hdr-sub">{storeName} · {tickets.length} TICKETS</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {flash && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{flash}</span>}
          <button onClick={signOut} className="btn btn-sm btn-ghost">OUT</button>
        </div>
      </header>

      {/* Quick Setup */}
      <div style={{ borderBottom: '2px solid var(--ink)', background: 'var(--warm)' }}>
        <button
          onClick={() => setShowSetup(v => !v)}
          style={{ width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink)' }}
        >
          <span>⚡ Quick Setup — Generate All Tickets</span>
          <span>{showSetup ? '▾' : '▸'}</span>
        </button>
        {showSetup && (
          <div style={{ padding: '0 16px 20px' }}>
            <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 16, lineHeight: 1.6 }}>
              Enter the last ticket number and a starting value. Creates tickets 1 through that number. You can edit individual values after. Use $0 for finished/unsold books.
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>Last Ticket #</div>
                <input
                  type="number" inputMode="numeric" placeholder="e.g. 69"
                  value={lastTicket} onChange={e => setLastTicket(e.target.value)}
                  style={{ width: '100%', padding: '8px 0', fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 'bold', border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>Default Value ($)</div>
                <input
                  type="number" inputMode="decimal" step="0.01" placeholder="e.g. 1.00"
                  value={defaultVal} onChange={e => setDefaultVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleGenerate() }}
                  style={{ width: '100%', padding: '8px 0', fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 'bold', border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
                />
              </div>
            </div>
            <button
              className="btn btn-red" onClick={handleGenerate}
              disabled={generating || !lastTicket || defaultVal === ''}
              style={{ width: '100%', padding: '12px', fontSize: 13 }}
            >
              {generating ? 'GENERATING...' : `GENERATE TICKETS 1–${lastTicket || '?'}`}
            </button>
            {tickets.length > 0 && (
              <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 8, textAlign: 'center' }}>
                ⚠ This will overwrite existing tickets with the same numbers
              </p>
            )}
          </div>
        )}
      </div>

      {/* Add single ticket */}
      <div style={{ padding: '14px 16px 16px', borderBottom: '1px solid var(--line-dk)', background: 'var(--paper)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>
          Add / Update Single Ticket
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 10 }}>
          Set value to $0 for finished books with no remaining stock.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--ink-faint)', marginBottom: 4, letterSpacing: '.06em', textTransform: 'uppercase' }}>Ticket #</div>
            <input
              type="number" inputMode="numeric" placeholder="e.g. 15"
              value={newNum} onChange={e => setNewNum(e.target.value)}
              onKeyDown={e => { if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); document.getElementById('newval')?.focus() } }}
              style={{ width: '100%', padding: '6px 0', fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 'bold', border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--ink-faint)', marginBottom: 4, letterSpacing: '.06em', textTransform: 'uppercase' }}>Value ($) — 0 = finished</div>
            <input
              id="newval"
              type="number" inputMode="decimal" step="0.01" placeholder="e.g. 10"
              value={newVal} onChange={e => setNewVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTicket() }}
              style={{ width: '100%', padding: '6px 0', fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 'bold', border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
            />
          </div>
          <button
            className="btn btn-red" onClick={addTicket}
            disabled={adding || !newNum || newVal === ''}
            style={{ padding: '10px 14px', marginBottom: 2, fontSize: 13, flexShrink: 0 }}
          >
            {adding ? '...' : 'SAVE'}
          </button>
        </div>
      </div>

      {/* Search */}
      {tickets.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--line)', background: 'var(--paper)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--ink-faint)', fontSize: 14 }}>🔍</span>
          <input
            type="search" placeholder="Search by ticket # or value..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink)', padding: '4px 0' }}
          />
          {search && <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 16 }}>✕</button>}
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{filtered.length}/{tickets.length}</span>
        </div>
      )}

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <div className="empty" style={{ marginTop: 40 }}>
          — NO TICKETS YET —<br />
          <span style={{ fontSize: 11, marginTop: 8, display: 'block' }}>Use Quick Setup above or add one by one</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">— NO RESULTS —</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--warm)' }}>
              <th style={{ textAlign: 'left', padding: '6px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', borderBottom: '1px solid var(--line-dk)' }}>Ticket #</th>
              <th style={{ textAlign: 'right', padding: '6px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', borderBottom: '1px solid var(--line-dk)' }}>Value — tap to edit</th>
              <th style={{ width: 36, borderBottom: '1px solid var(--line-dk)' }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.ticket_number} style={{ borderBottom: '1px solid var(--line)', background: t.value === 0 ? 'var(--warm)' : undefined }}>
                <td style={{ padding: '0 14px', height: 48 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--ink-mid)' }}>#{t.ticket_number}</span>
                    {t.value === 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'var(--ink-faint)', background: 'var(--line)', padding: '2px 6px' }}>FINISHED</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '0 10px', textAlign: 'right' }}>
                  {editingNum === t.ticket_number ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--ink-faint)' }}>$</span>
                      <input
                        ref={editRef} type="number" inputMode="decimal"
                        value={draft} onChange={e => setDraft(e.target.value)}
                        onBlur={() => commitEdit(t.ticket_number)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(t.ticket_number); if (e.key === 'Escape') setEditingNum(null) }}
                        style={{ width: 72, height: 38, fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, textAlign: 'right', border: 'none', borderBottom: '2px solid var(--red)', background: '#fffce8', outline: 'none', color: 'var(--ink)', padding: '0 4px' }}
                      />
                      <button onMouseDown={e => { e.preventDefault(); commitEdit(t.ticket_number) }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--green)', fontWeight: 700, fontSize: 20, padding: '0 4px', lineHeight: 1 }}>✓</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(t)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: t.value === 0 ? 'var(--ink-faint)' : 'var(--green)', padding: '8px 10px', borderBottom: '1px dashed var(--line-dk)', minWidth: 80, textAlign: 'right' }}>
                      ${t.value % 1 === 0 ? t.value : t.value.toFixed(2)}
                    </button>
                  )}
                </td>
                <td style={{ textAlign: 'center', padding: '0 4px' }}>
                  <button onClick={() => deleteTicket(t.ticket_number)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 18, padding: '6px', lineHeight: 1, minWidth: 32, minHeight: 32 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}