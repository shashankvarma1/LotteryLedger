'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@/lib/supabase'

export default function HomePage() {
  const [loading,   setLoading]   = useState(true)
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [creating,  setCreating]  = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [storeName, setStoreName] = useState('')
  const [storeId,   setStoreId]   = useState<string | null>(null)
  const redirected = useRef(false)
  const today = new Date().toISOString().split('T')[0]

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

      const { data } = await supabase.from('sessions').select('*')
        .eq('user_id', session.user.id).eq('store_id', sid)
        .order('session_date', { ascending: false })

      const list = data || []
      setSessions(list)

      const noRedirect = new URLSearchParams(window.location.search).get('noredirect')
      if (!noRedirect) {
        const todayS = list.find((s: Session) => s.session_date === today)
        if (todayS && !redirected.current) {
          redirected.current = true
          window.location.href = `/session/${todayS.id}`
          return
        }
      }
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

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/auth'; return }

    // ── Guard: check if today's session already exists ──
    const { data: existing } = await supabase.from('sessions')
      .select('id')
      .eq('store_id', storeId)
      .eq('session_date', today)
      .eq('user_id', session.user.id)
      .single()

    if (existing) {
      window.location.href = `/session/${existing.id}`
      return
    }

    const { data } = await supabase.from('sessions').insert({
      session_date: today,
      price_per_ticket: 1,
      user_id: session.user.id,
      store_id: storeId,
    }).select().single()

    if (data?.id) window.location.href = `/session/${data.id}`
    else setCreating(false)
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

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 14 }}>
              Recent Sessions
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, overflow: 'hidden' }}>
              {sessions.slice(0, 5).map((s, i) => (
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
                  {s.sr50_net_sales > 0 && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--emerald)' }}>
                      ${s.sr50_net_sales.toFixed(2)}
                    </div>
                  )}
                  <span style={{ color: 'var(--ink-faint)', fontSize: 14 }}>→</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}