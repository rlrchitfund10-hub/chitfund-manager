'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

interface DashboardData {
  totalFloat: number
  thisMonthCollected: number
  thisMonthExpected: number
  overdueCount: number
  overdueAmount: number
  groups: Array<{
    group_id: string
    group_name: string
    collected: number
    expected: number
    pct: number
  }>
  recentPayments: Array<{
    payment_id: string
    full_name: string
    amount: number
    payment_mode: string
    payment_date: string
  }>
  pendingPayouts: Array<{
    auction_id: string
    group_name: string
    winner_name: string
    net_payout: number
  }>
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    const db = createClient()

    // Fetch all base data without FK joins
    const [
      { data: groups },
      { data: ledger },
      { data: thisMonthLedger },
      { data: recentPaymentsRaw },
      { data: pendingPayoutsRaw },
    ] = await Promise.all([
      db.from('groups').select('*').eq('status', 'Active'),
      db.from('monthly_ledger').select('member_id,balance').eq('status', 'Overdue'),
      db.from('monthly_ledger').select('group_id,paid_amount,expected_amount'),
      db.from('payments').select('payment_id,amount,payment_mode,payment_date,member_id')
        .order('created_at', { ascending: false }).limit(5),
      db.from('auctions').select('auction_id,net_payout,group_id,winner_member_id')
        .eq('payout_status', 'Pending'),
    ])

    // Fetch member names for recent payments
    const paymentMemberIds = [...new Set((recentPaymentsRaw || []).map((p: any) => p.member_id))]
    const auctionMemberIds = [...new Set((pendingPayoutsRaw || []).map((a: any) => a.winner_member_id))]
    const allMemberIds = [...new Set([...paymentMemberIds, ...auctionMemberIds])]

    let memberNameMap: Record<string, string> = {}
    if (allMemberIds.length > 0) {
      const { data: membersData } = await db.from('members').select('member_id,full_name').in('member_id', allMemberIds)
      ;(membersData || []).forEach((m: any) => { memberNameMap[m.member_id] = m.full_name })
    }

    // Fetch group names for auctions
    const auctionGroupIds = [...new Set((pendingPayoutsRaw || []).map((a: any) => a.group_id))]
    let groupNameMap: Record<string, string> = {}
    if (auctionGroupIds.length > 0) {
      const { data: groupsData } = await db.from('groups').select('group_id,group_name').in('group_id', auctionGroupIds)
      ;(groupsData || []).forEach((g: any) => { groupNameMap[g.group_id] = g.group_name })
    }

    // Calculate metrics
    const overdueAmount = (ledger || []).reduce((s: number, r: any) => s + Number(r.balance), 0)
    const totalFloat = (pendingPayoutsRaw || []).reduce((s: number, r: any) => s + Number(r.net_payout || 0), 0)

    // Group-wise collection
    const groupStats = (groups || []).map(g => {
      const gLedger = (thisMonthLedger || []).filter((l: any) => l.group_id === g.group_id)
      const collected = gLedger.reduce((s: number, l: any) => s + Number(l.paid_amount), 0)
      const expected = gLedger.reduce((s: number, l: any) => s + Number(l.expected_amount), 0)
      return {
        group_id: g.group_id, group_name: g.group_name, collected, expected,
        pct: expected > 0 ? Math.round((collected / expected) * 100) : 0,
      }
    })

    setData({
      totalFloat,
      thisMonthCollected: groupStats.reduce((s, g) => s + g.collected, 0),
      thisMonthExpected: groupStats.reduce((s, g) => s + g.expected, 0),
      overdueCount: (ledger || []).length,
      overdueAmount,
      groups: groupStats,
      recentPayments: (recentPaymentsRaw || []).map((p: any) => ({
        payment_id: p.payment_id,
        full_name: memberNameMap[p.member_id] || 'Unknown',
        amount: Number(p.amount),
        payment_mode: p.payment_mode,
        payment_date: p.payment_date,
      })),
      pendingPayouts: (pendingPayoutsRaw || []).map((a: any) => ({
        auction_id: a.auction_id,
        group_name: groupNameMap[a.group_id] || '',
        winner_name: memberNameMap[a.winner_member_id] || '',
        net_payout: Number(a.net_payout || 0),
      })),
    })
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">💰</div>
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const collectionPct = data!.thisMonthExpected > 0
    ? Math.round((data!.thisMonthCollected / data!.thisMonthExpected) * 100)
    : 0

  return (
    <div className="p-4 space-y-4">
      {/* Date */}
      <p className="text-sm text-gray-500">{today}</p>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/payments">
          <div className="bg-indigo-600 text-white rounded-2xl p-4 shadow active:scale-95 transition-transform">
            <div className="text-2xl mb-1">💳</div>
            <p className="font-bold">Record Payment</p>
            <p className="text-indigo-200 text-xs">Tap to record</p>
          </div>
        </Link>
        <Link href="/auctions">
          <div className="bg-purple-600 text-white rounded-2xl p-4 shadow active:scale-95 transition-transform">
            <div className="text-2xl mb-1">🔨</div>
            <p className="font-bold">Record Auction</p>
            <p className="text-purple-200 text-xs">Monthly auction</p>
          </div>
        </Link>
      </div>

      {/* Admin Float */}
      {data!.totalFloat > 0 && (
        <div className={`rounded-2xl p-4 shadow-sm ${data!.totalFloat > 50000 ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Admin Float (Pending Payouts)</p>
              <p className={`text-2xl font-bold mt-1 ${data!.totalFloat > 50000 ? 'text-red-600' : 'text-orange-600'}`}>
                {formatCurrency(data!.totalFloat)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Money advanced to winners, pending collection</p>
            </div>
            <span className="text-3xl">{data!.totalFloat > 50000 ? '🔴' : '🟠'}</span>
          </div>
        </div>
      )}

      {/* This Month Collection */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-gray-800">This Month Collection</p>
          <span className="text-sm font-bold text-indigo-600">{collectionPct}%</span>
        </div>
        <div className="flex items-end gap-2 mb-3">
          <span className="text-2xl font-bold text-gray-800">{formatCurrency(data!.thisMonthCollected)}</span>
          <span className="text-sm text-gray-400 mb-1">of {formatCurrency(data!.thisMonthExpected)}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all"
            style={{ width: `${collectionPct}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Remaining: {formatCurrency(data!.thisMonthExpected - data!.thisMonthCollected)}
        </p>
      </div>

      {/* Overdue Alert */}
      {data!.overdueCount > 0 && (
        <Link href="/overdue">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-sm active:scale-95 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-red-700">⚠ Overdue Members</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(data!.overdueAmount)}</p>
                <p className="text-xs text-red-500">{data!.overdueCount} entries overdue — tap to view</p>
              </div>
              <span className="text-3xl">📋</span>
            </div>
          </div>
        </Link>
      )}

      {/* Pending Payouts */}
      {data!.pendingPayouts.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-semibold text-gray-800 mb-3">Pending Payouts 🏆</p>
          <div className="space-y-2">
            {data!.pendingPayouts.map(p => (
              <div key={p.auction_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{p.winner_name}</p>
                  <p className="text-xs text-gray-500">{p.group_name}</p>
                </div>
                <span className="font-bold text-green-600 text-sm">{formatCurrency(p.net_payout)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Group Progress */}
      {data!.groups.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-semibold text-gray-800 mb-3">Group-wise Collection</p>
          <div className="space-y-3">
            {data!.groups.map(g => (
              <Link key={g.group_id} href={`/groups/${g.group_id}`}>
                <div className="py-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{g.group_name}</span>
                    <span className="text-gray-500">{formatCurrency(g.collected)} / {formatCurrency(g.expected)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${g.pct >= 100 ? 'bg-green-500' : g.pct > 50 ? 'bg-indigo-500' : 'bg-orange-400'}`}
                      style={{ width: `${Math.min(g.pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{g.pct}% collected</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Payments */}
      {data!.recentPayments.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-semibold text-gray-800 mb-3">Recent Payments</p>
          <div className="space-y-2">
            {data!.recentPayments.map(p => (
              <div key={p.payment_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{p.full_name}</p>
                  <p className="text-xs text-gray-500">{p.payment_mode} • {p.payment_date}</p>
                </div>
                <span className="font-bold text-green-600 text-sm">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && data!.groups.length === 0 && (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">🚀</div>
          <h3 className="text-lg font-semibold text-gray-700">Ready to get started!</h3>
          <p className="text-gray-500 text-sm mt-2">Add your first group to begin</p>
          <Link href="/groups">
            <button className="mt-4 bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium">
              Add Group
            </button>
          </Link>
        </div>
      )}
    </div>
  )
}
