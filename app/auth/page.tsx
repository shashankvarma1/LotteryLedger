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
      if (session && !redirected.current) { redirected.current = true; window.location.href = '/' }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Account created! Now sign in.')
        setMode('login'); setLoading(false); return
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (!data.session) throw new Error('No session — turn off email confirmation in Supabase.')
      redirected.current = true
      window.location.href = '/'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
      background: 'var(--navy)',
      backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(240,165,0,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(16,185,129,0.06) 0%, transparent 50%)',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg, var(--gold), var(--gold-lt))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, margin: '0 auto 16px', boxShadow: 'var(--shadow-gold)',
          }}>🎰</div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-.01em' }}>
            Lottery Ledger
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '.1em', marginTop: 4, textTransform: 'uppercase' }}>
            Mass Lottery Agent
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--line-dk)',
          borderRadius: 20, padding: '32px 28px',
          boxShadow: 'var(--shadow)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: 'var(--ink)' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="you@example.com"
                className="field-input"
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label className="field-label">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={6} placeholder="••••••••"
                className="field-input"
              />
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--rose-lt)', border: '1px solid var(--rose)', borderRadius: 8, fontSize: 13, color: 'var(--rose)' }}>
                {error}
              </div>
            )}
            {message && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--emerald-lt)', border: '1px solid var(--emerald)', borderRadius: 8, fontSize: 13, color: 'var(--emerald)' }}>
                {message}
              </div>
            )}

            <button type="submit" className="btn btn-gold" disabled={loading}
              style={{ width: '100%', padding: '14px', fontSize: 14, borderRadius: 10 }}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--ink-faint)' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontWeight: 600, fontSize: 13 }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}