import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      localStorage.removeItem('selected_store_id')
      localStorage.removeItem('selected_store_name')
      window.location.href = '/auth'
    }
  })
}

// Every sessions column EXCEPT pdf_html. The saved report HTML is large, so only
// load it when someone actually opens a PDF — never on page load or after a save.
// (Cast to '*' only for typing — the client is untyped, so rows are `any` either way.)
export const SESSION_COLS = 'id, session_date, price_per_ticket, sr50_net_sales, sr50_commission, sr50_cashes, sr50_cash_bonus, sr50_claims_bonus, sr50_adjustments, sr50_service_fee, sr50_net_due, ir34_tickets, ir34_totals, notes, user_id, store_id, created_at, ticket_revenue, ticket_snapshot, pdf_saved_at, cb_amount, cash_diff, cash_note, corrections' as '*'

export type Session = {
  id: string
  session_date: string
  price_per_ticket: number
  sr50_net_sales: number
  sr50_commission: number
  sr50_cashes: number
  sr50_cash_bonus: number
  sr50_claims_bonus: number
  sr50_adjustments: number
  sr50_service_fee: number
  sr50_net_due: number
  ir34_tickets: number
  ir34_totals: number
  notes: string | null
  user_id: string
  store_id: string
  created_at: string
  ticket_revenue: number
  ticket_snapshot: unknown
  pdf_html: string | null
  pdf_saved_at: string | null
  cb_amount: number | null      // "Cashed from Back" — cashes paid at the other register; added to final total
  cash_diff: number | null      // cash short (negative) / over (positive) vs. final total
  cash_note: string | null      // staff explanation for the short/over
  corrections: Correction[] | null  // automatic start/end corrections between consecutive days
}

// 'start' lives on the later session (staff fixed today's start),
// 'end' lives on the earlier session (its end was changed automatically to match).
export type Correction = {
  kind:          'start' | 'end'
  ticket_number: number
  old:           number   // original value (kept across repeated edits)
  new:           number
  other_date:    string   // the other session's date
  at:            string   // ISO timestamp of the latest change
}

export type Book = {
  id: string
  session_id: string
  row_number: number
  start_num: number | null
  end_num: number | null
  is_returned: boolean
  user_id: string
}

export type TicketValue = {
  ticket_number: number
  value: number
  book_size: number
}

export type Profile = {
  id: string
  email: string
  role: 'admin' | 'user'
  display_name: string | null
  created_at: string
}

export type StoreAccess = {
  id: string
  store_id: string
  user_id: string
  granted_by: string
  created_at: string
}