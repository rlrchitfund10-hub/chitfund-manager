'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, statusColor } from '@/lib/utils'
import type { Member } from '@/lib/types'

interface MemberWithSummary extends Member {
  total_pending: number
  slot_count: number
  group_count: number
}

export default function MembersPage() {
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState<MemberWithSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'daily' | 'overdue'>('all')

  useEffect(() => { loadMembers() }, [filter])

  async function loadMembers() {
    setLoading(true)
    const db = createClient()

    let query = db
      .from('members')
      .select('*')
      .order('is_daily_payer', { ascending: false })
      .order('full_name')

    if (filter === 'daily') query = query.eq('is_daily_payer', true)

    const { data: membersData } = await query

    if (!membersData) { setLoading(false); return }

    // Get pending amounts from monthly_ledger
    const { data: ledger } = await db
      .from('monthly_ledger')
      .select('member_id, balance, status')
      .in('status', ['Pending', 'Overdue'])

    // Get slot counts
    const { data: slots } = await db
      .from('member_slots')
      .select('member_id, group_id, slot_count')
      .eq('status', 'Active')

    const enriched = membersData.map(m => {
      const mLedger = (ledger || []).filter(l => l.member_id === m.member_id)
      const mSlots = (slots || []).filter(s => s.member_id === m.member_id)
      const total_pending = mLedger.reduce((s, l) => s + Number(l.balance), 0)
      const groups = new Set(mSlots.map(s => s.group_id))
      return {
        ...m,
        total_pending,
        slot_count: mSlots.reduce((s, sl) => s + Number(sl.slot_count), 0),
        group_count: groups.size,
      }
    })

    let result = enriched
    if (filter === 'overdue') result = enriched.filter(m => m.total_pending > 0)

    setMembers(result)
    setLoading(false)
  }

  const filtered = members.filter(m =>
    m.full_name.toLowerCase().includes(search.toLowerCase()) ||
    m.phone.includes(search)
  )

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Members</h2>
        <Link href="/members/new">
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium shadow">
            + Add
          </button>
        </Link>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search name or phone..."
        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white shadow-sm text-sm"
      />

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: 'All' },
          { key: 'daily', label: '⭐ Daily Payers' },
          { key: 'overdue', label: '⚠ Has Balance' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">No members found</p>
            </div>
          )}
          {filtered.map(m => (
            <Link key={m.member_id} href={`/members/${m.member_id}`}>
              <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 active:scale-95 transition-transform">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                  {m.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-gray-800 truncate">{m.full_name}</p>
                    {m.is_daily_payer && <span className="text-xs">⭐</span>}
                  </div>
                  <p className="text-xs text-gray-500">{m.phone} • {m.group_count} groups • {m.slot_count} slots</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {m.total_pending > 0 ? (
                    <p className="text-sm font-bold text-red-600">{formatCurrency(m.total_pending)}</p>
                  ) : (
                    <p className="text-xs text-green-600 font-medium">✓ Clear</p>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColor(m.status)}`}>{m.status}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
