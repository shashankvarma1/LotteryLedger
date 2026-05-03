import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)

  const { data, error } = await supabase
    .from('sessions').select('*')
    .eq('user_id', user.id)
    .order('session_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)
  const { session_date, price_per_ticket, notes } = await req.json()

  const { data, error } = await supabase.from('sessions').insert({
    session_date: session_date || new Date().toISOString().split('T')[0],
    price_per_ticket: Number(price_per_ticket) || 1,
    notes: notes || null,
    user_id: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}