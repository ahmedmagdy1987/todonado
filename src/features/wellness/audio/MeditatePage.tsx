import { Flower2 } from 'lucide-react'
import { AudioSection } from './AudioSection'
import { tracksByCategory } from './tracks'

/** Guided meditation — short audio sessions (same reusable player as Sleep sounds). */
export function MeditatePage() {
  return (
    <AudioSection
      icon={Flower2}
      title="Guided meditation"
      subtitle="Short guided sessions to start or close out your day."
      intro="Sessions are added as they're recorded and licensed — anything without audio yet shows “coming soon.” A gentle pause, never a lecture."
      tracks={tracksByCategory('meditation')}
    />
  )
}
