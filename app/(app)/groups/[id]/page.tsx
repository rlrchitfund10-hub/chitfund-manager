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
  const [tab, setTab] = useState<'members' | 'auction'>('members')

  // Add member panel state
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [createMode, setCreateMode] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedMember, setSelectedMember] = useState<{ member_id: string; full_name: string } | null>(null)
  const [slotCount, setSlotCount] = useState('1')
  const [newMember, setNewMember] = useState({ full_name: '', phone: '', is_daily_payer: false })
  const [addError, setAddError] = useState('')
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
      db.from('monthly_ledger').select('*').eq('group_id', id).eq('month_no', monthNo),
      db.from('auctions').select('*, members!auctions_winner_member_id_fkey(full_name)')
        .eq('group_id', id).eq('month_no', monthNo).single(),
    ])

    const enriched = (slotsData || []).map(slot => {
      const led = (ledgerData || []).find((l: any) => l.member_id === slot.member_id)
      return { ...slot, ledger: led }
    })

    setMembers(enriched)
    setLedger(ledgerData || [])
    setAuction(auctionData)
    setLoading(false)
  }

  async function searchMembers(q: string) {
    setMemberSearch(q)
    setSelectedMember(null)
    if (q.length < 2) { setSearchResults([]); return }
    const db = createClient()
    const { data } = await db.from('members').select('member_id, full_name, phone, is_daily_payer')
      .eq('status', 'Active')
      .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .order('full_name').limit(8)
    const existingIds = members.map(m => m.member_id)
    setSearchResults((data || []).filter((m: any) => !existingIds.includes(m.member_id)))
  }

  function selectMember(m: any) {
    setSelectedMember({ member_id: m.member_id, full_name: m.full_name })
    setMemberSearch(m.full_name)
    setSearchResults([])
  }

  async function handleAdd() {
    setAddError('')
    if (createMode) {
      if (!newMember.full_name.trim() || !newMember.phone.trim()) {
        setAddError('Name and phone are required'); return
      }
      setAddingSlot(true)
      const mRes = await fetch('/api/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember),
      })
      const mResult = await mRes.json()
      if (!mRes.ok) { setAddError(mResult.error || 'Failed to create member'); setAddingSlot(false); return }

      const sRes = await fetch('/api/slots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: id, member_id: mResult.member_id, slot_count: parseFloat(slotCount) }),
      })
      const sResult = await sRes.json()
      if (!sRes.ok) { setAddError(sResult.error || 'Member created but failed to add to group'); setAddingSlot(false); return }
    } else {
      if (!selectedMember) { setAddError('Select a member first'); return }
      setAddingSlot(true)
      const res = await fetch('/api/slots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: id, member_id: selectedMember.member_id, slot_count: parseFloat(slotCount) }),
      })
      const result = await res.json()
      if (!res.ok) { setAddError(result.error || 'Failed'); setAddingSlot(false); return }
    }

    // Reset and reload
    setShowAddPanel(false)
    setCreateMode(false)
    setMemberSearch('')
    setSearchResults([])
    setSelectedMember(null)
    setSlotCount('1')
    setNewMember({ full_name: '', phone: '', is_daily_payer: false })
    setAddError('')
    setAddingSlot(false)
    await loadGroup()
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
          <button onClick={() => router.back()} className="text-purple-200 text-xl">←</button>
          <span className="text-sm text-purple-200">Group Detail</span>
        </div>
        <h2 className="text-2xl font-bold">{group.group_name}</h2>
        <p className="text-purple-200 text-sm mt-1">
          {formatCurrency(group.principal_amount)} • {group.total_slots} slots • {group.commission_pct}% commission
        </p>
        <p className="text-purple-200 text-sm">Month {monthNo} of {group.total_months} • Auction on {group.auction_day}th</p>
      </div>

      {/* Collection summary */}
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

      {/* Action buttons */}
      <div className="mx-4 flex gap-3 mb-4">
        <Link href={`/auctions?group=${id}`} className="flex-1">
          <button className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium text-sm">🔨 Record Auction</button>
        </Link>
        <button
          onClick={() => { setShowAddPanel(true); setCreateMode(false) }}
          className="flex-1 border-2 border-indigo-600 text-indigo-600 py-3 rounded-xl font-medium text-sm"
        >
          + Add Member
        </button>
      </div>

      {/* ─── Add Member Panel ─── */}
      {showAddPanel && (
        <div className="mx-4 mb-4 bg-white rounded-2xl shadow-md overflow-hidden">
          {/* Toggle: existing vs new */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setCreateMode(false)}
              className={`flex-1 py-3 text-sm font-medium ${!createMode ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}
            >
              🔍 Existing Member
            </button>
            <button
              onClick={() => setCreateMode(true)}
              className={`flex-1 py-3 text-sm font-medium ${createMode ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}
            >
              ➕ New Member
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Existing member search */}
            {!createMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search Member</label>
                <input
                  value={memberSearch}
                  onChange={e => searchMembers(e.target.value)}
                  placeholder="Type name or phone..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
                  autoFocus
                />
                {searchResults.length > 0 && (
                  <div className="border border-gray-200 rounded-xl mt-1 overflow-hidden">
                    {searchResults.map((m: any) => (
                      <button
                        key={m.member_id}
                        onClick={() => selectMember(m)}
                        className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-gray-50 last:border-0 text-sm"
                      >
                        <span className="font-medium text-gray-800">{m.full_name}</span>
                        <span className="text-gray-500 ml-2">{m.phone}</span>
                        {m.is_daily_payer && <span className="ml-1 text-xs">⭐</span>}
                      </button>
                    ))}
                  </div>
                )}
                {selectedMember && (
                  <div className="mt-2 bg-green-50 rounded-xl px-3 py-2 text-sm text-green-700 font-medium">
                    ✓ Selected: {selectedMember.full_name}
                  </div>
                )}
              </div>
            )}

            {/* New member form */}
            {createMode && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    value={newMember.full_name}
                    onChange={e => setNewMember(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Member's full name"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input
                    value={newMember.phone}
                    onChange={e => setNewMember(p => ({ ...p, phone: e.target.value }))}
                    placeholder="10-digit mobile number"
                    type="tel"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
                  />
                </div>
                <div className="flex items-center justify-between py-1">
                  <p className="text-sm text-gray-700">Daily Payer ⭐ <span className="text-xs text-gray-400">(shows at top)</span></p>
                  <button
                    onClick={() => setNewMember(p => ({ ...p, is_daily_payer: !p.is_daily_payer }))}
                    className={`w-11 h-6 rounded-full transition-colors ${newMember.is_daily_payer ? 'bg-indigo-600' : 'bg-gray-300'}`}
                  >
                    <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${newMember.is_daily_payer ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              </div>
            )}

            {/* Slot count — always shown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slot Count in {group.group_name}</label>
              <div className="grid grid-cols-3 gap-2">
                {['0.5', '1', '2', '3', '4', '5'].map(v => (
                  <button
                    key={v}
                    onClick={() => setSlotCount(v)}
                    className={`py-2.5 rounded-xl text-sm font-medium border-2 ${slotCount === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200'}`}
                  >
                    {v === '0.5' ? '½ slot' : `${v} slot${v !== '1' ? 's' : ''}`}
                  </button>
                ))}
              </div>
              {slotCount !== '0.5' && group.base_installment && (
                <p className="text-xs text-indigo-600 mt-2">
                  Monthly payment: {formatCurrency(Number(group.base_installment) * parseFloat(slotCount))}
                </p>
              )}
            </div>

            {addError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{addError}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowAddPanel(false); setAddError('') }}
                className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={addingSlot}
                className="flex-2 flex-grow-[2] bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-60"
              >
                {addingSlot ? 'Adding...' : createMode ? '✓ Create & Add to Group' : '✓ Add to Group'}
              </button>
            </div>
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
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">No members yet</p>
                <button
                  onClick={() => setShowAddPanel(true)}
                  className="mt-3 text-indigo-600 text-sm font-medium"
                >
                  + Add first member
                </button>
              </div>
            ) : (
              members.map(slot => (
                <Link key={slot.slot_id} href={`/members/${slot.member_id}`}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{slot.members?.full_name}</p>
                      <p className="text-xs text-gray-500">
                        {slot.slot_count} slot{slot.slot_count !== 1 ? 's' : ''} •
                        Expected: {formatCurrency(slot.ledger?.expected_amount || 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(slot.ledger?.status || slot.status)}`}>
                        {slot.status === 'Won' ? '🏆 Won' : slot.ledger?.status || 'Pending'}
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
