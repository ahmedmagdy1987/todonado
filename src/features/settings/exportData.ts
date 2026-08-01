import { supabase } from '@/lib/supabase'

/**
 * "Export my data" — and the whole point is that it means ALL of it.
 *
 * This used to fetch six tables. The app had grown to twenty-two, so a user who
 * followed the delete flow's own advice ("export your data from the section
 * above first") and then deleted their account lost their journal, their quit
 * streaks, their wellness log, their vision cards, their mind maps and their
 * challenge history — silently, and permanently, because the file they were
 * holding looked complete.
 *
 * So the list is a MANIFEST, not a hand-written query block, and
 * `exportData.test.ts` reads `supabase/migrations/` and fails if any table
 * created there is neither exported nor listed in EXCLUDED with a reason. A new
 * feature cannot quietly fall out of someone's export again — the test breaks
 * the day the migration lands, which is the day it can still be fixed cheaply.
 *
 * A table that cannot be read (missing on a fresh project, or a policy change)
 * is REPORTED in `incomplete`, never dropped. An export that is missing
 * something must say so on its face; that is the entire lesson above.
 */

/** Tables deliberately NOT exported, and why. Pinned by the test. */
export const EXCLUDED: Record<string, string> = {
  feature_intents:
    'Insert-only fake-door capture with no select policy by design. The client cannot read it back, and it holds no content of yours beyond the fact that you tapped "notify me".',
  upgrade_intents:
    'Insert-only willingness-to-pay capture with no select policy, for the same reason.',
  checkout_attempts:
    'Server-only bookkeeping for in-flight Stripe checkouts. It has no client policy at all, not even select, because it holds Checkout Session ids. It records nothing about you beyond the fact that a purchase was started and how it ended; your actual subscription state is in the billing export.',
}

/** User-scoped tables: RLS already narrows `select *` to the owner. */
const USER_SCOPED = [
  'billing',
  'calendar_sources',
  'journal_entries',
  'mind_maps',
  'quit_habits',
  'quit_checkins',
  'user_challenges',
  'user_templates',
  'vision_cards',
  'wellness_items',
  'wellness_logs',
] as const

/** Workspace-scoped tables, filtered to the workspace being exported. */
const WORKSPACE_SCOPED = ['projects', 'tasks', 'focus_sessions', 'events', 'workspace_members'] as const

/** Everything the manifest covers — the test compares this against the migrations. */
export const EXPORTED_TABLES: string[] = [
  'profiles',
  'workspaces',
  'sections',
  'subtasks',
  ...WORKSPACE_SCOPED,
  ...USER_SCOPED,
]

interface Fetched {
  rows: unknown[]
  /** Set when the table could not be read — surfaced, never swallowed. */
  problem?: string
}

async function fetchAll(
  table: string,
  narrow?: (q: ReturnType<ReturnType<typeof supabase.from>['select']>) => unknown,
): Promise<Fetched> {
  try {
    const base = supabase.from(table).select('*')
    const { data, error } = await (narrow ? (narrow(base) as typeof base) : base)
    if (error) return { rows: [], problem: error.message }
    return { rows: data ?? [] }
  } catch (e) {
    return { rows: [], problem: e instanceof Error ? e.message : 'unknown error' }
  }
}

/** Gather everything the signed-in user owns into one object. */
export async function gatherExport(workspaceId: string): Promise<Record<string, unknown>> {
  const results = new Map<string, Fetched>()

  const singles = await Promise.all([
    fetchAll('profiles'),
    fetchAll('workspaces', (q) => q.eq('id', workspaceId)),
    ...WORKSPACE_SCOPED.map((t) => fetchAll(t, (q) => q.eq('workspace_id', workspaceId))),
    ...USER_SCOPED.map((t) => fetchAll(t)),
  ])

  const order = ['profiles', 'workspaces', ...WORKSPACE_SCOPED, ...USER_SCOPED]
  order.forEach((table, i) => results.set(table, singles[i]))

  // sections hang off projects, subtasks off tasks — fetched once the ids are known.
  const projectIds = (results.get('projects')?.rows ?? []).map((p) => (p as { id: string }).id)
  const taskIds = (results.get('tasks')?.rows ?? []).map((t) => (t as { id: string }).id)

  const [sections, subtasks] = await Promise.all([
    projectIds.length ? fetchAll('sections', (q) => q.in('project_id', projectIds)) : { rows: [] },
    taskIds.length ? fetchAll('subtasks', (q) => q.in('task_id', taskIds)) : { rows: [] },
  ])
  results.set('sections', sections)
  results.set('subtasks', subtasks)

  const incomplete = [...results.entries()]
    .filter(([, r]) => r.problem)
    .map(([table, r]) => `${table}: ${r.problem}`)

  const journal = results.get('journal_entries')?.rows ?? []
  const recordings = journal.filter((e) => (e as { audio_path?: string | null }).audio_path).length

  const out: Record<string, unknown> = {
    app: 'todonado',
    exported_at: new Date().toISOString(),
    workspace_id: workspaceId,
    /** Stated on the file itself, because a JSON file cannot hold audio. */
    notes: {
      voice_recordings: recordings
        ? `This file lists ${recordings} journal ${recordings === 1 ? 'entry' : 'entries'} with a voice recording. The AUDIO ITSELF IS NOT INCLUDED, only its storage path. Download any recording you want to keep from the journal page before deleting your account.`
        : 'No voice recordings.',
      scope:
        'Workspace-scoped records (projects, tasks, focus sessions, calendar events) cover the workspace named in workspace_id. Everything else is account-wide.',
      excluded: EXCLUDED,
    },
    incomplete: incomplete.length ? incomplete : undefined,
  }

  // profile and workspace are single rows; everything else is a list.
  out.profile = (results.get('profiles')?.rows ?? [])[0] ?? null
  out.workspace = (results.get('workspaces')?.rows ?? [])[0] ?? null
  for (const table of EXPORTED_TABLES) {
    if (table === 'profiles' || table === 'workspaces') continue
    out[table] = results.get(table)?.rows ?? []
  }

  return out
}

/** Trigger a browser download of `data` as pretty-printed JSON. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
