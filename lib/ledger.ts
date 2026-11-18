// Shared money math for the Session, History and Home pages.
// Keep every total calculation here so the pages can never disagree.

import type { Session, Book, TicketValue } from './supabase'

export function n(v: number | null | undefined) { return v ?? 0 }

export function round2(v: number) { return parseFloat(v.toFixed(2)) }

/** Tickets sold from start → end; wraps around the end of the book. */
export function calcSold(start: number, end: number, bookSize: number): number {
  if (start === end) return 0
  if (end > start)   return end - start
  return (bookSize - start) + end
}

export function calcTotal(sold: number, price: number) {
  return round2(sold * price)
}

/** Ticket list for a session: its saved snapshot, or the live list if it has none. */
export function ticketsForSession(s: Session, live: TicketValue[]): TicketValue[] {
  const snap = s.ticket_snapshot as TicketValue[] | null
  return snap && snap.length > 0 ? snap : live
}

/**
 * Sold count and revenue for a session's books.
 * Books are matched to tickets by row position (row_number = index + 1).
 * Returned books and books missing a start or end number are skipped —
 * exactly what the session page shows.
 */
export function bookTotals(books: Book[], tickets: TicketValue[]) {
  let sold = 0, revenue = 0
  for (const b of books) {
    if (b.is_returned || b.start_num === null || b.end_num === null) continue
    const t = tickets[b.row_number - 1]
    if (!t) continue
    const s = calcSold(b.start_num, b.end_num, t.book_size || 100)
    sold   += s
    revenue = round2(revenue + calcTotal(s, Number(t.value)))
  }
  return { sold, revenue }
}

/** Ticket revenue + SR50 net sales − SR50 cashes − IR34 cashes (no CB). */
export function totalBeforeCb(ticketRevenue: number, s: Session) {
  return round2(ticketRevenue + n(s.sr50_net_sales) - n(s.sr50_cashes) - n(s.ir34_totals))
}

/** Final total = total before CB + CB (cashed from back). */
export function finalTotal(ticketRevenue: number, s: Session) {
  return round2(totalBeforeCb(ticketRevenue, s) + n(s.cb_amount))
}

/** Whether any SR50 / IR34 / CB amount has been entered. */
export function hasCloseOutData(s: Session) {
  return n(s.sr50_net_sales) > 0 || n(s.sr50_cashes) > 0 || n(s.ir34_totals) > 0 || n(s.cb_amount) > 0
}

export function money(v: number) {
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`
}
