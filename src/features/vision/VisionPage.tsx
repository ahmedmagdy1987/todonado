import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass, Network, Plus, Sparkles } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'
import { InterestChip } from '@/components/common/InterestChip'
import { SortableList } from '@/components/common/SortableList'
import { useAuth } from '@/features/auth/auth-context'
import { usePlan } from '@/features/billing/usePlan'
import { useProjects } from '@/features/projects/api/useProjects'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { captureUpgradeIntent } from '@/features/marketing/api/upgradeIntents'
import { FEATURES, FREE_VISION_CARDS } from '@/lib/config'
import { todayISO } from '@/lib/date'
import { newPositionForMove } from '@/lib/reorder'
import type { VisionCard } from '@/types/database'
import { useVisionCards, useVisionMutations } from './api/useVision'
import {
  linkedProject,
  nextVisionPosition,
  sortVisionCards,
} from './vision'
import { VisionCardDialog } from './components/VisionCardDialog'
import { VisionCardItem } from './components/VisionCardItem'
import { capDecision } from '@/features/billing/gate'

/**
 * Vision — the goals behind the work.
 *
 * Tasks are what you do today; projects are how work is grouped. Neither records
 * WHY, and that is the gap this fills. The one thing that makes it more than a
 * mood board is the project link: "this project serves this goal" turns a
 * sentence into something the rest of the app can point at.
 *
 * TEXT-FIRST, DELIBERATELY. No image uploads — see the migration header. The
 * honest way to decide whether pictures are wanted is to ask, so there is one
 * chip at the bottom that records exactly that and promises nothing.
 */
export function VisionPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { isPro, billingLoading } = usePlan()
  const { workspaceId } = useWorkspace()
  const { data: projects = [] } = useProjects(workspaceId)

  const { data, isPending } = useVisionCards(userId)
  const { createCard, updateCard, reorderCard, deleteCard } = useVisionMutations(userId)

  const rows = useMemo(() => data?.rows ?? [], [data])
  const cards = useMemo(() => sortVisionCards(rows), [rows])
  /** False ONLY when the table is absent (migration pending). */
  const available = data?.available ?? true

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<VisionCard | null>(null)
  const [showLimit, setShowLimit] = useState(false)

  const today = todayISO()
  // An in-flight create occupies a slot: `createCard` is awaited (not optimistic,
  // see the hook), so for one round trip `cards` does not include it yet, and the
  // Free cap is client-side only. Without this a fast second tap could add a
  // fourth goal past a three-goal limit.
  const pendingCreate = createCard.isPending ? 1 : 0
  // Until the list has loaded the count is zero and the cap looks satisfied, so
  // a tap during load would add a fourth goal to a three-goal plan. Found on
  // Mind maps once its migration was applied; this is the identical shape, and
  // the Add button is likewise rendered outside the loading branch. The PLAN is
  // the other half of the same question — see src/features/billing/gate.ts.
  const decision = capDecision({
    planKnown: !billingLoading,
    countKnown: !isPending,
    isPro,
    count: cards.length + pendingCreate,
    limit: FREE_VISION_CARDS,
  })
  const ready = decision !== 'unknown'

  function openAdd() {
    if (!ready) return
    if (decision === 'capped') {
      // A card in the flow, never a modal — and the editor must not open behind it.
      setShowLimit(true)
      return
    }
    setShowLimit(false)
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(card: VisionCard) {
    setEditing(card)
    setDialogOpen(true)
  }

  function save(draft: {
    title: string
    why: string | null
    target_date: string | null
    project_id: string | null
  }) {
    if (editing) {
      updateCard.mutate({ id: editing.id, patch: draft })
      return
    }
    createCard.mutate({ ...draft, position: nextVisionPosition(cards) })
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
            <Compass className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">Vision</h2>
            <p className="text-sm text-text-muted">
              What you&rsquo;re working toward, and why — the part a task list never asks.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Maps live beside goals rather than in the nav: a mind map is how a
              goal usually starts, and burying it a level deeper is what stops
              anyone finding it. */}
          {FEATURES.mindMaps && (
            <Link
              to="/vision/maps"
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-medium text-text-primary hover:bg-surface-2/60"
            >
              <Network className="h-4 w-4" aria-hidden /> Mind maps
            </Link>
          )}
          {available && (
            <Button onClick={openAdd} disabled={!ready}>
              <Plus className="h-4 w-4" aria-hidden /> Add goal
            </Button>
          )}
        </div>
      </header>

      {showLimit && decision === 'capped' && <VisionLimitUpsell limit={FREE_VISION_CARDS} />}

      {!available ? (
        <NotSwitchedOnCard />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl border border-white/5 bg-surface-2/40"
            />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
              <Compass className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold">Nothing here yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-text-muted">
                Write down one thing you actually want, and the reason behind it. You can link the
                project that serves it later.
              </p>
            </div>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" aria-hidden /> Add your first goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <SortableList
          ids={cards.map((c) => c.id)}
          onReorder={(ordered, activeId) => {
            // ONE row, ONE fractional position — the same contract every other
            // sortable list in the app uses. No reindex, no batch write.
            const positionById = new Map(cards.map((c) => [c.id, c.position]))
            reorderCard.mutate({
              id: activeId,
              position: newPositionForMove(ordered, activeId, positionById),
            })
          }}
          className="space-y-3"
        >
          {(id) => {
            const card = cards.find((c) => c.id === id)
            if (!card) return null
            return (
              <VisionCardItem
                card={card}
                project={linkedProject(card, projects)}
                today={today}
                onEdit={() => openEdit(card)}
                onDelete={() => deleteCard.mutate(card.id)}
              />
            )
          }}
        </SortableList>
      )}

      {available && (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-white/5 bg-surface-2/30 p-4">
          <p className="text-sm font-medium text-text-primary">Would you want picture boards?</p>
          <p className="text-xs leading-relaxed text-text-muted">
            This page is text on purpose — images need somewhere to store them, size limits and a
            bill, and we&rsquo;d rather know it&rsquo;s wanted before building all that. One tap
            registers a vote; nothing else happens.
          </p>
          <InterestChip
            featureKey="vision_images"
            source="vision"
            label="I’d want image boards"
            className="mt-1"
          />
        </div>
      )}

      <VisionCardDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        card={editing}
        projects={projects}
        onSave={save}
      />
    </div>
  )
}

/** Shown when a Free user at the limit tries to add another goal. */
function VisionLimitUpsell({ limit }: { limit: number }) {
  const { user } = useAuth()

  function recordIntent() {
    void captureUpgradeIntent({
      tier: 'pro',
      userId: user?.id ?? null,
      email: user?.email ?? null,
      source: 'vision_limit',
    }).catch(() => {
      /* signal only — never block the click */
    })
  }

  return (
    <div
      role="note"
      aria-label="Vision card limit reached"
      className="rounded-2xl border border-brand/25 bg-brand-gradient-soft p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {limit} goals on Free — Pro keeps it unlimited
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Everything you&rsquo;ve already written stays exactly where it is, editable and linked;
            this only limits adding another.{' '}
            <Link
              to="/settings/plan"
              onClick={recordIntent}
              className="focus-ring rounded text-accent underline-offset-4 hover:underline"
            >
              Upgrade
            </Link>{' '}
            for as many as you need.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * The honest state when `vision_cards` does not exist. The migration is applied
 * (CLAUDE.md §7), so this is DORMANT rather than dead — kept as the safe default
 * for a fresh Supabase project or a half-applied push.
 */
function NotSwitchedOnCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <h3 className="font-display text-lg font-semibold">Not switched on yet</h3>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-text-muted">
          Vision is built and waiting on its database migration. Nothing is missing from your
          account — this page will start working the moment the migration is applied.
        </p>
      </CardContent>
    </Card>
  )
}
