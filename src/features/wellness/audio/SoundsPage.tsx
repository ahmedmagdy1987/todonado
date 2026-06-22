import { Moon } from 'lucide-react'
import { AudioSection } from './AudioSection'
import { tracksByCategory } from './tracks'

/** Sleep sounds — ambient soundscapes with loop, volume, and a sleep timer. */
export function SoundsPage() {
  return (
    <AudioSection
      icon={Moon}
      title="Sleep sounds"
      subtitle="Ambient soundscapes for winding down."
      intro="Pick a sound, set a sleep timer, and let it play. Audio is added as it's licensed — anything without a source yet shows “coming soon.”"
      tracks={tracksByCategory('sleep')}
    />
  )
}
