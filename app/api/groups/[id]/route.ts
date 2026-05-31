import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  const { id } = await params
  try {
    const body = await req.json()
    const { group_name, auction_day, principal_amount, total_slots, total_months, commission_pct, start_date, status } = body

    const { error } = await db.from('groups').update({
      group_name, auction_day, principal_amount, total_slots,
      total_months: total_months || total_slots, commission_pct, start_date, status,
    }).eq('group_id', id)

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
