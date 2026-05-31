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

  // Add members panel
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [createMode, setCreateMode] = useState(false)

  // Bulk select mode
  const [allMembers, setAllMembers] = useState<any[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [slotCounts, setSlotCounts] = useState<Record<string, string>>({})

  // New member form
  const [newMember, setNewMember] = useState({ full_name: '', phone: '', is_daily_payer: false })

  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadGroup() }, [id])

  async function loadGroup() {
    const db = createClient()
    const { data: groupData } = await db.from('groups').select('*').eq('group_id', id).single()
    if (!groupData) { setLoading(false); return }
    setGroup(groupData)

    const monthNo = getCurrentMonthNo(groupData.start_date)
    const [{ data: slotsData }, { data: ledgerData }, { data: auctionData }] = await Promise.all([
      db.from('member_slots').select('*, members(full_name, phone, member_id)')
        .eq('group_id', id).order('status').order('created_at'),
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

  async function openAddPanel() {
    setShowAddPanel(true)
    setCreateMode(false)
    setChecked(new Set())
    setSlotCounts({})
    setMemberSearch('')
    setAddError('')

    const db = createClient()
    const { data } = await db.from('members').select('member_id, full_name, phone, is_daily_payer')
      .eq('status', 'Active')
      .order('is_daily_payer', { ascending: false })
      .order('full_name')
    const existingIds = new Set(members.map(m => m.member_id))
    setAllMembers((data || []).filter((m: any) => !existingIds.has(m.member_id)))
  }

  function toggleMember(memberId: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
    if (!slotCounts[memberId]) {
      setSlotCounts(prev => ({ ...prev, [memberId]: '1' }))
    }
  }

  function setSlot(memberId: string, val: string) {
    setSlotCounts(prev => ({ ...prev, [memberId]: val }))
  }

  async function handleBulkAdd() {
    if (checked.size === 0) { setAddError('Select at least one member'); return }
    setSaving(true)
    setAddError('')

    const membersToAdd = Array.from(checked).map(mid => ({
      member_id: mid,
      slot_count: slotCounts[mid] || '1',
    }))

    const res = await fetch('/api/slots/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: id, members: membersToAdd }),
    })
    const result = await res.json()
    if (!res.ok) { setAddError(result.error || 'Failed'); setSaving(false); return }

    setShowAddPanel(false)
    setChecked(new Set())
    setSaving(false)
    await loadGroup()
  }

  async function handleCreateAndAdd() {
    if (!newMember.full_name.trim() || !newMember.phone.trim()) {
      setAddError('Name and phone are required'); return
    }
    setSaving(true)
    setAddError('')

    const mRes = await fetch('/api/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMember),
    })
    const mResult = await mRes.json()
    if (!mRes.ok) { setAddError(mResult.error || 'Failed to create member'); setSaving(false); return }

    const sRes = await fetch('/api/slots', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: id, member_id: mResult.member_id, slot_count: 1 }),
    })
    if (!sRes.ok) { setAddError('Member created but could not add to group'); setSaving(false); return }

    setNewMember({ full_name: '', phone: '', is_daily_payer: false })
    setCreateMode(false)
    setShowAddPanel(false)
    setSaving(false)
    await loadGroup()
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh] text-gray-400">Loading...</div>
  if (!group) return <div className="p-4 text-red-500">Group not found</div>

  const monthNo = getCurrentMonthNo(group.start_date)
  const totalCollected = ledger.reduce((s, l) => s + Number(l.paid_amount), 0)
  const totalExpected = ledger.reduce((s, l) => s + Number(l.expected_amount), 0)
  const pct = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0

  const filteredMembers = allMembers.filter(m =>
    m.full_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.phone.includes(memberSearch)
  )
  const selectedMembers = allMembers.filter(m => checked.has(m.member_id))

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
        <p className="text-purple-200 text-sm">
          Month {monthNo}/{group.total_months} • Auction on {group.auction_day}th • Started {formatDate(group.start_date)}
        </p>
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

      {/* Actions */}
      <div className="mx-4 flex gap-3 mb-4">
        <Link href={`/auctions?group=${id}`} className="flex-1">
          <button className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium text-sm">🔨 Record Auction</button>
        </Link>
        <button onClick={openAddPanel} className="flex-1 border-2 border-indigo-600 text-indigo-600 py-3 rounded-xl font-medium text-sm">
          + Add Members
        </button>
      </div>

      {/* ═══ ADD MEMBERS PANEL ═══ */}
      {showAddPanel && (
        <div className="mx-4 mb-4 bg-white rounded-2xl shadow-md overflow-hidden border border-indigo-100">
          {/* Toggle tabs */}
          <div className="flex border-b border-gray-100">
            <button onClick={() => setCreateMode(false)}
              className={`flex-1 py-3 text-sm font-medium ${!createMode ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>
              ✅ Select Existing
            </button>
            <button onClick={() => setCreateMode(true)}
              className={`flex-1 py-3 text-sm font-medium ${createMode ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>
              ➕ Create New
            </button>
          </div>

          {/* SELECT EXISTING: bulk checklist */}
          {!createMode && (
            <div className="p-4 space-y-3">
              <input
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm"
              />

              {/* Member checklist */}
              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl">
                {filteredMembers.length === 0 ? (
                  <p className="text-center py-4 text-sm text-gray-400">
                    {allMembers.length === 0 ? 'All members already in this group' : 'No members found'}
                  </p>
                ) : (
                  filteredMembers.map(m => (
                    <button
                      key={m.member_id}
                      onClick={() => toggleMember(m.member_id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 text-left transition-colors ${checked.has(m.member_id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked.has(m.member_id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                        {checked.has(m.member_id) && <span className="text-white text-xs">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">{m.full_name}</p>
                        <p className="text-xs text-gray-500">{m.phone} {m.is_daily_payer ? '⭐' : ''}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Selected members with slot pickers */}
              {selectedMembers.length > 0 && (
                <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-indigo-800">{selectedMembers.length} member{selectedMembers.length > 1 ? 's' : ''} selected — set slot count:</p>
                  {selectedMembers.map(m => (
                    <div key={m.member_id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-gray-800 flex-1 truncate">{m.full_name}</span>
                      <select
                        value={slotCounts[m.member_id] || '1'}
                        onChange={e => setSlot(m.member_id, e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white"
                      >
                        <option value="0.5">0.5</option>
                        <option value="1">1 slot</option>
                        <option value="2">2 slots</option>
                        <option value="3">3 slots</option>
                        <option value="4">4 slots</option>
                        <option value="5">5 slots</option>
                      </select>
                      {group.base_installment && (
                        <span className="text-xs text-indigo-600 w-16 text-right">
                          {formatCurrency(Number(group.base_installment) * parseFloat(slotCounts[m.member_id] || '1'))}/mo
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {addError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{addError}</p>}

              <div className="flex gap-3">
                <button onClick={() => setShowAddPanel(false)} className="px-4 py-3 border border-gray-300 rounded-xl text-gray-600 text-sm">Cancel</button>
                <button
                  onClick={handleBulkAdd}
                  disabled={saving || checked.size === 0}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  {saving ? 'Adding...' : `Add ${checked.size > 0 ? checked.size : ''} Member${checked.size !== 1 ? 's' : ''} to Group`}
                </button>
              </div>
            </div>
          )}

          {/* CREATE NEW MEMBER */}
          {createMode && (
            <div className="p-4 space-y-3">
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
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700">Daily Payer ⭐</p>
                <button
                  onClick={() => setNewMember(p => ({ ...p, is_daily_payer: !p.is_daily_payer }))}
                  className={`w-11 h-6 rounded-full transition-colors ${newMember.is_daily_payer ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${newMember.is_daily_payer ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {addError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{addError}</p>}

              <div className="flex gap-3">
                <button onClick={() => setShowAddPanel(false)} className="px-4 py-3 border border-gray-300 rounded-xl text-gray-600 text-sm">Cancel</button>
                <button
                  onClick={handleCreateAndAdd}
                  disabled={saving}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : '✓ Create & Add to Group'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mx-4 flex border-b border-gray-200 mb-3">
        {[{ key: 'members', label: `Members (${members.length})` }, { key: 'auction', label: 'This Month Auction' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-2">
        {/* Members tab — shows name, phone, amount */}
        {tab === 'members' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {members.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">No members yet</p>
                <button onClick={openAddPanel} className="mt-3 text-indigo-600 text-sm font-medium">+ Add members</button>
              </div>
            ) : (
              members.map(slot => (
                <Link key={slot.slot_id} href={`/members/${slot.member_id}`}>
                  <div className="flex items-center px-4 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50 gap-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                      {slot.members?.full_name?.charAt(0)}
                    </div>
                    {/* Name + phone */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{slot.members?.full_name}</p>
                      <p className="text-xs text-gray-500">{slot.members?.phone} • {slot.slot_count} slot{slot.slot_count !== 1 ? 's' : ''}</p>
                    </div>
                    {/* Amount + status */}
                    <div className="text-right flex-shrink-0">
                      {slot.status === 'Won' ? (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">🏆 Won</span>
                      ) : (
                        <>
                          {slot.ledger?.balance > 0 ? (
                            <p className="text-sm font-bold text-red-600">{formatCurrency(slot.ledger.balance)}</p>
                          ) : (
                            <p className="text-sm font-bold text-green-600">✓ Paid</p>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor(slot.ledger?.status || 'Pending')}`}>
                            {slot.ledger?.status || 'Pending'}
                          </span>
                        </>
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
          auction ? (
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
                <div><p className="text-gray-500">New Installment</p><p className="font-bold text-indigo-700">{formatCurrency(auction.actual_installment)}</p></div>
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
          )
        )}
      </div>
    </div>
  )
}
