'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, statusColor, getCurrentMonthNo } from '@/lib/utils'

export default function MemberProfilePage() {
  const params = useParams()
  const router = useRouter()
  const memberId = params.id as string

  const [member, setMember] = useState<any>(null)
  const [slots, setSlots] = useState<any[]>([])
  const [ledger, setLedger] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [auctions, setAuctions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'payments' | 'auctions'>('overview')

  useEffect(() => { loadProfile() }, [memberId])

  async function loadProfile() {
    const db = createClient()
    const [
      { data: memberData },
      { data: slotsData },
      { data: ledgerData },
      { data: paymentsData },
      { data: auctionsData },
    ] = await Promise.all([
      db.from('members').select('*').eq('member_id', memberId).single(),
      db.from('member_slots').select('*').eq('member_id', memberId).order('created_at'),
      db.from('monthly_ledger').select('*').eq('member_id', memberId).order('month_no', { ascending: false }),
      db.from('payments').select('*').eq('member_id', memberId).order('created_at', { ascending: false }).limit(50),
      db.from('auctions').select('*').or(`winner_member_id.eq.${memberId},winner2_member_id.eq.${memberId}`).order('created_at', { ascending: false }),
    ])

    // Fetch group names separately
    const groupIds = [...new Set([
      ...(slotsData || []).map((s: any) => s.group_id),
      ...(ledgerData || []).map((l: any) => l.group_id),
      ...(auctionsData || []).map((a: any) => a.group_id),
    ])]
    let groupMap: Record<string, string> = {}
    if (groupIds.length > 0) {
      const { data: groupsData } = await db.from('groups').select('group_id,group_name').in('group_id', groupIds)
      ;(groupsData || []).forEach((g: any) => { groupMap[g.group_id] = g.group_name })
    }

    setMember(memberData)
    setSlots((slotsData || []).map((s: any) => ({ ...s, groups: { group_name: groupMap[s.group_id] || s.group_id } })))
    setLedger((ledgerData || []).map((l: any) => ({ ...l, groups: { group_name: groupMap[l.group_id] || l.group_id } })))
    setPayments(paymentsData || [])
    setAuctions((auctionsData || []).map((a: any) => ({ ...a, groups: { group_name: groupMap[a.group_id] || a.group_id } })))
    setLoading(false)
  }

  function buildWhatsAppMessage() {
    if (!member) return ''
    const activeSlots = slots.filter(s => s.status === 'Active')
    const totalPending = ledger
      .filter(l => l.status !== 'Paid')
      .reduce((s: number, l: any) => s + Number(l.balance), 0)

    const lines = [
      `🏦 *ChitFund Payment Reminder*`,
      `Hi ${member.full_name}!`,
      ``,
      `*Your outstanding balance:*`,
    ]

    const currentLedger = ledger.filter(l => l.status !== 'Paid')
    currentLedger.forEach(l => {
      lines.push(`• ${l.groups?.group_name}: ₹${Number(l.balance).toLocaleString()} (${l.status})`)
    })

    lines.push(``, `*Total Pending: ₹${totalPending.toLocaleString()}*`)
    lines.push(``, `Please arrange payment at your earliest convenience.`)

    return encodeURIComponent(lines.join('\n'))
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh] text-gray-400">Loading...</div>
  if (!member) return <div className="p-4 text-red-500">Member not found</div>

  const totalPending = ledger
    .filter(l => l.status !== 'Paid')
    .reduce((s, l) => s + Number(l.balance), 0)

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const activeSlots = slots.filter(s => s.status === 'Active')
  const wonSlots = slots.filter(s => s.status === 'Won')

  const waUrl = `https://wa.me/91${member.phone}?text=${buildWhatsAppMessage()}`

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="bg-indigo-600 text-white p-4 pb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-indigo-200 text-xl">←</button>
            <span className="text-sm text-indigo-200">Member Profile</span>
          </div>
          <Link href={`/members/${memberId}/edit`}>
            <button className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg">✏️ Edit</button>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0">
            {member.full_name.charAt(0)}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{member.full_name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <a href={`tel:${member.phone}`} className="flex items-center gap-1 text-indigo-200 text-sm hover:text-white">
                📞 {member.phone}
              </a>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {member.is_daily_payer && <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-medium">⭐ Daily Payer</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${member.status === 'Active' ? 'bg-green-400 text-green-900' : 'bg-gray-300 text-gray-700'}`}>
                {member.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="-mt-4 mx-4 bg-white rounded-2xl shadow-md p-4 grid grid-cols-3 gap-2 mb-4">
        <div className="text-center">
          <p className="text-xl font-bold text-red-600">{formatCurrency(totalPending)}</p>
          <p className="text-xs text-gray-500">Pending</p>
        </div>
        <div className="text-center border-x border-gray-100">
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-gray-500">Total Paid</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-indigo-600">{activeSlots.length}</p>
          <p className="text-xs text-gray-500">Active Slots</p>
        </div>
      </div>

      {/* WhatsApp button */}
      {totalPending > 0 && (
        <div className="mx-4 mb-4">
          <a href={waUrl} target="_blank" rel="noopener noreferrer">
            <button className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2">
              <span>📱</span> Send Payment Reminder via WhatsApp
            </button>
          </a>
        </div>
      )}

      {/* Quick pay button */}
      <div className="mx-4 mb-4">
        <Link href={`/payments?member=${memberId}&name=${encodeURIComponent(member.full_name)}`}>
          <button className="w-full bg-indigo-600 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2">
            <span>💳</span> Record Payment for {member.full_name}
          </button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="mx-4 flex border-b border-gray-200 mb-4">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'payments', label: `Payments (${payments.length})` },
          { key: 'auctions', label: `Wins (${auctions.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        {/* Overview tab */}
        {tab === 'overview' && (
          <>
            {/* Groups & Slots */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="font-semibold text-gray-800 mb-3">Groups & Slots</p>
              {slots.length === 0 ? (
                <p className="text-gray-400 text-sm">No slots assigned yet</p>
              ) : (
                <div className="space-y-2">
                  {slots.map(slot => (
                    <div key={slot.slot_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{(slot.groups as any)?.group_name}</p>
                        <p className="text-xs text-gray-500">{slot.slot_count} slot{slot.slot_count !== 1 ? 's' : ''}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(slot.status)}`}>
                        {slot.status === 'Won' ? `Won (Month ${slot.won_month_no})` : slot.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Link href={`/members/${memberId}/add-slot`}>
                <button className="mt-3 w-full border-2 border-dashed border-gray-200 text-gray-500 py-2 rounded-xl text-sm hover:border-indigo-300 hover:text-indigo-600">
                  + Add to Group
                </button>
              </Link>
            </div>

            {/* Current Month Balances */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="font-semibold text-gray-800 mb-3">Current Balances</p>
              {ledger.filter(l => {
                const activeGroups = activeSlots.map(s => s.group_id)
                return activeGroups.includes(l.group_id)
              }).slice(0, 10).map(l => (
                <div key={l.ledger_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{l.groups?.group_name}</p>
                    <p className="text-xs text-gray-500">Month {l.month_no} • Paid: {formatCurrency(l.paid_amount)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(l.status)}`}>{l.status}</span>
                    {l.balance > 0 && <p className="text-sm font-bold text-red-600 mt-0.5">{formatCurrency(l.balance)}</p>}
                  </div>
                </div>
              ))}
            </div>

            {/* Member details */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="font-semibold text-gray-800 mb-3">Member Details</p>
              <div className="space-y-2 text-sm">
                {member.phone_alt && <div className="flex justify-between"><span className="text-gray-500">Alt Phone</span><span className="font-medium">{member.phone_alt}</span></div>}
                {member.address && <div className="flex justify-between"><span className="text-gray-500">Address</span><span className="font-medium text-right max-w-[60%]">{member.address}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Join Date</span><span className="font-medium">{formatDate(member.join_date)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(member.status)}`}>{member.status}</span></div>
              </div>
            </div>
          </>
        )}

        {/* Payments tab */}
        {tab === 'payments' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-3">All Payments</p>
            {payments.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No payments recorded yet</p>
            ) : (
              <div className="space-y-2">
                {payments.map(p => (
                  <div key={p.payment_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{formatDate(p.payment_date)}</p>
                      <p className="text-xs text-gray-500">{p.payment_mode} • Month {p.month_no}</p>
                      {p.notes && <p className="text-xs text-gray-400 italic">{p.notes}</p>}
                    </div>
                    <span className="font-bold text-green-600">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
                <div className="pt-2 flex justify-between font-bold">
                  <span className="text-gray-700">Total</span>
                  <span className="text-green-600">{formatCurrency(totalPaid)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Auctions tab */}
        {tab === 'auctions' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-3">Auctions Won</p>
            {auctions.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No auctions won yet</p>
            ) : (
              <div className="space-y-2">
                {auctions.map(a => (
                  <div key={a.auction_id} className="py-3 border-b border-gray-50 last:border-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{a.groups?.group_name} — Month {a.month_no}</p>
                        <p className="text-xs text-gray-500">{formatDate(a.auction_date)}</p>
                        <p className="text-xs text-gray-500">Bid: {formatCurrency(a.bid_amount)} | Deduction: {formatCurrency(a.deduction_amount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600 text-sm">{formatCurrency(a.net_payout)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${a.payout_status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {a.payout_status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
