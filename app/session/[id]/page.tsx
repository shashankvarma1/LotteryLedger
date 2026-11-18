'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session, Book, Correction } from '@/lib/supabase'

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

function money(v: number) {
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function toTicket(t: TicketValue): TicketValue {
  return { ticket_number: t.ticket_number, value: Number(t.value), book_size: t.book_size }
}

// Books are stored by row position (row_number = index + 1), so the ticket
// order must never shift for an existing session. Keep the snapshot's order,
// refresh prices from the live list, and append newly added tickets at the end.
function mergeSnapshot(snapshot: TicketValue[] | null, live: TicketValue[]): TicketValue[] {
  if (!snapshot || snapshot.length === 0) return live.map(toTicket)
  const liveByNum = new Map(live.map(t => [t.ticket_number, t]))
  const merged    = snapshot.map(old => {
    const cur = liveByNum.get(old.ticket_number)
    return cur ? toTicket(cur) : old
  })
  const known = new Set(snapshot.map(t => t.ticket_number))
  live.forEach(t => { if (!known.has(t.ticket_number)) merged.push(toTicket(t)) })
  return merged
}

// Counts in-flight saves so we only warn on page leave when something is unsaved.
let pendingSaves = 0
async function tracked<T>(p: PromiseLike<T>): Promise<T> {
  pendingSaves++
  try { return await p } finally { pendingSaves-- }
}

// ─── Previous day ─────────────────────────────────────────────────────────────

type PrevDay = {
  date:      string
  byTicket:  Map<number, Book>    // ticket_number → previous session's book
  priceOf:   Map<number, number>  // ticket_number → previous session's price
}

type StartChange = {
  ticket_number: number
  prevEnd:       number
  start:         number
  oldPrice:      number | null
  newPrice:      number
}

// Most recent session before this one (handles days the store was closed).
// Books are matched by ticket number so the result doesn't depend on row order.
async function fetchPrevDay(storeId: string, beforeDate: string, todayTickets: TicketValue[]):
  Promise<{ prev: PrevDay | null; error: boolean }> {
  const { data: ps, error } = await supabase
    .from('sessions').select('id, session_date, ticket_snapshot')
    .eq('store_id', storeId).lt('session_date', beforeDate)
    .order('session_date', { ascending: false }).limit(1).maybeSingle()
  if (error) return { prev: null, error: true }
  if (!ps)   return { prev: null, error: false }

  const { data: books, error: bErr } = await supabase
    .from('books').select('*').eq('session_id', ps.id)
  if (bErr) return { prev: null, error: true }

  const snap     = (ps.ticket_snapshot as TicketValue[] | null) || []
  const byTicket = new Map<number, Book>()
  const priceOf  = new Map<number, number>()
  snap.forEach(t => priceOf.set(t.ticket_number, Number(t.value)))
  ;(books || []).forEach((b: Book) => {
    // Old sessions without a snapshot: assume the same row order as today.
    const tn = snap.length > 0 ? snap[b.row_number - 1]?.ticket_number : todayTickets[b.row_number - 1]?.ticket_number
    if (tn !== undefined) byTicket.set(tn, b)
  })
  return { prev: { date: ps.session_date, byTicket, priceOf }, error: false }
}

function findStartChanges(tickets: TicketValue[], bookMap: Record<number, Book>, prev: PrevDay | null): StartChange[] {
  if (!prev) return []
  const out: StartChange[] = []
  tickets.forEach((t, idx) => {
    const b = bookMap[idx + 1]
    const p = prev.byTicket.get(t.ticket_number)
    if (!b || b.is_returned || b.start_num === null) return
    if (!p || p.is_returned || p.end_num === null) return
    if (b.start_num === p.end_num) return
    out.push({
      ticket_number: t.ticket_number,
      prevEnd:       p.end_num,
      start:         b.start_num,
      oldPrice:      prev.priceOf.get(t.ticket_number) ?? null,
      newPrice:      t.value,
    })
  })
  return out
}

function startChangeText(c: StartChange, prevDate: string) {
  const day = new Date(prevDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  let s = `#${c.ticket_number}: start changed to ${c.start} — previous end (${day}) was ${c.prevEnd}`
  if (c.oldPrice !== null && c.oldPrice !== c.newPrice) s += ` · price $${c.oldPrice} → $${c.newPrice} (new book?)`
  return s
}

// Add/replace the entry for this ticket, keeping the very first "old" value.
// If the number ends up back at its original value, the entry is dropped.
function mergeCorrection(list: Correction[], c: Correction): Correction[] {
  const same  = (x: Correction) => x.kind === c.kind && x.ticket_number === c.ticket_number
  const prior = list.find(same)
  const rest  = list.filter(x => !same(x))
  const old   = prior ? prior.old : c.old
  return old === c.new ? rest : [...rest, { ...c, old }]
}

function correctionText(c: Correction) {
  const day = new Date(c.other_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return c.kind === 'start'
    ? `#${c.ticket_number}: start corrected ${c.old} → ${c.new} — ${day} end number was also changed from ${c.old} to ${c.new}`
    : `#${c.ticket_number}: end changed ${c.old} → ${c.new} automatically — corrected from ${day}'s start number`
}

function finalOf(grandAmt: number, s: Session) {
  return parseFloat((grandAmt + n(s.sr50_net_sales) - n(s.sr50_cashes) - n(s.ir34_totals) + n(s.cb_amount)).toFixed(2))
}

// ─── Generate HTML ────────────────────────────────────────────────────────────

function generateHtml(session: Session, bookMap: Record<number, Book>, tickets: TicketValue[], startNotes: string[]): string {
  const dateStr   = new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const storeName     = esc(localStorage.getItem('selected_store_name') || '')
  const ticketsForPdf = tickets

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
  const cbAmount      = n(session.cb_amount)
  const finalTotal    = finalOf(grandAmt, session)
  const cashDiff      = n(session.cash_diff)

  const noteItems: string[] = []
  if (session.notes) noteItems.push(`<div class="note-item staff"><b>Staff note:</b> ${esc(session.notes)}</div>`)
  if (cashDiff !== 0) {
    noteItems.push(`<div class="note-item ${cashDiff < 0 ? 'neg' : 'pos'}"><b>Cash ${cashDiff < 0 ? 'SHORT' : 'OVER'} $${Math.abs(cashDiff).toFixed(2)}</b>${session.cash_note ? ` — ${esc(session.cash_note)}` : ''}</div>`)
  }
  startNotes.forEach(t => noteItems.push(`<div class="note-item warn">⚠ ${esc(t)}</div>`))
  const notesSection = noteItems.length
    ? `<div class="notes-box"><div class="notes-title">📝 Notes for Owner (${noteItems.length})</div>${noteItems.join('')}</div>`
    : ''

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
    .closeout { break-inside: avoid; page-break-inside: avoid; margin-bottom: 24px; }
    .closeout .final-box { margin-bottom: 12px; }
    .notes-box { background: #fffbeb; border: 2px solid #f59e0b; border-radius: 12px; padding: 12px 18px; }
    .notes-title { font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #b45309; margin-bottom: 6px; }
    .note-item { padding: 8px 0; border-bottom: 1px solid #fde68a; font-size: 14px; line-height: 1.5; color: #0f172a; }
    .note-item:last-child { border-bottom: none; }
    .note-item.neg { color: #e11d48; } .note-item.pos { color: #0284c7; } .note-item.warn { color: #92400e; }
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
      <div class="report-row total"><span class="report-label bold">SR50 Net</span><span class="report-value neutral">${money(sr50NetSales - sr50Cashes)}</span></div>
    </div>
    <div class="report-box">
      <div class="report-box-title">Cashes — SR50 + IR34</div>
      <div class="report-row"><span class="report-label">SR50 Cashes</span><span class="report-value minus">$${sr50Cashes.toFixed(2)}</span></div>
      <div class="report-row"><span class="report-label">IR34 Cashes</span><span class="report-value minus">$${ir34Cashes.toFixed(2)}</span></div>
      <div class="report-row total"><span class="report-label bold">Total Cashes</span><span class="report-value minus">−$${totalCashes.toFixed(2)}</span></div>
    </div>
  </div>
  <div class="closeout">
  <div class="final-box ${finalTotal >= 0 ? 'positive' : 'negative'}">
    <div>
      <div class="final-label ${finalTotal >= 0 ? 'positive' : 'negative'}">Final Total</div>
      <div class="final-value ${finalTotal >= 0 ? 'positive' : 'negative'}">${money(finalTotal)}</div>
      <div class="final-formula">
        Ticket Revenue ($${grandAmt.toFixed(2)}) + SR50 Net Sales ($${sr50NetSales.toFixed(2)})<br>
        − SR50 Cashes ($${sr50Cashes.toFixed(2)}) − IR34 Cashes ($${ir34Cashes.toFixed(2)})${cbAmount ? `<br>+ CB — Cashed from Back ($${cbAmount.toFixed(2)})` : ''}
      </div>
    </div>
    <div class="final-icon">${finalTotal >= 0 ? '✓' : '!'}</div>
  </div>
  ${notesSection}
  </div>
  <div class="page-footer">
    <span>Generated ${new Date().toLocaleString()}</span>
    <span>${storeName} · Lottery Ledger</span>
  </div>
</body>
</html>`
}

// ─── Report Panel ─────────────────────────────────────────────────────────────

type ReportField = 'sr50_net_sales' | 'sr50_cashes' | 'ir34_totals'

function ReportPanel({ session, onSave, onError }: {
  session: Session
  onSave:  (s: Session) => void
  onError: (msg: string) => void
}) {
  const [tab,    setTab]    = useState<'sr50' | 'ir34'>('sr50')
  const [draft,  setDraft]  = useState<Partial<Record<ReportField, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  // Empty input counts as 0 for display and saving.
  function parse(s: string) { return s.trim() === '' ? 0 : Number(s) }
  const merged = { ...session } as Session
  ;(Object.keys(draft) as ReportField[]).forEach(k => {
    const v = parse(draft[k]!)
    if (!isNaN(v)) merged[k] = v
  })

  async function save() {
    const sent = draft
    const keys = Object.keys(sent) as ReportField[]
    if (keys.length === 0) return
    const update: Partial<Record<ReportField, number>> = {}
    for (const k of keys) {
      const v = parse(sent[k]!)
      if (isNaN(v) || v < 0) { onError('Enter a valid amount'); return }
      update[k] = v
    }
    setSaving(true)
    const { data, error } = await tracked(supabase.from('sessions').update(update).eq('id', session.id).select().single())
    setSaving(false)
    if (error || !data) { onError('⚠ Save failed — check connection and try again'); return }
    onSave(data)
    // Only clear fields that weren't edited again while saving.
    setDraft(p => {
      const next = { ...p }
      keys.forEach(k => { if (next[k] === sent[k]) delete next[k] })
      return next
    })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  function fi(key: ReportField, label: string) {
    return (
      <div style={{ marginBottom: 14 }}>
        <label className="field-label">{label}</label>
        <input
          type="number" inputMode="decimal" step="0.01" min="0"
          value={draft[key] !== undefined ? draft[key] : (session[key] ? String(session[key]) : '')}
          onChange={e => setDraft(p => ({ ...p, [key]: e.target.value }))}
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

// ─── Close Out: CB + Cash Short/Over ──────────────────────────────────────────

const SAVE_FAILED = '⚠ Save failed — check connection and try again'

function CloseOutPanel({ session, totalBeforeCb, disabled, onSave, notify }: {
  session:       Session
  totalBeforeCb: number
  disabled?:     boolean
  onSave:        (s: Session) => void
  notify:        (msg: string) => void
}) {
  const onError = notify
  const cb       = n(session.cb_amount)
  const cashDiff = n(session.cash_diff)

  const [cbOpen,   setCbOpen]   = useState(false)
  const [cbDraft,  setCbDraft]  = useState<string | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffType, setDiffType] = useState<'short' | 'over'>(cashDiff > 0 ? 'over' : 'short')
  const [amtDraft, setAmtDraft] = useState(cashDiff ? String(Math.abs(cashDiff)) : '')
  const [noteDraft,setNoteDraft]= useState(session.cash_note || '')
  const [savingDiff, setSavingDiff] = useState(false)

  const showCb   = totalBeforeCb < 0 || cb > 0 || cbOpen
  const hasDiff  = cashDiff !== 0 || !!session.cash_note
  const showDiff = hasDiff || diffOpen

  async function update(fields: Partial<Session>) {
    const { data, error } = await tracked(supabase.from('sessions').update(fields).eq('id', session.id).select().single())
    if (error || !data) { onError(SAVE_FAILED); return false }
    onSave(data)
    return true
  }

  async function saveCb() {
    if (cbDraft === null) return
    const v = cbDraft.trim() === '' ? 0 : Number(cbDraft)
    if (isNaN(v) || v < 0) { onError('Enter a valid CB amount'); return }
    if (v === cb) { setCbDraft(null); return }
    if (await update({ cb_amount: v })) setCbDraft(null)
  }

  async function saveDiff() {
    const amt = amtDraft.trim() === '' ? 0 : Number(amtDraft)
    if (isNaN(amt) || amt < 0) { onError('Enter a valid amount'); return }
    if (amt > 0 && noteDraft.trim() === '') { onError('Please write a note explaining the difference'); return }
    setSavingDiff(true)
    const ok = await update({
      cash_diff: diffType === 'short' ? -amt : amt,
      cash_note: noteDraft.trim() || null,
    })
    setSavingDiff(false)
    if (ok) notify(amt > 0 ? `✓ Cash ${diffType} noted` : '✓ Cleared')
  }

  async function clearDiff() {
    if (await update({ cash_diff: 0, cash_note: null })) {
      setAmtDraft(''); setNoteDraft(''); setDiffOpen(false)
    }
  }

  const lbl: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }
  const box: React.CSSProperties = { padding: '14px 18px', borderTop: '1px solid var(--line-dk)', background: 'var(--card)' }
  const diffDirty = amtDraft !== (cashDiff ? String(Math.abs(cashDiff)) : '')
    || noteDraft !== (session.cash_note || '')
    || (cashDiff !== 0 && diffType !== (cashDiff > 0 ? 'over' : 'short'))

  return (
    <div>
      {/* ── CB: Cashed from Back ── */}
      {showCb ? (
        <div style={box}>
          <div style={{ ...lbl, color: 'var(--gold)', marginBottom: 4 }}>Add (CB) — Cashed from Back</div>
          {totalBeforeCb < 0 && cb === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 10 }}>
              Total is {money(totalBeforeCb)}. Enter cashes paid from the other register.
            </div>
          )}
          <input
            type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00"
            disabled={disabled}
            value={cbDraft !== null ? cbDraft : (cb ? String(cb) : '')}
            onChange={e => setCbDraft(e.target.value)}
            onBlur={saveCb}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="field-input"
            style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700 }}
          />
          {cb > 0 && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', marginTop: 8 }}>
              {money(totalBeforeCb)} + CB ${cb.toFixed(2)} = <b style={{ color: totalBeforeCb + cb >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>{money(totalBeforeCb + cb)}</b>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Cash Short / Over ── */}
      {showDiff ? (
        <div style={box}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...lbl, color: cashDiff < 0 ? 'var(--rose)' : cashDiff > 0 ? 'var(--sky)' : 'var(--ink-faint)' }}>
              Cash Short / Over {cashDiff !== 0 && `· ${cashDiff < 0 ? 'SHORT' : 'OVER'} $${Math.abs(cashDiff).toFixed(2)}`}
            </div>
            {hasDiff && !disabled && (
              <button className="btn btn-ghost btn-sm" onClick={clearDiff}>Clear</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(['short', 'over'] as const).map(t => (
              <button key={t} disabled={disabled}
                className={`btn ${diffType === t ? (t === 'short' ? 'btn-red' : 'btn-gold') : 'btn-ghost'}`}
                onClick={() => setDiffType(t)}
                style={{ flex: 1, padding: '10px' }}>
                {t === 'short' ? '− Short' : '+ Over'}
              </button>
            ))}
          </div>
          <input
            type="number" inputMode="decimal" step="0.01" min="0" placeholder="Amount (0.00)"
            disabled={disabled} value={amtDraft} onChange={e => setAmtDraft(e.target.value)}
            className="field-input"
            style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, marginBottom: 10 }}
          />
          <textarea
            placeholder="Note for owner — why is the cash short / over?"
            disabled={disabled} value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
            rows={2} className="field-input"
            style={{ fontFamily: 'var(--sans)', fontSize: 13, resize: 'vertical', marginBottom: 10, height: 'auto', padding: '10px 12px' }}
          />
          {!disabled && (
            <button className="btn btn-gold" onClick={saveDiff} disabled={savingDiff || !diffDirty}
              style={{ width: '100%', padding: '11px' }}>
              {savingDiff ? 'Saving...' : diffDirty ? 'Save Note' : '✓ Saved'}
            </button>
          )}
        </div>
      ) : null}

      {/* ── Buttons to open the optional sections ── */}
      {!disabled && (!showCb || !showDiff) && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 18px', borderTop: '1px solid var(--line)' }}>
          {!showCb   && <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setCbOpen(true)}>+ Add (CB)</button>}
          {!showDiff && <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setDiffOpen(true)}>± Cash Short / Over</button>}
        </div>
      )}
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

function NotesInput({ session, onSave, onError, disabled }: {
  session: Session
  onSave: (s: Session) => void
  onError: (msg: string) => void
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
    const { data, error } = await tracked(supabase.from('sessions')
      .update({ notes: draft || null }).eq('id', session.id).select().single())
    setSaving(false)
    if (error || !data) {
      // Keep the typed text in draft so tapping the note again lets them retry.
      onError('⚠ Note not saved — check connection and try again')
      return
    }
    onSave(data)
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
  const [prevDay,    setPrevDay]    = useState<PrevDay | null>(null)
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
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingSaves === 0) return
      e.preventDefault(); e.returnValue = ''
    }
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
      const oldSnapshot    = sess.ticket_snapshot as TicketValue[] | null
      const hasSnapshot    = !!oldSnapshot && oldSnapshot.length > 0

      // Today: refresh prices from Settings, but keep row order stable.
      // Past: keep the saved snapshot so old prices are preserved.
      const list = sessionIsToday || !hasSnapshot
        ? mergeSnapshot(oldSnapshot, (tvs || []) as TicketValue[])
        : oldSnapshot!

      let current: Session = sess
      if (list.length > 0 && JSON.stringify(list) !== JSON.stringify(oldSnapshot)) {
        // Await this so the on-screen list, the session state and the PDF all agree.
        const { data: updated, error } = await supabase
          .from('sessions').update({ ticket_snapshot: list })
          .eq('id', sess.id).select().single()
        current = updated ?? { ...sess, ticket_snapshot: list }
        if (error) showToast('⚠ Could not save ticket prices — check connection')
      }
      setSession(current)
      setTickets(list)

      // Previous day's books — used for "start changed" notes and "⬆ Yesterday".
      const { prev } = await fetchPrevDay(sid, sess.session_date, list)
      setPrevDay(prev)
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
    const maxNum       = ticket?.book_size || 100

    if (value !== null && (!Number.isInteger(value) || value < 0 || value > maxNum)) {
      showToast(`⚠ Enter a whole number from 0 to ${maxNum}`)
      return
    }
    if (existingBook && existingBook[field] === value) return

    if (existingBook) {
      const { data, error } = await tracked(supabase.from('books')
        .update({ [field]: value }).eq('id', existingBook.id).select().single())
      if (error || !data) { showToast(SAVE_FAILED); return }
      setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
      if (data.start_num !== null && data.end_num !== null && ticket) {
        const s = calcSold(data.start_num, data.end_num, maxNum)
        showToast(`#${ticket.ticket_number} → ${s} sold · $${calcTotal(s, ticket.value).toFixed(2)}`)
        if (navigator.vibrate) navigator.vibrate(40)
      }
      if (field === 'start_num' && ticket) await correctPrevEnd(ticket, existingBook.start_num, value)
    } else {
      if (value === null) return
      const { data, error } = await tracked(supabase.from('books').insert({
        session_id:  session.id,
        row_number:  ticketIndex + 1,
        is_returned: false,
        user_id:     auth.user.id,
        start_num:   null,
        end_num:     null,
        [field]:     value,
      }).select().single())
      if (error || !data) { showToast(SAVE_FAILED); return }
      setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
    }
  }

  // Read-modify-write a session's corrections list (read fresh from DB so two
  // quick edits don't overwrite each other).
  async function updateCorrections(sessionId: string, change: (list: Correction[]) => Correction[]) {
    const { data: cur, error } = await supabase.from('sessions').select('corrections').eq('id', sessionId).single()
    if (error) return null
    const next = change((cur?.corrections as Correction[] | null) || [])
    const { data, error: upErr } = await tracked(supabase.from('sessions')
      .update({ corrections: next }).eq('id', sessionId).select().single())
    return upErr ? null : (data as Session)
  }

  function setPrevEnd(ticketNumber: number, book: Book) {
    setPrevDay(p => {
      if (!p) return p
      const byTicket = new Map(p.byTicket)
      byTicket.set(ticketNumber, book)
      return { ...p, byTicket }
    })
  }

  // Staff changed a start number that had been carried over from the previous
  // day's end → that end was wrong, so fix it too and leave a note on both days.
  async function correctPrevEnd(ticket: TicketValue, oldStart: number | null, newStart: number | null) {
    if (!session || !prevDay || oldStart === null || newStart === null || oldStart === newStart) return
    // Column missing (migration not run yet) → don't change the previous day without a note.
    if (!('corrections' in session)) return
    const prevBook = prevDay.byTicket.get(ticket.ticket_number)
    if (!prevBook || prevBook.is_returned || prevBook.end_num === null) return
    if (prevBook.end_num !== oldStart) return                   // start wasn't carried over
    const oldPrice = prevDay.priceOf.get(ticket.ticket_number)
    if (oldPrice !== undefined && oldPrice !== ticket.value) return  // different game in this slot

    const { data: pb, error } = await tracked(supabase.from('books')
      .update({ end_num: newStart }).eq('id', prevBook.id).select().single())
    if (error || !pb) { showToast('⚠ Start saved, but previous day\'s end could not be updated'); return }
    setPrevEnd(ticket.ticket_number, pb)

    const at = new Date().toISOString()
    const base = { ticket_number: ticket.ticket_number, old: oldStart, new: newStart, at }
    const [prevOk, today] = await Promise.all([
      updateCorrections(prevBook.session_id, l => mergeCorrection(l, { ...base, kind: 'end',   other_date: session.session_date })),
      updateCorrections(session.id,          l => mergeCorrection(l, { ...base, kind: 'start', other_date: prevDay.date })),
    ])
    if (today) setSession(today)
    if (!prevOk || !today) { showToast('⚠ Numbers fixed, but the note for the owner could not be saved'); return }

    const day = new Date(prevDay.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    showToast(`✓ #${ticket.ticket_number} start fixed · ${day} end also changed to ${newStart}`)
  }

  // "It's a new book" — put the previous day's end back and remove both notes.
  async function undoCorrection(c: Correction) {
    if (!session || !prevDay || prevDay.date !== c.other_date) { showToast('⚠ Could not find the previous session'); return }
    const prevBook = prevDay.byTicket.get(c.ticket_number)
    if (!prevBook) return
    const { data: pb, error } = await tracked(supabase.from('books')
      .update({ end_num: c.old }).eq('id', prevBook.id).select().single())
    if (error || !pb) { showToast(SAVE_FAILED); return }
    setPrevEnd(c.ticket_number, pb)

    const drop = (kind: Correction['kind']) => (l: Correction[]) =>
      l.filter(x => !(x.kind === kind && x.ticket_number === c.ticket_number))
    const [, today] = await Promise.all([
      updateCorrections(prevBook.session_id, drop('end')),
      updateCorrections(session.id,          drop('start')),
    ])
    if (today) setSession(today)
    showToast(`↩ Previous day's end for #${c.ticket_number} restored to ${c.old}`)
  }

  async function toggleReturn(ticketIndex: number) {
    const { data: { session: auth } } = await supabase.auth.getSession()
    if (!auth || !session) return
    const existingBook = bookMap[ticketIndex + 1]
    const newReturned  = !existingBook?.is_returned

    const { data, error } = await tracked(existingBook
      ? supabase.from('books')
          .update({ is_returned: newReturned }).eq('id', existingBook.id).select().single()
      : supabase.from('books').insert({
          session_id:  session.id,
          row_number:  ticketIndex + 1,
          is_returned: true,
          user_id:     auth.user.id,
          start_num:   null,
          end_num:     null,
        }).select().single())
    if (error || !data) { showToast(SAVE_FAILED); return }
    setBookMap(prev => ({ ...prev, [ticketIndex + 1]: data }))
    if (navigator.vibrate) navigator.vibrate(40)
    showToast(newReturned ? 'Marked as returned' : 'Unmarked')
  }

  async function copyFromYesterday() {
    const { data: { session: auth } } = await supabase.auth.getSession()
    if (!auth || !session) return

    const sid = localStorage.getItem('selected_store_id') || ''

    // Re-fetch so we copy the latest numbers even if yesterday was just corrected.
    const { prev, error: prevErr } = await fetchPrevDay(sid, session.session_date, tickets)
    if (prevErr) { showToast(SAVE_FAILED); return }
    setPrevDay(prev)
    if (!prev) { showToast('No previous session found'); return }
    if (prev.byTicket.size === 0) { showToast('No data in the previous session'); return }

    let copied = 0, failed = 0
    for (let idx = 0; idx < tickets.length; idx++) {
      const prevBook = prev.byTicket.get(tickets[idx].ticket_number)
      if (!prevBook || prevBook.end_num === null || prevBook.is_returned) continue
      const rowNum   = idx + 1
      const existing = bookMap[rowNum]
      if (existing && existing.start_num !== null) continue

      const { data, error } = await tracked(existing
        ? supabase.from('books')
            .update({ start_num: prevBook.end_num }).eq('id', existing.id).select().single()
        : supabase.from('books').insert({
            session_id:  session.id,
            row_number:  rowNum,
            is_returned: false,
            user_id:     auth.user.id,
            start_num:   prevBook.end_num,
            end_num:     null,
          }).select().single())
      if (error || !data) { failed++; continue }
      setBookMap(prev => ({ ...prev, [rowNum]: data }))
      copied++
    }

    if (navigator.vibrate) navigator.vibrate([40, 30, 40])
    if (failed > 0) showToast(`⚠ Copied ${copied}, ${failed} failed — check connection and try again`)
    else {
      const from = new Date(prev.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      showToast(copied > 0 ? `✓ Copied ${copied} start numbers from ${from}` : 'Nothing to copy')
    }
  }

  async function handlePrint() {
    if (!session) return
    setSavingPdf(true)

    const html = generateHtml(session, bookMap, tickets, startNotes)

    const { data, error } = await tracked(supabase
      .from('sessions')
      .update({
        pdf_html:     html,
        pdf_saved_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .select().single())

    if (data) setSession(data)
    setSavingPdf(false)
    showToast(error || !data ? '⚠ Could not save PDF to History — printing anyway' : '✓ PDF saved to History')

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
      const { data } = await tracked(supabase.from('sessions')
        .update({ ticket_revenue: grandAmt }).eq('id', session.id).select().single())
      if (data) setSession(data)  // derived value — retried automatically on next change/load
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
  const cbAmount     = n(session?.cb_amount)
  const totalBeforeCb = parseFloat((grandAmt + sr50NetSales - sr50Cashes - ir34Cashes).toFixed(2))
  const finalTotal   = parseFloat((totalBeforeCb + cbAmount).toFixed(2))
  const hasFinalData = sr50NetSales > 0 || sr50Cashes > 0 || ir34Cashes > 0 || cbAmount > 0

  const startChanges    = findStartChanges(tickets, bookMap, prevDay)
  const startChangeSet  = new Set(startChanges.map(c => c.ticket_number))
  const corrections     = (session?.corrections as Correction[] | null) || []
  const mismatchNotes   = prevDay ? startChanges.map(c => startChangeText(c, prevDay.date)) : []
  const startNotes      = [...corrections.map(correctionText), ...mismatchNotes]  // all auto notes (screen + PDF)

  const storeName = typeof window !== 'undefined' ? localStorage.getItem('selected_store_name') || '' : ''

  if (loading) return <div className="empty" style={{ marginTop: 80 }}>LOADING...</div>
  if (!session) return <div className="empty" style={{ marginTop: 80 }}>NOT FOUND</div>

  const sessionDate = new Date(session.session_date + 'T00:00:00')
  const isToday     = session.session_date === new Date().toLocaleDateString('en-CA')
  const isLocked    = false

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
        <NotesInput session={session} onSave={s => setSession(s)} onError={showToast} disabled={isLocked} />
        {!isLocked && (
          <button onClick={copyFromYesterday} className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            ⬆ Yesterday
          </button>
        )}
      </div>

      {startNotes.length > 0 && (
        <div style={{ padding: '10px 14px', background: 'rgba(240,165,0,0.06)', borderBottom: '1px solid var(--line-dk)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--gold)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
            ⚠ Auto Notes for Owner
          </div>
          {corrections.map(c => (
            <div key={`${c.kind}-${c.ticket_number}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mid)', lineHeight: 1.6 }}>
              <span style={{ flex: 1 }}>✎ {correctionText(c)}</span>
              {c.kind === 'start' && !isLocked && (
                <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, fontSize: 10, padding: '2px 8px' }}
                  title="Use this if it's a new book and the previous day's end was actually right"
                  onClick={() => undoCorrection(c)}>
                  Undo (new book)
                </button>
              )}
            </div>
          ))}
          {mismatchNotes.map(t => (
            <div key={t} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mid)', lineHeight: 1.6 }}>{t}</div>
          ))}
        </div>
      )}

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
                        {startChangeSet.has(ticket.ticket_number) && !isReturned && (
                          <span title="Start number differs from previous day's end"
                            style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 4, padding: '1px 4px' }}>
                            START≠{prevDay?.byTicket.get(ticket.ticket_number)?.end_num}
                          </span>
                        )}
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

      {!isLocked && showReport && <ReportPanel session={session} onSave={s => setSession(s)} onError={showToast} />}

      {hasFinalData && (isLocked || !showReport) && (() => {
        const good  = finalTotal >= 0
        const items = [
          { label: 'Tickets',     val: `$${grandAmt.toFixed(2)}`,     color: 'var(--ink)' },
          { label: '+ Net Sales', val: `$${sr50NetSales.toFixed(2)}`, color: 'var(--sky)' },
          { label: '− SR50',      val: `$${sr50Cashes.toFixed(2)}`,   color: 'var(--rose)' },
          { label: '− IR34',      val: `$${ir34Cashes.toFixed(2)}`,   color: 'var(--rose)' },
          ...(cbAmount > 0 ? [{ label: '+ CB', val: `$${cbAmount.toFixed(2)}`, color: 'var(--gold)' }] : []),
        ]
        return (
          <div onClick={isLocked ? undefined : () => setShowReport(true)} style={{ cursor: isLocked ? 'default' : 'pointer' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, background: 'var(--navy-mid)', borderTop: '1px solid var(--line-dk)', padding: '12px 16px', gap: 8 }}>
              {items.map(({ label, val, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 18px', background: good ? 'var(--emerald-lt)' : 'var(--rose-lt)', borderTop: `1px solid ${good ? 'var(--emerald)' : 'var(--rose)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: good ? 'var(--emerald)' : 'var(--rose)', marginBottom: 4 }}>Final Total</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700, color: good ? 'var(--emerald)' : 'var(--rose)', lineHeight: 1 }}>{money(finalTotal)}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', marginTop: 5 }}>
                  Tickets + Net Sales − SR50 − IR34 Cashes{cbAmount > 0 ? ' + CB' : ''}
                </div>
              </div>
              {!isLocked && <span style={{ color: good ? 'var(--emerald)' : 'var(--rose)', fontSize: 14 }}>edit →</span>}
            </div>
          </div>
        )
      })()}


      {!isLocked && !hasFinalData && !showReport && grandAmt > 0 && (
        <div onClick={() => setShowReport(true)} style={{ padding: '14px 18px', background: 'var(--card)', borderTop: '1px solid var(--line-dk)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--gold)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Enter SR50 &amp; IR34</div>
            <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Tap to calculate final total</div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>${grandAmt.toFixed(2)} →</div>
        </div>
      )}

      {(hasFinalData || enteredCount > 0 || n(session.cash_diff) !== 0 || !!session.cash_note) && (
        <CloseOutPanel
          key={session.id}
          session={session}
          totalBeforeCb={totalBeforeCb}
          disabled={isLocked}
          onSave={s => setSession(s)}
          notify={showToast}
        />
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