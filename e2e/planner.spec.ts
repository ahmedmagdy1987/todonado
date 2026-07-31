import { test, expect } from '@playwright/test'
import {
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  rest,
  signIn,
  type TestAccount,
} from './fixtures'

/**
 * THE REPORTED BUG, end to end.
 *
 * "Plan my day" told people there was nothing to plan while their workspace was
 * full. The cause was the eligibility rule — `projectless || overdue || due` —
 * which has no branch for the most ordinary shape there is: a task in a project
 * with no deadline. This account has NOTHING ELSE, so if the planner still
 * cannot see that shape, every assertion below fails.
 */

const LONG = 'Rewrite the activation sequence'

async function seedUndatedProjectWork(account: TestAccount) {
  const projects = (await rest('projects', account.token, {
    method: 'POST',
    prefer: 'return=representation',
    body: { workspace_id: account.workspaceId, name: 'Launch', color: '#6C5CE7' },
  })) as { id: string }[]

  // Three tasks, in a project, with effort — and deliberately NO due_date and
  // NO scheduled_for. Under the old rule none of these was ever plannable.
  await rest('tasks', account.token, {
    method: 'POST',
    body: [30, 45, 60].map((effort, i) => ({
      workspace_id: account.workspaceId,
      project_id: projects[0].id,
      title: `${LONG} ${i + 1}`,
      effort_minutes: effort,
      position: i,
    })),
  })
}

test('plan my day: undated project work is planned, not reported as nothing', async ({ page }) => {
  const account = await createTestAccount('planner day', 360)
  await seedUndatedProjectWork(account)
  await signIn(page, account)

  await page.getByRole('button', { name: 'Plan my day' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Plan my day' })
  await expect(dialog).toBeVisible()

  // The exact string this bug produced. Its absence IS the fix.
  await expect(dialog.getByText('Nothing to plan yet')).toHaveCount(0)
  await expect(dialog.getByText(/Plan\s+3 tasks/)).toBeVisible()

  await dialog.getByRole('button', { name: /Plan 3 into today/ }).click()
  await expect(dialog).toBeHidden()

  // They are on Today now, which is the whole point.
  for (let i = 1; i <= 3; i += 1) {
    await expect(page.getByText(`${LONG} ${i}`).first()).toBeVisible()
  }

  await deleteTestAccount(account, 'planner day')
})

test('the narrow scope is a choice, and its empty state offers the way out', async ({ page }) => {
  const account = await createTestAccount('planner scope', 360)
  await seedUndatedProjectWork(account)
  await signIn(page, account)

  await page.getByRole('button', { name: 'Plan my day' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Plan my day' })
  await expect(dialog).toBeVisible()

  // Narrow it deliberately: this account has no dated work at all, so the plan
  // legitimately becomes empty.
  await dialog.getByRole('button', { name: 'Dated work only' }).click()
  await expect(dialog.getByText('Nothing dated left to plan')).toBeVisible()

  // NOT A DEAD END. It says how much it is ignoring, and offers to include it.
  await expect(dialog.getByText(/3 unscheduled tasks/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Include them' }).click()
  await expect(dialog.getByText(/Plan\s+3 tasks/)).toBeVisible()

  await deleteTestAccount(account, 'planner scope')
})

test('plan my week: undated project work fills the week too', async ({ page }) => {
  const account = await createTestAccount('planner week', 360)
  await seedUndatedProjectWork(account)
  await signIn(page, account)
  // The dev-only preview override the rest of the suite uses for Pro surfaces.
  await page.evaluate(() => localStorage.setItem('todonado.plan', 'pro'))
  await page.goto('/week')

  await page.getByRole('button', { name: 'Plan my week' }).click()
  const dialog = page.getByRole('dialog', { name: 'Plan my week' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Nothing to plan yet')).toHaveCount(0)

  await deleteTestAccount(account, 'planner week')
})

test.afterAll(cleanupLeftoverAccounts)
