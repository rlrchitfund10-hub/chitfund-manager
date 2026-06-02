'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, statusColor, getCurrentMonthNo } from '@/lib/utils'

export default function GroupsPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [selectedGroupForRecord, setSelectedGroupForRecord] = useState('')

  useEffect(() => { loadGroups() }, [])

  async function loadGroups() {
    const db = createClient()
    const { data: groupsData } = await db
      .from('groups').select('*').order('group_name')

    if (!groupsData) { setLoading(false); return }

    const enriched = await Promise.all(groupsData.map(async g => {
      const monthNo = getCurrentMonthNo(g.start_date)
      const { data: ledger } = await db
        .from('monthly_ledger')
        .select('paid_amount, expected_amount')
        .eq('group_id', g.group_id)
        .eq('month_no', monthNo)

      const collected = (ledger || []).reduce((s: number, l: any) => s + Number(l.paid_amount), 0)
      const expected = (ledger || []).reduce((s: number, l: any) => s + Number(l.expected_amount), 0)

      const { data: slots } = await db
        .from('member_slots').select('member_id').eq('group_id', g.group_id)

      return { ...g, collected, expected, memberCount: (slots || []).length, monthNo }
    }))

    setGroups(enriched)
    setLoading(false)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Groups</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setSelectedGroupForRecord(''); setShowRecordModal(true) }}
            className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium shadow"
          >
            🔨 Record Payment
          </button>
          <Link href="/groups/new">
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium shadow">
              + Add Group
            </button>
          </Link>
        </div>
      </div>

      {/* Record Payment popup */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowRecordModal(false)}>
          <div className="bg-white rounded-t-3xl w-full px-6 pt-6 pb-24 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Record Auction</h3>
              <button onClick={() => setShowRecordModal(false)} className="text-gray-400 text-2xl leading-none">✕</button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Group</label>
              <select
                value={selectedGroupForRecord}
                onChange={e => setSelectedGroupForRecord(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
              >
                <option value="">Select group...</option>
                {groups.filter(g => g.status === 'Active').map(g => (
                  <option key={g.group_id} value={g.group_id}>{g.group_name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => { if (selectedGroupForRecord) router.push(`/auctions?group=${selectedGroupForRecord}`) }}
              disabled={!selectedGroupForRecord}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-40"
            >
              🔨 Proceed to Record Auction
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-gray-500 font-medium">No groups yet</p>
          <p className="text-gray-400 text-sm mt-1">Add your first chit fund group</p>
          <Link href="/groups/new">
            <button className="mt-4 bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium">Add Group</button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => {
            const pct = g.expected > 0 ? Math.round((g.collected / g.expected) * 100) : 0
            return (
              <Link key={g.group_id} href={`/groups/${g.group_id}`}>
                <div className="bg-white rounded-2xl p-4 shadow-sm active:scale-95 transition-transform">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-800">{g.group_name}</h3>
                      <p className="text-sm text-gray-500">
                        {formatCurrency(g.principal_amount)} principal • {g.total_slots} slots • {g.commission_pct}% commission
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(g.status)}`}>
                      {g.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    Month {g.monthNo} of {g.total_months} • Auction on {g.auction_day}{g.auction_day === 1 ? 'st' : g.auction_day === 2 ? 'nd' : g.auction_day === 3 ? 'rd' : 'th'} • {g.memberCount} members
                  </div>
                  {g.expected > 0 && (
                    <>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{formatCurrency(g.collected)} collected</span>
                        <span className="font-medium text-indigo-600">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Remaining: {formatCurrency(g.expected - g.collected)}
                      </p>
                    </>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
