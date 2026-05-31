import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  const { id } = await params
  try {
    // Delete the slot and its ledger entries
    const { data: slot } = await db.from('member_slots').select('member_id, group_id').eq('slot_id', id).single()

    if (slot) {
      await db.from('monthly_ledger')
        .delete()
        .eq('member_id', slot.member_id)
        .eq('group_id', slot.group_id)
        .eq('paid_amount', 0) // only delete if no payments made
    }

    const { error } = await db.from('member_slots').delete().eq('slot_id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
