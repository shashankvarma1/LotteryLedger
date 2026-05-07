'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@/lib/supabase'

type SessionWithStats = Session & {
  book_count?:    number
  total_sold?:    number
  total_revenue?: number
}

function calcSoldWrapped(start: number, end: number, bookSize: number): number {
  if (start === end) return 0
  if (end > start)   return end - start
  return (bookSize - start) + end
}

function DeleteModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, color: 'var(--ink)' }}>Delete Session?</div>
        <div style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 24, lineHeight: 1.6 }}>
          This will permanently delete this session and all its book entries. This cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel}  className="btn btn-ghost" style={{ flex: 1, padding: '13px' }}>Cancel</button>
          <button onClick={onConfirm} className="btn btn-red"   style={{ flex: 1, padding: '13px' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const [sessions,  setSessions]  = useState<SessionWithStats[]>([])
  const [loading,   setLoading]   = useState(true)
  const [storeName, setStoreName] = useState('')
  const [search,    setSearch]    = useState('')
  const [deleteId,  setDeleteId]  = useState<string | null>(null)
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
      setStoreName(sname || 'Store')

      const { data: sessionList } = await supabase.from('sessions').select('*')
        .eq('user_id', session.user.id).eq('store_id', sid)
        .order('session_date', { ascending: false })

      if (!sessionList) { setLoading(false); return }

      // Load ticket values once
      const { data: tvs } = await supabase.from('ticket_values').select('*')
        .eq('user_id', session.user.id).eq('store_id', sid).order('ticket_number')

      const enriched = await Promise.all(sessionList.map(async (s: Session) => {
        const { data: books } = await supabase.from('books').select('*')
          .eq('session_id', s.id).eq('user_id', session.user.id).order('row_number')

        const active = (books || []).filter((b: { is_returned: boolean }) => !b.is_returned)

        const totalSold = active.reduce((sum: number, b: { row_number: number; start_num: number | null; end_num: number | null }) => {
          const ticket   = (tvs || [])[b.row_number - 1]
          const bookSize = ticket?.book_size ?? 100
          const sold     = calcSoldWrapped(b.start_num ?? 0, b.end_num ?? 0, bookSize)
          return sum + sold
        }, 0)

        const totalRevenue = active.reduce((sum: number, b: { row_number: number; start_num: number | null; end_num: number | null }) => {
          const ticket   = (tvs || [])[b.row_number - 1]
          const price    = ticket?.value    ?? 0
          const bookSize = ticket?.book_size ?? 100
          const sold     = calcSoldWrapped(b.start_num ?? 0, b.end_num ?? 0, bookSize)
          return parseFloat((sum + sold * price).toFixed(2))
        }, 0)

        return {
          ...s,
          book_count:    (books || []).length,
          total_sold:    totalSold,
          total_revenue: totalRevenue,
        }
      }))

      setSessions(enriched)
      setLoading(false)
    })
  }, [])

  async function confirmDelete() {
    if (!deleteId) return
    await supabase.from('sessions').delete().eq('id', deleteId)
    setSessions(prev => prev.filter(s => s.id !== deleteId))
    setDeleteId(null)
  }

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('selected_store_id')
    localStorage.removeItem('selected_store_name')
    window.location.href = '/auth'
  }

  function exportCSV() {
    const rows = filtered.map(s => {
      const rev        = s.total_revenue ?? 0
      const netSales   = s.sr50_net_sales ?? 0
      const sr50Cashes = s.sr50_cashes   ?? 0
      const ir34Cashes = s.ir34_totals   ?? 0
      const finalTotal = parseFloat((rev + netSales - sr50Cashes - ir34Cashes).toFixed(2))
      return [
        s.session_date, s.book_count ?? 0, s.total_sold ?? 0,
        rev.toFixed(2), netSales.toFixed(2), sr50Cashes.toFixed(2),
        ir34Cashes.toFixed(2), finalTotal.toFixed(2), s.notes ?? '',
      ].join(',')
    })
    const csv  = ['Date,Books,Sold,Ticket Revenue,SR50 Net Sales,SR50 Cashes,IR34 Cashes,Final Total,Notes', ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `${storeName.replace(/\s+/g, '-').toLowerCase()}-history.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const filtered = sessions.filter(s =>
    search === '' ||
    s.session_date.includes(search) ||
    new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', weekday: 'long',
    }).toLowerCase().includes(search.toLowerCase())
  )

  const grouped: Record<string, SessionWithStats[]> = {}
  filtered.forEach(s => {
    const key = new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  })

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>

  const totalDays    = filtered.length
  const totalRevenue = filtered.reduce((s, x) => s + (x.total_revenue ?? 0), 0)
  const grandFinal   = filtered.reduce((s, x) => {
    const rev = x.total_revenue ?? 0
    const net = (x.sr50_net_sales ?? 0) - (x.sr50_cashes ?? 0) - (x.ir34_totals ?? 0)
    return parseFloat((s + rev + net).toFixed(2))
  }, 0)

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 60 }}>
      {deleteId && <DeleteModal onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />}

      <header className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/?noredirect=1" style={{ color: 'var(--ink-faint)', textDecoration: 'none', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</a>
          <div>
            <div className="hdr-title">HISTORY</div>
            <div className="hdr-sub">{storeName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {filtered.length > 0 && (
            <button onClick={exportCSV} className="btn btn-ghost btn-sm">⬇ CSV</button>
          )}
          <a href="/stores" className="btn btn-ghost btn-sm">⇄</a>
          <button onClick={signOut} className="btn btn-ghost btn-sm">Out</button>
        </div>
      </header>

      {/* Summary cards */}
      {sessions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '18px 18px 0' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, padding: '14px' }}>
            <div className="sbar-lbl">Days</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700, color: 'var(--sky)', marginTop: 4 }}>{totalDays}</div>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, padding: '14px' }}>
            <div className="sbar-lbl">Ticket Rev</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--emerald)', marginTop: 4 }}>${totalRevenue.toFixed(2)}</div>
          </div>
          <div style={{ background: 'var(--card)', border: `1px solid ${grandFinal >= 0 ? 'var(--emerald)' : 'var(--rose)'}`, borderRadius: 14, padding: '14px' }}>
            <div className="sbar-lbl">Final Total</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: grandFinal >= 0 ? 'var(--emerald)' : 'var(--rose)', marginTop: 4 }}>${grandFinal.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ padding: '14px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 10, padding: '10px 14px' }}>
          <span style={{ color: 'var(--ink-faint)' }}>🔍</span>
          <input type="search" placeholder="Search by date (e.g. May, 2026, Monday)..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--ink)' }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 16 }}>✕</button>
          )}
        </div>
      </div>

      {/* Grouped sessions */}
      <div style={{ padding: '10px 18px 0' }}>
        {filtered.length === 0 ? (
          <div className="empty" style={{ marginTop: 40 }}>— NO SESSIONS FOUND —</div>
        ) : (
          Object.entries(grouped).map(([month, monthSessions]) => {
            const monthRevenue = monthSessions.reduce((s, x) => s + (x.total_revenue ?? 0), 0)
            const monthFinal   = monthSessions.reduce((s, x) => {
              const rev = x.total_revenue ?? 0
              const net = (x.sr50_net_sales ?? 0) - (x.sr50_cashes ?? 0) - (x.ir34_totals ?? 0)
              return parseFloat((s + rev + net).toFixed(2))
            }, 0)

            return (
              <div key={month} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 600 }}>
                    {month}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)' }}>{monthSessions.length} days</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--emerald)' }}>${monthRevenue.toFixed(2)}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: monthFinal >= 0 ? 'var(--sky)' : 'var(--rose)', background: 'var(--navy-lt)', padding: '2px 8px', borderRadius: 6 }}>
                      ${monthFinal.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div style={{ background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, overflow: 'hidden' }}>
                  {monthSessions.map((s, i) => {
                    const date         = new Date(s.session_date + 'T00:00:00')
                    const isToday      = s.session_date === new Date().toISOString().split('T')[0]
                    const rev          = s.total_revenue ?? 0
                    const sr50NetSales = s.sr50_net_sales ?? 0
                    const sr50Cashes   = s.sr50_cashes   ?? 0
                    const ir34Cashes   = s.ir34_totals   ?? 0
                    const hasSR50      = sr50NetSales > 0 || sr50Cashes > 0 || ir34Cashes > 0
                    const finalTotal   = parseFloat((rev + sr50NetSales - sr50Cashes - ir34Cashes).toFixed(2))

                    return (
                      <a key={s.id} href={`/session/${s.id}`} className="hist-row"
                        style={{ borderBottom: i < monthSessions.length - 1 ? '1px solid var(--line)' : 'none' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: isToday ? 700 : 500, fontSize: 14, marginBottom: 3, color: isToday ? 'var(--gold)' : 'var(--ink)' }}>
                            {isToday ? '⭐ TODAY' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
                            {s.book_count} books · {s.total_sold} sold
                            {rev > 0 ? ` · $${rev.toFixed(2)}` : ''}
                            {s.notes ? ` · ${s.notes}` : ''}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', marginRight: 4, minWidth: 80 }}>
                          {hasSR50 ? (
                            <>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>Final</div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>${finalTotal.toFixed(2)}</div>
                            </>
                          ) : rev > 0 ? (
                            <>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-faint)', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>Tickets</div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--ink-mid)' }}>${rev.toFixed(2)}</div>
                            </>
                          ) : (
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-ghost)' }}>no data</div>
                          )}
                        </div>

                        <button onClick={e => { e.preventDefault(); e.stopPropagation(); setDeleteId(s.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-ghost)', fontSize: 18, padding: '4px 2px' }}>
                          ×
                        </button>
                      </a>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}