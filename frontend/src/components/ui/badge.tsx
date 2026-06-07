import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variant === 'default' && 'bg-primary text-primary-foreground',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground',
        variant === 'destructive' && 'bg-destructive text-destructive-foreground',
        variant === 'outline' && 'border border-border text-foreground',
        className
      )}
      {...props}
    />
  )
}
