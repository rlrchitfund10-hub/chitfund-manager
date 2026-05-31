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

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
