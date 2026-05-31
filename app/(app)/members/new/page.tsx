'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewMemberPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    full_name: '', phone: '', phone_alt: '', address: '',
    aadhaar: '', join_date: new Date().toISOString().split('T')[0],
    is_daily_payer: false, status: 'Active', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field: string, value: any) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.full_name.trim() || !form.phone.trim()) {
      setError('Name and phone are required')
      return
    }
    setSaving(true)
    setError('')
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed to save'); setSaving(false); return }
    router.push(`/members/${result.member_id}`)
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <h2 className="text-xl font-bold text-gray-800">Add Member</h2>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
          <input
            value={form.full_name} onChange={e => update('full_name', e.target.value)}
            placeholder="Member's full name"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
          <input
            value={form.phone} onChange={e => update('phone', e.target.value)}
            placeholder="10-digit mobile number"
            type="tel"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Alt Phone</label>
          <input
            value={form.phone_alt} onChange={e => update('phone_alt', e.target.value)}
            placeholder="Alternate number (optional)"
            type="tel"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea
            value={form.address} onChange={e => update('address', e.target.value)}
            placeholder="Address (optional)"
            rows={2}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Aadhaar (last 4 digits)</label>
          <input
            value={form.aadhaar} onChange={e => update('aadhaar', e.target.value)}
            placeholder="XXXX (optional)"
            maxLength={12}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Join Date</label>
          <input
            type="date" value={form.join_date} onChange={e => update('join_date', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium text-gray-800 text-sm">Daily Payer ⭐</p>
            <p className="text-xs text-gray-500">Show at top of members list</p>
          </div>
          <button
            onClick={() => update('is_daily_payer', !form.is_daily_payer)}
            className={`w-12 h-6 rounded-full transition-colors ${form.is_daily_payer ? 'bg-indigo-600' : 'bg-gray-300'}`}
          >
            <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.is_daily_payer ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <input
            value={form.notes} onChange={e => update('notes', e.target.value)}
            placeholder="Any notes..."
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          />
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow active:scale-95 transition-all disabled:opacity-60"
      >
        {saving ? 'Saving...' : 'Save Member'}
      </button>
    </div>
  )
}
