'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, statusColor, getCurrentMonthNo, formatDate } from '@/lib/utils'

export default function GroupDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [group, setGroup] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [ledger, setLedger] = useState<any[]>([])
  const [auction, setAuction] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'members' | 'auction' | 'history'>('members')
  const [showAddSlot, setShowAddSlot] = useState(false)
  const [allMembers, setAllMembers] = useState<any[]>([])
  const [slotForm, setSlotForm] = useState({ member_id: '', slot_count: '1' })
  const [addingSlot, setAddingSlot] = useState(false)

  useEffect(() => { loadGroup() }, [id])

  async function loadGroup() {
    const db = createClient()
    const { data: groupData } = await db.from('groups').select('*').eq('group_id', id).single()
    if (!groupData) { setLoading(false); return }
    setGroup(groupData)

    const monthNo = getCurrentMonthNo(groupData.start_date)

    const [{ data: slotsData }, { data: ledgerData }, { data: auctionData }] = await Promise.all([
      db.from('member_slots').select('*, members(full_name, phone, member_id)')
        .eq('group_id', id).order('slot_count', { ascending: false }),
      db.from('monthly_ledger').select('*')
        .eq('group_id', id).eq('month_no', monthNo),
      db.from('auctions').select('*, members!auctions_winner_member_id_fkey(full_name)')
        .eq('group_id', id).eq('month_no', monthNo).single(),
    ])

    // Merge slots with ledger
    const enriched = (slotsData || []).map(slot => {
      const led = (ledgerData || []).find(l => l.member_id === slot.member_id)
      return { ...slot, ledger: led }
    })

    setMembers(enriched)
    setLedger(ledgerData || [])
    setAuction(auctionData)
    setLoading(false)
  }

  async function loadAllMembers() {
    const db = createClient()
    const { data } = await db.from('members').select('member_id, full_name').eq('status', 'Active').order('full_name')
    setAllMembers(data || [])
  }

  async function addMemberToGroup() {
    if (!slotForm.member_id) return
    setAddingSlot(true)
    const res = await fetch('/api/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: id, ...slotForm, slot_count: parseFloat(slotForm.slot_count) }),
    })
    if (res.ok) {
      setShowAddSlot(false)
      setSlotForm({ member_id: '', slot_count: '1' })
      await loadGroup()
    }
    setAddingSlot(false)
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh] text-gray-400">Loading...</div>
  if (!group) return <div className="p-4 text-red-500">Group not found</div>

  const monthNo = getCurrentMonthNo(group.start_date)
  const totalCollected = ledger.reduce((s, l) => s + Number(l.paid_amount), 0)
  const totalExpected = ledger.reduce((s, l) => s + Number(l.expected_amount), 0)
  const pct = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="bg-purple-600 text-white p-4 pb-6">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.back()} className="text-purple-200">←</button>
          <span className="text-sm text-purple-200">Group Detail</span>
        </div>
        <h2 className="text-2xl font-bold">{group.group_name}</h2>
        <p className="text-purple-200 text-sm mt-1">
          {formatCurrency(group.principal_amount)} • {group.total_slots} slots • {group.commission_pct}% commission
        </p>
        <p className="text-purple-200 text-sm">Month {monthNo} of {group.total_months}</p>
      </div>

      {/* Collection status */}
      <div className="-mt-3 mx-4 bg-white rounded-2xl shadow-md p-4 mb-4">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-600">Month {monthNo} Collection</span>
          <span className="text-sm font-bold text-indigo-600">{pct}%</span>
        </div>
        <div className="flex gap-4 mb-2">
          <div><p className="text-xs text-gray-500">Collected</p><p className="font-bold text-green-600">{formatCurrency(totalCollected)}</p></div>
          <div><p className="text-xs text-gray-500">Expected</p><p className="font-bold text-gray-700">{formatCurrency(totalExpected)}</p></div>
          <div><p className="text-xs text-gray-500">Remaining</p><p className="font-bold text-red-500">{formatCurrency(totalExpected - totalCollected)}</p></div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>

      {/* Actions */}
      <div className="mx-4 flex gap-3 mb-4">
        <Link href={`/auctions?group=${id}`} className="flex-1">
          <button className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium text-sm">🔨 Record Auction</button>
        </Link>
        <button
          onClick={() => { setShowAddSlot(true); loadAllMembers() }}
          className="flex-1 border-2 border-indigo-600 text-indigo-600 py-3 rounded-xl font-medium text-sm"
        >
          + Add Member
        </button>
      </div>

      {/* Add member to group form */}
      {showAddSlot && (
        <div className="mx-4 bg-indigo-50 rounded-2xl p-4 mb-4">
          <p className="font-semibold text-indigo-800 mb-3">Add Member to {group.group_name}</p>
          <select
            value={slotForm.member_id}
            onChange={e => setSlotForm(prev => ({ ...prev, member_id: e.target.value }))}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm mb-3"
          >
            <option value="">Select member...</option>
            {allMembers.map(m => <option key={m.member_id} value={m.member_id}>{m.full_name}</option>)}
          </select>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Slot Count</label>
            <select
              value={slotForm.slot_count}
              onChange={e => setSlotForm(prev => ({ ...prev, slot_count: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm"
            >
              <option value="0.5">0.5 (Shared slot)</option>
              <option value="1">1 slot</option>
              <option value="2">2 slots</option>
              <option value="3">3 slots</option>
              <option value="4">4 slots</option>
              <option value="5">5 slots</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowAddSlot(false)} className="flex-1 py-2 border border-gray-300 rounded-xl text-gray-600 text-sm">Cancel</button>
            <button onClick={addMemberToGroup} disabled={addingSlot} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium disabled:opacity-60">
              {addingSlot ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mx-4 flex border-b border-gray-200 mb-4">
        {[
          { key: 'members', label: `Members (${members.length})` },
          { key: 'auction', label: 'Auction' },
        ].map(t => (
          <button
            key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        {/* Members tab */}
        {tab === 'members' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {members.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No members in this group yet</p>
            ) : (
              members.map(slot => (
                <Link key={slot.slot_id} href={`/members/${slot.member_id}`}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{slot.members?.full_name}</p>
                      <p className="text-xs text-gray-500">{slot.slot_count} slot{slot.slot_count !== 1 ? 's' : ''} • Expected: {formatCurrency(slot.ledger?.expected_amount || 0)}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(slot.ledger?.status || slot.status)}`}>
                        {slot.status === 'Won' ? '🏆 Won' : slot.ledger?.status || 'No ledger'}
                      </span>
                      {slot.ledger?.balance > 0 && (
                        <p className="text-xs font-bold text-red-500 mt-0.5">{formatCurrency(slot.ledger.balance)}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {/* Auction tab */}
        {tab === 'auction' && (
          <div className="space-y-3">
            {auction ? (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-gray-800">Month {auction.month_no} Auction</p>
                    <p className="text-sm text-gray-500">{formatDate(auction.auction_date)}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${auction.payout_status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {auction.payout_status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-gray-500">Winner</p><p className="font-medium">{auction.members?.full_name}</p></div>
                  <div><p className="text-gray-500">Bid</p><p className="font-medium">{formatCurrency(auction.bid_amount)}</p></div>
                  <div><p className="text-gray-500">Commission</p><p className="font-medium">{formatCurrency(auction.admin_commission)}</p></div>
                  <div><p className="text-gray-500">Installment</p><p className="font-bold text-indigo-700">{formatCurrency(auction.actual_installment)}</p></div>
                  <div><p className="text-gray-500">Gross Payout</p><p className="font-medium">{formatCurrency(auction.gross_payout)}</p></div>
                  <div><p className="text-gray-500">Deduction</p><p className="font-medium text-red-500">{formatCurrency(auction.deduction_amount)}</p></div>
                </div>
                <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between">
                  <span className="font-bold text-gray-800">Net Payout</span>
                  <span className="font-bold text-green-600 text-lg">{formatCurrency(auction.net_payout)}</span>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-2xl p-6 text-center">
                <p className="text-gray-500 text-sm">No auction recorded for Month {monthNo}</p>
                <Link href={`/auctions?group=${id}`}>
                  <button className="mt-3 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Record Auction</button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
