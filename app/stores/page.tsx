'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Store = { id: string; name: string; address: string | null; user_id: string; is_owner: boolean }

export default function StoresPage() {
  const [stores,   setStores]   = useState<Store[]>([])
  const [loading,  setLoading]  = useState(true)
  const [userId,   setUserId]   = useState<string | null>(null)
  const [userEmail,setUserEmail]= useState('')
  const [toast,    setToast]    = useState('')
  const [showAdd,  setShowAdd]  = useState(false)
  const [editStore,setEditStore]= useState<Store | null>(null)
  const [name,     setName]     = useState('')
  const [address,  setAddress]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const redirected = useRef(false)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!redirected.current) { redirected.current = true; window.location.href = '/auth' }
        return
      }
      setUserId(session.user.id)
      setUserEmail(session.user.email ?? '')
      await loadStores(session.user.id)
      setLoading(false)
    })
  }, [])

  async function loadStores(uid: string) {
    // RLS handles filtering — returns owned + shared stores in one query
    const { data: allStores, error } = await supabase
      .from('stores')
      .select('*')
      .order('name')

    if (error) {
      console.error('Load stores error:', error.message)
      return
    }

    // Mark which ones the user owns
    const mapped = (allStores || []).map((s: Store) => ({
      ...s,
      is_owner: s.user_id === uid,
    }))

    setStores(mapped)
  }

  function selectStore(store: Store) {
    localStorage.setItem('selected_store_id', store.id)
    localStorage.setItem('selected_store_name', store.name)
    window.location.href = '/'
  }

  async function saveStore() {
    if (!name.trim() || !userId) return
    setSaving(true)

    if (editStore) {
      const { error } = await supabase.from('stores')
        .update({ name: name.trim(), address: address.trim() || null })
        .eq('id', editStore.id)
      if (!error) {
        setStores(prev => prev.map(s =>
          s.id === editStore.id
            ? { ...s, name: name.trim(), address: address.trim() || null }
            : s
        ))
        showToast('Store updated')
      }
    } else {
      const { data, error } = await supabase.from('stores')
        .insert({ name: name.trim(), address: address.trim() || null, user_id: userId })
        .select().single()
      if (!error && data) {
        setStores(prev => [...prev, { ...data, is_owner: true }])
        showToast('Store added')
      }
    }

    setName(''); setAddress(''); setShowAdd(false); setEditStore(null)
    setSaving(false)
  }

  async function deleteStore(id: string) {
    if (!confirm('Delete this store and all its data?')) return
    setDeleting(id)
    await supabase.from('stores').delete().eq('id', id)
    setStores(prev => prev.filter(s => s.id !== id))
    const sid = localStorage.getItem('selected_store_id')
    if (sid === id) {
      localStorage.removeItem('selected_store_id')
      localStorage.removeItem('selected_store_name')
    }
    setDeleting(null)
    showToast('Store deleted')
  }

  function startEdit(store: Store) {
    setEditStore(store)
    setName(store.name)
    setAddress(store.address || '')
    setShowAdd(true)
  }

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('selected_store_id')
    localStorage.removeItem('selected_store_name')
    window.location.href = '/auth'
  }

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>

  const selectedId = typeof window !== 'undefined' ? localStorage.getItem('selected_store_id') : null

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>
      <header className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🎰</span>
          <div>
            <div className="hdr-title">SELECT STORE</div>
            <div className="hdr-sub">{userEmail}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href="/?noredirect=1" className="btn btn-ghost btn-sm">Home</a>
          <button onClick={signOut} className="btn btn-ghost btn-sm">Out</button>
        </div>
      </header>

      <div style={{ padding: '18px 18px 0' }}>

        {/* Store list */}
        {stores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-faint)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--ink)', fontSize: 16 }}>No stores yet</div>
            <div style={{ fontSize: 13 }}>Add your first store below</div>
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
              {stores.length} {stores.length === 1 ? 'Store' : 'Stores'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stores.map(store => {
                const isSelected = store.id === selectedId
                return (
                  <div key={store.id} style={{
                    background: 'var(--card)',
                    border: `1px solid ${isSelected ? 'var(--emerald)' : 'var(--line-dk)'}`,
                    borderRadius: 14,
                    overflow: 'hidden',
                  }}>
                    {/* Store row — tap to select */}
                    <div
                      onClick={() => selectStore(store)}
                      style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: store.address ? 4 : 0 }}>
                          <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>
                            {store.name}
                          </span>
                          {isSelected && (
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--emerald)', background: 'var(--emerald-lt)', padding: '2px 8px', borderRadius: 10, fontWeight: 600, letterSpacing: '.04em' }}>
                              ACTIVE
                            </span>
                          )}
                          {!store.is_owner && (
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--sky)', background: 'rgba(56,189,248,.1)', padding: '2px 8px', borderRadius: 10, fontWeight: 600, letterSpacing: '.04em' }}>
                              SHARED
                            </span>
                          )}
                        </div>
                        {store.address && (
                          <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{store.address}</div>
                        )}
                      </div>
                      <span style={{ color: 'var(--ink-faint)', fontSize: 18, marginLeft: 8 }}>→</span>
                    </div>

                    {/* Edit / Delete — only for owners */}
                    {store.is_owner && (
                      <div style={{ display: 'flex', borderTop: '1px solid var(--line)', padding: '8px 12px', gap: 6 }}>
                        <button
                          onClick={() => startEdit(store)}
                          className="btn btn-ghost btn-sm"
                          style={{ flex: 1 }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteStore(store.id)}
                          disabled={deleting === store.id}
                          className="btn btn-ghost btn-sm"
                          style={{ flex: 1, color: 'var(--rose)' }}
                        >
                          {deleting === store.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Add / Edit store form */}
        {showAdd ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--gold)', borderRadius: 14, padding: '18px' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, color: 'var(--ink)' }}>
              {editStore ? 'Edit Store' : 'Add New Store'}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="field-label">Store Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveStore() }}
                placeholder="e.g. Berlin Wine and Spirits"
                className="field-input"
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label">Address (optional)</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveStore() }}
                placeholder="123 Main St"
                className="field-input"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-ghost"
                onClick={() => { setShowAdd(false); setEditStore(null); setName(''); setAddress('') }}
                style={{ flex: 1, padding: '12px' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-gold"
                onClick={saveStore}
                disabled={saving || !name.trim()}
                style={{ flex: 1, padding: '12px' }}
              >
                {saving ? 'Saving...' : (editStore ? 'Update' : 'Add Store')}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-gold"
            onClick={() => setShowAdd(true)}
            style={{ width: '100%', padding: '14px', fontSize: 14, borderRadius: 14 }}
          >
            + Add New Store
          </button>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}