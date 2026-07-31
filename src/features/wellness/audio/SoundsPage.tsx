import { Moon } from 'lucide-react'
import { AudioSection } from './AudioSection'
import { tracksByCategory } from './tracks'

/** Sleep sounds — ambient soundscapes with loop, volume, and a sleep timer. */
export function SoundsPage() {
  return (
    <AudioSection
      icon={Moon}
      title="Sleep sounds"
      subtitle="Steady sound for winding down."
      intro="White, pink and brown noise are generated on your device, so there is nothing to download and nothing to wait for. Pick one, set a sleep timer, and let it run. Rain, thunder and ocean are recordings we have not licensed yet, so they say so instead of pretending."
      tracks={tracksByCategory('sleep')}
    />
  )
}
