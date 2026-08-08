'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@/lib/supabase'

type SessionWithRevenue = Session & {
  computed_revenue: number
  computed_final:   number
}

function calcSoldSafe(start: number, end: number, bookSize: number | null): number {
  if (start === end) return 0
  if (end > start) return end - start
  if (bookSize && bookSize > 0) return (bookSize - start) + end
  return 0
}

export default function HomePage() {
  const [loading,     setLoading]     = useState(true)
  const [sessions,    setSessions]    = useState<SessionWithRevenue[]>([])
  const [creating,    setCreating]    = useState(false)
  const [createError, setCreateError] = useState('')
  const [userEmail,   setUserEmail]   = useState('')
  const [storeName,   setStoreName]   = useState('')
  const [storeId,     setStoreId]     = useState<string | null>(null)
  const redirected = useRef(false)
  const today = new Date().toLocaleDateString('en-CA')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!redirected.current) { redirected.current = true; window.location.href = '/auth' }
        return
      }
      setUserEmail(session.user.email ?? '')
      const sid   = localStorage.getItem('selected_store_id')
      const sname = localStorage.getItem('selected_store_name')
      if (!sid) { window.location.href = '/stores'; return }
      setStoreId(sid); setStoreName(sname || 'Store')

      const { data: sessionList } = await supabase
        .from('sessions').select('*')
        .eq('user_id', session.user.id).eq('store_id', sid)
        .order('session_date', { ascending: false })

      const list: Session[] = sessionList || []

      const noRedirect = new URLSearchParams(window.location.search).get('noredirect')
      if (!noRedirect) {
        const todayS = list.find((s: Session) => s.session_date === today)
        if (todayS && !redirected.current) {
          redirected.current = true
          window.location.href = `/session/${todayS.id}`
          return
        }
      }

      // Load live ticket values as fallback for sessions without snapshot
      const { data: tvs } = await supabase
        .from('ticket_values').select('*')
        .eq('store_id', sid).order('ticket_number')

      const recent = list.slice(0, 5)

      const enriched = await Promise.all(recent.map(async (s) => {
        const { data: books } = await supabase
          .from('books').select('*')
          .eq('session_id', s.id)

        const active = (books || []).filter(
          (b: { is_returned: boolean }) => !b.is_returned
        )

        // ── Use ticket_snapshot if available — same as session page and history ──
        const snapshot = s.ticket_snapshot as { ticket_number: number; value: number; book_size: number }[] | null
        const ticketsForCalc = (snapshot && snapshot.length > 0) ? snapshot : (tvs || [])

        const ticketRevenue = active.reduce(
          (sum: number, b: { row_number: number; start_num: number | null; end_num: number | null }) => {
            const ticket   = ticketsForCalc[b.row_number - 1]
            const price    = ticket?.value    ?? 0
            const bookSize = ticket?.book_size ?? null
            const start    = b.start_num ?? 0
            const end      = b.end_num   ?? 0
            const sold     = calcSoldSafe(start, end, bookSize)
            return parseFloat((sum + sold * price).toFixed(2))
          },
          0
        )

        const sr50Net    = s.sr50_net_sales ?? 0
        const sr50Cashes = s.sr50_cashes   ?? 0
        const ir34Cashes = s.ir34_totals   ?? 0
        const finalTotal = parseFloat((ticketRevenue + sr50Net - sr50Cashes - ir34Cashes).toFixed(2))

        return { ...s, computed_revenue: ticketRevenue, computed_final: finalTotal }
      }))

      const rest = list.slice(5).map(s => ({ ...s, computed_revenue: 0, computed_final: 0 }))
      setSessions([...enriched, ...rest])
      setLoading(false)
    })
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('selected_store_id')
    localStorage.removeItem('selected_store_name')
    window.location.href = '/auth'
  }

  async function create() {
    if (!storeId || creating) return
    setCreating(true)
    setCreateError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/auth'; return }

      const { data: existing, error: checkErr } = await supabase
        .from('sessions').select('id')
        .eq('store_id', storeId)
        .eq('session_date', today)
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (checkErr) {
        setCreateError(`Error: ${checkErr.message}`)
        setCreating(false)
        return
      }

      if (existing) {
        window.location.href = `/session/${existing.id}`
        return
      }

      const { data: newSession, error: insertErr } = await supabase
        .from('sessions').insert({
          session_date:     today,
          price_per_ticket: 1,
          user_id:          session.user.id,
          store_id:         storeId,
          ticket_revenue:   0,
        }).select().single()

      if (insertErr) {
        setCreateError(`Could not create session: ${insertErr.message}`)
        setCreating(false)
        return
      }

      if (newSession?.id) {
        window.location.href = `/session/${newSession.id}`
      } else {
        setCreateError('No session returned — please try again')
        setCreating(false)
      }
    } catch (err) {
      setCreateError(`Unexpected error: ${String(err)}`)
      setCreating(false)
    }
  }

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <header className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎰</span>
          <div>
            <div className="hdr-title">{storeName.toUpperCase()}</div>
            <div className="hdr-sub">{userEmail}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href="/stores"   className="btn btn-ghost btn-sm">⇄</a>
          <a href="/account"  className="btn btn-ghost btn-sm">Account</a>
          <a href="/settings" className="btn btn-ghost btn-sm">Settings</a>
          <a href="/history"  className="btn btn-ghost btn-sm">History</a>
          <button onClick={signOut} className="btn btn-ghost btn-sm">Out</button>
        </div>
      </header>

      <div style={{ padding: '32px 18px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--gold)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          {dateLabel}
        </div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, lineHeight: 1.2 }}>
          Today&#39;s Ledger
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 32, lineHeight: 1.6 }}>
          Store: <span style={{ color: 'var(--ink-mid)', fontWeight: 500 }}>{storeName}</span>
        </p>

        <button className="btn btn-gold" onClick={create} disabled={creating}
          style={{ width: '100%', padding: '18px', fontSize: 16, borderRadius: 14 }}>
          {creating ? 'Opening...' : "Start Today's Ledger →"}
        </button>

        {createError && (
          <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--rose-lt)', border: '1px solid var(--rose)', borderRadius: 10, fontSize: 12, color: 'var(--rose)', fontFamily: 'var(--mono)' }}>
            ⚠ {createError}
          </div>
        )}

        {sessions.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 14 }}>
              Recent Sessions
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, overflow: 'hidden' }}>
              {sessions.slice(0, 5).map((s, i) => {
                const ticketRev  = s.computed_revenue
                const sr50Net    = s.sr50_net_sales  ?? 0
                const sr50Cashes = s.sr50_cashes     ?? 0
                const ir34Cashes = s.ir34_totals     ?? 0
                const hasSR50    = sr50Net > 0 || sr50Cashes > 0 || ir34Cashes > 0
                const finalTotal = s.computed_final
                const hasData    = ticketRev > 0 || hasSR50

                return (
                  <a key={s.id} href={`/session/${s.id}`} className="hist-row"
                    style={{ borderBottom: i < Math.min(sessions.length, 5) - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>
                        {new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })}
                      </div>
                      {s.notes && (
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>{s.notes}</div>
                      )}
                    </div>

                    {hasData ? (
                      <div style={{ textAlign: 'right', marginRight: 6 }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: hasSR50 ? (finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)') : 'var(--ink-faint)' }}>
                          {hasSR50 ? 'Final Total' : 'Tickets'}
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: hasSR50 ? (finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)') : 'var(--ink-mid)' }}>
                          {hasSR50 ? `$${finalTotal.toFixed(2)}` : `$${ticketRev.toFixed(2)}`}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-ghost)', marginRight: 6 }}>
                        no data
                      </div>
                    )}

                    <span style={{ color: 'var(--ink-faint)', fontSize: 14 }}>→</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}