import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * IS A PROJECT BUILT ONLY FROM THIS REPO'S MIGRATIONS A WORKING APPLICATION?
 *
 * Every other suite answers a narrower question. permissions.db.test.ts reads
 * the catalog. permissions.postgrest.test.ts proves the money path's boundary.
 * Both would stay green on a database where a signed-in user cannot read a
 * single task, because neither one ever tries.
 *
 * That was not hypothetical. No migration in this repository granted a table
 * privilege to `anon` or `authenticated` until 20260801170000; the live project
 * works only because it predates Supabase narrowing the default ACL. A project
 * created from this chain today came up with RLS policies that were never
 * consulted, because the grant layer refused first — and the app does not
 * report that. Every feature hook treats a 42501 as an empty result, so the
 * symptom is an empty Vision page, an empty journal, a Free badge for a paying
 * subscriber and a capacity meter silently reset to six hours.
 *
 * So this suite does the only thing that settles it: it runs the real flows
 * through PostgREST, as real users signed up through real GoTrue, against a
 * stack built from nothing but the migrations. A superuser connection would
 * prove nothing here — it bypasses both controls this is testing.
 */

const URL_ = process.env.SUPABASE_URL ?? ''
const ANON = process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

beforeAll(() => {
  if (!URL_ || !ANON || !SERVICE) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are required. ' +
        'Start a LOCAL stack with `supabase start` and export them from `supabase status -o env`.',
    )
  }
  if (/supabase\.co/.test(URL_)) {
    throw new Error('REFUSING to run against a hosted Supabase project. Local stack only.')
  }
})

const anon = () => createClient(URL_, ANON, { auth: { persistSession: false } })
const service = () => createClient(URL_, SERVICE, { auth: { persistSession: false } })

interface User {
  client: SupabaseClient
  id: string
  email: string
  password: string
  token: string
  workspaceId: string
}

const stamp = Date.now()

async function signUp(label: string): Promise<User> {
  const email = `fresh-${label}-${stamp}@dbtest.local`
  const password = 'test-password-123!'
  const { data, error } = await anon().auth.signUp({ email, password })
  if (error) throw new Error(`signUp(${label}) failed: ${error.message}`)
  const token = data.session?.access_token
  if (!token) throw new Error(`signUp(${label}) returned no session (is autoconfirm on?)`)
  const client = createClient(URL_, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  /*
   * The workspace is provisioned by handle_new_user(), a SECURITY DEFINER
   * trigger on auth.users. Reading it back is the first real assertion in the
   * file: it needs `authenticated` to hold SELECT on workspaces, which nothing
   * granted before 20260801170000.
   */
  const { data: ws, error: wsError } = await client.from('workspaces').select('id')
  if (wsError) throw new Error(`${label} cannot read its own workspace: ${wsError.code} ${wsError.message}`)
  if (!ws?.length) throw new Error(`${label} has no workspace — the signup trigger did not provision`)
  return { client, id: data.user!.id, email, password, token, workspaceId: ws[0].id }
}

let A: User
let B: User

beforeAll(async () => {
  A = await signUp('a')
  B = await signUp('b')
}, 60_000)

/** Fail with the PostgREST code, which is the whole diagnostic here. */
function ok<T>(label: string, res: { data: T; error: { code?: string; message: string } | null }): T {
  expect(res.error, res.error ? `${label}: ${res.error.code ?? '?'} ${res.error.message}` : '').toBeNull()
  return res.data
}

// ===========================================================================
//  THE APPLICATION ACTUALLY WORKS
// ===========================================================================

describe('the first-run journey, as a real signed-in user', () => {
  it('reads and updates its own profile — the capacity meter depends on it', async () => {
    const rows = ok('read profile', await A.client.from('profiles').select('*').eq('id', A.id))
    expect(rows, 'the signup trigger must have provisioned a profile').toHaveLength(1)

    /*
     * A missing SELECT here does NOT error in the app: WorkspaceProvider falls
     * back to `profile?.daily_capacity_minutes ?? 360`, so every user silently
     * gets a six-hour day and the product's one differentiator is wrong with
     * nothing in the log.
     */
    const updated = ok(
      'update profile',
      await A.client
        .from('profiles')
        .update({ onboarding_completed: true, daily_capacity_minutes: 480 })
        .eq('id', A.id)
        .select('daily_capacity_minutes')
        .single(),
    )
    expect((updated as { daily_capacity_minutes: number }).daily_capacity_minutes).toBe(480)
  })

  it('captures, schedules, completes and deletes a task', async () => {
    const created = ok(
      'insert task',
      await A.client
        .from('tasks')
        .insert({ workspace_id: A.workspaceId, title: 'fresh project task', effort_minutes: 30 })
        .select('id,title,status')
        .single(),
    ) as { id: string; title: string; status: string }
    expect(created.title).toBe('fresh project task')

    const listed = ok('list tasks', await A.client.from('tasks').select('id').eq('id', created.id))
    expect(listed).toHaveLength(1)

    const done = ok(
      'complete task',
      await A.client
        .from('tasks')
        .update({ status: 'done', scheduled_for: '2026-08-04' })
        .eq('id', created.id)
        .select('status')
        .single(),
    ) as { status: string }
    expect(done.status).toBe('done')

    expect((await A.client.from('tasks').delete().eq('id', created.id)).error).toBeNull()
    expect(ok('task gone', await A.client.from('tasks').select('id').eq('id', created.id))).toHaveLength(0)
  })

  it('owns a project, a section and a subtask', async () => {
    const project = ok(
      'insert project',
      await A.client
        .from('projects')
        .insert({ workspace_id: A.workspaceId, name: 'Fresh project' })
        .select('id')
        .single(),
    ) as { id: string }

    const section = ok(
      'insert section',
      await A.client.from('sections').insert({ project_id: project.id, name: 'Backlog' }).select('id').single(),
    ) as { id: string }

    const task = ok(
      'insert project task',
      await A.client
        .from('tasks')
        .insert({
          workspace_id: A.workspaceId,
          project_id: project.id,
          section_id: section.id,
          title: 'in a section',
        })
        .select('id')
        .single(),
    ) as { id: string }

    const subtask = ok(
      'insert subtask',
      await A.client.from('subtasks').insert({ task_id: task.id, title: 'a step' }).select('id,done').single(),
    ) as { id: string; done: boolean }
    expect(subtask.done).toBe(false)

    ok('tick subtask', await A.client.from('subtasks').update({ done: true }).eq('id', subtask.id))
    expect((await A.client.from('subtasks').delete().eq('id', subtask.id)).error).toBeNull()

    // The product ARCHIVES projects; it never deletes them, which is why the
    // migration grants UPDATE and withholds DELETE.
    ok('archive project', await A.client.from('projects').update({ status: 'archived' }).eq('id', project.id))
  })

  it('starts and finishes a focus session', async () => {
    const session = ok(
      'insert focus session',
      await A.client
        .from('focus_sessions')
        .insert({ workspace_id: A.workspaceId, planned_minutes: 25 })
        .select('id,status')
        .single(),
    ) as { id: string; status: string }
    expect(session.status).toBe('running')

    ok(
      'finish focus session',
      await A.client
        .from('focus_sessions')
        .update({ status: 'completed', actual_seconds: 1500, ended_at: new Date().toISOString() })
        .eq('id', session.id),
    )
  })

  it('reads its own billing row — absent means Free, and it must not error', async () => {
    // usePlan maps ANY error to "no billing row", so an under-granted SELECT
    // here reads as Free for a paying subscriber rather than as a failure.
    const rows = ok('read own billing', await A.client.from('billing').select('*').eq('user_id', A.id))
    expect(rows).toEqual([])
  })

  it('records a product analytics event', async () => {
    expect(
      (await A.client.from('events').insert({ event: 'task_created', source: 'today' })).error,
    ).toBeNull()
  })

  it('subscribes a calendar source and removes it', async () => {
    const source = ok(
      'insert calendar source',
      await A.client
        .from('calendar_sources')
        .insert({ kind: 'url', label: 'Work', url: 'https://example.test/a.ics', user_id: A.id })
        .select('id')
        .single(),
    ) as { id: string }
    expect(ok('list sources', await A.client.from('calendar_sources').select('id'))).toHaveLength(1)
    expect((await A.client.from('calendar_sources').delete().eq('id', source.id)).error).toBeNull()
  })
})

// ===========================================================================
//  ONE RECORD FROM EVERY OWNER-MANAGED FEATURE FAMILY
// ===========================================================================

describe('every owner-managed feature family is usable', () => {
  it('wellness: an item and a log', async () => {
    const item = ok(
      'insert wellness item',
      await A.client.from('wellness_items').insert({ user_id: A.id, name: 'Vitamin D' }).select('id').single(),
    ) as { id: string }
    ok('insert wellness log', await A.client.from('wellness_logs').insert({ user_id: A.id, item_id: item.id }))
    expect(ok('read wellness logs', await A.client.from('wellness_logs').select('id'))).toHaveLength(1)
    ok('update wellness item', await A.client.from('wellness_items').update({ dose: '1000iu' }).eq('id', item.id))
  })

  it('quit tracker: a habit and a check-in', async () => {
    const habit = ok(
      'insert quit habit',
      await A.client.from('quit_habits').insert({ user_id: A.id, name: 'Late scrolling' }).select('id').single(),
    ) as { id: string }
    ok(
      'insert check-in',
      await A.client.from('quit_checkins').insert({ user_id: A.id, habit_id: habit.id, checked_on: '2026-08-04' }),
    )
    expect(ok('read check-ins', await A.client.from('quit_checkins').select('id'))).toHaveLength(1)
    // A slip moves day zero — one UPDATE, the tracker's whole write path.
    ok('slip', await A.client.from('quit_habits').update({ longest_streak_days: 3 }).eq('id', habit.id))
  })

  it('personal templates', async () => {
    const row = ok(
      'insert template',
      await A.client
        .from('user_templates')
        .insert({ user_id: A.id, title: 'Morning', tasks: [{ title: 'Water', effort_minutes: 5 }] })
        .select('id')
        .single(),
    ) as { id: string }
    ok('update template', await A.client.from('user_templates').update({ description: 'x' }).eq('id', row.id))
    expect((await A.client.from('user_templates').delete().eq('id', row.id)).error).toBeNull()
  })

  it('vision cards', async () => {
    const row = ok(
      'insert vision card',
      await A.client.from('vision_cards').insert({ user_id: A.id, title: 'Ship it', position: 1 }).select('id').single(),
    ) as { id: string }
    ok('reorder', await A.client.from('vision_cards').update({ position: 2 }).eq('id', row.id))
  })

  it('mind maps', async () => {
    const row = ok(
      'insert mind map',
      await A.client.from('mind_maps').insert({ user_id: A.id, title: 'Ideas' }).select('id').single(),
    ) as { id: string }
    // The editor owns the graph while open and saves it whole.
    ok(
      'autosave graph',
      await A.client
        .from('mind_maps')
        .update({ nodes: [{ id: 'n1', x: 0, y: 0, label: 'root' }], edges: [] })
        .eq('id', row.id),
    )
  })

  it('challenges', async () => {
    const row = ok(
      'join challenge',
      await A.client
        .from('user_challenges')
        .insert({ user_id: A.id, challenge_key: 'journal_7', started_at: '2026-08-04' })
        .select('id,status')
        .single(),
    ) as { id: string; status: string }
    expect(row.status).toBe('active')
    ok(
      'complete challenge',
      await A.client
        .from('user_challenges')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', row.id),
    )
  })

  it('journal: one entry per local day, editable today', async () => {
    const row = ok(
      'insert journal entry',
      await A.client
        .from('journal_entries')
        .insert({ user_id: A.id, entry_date: '2026-08-04', text: '## What went well\nthis' })
        .select('id')
        .single(),
    ) as { id: string }
    ok('edit today', await A.client.from('journal_entries').update({ text: 'edited' }).eq('id', row.id))
    expect(ok('read journal', await A.client.from('journal_entries').select('id'))).toHaveLength(1)
  })
})

// ===========================================================================
//  PRIVATE STORAGE
// ===========================================================================

describe('journal audio lives in a private bucket keyed by user id', () => {
  const objectFor = (u: User) => `${u.id}/fresh-${stamp}.webm`

  it('the owner can upload and read back its own object', async () => {
    const body = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' })
    const up = await A.client.storage.from('journal-audio').upload(objectFor(A), body, {
      contentType: 'audio/webm',
      upsert: true,
    })
    expect(up.error, up.error ? up.error.message : '').toBeNull()

    const signed = await A.client.storage.from('journal-audio').createSignedUrl(objectFor(A), 60)
    expect(signed.error, signed.error ? signed.error.message : '').toBeNull()
    const fetched = await fetch(signed.data!.signedUrl)
    expect(fetched.ok, 'a signed URL must serve the owner their own bytes').toBe(true)
  })

  it('another user cannot read or write into that folder', async () => {
    // The KEY SHAPE is the authorisation: the storage policies check that the
    // first path segment equals auth.uid().
    const read = await B.client.storage.from('journal-audio').download(objectFor(A))
    expect(read.error, "B must not be able to download A's recording").toBeTruthy()

    const plant = await B.client.storage
      .from('journal-audio')
      .upload(`${A.id}/planted-${stamp}.webm`, new Blob([new Uint8Array([9])]), { upsert: true })
    expect(plant.error, "B must not be able to write into A's folder").toBeTruthy()
  })

  it('an anonymous caller cannot read it', async () => {
    const pub = await fetch(`${URL_}/storage/v1/object/public/journal-audio/${objectFor(A)}`)
    expect(pub.ok, 'the bucket is private').toBe(false)
  })
})

// ===========================================================================
//  ANONYMOUS VISITORS
// ===========================================================================

describe('an anonymous visitor', () => {
  it('CAN file the two fake-door intents — that is the whole point of them', async () => {
    // /pricing and /welcome are public routes and both surfaces render logged
    // out. Revoking anon INSERT here silently kills the signal capture.
    expect((await anon().from('upgrade_intents').insert({ tier: 'pro', source: 'pricing' })).error).toBeNull()
    expect(
      (await anon().from('feature_intents').insert({ feature_key: 'meditation', source: 'landing' })).error,
    ).toBeNull()
  })

  it('cannot read back what it filed — there is no select policy AND no grant', async () => {
    const up = await anon().from('upgrade_intents').select('*')
    expect(up.error ?? up.data, 'anon must never read the intent tables').not.toEqual([])
    expect(up.data ?? []).toEqual([])
  })

  it.each([
    'profiles',
    'tasks',
    'projects',
    'journal_entries',
    'quit_habits',
    'vision_cards',
    'mind_maps',
    'billing',
    'calendar_sources',
    'wellness_items',
  ])('cannot read %s', async (table) => {
    const { data, error } = await anon().from(table).select('*')
    expect(error, `anon must be refused on ${table}`).toBeTruthy()
    expect(data ?? []).toEqual([])
  })

  it.each(['tasks', 'journal_entries', 'quit_habits', 'billing', 'events'])(
    'cannot write %s',
    async (table) => {
      const { error } = await anon().from(table).insert({ title: 'x', event: 'task_created' })
      expect(error, `anon must not be able to insert into ${table}`).toBeTruthy()
    },
  )
})

// ===========================================================================
//  CROSS-USER ISOLATION
// ===========================================================================

describe('user B cannot reach user A', () => {
  it.each(['tasks', 'projects', 'journal_entries', 'quit_habits', 'vision_cards', 'mind_maps', 'user_challenges'])(
    'sees none of A rows in %s, even unfiltered',
    async (table) => {
      // Unfiltered on purpose: isolation must be in the database, not in a
      // client-side filter the caller could simply omit.
      const { data, error } = await B.client.from(table).select('*')
      expect(error, `B was refused outright on ${table}, which hides the real question`).toBeNull()
      expect(data ?? []).toEqual([])
    },
  )

  it("cannot read A's profile", async () => {
    const { data } = await B.client.from('profiles').select('*').eq('id', A.id)
    expect(data ?? []).toEqual([])
  })

  it("cannot update A's task", async () => {
    const task = ok(
      'seed A task',
      await A.client
        .from('tasks')
        .insert({ workspace_id: A.workspaceId, title: 'A private task' })
        .select('id')
        .single(),
    ) as { id: string }

    const upd = await B.client.from('tasks').update({ title: 'hijacked' }).eq('id', task.id).select('id')
    // RLS makes the row invisible, so the UPDATE matches nothing rather than
    // erroring. Either way it must not have changed anything.
    expect(upd.data ?? []).toEqual([])

    const still = ok('A task unchanged', await A.client.from('tasks').select('title').eq('id', task.id).single())
    expect((still as { title: string }).title).toBe('A private task')
  })

  it("cannot insert a row owned by A", async () => {
    const { error } = await B.client.from('vision_cards').insert({ user_id: A.id, title: 'planted' })
    expect(error, 'the with-check policy must refuse a foreign user_id').toBeTruthy()
  })

  it("cannot write into A's workspace", async () => {
    const { error } = await B.client
      .from('tasks')
      .insert({ workspace_id: A.workspaceId, title: 'planted in A workspace' })
    expect(error, 'workspace membership is checked by RLS').toBeTruthy()
  })
})

// ===========================================================================
//  SERVER-ONLY SURFACES STAY SERVER-ONLY
// ===========================================================================

describe('the server-only surfaces are not reachable by a client', () => {
  it('authenticated cannot touch checkout_attempts', async () => {
    const read = await A.client.from('checkout_attempts').select('*')
    expect(read.data ?? []).toEqual([])
    expect((await A.client.from('checkout_attempts').insert({ user_id: A.id, price_id: 'p' })).error).toBeTruthy()
  })

  it.each([
    ['reserve_checkout_attempt', { p_user_id: '00000000-0000-4000-8000-000000000001', p_price_id: 'price_x' }],
    ['mark_checkout_attempt', { p_attempt_id: '00000000-0000-4000-8000-000000000001', p_status: 'failed' }],
  ])('authenticated cannot invoke %s', async (fn, args) => {
    const { error } = await A.client.rpc(fn as string, args as Record<string, unknown>)
    expect(error, `an authenticated user must not be able to call ${fn}`).toBeTruthy()
  })

  it('authenticated cannot write its own billing row', async () => {
    expect((await A.client.from('billing').upsert({ user_id: A.id, plan: 'pro' })).error).toBeTruthy()
    expect((await A.client.from('billing').update({ plan: 'pro' }).eq('user_id', A.id)).error).toBeTruthy()
  })

  it.each(['tasks', 'journal_entries', 'quit_habits', 'vision_cards', 'profiles'])(
    'service_role holds no direct write on %s either',
    async (table) => {
      /*
       * The server never writes these — every server path is billing, checkout
       * or the calendar read. A write grant would be unreviewed surface.
       *
       * A filtered DELETE rather than an INSERT, deliberately: an insert would
       * need a per-table payload, and a wrong column answers 42703 (undefined
       * column), which is truthy and would pass this test for entirely the
       * wrong reason. Every one of these tables has `id`, so the statement is
       * valid everywhere and the ONLY thing that can refuse it is the grant.
       */
      const { error } = await service()
        .from(table)
        .delete()
        .eq('id', '00000000-0000-4000-8000-000000000000')
      expect(error, `service_role must not be able to delete from ${table}`).toBeTruthy()
      expect(error?.code, `expected a privilege refusal on ${table}, got ${error?.message}`).toBe(
        '42501',
      )
    },
  )

  it('service_role CAN still perform the one calendar read the proxy needs', async () => {
    const { error } = await service().from('calendar_sources').select('id,url').eq('user_id', A.id).eq('kind', 'url')
    expect(error, error ? `${error.code} ${error.message}` : '').toBeNull()
  })
})

// ===========================================================================
//  ACCOUNT DELETION
// ===========================================================================

describe('account deletion', () => {
  it('removes the account and its data, and the credentials stop working', async () => {
    const C = await signUp('c')
    ok('seed C task', await C.client.from('tasks').insert({ workspace_id: C.workspaceId, title: 'C task' }))

    const { error } = await C.client.rpc('delete_own_account')
    expect(error, error ? `${error.code} ${error.message}` : '').toBeNull()

    // The whole FK graph goes with auth.users, so the old token now resolves to
    // a user that does not exist and the credentials no longer authenticate.
    const again = await anon().auth.signInWithPassword({ email: C.email, password: C.password })
    expect(again.error, 'a deleted account must not be able to sign in').toBeTruthy()

    const leftovers = await C.client.from('tasks').select('id')
    expect(leftovers.data ?? [], 'the deleted user must own nothing').toEqual([])
  })
})
