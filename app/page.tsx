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

      if (!sid) {
        window.location.href = '/stores'
        return
      }

      setStoreId(sid)
      setStoreName(sname || 'Store')

      const { data } = await supabase
        .from('sessions').select('*')
        .eq('user_id', session.user.id)
        .eq('store_id', sid)
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
    if (!storeId) return
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/auth'; return }

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

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <header className="hdr">
        <div>
          <div className="hdr-title">⊞ {storeName.toUpperCase()}</div>
          <div className="hdr-sub">{userEmail}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href="/stores" className="btn btn-sm btn-ghost" title="Switch store">⇄ STORES</a>
          <a href="/settings" className="btn btn-sm">SETTINGS</a>
          <a href="/history" className="btn btn-sm">HISTORY</a>
          <button onClick={signOut} className="btn btn-sm btn-ghost">OUT</button>
        </div>
      </header>

      <div style={{ padding: '32px 18px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '.1em', marginBottom: 8 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 24 }}>
          📍 {storeName}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 12 }}>
          Start today&#39;s ledger
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 32, lineHeight: 1.6 }}>
          Ticket values loaded from Settings for this store.<br />
          Enter start &amp; end for each ticket row.
        </p>
        <button
          className="btn btn-red"
          onClick={create}
          disabled={creating}
          style={{ width: '100%', padding: '16px', fontSize: 16 }}
        >
          {creating ? 'OPENING...' : "START TODAY'S LEDGER →"}
        </button>

        {sessions.length > 0 && (
          <div style={{ marginTop: 36, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
              Recent
            </div>
            {sessions.slice(0, 5).map(s => (
              <a key={s.id} href={`/session/${s.id}`} className="hist-row" style={{ padding: '11px 0' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
                  {new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-faint)' }}>→</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}