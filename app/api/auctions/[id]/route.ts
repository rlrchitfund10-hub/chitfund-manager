import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  const { id } = await params
  try {
    const body = await req.json()

    const updateData: any = {}
    const fields = [
      'auction_date', 'winner_member_id', 'bid_amount', 'admin_commission',
      'shared_discount', 'member_discount_per_slot', 'actual_installment',
      'gross_payout', 'deduction_amount', 'net_payout',
      'saved_commission_in', 'saved_commission_out',
      'payout_status', 'payout_date',
      'winner2_member_id', 'winner1_payout', 'winner2_payout', 'notes',
    ]
    fields.forEach(f => { if (body[f] !== undefined) updateData[f] = body[f] })

    const { error } = await db.from('auctions').update(updateData).eq('auction_id', id)
    if (error) throw new Error(error.message)

    // If actual_installment changed, update monthly_ledger expected amounts
    if (body.actual_installment && body.group_id && body.month_no) {
      const { data: slots } = await db
        .from('member_slots').select('member_id, slot_count')
        .eq('group_id', body.group_id).eq('status', 'Active')
      for (const slot of (slots || [])) {
        const newExpected = Number(body.actual_installment) * Number(slot.slot_count)
        const { data: ledger } = await db
          .from('monthly_ledger').select('ledger_id, paid_amount')
          .eq('member_id', slot.member_id).eq('group_id', body.group_id).eq('month_no', body.month_no).single()
        if (ledger) {
          const paid = Number(ledger.paid_amount)
          const balance = Math.max(0, newExpected - paid)
          await db.from('monthly_ledger').update({
            expected_amount: newExpected, balance, status: balance <= 0 ? 'Paid' : 'Overdue',
          }).eq('ledger_id', ledger.ledger_id)
        }
      }
    }

    // Cascade saved_commission_out to next month's saved_commission_in if that auction exists
    if (body.saved_commission_out !== undefined && body.group_id && body.month_no) {
      const nextMonthNo = parseInt(body.month_no) + 1
      const { data: nextAuction } = await db
        .from('auctions')
        .select('auction_id')
        .eq('group_id', body.group_id)
        .eq('month_no', nextMonthNo)
        .single()
      if (nextAuction) {
        await db.from('auctions')
          .update({ saved_commission_in: body.saved_commission_out })
          .eq('auction_id', nextAuction.auction_id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  const { id } = await params
  try {
    // 1. Fetch auction context before deleting
    const { data: auction, error: fetchErr } = await db
      .from('auctions')
      .select('group_id, month_no, winner_member_id, winner2_member_id')
      .eq('auction_id', id)
      .single()
    if (fetchErr || !auction) throw new Error('Auction not found')

    // 2. Get group's base installment to restore expected amounts
    const { data: group } = await db
      .from('groups')
      .select('base_installment')
      .eq('group_id', auction.group_id)
      .single()
    const baseInstallment = Number(group?.base_installment || 0)

    // 3. Reset monthly_ledger expected amounts for that month back to base for all members
    const { data: allSlots } = await db
      .from('member_slots')
      .select('member_id, slot_count')
      .eq('group_id', auction.group_id)

    for (const slot of (allSlots || [])) {
      const baseExpected = baseInstallment * Number(slot.slot_count)
      const { data: ledger } = await db
        .from('monthly_ledger')
        .select('ledger_id, paid_amount')
        .eq('member_id', slot.member_id)
        .eq('group_id', auction.group_id)
        .eq('month_no', auction.month_no)
        .maybeSingle()
      if (ledger) {
        const paid = Number(ledger.paid_amount)
        const balance = baseExpected - paid
        await db.from('monthly_ledger').update({
          expected_amount: baseExpected,
          balance,
          status: balance <= 0 ? 'Paid' : 'Pending',
        }).eq('ledger_id', ledger.ledger_id)
      }
    }

    // 4. Reset winner slot(s) back to Active
    await resetWinnerSlot(db, auction.winner_member_id, auction.group_id, auction.month_no)
    if (auction.winner2_member_id) {
      await resetWinnerSlot(db, auction.winner2_member_id, auction.group_id, auction.month_no)
    }

    // 5. Delete the auction
    const { error } = await db.from('auctions').delete().eq('auction_id', id)
    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function resetWinnerSlot(db: any, memberId: string, groupId: string, monthNo: number) {
  const { data: slots } = await db
    .from('member_slots')
    .select('slot_id')
    .eq('member_id', memberId)
    .eq('group_id', groupId)
    .eq('won_month_no', monthNo)
    .limit(1)
  if (slots?.length) {
    await db.from('member_slots').update({
      has_won: 'No',
      status: 'Active',
      won_month_no: null,
      won_payout: null,
    }).eq('slot_id', slots[0].slot_id)
  }
}
