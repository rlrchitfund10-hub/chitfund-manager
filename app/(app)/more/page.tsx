import Link from 'next/link'

const moreItems = [
  { href: '/auctions', icon: '🔨', label: 'Record Auction', desc: 'Record monthly auction result' },
  { href: '/overdue', icon: '⚠️', label: 'Overdue List', desc: 'Members with pending dues' },
  { href: '/float', icon: '💼', label: 'Admin Float', desc: 'Track advance payments to winners' },
  { href: '/history', icon: '📜', label: 'Payment History', desc: 'All recorded payments' },
]

export default function MorePage() {
  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-bold text-gray-800 mb-4">More Options</h2>
      {moreItems.map(item => (
        <Link key={item.href} href={item.href}>
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 active:scale-95 transition-transform">
            <span className="text-3xl">{item.icon}</span>
            <div>
              <p className="font-semibold text-gray-800">{item.label}</p>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </div>
            <span className="ml-auto text-gray-300">›</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
