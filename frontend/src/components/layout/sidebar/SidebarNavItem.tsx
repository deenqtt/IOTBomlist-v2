'use client'

import Link from 'next/link'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'
import type { NavItemConfig } from './nav-config'

const tooltipClass = cn(
  'z-50 px-2.5 py-1.5 select-none',
  'text-xs font-medium rounded-md',
  'bg-popover text-popover-foreground border border-border shadow-md',
  'origin-left',
  'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
  'data-[state=closed]:duration-75',
  'motion-reduce:animate-none',
)

type Props = {
  item:      NavItemConfig
  active:    boolean
  collapsed: boolean
  badge?:    number
}

export function SidebarNavItem({ item, active, collapsed, badge }: Props) {
  const { href, label, icon: Icon } = item

  const link = (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={cn(
        'group flex items-center gap-2.5 rounded-md text-sm',
        'transition-[background-color,color,box-shadow] duration-[120ms]',
        'active:scale-[0.97] motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-1',
        collapsed ? 'justify-center px-0 py-2 w-full' : 'px-3 py-[7px]',
        active
          ? [
              'font-semibold',
              'text-[hsl(var(--nav-active-text))]',
              'bg-[hsl(var(--nav-active-bg))]',
              'shadow-[inset_2px_0_0_0_hsl(var(--nav-active-indicator))]',
            ]
          : [
              'font-medium text-[hsl(var(--nav-section-label))]',
              '[@media(hover:hover)]:hover:bg-[hsl(var(--nav-hover-bg))]',
              '[@media(hover:hover)]:hover:text-foreground',
            ],
      )}
    >
      <Icon
        size={16}
        className={cn(
          'shrink-0 transition-colors duration-[120ms]',
          active
            ? 'text-[hsl(var(--nav-active-indicator))]'
            : 'text-[hsl(var(--nav-section-label))] group-hover:text-foreground',
        )}
      />
      <span
        className={cn(
          'flex-1 truncate transition-[opacity,max-width] duration-150',
          'ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
          collapsed ? 'opacity-0 max-w-0 overflow-hidden' : 'opacity-100 max-w-full',
        )}
      >
        {label}
      </span>
      {!collapsed && badge != null && badge > 0 && (
        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--nav-active-indicator))] px-1 text-[10px] font-semibold tabular-nums text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={10} className={tooltipClass}>
          <span className="flex items-center gap-2">
            {label}
            {badge != null && badge > 0 && (
              <span className="rounded-full bg-[hsl(var(--nav-active-indicator))] px-1 text-[10px] font-semibold text-white">
                {badge}
              </span>
            )}
          </span>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
