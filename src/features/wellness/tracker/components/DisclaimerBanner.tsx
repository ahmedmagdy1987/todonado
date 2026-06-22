import { ShieldAlert } from 'lucide-react'

/**
 * Persistent, non-dismissible legal disclaimer for the tracker. This product is
 * a personal log only — no medical advice, no drug data, no dosing guidance.
 */
export function DisclaimerBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-warning"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="text-xs leading-relaxed">
        This is a personal tracker, not medical advice. Always consult a qualified healthcare
        professional.
      </p>
    </div>
  )
}
