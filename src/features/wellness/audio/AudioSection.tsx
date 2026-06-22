import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Flower2, Play, Waves, type LucideIcon } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { AudioPlayer } from './AudioPlayer'
import { resolveTrackSrc, type AudioTrack } from './tracks'

function rowIcon(track: AudioTrack): LucideIcon {
  return track.category === 'meditation' ? Flower2 : Waves
}

function TrackRow({
  track,
  active,
  onActivate,
  onStop,
}: {
  track: AudioTrack
  active: boolean
  onActivate: () => void
  onStop: () => void
}) {
  const available = resolveTrackSrc(track) !== null
  const Icon = rowIcon(track)

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold">{track.title}</h3>
            <p className="text-sm text-text-muted">{track.description}</p>
          </div>
          {available ? (
            !active && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onActivate}
                aria-label={`Play ${track.title}`}
              >
                <Play className="h-4 w-4" aria-hidden /> Play
              </Button>
            )
          ) : (
            <Badge variant="outline">Audio coming soon</Badge>
          )}
        </div>

        {available && active && <AudioPlayer key={track.id} track={track} onStop={onStop} />}
      </CardContent>
    </Card>
  )
}

/**
 * Shared layout for an audio sub-section (Sleep sounds / Guided meditation):
 * a back link, header, intro, and a track list where exactly one track can be
 * active (its player mounted) at a time.
 */
export function AudioSection({
  icon: Icon,
  title,
  subtitle,
  intro,
  tracks,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  intro: string
  tracks: AudioTrack[]
}) {
  const [activeId, setActiveId] = useState<string | null>(null)

  return (
    <div className="animate-fade-in space-y-8">
      <header className="space-y-3">
        <Link
          to="/wellness"
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Focus &amp; Calm
        </Link>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <p className="text-sm text-text-muted">{subtitle}</p>
          </div>
        </div>
      </header>

      <p className="text-sm text-text-muted">{intro}</p>

      <div className="space-y-3">
        {tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            active={activeId === t.id}
            onActivate={() => setActiveId(t.id)}
            onStop={() => setActiveId(null)}
          />
        ))}
      </div>
    </div>
  )
}
