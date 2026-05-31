'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

export default function OverduePage() {
  const [overdueList, setOverdueList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadOverdue() }, [])

  async function loadOverdue() {
    const db = createClient()
    const { data } = await db
      .from('monthly_ledger')
      .select('*, members(full_name, phone), groups(group_name)')
      .eq('status', 'Overdue')
      .order('balance', { ascending: false })

    setOverdueList(data || [])
    setLoading(false)
  }

  const totalOverdue = overdueList.reduce((s, l) => s + Number(l.balance), 0)

  function buildMessage(item: any): string {
    return encodeURIComponent(
      `🚨 *Overdue Payment Reminder*\nHi ${item.members?.full_name}!\n\nYou have an overdue payment of *₹${Number(item.balance).toLocaleString()}* for ${item.groups?.group_name} (Month ${item.month_no}).\n\nPlease clear this at the earliest.\n\nThank you!`
    )
  }

  // Group by member for summary
  const byMember = overdueList.reduce((acc: any, item) => {
    const key = item.member_id
    if (!acc[key]) acc[key] = { ...item, totalDue: 0, groups: [] }
    acc[key].totalDue += Number(item.balance)
    acc[key].groups.push(item.groups?.group_name)
    return acc
  }, {})

  const memberList = Object.values(byMember) as any[]

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Overdue Members</h2>

      {/* Summary card */}
      {totalOverdue > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-700 font-medium">Total Overdue Amount</p>
              <p className="text-3xl font-bold text-red-600 mt-1">{formatCurrency(totalOverdue)}</p>
              <p className="text-sm text-red-500 mt-1">{memberList.length} members • {overdueList.length} entries</p>
            </div>
            <span className="text-4xl">⚠️</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : memberList.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-gray-600 font-medium">No overdue payments!</p>
          <p className="text-gray-400 text-sm mt-1">All members are up to date</p>
        </div>
      ) : (
        <div className="space-y-3">
          {memberList.map((item: any) => (
            <div key={item.member_id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <Link href={`/members/${item.member_id}`}>
                    <p className="font-bold text-gray-800 hover:text-indigo-600">{item.members?.full_name}</p>
                  </Link>
                  <p className="text-xs text-gray-500">{item.members?.phone}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.groups.join(', ')}</p>
                </div>
                <p className="text-xl font-bold text-red-600">{formatCurrency(item.totalDue)}</p>
              </div>

              <div className="flex gap-2">
                <a href={`tel:${item.members?.phone}`} className="flex-shrink-0">
                  <button className="bg-blue-100 text-blue-700 py-2 px-3 rounded-xl text-sm font-medium">
                    📞 Call
                  </button>
                </a>
                <a
                  href={`https://wa.me/91${item.members?.phone}?text=${buildMessage(item)}`}
                  target="_blank" rel="noopener noreferrer" className="flex-shrink-0"
                >
                  <button className="bg-green-500 text-white py-2 px-3 rounded-xl text-sm font-medium">
                    📱 WA
                  </button>
                </a>
                <Link href={`/payments?member=${item.member_id}&name=${encodeURIComponent(item.members?.full_name)}`} className="flex-1">
                  <button className="w-full bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium">
                    💳 Record Payment
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
