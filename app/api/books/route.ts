import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)
  const { session_id, row_number, count = 1, start_num, end_num } = await req.json()

  const rows = Array.from({ length: count }, (_, i) => ({
    session_id, row_number: row_number + i,
    start_num: start_num ?? null, end_num: end_num ?? null,
    is_returned: false, user_id: user.id,
  }))
  const { data, error } = await supabase.from('books').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)
  const { id, ...updates } = await req.json()

  const { data, error } = await supabase.from('books').update(updates).eq('id', id).eq('user_id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('books').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}