'use client'

import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type MetricVariant = 'default' | 'warn' | 'success' | 'info' | 'destructive'

interface MetricCardProps {
  label: string
  value: string | number | undefined
  subValue?: string
  icon: React.ElementType
  variant?: MetricVariant
  className?: string
}

export function MetricCard({
  label,
  value,
  subValue,
  icon: Icon,
  variant = 'default',
  className,
}: MetricCardProps) {
  const styles = {
    default: 'bg-card border-border',
    warn:    'bg-amber-500/[0.03] border-amber-500/20 text-amber-600 dark:text-amber-400',
    success: 'bg-green-500/[0.03] border-green-500/20 text-green-600 dark:text-green-400',
    info:    'bg-blue-500/[0.03] border-blue-500/20 text-blue-600 dark:text-blue-400',
    destructive: 'bg-destructive/[0.03] border-destructive/20 text-destructive',
  }

  return (
    <div
      className={cn(
        'flex items-center gap-4 px-5 py-4 rounded-2xl border shadow-sm transition-all hover:shadow-md',
        styles[variant],
        className
      )}
    >
      <div
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm',
          variant === 'default' ? 'bg-muted/50 text-muted-foreground' : 'bg-current/10'
        )}
      >
        <Icon size={22} strokeWidth={2.5} />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 truncate text-muted-foreground">
          {label}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-black tabular-nums tracking-tight text-foreground">
            {value === undefined ? (
              <Skeleton className="h-6 w-24 rounded mt-1" />
            ) : (
              value
            )}
          </span>
          {subValue && (
            <span className="text-[10px] font-bold opacity-40 truncate">
              {subValue}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
