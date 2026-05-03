'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session, Book } from '@/lib/supabase'

type TicketValue = { ticket_number: number; value: number }

function n(v: number | null | undefined) { return v ?? 0 }
function calcSold(start: number, end: number) { return Math.max(0, end - start) }
function calcTotal(sold: number, price: number) { return parseFloat((sold * price).toFixed(2)) }

// ─── PDF ─────────────────────────────────────────────────────────────────────

function printSession(session: Session, books: Book[], tickets: TicketValue[]) {
  const dateStr   = new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const storeName = localStorage.getItem('selected_store_name') || ''

  let grandSold = 0
  let grandAmt  = 0

  const rows = tickets.map((ticket, i) => {
    const book  = books[i]
    const price = ticket.value
    if (!book || book.is_returned) {
      return `<tr style="opacity:.4"><td>${i+1}</td><td>#${ticket.ticket_number}</td><td style="text-align:right">$${price}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`
    }
    if (book.start_num === null || book.end_num === null) {
      return `<tr><td>${i+1}</td><td>#${ticket.ticket_number}</td><td style="text-align:right">$${price}</td><td colspan="4" style="text-align:center;color:#aaa">not entered</td></tr>`
    }
    const s = calcSold(book.start_num, book.end_num)
    const t = calcTotal(s, price)
    grandSold += s
    grandAmt   = parseFloat((grandAmt + t).toFixed(2))
    return `<tr>
      <td>${i+1}</td><td>#${ticket.ticket_number}</td>
      <td style="text-align:right">$${price}</td>
      <td style="text-align:right">${book.start_num}</td>
      <td style="text-align:right">${book.end_num}</td>
      <td style="text-align:right">${s}</td>
      <td style="text-align:right;font-weight:bold;color:#1a6b3a">$${t.toFixed(2)}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ledger — ${dateStr}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;font-size:11px;color:#000;padding:24px 28px}
h1{font-size:14px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:4px}
.meta{font-size:10px;color:#666;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{font-size:8px;letter-spacing:.07em;text-transform:uppercase;color:#888;border-bottom:2px solid #000;padding:3px 5px;text-align:right}
th.l{text-align:left}
td{padding:4px 5px;border-bottom:1px solid #ddd;text-align:right}
td.l{text-align:left}
tfoot td{border-top:2px solid #000;border-bottom:none;font-weight:bold;padding-top:6px}
.summary{display:flex;gap:24px;margin-top:14px;padding-top:12px;border-top:2px solid #000}
.s-lbl{font-size:8px;text-transform:uppercase;color:#888;margin-bottom:2px}
.s-val{font-size:18px;font-weight:bold}.green{color:#1a6b3a}
footer{margin-top:20px;font-size:8px;color:#bbb;border-top:1px solid #eee;padding-top:6px}
</style></head><body>
<h1>Lottery Ledger${storeName ? ' — ' + storeName : ''}</h1>
<div class="meta">${dateStr.toUpperCase()}${session.notes ? ' · ' + session.notes : ''}</div>
<table>
  <thead><tr>
    <th class="l">#</th><th class="l">Ticket</th><th>Price</th>
    <th>Start</th><th>End</th><th>Sold</th><th>Total</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="5" class="l" style="font-size:8px;color:#888">TOTAL</td>
    <td>${grandSold}</td>
    <td class="green">$${grandAmt.toFixed(2)}</td>
  </tr></tfoot>
</table>
<div class="summary">
  <div><div class="s-lbl">Total Sold</div><div class="s-val">${grandSold}</div></div>
  <div><div class="s-lbl">Revenue</div><div class="s-val green">$${grandAmt.toFixed(2)}</div></div>
</div>
<footer>Printed ${new Date().toLocaleString()}</footer>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html); w.document.close(); w.focus()
  setTimeout(() => w.print(), 320)
}

// ─── Report Panel ─────────────────────────────────────────────────────────────

function ReportPanel({ session, onSave }: { session: Session; onSave: (s: Session) => void }) {
  const [tab,    setTab]    = useState<'sr50' | 'ir34'>('sr50')
  const [draft,  setDraft]  = useState<Partial<Session>>({})
  const [saving, setSaving] = useState(false)
  const merged = { ...session, ...draft }

  async function save() {
    if (Object.keys(draft).length === 0) return
    setSaving(true)
    const { data } = await supabase.from('sessions').update(draft).eq('id', session.id).select().single()
    if (data) { onSave(data); setDraft({}) }
    setSaving(false)
  }

  function fi(key: keyof Session, label: string) {
    return (
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 5 }}>{label}</label>
        <input
          type="number" inputMode="decimal" step="0.01"
          value={draft[key] !== undefined ? String(draft[key]) : String(merged[key] ?? '')}
          onChange={e => setDraft(p => ({ ...p, [key]: e.target.value === '' ? 0 : Number(e.target.value) }))}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="0.00"
          style={{ width: '100%', padding: '6px 0', fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 'bold', border: 'none', borderBottom: '2px solid var(--line-dk)', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
        />
      </div>
    )
  }

  const computedNet = parseFloat((
    n(merged.sr50_net_sales) - n(merged.sr50_commission) - n(merged.sr50_cashes)
    - n(merged.sr50_cash_bonus) - n(merged.sr50_claims_bonus)
    + n(merged.sr50_adjustments) - n(merged.sr50_service_fee)
  ).toFixed(2))

  return (
    <div className="report-panel">
      <div className="report-tab-row">
        <button className={`report-tab ${tab === 'sr50' ? 'active' : ''}`} onClick={() => setTab('sr50')}>SR50 — Invoice</button>
        <button className={`report-tab ${tab === 'ir34' ? 'active' : ''}`} onClick={() => setTab('ir34')}>IR34 — Cashing</button>
      </div>
      <div className="report-body">
        {tab === 'sr50' && (<>
          <div className="report-grid">
            <div className="rbox"><div className="rbox-lbl">Net Sales</div><div className="rbox-val blue">${n(merged.sr50_net_sales).toFixed(2)}</div></div>
            <div className="rbox"><div className="rbox-lbl">Cashes</div><div className="rbox-val red">${n(merged.sr50_cashes).toFixed(2)}</div></div>
            <div className="rbox"><div className="rbox-lbl">Commission</div><div className="rbox-val red">${n(merged.sr50_commission).toFixed(2)}</div></div>
            <div className="rbox" style={{ gridColumn: '1/-1', background: 'var(--green-lt)', borderColor: 'var(--green)' }}>
              <div className="rbox-lbl">NET DUE (computed)</div>
              <div className="rbox-val green big">${computedNet.toFixed(2)}</div>
            </div>
          </div>
          <div className="divider" />
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>Enter from SR50 receipt</div>
          {fi('sr50_net_sales', 'Net Sales')}
          {fi('sr50_commission', 'Commission')}
          {fi('sr50_cashes', 'Cashes')}
          {fi('sr50_cash_bonus', 'Cash Bonus')}
          {fi('sr50_claims_bonus', 'Claims Bonus')}
          {fi('sr50_adjustments', 'Adjustments')}
          {fi('sr50_service_fee', 'Service Fee')}
          {fi('sr50_net_due', 'Net Due (from receipt)')}
          {saving && <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Saving...</div>}
        </>)}
        {tab === 'ir34' && (<>
          <div className="report-grid">
            <div className="rbox"><div className="rbox-lbl">Ticket Count</div><div className="rbox-val">{n(merged.ir34_tickets)}</div></div>
            <div className="rbox"><div className="rbox-lbl">Today&#39;s Cashing</div><div className="rbox-val blue">${n(merged.ir34_totals).toFixed(2)}</div></div>
          </div>
          <div className="divider" />
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>Enter from Instant Report 34</div>
          {fi('ir34_tickets', '# Tickets')}
          {fi('ir34_totals', 'Totals amount ($)')}
          {saving && <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Saving...</div>}
        </>)}
      </div>
    </div>
  )
}

// ─── Inline editable number cell ──────────────────────────────────────────────

function NumInput({
  value,
  placeholder,
  onSave,
  autoFocus,
}: {
  value: number | null
  placeholder?: string
  onSave: (v: number | null) => void
  autoFocus?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && value === null) {
      setEditing(true)
      setDraft('')
      setTimeout(() => { ref.current?.focus() }, 50)
    }
  }, [])

  function startEdit() {
    setEditing(true)
    setDraft(value !== null ? String(value) : '')
    setTimeout(() => { ref.current?.focus(); ref.current?.select() }, 20)
  }

  function commit() {
    setEditing(false)
    const parsed = draft.trim() === '' ? null : Number(draft)
    onSave(isNaN(parsed as number) ? null : parsed)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        type="number" inputMode="numeric"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setEditing(false) }
        }}
        style={{
          width: '100%', height: 44, padding: '0 6px',
          fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700,
          textAlign: 'right', border: 'none',
          background: '#fffce8', outline: 'none', color: 'var(--ink)',
          borderBottom: '2px solid var(--red)',
        }}
      />
    )
  }

  return (
    <div
      onClick={startEdit}
      style={{
        height: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '0 8px', cursor: 'text',
        fontFamily: 'var(--mono)', fontSize: 15,
        color: value !== null ? 'var(--ink)' : 'var(--line-dk)',
        fontWeight: value !== null ? 700 : 400,
      }}
    >
      {value !== null ? value : (placeholder || '—')}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SessionPage({ params }: { params: { id: string } }) {
  const [session,    setSession]    = useState<Session | null>(null)
  const [tickets,    setTickets]    = useState<TicketValue[]>([])
  // bookMap: ticket_number -> book row
  const [bookMap,    setBookMap]    = useState<Record<number, Book>>({})
  const [loading,    setLoading]    = useState(true)
  const [toast,      setToast]      = useState('')
  const [showReport, setShowReport] = useState(false)
  const redirected = useRef(false)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(''), 2000)
  }

  const load = useCallback(async () => {
    const { data: { session: auth } } = await supabase.auth.getSession()
    if (!auth) {
      if (!redirected.current) { redirected.current = true; window.location.href = '/auth' }
      return
    }

    const sid = localStorage.getItem('selected_store_id')
    if (!sid) { window.location.href = '/stores'; return }

    const [{ data: sess }, { data: bks }, { data: tvs }] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', params.id).eq('user_id', auth.user.id).single(),
      supabase.from('books').select('*').eq('session_id', params.id).eq('user_id', auth.user.id).order('row_number'),
      supabase.from('ticket_values').select('*').eq('user_id', auth.user.id).eq('store_id', sid).order('ticket_number'),
    ])

    if (sess) setSession(sess)
    if (tvs)  setTickets(tvs)

    // Map books by row_number (which corresponds to ticket index)
    if (bks) {
      const map: Record<number, Book> = {}
      bks.forEach(b => { map[b.row_number] = b })
      setBookMap(map)
    }

    setLoading(false)
  }, [params.id])

  useEffect(() => { load() }, [load])

  // Save start/end for a ticket row
  async function saveBookField(
    ticketIndex: number,
    field: 'start_num' | 'end_num',
    value: number | null
  ) {
    const { data: { session: auth } } = await supabase.auth.getSession()
    if (!auth || !session) return

    const existingBook = bookMap[ticketIndex + 1]

    if (existingBook) {
      // Update existing book
      const updates = { [field]: value }
      const { data } = await supabase.from('books').update(updates).eq('id', existingBook.id).select().single()
      if (data) {
        setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
      }
    } else {
      // Create new book row
      const insertData: Record<string, unknown> = {
        session_id:  session.id,
        row_number:  ticketIndex + 1,
        is_returned: false,
        user_id:     auth.user.id,
        start_num:   null,
        end_num:     null,
        [field]:     value,
      }
      const { data } = await supabase.from('books').insert(insertData).select().single()
      if (data) {
        setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
      }
    }

    const ticket = tickets[ticketIndex]
    const book   = { ...existingBook, [field]: value }
    if (book.start_num !== null && book.end_num !== null && ticket) {
      const s = calcSold(book.start_num, book.end_num)
      const t = calcTotal(s, ticket.value)
      if (s > 0) showToast(`#${ticket.ticket_number} → ${s} sold · $${t.toFixed(2)}`)
    }
  }

  async function toggleReturn(ticketIndex: number) {
    const { data: { session: auth } } = await supabase.auth.getSession()
    if (!auth || !session) return

    const existingBook = bookMap[ticketIndex + 1]
    const newReturned  = !existingBook?.is_returned

    if (existingBook) {
      const { data } = await supabase.from('books').update({ is_returned: newReturned }).eq('id', existingBook.id).select().single()
      if (data) setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
    } else {
      const { data } = await supabase.from('books').insert({
        session_id: session.id, row_number: ticketIndex + 1,
        is_returned: true, user_id: auth.user.id,
        start_num: null, end_num: null,
      }).select().single()
      if (data) setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
    }
    showToast(newReturned ? 'Marked as returned' : 'Unmarked')
  }

  // Totals
  const grandSold = tickets.reduce((sum, ticket, idx) => {
    const book = bookMap[idx + 1]
    if (!book || book.is_returned || book.start_num === null || book.end_num === null) return sum
    return sum + calcSold(book.start_num, book.end_num)
  }, 0)

  const grandAmt = tickets.reduce((sum, ticket, idx) => {
    const book = bookMap[idx + 1]
    if (!book || book.is_returned || book.start_num === null || book.end_num === null) return sum
    const s = calcSold(book.start_num, book.end_num)
    return parseFloat((sum + calcTotal(s, ticket.value)).toFixed(2))
  }, 0)

  const enteredCount = tickets.filter((_, idx) => {
    const b = bookMap[idx + 1]
    return b && !b.is_returned && b.start_num !== null && b.end_num !== null
  }).length

  const netDue    = n(session?.sr50_net_due)
  const storeName = typeof window !== 'undefined' ? localStorage.getItem('selected_store_name') || '' : ''

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>
  if (!session) return <div className="empty" style={{ marginTop: 80 }}>NOT FOUND</div>

  const sessionDate = new Date(session.session_date + 'T00:00:00')
  const isToday     = session.session_date === new Date().toISOString().split('T')[0]

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 40 }}>

      {/* Header */}
      <header className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/?noredirect=1" style={{ fontSize: 20, color: 'var(--ink)', textDecoration: 'none', padding: '4px 8px 4px 0', lineHeight: 1 }}>←</a>
          <div>
            <div className="hdr-title">{isToday ? 'TODAY' : sessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</div>
            <div className="hdr-sub">{storeName} · {enteredCount}/{tickets.length} ENTERED</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {enteredCount > 0 && (
            <button className="btn btn-sm" onClick={() => printSession(session, Object.values(bookMap), tickets)}>⎙ PDF</button>
          )}
          <a href="/history" className="btn btn-sm">HISTORY</a>
        </div>
      </header>

      {/* Summary */}
      <div className="sbar">
        <div className="sbar-cell">
          <div className="sbar-lbl">Entered</div>
          <div className="sbar-val">{enteredCount}/{tickets.length}</div>
        </div>
        <div className="sbar-cell">
          <div className="sbar-lbl">Sold</div>
          <div className="sbar-val">{grandSold}</div>
        </div>
        <div className="sbar-cell">
          <div className="sbar-lbl">Revenue</div>
          <div className="sbar-val green">${grandAmt.toFixed(2)}</div>
        </div>
      </div>

      {/* No tickets warning */}
      {tickets.length === 0 && (
        <div style={{ margin: '16px', padding: '12px 14px', background: 'var(--red-lt)', border: '1px solid var(--red)', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)' }}>
          ⚠ No tickets configured for this store. Go to{' '}
          <a href="/settings" style={{ color: 'var(--red)', fontWeight: 700 }}>Settings</a> first.
        </div>
      )}

      {/* Ledger Table — all tickets shown, tap Start/End to enter */}
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
                <th />
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket, idx) => {
                const book       = bookMap[idx + 1]
                const isReturned = book?.is_returned ?? false
                const startNum   = book?.start_num ?? null
                const endNum     = book?.end_num   ?? null
                const s          = (!isReturned && startNum !== null && endNum !== null) ? calcSold(startNum, endNum) : null
                const t          = s !== null ? calcTotal(s, ticket.value) : null
                const hasData    = startNum !== null || endNum !== null

                return (
                  <tr
                    key={ticket.ticket_number}
                    className={isReturned ? 'ret' : ''}
                    style={{ background: !isReturned && !hasData ? 'var(--warm)' : undefined }}
                  >
                    {/* Ticket number */}
                    <td>
                      <div style={{ height: 44, display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 6 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                          #{ticket.ticket_number}
                        </span>
                        {!hasData && !isReturned && (
                          <span style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '.04em' }}>tap to enter</span>
                        )}
                      </div>
                    </td>

                    {/* Price */}
                    <td>
                      <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>
                          ${ticket.value % 1 === 0 ? ticket.value : ticket.value.toFixed(2)}
                        </span>
                      </div>
                    </td>

                    {/* Start — inline editable */}
                    <td style={{ minWidth: 64 }}>
                      {isReturned
                        ? <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', color: 'var(--ink-faint)' }}>—</div>
                        : <NumInput
                            value={startNum}
                            placeholder="start"
                            onSave={v => saveBookField(idx, 'start_num', v)}
                          />
                      }
                    </td>

                    {/* End — inline editable */}
                    <td style={{ minWidth: 64 }}>
                      {isReturned
                        ? <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', color: 'var(--ink-faint)' }}>—</div>
                        : <NumInput
                            value={endNum}
                            placeholder="end"
                            onSave={v => saveBookField(idx, 'end_num', v)}
                          />
                      }
                    </td>

                    {/* Sold — auto computed */}
                    <td>
                      <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, fontFamily: 'var(--mono)', fontSize: 15, color: s === 0 ? 'var(--ink-faint)' : 'var(--ink)' }}>
                        {isReturned ? '—' : (s !== null ? s : '')}
                      </div>
                    </td>

                    {/* Total — auto computed */}
                    <td>
                      <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: t && t > 0 ? 'var(--green)' : 'var(--ink-faint)' }}>
                        {isReturned ? '—' : (t && t > 0 ? '$' + t.toFixed(2) : '')}
                      </div>
                    </td>

                    {/* Return toggle */}
                    <td>
                      <button
                        className="xbtn"
                        onClick={() => toggleReturn(idx)}
                        title={isReturned ? 'Unmark returned' : 'Mark as returned (—)'}
                        style={{ fontSize: isReturned ? 12 : 16, color: isReturned ? 'var(--green)' : 'var(--ink-faint)' }}
                      >
                        {isReturned ? '↩' : '—'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'left', fontFamily: 'var(--sans)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  TOTAL
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>{grandSold || ''}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
                  {grandAmt > 0 ? '$' + grandAmt.toFixed(2) : ''}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* SR50 toggle */}
      <div style={{ borderTop: '1px solid var(--line)', marginTop: 8 }}>
        <button
          className={`btn ${showReport ? '' : 'btn-ghost'}`}
          onClick={() => setShowReport(v => !v)}
          style={{ width: '100%', padding: '12px', fontSize: 12, borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}
        >
          {showReport ? '▾' : '▸'} SR50 / IR34 REPORTS
        </button>
      </div>

      {showReport && <ReportPanel session={session} onSave={s => setSession(s)} />}

      {netDue > 0 && !showReport && (
        <div
          onClick={() => setShowReport(true)}
          style={{ padding: '12px 16px', background: 'var(--green-lt)', borderTop: '1px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        >
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--green)' }}>SR50 — Net Due</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 'bold', color: 'var(--green)' }}>${netDue.toFixed(2)}</div>
          </div>
          <span style={{ color: 'var(--green)', fontSize: 14 }}>edit →</span>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}