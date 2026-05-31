'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, calculateSplit, getCurrentMonthNo } from '@/lib/utils'
import type { Member } from '@/lib/types'

interface GroupBalance {
  group_id: string
  group_name: string
  month_no: number
  obligation: number
  paid: number
  remaining: number
  status: string
}

interface SplitPreview {
  group_id: string
  group_name: string
  allocated: number
  remaining_before: number
  will_complete: boolean
}

export default function RecordPaymentPage() {
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [groupBalances, setGroupBalances] = useState<GroupBalance[]>([])
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('Cash')
  const [notes, setNotes] = useState('')
  const [splitPreview, setSplitPreview] = useState<SplitPreview[]>([])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [step, setStep] = useState<'search' | 'amount' | 'confirm'>('search')

  useEffect(() => {
    if (search.length < 2) { setMembers([]); return }
    const t = setTimeout(async () => {
      const db = createClient()
      const { data } = await db
        .from('members')
        .select('*')
        .eq('status', 'Active')
        .or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
        .order('is_daily_payer', { ascending: false })
        .order('full_name')
        .limit(10)
      setMembers(data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  async function selectMember(member: Member) {
    setSelectedMember(member)
    setMembers([])
    setSearch(member.full_name)
    setStep('amount')
    await loadBalances(member.member_id)
  }

  async function loadBalances(memberId: string) {
    const db = createClient()
    // Get member's active slots
    const { data: slots } = await db
      .from('member_slots')
      .select('*, groups(*)')
      .eq('member_id', memberId)
      .eq('status', 'Active')

    if (!slots || slots.length === 0) { setGroupBalances([]); return }

    const balances: GroupBalance[] = []
    for (const slot of slots) {
      const group = slot.groups as any
      if (!group || group.status !== 'Active') continue
      const monthNo = getCurrentMonthNo(group.start_date)

      // Get ledger entry
      const { data: ledger } = await db
        .from('monthly_ledger')
        .select('*')
        .eq('member_id', memberId)
        .eq('group_id', slot.group_id)
        .eq('month_no', monthNo)
        .single()

      const obligation = Number(group.base_installment) * slot.slot_count
      const paid = ledger ? Number(ledger.paid_amount) : 0
      const remaining = Math.max(0, obligation - paid)

      balances.push({
        group_id: slot.group_id,
        group_name: group.group_name,
        month_no: monthNo,
        obligation,
        paid,
        remaining,
        status: ledger?.status || 'Pending',
      })
    }

    balances.sort((a, b) => b.remaining - a.remaining)
    setGroupBalances(balances)
  }

  useEffect(() => {
    if (!amount || !groupBalances.length) { setSplitPreview([]); return }
    const num = parseFloat(amount)
    if (isNaN(num) || num <= 0) { setSplitPreview([]); return }

    const preview = calculateSplit(
      num,
      groupBalances
        .filter(g => g.remaining > 0)
        .map(g => ({ group_id: g.group_id, group_name: g.group_name, remaining: g.remaining, obligation: g.obligation }))
    )
    setSplitPreview(preview)
  }, [amount, groupBalances])

  async function handleSave() {
    if (!selectedMember || !amount) return
    const num = parseFloat(amount)
    if (isNaN(num) || num <= 0) return

    setSaving(true)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMember.member_id,
          amount: num,
          paymentMode: mode,
          notes,
          splitPreview,
          monthNo: groupBalances[0]?.month_no || new Date().getMonth() + 1,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed')

      setSuccess(`✓ ₹${num.toLocaleString()} recorded for ${selectedMember.full_name}`)
      setTimeout(() => {
        setSuccess('')
        setSearch('')
        setSelectedMember(null)
        setAmount('')
        setNotes('')
        setSplitPreview([])
        setGroupBalances([])
        setStep('search')
      }, 2500)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const totalPending = groupBalances.reduce((s, g) => s + g.remaining, 0)

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-lg font-bold text-green-700">{success}</p>
          <p className="text-gray-500 text-sm mt-2">Payment recorded and split across groups</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Record Payment</h2>

      {/* Step 1: Search Member */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-2">Member Name / Phone</label>
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); if (selectedMember) { setSelectedMember(null); setStep('search') } }}
          placeholder="Search by name or phone..."
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50"
          autoFocus
        />

        {/* Search results */}
        {members.length > 0 && (
          <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
            {members.map(m => (
              <button
                key={m.member_id}
                onClick={() => selectMember(m)}
                className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-gray-100 last:border-0 transition-colors"
              >
                <p className="font-medium text-gray-800">{m.full_name}</p>
                <p className="text-xs text-gray-500">{m.phone} {m.is_daily_payer ? '• 🌟 Daily Payer' : ''}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Member Balance Summary */}
      {selectedMember && groupBalances.length > 0 && (
        <div className="bg-indigo-50 rounded-2xl p-4 shadow-sm">
          <p className="font-semibold text-indigo-800 mb-2">{selectedMember.full_name}</p>
          <div className="space-y-1.5">
            {groupBalances.map(g => (
              <div key={g.group_id} className="flex justify-between text-sm">
                <span className="text-gray-600">{g.group_name}</span>
                <span className={`font-medium ${g.remaining <= 0 ? 'text-green-600' : g.status === 'Overdue' ? 'text-red-600' : 'text-gray-800'}`}>
                  {g.remaining <= 0 ? '✓ Paid' : `${formatCurrency(g.remaining)} due`}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-indigo-200 mt-2 pt-2 flex justify-between">
            <span className="text-sm font-semibold text-indigo-800">Total Pending</span>
            <span className="font-bold text-indigo-700">{formatCurrency(totalPending)}</span>
          </div>
        </div>
      )}

      {/* Step 2: Amount + Mode */}
      {step !== 'search' && selectedMember && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Enter amount"
              min="1"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-semibold bg-gray-50"
              autoFocus={step === 'amount'}
            />
            {/* Quick amounts */}
            <div className="flex gap-2 mt-2 flex-wrap">
              {[1000, 2000, 5000, 10000, 20000].map(amt => (
                <button
                  key={amt}
                  onClick={() => setAmount(String(amt))}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-indigo-100 hover:text-indigo-700"
                >
                  ₹{amt.toLocaleString()}
                </button>
              ))}
              {totalPending > 0 && (
                <button
                  onClick={() => setAmount(String(totalPending))}
                  className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium"
                >
                  Full ({formatCurrency(totalPending)})
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Mode</label>
            <div className="grid grid-cols-4 gap-2">
              {['Cash', 'UPI', 'Bank Transfer', 'Other'].map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border-2 transition-colors ${
                    mode === m
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {m === 'Cash' ? '💵' : m === 'UPI' ? '📱' : m === 'Bank Transfer' ? '🏦' : '•'} {m.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50"
            />
          </div>
        </div>
      )}

      {/* Split Preview */}
      {splitPreview.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-semibold text-gray-800 mb-3">Payment Split Preview</p>
          <div className="space-y-2">
            {splitPreview.map(s => (
              <div key={s.group_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{s.group_name}</p>
                  <p className="text-xs text-gray-500">
                    Balance: {formatCurrency(s.remaining_before - s.allocated)}
                    {s.will_complete && ' → ✅ Complete!'}
                  </p>
                </div>
                <span className="font-bold text-indigo-600">{formatCurrency(s.allocated)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-bold text-indigo-700">
              {formatCurrency(splitPreview.reduce((s, p) => s + p.allocated, 0))}
            </span>
          </div>
        </div>
      )}

      {/* Save Button */}
      {selectedMember && amount && splitPreview.length > 0 && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-sm active:scale-95 transition-all disabled:opacity-60 text-lg"
        >
          {saving ? 'Saving...' : `✓ Save Payment — ${formatCurrency(parseFloat(amount) || 0)}`}
        </button>
      )}
    </div>
  )
}
