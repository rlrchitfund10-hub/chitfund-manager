import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateId } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const db = createAdminClient()
  try {
    const body = await req.json()
    const { group_name, auction_day, principal_amount, total_slots, total_months, commission_pct, start_date } = body

    if (!group_name?.trim() || !principal_amount || !total_slots) {
      return NextResponse.json({ error: 'Name, principal amount, and total slots are required' }, { status: 400 })
    }

    const groupId = generateId('G')
    const { error } = await db.from('groups').insert({
      group_id: groupId,
      group_name: group_name.trim(),
      auction_day: auction_day || 1,
      principal_amount,
      total_slots,
      total_months: total_months || total_slots,
      commission_pct: commission_pct || 4,
      start_date: start_date || new Date().toISOString().split('T')[0],
      status: 'Active',
    })

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, group_id: groupId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
