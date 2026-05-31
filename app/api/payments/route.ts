import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateId, roundToHundred } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const db = createAdminClient()

  try {
    const { memberId, amount, paymentMode, notes, splitPreview, monthNo } = await req.json()

    if (!memberId || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const paymentId = generateId('PAY')
    const today = new Date().toISOString().split('T')[0]

    // 1. Insert payment
    const { error: payErr } = await db.from('payments').insert({
      payment_id: paymentId,
      payment_date: today,
      member_id: memberId,
      amount,
      payment_mode: paymentMode || 'Cash',
      month_no: monthNo,
      notes: notes || null,
      is_processed: false,
    })
    if (payErr) throw new Error(payErr.message)

    // 2. If no split preview provided, calculate it
    let splits = splitPreview
    if (!splits || splits.length === 0) {
      splits = await calculateSplitFromDB(db, memberId, amount, monthNo)
    }

    // 3. Insert allocations and update ledger
    for (const split of splits) {
      if (split.allocated <= 0) continue

      const allocId = generateId('ALC')
      await db.from('allocations').insert({
        allocation_id: allocId,
        payment_id: paymentId,
        member_id: memberId,
        group_id: split.group_id,
        month_no: monthNo,
        allocated_amount: split.allocated,
        allocation_date: today,
      })

      // Update monthly_ledger
      const { data: ledger } = await db
        .from('monthly_ledger')
        .select('ledger_id, paid_amount, expected_amount')
        .eq('member_id', memberId)
        .eq('group_id', split.group_id)
        .eq('month_no', monthNo)
        .single()

      if (ledger) {
        const newPaid = Number(ledger.paid_amount) + split.allocated
        const newBalance = Math.max(0, Number(ledger.expected_amount) - newPaid)
        const newStatus = newBalance <= 0 ? 'Paid' : 'Pending'
        await db.from('monthly_ledger').update({
          paid_amount: newPaid,
          balance: newBalance,
          status: newStatus,
        }).eq('ledger_id', ledger.ledger_id)
      } else {
        // Create ledger entry if doesn't exist
        const ledgerId = generateId('LED')
        const expected = await getExpectedAmount(db, memberId, split.group_id, monthNo)
        const newBalance = Math.max(0, expected - split.allocated)
        await db.from('monthly_ledger').insert({
          ledger_id: ledgerId,
          member_id: memberId,
          group_id: split.group_id,
          month_no: monthNo,
          expected_amount: expected,
          paid_amount: split.allocated,
          balance: newBalance,
          status: newBalance <= 0 ? 'Paid' : 'Pending',
          month_year: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
        })
      }
    }

    // 4. Mark payment as processed
    await db.from('payments').update({ is_processed: true }).eq('payment_id', paymentId)

    return NextResponse.json({ success: true, payment_id: paymentId })
  } catch (err: any) {
    console.error('Payment error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function getExpectedAmount(db: any, memberId: string, groupId: string, monthNo: number): Promise<number> {
  // Get slot count
  const { data: slot } = await db
    .from('member_slots')
    .select('slot_count')
    .eq('member_id', memberId)
    .eq('group_id', groupId)
    .single()

  if (!slot) return 0

  // Check if there's an auction for this month
  const { data: auction } = await db
    .from('auctions')
    .select('actual_installment')
    .eq('group_id', groupId)
    .eq('month_no', monthNo)
    .single()

  if (auction?.actual_installment) {
    return Number(auction.actual_installment) * Number(slot.slot_count)
  }

  // Fall back to base installment
  const { data: group } = await db
    .from('groups')
    .select('base_installment')
    .eq('group_id', groupId)
    .single()

  return Number(group?.base_installment || 0) * Number(slot.slot_count)
}

async function calculateSplitFromDB(db: any, memberId: string, totalAmount: number, monthNo: number) {
  // Get member's active slots with groups
  const { data: slots } = await db
    .from('member_slots')
    .select('*, groups(*)')
    .eq('member_id', memberId)
    .eq('status', 'Active')

  if (!slots?.length) return []

  const groups = []
  for (const slot of slots) {
    const group = slot.groups
    if (!group || group.status !== 'Active') continue

    const { data: ledger } = await db
      .from('monthly_ledger')
      .select('paid_amount, expected_amount')
      .eq('member_id', memberId)
      .eq('group_id', slot.group_id)
      .eq('month_no', monthNo)
      .single()

    const obligation = Number(group.base_installment) * Number(slot.slot_count)
    const paid = ledger ? Number(ledger.paid_amount) : 0
    const remaining = Math.max(0, obligation - paid)

    if (remaining > 0) {
      groups.push({ group_id: slot.group_id, group_name: group.group_name, remaining, obligation })
    }
  }

  if (!groups.length) return []

  const totalObligation = groups.reduce((s, g) => s + g.obligation, 0)
  const result = []
  let leftover = totalAmount

  for (let i = 0; i < groups.length - 1; i++) {
    const g = groups[i]
    const proportional = roundToHundred((totalAmount * g.obligation) / totalObligation)
    const allocated = Math.min(proportional, g.remaining, leftover)
    if (allocated > 0) {
      result.push({ group_id: g.group_id, allocated })
      leftover -= allocated
    }
  }

  if (leftover > 0 && groups.length > 0) {
    const last = groups[groups.length - 1]
    const allocated = Math.min(leftover, last.remaining)
    if (allocated > 0) result.push({ group_id: last.group_id, allocated })
  }

  return result
}
