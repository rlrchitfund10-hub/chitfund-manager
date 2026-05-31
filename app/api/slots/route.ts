import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateId, getCurrentMonthNo } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const db = createAdminClient()
  try {
    const { member_id, group_id, slot_count, partner_member_id } = await req.json()

    if (!member_id || !group_id || !slot_count) {
      return NextResponse.json({ error: 'Member, group, and slot count are required' }, { status: 400 })
    }

    const slotId = generateId('SLT')
    const { error } = await db.from('member_slots').insert({
      slot_id: slotId,
      member_id,
      group_id,
      slot_count: parseFloat(slot_count),
      partner_member_id: partner_member_id || null,
      has_won: 'No',
      status: 'Active',
    })
    if (error) throw new Error(error.message)

    // Create monthly_ledger entry for current month
    const { data: group } = await db.from('groups').select('*').eq('group_id', group_id).single()
    if (group) {
      const monthNo = getCurrentMonthNo(group.start_date)
      // Check if ledger entry exists
      const { data: existing } = await db
        .from('monthly_ledger')
        .select('ledger_id')
        .eq('member_id', member_id)
        .eq('group_id', group_id)
        .eq('month_no', monthNo)
        .single()

      if (!existing) {
        // Check if there's an auction for this month
        const { data: auction } = await db
          .from('auctions')
          .select('actual_installment')
          .eq('group_id', group_id)
          .eq('month_no', monthNo)
          .single()

        const installment = auction?.actual_installment
          ? Number(auction.actual_installment)
          : Number(group.base_installment)
        const expected = installment * parseFloat(slot_count)
        const ledgerId = generateId('LED')

        await db.from('monthly_ledger').insert({
          ledger_id: ledgerId,
          member_id, group_id, month_no: monthNo,
          expected_amount: expected,
          paid_amount: 0, balance: expected,
          status: 'Pending',
          month_year: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
        })
      }
    }

    return NextResponse.json({ success: true, slot_id: slotId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
