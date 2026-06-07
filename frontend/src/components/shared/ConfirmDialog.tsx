'use client'

import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  description?: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  confirmText?: string
  cancelText?: string
}

export function ConfirmDialog({ open, title, description, onConfirm, onCancel, loading, confirmText = 'Confirm', cancelText = 'Cancel' }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className={cn(
        'relative bg-card border border-border rounded-xl shadow-2xl',
        'w-full max-w-sm mx-4 p-6',
        'animate-in fade-in-0 zoom-in-95 duration-200',
      )}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={16} className="text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] leading-snug">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className={cn(
              'px-4 py-2 text-sm rounded-md border border-border',
              '[@media(hover:hover)]:hover:bg-accent',
              'active:scale-[0.97] transition-transform duration-100',
            )}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'px-4 py-2 text-sm rounded-md font-medium',
              'bg-destructive text-destructive-foreground',
              '[@media(hover:hover)]:hover:opacity-90',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'active:scale-[0.97] transition-[opacity,transform] duration-100',
            )}
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
