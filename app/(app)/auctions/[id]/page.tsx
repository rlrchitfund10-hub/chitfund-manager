'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function EditAuctionPage() {
  const { id } = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [group, setGroup] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])

  const [form, setForm] = useState({
    auction_date: '',
    month_no: '',
    winner_member_id: '',
    bid_amount: '',
    shared_discount: '',
    saved_commission_in: '0',
    deduction_amount: '0',
    winner2_member_id: '',
    winner1_payout: '',
    winner2_payout: '',
    payout_status: 'Pending',
    notes: '',
  })

  const [winnerDues, setWinnerDues] = useState(0)
  const [isHalfSlot, setIsHalfSlot] = useState(false)
  const [originalAuction, setOriginalAuction] = useState<any>(null)

  useEffect(() => { loadAuction() }, [id])
  useEffect(() => { if (form.winner_member_id && group) { loadWinnerDues(); checkHalfSlot() } }, [form.winner_member_id, group])

  async function loadAuction() {
    const db = createClient()
    const { data: auction } = await db.from('auctions').select('*').eq('auction_id', id).single()
    if (!auction) { setLoading(false); return }

    setOriginalAuction(auction)

    // Load group details
    const { data: groupData } = await db.from('groups').select('*').eq('group_id', auction.group_id).single()
    setGroup(groupData)

    // Load all members for this group
    const { data: slots } = await db.from('member_slots').select('member_id, slot_count').eq('group_id', auction.group_id)
    const slotMap: Record<string, number> = {}
    const memberIds = (slots || []).map((s: any) => { slotMap[s.member_id] = Number(s.slot_count); return s.member_id })
    if (memberIds.length > 0) {
      const { data: md } = await db.from('members').select('member_id, full_name').in('member_id', memberIds).order('full_name')
      setMembers((md || []).map((m: any) => ({ ...m, slot_count: slotMap[m.member_id] ?? 1 })))
    }

    // Pre-fill form
    setForm({
      auction_date: auction.auction_date || '',
      month_no: String(auction.month_no || ''),
      winner_member_id: auction.winner_member_id || '',
      bid_amount: String(auction.bid_amount || ''),
      shared_discount: String(auction.shared_discount || ''),
      saved_commission_in: String(auction.saved_commission_in || 0),
      deduction_amount: String(auction.deduction_amount || 0),
      winner2_member_id: auction.winner2_member_id || '',
      winner1_payout: String(auction.winner1_payout || ''),
      winner2_payout: String(auction.winner2_payout || ''),
      payout_status: auction.payout_status || 'Pending',
      notes: auction.notes || '',
    })

    setLoading(false)
  }

  async function loadWinnerDues() {
    if (!originalAuction) return
    const db = createClient()
    const { data } = await db.from('monthly_ledger').select('balance')
      .eq('member_id', form.winner_member_id)
      .eq('group_id', originalAuction.group_id)
      .neq('status', 'Paid')
    setWinnerDues((data || []).reduce((s: number, l: any) => s + Number(l.balance), 0))
  }

  function checkHalfSlot() {
    const m = members.find((m: any) => m.member_id === form.winner_member_id)
    setIsHalfSlot((m?.slot_count ?? 1) === 0.5)
  }

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // ── Live calculations ──
  const bid = parseFloat(form.bid_amount) || 0
  const sharedDiscount = parseFloat(form.shared_discount) || 0
  const savedIn = parseFloat(form.saved_commission_in) || 0
  const deduction = parseFloat(form.deduction_amount) || 0
  const adminCommission = group ? Number(group.principal_amount) * (Number(group.commission_pct) / 100) : 0
  const totalAvailable = bid + savedIn
  const netPool = totalAvailable - adminCommission
  const savedForNext = netPool - sharedDiscount
  const discountPerSlot = group ? sharedDiscount / Number(group.total_slots) : 0
  const actualInstallment = group ? Number(group.base_installment) - discountPerSlot : 0
  const grossPayout = group ? (actualInstallment * Number(group.total_slots)) - adminCommission : 0
  const netPayout = grossPayout - deduction
  const canCalc = bid > 0 && sharedDiscount > 0 && !!group

  // Auto-update split payout when net changes
  useEffect(() => {
    if (canCalc && netPayout > 0 && isHalfSlot) {
      setForm(prev => ({
        ...prev,
        winner1_payout: String(Math.round(netPayout / 2)),
        winner2_payout: String(Math.round(netPayout / 2)),
      }))
    }
  }, [netPayout, canCalc, isHalfSlot])

  async function handleSave() {
    if (!form.winner_member_id || !bid || !sharedDiscount) {
      alert('Fill in all required fields including bid amount and shared discount')
      return
    }
    if (isHalfSlot && !form.winner2_member_id) {
      alert('This winner has a ½ slot — please select a partner to complete the auction')
      return
    }
    if (sharedDiscount > netPool) {
      alert(`Shared Discount cannot exceed Net Pool (${formatCurrency(netPool)})`)
      return
    }
    setSaving(true)

    const res = await fetch(`/api/auctions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auction_date: form.auction_date,
        month_no: parseInt(form.month_no),
        winner_member_id: form.winner_member_id,
        bid_amount: bid,
        admin_commission: adminCommission,
        shared_discount: sharedDiscount,
        member_discount_per_slot: discountPerSlot,
        actual_installment: actualInstallment,
        gross_payout: grossPayout,
        deduction_amount: deduction,
        net_payout: netPayout,
        saved_commission_in: savedIn,
        saved_commission_out: savedForNext,
        payout_status: form.payout_status,
        winner2_member_id: isHalfSlot && form.winner2_member_id ? form.winner2_member_id : null,
        winner1_payout: isHalfSlot ? parseFloat(form.winner1_payout) || null : null,
        winner2_payout: isHalfSlot ? parseFloat(form.winner2_payout) || null : null,
        notes: form.notes || null,
        // Pass these so the API can update monthly_ledger
        group_id: originalAuction?.group_id,
      }),
    })

    if (res.ok) {
      router.back()
    } else {
      const err = await res.json()
      alert(err.error || 'Failed to save')
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh] text-gray-400">Loading...</div>
  if (!originalAuction) return <div className="p-4 text-red-500">Auction not found</div>

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 text-xl">←</button>
        <h2 className="text-xl font-bold text-gray-800">
          Edit Auction — {group?.group_name} Month {form.month_no}
        </h2>
      </div>

      {/* Group info */}
      {group && (
        <div className="bg-indigo-50 rounded-xl px-4 py-3 text-sm flex justify-between">
          <span className="text-indigo-700 font-medium">{group.group_name}</span>
          <span className="text-indigo-600">Base ₹{Number(group.base_installment).toLocaleString()} | {group.commission_pct}% comm</span>
        </div>
      )}

      {/* Date + Month */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Auction Date</label>
            <input type="date" value={form.auction_date} onChange={e => update('auction_date', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
            {form.auction_date && <p className="text-xs text-gray-400 mt-1">{formatDate(form.auction_date)}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Month No</label>
            <input type="number" min="1" value={form.month_no} onChange={e => update('month_no', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
          </div>
        </div>

        {/* Winner */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Auction Winner *</label>
          <select value={form.winner_member_id} onChange={e => update('winner_member_id', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm">
            <option value="">Select winner...</option>
            {members.map((m: any) => (
              <option key={m.member_id} value={m.member_id}>{m.full_name}{m.slot_count === 0.5 ? ' (½ slot)' : ''}</option>
            ))}
          </select>
          {winnerDues > 0 && (
            <p className="text-sm text-red-600 mt-1 bg-red-50 px-3 py-1.5 rounded-lg">
              ⚠ Winner has {formatCurrency(winnerDues)} outstanding dues
            </p>
          )}
        </div>

        {isHalfSlot && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
            <p className="text-sm font-semibold text-amber-800">½ Slot — must select a partner to complete the auction</p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Partner Winner (½ slot) *</label>
              <select
                value={form.winner2_member_id}
                onChange={e => update('winner2_member_id', e.target.value)}
                className="w-full px-3 py-2.5 border border-amber-300 rounded-xl bg-white text-sm"
              >
                <option value="">Select ½ slot partner...</option>
                {members
                  .filter((m: any) => m.slot_count === 0.5 && m.member_id !== form.winner_member_id)
                  .map((m: any) => (
                    <option key={m.member_id} value={m.member_id}>{m.full_name}</option>
                  ))
                }
              </select>
            </div>
          </div>
        )}

        {/* Payout status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payout Status</label>
          <select value={form.payout_status} onChange={e => update('payout_status', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm">
            <option value="Pending">Pending</option>
            <option value="Paid">Paid</option>
          </select>
        </div>
      </div>

      {/* Calculation card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <p className="font-semibold text-gray-800">Auction Calculation</p>

        {/* Bid Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Winning Bid Amount (₹) *</label>
          <input type="number" value={form.bid_amount} onChange={e => update('bid_amount', e.target.value)}
            placeholder="Enter bid amount"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm font-medium" />
        </div>

        {/* Saved Commission In */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Saved Commission (from last month)
          </label>
          <input type="number" value={form.saved_commission_in} onChange={e => update('saved_commission_in', e.target.value)}
            className="w-full px-4 py-3 border border-blue-200 rounded-xl bg-blue-50 text-sm font-medium" />
          <p className="text-xs text-blue-600 mt-1">Auto-loaded from previous month — edit only if needed</p>
        </div>

        {/* Sum calculation — shown before shared discount input */}
        {bid > 0 && group && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 border border-gray-200 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Bid Amount</span>
              <span className="font-medium">{formatCurrency(bid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">+ Saved Commission</span>
              <span className="font-medium">{formatCurrency(savedIn)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5">
              <span className="text-gray-600 font-medium">= Total Available</span>
              <span className="font-semibold">{formatCurrency(totalAvailable)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">− Admin Commission ({group.commission_pct}%)</span>
              <span className="font-medium text-red-500">−{formatCurrency(adminCommission)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5">
              <span className="text-gray-600 font-medium">= Net Pool</span>
              <span className="font-semibold text-gray-800">{formatCurrency(netPool)}</span>
            </div>
          </div>
        )}

        {/* Shared Discount — after sum calculation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Shared Discount (₹) * <span className="text-gray-400 text-xs">— amount shared with all members</span>
          </label>
          <input type="number" value={form.shared_discount} onChange={e => update('shared_discount', e.target.value)}
            placeholder="Enter amount to share"
            className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl bg-indigo-50 text-sm font-medium" />
        </div>

        {/* Results: discount per slot + saved next month */}
        {sharedDiscount > 0 && group && (
          <>
            {sharedDiscount > netPool && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">
                ⚠ Shared Discount ({formatCurrency(sharedDiscount)}) cannot exceed Net Pool ({formatCurrency(netPool)})
              </p>
            )}
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 border border-gray-200 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">− Shared Discount</span>
                <span className="font-medium text-orange-500">−{formatCurrency(sharedDiscount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-indigo-700 font-medium">Discount per Slot</span>
                <span className="font-semibold text-indigo-700">{formatCurrency(discountPerSlot)}</span>
              </div>
              <div className={`flex justify-between border-t border-gray-200 pt-1.5 font-semibold ${savedForNext >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                <span>Saved =</span>
                <span>{formatCurrency(savedForNext)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Gross Payout — separate */}
      {canCalc && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600 mb-2">Winner Payout</p>
          <div className="flex justify-between items-center bg-purple-50 rounded-xl px-4 py-3 mb-3">
            <span className="text-purple-700 font-medium">Gross Payout to Winner</span>
            <span className="font-bold text-purple-700 text-xl">{formatCurrency(grossPayout)}</span>
          </div>

          {/* Net payout */}
          <div className="bg-indigo-600 text-white rounded-xl px-4 py-4 flex justify-between items-center">
            <span className="font-bold">Net Payout to Winner</span>
            <span className="font-bold text-2xl">{formatCurrency(netPayout)}</span>
          </div>
        </div>
      )}

      {/* Shared slot payout split */}
      {canCalc && isHalfSlot && form.winner2_member_id && (
        <div className="bg-yellow-50 rounded-2xl p-4 shadow-sm border border-yellow-200 space-y-3">
          <p className="font-semibold text-yellow-800 text-sm">Shared Slot — Split Payout</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Winner 1 Payout</label>
              <input type="number" value={form.winner1_payout} onChange={e => update('winner1_payout', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Winner 2 Payout</label>
              <input type="number" value={form.winner2_payout} onChange={e => update('winner2_payout', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-sm" />
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <input value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Any notes..."
          className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
      </div>

      <button onClick={handleSave} disabled={saving || !canCalc || (isHalfSlot && !form.winner2_member_id) || (sharedDiscount > netPool)}
        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow active:scale-95 disabled:opacity-50 text-lg">
        {saving ? 'Saving...' : '✓ Save Auction Changes'}
      </button>
    </div>
  )
}
