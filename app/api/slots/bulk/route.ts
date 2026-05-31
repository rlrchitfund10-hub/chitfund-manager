import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateId, getCurrentMonthNo } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const db = createAdminClient()
  try {
    const { group_id, members } = await req.json()
    // members: [{ member_id, slot_count }]

    if (!group_id || !members?.length) {
      return NextResponse.json({ error: 'Missing group_id or members' }, { status: 400 })
    }

    const { data: group } = await db.from('groups').select('*').eq('group_id', group_id).single()
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const monthNo = getCurrentMonthNo(group.start_date)
    const monthYear = `${new Date().getMonth() + 1}/${new Date().getFullYear()}`
    const results = []

    for (const m of members) {
      // Check if slot already exists
      const { data: existing } = await db
        .from('member_slots').select('slot_id')
        .eq('member_id', m.member_id).eq('group_id', group_id).single()
      if (existing) { results.push({ member_id: m.member_id, skipped: true }); continue }

      const slotId = generateId('SLT')
      const { error: slotErr } = await db.from('member_slots').insert({
        slot_id: slotId,
        member_id: m.member_id,
        group_id,
        slot_count: parseFloat(m.slot_count),
        has_won: 'No',
        status: 'Active',
      })
      if (slotErr) { results.push({ member_id: m.member_id, error: slotErr.message }); continue }

      // Check if ledger entry exists
      const { data: ledgerExisting } = await db
        .from('monthly_ledger').select('ledger_id')
        .eq('member_id', m.member_id).eq('group_id', group_id).eq('month_no', monthNo).single()

      if (!ledgerExisting) {
        const { data: auction } = await db
          .from('auctions').select('actual_installment')
          .eq('group_id', group_id).eq('month_no', monthNo).single()
        const installment = auction?.actual_installment
          ? Number(auction.actual_installment)
          : Number(group.base_installment)
        const expected = installment * parseFloat(m.slot_count)
        await db.from('monthly_ledger').insert({
          ledger_id: generateId('LED'),
          member_id: m.member_id, group_id, month_no: monthNo,
          expected_amount: expected, paid_amount: 0, balance: expected,
          status: 'Pending', month_year: monthYear,
        })
      }

      results.push({ member_id: m.member_id, slot_id: slotId, success: true })
    }

    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
