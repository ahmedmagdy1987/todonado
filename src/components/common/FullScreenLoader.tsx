import { Loader2 } from 'lucide-react'

export function FullScreenLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background text-text-muted">
      <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  )
}
