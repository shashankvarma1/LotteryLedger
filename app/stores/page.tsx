'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Store = { id: string; name: string; address: string | null; created_at: string }

export default function StoresPage() {
  const [stores,   setStores]   = useState<Store[]>([])
  const [loading,  setLoading]  = useState(true)
  const [name,     setName]     = useState('')
  const [address,  setAddress]  = useState('')
  const [adding,   setAdding]   = useState(false)
  const [editing,  setEditing]  = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const redirected = useRef(false)
  const selectedId = typeof window !== 'undefined' ? localStorage.getItem('selected_store_id') : null

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!redirected.current) { redirected.current = true; window.location.href = '/auth' }
        return
      }
      const { data } = await supabase.from('stores').select('*').eq('user_id', session.user.id).order('created_at')
      setStores(data || [])
      setLoading(false)
    })
  }, [])

  async function addStore() {
    if (!name.trim()) return
    setAdding(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('stores').insert({
      user_id: session.user.id, name: name.trim(), address: address.trim() || null,
    }).select().single()
    if (data) { setStores(prev => [...prev, data]); setName(''); setAddress('') }
    setAdding(false)
  }

  async function updateStore(id: string) {
    if (!editName.trim()) return
    const { data } = await supabase.from('stores').update({ name: editName.trim() }).eq('id', id).select().single()
    if (data) setStores(prev => prev.map(s => s.id === id ? data : s))
    setEditing(null)
  }

  async function deleteStore(id: string) {
    if (!confirm('Delete this store and ALL its data?')) return
    await supabase.from('stores').delete().eq('id', id)
    setStores(prev => prev.filter(s => s.id !== id))
    if (localStorage.getItem('selected_store_id') === id) {
      localStorage.removeItem('selected_store_id')
      localStorage.removeItem('selected_store_name')
    }
  }

  function selectStore(store: Store) {
    localStorage.setItem('selected_store_id', store.id)
    localStorage.setItem('selected_store_name', store.name)
    window.location.href = '/'
  }

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('selected_store_id')
    localStorage.removeItem('selected_store_name')
    window.location.href = '/auth'
  }

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>
      <header className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎰</span>
          <div>
            <div className="hdr-title">MY STORES</div>
            <div className="hdr-sub">SELECT A STORE TO CONTINUE</div>
          </div>
        </div>
        <button onClick={signOut} className="btn btn-ghost btn-sm">Sign Out</button>
      </header>

      {/* Store list */}
      <div style={{ padding: '24px 18px 16px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 14 }}>
          Your Stores
        </div>

        {stores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-faint)', fontSize: 13 }}>
            No stores yet. Add your first store below.
          </div>
        ) : stores.map(store => (
          <div key={store.id}>
            {editing === store.id ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <input
                  value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') updateStore(store.id); if (e.key === 'Escape') setEditing(null) }}
                  className="field-input" style={{ flex: 1, padding: '10px 12px' }}
                />
                <button onClick={() => updateStore(store.id)} className="btn btn-green btn-sm">Save</button>
                <button onClick={() => setEditing(null)} className="btn btn-ghost btn-sm">✕</button>
              </div>
            ) : (
              <div
                className={`store-card ${selectedId === store.id ? 'active' : ''}`}
                onClick={() => selectStore(store)}
                style={{ marginBottom: 12 }}
              >
                <div className="store-icon">🏪</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{store.name}</span>
                    {selectedId === store.id && <span className="badge badge-green">ACTIVE</span>}
                  </div>
                  {store.address && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{store.address}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setEditing(store.id); setEditName(store.name) }} className="btn btn-ghost btn-sm">Edit</button>
                  <button onClick={() => deleteStore(store.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-ghost)', fontSize: 18, padding: '4px' }}>×</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add store */}
      <div style={{ margin: '0 18px', background: 'var(--card)', border: '1px solid var(--line-dk)', borderRadius: 16, padding: '20px' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, color: 'var(--ink)' }}>Add New Store</div>

        <div style={{ marginBottom: 12 }}>
          <label className="field-label">Store Name *</label>
          <input type="text" placeholder="e.g. Main Street Store" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addStore() }}
            className="field-input" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Address (optional)</label>
          <input type="text" placeholder="e.g. 123 Main St" value={address} onChange={e => setAddress(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addStore() }}
            className="field-input" />
        </div>
        <button className="btn btn-gold" onClick={addStore} disabled={adding || !name.trim()} style={{ width: '100%', padding: '12px', fontSize: 13 }}>
          {adding ? 'Adding...' : '+ Add Store'}
        </button>
      </div>
    </div>
  )
}