import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Flower2, Play, Waves, type LucideIcon } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { useEntitlements } from '@/features/billing/useEntitlements'
import { SLEEP_NOISE_REQUIRES_PRO } from '@/lib/config'
import { AudioPlayer } from './AudioPlayer'
import { isGenerated, isTrackPlayable, type AudioTrack } from './tracks'

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
  const { isPro, resolving } = useEntitlements()
  /*
   * A generated track is FREE, and `SLEEP_NOISE_REQUIRES_PRO` in src/lib/config.ts
   * is the only thing that decides it. It is currently false and the packaging
   * review confirmed it should stay false: wind-down tools are not the
   * monetisation surface, and gating breathing or noise to manufacture paid
   * value would read exactly as badly as it sounds.
   *
   * The polarity is still fixed here rather than left alone, because the switch
   * exists and a latent bug behind an off switch is still a bug. While the plan
   * is RESOLVING the row is neither locked nor playable-because-we-assumed-Pro:
   * `locked` stays false so no subscriber sees a paywall flicker, and nothing is
   * given away either, because the flag that would gate it is off.
   */
  const locked =
    SLEEP_NOISE_REQUIRES_PRO && isGenerated(track) && !resolving && !isPro
  const available = isTrackPlayable(track) && !locked
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
          ) : locked ? (
            <Badge variant="brand">Pro</Badge>
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
          className="focus-ring -mx-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm text-text-muted md-fine:mx-0 md-fine:min-h-0 md-fine:px-0 transition-colors hover:text-text-primary"
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
