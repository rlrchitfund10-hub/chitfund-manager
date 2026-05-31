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

    // Check if slot already exists
    const { data: existing } = await db
      .from('member_slots').select('slot_id')
      .eq('member_id', member_id).eq('group_id', group_id).single()
    if (existing) {
      return NextResponse.json({ error: 'Member already in this group' }, { status: 400 })
    }

    const slotId = generateId('SLT')
    const { error } = await db.from('member_slots').insert({
      slot_id: slotId,
      member_id, group_id,
      slot_count: parseFloat(slot_count),
      partner_member_id: partner_member_id || null,
      has_won: 'No', status: 'Active',
    })
    if (error) throw new Error(error.message)

    // Create ledger entries for ALL months from Month 1 to current
    const { data: group } = await db.from('groups').select('*').eq('group_id', group_id).single()
    if (group) {
      await createAllLedgerEntries(db, member_id, group_id, parseFloat(slot_count), group)
    }

    return NextResponse.json({ success: true, slot_id: slotId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function createAllLedgerEntries(
  db: any,
  memberId: string,
  groupId: string,
  slotCount: number,
  group: any
) {
  const currentMonthNo = getCurrentMonthNo(group.start_date)
  const startDate = new Date(group.start_date)

  // Fetch all auctions for this group to get actual installments per month
  const { data: auctions } = await db
    .from('auctions')
    .select('month_no, actual_installment')
    .eq('group_id', groupId)
  const auctionMap: Record<number, number> = {}
  ;(auctions || []).forEach((a: any) => {
    auctionMap[a.month_no] = Number(a.actual_installment)
  })

  for (let m = 1; m <= currentMonthNo; m++) {
    // Skip if ledger entry already exists
    const { data: existing } = await db
      .from('monthly_ledger').select('ledger_id')
      .eq('member_id', memberId).eq('group_id', groupId).eq('month_no', m).single()
    if (existing) continue

    // Calculate month's calendar date
    const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + m - 1, 1)
    const monthYear = `${monthDate.getMonth() + 1}/${monthDate.getFullYear()}`

    // Use actual installment if auction recorded for this month, else base
    const installment = auctionMap[m] ?? Number(group.base_installment)
    const expected = installment * slotCount

    await db.from('monthly_ledger').insert({
      ledger_id: generateId('LED'),
      member_id: memberId,
      group_id: groupId,
      month_no: m,
      expected_amount: expected,
      paid_amount: 0,
      balance: expected,
      status: m < currentMonthNo ? 'Overdue' : 'Pending',
      month_year: monthYear,
    })
  }
}
