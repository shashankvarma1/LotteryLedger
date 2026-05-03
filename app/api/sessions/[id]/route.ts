import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)

  const [s, b] = await Promise.all([
    supabase.from('sessions').select('*').eq('id', params.id).eq('user_id', user.id).single(),
    supabase.from('books').select('*').eq('session_id', params.id).eq('user_id', user.id).order('row_number'),
  ])
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: 500 })
  return NextResponse.json({ session: s.data, books: b.data || [] })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)
  const body = await req.json()

  const { data, error } = await supabase
    .from('sessions').update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id).eq('user_id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createClient(token)

  const { error } = await supabase.from('sessions').delete().eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}