'use client'

import { NAV_CONFIG } from './nav-config'
import { SidebarSection } from './SidebarSection'
import { SidebarRecents } from './SidebarRecents'
import { isAdmin, isSuper } from '@/lib/auth'
import type { AuthPayload } from '@/lib/auth'

type Props = {
  user:      AuthPayload | null
  collapsed: boolean
}

export function SidebarNav({ user, collapsed }: Props) {
  const visibleSections = NAV_CONFIG.filter(section => {
    if (section.role === 'super') return isSuper(user)
    if (section.role === 'admin') return isAdmin(user)
    return true
  }).map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (item.role === 'super') return isSuper(user)
      if (item.role === 'admin') return isAdmin(user)
      return true
    }),
  })).filter(section => section.items.length > 0)

  return (
    <nav
      aria-label="Main navigation"
      className="flex-1 px-1.5 py-2 overflow-y-auto overflow-x-hidden"
    >
      {visibleSections.map(section => (
        <SidebarSection
          key={section.id}
          section={section}
          collapsed={collapsed}
        />
      ))}

      <div className="mt-1 border-t border-[hsl(var(--sidebar-border))] pt-1">
        <SidebarRecents collapsed={collapsed} />
      </div>
    </nav>
  )
}
