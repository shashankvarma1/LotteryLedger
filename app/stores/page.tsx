'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Store = {
  id: string
  name: string
  address: string | null
  created_at: string
}

export default function StoresPage() {
  const [stores,   setStores]   = useState<Store[]>([])
  const [loading,  setLoading]  = useState(true)
  const [name,     setName]     = useState('')
  const [address,  setAddress]  = useState('')
  const [adding,   setAdding]   = useState(false)
  const [editing,  setEditing]  = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const redirected = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!redirected.current) { redirected.current = true; window.location.href = '/auth' }
        return
      }
      const { data } = await supabase
        .from('stores').select('*')
        .eq('user_id', session.user.id)
        .order('created_at')
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
      user_id: session.user.id,
      name: name.trim(),
      address: address.trim() || null,
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
    if (!confirm('Delete this store and ALL its data? This cannot be undone.')) return
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

  const selectedId = typeof window !== 'undefined' ? localStorage.getItem('selected_store_id') : null

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>
      <header className="hdr">
        <div>
          <div className="hdr-title">⊞ MY STORES</div>
          <div className="hdr-sub">SELECT A STORE TO CONTINUE</div>
        </div>
        <button onClick={signOut} className="btn btn-sm btn-ghost">SIGN OUT</button>
      </header>

      {/* Add store form */}
      <div style={{ padding: '16px', borderBottom: '2px solid var(--ink)', background: 'var(--warm)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
          Add New Store
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: 'var(--ink-faint)', marginBottom: 4, letterSpacing: '.06em', textTransform: 'uppercase' }}>Store Name *</div>
          <input
            type="text"
            placeholder="e.g. Main Street Store"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addStore() }}
            style={{ width: '100%', padding: '8px 0', fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 'bold', border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: 'var(--ink-faint)', marginBottom: 4, letterSpacing: '.06em', textTransform: 'uppercase' }}>Address (optional)</div>
          <input
            type="text"
            placeholder="e.g. 123 Main St"
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addStore() }}
            style={{ width: '100%', padding: '6px 0', fontFamily: 'var(--mono)', fontSize: 15, border: 'none', borderBottom: '1px solid var(--line-dk)', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
          />
        </div>
        <button
          className="btn btn-red"
          onClick={addStore}
          disabled={adding || !name.trim()}
          style={{ width: '100%', padding: '12px', fontSize: 13 }}
        >
          {adding ? 'ADDING...' : '+ ADD STORE'}
        </button>
      </div>

      {/* Store list */}
      {stores.length === 0 ? (
        <div className="empty" style={{ marginTop: 40 }}>
          — NO STORES YET —<br />
          <span style={{ fontSize: 11, marginTop: 8, display: 'block' }}>Add your first store above</span>
        </div>
      ) : (
        <div>
          <div style={{ padding: '10px 16px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Tap a store to open it
          </div>
          {stores.map(store => (
            <div key={store.id} style={{ borderBottom: '1px solid var(--line)' }}>
              {editing === store.id ? (
                <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') updateStore(store.id); if (e.key === 'Escape') setEditing(null) }}
                    autoFocus
                    style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, border: 'none', borderBottom: '2px solid var(--red)', background: '#fffce8', outline: 'none', padding: '4px 6px', color: 'var(--ink)' }}
                  />
                  <button onClick={() => updateStore(store.id)} className="btn btn-sm">SAVE</button>
                  <button onClick={() => setEditing(null)} className="btn btn-sm btn-ghost">✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    onClick={() => selectStore(store)}
                    style={{ flex: 1, padding: '14px 16px', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: store.address ? 3 : 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{store.name}</span>
                      {selectedId === store.id && (
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'var(--green)', background: 'var(--green-lt)', padding: '2px 7px' }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    {store.address && (
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>{store.address}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, padding: '0 10px' }}>
                    <button
                      onClick={() => { setEditing(store.id); setEditName(store.name) }}
                      className="btn btn-sm btn-ghost"
                    >EDIT</button>
                    <button
                      onClick={() => deleteStore(store.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 18, padding: '4px 6px' }}
                    >×</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}