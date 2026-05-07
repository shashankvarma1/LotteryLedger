'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

export default function AccountPage() {
  const [profile,       setProfile]       = useState<Profile | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [currentPw,     setCurrentPw]     = useState('')
  const [newPw,         setNewPw]         = useState('')
  const [confirmPw,     setConfirmPw]     = useState('')
  const [pwLoading,     setPwLoading]     = useState(false)
  const [pwMsg,         setPwMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [displayName,   setDisplayName]   = useState('')
  const [nameLoading,   setNameLoading]   = useState(false)
  const [nameMsg,       setNameMsg]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const redirected = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!redirected.current) { redirected.current = true; window.location.href = '/auth' }
        return
      }
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (data) { setProfile(data); setDisplayName(data.display_name || '') }
      setLoading(false)
    })
  }, [])

  async function changePassword() {
    if (!newPw || newPw.length < 6) { setPwMsg({ type: 'err', text: 'Password must be at least 6 characters' }); return }
    if (newPw !== confirmPw) { setPwMsg({ type: 'err', text: 'Passwords do not match' }); return }
    setPwLoading(true); setPwMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) setPwMsg({ type: 'err', text: error.message })
    else {
      setPwMsg({ type: 'ok', text: '✓ Password updated successfully' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    }
    setPwLoading(false)
  }

  async function saveName() {
    if (!profile) return
    setNameLoading(true); setNameMsg(null)
    const { error } = await supabase.from('profiles')
      .update({ display_name: displayName || null }).eq('id', profile.id)
    if (error) setNameMsg({ type: 'err', text: error.message })
    else {
      setProfile(p => p ? { ...p, display_name: displayName } : p)
      setNameMsg({ type: 'ok', text: '✓ Name saved' })
    }
    setNameLoading(false)
  }

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>
      <header className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/?noredirect=1" style={{ color: 'var(--ink-faint)', textDecoration: 'none', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</a>
          <div>
            <div className="hdr-title">MY ACCOUNT</div>
            <div className="hdr-sub">{profile?.email}</div>
          </div>
        </div>
        {profile?.role === 'admin' && (
          <a href="/admin" className="btn btn-gold btn-sm">Admin Panel</a>
        )}
      </header>

      {/* Profile info */}
      <div style={{ margin: '18px 18px 0', background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, padding: '18px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, color: 'var(--ink)' }}>Profile</div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Email</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink-mid)' }}>{profile?.email}</div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Role</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: profile?.role === 'admin' ? 'var(--gold-dim)' : 'var(--navy-lt)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: profile?.role === 'admin' ? 'var(--gold)' : 'var(--ink-faint)' }}>
            {profile?.role === 'admin' ? '★ Admin' : 'User'}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label className="field-label">Display Name</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
              placeholder="Your name"
              className="field-input" style={{ flex: 1 }}
            />
            <button className="btn btn-gold" onClick={saveName} disabled={nameLoading}
              style={{ padding: '10px 16px', flexShrink: 0 }}>
              {nameLoading ? '...' : 'Save'}
            </button>
          </div>
          {nameMsg && (
            <div style={{ marginTop: 8, fontSize: 12, color: nameMsg.type === 'ok' ? 'var(--emerald)' : 'var(--rose)', fontFamily: 'var(--mono)' }}>
              {nameMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* Change password */}
      <div style={{ margin: '12px 18px 0', background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, padding: '18px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--ink)' }}>Change Password</div>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 16 }}>Must be at least 6 characters.</div>

        <div style={{ marginBottom: 12 }}>
          <label className="field-label">New Password</label>
          <input
            type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
            placeholder="••••••••" className="field-input"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Confirm New Password</label>
          <input
            type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') changePassword() }}
            placeholder="••••••••" className="field-input"
          />
        </div>

        {pwMsg && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: pwMsg.type === 'ok' ? 'var(--emerald-lt)' : 'var(--rose-lt)', border: `1px solid ${pwMsg.type === 'ok' ? 'var(--emerald)' : 'var(--rose)'}`, fontFamily: 'var(--mono)', fontSize: 12, color: pwMsg.type === 'ok' ? 'var(--emerald)' : 'var(--rose)' }}>
            {pwMsg.text}
          </div>
        )}

        <button className="btn btn-gold" onClick={changePassword} disabled={pwLoading}
          style={{ width: '100%', padding: '13px', fontSize: 13 }}>
          {pwLoading ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </div>
  )
}