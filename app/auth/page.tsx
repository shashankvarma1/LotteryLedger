'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthPage() {
  const [mode,     setMode]     = useState<'login' | 'signup'>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [message,  setMessage]  = useState('')
  const redirected = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !redirected.current) {
        redirected.current = true
        window.location.href = '/'
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Account created! Now sign in.')
        setMode('login')
        setLoading(false)
        return
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (!data.session) throw new Error('No session — turn off email confirmation in Supabase dashboard.')

      redirected.current = true
      window.location.href = '/'

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 'bold', letterSpacing: '.12em' }}>⊞ LOTTERY LEDGER</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '.08em', marginTop: 4 }}>MASS LOTTERY AGENT</div>
        </div>

        <div style={{ border: '2px solid var(--ink)', padding: '28px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 24, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus
                style={{ width: '100%', padding: '8px 0', fontFamily: 'var(--mono)', fontSize: 16, border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
              />
            </div>
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={6}
                style={{ width: '100%', padding: '8px 0', fontFamily: 'var(--mono)', fontSize: 16, border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
              />
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--red-lt)', border: '1px solid var(--red)', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>
                {error}
              </div>
            )}
            {message && (
              <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--green-lt)', border: '1px solid var(--green)', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green)', lineHeight: 1.5 }}>
                {message}
              </div>
            )}

            <button type="submit" className="btn btn-red" disabled={loading} style={{ width: '100%', padding: '13px', fontSize: 13 }}>
              {loading ? 'SIGNING IN...' : mode === 'login' ? 'SIGN IN →' : 'CREATE ACCOUNT →'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'var(--ink-faint)' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontWeight: 700, fontSize: 12, textDecoration: 'underline' }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}