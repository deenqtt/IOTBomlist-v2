'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarNavItem } from './SidebarNavItem'
import type { NavSectionConfig } from './nav-config'

type Props = {
  section:   NavSectionConfig
  collapsed: boolean
}

export function SidebarSection({ section, collapsed }: Props) {
  const pathname = usePathname()
  const storageKey = `sidebar:section:${section.id}`

  const [sectionCollapsed, setSectionCollapsed] = useState(
    section.defaultCollapsed ?? false
  )

  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored !== null) setSectionCollapsed(stored === 'true')
  }, [storageKey])

  function toggleSection() {
    setSectionCollapsed(v => {
      const next = !v
      localStorage.setItem(storageKey, String(next))
      return next
    })
  }

  const hasActiveItem = section.items.some(
    item => pathname === item.href || pathname.startsWith(item.href + '/')
  )

  return (
    <div className="mb-1">
      {/* Section label — hidden when sidebar is collapsed */}
      {!collapsed && (
        <button
          onClick={toggleSection}
          className={cn(
            'group flex w-full items-center justify-between',
            'px-3 py-1 mb-0.5',
            'text-[10px] font-semibold uppercase tracking-[0.07em]',
            'text-[hsl(var(--nav-section-label))]',
            '[@media(hover:hover)]:hover:text-foreground',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--ring))] rounded',
          )}
        >
          <span>{section.label}</span>
          <ChevronDown
            size={12}
            className={cn(
              'transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
              sectionCollapsed && '-rotate-90',
            )}
          />
        </button>
      )}

      {/* Items */}
      <ul
        role="list"
        aria-label={section.label}
        className={cn(
          'space-y-[1px] overflow-hidden',
          'transition-[max-height,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          'motion-reduce:transition-none',
          !collapsed && sectionCollapsed && !hasActiveItem
            ? 'max-h-0 opacity-0'
            : 'max-h-[600px] opacity-100',
        )}
      >
        {section.items.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <li key={item.href}>
              <SidebarNavItem
                item={item}
                active={active}
                collapsed={collapsed}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
