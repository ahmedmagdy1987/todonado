import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { Card, CardContent } from '@/components/ui'
import { InterestChip } from '@/components/common/InterestChip'
import { cn } from '@/lib/utils'
import { hubTiles, type HubTile } from './hubTiles'

/**
 * The Hub — every door in one place.
 *
 * ADDITIVE, NEVER A REPLACEMENT. Today is still the default screen after login,
 * every destination here is still reachable the way it always was, and the nav
 * is unchanged apart from one new entry. Switching your start screen to the Hub
 * is a preference in Settings, not something the app decides for you — the
 * first-run flow that is known to work is left exactly as it is.
 *
 * The tiles are big on purpose. This is the surface you open when you know you
 * want to *do* something and not which part of the app does it, which is a
 * one-handed, half-attention moment — so: large targets, a visible press state,
 * and two-word labels rather than sentences to read.
 */
export function HubPage() {
  const tiles = useMemo(() => hubTiles(), [])
  const [openSoon, setOpenSoon] = useState<string | null>(null)

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <LayoutGrid className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Hub</h2>
          <p className="text-sm text-text-muted">
            Your day, your focus, your habits — one place to start from.
          </p>
        </div>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.id}>
            {tile.to ? (
              <TileLink tile={tile} />
            ) : (
              <TileButton tile={tile} onClick={() => setOpenSoon(tile.id)} />
            )}
          </li>
        ))}
      </ul>

      {tiles
        .filter((t) => t.intentKey && openSoon === t.id)
        .map((tile) => (
          <Card key={tile.id}>
            <CardContent className="space-y-3">
              <h3 className="font-display text-base font-semibold">{tile.label}</h3>
              <p className="text-sm leading-relaxed text-text-muted">{tile.soonReason}</p>
              <InterestChip
                featureKey={tile.intentKey!}
                source="hub"
                label={`I’d want ${tile.label.toLowerCase()}`}
              />
            </CardContent>
          </Card>
        ))}
    </div>
  )
}

/** Shared face, so a live tile and a not-built tile are the same object visually. */
function TileFace({ tile, muted }: { tile: HubTile; muted?: boolean }) {
  const Icon = tile.icon
  return (
    <>
      <span
        className={cn(
          'inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-colors',
          muted ? 'bg-surface-2 text-text-muted' : 'bg-brand-gradient-soft text-brand',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="mt-3 block font-display text-sm font-semibold leading-snug sm:text-base">
        {tile.label}
      </span>
      <span className="mt-0.5 block text-xs leading-snug text-text-muted">{tile.hint}</span>
    </>
  )
}

const TILE_CLASS =
  'focus-ring flex h-full w-full flex-col rounded-2xl border border-white/5 bg-surface/60 p-4 text-left ' +
  // The press state is the point on a touch device: a real, immediate response
  // rather than a hover style nobody on a phone will ever see.
  'transition-all duration-150 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-surface-2/50 ' +
  'active:translate-y-0 active:scale-[0.98] active:bg-surface-2/70 sm:p-5'

function TileLink({ tile }: { tile: HubTile }) {
  return (
    <Link to={tile.to!} className={TILE_CLASS} aria-label={`${tile.label} — ${tile.hint}`}>
      <TileFace tile={tile} />
    </Link>
  )
}

function TileButton({ tile, onClick }: { tile: HubTile; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={TILE_CLASS}
      aria-label={`${tile.label} — ${tile.hint}`}
    >
      <TileFace tile={tile} muted />
    </button>
  )
}
