import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateId } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const db = createAdminClient()
  try {
    const body = await req.json()
    const { full_name, phone, phone_alt, address, aadhaar, join_date, is_daily_payer, status, notes } = body

    if (!full_name?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 })
    }

    // Check phone uniqueness
    const { data: existing } = await db.from('members').select('member_id').eq('phone', phone.trim()).single()
    if (existing) return NextResponse.json({ error: 'Phone number already registered' }, { status: 400 })

    const memberId = generateId('M')
    const { error } = await db.from('members').insert({
      member_id: memberId,
      full_name: full_name.trim(),
      phone: phone.trim(),
      phone_alt: phone_alt?.trim() || null,
      address: address?.trim() || null,
      aadhaar: aadhaar?.trim() || null,
      join_date: join_date || new Date().toISOString().split('T')[0],
      is_daily_payer: !!is_daily_payer,
      status: status || 'Active',
      notes: notes?.trim() || null,
    })

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, member_id: memberId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
