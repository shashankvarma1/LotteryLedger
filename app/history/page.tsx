'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@/lib/supabase'

type SessionWithStats = Session & {
  book_count?: number
  total_sold?: number
}

export default function HistoryPage() {
  const [sessions,   setSessions]   = useState<SessionWithStats[]>([])
  const [loading,    setLoading]    = useState(true)
  const [storeName,  setStoreName]  = useState('')
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

      const { data: sessionList } = await supabase
        .from('sessions').select('*')
        .eq('user_id', session.user.id)
        .eq('store_id', sid)
        .order('session_date', { ascending: false })

      if (!sessionList) { setLoading(false); return }

      const enriched = await Promise.all(
        sessionList.map(async (s: Session) => {
          const { data: books } = await supabase
            .from('books').select('*')
            .eq('session_id', s.id)
            .eq('user_id', session.user.id)
          const active = (books || []).filter((b: { is_returned: boolean }) => !b.is_returned)
          return {
            ...s,
            book_count: (books || []).length,
            total_sold: active.reduce((sum: number, b: { start_num: number | null; end_num: number | null }) =>
              sum + Math.max(0, (b.end_num ?? 0) - (b.start_num ?? 0)), 0),
          }
        })
      )
      setSessions(enriched)
      setLoading(false)
    })
  }, [])

  async function del(id: string, e: React.MouseEvent) {
    e.preventDefault()
    if (!confirm('Delete this session and all its entries?')) return
    await supabase.from('sessions').delete().eq('id', id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('selected_store_id')
    localStorage.removeItem('selected_store_name')
    window.location.href = '/auth'
  }

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>

  const totalNetDue = sessions.reduce((s, x) => s + (x.sr50_net_due ?? 0), 0)

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 60 }}>
      <header className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/?noredirect=1" style={{ color: 'var(--ink)', textDecoration: 'none', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</a>
          <div>
            <div className="hdr-title">HISTORY</div>
            <div className="hdr-sub">{storeName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href="/stores" className="btn btn-sm btn-ghost">⇄ STORES</a>
          <button onClick={signOut} className="btn btn-sm btn-ghost">OUT</button>
        </div>
      </header>

      {sessions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line-dk)', borderBottom: '1px solid var(--line-dk)' }}>
          <div style={{ background: 'var(--paper)', padding: '10px 12px', textAlign: 'center' }}>
            <div className="sbar-lbl">Days</div>
            <div className="sbar-val">{sessions.length}</div>
          </div>
          <div style={{ background: 'var(--paper)', padding: '10px 12px', textAlign: 'center' }}>
            <div className="sbar-lbl">Total Net Due</div>
            <div className="sbar-val green">${totalNetDue.toFixed(2)}</div>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="empty" style={{ marginTop: 60 }}>— NO SESSIONS YET —</div>
      ) : sessions.map(s => {
        const date    = new Date(s.session_date + 'T00:00:00')
        const isToday = s.session_date === new Date().toISOString().split('T')[0]
        return (
          <a key={s.id} href={`/session/${s.id}`} className="hist-row">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: isToday ? 700 : 400, fontSize: 14, marginBottom: 2 }}>
                {isToday ? 'TODAY' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
                {s.book_count} books · {s.total_sold} sold
              </div>
            </div>
            <div style={{ textAlign: 'right', marginRight: 8 }}>
              {s.sr50_net_due > 0
                ? <>
                    <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Net Due</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>${s.sr50_net_due.toFixed(2)}</div>
                  </>
                : <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink-faint)' }}>no SR50</div>
              }
            </div>
            <button onClick={e => del(s.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 18, padding: '4px 2px' }}>×</button>
          </a>
        )
      })}
    </div>
  )
}