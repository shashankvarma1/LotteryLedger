'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

type Store = { id: string; name: string; address: string | null; user_id: string }
type AccessRow = { id: string; store_id: string; user_id: string; granted_by: string }

export default function AdminPage() {
  const [profile,     setProfile]     = useState<Profile | null>(null)
  const [users,       setUsers]       = useState<Profile[]>([])
  const [stores,      setStores]      = useState<Store[]>([])
  const [access,      setAccess]      = useState<AccessRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState('')
  const [toastType,   setToastType]   = useState<'ok' | 'err'>('ok')
  const [activeTab,   setActiveTab]   = useState<'access' | 'users'>('access')
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePw,    setInvitePw]    = useState('')
  const [inviteRole,  setInviteRole]  = useState<'user' | 'admin'>('user')
  const [inviting,    setInviting]    = useState(false)
  const redirected = useRef(false)

  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast(msg); setToastType(type)
    setTimeout(() => setToast(''), 4000)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!redirected.current) { redirected.current = true; window.location.href = '/auth' }
        return
      }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (!prof || prof.role !== 'admin') { window.location.href = '/'; return }
      setProfile(prof)

      await reload()
      setLoading(false)
    })
  }, [])

  async function reload() {
    const [{ data: allUsers }, { data: allStores }, { data: allAccess }] = await Promise.all([
      supabase.from('profiles').select('*').order('email'),
      supabase.from('stores').select('*').order('name'),
      supabase.from('store_access').select('*'),
    ])
    setUsers(allUsers || [])
    setStores(allStores || [])
    setAccess(allAccess || [])
  }

  function hasAccess(userId: string, storeId: string) {
    return access.some(a => a.user_id === userId && a.store_id === storeId)
  }

  async function toggleAccess(userId: string, storeId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    if (hasAccess(userId, storeId)) {
      const { error } = await supabase.from('store_access')
        .delete().eq('user_id', userId).eq('store_id', storeId)
      if (error) { showToast(error.message, 'err'); return }
      setAccess(prev => prev.filter(a => !(a.user_id === userId && a.store_id === storeId)))
      showToast('Access removed')
    } else {
      const { data, error } = await supabase.from('store_access').insert({
        user_id: userId, store_id: storeId, granted_by: session.user.id,
      }).select().single()
      if (error) { showToast(error.message, 'err'); return }
      if (data) setAccess(prev => [...prev, data])
      showToast('Access granted')
    }
  }

  async function toggleRole(userId: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (error) { showToast(error.message, 'err'); return }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as 'admin' | 'user' } : u))
    showToast(`Role changed to ${newRole}`)
  }

  async function inviteUser() {
    if (!inviteEmail.trim()) { showToast('Email is required', 'err'); return }
    if (!invitePw || invitePw.length < 6) { showToast('Password must be at least 6 characters', 'err'); return }

    setInviting(true)

    // Sign up the new user
    const { data, error } = await supabase.auth.signUp({
      email:    inviteEmail.trim(),
      password: invitePw,
    })

    if (error) {
      showToast(error.message, 'err')
      setInviting(false)
      return
    }

    if (!data.user) {
      showToast('User created but needs email confirmation. Disable email confirmation in Supabase Auth settings.', 'err')
      setInviting(false)
      return
    }

    const newUserId = data.user.id

    // Wait a moment for the profile trigger to fire
    await new Promise(r => setTimeout(r, 1000))

    // Set role if admin
    if (inviteRole === 'admin') {
      const { error: roleErr } = await supabase.from('profiles')
        .update({ role: 'admin' }).eq('id', newUserId)
      if (roleErr) {
        showToast(`User created but could not set admin role: ${roleErr.message}`, 'err')
      }
    }

    // Reload all data to reflect new user
    await reload()

    setInviteEmail('')
    setInvitePw('')
    setInviteRole('user')
    showToast(`✓ User ${inviteEmail} created successfully`)
    setInviting(false)
  }

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 60 }}>
      <header className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/?noredirect=1" style={{ color: 'var(--ink-faint)', textDecoration: 'none', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</a>
          <div>
            <div className="hdr-title">ADMIN PANEL</div>
            <div className="hdr-sub">{profile?.email} · {users.length} users · {stores.length} stores</div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line-dk)', margin: '0 18px' }}>
        {(['access', 'users'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
              letterSpacing: '.08em', textTransform: 'uppercase',
              color: activeTab === tab ? 'var(--gold)' : 'var(--ink-faint)',
              borderBottom: activeTab === tab ? '2px solid var(--gold)' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {tab === 'access' ? 'Store Access' : 'Users'}
          </button>
        ))}
      </div>

      {/* ── Store Access Tab ── */}
      {activeTab === 'access' && (
        <div style={{ padding: '18px 18px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 18, lineHeight: 1.6 }}>
            Toggle access for each user to each store. Store owners always have full access.
          </div>

          {stores.length === 0 && (
            <div className="empty">No stores created yet.</div>
          )}

          {stores.map(store => {
            const owner      = users.find(u => u.id === store.user_id)
            const otherUsers = users.filter(u => u.id !== store.user_id)

            return (
              <div key={store.id} style={{ marginBottom: 20, background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, overflow: 'hidden' }}>
                {/* Store header */}
                <div style={{ padding: '14px 18px', background: 'var(--navy-mid)', borderBottom: '1px solid var(--line-dk)' }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>{store.name}</div>
                  {store.address && <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{store.address}</div>}
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--gold)', marginTop: 4 }}>
                    Owner: {owner?.display_name || owner?.email || 'Unknown'}
                  </div>
                </div>

                {/* Owner row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: otherUsers.length > 0 ? '1px solid var(--line)' : 'none', opacity: .6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                      {owner?.display_name || owner?.email || 'Unknown'}
                    </div>
                    {owner?.display_name && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{owner?.email}</div>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--emerald)', background: 'var(--emerald-lt)', padding: '4px 10px', borderRadius: 20 }}>
                    Owner
                  </div>
                </div>

                {/* Other users */}
                {otherUsers.map((user, i) => {
                  const granted = hasAccess(user.id, store.id)
                  return (
                    <div key={user.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: i < otherUsers.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {user.display_name || user.email}
                          {user.role === 'admin' && (
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--gold)', background: 'var(--gold-dim)', padding: '1px 6px', borderRadius: 10 }}>admin</span>
                          )}
                        </div>
                        {user.display_name && (
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{user.email}</div>
                        )}
                      </div>
                      {/* Toggle switch */}
                      <button
                        onClick={() => toggleAccess(user.id, store.id)}
                        style={{
                          width: 52, height: 30, borderRadius: 100, border: 'none', cursor: 'pointer',
                          background: granted ? 'var(--emerald)' : 'var(--line-dk)',
                          position: 'relative', transition: 'background .2s', flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: 3,
                          left: granted ? 25 : 3,
                          transition: 'left .2s',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                        }} />
                      </button>
                    </div>
                  )
                })}

                {otherUsers.length === 0 && (
                  <div style={{ padding: '12px 18px', fontSize: 12, color: 'var(--ink-ghost)', fontStyle: 'italic' }}>
                    No other users to assign. Create users in the Users tab.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Users Tab ── */}
      {activeTab === 'users' && (
        <div style={{ padding: '18px 18px 0' }}>

          {/* Create user form */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, padding: '18px', marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--ink)' }}>Create New User</div>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 16, lineHeight: 1.6 }}>
              Creates a login for a store employee. Share the email and password with them directly.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="field-label">Email</label>
                <input
                  type="email" value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="employee@example.com"
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Password</label>
                <input
                  type="text" value={invitePw}
                  onChange={e => setInvitePw(e.target.value)}
                  placeholder="min 6 characters"
                  className="field-input"
                  onKeyDown={e => { if (e.key === 'Enter') inviteUser() }}
                />
              </div>
              <div>
                <label className="field-label">Role</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['user', 'admin'] as const).map(r => (
                    <button key={r} onClick={() => setInviteRole(r)}
                      style={{
                        flex: 1, padding: '10px', border: '1px solid var(--line-dk)', borderRadius: 8,
                        cursor: 'pointer',
                        background: inviteRole === r ? 'var(--gold)' : 'var(--card)',
                        color: inviteRole === r ? 'var(--navy)' : 'var(--ink-faint)',
                        fontWeight: 600, fontSize: 13,
                      }}>
                      {r === 'admin' ? '★ Admin' : '👤 User'}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-gold"
                onClick={inviteUser}
                disabled={inviting}
                style={{ width: '100%', padding: '13px', fontSize: 13, marginTop: 4 }}
              >
                {inviting ? 'Creating user...' : 'Create User'}
              </button>
            </div>
          </div>

          {/* Users list */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', background: 'var(--navy-mid)', borderBottom: '1px solid var(--line-dk)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              {users.length} Users
            </div>

            {users.length === 0 && (
              <div style={{ padding: '20px 18px', fontSize: 13, color: 'var(--ink-ghost)', textAlign: 'center' }}>
                No users yet
              </div>
            )}

            {users.map((user, i) => {
              const userStores = stores.filter(s =>
                s.user_id === user.id || hasAccess(user.id, s.id)
              )
              const isSelf = user.id === profile?.id

              return (
                <div key={user.id} style={{ padding: '14px 18px', borderBottom: i < users.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {user.display_name || user.email}
                        {isSelf && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--sky)', background: 'rgba(56,189,248,.1)', padding: '1px 6px', borderRadius: 10 }}>you</span>
                        )}
                      </div>
                      {user.display_name && (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>{user.email}</div>
                      )}
                    </div>

                    {/* Role toggle */}
                    {!isSelf ? (
                      <button onClick={() => toggleRole(user.id, user.role)}
                        style={{
                          padding: '5px 12px', border: '1px solid var(--line-dk)', borderRadius: 20,
                          background: user.role === 'admin' ? 'var(--gold-dim)' : 'var(--card)',
                          color: user.role === 'admin' ? 'var(--gold)' : 'var(--ink-faint)',
                          fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}>
                        {user.role === 'admin' ? '★ Admin' : 'User'}
                      </button>
                    ) : (
                      <div style={{ padding: '5px 12px', borderRadius: 20, background: 'var(--gold-dim)', color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600 }}>
                        ★ Admin
                      </div>
                    )}
                  </div>

                  {/* Store access badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {userStores.length === 0 ? (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-ghost)', fontStyle: 'italic' }}>
                        No store access — assign in Store Access tab
                      </span>
                    ) : userStores.map(s => (
                      <span key={s.id} style={{
                        fontFamily: 'var(--mono)', fontSize: 10,
                        padding: '2px 8px', borderRadius: 10,
                        background: s.user_id === user.id ? 'var(--emerald-lt)' : 'var(--navy-lt)',
                        color: s.user_id === user.id ? 'var(--emerald)' : 'var(--ink-faint)',
                        border: `1px solid ${s.user_id === user.id ? 'var(--emerald)' : 'var(--line-dk)'}`,
                      }}>
                        {s.name}{s.user_id === user.id ? ' ★' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
          background: toastType === 'ok' ? 'var(--emerald)' : 'var(--rose)',
          color: '#fff', zIndex: 100, whiteSpace: 'nowrap',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}