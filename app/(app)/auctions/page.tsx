'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, getCurrentMonthNo } from '@/lib/utils'

function AuctionForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const preselectedGroup = searchParams.get('group') || ''

  const [groups, setGroups] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [selectedGroup, setSelectedGroup] = useState(preselectedGroup)
  const [groupDetails, setGroupDetails] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    winner_member_id: '',
    bid_amount: '',
    shared_discount: '',
    deduction_amount: '0',
    auction_date: new Date().toISOString().split('T')[0],
    month_no_override: '',
    winner2_member_id: '',
    winner1_payout: '',
    winner2_payout: '',
    notes: '',
  })

  // Auto-fetched
  const [savedFromLastMonth, setSavedFromLastMonth] = useState(0)
  const [winnerDues, setWinnerDues] = useState(0)
  const [isHalfSlot, setIsHalfSlot] = useState(false)

  useEffect(() => { loadInitial() }, [])
  useEffect(() => { if (selectedGroup) loadGroupDetails(selectedGroup) }, [selectedGroup])
  useEffect(() => { if (form.winner_member_id && selectedGroup) { loadWinnerDues(); checkHalfSlot() } }, [form.winner_member_id, selectedGroup])

  async function loadInitial() {
    const db = createClient()
    const [{ data: g }, { data: m }] = await Promise.all([
      db.from('groups').select('*').eq('status', 'Active').order('group_name'),
      db.from('members').select('member_id, full_name').eq('status', 'Active').order('full_name'),
    ])
    setGroups(g || [])
    setMembers(m || [])
  }

  async function loadGroupDetails(groupId: string) {
    const db = createClient()
    const { data } = await db.from('groups').select('*').eq('group_id', groupId).single()
    setGroupDetails(data)
    if (data) await fetchSavedCommission(groupId, data)
  }

  async function fetchSavedCommission(groupId: string, group: any) {
    // Get the month being recorded
    const currentMonthNo = getCurrentMonthNo(group.start_date)
    const recordingMonth = form.month_no_override ? parseInt(form.month_no_override) : currentMonthNo
    if (recordingMonth <= 1) { setSavedFromLastMonth(0); return }

    const db = createClient()
    const { data } = await db
      .from('auctions')
      .select('saved_commission_out')
      .eq('group_id', groupId)
      .eq('month_no', recordingMonth - 1)
      .single()
    setSavedFromLastMonth(Number(data?.saved_commission_out || 0))
  }

  async function loadWinnerDues() {
    const db = createClient()
    const { data } = await db
      .from('monthly_ledger').select('balance')
      .eq('member_id', form.winner_member_id)
      .eq('group_id', selectedGroup)
      .neq('status', 'Paid')
    setWinnerDues((data || []).reduce((s: number, l: any) => s + Number(l.balance), 0))
  }

  async function checkHalfSlot() {
    const db = createClient()
    const { data } = await db
      .from('member_slots').select('slot_count')
      .eq('member_id', form.winner_member_id)
      .eq('group_id', selectedGroup).single()
    setIsHalfSlot(data?.slot_count === 0.5)
  }

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // --- Core calculation ---
  const bid = parseFloat(form.bid_amount) || 0
  const sharedDiscount = parseFloat(form.shared_discount) || 0
  const deduction = parseFloat(form.deduction_amount) || 0
  const adminCommission = groupDetails ? Number(groupDetails.principal_amount) * (Number(groupDetails.commission_pct) / 100) : 0
  const totalAvailable = bid + savedFromLastMonth
  const netPool = totalAvailable - adminCommission
  const savedForNext = netPool - sharedDiscount
  const discountPerSlot = groupDetails ? sharedDiscount / Number(groupDetails.total_slots) : 0
  const actualInstallment = groupDetails ? Number(groupDetails.base_installment) - discountPerSlot : 0
  const grossPayout = groupDetails ? (actualInstallment * Number(groupDetails.total_slots)) - adminCommission : 0
  const netPayout = grossPayout - deduction

  const canCalculate = bid > 0 && sharedDiscount > 0 && !!groupDetails

  // Auto-split for shared slot
  useEffect(() => {
    if (canCalculate && netPayout > 0) {
      setForm(prev => ({
        ...prev,
        winner1_payout: String(Math.round(netPayout / 2)),
        winner2_payout: String(Math.round(netPayout / 2)),
      }))
    }
  }, [netPayout, canCalculate])

  async function handleSave() {
    if (!selectedGroup || !form.winner_member_id || !form.bid_amount || !form.shared_discount) {
      alert('Please fill in all required fields including Shared Discount')
      return
    }
    setSaving(true)
    const autoMonthNo = groupDetails ? getCurrentMonthNo(groupDetails.start_date) : 1
    const monthNo = form.month_no_override ? parseInt(form.month_no_override) : autoMonthNo

    const res = await fetch('/api/auctions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: selectedGroup,
        month_no: monthNo,
        auction_date: form.auction_date,
        winner_member_id: form.winner_member_id,
        bid_amount: bid,
        admin_commission: adminCommission,
        shared_discount: sharedDiscount,
        member_discount_per_slot: discountPerSlot,
        actual_installment: actualInstallment,
        gross_payout: grossPayout,
        deduction_amount: deduction,
        net_payout: netPayout,
        saved_commission_in: savedFromLastMonth,
        saved_commission_out: savedForNext,
        winner2_member_id: isHalfSlot ? form.winner2_member_id : null,
        winner1_payout: isHalfSlot ? parseFloat(form.winner1_payout) : null,
        winner2_payout: isHalfSlot ? parseFloat(form.winner2_payout) : null,
        notes: form.notes,
      }),
    })

    if (res.ok) {
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    } else {
      const err = await res.json()
      alert(err.error || 'Failed to save auction')
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm">
          <div className="text-5xl mb-4">🏆</div>
          <p className="text-lg font-bold text-green-700">Auction recorded!</p>
          <p className="text-gray-400 text-sm mt-1">Member payments updated automatically</p>
          <p className="text-gray-500 text-sm mt-1">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  const autoMonthNo = groupDetails ? getCurrentMonthNo(groupDetails.start_date) : '-'

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-8">
      <h2 className="text-xl font-bold text-gray-800">Record Auction</h2>

      {/* Group + Month selection */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Group *</label>
          <select
            value={selectedGroup}
            onChange={e => setSelectedGroup(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          >
            <option value="">Select group...</option>
            {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
          </select>
        </div>

        {groupDetails && (
          <div className="bg-indigo-50 rounded-xl px-4 py-3 text-sm flex justify-between">
            <span className="text-indigo-700 font-medium">{groupDetails.group_name}</span>
            <span className="text-indigo-600">Base ₹{Number(groupDetails.base_installment).toLocaleString()} | {groupDetails.commission_pct}% comm</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Auction Date</label>
            <input
              type="date" value={form.auction_date} onChange={e => update('auction_date', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Month No <span className="text-gray-400 text-xs">(auto: {autoMonthNo})</span>
            </label>
            <input
              type="number" min="1"
              value={form.month_no_override}
              onChange={e => { update('month_no_override', e.target.value); if (selectedGroup && groupDetails) fetchSavedCommission(selectedGroup, groupDetails) }}
              placeholder={String(autoMonthNo)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Winner */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Auction Winner *</label>
          <select
            value={form.winner_member_id}
            onChange={e => update('winner_member_id', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          >
            <option value="">Select winner...</option>
            {members.map(m => <option key={m.member_id} value={m.member_id}>{m.full_name}</option>)}
          </select>
          {winnerDues > 0 && (
            <p className="text-sm text-red-600 mt-1.5 bg-red-50 px-3 py-1.5 rounded-lg">
              ⚠ Winner has {formatCurrency(winnerDues)} outstanding dues
            </p>
          )}
        </div>
      </div>

      {/* Auction Calculation */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <p className="font-semibold text-gray-800">Auction Calculation</p>

        {/* Bid Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Winning Bid Amount (₹) *</label>
          <input
            type="number" value={form.bid_amount} onChange={e => update('bid_amount', e.target.value)}
            placeholder="Enter bid amount"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm font-medium"
          />
        </div>

        {/* Saved Commission display */}
        <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm ${savedFromLastMonth > 0 ? 'bg-blue-50' : 'bg-gray-50'}`}>
          <span className={savedFromLastMonth > 0 ? 'text-blue-700' : 'text-gray-500'}>
            + Saved Commission (from last month)
          </span>
          <span className={`font-bold ${savedFromLastMonth > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
            {formatCurrency(savedFromLastMonth)}
          </span>
        </div>

        {/* Shared Discount — immediately after saved commission */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Shared Discount (₹) * <span className="text-gray-400 text-xs">— you decide how much to share</span>
          </label>
          <input
            type="number" value={form.shared_discount} onChange={e => update('shared_discount', e.target.value)}
            placeholder="Enter amount to share"
            className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl bg-indigo-50 text-sm font-medium"
          />
          {sharedDiscount > 0 && groupDetails && (
            <p className="text-xs text-indigo-600 mt-1.5 font-medium">
              Each member discount: {formatCurrency(discountPerSlot)} per slot
            </p>
          )}
        </div>

        {/* Full calculation breakdown */}
        {bid > 0 && groupDetails && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 border border-gray-200 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Bid Amount</span>
              <span className="font-medium">{formatCurrency(bid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">+ Saved Commission</span>
              <span className="font-medium">{formatCurrency(savedFromLastMonth)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5">
              <span className="text-gray-500">= Total Available</span>
              <span className="font-semibold">{formatCurrency(totalAvailable)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">− Admin Commission ({groupDetails.commission_pct}%)</span>
              <span className="font-medium text-red-500">−{formatCurrency(adminCommission)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">− Shared Discount</span>
              <span className="font-medium text-orange-500">−{formatCurrency(sharedDiscount)}</span>
            </div>
            <div className={`flex justify-between border-t border-gray-200 pt-1.5 font-semibold ${savedForNext >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              <span>= Saved → Next Month</span>
              <span>{formatCurrency(savedForNext)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Gross Payout — separate prominent card */}
      {canCalculate && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600 mb-2">Winner Payout</p>
          <div className="flex justify-between items-center bg-purple-50 rounded-xl px-4 py-3 mb-3">
            <span className="text-purple-700 font-medium">Gross Payout to Winner</span>
            <span className="font-bold text-purple-700 text-xl">{formatCurrency(grossPayout)}</span>
          </div>
        </div>
      )}

      {/* Deduction */}
      {canCalculate && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deduction from Winner
              {winnerDues > 0 && <span className="text-red-500 ml-1 text-xs">(dues: {formatCurrency(winnerDues)})</span>}
            </label>
            <input
              type="number" value={form.deduction_amount} onChange={e => update('deduction_amount', e.target.value)}
              placeholder="0"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
            />
            {winnerDues > 0 && (
              <button
                onClick={() => update('deduction_amount', String(Math.round(winnerDues)))}
                className="mt-1 text-xs text-indigo-600"
              >
                Deduct full dues ({formatCurrency(winnerDues)})
              </button>
            )}
          </div>

          {/* Net Payout */}
          <div className="bg-indigo-600 text-white rounded-xl px-4 py-4 flex justify-between items-center">
            <span className="font-bold">Net Payout to Winner</span>
            <span className="font-bold text-2xl">{formatCurrency(netPayout)}</span>
          </div>
        </div>
      )}

      {/* Shared slot split */}
      {canCalculate && isHalfSlot && (
        <div className="bg-yellow-50 rounded-2xl p-4 shadow-sm space-y-3 border border-yellow-200">
          <p className="font-semibold text-yellow-800 text-sm">Shared Slot — Split Payout</p>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Winner 2 (Partner)</label>
            <select
              value={form.winner2_member_id}
              onChange={e => update('winner2_member_id', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-sm"
            >
              <option value="">Select partner...</option>
              {members.map(m => <option key={m.member_id} value={m.member_id}>{m.full_name}</option>)}
            </select>
          </div>
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <input value={form.notes} onChange={e => update('notes', e.target.value)}
          placeholder="Any notes..."
          className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !selectedGroup || !form.winner_member_id || !bid || !sharedDiscount}
        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow active:scale-95 disabled:opacity-50 text-lg"
      >
        {saving ? 'Saving...' : '🔨 Record Auction'}
      </button>
    </div>
  )
}

export default function AuctionPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-gray-400">Loading...</div>}>
      <AuctionForm />
    </Suspense>
  )
}
