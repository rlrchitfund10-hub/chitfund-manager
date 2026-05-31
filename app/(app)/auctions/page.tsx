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
  const [form, setForm] = useState({
    winner_member_id: '',
    bid_amount: '',
    deduction_amount: '0',
    auction_date: new Date().toISOString().split('T')[0],
    winner2_member_id: '',
    winner1_payout: '',
    winner2_payout: '',
    notes: '',
  })
  const [calc, setCalc] = useState<any>(null)
  const [winnerDues, setWinnerDues] = useState(0)
  const [isHalfSlot, setIsHalfSlot] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => { loadGroups() }, [])
  useEffect(() => {
    if (selectedGroup) loadGroupDetails(selectedGroup)
  }, [selectedGroup])
  useEffect(() => { calculateAuction() }, [form.bid_amount, groupDetails])
  useEffect(() => { loadWinnerDues() }, [form.winner_member_id, selectedGroup])
  useEffect(() => {
    if (calc && form.winner_member_id) checkHalfSlot()
  }, [form.winner_member_id, selectedGroup])

  async function loadGroups() {
    const db = createClient()
    const { data } = await db.from('groups').select('*').eq('status', 'Active').order('group_name')
    setGroups(data || [])
    const { data: m } = await db.from('members').select('member_id, full_name').eq('status', 'Active').order('full_name')
    setMembers(m || [])
  }

  async function loadGroupDetails(groupId: string) {
    const db = createClient()
    const { data } = await db.from('groups').select('*').eq('group_id', groupId).single()
    setGroupDetails(data)
  }

  function calculateAuction() {
    if (!groupDetails || !form.bid_amount) { setCalc(null); return }
    const bid = parseFloat(form.bid_amount)
    if (isNaN(bid) || bid <= 0) { setCalc(null); return }

    const principal = Number(groupDetails.principal_amount)
    const totalSlots = Number(groupDetails.total_slots)
    const commissionPct = Number(groupDetails.commission_pct)
    const baseInstallment = Number(groupDetails.base_installment)

    const adminCommission = principal * (commissionPct / 100)
    const sharedDiscount = bid - adminCommission
    const discountPerSlot = sharedDiscount / totalSlots
    const actualInstallment = baseInstallment - discountPerSlot
    const grossPayout = (actualInstallment * totalSlots) - adminCommission
    const deduction = parseFloat(form.deduction_amount) || 0
    const netPayout = grossPayout - deduction

    setCalc({ adminCommission, sharedDiscount, discountPerSlot, actualInstallment, grossPayout, netPayout })
  }

  async function loadWinnerDues() {
    if (!form.winner_member_id || !selectedGroup) { setWinnerDues(0); return }
    const db = createClient()
    const { data } = await db
      .from('monthly_ledger')
      .select('balance')
      .eq('member_id', form.winner_member_id)
      .eq('group_id', selectedGroup)
      .neq('status', 'Paid')
    const dues = (data || []).reduce((s: number, l: any) => s + Number(l.balance), 0)
    setWinnerDues(dues)
  }

  async function checkHalfSlot() {
    const db = createClient()
    const { data } = await db
      .from('member_slots')
      .select('slot_count')
      .eq('member_id', form.winner_member_id)
      .eq('group_id', selectedGroup)
      .single()
    setIsHalfSlot(data?.slot_count === 0.5)
  }

  function update(field: string, value: string) {
    setForm(prev => {
      const updated = { ...prev, [field]: value }
      if (field === 'bid_amount' || field === 'deduction_amount') {
        const bid = parseFloat(updated.bid_amount) || 0
        const deduction = parseFloat(updated.deduction_amount) || 0
        if (groupDetails && bid > 0) {
          const principal = Number(groupDetails.principal_amount)
          const totalSlots = Number(groupDetails.total_slots)
          const commPct = Number(groupDetails.commission_pct)
          const baseInst = Number(groupDetails.base_installment)
          const commission = principal * (commPct / 100)
          const discount = bid - commission
          const gross = (baseInst - discount / totalSlots) * totalSlots - commission
          const net = gross - deduction
          updated.winner1_payout = String(Math.round(net / 2))
          updated.winner2_payout = String(Math.round(net / 2))
        }
      }
      return updated
    })
  }

  async function handleSave() {
    if (!selectedGroup || !form.winner_member_id || !form.bid_amount) return
    setSaving(true)
    const monthNo = groupDetails ? getCurrentMonthNo(groupDetails.start_date) : 1

    const res = await fetch('/api/auctions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: selectedGroup,
        month_no: monthNo,
        auction_date: form.auction_date,
        winner_member_id: form.winner_member_id,
        bid_amount: parseFloat(form.bid_amount),
        deduction_amount: parseFloat(form.deduction_amount) || 0,
        winner2_member_id: isHalfSlot ? form.winner2_member_id : null,
        winner1_payout: isHalfSlot ? parseFloat(form.winner1_payout) : null,
        winner2_payout: isHalfSlot ? parseFloat(form.winner2_payout) : null,
        notes: form.notes,
        ...calc,
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
          <p className="text-gray-500 text-sm mt-2">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  const monthNo = groupDetails ? getCurrentMonthNo(groupDetails.start_date) : '-'

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-8">
      <h2 className="text-xl font-bold text-gray-800">Record Auction</h2>

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
          <div className="bg-indigo-50 rounded-xl p-3 text-sm">
            <p className="text-indigo-800 font-medium">{groupDetails.group_name} — Month {monthNo}</p>
            <p className="text-indigo-600">Base Installment: {formatCurrency(groupDetails.base_installment)} | Commission: {groupDetails.commission_pct}%</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Auction Date</label>
          <input
            type="date" value={form.auction_date} onChange={e => update('auction_date', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Winner *</label>
          <select
            value={form.winner_member_id}
            onChange={e => update('winner_member_id', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          >
            <option value="">Select winner...</option>
            {members.map(m => <option key={m.member_id} value={m.member_id}>{m.full_name}</option>)}
          </select>
          {winnerDues > 0 && (
            <p className="text-sm text-red-600 mt-1">⚠ Winner has {formatCurrency(winnerDues)} outstanding dues</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Winning Bid Amount (₹) *</label>
          <input
            type="number" value={form.bid_amount} onChange={e => update('bid_amount', e.target.value)}
            placeholder="Enter bid amount"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>

        {calc && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm border border-gray-200">
            <p className="font-semibold text-gray-700 mb-2">Auto-Calculated</p>
            <div className="flex justify-between"><span className="text-gray-600">Admin Commission</span><span className="font-medium">{formatCurrency(calc.adminCommission)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Shared Discount</span><span className="font-medium">{formatCurrency(calc.sharedDiscount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Discount per Slot</span><span className="font-medium">{formatCurrency(calc.discountPerSlot)}</span></div>
            <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5"><span>New Installment</span><span className="text-indigo-700">{formatCurrency(calc.actualInstallment)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Gross Payout</span><span className="font-medium">{formatCurrency(calc.grossPayout)}</span></div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Deduction Amount (₹) {winnerDues > 0 && <span className="text-red-500">(Suggested: {formatCurrency(winnerDues)})</span>}
          </label>
          <input
            type="number" value={form.deduction_amount} onChange={e => update('deduction_amount', e.target.value)}
            placeholder="0"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
          {winnerDues > 0 && (
            <button
              onClick={() => update('deduction_amount', String(winnerDues))}
              className="mt-1 text-xs text-indigo-600 hover:text-indigo-800"
            >
              Use full dues ({formatCurrency(winnerDues)})
            </button>
          )}
        </div>

        {calc && (
          <div className="bg-green-50 rounded-xl p-3 flex justify-between items-center">
            <span className="font-bold text-gray-800">Net Payout to Winner</span>
            <span className="font-bold text-green-700 text-xl">{formatCurrency(calc.grossPayout - (parseFloat(form.deduction_amount) || 0))}</span>
          </div>
        )}

        {/* 0.5 slot split */}
        {isHalfSlot && (
          <div className="bg-yellow-50 rounded-xl p-3 space-y-3">
            <p className="font-semibold text-yellow-800 text-sm">Shared Slot — Payout Split</p>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Winner 2 (Partner)</label>
              <select
                value={form.winner2_member_id}
                onChange={e => update('winner2_member_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
              >
                <option value="">Select partner...</option>
                {members.map(m => <option key={m.member_id} value={m.member_id}>{m.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Winner 1 Payout</label>
                <input type="number" value={form.winner1_payout} onChange={e => update('winner1_payout', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Winner 2 Payout</label>
                <input type="number" value={form.winner2_payout} onChange={e => update('winner2_payout', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm" />
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <input value={form.notes} onChange={e => update('notes', e.target.value)}
            placeholder="Any notes..."
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !selectedGroup || !form.winner_member_id || !form.bid_amount}
        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow active:scale-95 disabled:opacity-60"
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
