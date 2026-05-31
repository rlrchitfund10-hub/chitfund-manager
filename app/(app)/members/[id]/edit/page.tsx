'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createAdminClient } from '@/lib/supabase/admin'

export default function EditMemberPage() {
  const { id } = useParams()
  const router = useRouter()
  const [form, setForm] = useState({
    full_name: '', phone: '', phone_alt: '', address: '',
    aadhaar: '', join_date: '', is_daily_payer: false, status: 'Active', notes: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const db = createClient()
    db.from('members').select('*').eq('member_id', id).single()
      .then(({ data }) => {
        if (data) setForm({
          full_name: data.full_name || '',
          phone: data.phone || '',
          phone_alt: data.phone_alt || '',
          address: data.address || '',
          aadhaar: data.aadhaar || '',
          join_date: data.join_date || '',
          is_daily_payer: data.is_daily_payer || false,
          status: data.status || 'Active',
          notes: data.notes || '',
        })
        setLoading(false)
      })
  }, [id])

  function update(field: string, value: any) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.full_name.trim() || !form.phone.trim()) {
      setError('Name and phone are required'); return
    }
    setSaving(true)
    setError('')

    const res = await fetch(`/api/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed to save'); setSaving(false); return }
    router.push(`/members/${id}`)
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh] text-gray-400">Loading...</div>

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 text-xl">←</button>
        <h2 className="text-xl font-bold text-gray-800">Edit Member</h2>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
          <input value={form.full_name} onChange={e => update('full_name', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
          <input value={form.phone} onChange={e => update('phone', e.target.value)} type="tel"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Alt Phone</label>
          <input value={form.phone_alt} onChange={e => update('phone_alt', e.target.value)} type="tel"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea value={form.address} onChange={e => update('address', e.target.value)} rows={2}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Aadhaar</label>
          <input value={form.aadhaar} onChange={e => update('aadhaar', e.target.value)} maxLength={12}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Join Date</label>
          <input type="date" value={form.join_date} onChange={e => update('join_date', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select value={form.status} onChange={e => update('status', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div className="flex items-center justify-between py-1">
          <p className="text-sm text-gray-700">Daily Payer ⭐</p>
          <button onClick={() => update('is_daily_payer', !form.is_daily_payer)}
            className={`w-11 h-6 rounded-full transition-colors ${form.is_daily_payer ? 'bg-indigo-600' : 'bg-gray-300'}`}>
            <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.is_daily_payer ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <input value={form.notes} onChange={e => update('notes', e.target.value)}
            placeholder="Any notes..."
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
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
