'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function HistoryPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 30

  useEffect(() => { loadPayments() }, [page])

  async function loadPayments() {
    setLoading(true)
    const db = createClient()
    const { data } = await db
      .from('payments')
      .select('*, members(full_name, member_id)')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    setPayments(data || [])
    setLoading(false)
  }

  const filtered = payments.filter(p =>
    p.members?.full_name?.toLowerCase().includes(search.toLowerCase())
  )
  const totalToday = payments
    .filter(p => p.payment_date === new Date().toISOString().split('T')[0])
    .reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Payment History</h2>
        <span className="text-sm text-green-600 font-medium">Today: {formatCurrency(totalToday)}</span>
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search member name..."
        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white shadow-sm text-sm"
      />

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {filtered.map(p => (
            <Link key={p.payment_id} href={`/members/${p.members?.member_id}`}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{p.members?.full_name}</p>
                  <p className="text-xs text-gray-500">{formatDate(p.payment_date)} • {p.payment_mode} • Month {p.month_no}</p>
                  {p.notes && <p className="text-xs text-gray-400 italic">{p.notes}</p>}
                </div>
                <span className="font-bold text-green-600">{formatCurrency(p.amount)}</span>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && <p className="text-center py-6 text-gray-400 text-sm">No payments found</p>}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 disabled:opacity-40"
        >
          ← Previous
        </button>
        <span className="flex items-center text-sm text-gray-500">Page {page + 1}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={payments.length < PAGE_SIZE}
          className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
