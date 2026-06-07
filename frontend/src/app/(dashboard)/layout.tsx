'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { getUser } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { cn } from '@/lib/utils'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const bp       = useBreakpoint()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const user = getUser()
    if (!user) router.replace('/login')
  }, [router])

  // Close drawer on route change (desktop resize)
  useEffect(() => {
    if (bp !== 'mobile') setDrawerOpen(false)
  }, [bp])

  const isMobile = bp === 'mobile'

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop / Tablet sidebar ──────────────────────── */}
      {!isMobile && <Sidebar />}

      {/* ── Mobile: off-canvas drawer ─────────────────────── */}
      {isMobile && (
        <>
          {/* Backdrop */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* Drawer */}
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-50',
              'transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)]',
              'motion-reduce:transition-none',
              drawerOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <Sidebar />
          </div>
        </>
      )}

      {/* ── Main content ──────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        {isMobile && (
          <header className="flex items-center gap-3 px-4 h-12 border-b border-border bg-[hsl(var(--sidebar))] shrink-0">
            <button
              onClick={() => setDrawerOpen(v => !v)}
              aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={drawerOpen}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-md',
                'text-muted-foreground',
                '[@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-foreground',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              {drawerOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <span className="text-sm font-semibold text-foreground">IOT BOM List</span>
          </header>
        )}

        <main className="flex-1 overflow-y-auto p-6 bg-background">
          {children}
        </main>
      </div>
    </div>
  )
}
