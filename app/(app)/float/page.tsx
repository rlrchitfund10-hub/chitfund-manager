'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function FloatPage() {
  const [pendingPayouts, setPendingPayouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadFloat() }, [])

  async function loadFloat() {
    const db = createClient()
    const { data } = await db
      .from('auctions')
      .select('*, groups(group_name), members!auctions_winner_member_id_fkey(full_name, phone)')
      .eq('payout_status', 'Pending')
      .order('created_at', { ascending: false })

    setPendingPayouts(data || [])
    setLoading(false)
  }

  async function markPaid(auctionId: string) {
    const res = await fetch('/api/auctions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auction_id: auctionId, payout_status: 'Paid', payout_date: new Date().toISOString().split('T')[0] }),
    })
    if (res.ok) loadFloat()
  }

  const totalFloat = pendingPayouts.reduce((s, p) => s + Number(p.net_payout || 0), 0)

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Admin Float Tracker</h2>

      {totalFloat > 0 && (
        <div className={`rounded-2xl p-4 border ${totalFloat > 100000 ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
          <p className="text-sm font-medium text-gray-600">Total Float (Advances to Winners)</p>
          <p className={`text-3xl font-bold mt-1 ${totalFloat > 100000 ? 'text-red-600' : 'text-orange-600'}`}>
            {formatCurrency(totalFloat)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Money advanced to winners, pending collection from members</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : pendingPayouts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-gray-600 font-medium">No pending payouts</p>
          <p className="text-gray-400 text-sm mt-1">All winners have been paid</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingPayouts.map(p => (
            <div key={p.auction_id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <Link href={`/members/${p.winner_member_id}`}>
                    <p className="font-bold text-gray-800">{p.members?.full_name}</p>
                  </Link>
                  <p className="text-sm text-gray-500">{p.groups?.group_name} • Month {p.month_no}</p>
                  <p className="text-xs text-gray-400">{formatDate(p.auction_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-orange-600">{formatCurrency(p.net_payout)}</p>
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Pending</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mb-3">
                <div><span className="block text-gray-400">Gross</span>{formatCurrency(p.gross_payout)}</div>
                <div><span className="block text-gray-400">Deduction</span>{formatCurrency(p.deduction_amount)}</div>
                <div><span className="block text-gray-400">Net</span><span className="text-gray-800 font-medium">{formatCurrency(p.net_payout)}</span></div>
              </div>
              <button
                onClick={() => markPaid(p.auction_id)}
                className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium"
              >
                ✓ Mark as Paid
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
