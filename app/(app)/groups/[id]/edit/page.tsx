'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function EditGroupPage() {
  const { id } = useParams()
  const router = useRouter()
  const [form, setForm] = useState({
    group_name: '', auction_day: '1', principal_amount: '',
    total_slots: '', commission_pct: '4', start_date: '', status: 'Active',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const db = createClient()
    db.from('groups').select('*').eq('group_id', id).single()
      .then(({ data }) => {
        if (data) setForm({
          group_name: data.group_name || '',
          auction_day: String(data.auction_day || 1),
          principal_amount: String(data.principal_amount || ''),
          total_slots: String(data.total_slots || ''),
          commission_pct: String(data.commission_pct || 4),
          start_date: data.start_date || '',
          status: data.status || 'Active',
        })
        setLoading(false)
      })
  }, [id])

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const baseInstallment = form.principal_amount && form.total_slots
    ? Number(form.principal_amount) / Number(form.total_slots) : 0

  async function handleSave() {
    if (!form.group_name.trim() || !form.principal_amount) {
      setError('Name and principal amount are required'); return
    }
    setSaving(true)
    setError('')
    const res = await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_name: form.group_name,
        auction_day: parseInt(form.auction_day),
        principal_amount: parseFloat(form.principal_amount),
        total_slots: parseInt(form.total_slots),
        total_months: parseInt(form.total_slots),
        commission_pct: parseFloat(form.commission_pct),
        start_date: form.start_date,
        status: form.status,
      }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }
    router.push(`/groups/${id}`)
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh] text-gray-400">Loading...</div>

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 text-xl">←</button>
        <h2 className="text-xl font-bold text-gray-800">Edit Group</h2>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
          <input value={form.group_name} onChange={e => update('group_name', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Principal Amount (₹)</label>
            <input type="number" value={form.principal_amount} onChange={e => update('principal_amount', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Slots</label>
            <input type="number" value={form.total_slots} onChange={e => update('total_slots', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
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
            <input type="number" value={form.commission_pct} onChange={e => update('commission_pct', e.target.value)}
              step="0.5" className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Auction Day</label>
            <input type="number" value={form.auction_day} onChange={e => update('auction_day', e.target.value)}
              min="1" max="28" className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select value={form.status} onChange={e => update('status', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm">
            <option value="Active">Active</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
      </div>

      <button onClick={handleSave} disabled={saving}
        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow active:scale-95 disabled:opacity-60">
        {saving ? 'Saving...' : '✓ Save Changes'}
      </button>
    </div>
  )
}
