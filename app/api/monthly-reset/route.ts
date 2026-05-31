import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateId } from '@/lib/utils'

// Runs 1st of every month — call from Vercel Cron or manually
export async function POST(req: NextRequest) {
  const db = createAdminClient()

  try {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    const monthYear = `${currentMonth}/${currentYear}`

    // 1. Mark previous month PENDING entries as OVERDUE
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear

    const { error: overdueErr } = await db
      .from('monthly_ledger')
      .update({ status: 'Overdue' })
      .eq('status', 'Pending')
      .lt('month_no', getCurrentMonthNoForGroup(now))

    // 2. Get all active groups with members
    const { data: groups } = await db
      .from('groups')
      .select('*')
      .eq('status', 'Active')

    if (!groups) return NextResponse.json({ success: true, message: 'No active groups' })

    let created = 0
    for (const group of groups) {
      const monthNo = getGroupMonthNo(group.start_date, now)
      if (monthNo > group.total_months) continue

      // Get all active slots for this group
      const { data: slots } = await db
        .from('member_slots')
        .select('member_id, slot_count')
        .eq('group_id', group.group_id)
        .eq('status', 'Active')

      for (const slot of (slots || [])) {
        // Check if ledger entry already exists
        const { data: existing } = await db
          .from('monthly_ledger')
          .select('ledger_id')
          .eq('member_id', slot.member_id)
          .eq('group_id', group.group_id)
          .eq('month_no', monthNo)
          .single()

        if (!existing) {
          const expected = Number(group.base_installment) * Number(slot.slot_count)
          const ledgerId = generateId('LED')
          await db.from('monthly_ledger').insert({
            ledger_id: ledgerId,
            member_id: slot.member_id,
            group_id: group.group_id,
            month_no: monthNo,
            expected_amount: expected,
            paid_amount: 0,
            balance: expected,
            status: 'Pending',
            month_year: monthYear,
          })
          created++
        }
      }
    }

    return NextResponse.json({ success: true, ledger_entries_created: created })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function getGroupMonthNo(startDate: string, now: Date): number {
  const start = new Date(startDate)
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1
  return Math.max(1, months)
}

function getCurrentMonthNoForGroup(now: Date): number {
  return now.getMonth() + 1
}
