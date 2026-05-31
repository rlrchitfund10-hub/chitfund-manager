'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard', icon: '🏠', label: 'Home' },
  { href: '/payments', icon: '💳', label: 'Payment' },
  { href: '/members', icon: '👥', label: 'Members' },
  { href: '/groups', icon: '📋', label: 'Groups' },
  { href: '/more', icon: '⋯', label: 'More' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-100">
      {/* Top Header */}
      <header className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xl">💰</span>
          <span className="font-bold text-lg">ChitFund Manager</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-indigo-200 hover:text-white text-sm"
        >
          Logout
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-20 overflow-y-auto">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 shadow-lg">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive =
              item.href === '/more'
                ? ['/auctions', '/overdue', '/more'].some(p => pathname.startsWith(p))
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center py-2 px-3 flex-1 transition-colors ${
                  isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className={`text-[10px] font-medium mt-0.5 ${isActive ? 'text-indigo-600' : ''}`}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
