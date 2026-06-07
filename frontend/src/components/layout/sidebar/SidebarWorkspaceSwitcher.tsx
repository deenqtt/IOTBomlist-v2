'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTheme } from 'next-themes'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'
import type { AuthPayload } from '@/lib/auth'

const tooltipClass = cn(
  'z-50 px-2.5 py-1.5 text-xs font-medium rounded-md select-none',
  'bg-popover text-popover-foreground border border-border shadow-md origin-left',
  'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
  'data-[state=closed]:duration-75 motion-reduce:animate-none',
)

function AppIcon({ size = 28 }: { size?: number }) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const src = !mounted ? '/icon/icon_dark.svg'
    : resolvedTheme === 'dark' ? '/icon/icon_light.svg' : '/icon/icon_dark.svg'
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="IOT BOM List"
      width={size}
      height={size}
      className="shrink-0 select-none"
      draggable={false}
    />
  )
}

type Props = {
  user:      AuthPayload | null
  collapsed: boolean
  onToggle:  () => void
}

export function SidebarWorkspaceSwitcher({ user, collapsed, onToggle }: Props) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 px-1.5 pt-3 pb-2 border-b border-[hsl(var(--sidebar-border))]">
        <AppIcon size={32} />
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={onToggle}
              aria-label="Expand sidebar"
              aria-expanded={false}
              className={cn(
                'flex items-center justify-center w-8 h-7 rounded-md',
                'text-[hsl(var(--nav-section-label))]',
                '[@media(hover:hover)]:hover:bg-[hsl(var(--nav-hover-bg))] [@media(hover:hover)]:hover:text-foreground',
                'active:scale-[0.92] transition-[transform,background-color,color] duration-150',
                'motion-reduce:transition-none motion-reduce:active:scale-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
              )}
            >
              <ChevronRight size={14} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="right" sideOffset={10} className={tooltipClass}>
              Expand sidebar
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-[hsl(var(--sidebar-border))]">
      <AppIcon size={28} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-tight truncate text-[hsl(var(--sidebar-foreground))]">
          IOT BOM List
        </p>
        <p className="text-[11px] text-[hsl(var(--nav-section-label))] truncate mt-[1px] capitalize">
          {user?.username} · {user?.role}
        </p>
      </div>
      <button
        onClick={onToggle}
        aria-label="Collapse sidebar"
        aria-expanded={true}
        className={cn(
          'flex items-center justify-center w-6 h-6 rounded-md shrink-0',
          'text-[hsl(var(--nav-section-label))]',
          '[@media(hover:hover)]:hover:bg-[hsl(var(--nav-hover-bg))] [@media(hover:hover)]:hover:text-foreground',
          'active:scale-[0.92] transition-[transform,background-color,color] duration-150',
          'motion-reduce:transition-none motion-reduce:active:scale-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
        )}
      >
        <ChevronLeft size={14} />
      </button>
    </div>
  )
}
