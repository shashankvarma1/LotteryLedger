import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ price_per_ticket: 1.00 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)

  const { data } = await supabase.from('settings').select('*').eq('user_id', user.id).single()
  return NextResponse.json(data || { price_per_ticket: 1.00 })
}

export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)
  const { price_per_ticket } = await req.json()

  const { data, error } = await supabase.from('settings')
    .upsert({ id: user.id, user_id: user.id, price_per_ticket: Number(price_per_ticket) })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}