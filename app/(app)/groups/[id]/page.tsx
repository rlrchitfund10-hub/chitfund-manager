'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, getCurrentMonthNo, formatDate } from '@/lib/utils'

export default function GroupDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [group, setGroup] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [ledger, setLedger] = useState<any[]>([])
  const [allAuctions, setAllAuctions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'members' | 'history' | 'auctions'>('members')

  // Add members panel
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [createMode, setCreateMode] = useState(false)
  const [allMembersList, setAllMembersList] = useState<any[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [slotCounts, setSlotCounts] = useState<Record<string, string>>({})
  const [newMember, setNewMember] = useState({ full_name: '', phone: '', is_daily_payer: false })
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  // Auction detail / edit
  const [expandedAuction, setExpandedAuction] = useState<string | null>(null)
  const [editingAuction, setEditingAuction] = useState<any>(null)
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => { loadGroup() }, [id])

  async function loadGroup() {
    const db = createClient()
    const { data: groupData } = await db.from('groups').select('*').eq('group_id', id).single()
    if (!groupData) { setLoading(false); return }
    setGroup(groupData)

    const monthNo = getCurrentMonthNo(groupData.start_date)

    const [{ data: slotsData }, { data: ledgerData }, { data: auctionsData }] = await Promise.all([
      db.from('member_slots').select('*').eq('group_id', id).order('created_at'),
      db.from('monthly_ledger').select('*').eq('group_id', id).eq('month_no', monthNo),
      db.from('auctions').select('*').eq('group_id', id).order('month_no'),
    ])

    // Fetch member details
    const memberIds = [...new Set([
      ...(slotsData || []).map((s: any) => s.member_id),
      ...(auctionsData || []).map((a: any) => a.winner_member_id),
    ])]
    let membersMap: Record<string, any> = {}
    if (memberIds.length > 0) {
      const { data: md } = await db.from('members').select('member_id, full_name, phone').in('member_id', memberIds)
      ;(md || []).forEach((m: any) => { membersMap[m.member_id] = m })
    }

    const enriched = (slotsData || []).map((slot: any) => {
      const led = (ledgerData || []).find((l: any) => l.member_id === slot.member_id)
      return { ...slot, members: membersMap[slot.member_id] || null, ledger: led }
    })

    const auctionsEnriched = (auctionsData || []).map((a: any) => ({
      ...a,
      winner_name: membersMap[a.winner_member_id]?.full_name || 'Unknown',
    }))

    setMembers(enriched)
    setLedger(ledgerData || [])
    setAllAuctions(auctionsEnriched)
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
      .eq('status', 'Active').order('is_daily_payer', { ascending: false }).order('full_name')
    const existingIds = new Set(members.map(m => m.member_id))
    setAllMembersList((data || []).filter((m: any) => !existingIds.has(m.member_id)))
  }

  function toggleMember(memberId: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
    if (!slotCounts[memberId]) setSlotCounts(prev => ({ ...prev, [memberId]: '1' }))
  }

  async function handleBulkAdd() {
    if (checked.size === 0) { setAddError('Select at least one member'); return }
    setSaving(true)
    setAddError('')
    const membersToAdd = Array.from(checked).map(mid => ({ member_id: mid, slot_count: slotCounts[mid] || '1' }))
    const res = await fetch('/api/slots/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    if (!newMember.full_name.trim() || !newMember.phone.trim()) { setAddError('Name and phone required'); return }
    setSaving(true)
    setAddError('')
    const mRes = await fetch('/api/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newMember),
    })
    const mResult = await mRes.json()
    if (!mRes.ok) { setAddError(mResult.error || 'Failed'); setSaving(false); return }
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

  async function removeMember(slotId: string) {
    if (!confirm('Remove this member from the group?')) return
    const res = await fetch(`/api/slots/${slotId}`, { method: 'DELETE' })
    if (res.ok) await loadGroup()
  }

  async function saveEditAuction() {
    if (!editingAuction) return
    setEditSaving(true)
    const res = await fetch(`/api/auctions/${editingAuction.auction_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingAuction),
    })
    if (res.ok) {
      setEditingAuction(null)
      setExpandedAuction(null)
      await loadGroup()
    } else {
      const err = await res.json()
      alert(err.error || 'Failed to update')
    }
    setEditSaving(false)
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh] text-gray-400">Loading...</div>
  if (!group) return <div className="p-4 text-red-500">Group not found</div>

  const monthNo = getCurrentMonthNo(group.start_date)
  const totalCollected = ledger.reduce((s, l) => s + Number(l.paid_amount), 0)
  const totalExpected = ledger.reduce((s, l) => s + Number(l.expected_amount), 0)
  const pct = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0

  // Build map of memberId → months won
  const wonMonths: Record<string, number[]> = {}
  allAuctions.forEach(a => {
    if (!wonMonths[a.winner_member_id]) wonMonths[a.winner_member_id] = []
    wonMonths[a.winner_member_id].push(a.month_no)
  })

  const filteredAvailableMembers = allMembersList.filter(m =>
    m.full_name.toLowerCase().includes(memberSearch.toLowerCase()) || m.phone.includes(memberSearch)
  )
  const selectedMembers = allMembersList.filter(m => checked.has(m.member_id))
  const totalSelectedSlots = selectedMembers.reduce((s, m) => s + parseFloat(slotCounts[m.member_id] || '1'), 0)
  const currentGroupSlots = members.reduce((s, m) => s + Number(m.slot_count || 0), 0)

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="bg-purple-600 text-white p-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-purple-200 text-xl">←</button>
            <span className="text-sm text-purple-200">Group Detail</span>
          </div>
          <Link href={`/groups/${id}/edit`}>
            <button className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg">✏️ Edit</button>
          </Link>
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


      {/* ═══ ADD MEMBERS PANEL ═══ */}
      {showAddPanel && (
        <div className="mx-4 mb-4 bg-white rounded-2xl shadow-md overflow-hidden border border-indigo-100">
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

          {!createMode && (
            <div className="p-4 space-y-3">
              {/* Slot summary */}
              <div className="flex justify-between text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                <span>Group currently has <strong>{currentGroupSlots} slots</strong> ({members.length} members)</span>
                <span>Capacity: <strong>{group.total_slots} slots</strong></span>
              </div>

              <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search members..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm" />

              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl">
                {filteredAvailableMembers.length === 0 ? (
                  <p className="text-center py-4 text-sm text-gray-400">
                    {allMembersList.length === 0 ? 'All existing members already in this group' : 'No members found'}
                  </p>
                ) : filteredAvailableMembers.map(m => (
                  <button key={m.member_id} onClick={() => toggleMember(m.member_id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 text-left transition-colors ${checked.has(m.member_id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked.has(m.member_id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                      {checked.has(m.member_id) && <span className="text-white text-xs">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 text-sm truncate">{m.full_name}</p>
                      <p className="text-xs text-gray-500">{m.phone} {m.is_daily_payer ? '⭐' : ''}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Selected members with slot pickers */}
              {selectedMembers.length > 0 && (
                <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-semibold text-indigo-800">{selectedMembers.length} selected — set slots:</p>
                    <p className="text-sm font-bold text-indigo-700">{totalSelectedSlots} total slots</p>
                  </div>
                  {selectedMembers.map(m => (
                    <div key={m.member_id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-gray-800 flex-1 truncate">{m.full_name}</span>
                      <select value={slotCounts[m.member_id] || '1'} onChange={e => setSlotCounts(prev => ({ ...prev, [m.member_id]: e.target.value }))}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white">
                        <option value="0.5">0.5</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                      </select>
                      {group.base_installment && (
                        <span className="text-xs text-indigo-600 w-16 text-right">
                          {formatCurrency(Number(group.base_installment) * parseFloat(slotCounts[m.member_id] || '1'))}/mo
                        </span>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-indigo-600 text-right">
                    After adding: {currentGroupSlots + totalSelectedSlots}/{group.total_slots} slots filled
                  </p>
                </div>
              )}

              {addError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{addError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowAddPanel(false)} className="px-4 py-3 border border-gray-300 rounded-xl text-gray-600 text-sm">Cancel</button>
                <button onClick={handleBulkAdd} disabled={saving || checked.size === 0}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                  {saving ? 'Adding...' : `Add ${checked.size > 0 ? checked.size : ''} Members (${totalSelectedSlots} slots)`}
                </button>
              </div>
            </div>
          )}

          {createMode && (
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input value={newMember.full_name} onChange={e => setNewMember(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Member's full name" className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input value={newMember.phone} onChange={e => setNewMember(p => ({ ...p, phone: e.target.value }))}
                  placeholder="Mobile number" type="tel" className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700">Daily Payer ⭐</p>
                <button onClick={() => setNewMember(p => ({ ...p, is_daily_payer: !p.is_daily_payer }))}
                  className={`w-11 h-6 rounded-full transition-colors ${newMember.is_daily_payer ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                  <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${newMember.is_daily_payer ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {addError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{addError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowAddPanel(false)} className="px-4 py-3 border border-gray-300 rounded-xl text-gray-600 text-sm">Cancel</button>
                <button onClick={handleCreateAndAdd} disabled={saving}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                  {saving ? 'Saving...' : '✓ Create & Add to Group'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs — 4 buttons */}
      <div className="mx-4 flex border-b border-gray-200 mb-3">
        {([
          { key: 'members', label: `Members (${members.length})` },
          { key: 'history', label: 'History' },
          { key: 'auctions', label: `Auctions (${allAuctions.length})` },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
        <Link href={`/auctions?group=${id}`}
          className="py-3 px-3 text-sm font-semibold border-b-2 border-transparent text-indigo-600 whitespace-nowrap">
          🔨 Record
        </Link>
      </div>

      <div className="px-4 space-y-2">

        {/* MEMBERS TAB — Name | Slots | Won Month(s) */}
        {tab === 'members' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {members.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">No members yet</p>
                <button onClick={openAddPanel} className="mt-3 text-indigo-600 text-sm font-medium">+ Add members</button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Name</th>
                    <th className="px-2 py-2 text-center text-xs text-gray-500 font-medium">Slots</th>
                    <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Won Month(s)</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(slot => {
                    const wins = wonMonths[slot.member_id] || []
                    return (
                      <tr key={slot.slot_id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3">
                          <Link href={`/members/${slot.member_id}`}>
                            <p className="font-medium text-gray-800 text-sm">{slot.members?.full_name}</p>
                            <p className="text-xs text-gray-400">{slot.members?.phone}</p>
                          </Link>
                        </td>
                        <td className="px-2 py-3 text-center font-medium text-gray-700">{slot.slot_count}</td>
                        <td className="px-4 py-3">
                          {wins.length > 0
                            ? wins.map(m => (
                                <span key={m} className="inline-block bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full mr-1">M{m}</span>
                              ))
                            : <span className="text-gray-300 text-xs">—</span>
                          }
                        </td>
                        <td className="px-2 py-3">
                          <button onClick={() => removeMember(slot.slot_id)} className="text-gray-300 hover:text-red-500 text-xs" title="Remove">✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <div className="p-4 border-t border-gray-100">
              <button onClick={openAddPanel} className="w-full border-2 border-indigo-600 text-indigo-600 py-3 rounded-xl font-semibold text-sm">
                + Add Members
              </button>
            </div>
          </div>
        )}

        {/* HISTORY TAB — Date | Month | Bid Amount | Disc/Slot | Saved */}
        {tab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {allAuctions.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No auctions recorded yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium whitespace-nowrap">Date</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-500 font-medium whitespace-nowrap">Month</th>
                      <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium whitespace-nowrap">Bid Amount</th>
                      <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium whitespace-nowrap">Disc/Slot</th>
                      <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium whitespace-nowrap">Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allAuctions.map(a => (
                      <tr key={a.auction_id} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(a.auction_date)}</td>
                        <td className="px-3 py-2.5 text-center text-xs font-medium text-gray-700">M{a.month_no}</td>
                        <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(a.bid_amount)}</td>
                        <td className="px-3 py-2.5 text-right text-indigo-600">{formatCurrency(a.member_discount_per_slot)}</td>
                        <td className="px-3 py-2.5 text-right text-green-600">{formatCurrency(a.saved_commission_out || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* AUCTIONS TAB — month-wise cards */}
        {tab === 'auctions' && (
          <div className="space-y-2">
            {allAuctions.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center">
                <p className="text-gray-400 text-sm">No auctions recorded yet</p>
                <Link href={`/auctions?group=${id}`}>
                  <button className="mt-3 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Record First Auction</button>
                </Link>
              </div>
            ) : allAuctions.map(a => (
              <div key={a.auction_id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Auction row header */}
                <button
                  onClick={() => { setExpandedAuction(expandedAuction === a.auction_id ? null : a.auction_id); setEditingAuction(null) }}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <p className="font-semibold text-gray-800">Month {a.month_no}</p>
                    <p className="text-xs text-gray-500">{formatDate(a.auction_date)} • Winner: {a.winner_name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-green-700">{formatCurrency(a.net_payout)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.payout_status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {a.payout_status}
                    </span>
                  </div>
                </button>

                {/* Expanded details */}
                {expandedAuction === a.auction_id && !editingAuction && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500">Bid Amount</span><p className="font-medium">{formatCurrency(a.bid_amount)}</p></div>
                      <div><span className="text-gray-500">+ Saved Commission</span><p className="font-medium">{formatCurrency(a.saved_commission_in || 0)}</p></div>
                      <div><span className="text-gray-500">Admin Commission</span><p className="font-medium text-red-500">−{formatCurrency(a.admin_commission)}</p></div>
                      <div><span className="text-gray-500">Shared Discount</span><p className="font-medium">{formatCurrency(a.shared_discount)}</p></div>
                      <div><span className="text-gray-500">Discount/Slot</span><p className="font-medium">{formatCurrency(a.member_discount_per_slot)}</p></div>
                      <div><span className="text-gray-500">Saved → Next Month</span><p className="font-medium text-blue-600">{formatCurrency(a.saved_commission_out || 0)}</p></div>
                    </div>
                    <div className="border-t border-gray-200 pt-2 grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500">Gross Payout</span><p className="font-semibold">{formatCurrency(a.gross_payout)}</p></div>
                      <div><span className="text-gray-500">Deduction</span><p className="font-medium text-red-500">{formatCurrency(a.deduction_amount)}</p></div>
                    </div>
                    <div className="bg-indigo-600 text-white rounded-xl px-4 py-2.5 flex justify-between items-center">
                      <span className="font-bold">Net Payout</span>
                      <span className="font-bold text-xl">{formatCurrency(a.net_payout)}</span>
                    </div>
                    <Link href={`/auctions/${a.auction_id}`}>
                      <button className="w-full border border-indigo-600 text-indigo-600 py-2 rounded-xl text-sm font-medium">
                        ✏️ Edit This Auction — Full Form
                      </button>
                    </Link>
                  </div>
                )}

                {/* Edit form */}
                {editingAuction?.auction_id === a.auction_id && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-amber-50">
                    <p className="font-semibold text-amber-800 text-sm">Editing Month {a.month_no} Auction</p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Auction Date</label>
                        <input type="date" value={editingAuction.auction_date}
                          onChange={e => setEditingAuction((p: any) => ({ ...p, auction_date: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Bid Amount</label>
                        <input type="number" value={editingAuction.bid_amount}
                          onChange={e => setEditingAuction((p: any) => ({ ...p, bid_amount: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Shared Discount</label>
                        <input type="number" value={editingAuction.shared_discount}
                          onChange={e => setEditingAuction((p: any) => ({ ...p, shared_discount: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Saved Commission In</label>
                        <input type="number" value={editingAuction.saved_commission_in || 0}
                          onChange={e => setEditingAuction((p: any) => ({ ...p, saved_commission_in: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Gross Payout</label>
                        <input type="number" value={editingAuction.gross_payout}
                          onChange={e => setEditingAuction((p: any) => ({ ...p, gross_payout: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Deduction</label>
                        <input type="number" value={editingAuction.deduction_amount || 0}
                          onChange={e => setEditingAuction((p: any) => ({ ...p, deduction_amount: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Net Payout</label>
                      <input type="number" value={editingAuction.net_payout}
                        onChange={e => setEditingAuction((p: any) => ({ ...p, net_payout: e.target.value }))}
                        className="w-full px-3 py-2 border border-indigo-300 rounded-lg bg-white text-sm font-bold" />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Payout Status</label>
                      <select value={editingAuction.payout_status}
                        onChange={e => setEditingAuction((p: any) => ({ ...p, payout_status: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm">
                        <option value="Pending">Pending</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => setEditingAuction(null)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-600 text-sm">Cancel</button>
                      <button onClick={saveEditAuction} disabled={editSaving}
                        className="flex-1 bg-amber-500 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-60">
                        {editSaving ? 'Saving...' : '✓ Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
