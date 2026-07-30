import { test, expect } from '@playwright/test'
import {
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  expectNoHorizontalOverflow,
  rest,
  signIn,
  tableExists,
} from './fixtures'

/**
 * Mind maps.
 *
 * `mind_maps` ships committed-but-UNAPPLIED, so the journey below self-skips
 * until `supabase db push` runs — exactly as the quit and vision journeys did
 * before theirs landed. The route test does NOT skip: it asserts whichever state
 * is actually live, so it is honest either way and it is what catches a page
 * that promises a feature its table cannot serve.
 */

/** The canvas node, not its twin in the Ideas list — the aria-label differs. */
const canvasNode = (title: string) => new RegExp(`^${title}\\b.*Press Enter to`, 'i')

test('mind maps: the route renders and states its case honestly', async ({ page }) => {
  const account = await createTestAccount('mindmap route')
  await signIn(page, account)

  await page.goto('/vision/maps')
  await expect(page.getByRole('heading', { name: 'Mind maps', level: 2 })).toBeVisible()

  if (await tableExists('mind_maps')) {
    await expect(page.getByRole('heading', { name: 'Nothing mapped yet' })).toBeVisible()
  } else {
    await expect(page.getByRole('heading', { name: 'Not switched on yet' })).toBeVisible()
    // No "New map" button that could only ever fail.
    await expect(page.getByRole('button', { name: 'New map' })).toHaveCount(0)
  }

  // Vision is where maps are reached from, and that link must be real.
  await page.goto('/vision')
  await expect(page.getByRole('link', { name: 'Mind maps' })).toHaveAttribute(
    'href',
    '/vision/maps',
  )

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/vision/maps')
  await expectNoHorizontalOverflow(page, 390)

  await deleteTestAccount(account, 'mindmap route')
})

test('mind maps: draw a map, connect two ideas, and find it intact after a reload', async ({
  page,
}) => {
  const ready = await tableExists('mind_maps')
  test.skip(
    !ready,
    'mind_maps does not exist yet — apply supabase/migrations/20260731120000_mind_maps.sql',
  )

  const account = await createTestAccount('mindmap journey')
  const [project] = (await rest('projects', account.token, {
    method: 'POST',
    body: { workspace_id: account.workspaceId, name: 'Beta launch' },
    prefer: 'return=representation',
  })) as { id: string }[]

  await signIn(page, account)
  await page.goto('/vision/maps')

  // --- Create -------------------------------------------------------------
  await page.getByRole('button', { name: /Draw your first map/i }).click()
  await expect(page).toHaveURL(/\/vision\/maps\/[0-9a-f-]{36}/, { timeout: 20_000 })
  const mapId = page.url().split('/').pop()!

  // A new map is not empty: it has a centre, and that centre cannot be deleted.
  await expect(page.getByRole('button', { name: canvasNode('Start here') })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete Start here' })).toHaveCount(0)

  // --- Rename -------------------------------------------------------------
  const nameField = page.getByLabel('Map name')
  await nameField.fill('Launch thinking')
  await nameField.blur()

  // --- Two ideas, one of them linked to a real project ---------------------
  await page.getByRole('button', { name: 'Add idea' }).click()
  const first = page.getByRole('dialog', { name: 'Add an idea' })
  await first.getByLabel('The idea').fill('Ship the beta')
  await first.getByLabel(/This idea is/i).selectOption(`project:${project.id}`)
  await first.getByRole('button', { name: 'Add idea' }).click()
  await expect(first).toBeHidden()

  await page.getByRole('button', { name: 'Add idea' }).click()
  const second = page.getByRole('dialog', { name: 'Add an idea' })
  await second.getByLabel('The idea').fill('Write the docs')
  await second.getByLabel('A note').fill('Enough that a stranger can start.')
  await second.getByRole('button', { name: 'Add idea' }).click()
  await expect(second).toBeHidden()

  // Both are on the canvas AND in the accessible list.
  await expect(page.getByRole('button', { name: canvasNode('Ship the beta') })).toBeVisible()
  await expect(page.getByRole('button', { name: canvasNode('Write the docs') })).toBeVisible()
  await expect(page.getByText('3 of 200 · 0 links')).toBeVisible()

  // The project link is a real, navigable badge.
  await expect(
    page.getByRole('link', { name: 'Beta launch' }).first(),
  ).toHaveAttribute('href', `/projects/${project.id}`)

  // --- Connect two of them ------------------------------------------------
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.getByRole('button', { name: canvasNode('Ship the beta') }).click()
  await page.getByRole('button', { name: canvasNode('Write the docs') }).click()
  await expect(page.getByText('3 of 200 · 1 link')).toBeVisible()

  // --- It actually saved, and it survives a reload ------------------------
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({
    timeout: 15_000,
  })

  await page.reload()
  await expect(page.getByLabel('Map name')).toHaveValue('Launch thinking', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: canvasNode('Ship the beta') })).toBeVisible()
  await expect(page.getByText('3 of 200 · 1 link')).toBeVisible()
  await expect(page.getByText('Enough that a stranger can start.')).toBeVisible()

  // --- And it is one row, with the graph really in it ----------------------
  const rows = (await rest(
    `mind_maps?select=title,nodes,edges&id=eq.${mapId}`,
    account.token,
  )) as { title: string; nodes: unknown[]; edges: unknown[] }[]
  expect(rows).toHaveLength(1)
  expect(rows[0].title).toBe('Launch thinking')
  expect(rows[0].nodes).toHaveLength(3)
  expect(rows[0].edges).toHaveLength(1)

  // --- Deleting an idea takes its line with it ----------------------------
  await page.getByRole('button', { name: 'Delete Write the docs' }).click()
  await expect(page.getByText('2 of 200 · 0 links')).toBeVisible()

  // --- Free stops at one map, and the one that exists still opens ----------
  await page.goto('/vision/maps')
  await page.getByRole('button', { name: 'New map' }).click()
  await expect(page.getByRole('note', { name: /Mind map limit reached/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /Launch thinking/ })).toBeVisible()

  await deleteTestAccount(account, 'mindmap journey')
})

/**
 * The same journey, against an INTERCEPTED `mind_maps` endpoint.
 *
 * This exists because the test above skips until the migration is applied, and a
 * skipping test verifies nothing at all — the editor could be completely broken
 * and CI would stay green right up until the day the table appears. Stubbing the
 * four requests the feature makes lets the whole of the client be exercised now:
 * create, add, connect, DEBOUNCED AUTOSAVE, and re-parse from what was actually
 * sent to the server.
 *
 * It is deliberately NOT a replacement for the real one. It proves the client is
 * correct; only the real table can prove RLS, the CHECK constraints and the link
 * guard, and that is exactly what the skipping test is there to do later.
 */
test('mind maps: the editor round-trips a graph through the wire format (stubbed table)', async ({
  page,
}) => {
  const account = await createTestAccount('mindmap stub')
  await signIn(page, account)

  interface Row {
    id: string
    user_id: string
    title: string
    nodes: unknown[]
    edges: unknown[]
    created_at: string
    updated_at: string
  }
  const store = new Map<string, Row>()
  /** Every PATCH body the client sent, so autosave can be asserted directly. */
  const writes: { nodes?: unknown[]; edges?: unknown[]; title?: string }[] = []

  await page.route('**/rest/v1/mind_maps**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      })
    /** `id=eq.<uuid>` → the uuid. */
    const idFilter = url.searchParams.get('id')?.replace('eq.', '')

    if (req.method() === 'GET') {
      const rows = idFilter
        ? [store.get(idFilter)].filter(Boolean)
        : [...store.values()].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      return json(single ? (rows[0] ?? null) : rows)
    }

    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Partial<Row>
      const now = new Date().toISOString()
      const row: Row = {
        id: `11111111-2222-3333-4444-${String(store.size + 1).padStart(12, '0')}`,
        user_id: account.userId,
        title: body.title ?? 'Untitled map',
        nodes: (body.nodes as unknown[]) ?? [],
        edges: (body.edges as unknown[]) ?? [],
        created_at: now,
        updated_at: now,
      }
      store.set(row.id, row)
      return json(single ? row : [row])
    }

    if (req.method() === 'PATCH' && idFilter) {
      const patch = req.postDataJSON() as Partial<Row>
      writes.push(patch)
      const row = { ...store.get(idFilter)!, ...patch, updated_at: new Date().toISOString() }
      store.set(idFilter, row)
      return json(single ? row : [row])
    }

    if (req.method() === 'DELETE' && idFilter) {
      store.delete(idFilter)
      return json([])
    }
    return route.continue()
  })

  await page.goto('/vision/maps')
  await page.getByRole('button', { name: /Draw your first map/i }).click()
  await expect(page).toHaveURL(/\/vision\/maps\/[0-9a-f-]{36}/, { timeout: 20_000 })

  await page.getByRole('button', { name: 'Add idea' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add an idea' })
  await dialog.getByLabel('The idea').fill('Ship the beta')
  await dialog.getByRole('button', { name: 'Add idea' }).click()

  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.getByRole('button', { name: canvasNode('Start here') }).click()
  await page.getByRole('button', { name: canvasNode('Ship the beta') }).click()
  await expect(page.getByText('2 of 200 · 1 link')).toBeVisible()

  // The debounce fired and the graph really went over the wire.
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({
    timeout: 15_000,
  })
  const last = writes.filter((w) => w.nodes).at(-1)!
  expect(last.nodes).toHaveLength(2)
  expect(last.edges).toHaveLength(1)

  // Re-mount from exactly what the server now holds: the graph survives the
  // jsonb round trip, which is the whole point of normaliseMap.
  await page.reload()
  await expect(page.getByText('2 of 200 · 1 link')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: canvasNode('Ship the beta') })).toBeVisible()

  // Tapping a joined pair again REMOVES the line — one gesture for both ways.
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.getByRole('button', { name: canvasNode('Start here') }).click()
  await page.getByRole('button', { name: canvasNode('Ship the beta') }).click()
  await expect(page.getByText('2 of 200 · 0 links')).toBeVisible()

  // The centre is never deletable, on the canvas or in the list.
  await expect(page.getByRole('button', { name: 'Delete Start here' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete Ship the beta' })).toBeVisible()

  // --- The change made in the last second before a RELOAD is still written ---
  //
  // This is the case the debounce cannot cover on its own: a reload kills the
  // pending timer AND any request already in flight, so without the `pagehide`
  // keepalive write the last edit is simply lost. Nothing is awaited below on
  // purpose — the point is to leave while the save is still owed.
  //
  // Asserted on the REQUEST, not on the stub's stored row: a route handler
  // cannot fulfil a request from a document that is already unloading, so the
  // stub could never record it however the client behaved. What is the client's
  // responsibility — and all that is — is that the browser was handed a write
  // containing the edit before the page went away. Delivery is the browser's job.
  const unloadWrites: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().includes('/rest/v1/mind_maps')) {
      unloadWrites.push(r.postData() ?? '')
    }
  })

  await page.getByRole('button', { name: 'Add idea' }).click()
  const late = page.getByRole('dialog', { name: 'Add an idea' })
  await late.getByLabel('The idea').fill('Typed just before leaving')
  await late.getByRole('button', { name: 'Add idea' }).click()
  await expect(late).toBeHidden()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Add idea' })).toBeVisible({ timeout: 20_000 })

  expect(
    unloadWrites.some((body) => body.includes('Typed just before leaving')),
    'the edit was never sent before the page unloaded',
  ).toBe(true)

  await deleteTestAccount(account, 'mindmap stub')
})

test.afterAll(cleanupLeftoverAccounts)
