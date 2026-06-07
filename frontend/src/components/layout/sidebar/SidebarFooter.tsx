'use client'

import { LogOut, Sun, Moon, Monitor } from 'lucide-react'
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

const themeOptions = [
  { value: 'light',  icon: Sun,     label: 'Light'  },
  { value: 'dark',   icon: Moon,    label: 'Dark'   },
  { value: 'system', icon: Monitor, label: 'System' },
] as const

const themeIconMap = { light: Sun, dark: Moon, system: Monitor }

type Props = {
  user:      AuthPayload | null
  collapsed: boolean
  onLogout:  () => void
}

export function SidebarFooter({ user, collapsed, onLogout }: Props) {
  const { theme, setTheme } = useTheme()

  const CurrentIcon = themeIconMap[(theme as keyof typeof themeIconMap) ?? 'system'] ?? Monitor

  function cycleTheme() {
    const order = themeOptions.map(t => t.value)
    const idx   = order.indexOf(theme as 'light' | 'dark' | 'system')
    setTheme(order[(idx + 1) % order.length])
  }

  return (
    <div className="border-t border-[hsl(var(--sidebar-border))] px-2 py-2.5 space-y-1">
      {/* Theme toggle */}
      {collapsed ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={cycleTheme}
              aria-label={`Theme: ${theme}. Click to cycle.`}
              className={cn(
                'flex w-full items-center justify-center py-2 rounded-md',
                'text-[hsl(var(--nav-section-label))]',
                '[@media(hover:hover)]:hover:bg-[hsl(var(--nav-hover-bg))] [@media(hover:hover)]:hover:text-foreground',
                'active:scale-[0.92] transition-[transform,background-color,color] duration-150',
                'motion-reduce:transition-none motion-reduce:active:scale-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
              )}
            >
              <CurrentIcon size={15} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="right" sideOffset={10} className={tooltipClass}>
              Theme: <span className="capitalize">{theme}</span>
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        <div
          role="group"
          aria-label="Theme toggle"
          className="flex items-center gap-0.5 p-1 rounded-lg bg-[hsl(var(--search-bg))] border border-[hsl(var(--search-border))]"
        >
          {themeOptions.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              aria-label={`${label} theme`}
              aria-pressed={theme === value}
              suppressHydrationWarning
              className={cn(
                'flex flex-1 items-center justify-center py-1.5 rounded-md',
                'transition-[background-color,color,box-shadow] duration-150',
                'active:scale-[0.92] motion-reduce:active:scale-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                theme === value
                  ? 'bg-background text-foreground shadow-sm'
                  : [
                      'text-[hsl(var(--nav-section-label))]',
                      '[@media(hover:hover)]:hover:text-foreground',
                    ],
              )}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
      )}

      {/* User row + logout */}
      {collapsed ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={onLogout}
              aria-label="Logout"
              className={cn(
                'flex w-full items-center justify-center py-2 rounded-md',
                'text-[hsl(var(--nav-section-label))]',
                '[@media(hover:hover)]:hover:bg-[hsl(var(--nav-hover-bg))] [@media(hover:hover)]:hover:text-destructive',
                'active:scale-[0.92] transition-[transform,background-color,color] duration-150',
                'motion-reduce:transition-none motion-reduce:active:scale-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
              )}
            >
              <LogOut size={15} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="right" sideOffset={10} className={tooltipClass}>
              Logout
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        <div className="flex items-center gap-2 px-1 py-1">
          {/* Avatar */}
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[hsl(var(--nav-active-indicator))] text-white text-[10px] font-bold shrink-0 select-none uppercase">
            {user?.username?.[0] ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold leading-tight truncate text-[hsl(var(--sidebar-foreground))]">
              {user?.username}
            </p>
            <p className="text-[10px] text-[hsl(var(--nav-section-label))] capitalize truncate">
              {user?.role}
            </p>
          </div>
          <button
            onClick={onLogout}
            aria-label="Logout"
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded-md shrink-0',
              'text-[hsl(var(--nav-section-label))]',
              '[@media(hover:hover)]:hover:bg-[hsl(var(--nav-hover-bg))] [@media(hover:hover)]:hover:text-destructive',
              'active:scale-[0.92] transition-[transform,background-color,color] duration-150',
              'motion-reduce:transition-none motion-reduce:active:scale-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
            )}
          >
            <LogOut size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
