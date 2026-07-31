import { LifeBuoy } from 'lucide-react'

/**
 * Persistent, non-dismissible note for the quit tracker. Sibling to the
 * tracker's DisclaimerBanner and there for the same reason: this app counts
 * days, it does not treat anything.
 *
 * Deliberately NOT styled as a warning. The tracker's medical disclaimer uses
 * the amber warning tone because it is guarding against a user mistaking a
 * personal log for dosing advice. This one is addressed to someone who may be
 * having a hard time, so it is calm and neutral — an alarm-coloured banner at
 * the top of a page about quitting would read as a judgement.
 *
 * No helpline numbers: they are country-specific and we cannot know the user's
 * country, and a wrong or dead number would be worse than none.
 */
export function SupportNote() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border border-white/10 bg-surface-2/40 p-3 text-text-muted"
    >
      <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="text-xs leading-relaxed">
        If you&rsquo;re struggling with addiction, professional support helps. This is a personal
        tracker, not treatment.
      </p>
    </div>
  )
}
