import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Auto redirect to login if session expires
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      localStorage.removeItem('selected_store_id')
      localStorage.removeItem('selected_store_name')
      window.location.href = '/auth'
    }
  })
}

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