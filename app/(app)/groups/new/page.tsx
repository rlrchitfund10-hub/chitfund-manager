'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewGroupPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    group_name: '',
    auction_day: '1',
    principal_amount: '',
    total_slots: '20',
    commission_pct: '4',
    start_date: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const baseInstallment = form.principal_amount && form.total_slots
    ? Number(form.principal_amount) / Number(form.total_slots)
    : 0

  async function handleSave() {
    if (!form.group_name || !form.principal_amount || !form.total_slots) {
      setError('Name, principal amount, and total slots are required')
      return
    }
    setSaving(true)
    setError('')
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        auction_day: parseInt(form.auction_day),
        principal_amount: parseFloat(form.principal_amount),
        total_slots: parseInt(form.total_slots),
        total_months: parseInt(form.total_slots),
        commission_pct: parseFloat(form.commission_pct),
      }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }
    router.push(`/groups/${result.group_id}`)
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 text-xl">←</button>
        <h2 className="text-xl font-bold text-gray-800">Add Group</h2>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
          <input
            value={form.group_name} onChange={e => update('group_name', e.target.value)}
            placeholder="e.g. Group 1"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Principal Amount (₹) *</label>
            <input
              type="number" value={form.principal_amount} onChange={e => update('principal_amount', e.target.value)}
              placeholder="e.g. 500000"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Slots *</label>
            <input
              type="number" value={form.total_slots} onChange={e => update('total_slots', e.target.value)}
              placeholder="e.g. 20"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
            />
          </div>
        </div>

        {baseInstallment > 0 && (
          <div className="bg-indigo-50 rounded-xl p-3 text-sm">
            <span className="text-indigo-700 font-medium">Base Installment: </span>
            <span className="font-bold text-indigo-800">₹{baseInstallment.toLocaleString()}/month per slot</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Commission %</label>
            <input
              type="number" value={form.commission_pct} onChange={e => update('commission_pct', e.target.value)}
              step="0.5" min="0" max="100"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Auction Day of Month</label>
            <input
              type="number" value={form.auction_day} onChange={e => update('auction_day', e.target.value)}
              min="1" max="28"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input
            type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
      </div>

      <button
        onClick={handleSave} disabled={saving}
        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow active:scale-95 disabled:opacity-60"
      >
        {saving ? 'Saving...' : 'Create Group'}
      </button>
    </div>
  )
}
