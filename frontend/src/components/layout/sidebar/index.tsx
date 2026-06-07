'use client'

import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useSidebarState } from '@/hooks/useSidebarState'
import { SidebarWorkspaceSwitcher } from './SidebarWorkspaceSwitcher'
import { SidebarNav } from './SidebarNav'
import { SidebarFooter } from './SidebarFooter'

export function Sidebar() {
  const { user, logout } = useAuth()
  const { collapsed, toggle } = useSidebarState()

  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={0}>
      <aside
        aria-label="Application sidebar"
        className={cn(
          'flex flex-col h-screen shrink-0 overflow-hidden',
          'bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))]',
          'transition-[width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          'motion-reduce:transition-none',
          collapsed ? 'w-[52px]' : 'w-[220px]',
        )}
      >
        <SidebarWorkspaceSwitcher
          user={user}
          collapsed={collapsed}
          onToggle={toggle}
        />

        <SidebarNav user={user} collapsed={collapsed} />

        <SidebarFooter
          user={user}
          collapsed={collapsed}
          onLogout={logout}
        />
      </aside>
    </Tooltip.Provider>
  )
}

export default Sidebar
