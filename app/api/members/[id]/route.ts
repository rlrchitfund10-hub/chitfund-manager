import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  const { id } = await params
  try {
    const body = await req.json()
    const { full_name, phone, phone_alt, address, aadhaar, join_date, is_daily_payer, status, notes } = body

    if (!full_name?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 })
    }

    const { error } = await db.from('members').update({
      full_name: full_name.trim(),
      phone: phone.trim(),
      phone_alt: phone_alt?.trim() || null,
      address: address?.trim() || null,
      aadhaar: aadhaar?.trim() || null,
      join_date,
      is_daily_payer: !!is_daily_payer,
      status: status || 'Active',
      notes: notes?.trim() || null,
    }).eq('member_id', id)

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
