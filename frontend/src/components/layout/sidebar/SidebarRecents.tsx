'use client'

import Link from 'next/link'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRecentItems } from '@/hooks/useRecentItems'

export function SidebarRecents({ collapsed }: { collapsed: boolean }) {
  const recents = useRecentItems()

  // In collapsed mode, hide recents — too cluttered with icon-only clock items
  if (collapsed || recents.length === 0) return null

  const shown = recents.slice(0, 3)

  return (
    <div className="mt-1 mb-1">
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-[hsl(var(--nav-section-label))] select-none">
        Recent
      </p>
      <ul role="list" className="space-y-[1px]">
        {shown.map(item => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-label={item.label}
              className={cn(
                'flex items-center gap-2.5 px-3 py-[6px] rounded-md text-[12px] font-medium',
                'text-[hsl(var(--nav-section-label))]',
                'transition-[background-color,color] duration-[120ms]',
                '[@media(hover:hover)]:hover:bg-[hsl(var(--nav-hover-bg))]',
                '[@media(hover:hover)]:hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-1',
              )}
            >
              <Clock size={13} className="shrink-0 opacity-50" />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
