import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-10 rounded-xl border border-white/10 bg-surface-2/60 px-3.5 text-sm text-text-primary',
        // `cn()` is a plain joiner, not tailwind-merge, and `.w-full` is emitted
        // AFTER `.w-56` in the built stylesheet — so a width passed by a caller
        // was silently dead everywhere. Only default to full width when the
        // caller has not asked for one.
        !/(?:^|\s)(?:w-|max-w-|min-w-)/.test(className ?? '') && 'w-full',
        'placeholder:text-text-muted/70 transition-colors',
        'focus-ring focus-visible:border-brand/60',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
