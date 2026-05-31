import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateId } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const db = createAdminClient()

  try {
    const body = await req.json()
    const {
      group_id, month_no, auction_date, winner_member_id, bid_amount,
      admin_commission, shared_discount, member_discount_per_slot,
      actual_installment, gross_payout, deduction_amount, net_payout,
      saved_commission_in, saved_commission_out,
      notes, winner2_member_id, winner1_payout, winner2_payout,
    } = body

    if (!group_id || !winner_member_id || !bid_amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const auctionId = generateId('AUC')

    // 1. Insert auction
    const { error: aErr } = await db.from('auctions').insert({
      auction_id: auctionId,
      group_id, month_no, auction_date, winner_member_id,
      bid_amount, admin_commission, shared_discount,
      member_discount_per_slot, actual_installment,
      gross_payout, deduction_amount: deduction_amount || 0, net_payout,
      saved_commission_in: saved_commission_in || 0,
      saved_commission_out: saved_commission_out || 0,
      payout_status: 'Pending',
      winner2_member_id: winner2_member_id || null,
      winner1_payout: winner1_payout || null,
      winner2_payout: winner2_payout || null,
      notes: notes || null,
    })
    if (aErr) throw new Error(aErr.message)

    // 2. Mark winner's slot as Won
    await markWinnerSlot(db, winner_member_id, group_id, month_no, net_payout)

    // 3. If shared slot, mark partner's slot too
    if (winner2_member_id) {
      await markWinnerSlot(db, winner2_member_id, group_id, month_no, winner2_payout || net_payout / 2)
    }

    // 4. Update monthly_ledger expected amounts for all members (new installment)
    if (actual_installment) {
      await updateLedgerExpected(db, group_id, month_no, actual_installment)
    }

    // 5. If winner had dues and deduction > 0, clear those dues
    if (deduction_amount > 0) {
      await clearWinnerDues(db, winner_member_id, group_id, deduction_amount)
    }

    return NextResponse.json({ success: true, auction_id: auctionId })
  } catch (err: any) {
    console.error('Auction error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const db = createAdminClient()
  try {
    const { auction_id, payout_status, payout_date } = await req.json()
    const { error } = await db
      .from('auctions')
      .update({ payout_status, payout_date })
      .eq('auction_id', auction_id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function markWinnerSlot(db: any, memberId: string, groupId: string, monthNo: number, payout: number) {
  // Find first unwon slot for this member in this group
  const { data: slots } = await db
    .from('member_slots')
    .select('slot_id')
    .eq('member_id', memberId)
    .eq('group_id', groupId)
    .eq('has_won', 'No')
    .limit(1)

  if (slots?.length) {
    await db.from('member_slots').update({
      has_won: 'Yes',
      status: 'Won',
      won_month_no: monthNo,
      won_payout: payout,
    }).eq('slot_id', slots[0].slot_id)
  }
}

async function updateLedgerExpected(db: any, groupId: string, monthNo: number, actualInstallment: number) {
  // Get all active slots for this group
  const { data: slots } = await db
    .from('member_slots')
    .select('member_id, slot_count')
    .eq('group_id', groupId)
    .eq('status', 'Active')

  for (const slot of (slots || [])) {
    const newExpected = actualInstallment * Number(slot.slot_count)
    const { data: ledger } = await db
      .from('monthly_ledger')
      .select('ledger_id, paid_amount')
      .eq('member_id', slot.member_id)
      .eq('group_id', groupId)
      .eq('month_no', monthNo)
      .single()

    if (ledger) {
      const paid = Number(ledger.paid_amount)
      const balance = Math.max(0, newExpected - paid)
      await db.from('monthly_ledger').update({
        expected_amount: newExpected,
        balance,
        status: balance <= 0 ? 'Paid' : 'Pending',
      }).eq('ledger_id', ledger.ledger_id)
    } else {
      // Create ledger entry
      const ledgerId = generateId('LED')
      await db.from('monthly_ledger').insert({
        ledger_id: ledgerId,
        member_id: slot.member_id,
        group_id: groupId,
        month_no: monthNo,
        expected_amount: newExpected,
        paid_amount: 0,
        balance: newExpected,
        status: 'Pending',
        month_year: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
      })
    }
  }
}

async function clearWinnerDues(db: any, memberId: string, groupId: string, deductionAmount: number) {
  // Get overdue entries for this member in this group, clear them up to deduction amount
  const { data: overdueEntries } = await db
    .from('monthly_ledger')
    .select('*')
    .eq('member_id', memberId)
    .eq('group_id', groupId)
    .eq('status', 'Overdue')
    .order('month_no', { ascending: true })

  let remaining = deductionAmount
  for (const entry of (overdueEntries || [])) {
    if (remaining <= 0) break
    const toApply = Math.min(remaining, Number(entry.balance))
    const newPaid = Number(entry.paid_amount) + toApply
    const newBalance = Math.max(0, Number(entry.expected_amount) - newPaid)
    await db.from('monthly_ledger').update({
      paid_amount: newPaid,
      balance: newBalance,
      status: newBalance <= 0 ? 'Paid' : 'Overdue',
    }).eq('ledger_id', entry.ledger_id)
    remaining -= toApply
  }
}
