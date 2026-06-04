import { Plus } from 'lucide-react'

/**
 * Floating add-task button for mobile — bottom-right, lifted above the fixed
 * bottom nav and the home-indicator safe area. Desktop uses the top-bar
 * "Add task" button instead, so this is hidden from md up.
 */
export function AddTaskFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add task"
      className="focus-ring fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-brand-glow ring-4 ring-background transition-transform active:scale-95 md:hidden"
    >
      <Plus className="h-6 w-6" aria-hidden />
    </button>
  )
}
