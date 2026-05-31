import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateId } from '@/lib/utils'
import { createAllLedgerEntries } from '../route'

export async function POST(req: NextRequest) {
  const db = createAdminClient()
  try {
    const { group_id, members } = await req.json()

    if (!group_id || !members?.length) {
      return NextResponse.json({ error: 'Missing group_id or members' }, { status: 400 })
    }

    const { data: group } = await db.from('groups').select('*').eq('group_id', group_id).single()
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const results = []

    for (const m of members) {
      // Skip if already in group
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

      // Create ledger entries for ALL months (historical + current)
      await createAllLedgerEntries(db, m.member_id, group_id, parseFloat(m.slot_count), group)

      results.push({ member_id: m.member_id, slot_id: slotId, success: true })
    }

    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
