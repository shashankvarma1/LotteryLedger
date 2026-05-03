import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)

  const { data, error } = await supabase
    .from('ticket_values').select('*').eq('user_id', user.id).order('ticket_number')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)
  const { ticket_number, value } = await req.json()

  const { data, error } = await supabase.from('ticket_values')
    .upsert({ ticket_number: Number(ticket_number), value: Number(value), user_id: user.id })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)
  const rows = await req.json()

  const { data, error } = await supabase.from('ticket_values')
    .upsert(rows.map((r: { ticket_number: number; value: number }) => ({
      ticket_number: Number(r.ticket_number),
      value: Number(r.value),
      user_id: user.id,
    }))).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)
  const { searchParams } = new URL(req.url)
  const ticket_number = searchParams.get('ticket_number')
  if (!ticket_number) return NextResponse.json({ error: 'ticket_number required' }, { status: 400 })

  const { error } = await supabase.from('ticket_values')
    .delete().eq('ticket_number', Number(ticket_number)).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}