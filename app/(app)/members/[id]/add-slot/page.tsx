'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AddSlotPage() {
  const { id } = useParams()
  const router = useRouter()
  const [groups, setGroups] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [form, setForm] = useState({ group_id: '', slot_count: '1', partner_member_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const db = createClient()
    db.from('groups').select('group_id, group_name').eq('status', 'Active').order('group_name')
      .then(({ data }) => setGroups(data || []))
    db.from('members').select('member_id, full_name').eq('status', 'Active').neq('member_id', id).order('full_name')
      .then(({ data }) => setMembers(data || []))
  }, [id])

  async function handleSave() {
    if (!form.group_id) { setError('Select a group'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: id, ...form, slot_count: parseFloat(form.slot_count) }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }
    router.push(`/members/${id}`)
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 text-xl">←</button>
        <h2 className="text-xl font-bold text-gray-800">Add to Group</h2>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Group *</label>
          <select
            value={form.group_id} onChange={e => setForm(prev => ({ ...prev, group_id: e.target.value }))}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          >
            <option value="">Choose group...</option>
            {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slot Count</label>
          <select
            value={form.slot_count} onChange={e => setForm(prev => ({ ...prev, slot_count: e.target.value }))}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
          >
            <option value="0.5">0.5 (Shared slot)</option>
            <option value="1">1 slot</option>
            <option value="2">2 slots</option>
            <option value="3">3 slots</option>
            <option value="4">4 slots</option>
            <option value="5">5 slots</option>
          </select>
        </div>
        {form.slot_count === '0.5' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner Member (for 0.5 slot)</label>
            <select
              value={form.partner_member_id} onChange={e => setForm(prev => ({ ...prev, partner_member_id: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm"
            >
              <option value="">Select partner...</option>
              {members.map(m => <option key={m.member_id} value={m.member_id}>{m.full_name}</option>)}
            </select>
          </div>
        )}
        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
      </div>

      <button
        onClick={handleSave} disabled={saving}
        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow active:scale-95 disabled:opacity-60"
      >
        {saving ? 'Adding...' : 'Add to Group'}
      </button>
    </div>
  )
}
