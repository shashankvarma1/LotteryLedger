'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session, Book } from '@/lib/supabase'

type TicketValue = { ticket_number: number; value: number; book_size: number }

function n(v: number | null | undefined) { return v ?? 0 }

function calcSold(start: number, end: number, bookSize: number): number {
  if (start === end) return 0
  if (end > start)   return end - start
  return (bookSize - start) + end
}

function calcTotal(sold: number, price: number) {
  return parseFloat((sold * price).toFixed(2))
}

// ─── Generate HTML ────────────────────────────────────────────────────────────

function generateHtml(session: Session, bookMap: Record<number, Book>, tickets: TicketValue[]): string {
  const dateStr   = new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const storeName     = localStorage.getItem('selected_store_name') || ''
  const snapshot      = session.ticket_snapshot as TicketValue[] | null
  const ticketsForPdf = (snapshot && snapshot.length > 0) ? snapshot : tickets

  let grandSold = 0
  let grandAmt  = 0

  const rows = ticketsForPdf.map((ticket, i) => {
    const book     = bookMap[i + 1]
    const price    = ticket.value
    const bookSize = ticket.book_size || 100

    if (!book || book.is_returned) {
      return `<tr style="opacity:.4"><td>${i+1}</td><td>#${ticket.ticket_number}</td><td class="r">$${price}</td><td class="r">—</td><td class="r">—</td><td class="r">—</td><td class="r">—</td></tr>`
    }
    if (book.start_num === null || book.end_num === null) {
      return `<tr><td>${i+1}</td><td>#${ticket.ticket_number}</td><td class="r">$${price}</td><td colspan="4" style="text-align:center;color:#94a3b8;font-style:italic">not entered</td></tr>`
    }

    const s = calcSold(book.start_num, book.end_num, bookSize)
    const t = calcTotal(s, price)
    grandSold += s
    grandAmt   = parseFloat((grandAmt + t).toFixed(2))

    return `<tr>
      <td>${i+1}</td><td>#${ticket.ticket_number}</td>
      <td class="r" style="color:#d97706;font-weight:600">$${price % 1 === 0 ? price : price.toFixed(2)}</td>
      <td class="r">${book.start_num}</td>
      <td class="r">${book.end_num}</td>
      <td class="r">${s}</td>
      <td class="r" style="font-weight:700;color:#059669">$${t.toFixed(2)}</td>
    </tr>`
  }).join('')

  const sr50NetSales  = n(session.sr50_net_sales)
  const sr50Cashes    = n(session.sr50_cashes)
  const ir34Cashes    = n(session.ir34_totals)
  const totalCashes   = parseFloat((sr50Cashes + ir34Cashes).toFixed(2))
  const combinedSales = parseFloat((grandAmt + sr50NetSales).toFixed(2))
  const finalTotal    = parseFloat((grandAmt + sr50NetSales - sr50Cashes - ir34Cashes).toFixed(2))

  const enteredCount = ticketsForPdf.filter((_, i) => {
    const b = bookMap[i + 1]
    return b && !b.is_returned && b.start_num !== null && b.end_num !== null
  }).length

  const finBox1 = `<div class="fin-box revenue"><div class="fin-lbl green">Ticket Revenue</div><div class="fin-val green">$${grandAmt.toFixed(2)}</div><div class="fin-sub">${grandSold} tickets sold</div></div>`
  const finBox2 = `<div class="fin-box sales"><div class="fin-lbl blue">SR50 Net Sales</div><div class="fin-val blue">$${sr50NetSales.toFixed(2)}</div><div class="fin-sub">From SR50 receipt</div></div>`
  const finBox3 = `<div class="fin-box combined"><div class="fin-lbl gold">Ticket Rev + Net Sales</div><div class="fin-val gold">$${combinedSales.toFixed(2)}</div><div class="fin-sub">$${grandAmt.toFixed(2)} + $${sr50NetSales.toFixed(2)}</div></div>`
  const finBox4 = `<div class="fin-box cashes"><div class="fin-lbl red">Total Cashes</div><div class="fin-val red">$${totalCashes.toFixed(2)}</div><div class="fin-sub">SR50: $${sr50Cashes.toFixed(2)} + IR34: $${ir34Cashes.toFixed(2)}</div></div>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Lottery Ledger — ${session.session_date}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', sans-serif; font-size: 12px; color: #0f172a; background: #fff; padding: 32px 36px; max-width: 800px; margin: 0 auto; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 20px; border-bottom: 3px solid #0f172a; margin-bottom: 24px; }
    .logo { font-size: 22px; font-weight: 700; color: #0f172a; }
    .logo span { color: #d97706; }
    .header-meta { text-align: right; }
    .header-date { font-family: 'DM Mono', monospace; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
    .header-store { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 3px; }
    .header-note { font-size: 11px; color: #94a3b8; margin-top: 2px; font-style: italic; }
    .stats-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; text-align: center; }
    .stat-lbl { font-family: 'DM Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #94a3b8; margin-bottom: 6px; }
    .stat-val { font-family: 'DM Mono', monospace; font-size: 22px; font-weight: 700; color: #0f172a; }
    .stat-val.green { color: #059669; } .stat-val.gold { color: #d97706; }
    .section-title { font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: .12em; color: #94a3b8; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #f1f5f9; }
    th { font-family: 'DM Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; font-weight: 500; }
    th.r { text-align: right; }
    td { padding: 10px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; color: #0f172a; text-align: left; vertical-align: middle; }
    td.r { text-align: right; font-family: 'DM Mono', monospace; }
    tbody tr:last-child td { border-bottom: none; }
    tfoot tr td { border-top: 2px solid #0f172a; border-bottom: none; font-weight: 700; padding-top: 10px; font-family: 'DM Mono', monospace; font-size: 13px; background: #f8fafc; }
    .fin-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
    .fin-box { border-radius: 10px; padding: 12px 14px; text-align: center; }
    .fin-box.revenue { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .fin-box.sales { background: #f0f9ff; border: 1px solid #bae6fd; }
    .fin-box.combined { background: #fefce8; border: 2px solid #fbbf24; }
    .fin-box.cashes { background: #fff1f2; border: 1px solid #fecdd3; }
    .fin-lbl { font-family: 'DM Mono', monospace; font-size: 8px; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; line-height: 1.4; }
    .fin-lbl.green { color: #059669; } .fin-lbl.blue { color: #0284c7; } .fin-lbl.gold { color: #b45309; } .fin-lbl.red { color: #e11d48; }
    .fin-val { font-family: 'DM Mono', monospace; font-size: 17px; font-weight: 700; }
    .fin-val.green { color: #059669; } .fin-val.blue { color: #0284c7; } .fin-val.gold { color: #b45309; } .fin-val.red { color: #e11d48; }
    .fin-sub { font-size: 9px; color: #94a3b8; margin-top: 4px; line-height: 1.3; }
    .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .report-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
    .report-box-title { font-family: 'DM Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #94a3b8; margin-bottom: 10px; }
    .report-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
    .report-row:last-child { border-bottom: none; }
    .report-row.total { border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 8px; }
    .report-label { color: #64748b; } .report-label.bold { font-weight: 600; color: #0f172a; }
    .report-value { font-family: 'DM Mono', monospace; font-weight: 600; }
    .report-value.plus { color: #0284c7; } .report-value.minus { color: #e11d48; } .report-value.neutral { color: #0f172a; font-weight: 700; }
    .final-box { border-radius: 12px; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .final-box.positive { background: #f0fdf4; border: 2px solid #059669; }
    .final-box.negative { background: #fff1f2; border: 2px solid #e11d48; }
    .final-label { font-family: 'DM Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 6px; }
    .final-label.positive { color: #059669; } .final-label.negative { color: #e11d48; }
    .final-value { font-family: 'DM Mono', monospace; font-size: 40px; font-weight: 700; line-height: 1; }
    .final-value.positive { color: #059669; } .final-value.negative { color: #e11d48; }
    .final-formula { font-size: 10px; color: #94a3b8; margin-top: 6px; line-height: 1.5; }
    .final-icon { font-size: 52px; opacity: .12; }
    .page-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; font-family: 'DM Mono', monospace; }
    @media print { body { padding: 20px 24px; } }
  </style>
</head>
<body>
  <div class="page-header">
    <div>
      <div class="logo">🎰 Lottery <span>Ledger</span></div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.06em">Daily Report</div>
    </div>
    <div class="header-meta">
      <div class="header-date">${dateStr}</div>
      <div class="header-store">${storeName || 'Store'}</div>
      ${session.notes ? `<div class="header-note">${session.notes}</div>` : ''}
    </div>
  </div>
  <div class="stats-strip">
    <div class="stat-box"><div class="stat-lbl">Tickets Entered</div><div class="stat-val">${enteredCount}/${ticketsForPdf.length}</div></div>
    <div class="stat-box"><div class="stat-lbl">Total Sold</div><div class="stat-val gold">${grandSold}</div></div>
    <div class="stat-box"><div class="stat-lbl">Ticket Revenue</div><div class="stat-val green">$${grandAmt.toFixed(2)}</div></div>
  </div>
  <div class="section-title">Ticket Ledger</div>
  <table>
    <thead><tr><th>#</th><th>Ticket</th><th class="r">Price</th><th class="r">Start</th><th class="r">End</th><th class="r">Sold</th><th class="r">Total</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="5" style="text-align:left;font-size:10px;color:#64748b;letter-spacing:.06em;text-transform:uppercase">Ticket Total</td>
      <td class="r">${grandSold}</td>
      <td class="r" style="color:#059669">$${grandAmt.toFixed(2)}</td>
    </tr></tfoot>
  </table>
  <div class="section-title">Financial Summary</div>
  <div class="fin-grid">${finBox1}${finBox2}${finBox3}${finBox4}</div>
  <div class="section-title">SR50 &amp; IR34 Detail</div>
  <div class="report-grid">
    <div class="report-box">
      <div class="report-box-title">SR50 — Invoice</div>
      <div class="report-row"><span class="report-label">Net Sales</span><span class="report-value plus">$${sr50NetSales.toFixed(2)}</span></div>
      <div class="report-row"><span class="report-label">SR50 Cashes</span><span class="report-value minus">−$${sr50Cashes.toFixed(2)}</span></div>
      <div class="report-row total"><span class="report-label bold">SR50 Net</span><span class="report-value neutral">$${(sr50NetSales - sr50Cashes).toFixed(2)}</span></div>
    </div>
    <div class="report-box">
      <div class="report-box-title">IR34 — Cashing</div>
      <div class="report-row"><span class="report-label">IR34 Cashes</span><span class="report-value minus">−$${ir34Cashes.toFixed(2)}</span></div>
      <div class="report-row"><span class="report-label">Ticket Revenue</span><span class="report-value neutral">$${grandAmt.toFixed(2)}</span></div>
      <div class="report-row total"><span class="report-label bold">Total Cashes</span><span class="report-value minus">$${totalCashes.toFixed(2)}</span></div>
    </div>
  </div>
  <div class="final-box ${finalTotal >= 0 ? 'positive' : 'negative'}">
    <div>
      <div class="final-label ${finalTotal >= 0 ? 'positive' : 'negative'}">Final Total</div>
      <div class="final-value ${finalTotal >= 0 ? 'positive' : 'negative'}">${finalTotal >= 0 ? '$' : '−$'}${Math.abs(finalTotal).toFixed(2)}</div>
      <div class="final-formula">
        Ticket Revenue ($${grandAmt.toFixed(2)}) + SR50 Net Sales ($${sr50NetSales.toFixed(2)})<br>
        − SR50 Cashes ($${sr50Cashes.toFixed(2)}) − IR34 Cashes ($${ir34Cashes.toFixed(2)})
      </div>
    </div>
    <div class="final-icon">${finalTotal >= 0 ? '✓' : '!'}</div>
  </div>
  <div class="page-footer">
    <span>Generated ${new Date().toLocaleString()}</span>
    <span>${storeName} · Lottery Ledger</span>
  </div>
</body>
</html>`
}

// ─── Report Panel ─────────────────────────────────────────────────────────────

function ReportPanel({ session, onSave }: { session: Session; onSave: (s: Session) => void }) {
  const [tab,    setTab]    = useState<'sr50' | 'ir34'>('sr50')
  const [draft,  setDraft]  = useState<Partial<Session>>({})
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const merged = { ...session, ...draft }

  async function save() {
    if (Object.keys(draft).length === 0) return
    setSaving(true)
    const { data } = await supabase.from('sessions').update(draft).eq('id', session.id).select().single()
    if (data) {
      onSave(data); setDraft({})
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  function fi(key: keyof Session, label: string) {
    return (
      <div style={{ marginBottom: 14 }}>
        <label className="field-label">{label}</label>
        <input
          type="number" inputMode="decimal" step="0.01"
          value={draft[key] !== undefined ? String(draft[key]) : String(merged[key] ?? '')}
          onChange={e => setDraft(p => ({ ...p, [key]: e.target.value === '' ? 0 : Number(e.target.value) }))}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="0.00" className="field-input"
          style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700 }}
        />
      </div>
    )
  }

  return (
    <div className="report-panel">
      <div className="report-tab-row">
        <button className={`report-tab ${tab === 'sr50' ? 'active' : ''}`} onClick={() => setTab('sr50')}>SR50</button>
        <button className={`report-tab ${tab === 'ir34' ? 'active' : ''}`} onClick={() => setTab('ir34')}>IR34</button>
      </div>
      <div className="report-body">
        {saved && (
          <div style={{ marginBottom: 14, padding: '8px 14px', background: 'var(--emerald-lt)', border: '1px solid var(--emerald)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--emerald)', fontWeight: 600 }}>
            ✓ Values saved
          </div>
        )}
        {saving && <div style={{ marginBottom: 14, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)' }}>Saving...</div>}
        {tab === 'sr50' && (<>
          <div className="report-grid">
            <div className="rbox"><div className="rbox-lbl">Net Sales</div><div className="rbox-val" style={{ color: 'var(--sky)' }}>${n(merged.sr50_net_sales).toFixed(2)}</div></div>
            <div className="rbox"><div className="rbox-lbl">SR50 Cashes</div><div className="rbox-val red">${n(merged.sr50_cashes).toFixed(2)}</div></div>
          </div>
          <div className="divider" />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 14 }}>Enter from SR50 receipt</div>
          {fi('sr50_net_sales', 'Net Sales')}
          {fi('sr50_cashes', 'SR50 Cashes')}
        </>)}
        {tab === 'ir34' && (<>
          <div className="report-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="rbox"><div className="rbox-lbl">IR34 Cashes</div><div className="rbox-val red">${n(merged.ir34_totals).toFixed(2)}</div></div>
          </div>
          <div className="divider" />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 14 }}>Enter from IR34</div>
          {fi('ir34_totals', 'IR34 Cashes')}
        </>)}
      </div>
    </div>
  )
}

// ─── NumInput ─────────────────────────────────────────────────────────────────

function NumInput({ value, placeholder, onSave, onEnter, disabled }: {
  value: number | null
  placeholder?: string
  onSave: (v: number | null) => void
  onEnter?: () => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const ref = useRef<HTMLInputElement>(null)

  function startEdit() {
    if (disabled) return
    setEditing(true)
    setDraft(value !== null ? String(value) : '')
    setTimeout(() => { ref.current?.focus(); ref.current?.select() }, 20)
  }

  function commit() {
    setEditing(false)
    const parsed = draft.trim() === '' ? null : Number(draft)
    onSave(isNaN(parsed as number) ? null : parsed)
  }

  if (editing && !disabled) {
    return (
      <input ref={ref} type="number" inputMode="numeric"
        value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); setTimeout(() => onEnter?.(), 60) }
          if (e.key === 'Escape') setEditing(false)
        }}
        style={{ width: '100%', height: 46, padding: '0 10px', fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, textAlign: 'right', border: 'none', background: 'rgba(240,165,0,0.08)', outline: '2px solid var(--gold)', color: 'var(--ink)' }}
      />
    )
  }

  return (
    <div onClick={startEdit} style={{
      height: 46, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      padding: '0 10px', cursor: disabled ? 'default' : 'text',
      fontFamily: 'var(--mono)', fontSize: 15,
      color: value !== null ? 'var(--ink)' : 'var(--ink-ghost)',
      fontWeight: value !== null ? 600 : 400,
      opacity: disabled && value === null ? 0.4 : 1,
    }}>
      {value !== null
        ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {value}
            {!disabled && <span style={{ fontSize: 10, color: 'var(--ink-ghost)' }}>✎</span>}
          </span>
        : (placeholder || '—')
      }
    </div>
  )
}

// ─── Notes Input ──────────────────────────────────────────────────────────────

function NotesInput({ session, onSave, disabled }: {
  session: Session
  onSave: (s: Session) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(session.notes || '')
  const [saving,  setSaving]  = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  async function commit() {
    if (disabled) return
    setEditing(false)
    if (draft === (session.notes || '')) return
    setSaving(true)
    const { data } = await supabase.from('sessions')
      .update({ notes: draft || null }).eq('id', session.id).select().single()
    if (data) onSave(data)
    setSaving(false)
  }

  if (editing && !disabled) {
    return (
      <input ref={ref} autoFocus type="text" value={draft}
        placeholder="Add a note for this session..."
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setEditing(false); setDraft(session.notes || '') }
        }}
        style={{ flex: 1, border: 'none', outline: 'none', background: 'rgba(240,165,0,0.06)', borderBottom: '1px solid var(--gold)', fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--ink)', padding: '4px 8px', borderRadius: 4 }}
      />
    )
  }

  return (
    <div
      onClick={disabled ? undefined : () => { setEditing(true); setTimeout(() => ref.current?.focus(), 20) }}
      style={{ flex: 1, cursor: disabled ? 'default' : 'text', fontFamily: 'var(--sans)', fontSize: 12, padding: '4px', color: session.notes ? 'var(--ink-mid)' : 'var(--ink-ghost)', display: 'flex', alignItems: 'center', gap: 6, opacity: disabled ? 0.7 : 1 }}
    >
      {saving ? 'Saving...' : (session.notes || (disabled ? '—' : 'Add note...'))}
      {!saving && !disabled && <span style={{ fontSize: 10, color: 'var(--ink-ghost)' }}>✎</span>}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SessionPage({ params }: { params: { id: string } }) {
  const [session,    setSession]    = useState<Session | null>(null)
  const [tickets,    setTickets]    = useState<TicketValue[]>([])
  const [bookMap,    setBookMap]    = useState<Record<number, Book>>({})
  const [loading,    setLoading]    = useState(true)
  const [toast,      setToast]      = useState('')
  const [showReport, setShowReport] = useState(false)
  const [isOnline,   setIsOnline]   = useState(true)
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [savingPdf,  setSavingPdf]  = useState(false)
  const redirected    = useRef(false)
  const startCellRefs = useRef<(HTMLDivElement | null)[]>([])
  const endCellRefs   = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    if (localStorage.getItem('light_mode')  === 'true') document.body.classList.add('light')
    if (localStorage.getItem('large_fonts') === 'true') document.body.classList.add('text-lg')
  }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    const { data: { session: auth } } = await supabase.auth.getSession()
    if (!auth) {
      if (!redirected.current) { redirected.current = true; window.location.href = '/auth' }
      return
    }
    const sid = localStorage.getItem('selected_store_id')
    if (!sid) { window.location.href = '/stores'; return }

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', auth.user.id).single()
    setIsAdmin(profile?.role === 'admin')

    const [{ data: sess }, { data: bks }, { data: tvs }] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', params.id).single(),
      supabase.from('books').select('*').eq('session_id', params.id).order('row_number'),
      supabase.from('ticket_values').select('*').eq('store_id', sid).order('ticket_number'),
    ])

    if (sess) {
      const sessionIsToday = sess.session_date === new Date().toLocaleDateString('en-CA')

      if (sessionIsToday) {
        // ── Today: always use live ticket_values so settings changes reflect immediately ──
        // Update snapshot silently in background so PDF uses today's latest prices
        if (tvs) {
          const snapshot = tvs.map((t: TicketValue) => ({
            ticket_number: t.ticket_number,
            value:         t.value,
            book_size:     t.book_size,
          }))
          supabase.from('sessions')
            .update({ ticket_snapshot: snapshot })
            .eq('id', sess.id)
            .then(() => {})  // fire and forget
          setTickets(tvs)
        }
        setSession(sess)
      } else {
        // ── Past sessions: use snapshot to preserve old prices ──
        if (tvs && !sess.ticket_snapshot) {
          // Save snapshot if not already saved
          const snapshot = tvs.map((t: TicketValue) => ({
            ticket_number: t.ticket_number,
            value:         t.value,
            book_size:     t.book_size,
          }))
          const { data: updated } = await supabase
            .from('sessions')
            .update({ ticket_snapshot: snapshot })
            .eq('id', sess.id)
            .select().single()
          if (updated) setSession(updated)
          else setSession(sess)
        } else {
          setSession(sess)
        }

        // Use snapshot for display on past sessions
        if (sess.ticket_snapshot) {
          const snapshot = sess.ticket_snapshot as TicketValue[]
          if (snapshot && snapshot.length > 0) {
            setTickets(snapshot)
          } else if (tvs) {
            setTickets(tvs)
          }
        } else if (tvs) {
          setTickets(tvs)
        }
      }
    }

    if (bks) {
      const map: Record<number, Book> = {}
      bks.forEach(b => { map[b.row_number] = b })
      setBookMap(map)
    }
    setLoading(false)
  }, [params.id])

  useEffect(() => { load() }, [load])

  async function saveBookField(ticketIndex: number, field: 'start_num' | 'end_num', value: number | null) {
    const { data: { session: auth } } = await supabase.auth.getSession()
    if (!auth || !session) return
    const existingBook = bookMap[ticketIndex + 1]
    const ticket       = tickets[ticketIndex]

    if (existingBook) {
      const { data } = await supabase.from('books')
        .update({ [field]: value }).eq('id', existingBook.id).select().single()
      if (data) {
        setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
        const updated  = { ...existingBook, [field]: value }
        const bookSize = ticket?.book_size || 100
        if (updated.start_num !== null && updated.end_num !== null && ticket) {
          const s = calcSold(updated.start_num, updated.end_num, bookSize)
          showToast(`#${ticket.ticket_number} → ${s} sold · $${calcTotal(s, ticket.value).toFixed(2)}`)
          if (navigator.vibrate) navigator.vibrate(40)
        }
      }
    } else {
      const { data } = await supabase.from('books').insert({
        session_id:  session.id,
        row_number:  ticketIndex + 1,
        is_returned: false,
        user_id:     auth.user.id,
        start_num:   null,
        end_num:     null,
        [field]:     value,
      }).select().single()
      if (data) setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
    }
  }

  async function toggleReturn(ticketIndex: number) {
    const { data: { session: auth } } = await supabase.auth.getSession()
    if (!auth || !session) return
    const existingBook = bookMap[ticketIndex + 1]
    const newReturned  = !existingBook?.is_returned

    if (existingBook) {
      const { data } = await supabase.from('books')
        .update({ is_returned: newReturned }).eq('id', existingBook.id).select().single()
      if (data) setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
    } else {
      const { data } = await supabase.from('books').insert({
        session_id:  session.id,
        row_number:  ticketIndex + 1,
        is_returned: true,
        user_id:     auth.user.id,
        start_num:   null,
        end_num:     null,
      }).select().single()
      if (data) setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
    }
    if (navigator.vibrate) navigator.vibrate(40)
    showToast(newReturned ? 'Marked as returned' : 'Unmarked')
  }

  async function copyFromYesterday() {
    const { data: { session: auth } } = await supabase.auth.getSession()
    if (!auth || !session) return

    const yesterday = new Date(session.session_date + 'T00:00:00')
    yesterday.setDate(yesterday.getDate() - 1)
    const yDate = yesterday.toLocaleDateString('en-CA')
    const sid   = localStorage.getItem('selected_store_id')

    const { data: prevSession } = await supabase
      .from('sessions').select('id')
      .eq('store_id', sid || '').eq('session_date', yDate).maybeSingle()

    if (!prevSession) { showToast('No session found for yesterday'); return }

    const { data: prevBooks } = await supabase
      .from('books').select('*')
      .eq('session_id', prevSession.id).order('row_number')

    if (!prevBooks || prevBooks.length === 0) { showToast("No data in yesterday's session"); return }

    let copied = 0
    for (const prevBook of prevBooks) {
      const rowNum = prevBook.row_number
      if (prevBook.end_num === null) continue
      const existing = bookMap[rowNum]

      if (existing) {
        if (existing.start_num !== null) continue
        const { data } = await supabase.from('books')
          .update({ start_num: prevBook.end_num }).eq('id', existing.id).select().single()
        if (data) setBookMap(prev => ({ ...prev, [rowNum]: data }))
      } else {
        const { data } = await supabase.from('books').insert({
          session_id:  session.id,
          row_number:  rowNum,
          is_returned: false,
          user_id:     auth.user.id,
          start_num:   prevBook.end_num,
          end_num:     null,
        }).select().single()
        if (data) setBookMap(prev => ({ ...prev, [rowNum]: data }))
      }
      copied++
    }

    if (navigator.vibrate) navigator.vibrate([40, 30, 40])
    showToast(copied > 0 ? `✓ Copied ${copied} start numbers from yesterday` : 'Nothing to copy')
  }

  async function handlePrint() {
    if (!session) return
    setSavingPdf(true)

    const html = generateHtml(session, bookMap, tickets)

    const { data } = await supabase
      .from('sessions')
      .update({
        pdf_html:     html,
        pdf_saved_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .select().single()

    if (data) setSession(data)
    setSavingPdf(false)
    showToast('✓ PDF saved to History')

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => w.print(), 500)
  }

  // ── Totals ──
  const grandSold = tickets.reduce((sum, ticket, idx) => {
    const b        = bookMap[idx + 1]
    const bookSize = ticket.book_size || 100
    if (!b || b.is_returned || b.start_num === null || b.end_num === null) return sum
    return sum + calcSold(b.start_num, b.end_num, bookSize)
  }, 0)

  const grandAmt = tickets.reduce((sum, ticket, idx) => {
    const b        = bookMap[idx + 1]
    const bookSize = ticket.book_size || 100
    if (!b || b.is_returned || b.start_num === null || b.end_num === null) return sum
    const sold = calcSold(b.start_num, b.end_num, bookSize)
    return parseFloat((sum + calcTotal(sold, ticket.value)).toFixed(2))
  }, 0)

  // ── Save ticket_revenue (debounced) ──
  useEffect(() => {
    if (!session || loading) return
    if (grandAmt === n(session.ticket_revenue)) return
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('sessions')
        .update({ ticket_revenue: grandAmt }).eq('id', session.id).select().single()
      if (data) setSession(data)
    }, 1000)
    return () => clearTimeout(timer)
  }, [grandAmt, session?.id, loading])

  const enteredCount = tickets.filter((_, idx) => {
    const b = bookMap[idx + 1]
    return b && !b.is_returned && b.start_num !== null && b.end_num !== null
  }).length

  const sr50NetSales = n(session?.sr50_net_sales)
  const sr50Cashes   = n(session?.sr50_cashes)
  const ir34Cashes   = n(session?.ir34_totals)
  const finalTotal   = parseFloat((grandAmt + sr50NetSales - sr50Cashes - ir34Cashes).toFixed(2))
  const hasFinalData = sr50NetSales > 0 || sr50Cashes > 0 || ir34Cashes > 0

  const storeName = typeof window !== 'undefined' ? localStorage.getItem('selected_store_name') || '' : ''

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>
  if (!session) return <div className="empty" style={{ marginTop: 80 }}>NOT FOUND</div>

  const sessionDate = new Date(session.session_date + 'T00:00:00')
  const isToday     = session.session_date === new Date().toLocaleDateString('en-CA')
  const isLocked    = !isAdmin && !isToday

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', paddingBottom: 80 }}>

      {!isOnline && <div className="offline-banner">⚠ No internet connection — changes may not save</div>}

      <header className="hdr" style={{ marginTop: !isOnline ? 38 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/?noredirect=1" style={{ fontSize: 20, color: 'var(--ink-faint)', textDecoration: 'none', padding: '4px 8px 4px 0', lineHeight: 1 }}>←</a>
          <div>
            <div className="hdr-title">
              {isToday ? '⭐ TODAY' : sessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </div>
            <div className="hdr-sub">{storeName} · {enteredCount}/{tickets.length} ENTERED</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {enteredCount > 0 && !isLocked && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--emerald)' }}>✓ saved</span>
          )}
          {isLocked && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--gold)' }}>🔒 locked</span>
          )}
          {isAdmin && !isToday && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--sky)' }}>admin</span>
          )}
          <a href="/history" className="btn btn-ghost btn-sm">History</a>
        </div>
      </header>

      {isLocked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: 'rgba(240,165,0,0.06)', borderBottom: '1px solid var(--line-dk)', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--gold)', letterSpacing: '.04em' }}>
          🔒 This session is from a previous day — view only. Only admins can edit past sessions.
        </div>
      )}

      <div className="sbar">
        <div className="sbar-cell">
          <div className="sbar-lbl">Entered</div>
          <div className="sbar-val">{enteredCount}<span style={{ fontSize: 14, color: 'var(--ink-faint)', fontWeight: 400 }}>/{tickets.length}</span></div>
        </div>
        <div className="sbar-cell">
          <div className="sbar-lbl">Total Sold</div>
          <div className="sbar-val">{grandSold}</div>
        </div>
        <div className="sbar-cell">
          <div className="sbar-lbl">Ticket Revenue</div>
          <div className="sbar-val green">${grandAmt.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--navy-mid)', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Note</span>
        <NotesInput session={session} onSave={s => setSession(s)} disabled={isLocked} />
        {!isLocked && (
          <button onClick={copyFromYesterday} className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            ⬆ Yesterday
          </button>
        )}
      </div>

      {tickets.length === 0 && (
        <div style={{ margin: 18, padding: '14px 18px', background: 'var(--rose-lt)', border: '1px solid var(--rose)', borderRadius: 10, fontSize: 13, color: 'var(--rose)' }}>
          ⚠ No tickets configured. Go to{' '}
          <a href="/settings" style={{ color: 'var(--rose)', fontWeight: 700 }}>Settings</a> first.
        </div>
      )}

      {tickets.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl" style={{ tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Ticket</th>
                <th>Price</th>
                <th>Start</th>
                <th>End</th>
                <th>Sold</th>
                <th>Total</th>
                {!isLocked && <th style={{ width: 40 }} />}
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket, idx) => {
                const book       = bookMap[idx + 1]
                const isReturned = book?.is_returned ?? false
                const startNum   = book?.start_num ?? null
                const endNum     = book?.end_num   ?? null
                const hasData    = startNum !== null && endNum !== null
                const bookSize   = ticket.book_size || 100
                const isFinished = ticket.value === 0
                const s          = hasData && !isReturned ? calcSold(startNum!, endNum!, bookSize) : null
                const t          = s !== null ? calcTotal(s, ticket.value) : null

                return (
                  <tr key={ticket.ticket_number} className={isReturned ? 'ret' : ''}
                    style={{ background: !isReturned && !hasData && !isFinished && !isLocked ? 'rgba(240,165,0,0.03)' : undefined }}>
                    <td>
                      <div style={{ height: 46, display: 'flex', alignItems: 'center', paddingLeft: 12, gap: 8 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: isFinished || isReturned ? 'var(--ink-faint)' : 'var(--ink)' }}>
                          #{ticket.ticket_number}
                        </span>
                        {isFinished && !isReturned && <span className="badge badge-muted">DONE</span>}
                        {!hasData && !isReturned && !isFinished && !isLocked && (
                          <span style={{ fontSize: 10, color: 'var(--ink-ghost)' }}>tap</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ height: 46, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: isFinished ? 'var(--ink-faint)' : 'var(--gold)' }}>
                          ${ticket.value % 1 === 0 ? ticket.value : ticket.value.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td style={{ minWidth: 68 }} ref={el => { startCellRefs.current[idx] = el }}>
                      {isReturned
                        ? <div style={{ height: 46, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 10px', color: 'var(--ink-ghost)' }}>—</div>
                        : <NumInput value={startNum} placeholder="start"
                            onSave={v => saveBookField(idx, 'start_num', v)}
                            onEnter={() => endCellRefs.current[idx]?.click()}
                            disabled={isLocked}
                          />
                      }
                    </td>
                    <td style={{ minWidth: 68 }} ref={el => { endCellRefs.current[idx] = el }}>
                      {isReturned
                        ? <div style={{ height: 46, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 10px', color: 'var(--ink-ghost)' }}>—</div>
                        : <NumInput value={endNum} placeholder="end"
                            onSave={v => saveBookField(idx, 'end_num', v)}
                            onEnter={() => startCellRefs.current[idx + 1]?.click()}
                            disabled={isLocked}
                          />
                      }
                    </td>
                    <td>
                      <div style={{ height: 46, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10, fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: s === 0 ? 'var(--ink-faint)' : 'var(--ink)' }}>
                        {isReturned ? '—' : (s !== null ? s : '')}
                      </div>
                    </td>
                    <td>
                      <div style={{ height: 46, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10, fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: t !== null && t > 0 ? 'var(--emerald)' : 'var(--ink-faint)' }}>
                        {isReturned ? '—' : (t !== null ? '$' + t.toFixed(2) : '')}
                      </div>
                    </td>
                    {!isLocked && (
                      <td>
                        <button className="xbtn" onClick={() => toggleReturn(idx)}
                          style={{ color: isReturned ? 'var(--emerald)' : 'var(--ink-ghost)', fontSize: isReturned ? 13 : 18 }}>
                          {isReturned ? '↩' : '—'}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'left', color: 'var(--ink-faint)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>TOTAL</td>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{grandSold}</td>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--emerald)' }}>${grandAmt.toFixed(2)}</td>
                {!isLocked && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!isLocked && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--line)' }}>
          <button className={`btn ${showReport ? 'btn-gold' : 'btn-ghost'}`}
            onClick={() => setShowReport(v => !v)}
            style={{ width: '100%', padding: '13px', fontSize: 13, borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0 }}>
            {showReport ? '▾' : '▸'} SR50 / IR34
          </button>
        </div>
      )}

      {!isLocked && showReport && <ReportPanel session={session} onSave={s => setSession(s)} />}

      {!isLocked && hasFinalData && !showReport && (
        <div onClick={() => setShowReport(true)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', background: 'var(--navy-mid)', borderTop: '1px solid var(--line-dk)', padding: '12px 16px', gap: 8 }}>
            {[
              { label: 'Tickets',     val: `$${grandAmt.toFixed(2)}`,    color: 'var(--ink)' },
              { label: '+ Net Sales', val: `$${sr50NetSales.toFixed(2)}`, color: 'var(--sky)' },
              { label: '− SR50',      val: `$${sr50Cashes.toFixed(2)}`,  color: 'var(--rose)' },
              { label: '− IR34',      val: `$${ir34Cashes.toFixed(2)}`,  color: 'var(--rose)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '14px 18px', background: finalTotal >= 0 ? 'var(--emerald-lt)' : 'var(--rose-lt)', borderTop: `1px solid ${finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)', marginBottom: 4 }}>Final Total</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700, color: finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)', lineHeight: 1 }}>${finalTotal.toFixed(2)}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', marginTop: 5 }}>Tickets + Net Sales − SR50 − IR34 Cashes</div>
            </div>
            <span style={{ color: finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)', fontSize: 14 }}>edit →</span>
          </div>
        </div>
      )}

      {isLocked && hasFinalData && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', background: 'var(--navy-mid)', borderTop: '1px solid var(--line-dk)', padding: '12px 16px', gap: 8 }}>
            {[
              { label: 'Tickets',     val: `$${grandAmt.toFixed(2)}`,    color: 'var(--ink)' },
              { label: '+ Net Sales', val: `$${sr50NetSales.toFixed(2)}`, color: 'var(--sky)' },
              { label: '− SR50',      val: `$${sr50Cashes.toFixed(2)}`,  color: 'var(--rose)' },
              { label: '− IR34',      val: `$${ir34Cashes.toFixed(2)}`,  color: 'var(--rose)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '14px 18px', background: finalTotal >= 0 ? 'var(--emerald-lt)' : 'var(--rose-lt)', borderTop: `1px solid ${finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)'}` }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)', marginBottom: 4 }}>Final Total</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700, color: finalTotal >= 0 ? 'var(--emerald)' : 'var(--rose)', lineHeight: 1 }}>${finalTotal.toFixed(2)}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', marginTop: 5 }}>Tickets + Net Sales − SR50 − IR34 Cashes</div>
          </div>
        </div>
      )}

      {!isLocked && !hasFinalData && !showReport && grandAmt > 0 && (
        <div onClick={() => setShowReport(true)} style={{ padding: '14px 18px', background: 'var(--card)', borderTop: '1px solid var(--line-dk)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--gold)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Enter SR50 &amp; IR34</div>
            <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Tap to calculate final total</div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>${grandAmt.toFixed(2)} →</div>
        </div>
      )}

      {enteredCount > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 18px', background: 'var(--navy-glass)', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--line-dk)', display: 'flex', gap: 10, zIndex: 50, maxWidth: 620, margin: '0 auto' }}>
          <button
            className="btn btn-gold"
            onClick={handlePrint}
            disabled={savingPdf}
            style={{ flex: 1, padding: '14px', fontSize: 14, fontWeight: 700, borderRadius: 12 }}
          >
            {savingPdf ? 'Saving...' : `⎙ ${isLocked ? 'Print PDF' : 'Save & Print PDF'}`}
          </button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}