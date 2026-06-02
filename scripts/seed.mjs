// Todonado dev seed — inserts sample projects + tasks so Today and the
// capacity meter have content. Idempotent (re-running replaces seed rows).
//
// Run:  npm run seed
// Needs (in .env): VITE_SUPABASE_URL and EITHER
//   - SUPABASE_SERVICE_ROLE_KEY   (preferred; bypasses RLS), OR
//   - SEED_EMAIL + SEED_PASSWORD  (an existing account; uses VITE_SUPABASE_ANON_KEY)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const env = { ...process.env }
  try {
    const text = readFileSync(resolve(root, '.env'), 'utf8')
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const key = match[1]
      let value = match[2].trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!env[key]) env[key] = value
    }
  } catch {
    // no .env file — fall back to process.env
  }
  return env
}

function isoOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function resolveTarget(env) {
  const url = env.VITE_SUPABASE_URL
  if (!url) throw new Error('Missing VITE_SUPABASE_URL in .env')

  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
    const { data, error } = await supabase
      .from('workspaces')
      .select('id, owner_id')
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) throw error
    if (!data?.length) {
      throw new Error('No workspaces found. Sign up a user in the app first, then re-run seed.')
    }
    console.log('Seeding via service role →', data[0].id)
    return { supabase, workspaceId: data[0].id }
  }

  if (env.VITE_SUPABASE_ANON_KEY && env.SEED_EMAIL && env.SEED_PASSWORD) {
    const supabase = createClient(url, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
    const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
      email: env.SEED_EMAIL,
      password: env.SEED_PASSWORD,
    })
    if (authError) throw authError
    const { data, error } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', auth.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) throw error
    if (!data?.length) throw new Error('No workspace found for this user.')
    console.log(`Seeding as ${env.SEED_EMAIL} →`, data[0].id)
    return { supabase, workspaceId: data[0].id }
  }

  throw new Error(
    'Provide SUPABASE_SERVICE_ROLE_KEY, or SEED_EMAIL + SEED_PASSWORD (with VITE_SUPABASE_ANON_KEY), in .env',
  )
}

async function main() {
  const env = loadEnv()
  const { supabase, workspaceId } = await resolveTarget(env)

  // --- Idempotency: clear prior seed rows ---
  await supabase.from('tasks').delete().eq('workspace_id', workspaceId).like('notes', '%[seed]%')
  const { data: oldProjects } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', workspaceId)
    .like('name', 'Sample:%')
  if (oldProjects?.length) {
    const ids = oldProjects.map((p) => p.id)
    await supabase.from('tasks').delete().in('project_id', ids)
    await supabase.from('projects').delete().in('id', ids)
  }

  // --- Projects ---
  const { data: projects, error: projectError } = await supabase
    .from('projects')
    .insert([
      { workspace_id: workspaceId, name: 'Sample: Launch', color: '#6C5CE7' },
      { workspace_id: workspaceId, name: 'Sample: Personal', color: '#22D3A6' },
    ])
    .select('*')
  if (projectError) throw projectError
  const launch = projects.find((p) => p.name === 'Sample: Launch')
  const personal = projects.find((p) => p.name === 'Sample: Personal')

  // --- Sections ---
  const { data: sections, error: sectionError } = await supabase
    .from('sections')
    .insert([
      { project_id: launch.id, name: 'This week', position: 0 },
      { project_id: launch.id, name: 'Backlog', position: 1 },
    ])
    .select('*')
  if (sectionError) throw sectionError
  const thisWeek = sections.find((s) => s.name === 'This week')

  const today = isoOffset(0)
  const yesterday = isoOffset(-1)
  const tomorrow = isoOffset(1)
  const notes = 'Seed data [seed]'

  // --- Tasks (varied effort + dates to exercise Today + roll-over) ---
  const taskRows = [
    { title: 'Review pull requests', effort_minutes: 45, priority: 2, scheduled_for: today, position: 0 },
    { title: 'Write launch announcement', effort_minutes: 90, priority: 3, scheduled_for: today, project_id: launch.id, section_id: thisWeek.id, position: 1 },
    { title: 'Inbox zero & triage', effort_minutes: 30, priority: 1, scheduled_for: today, position: 2 },
    { title: 'Deep work: capacity meter polish', effort_minutes: 120, priority: 2, scheduled_for: today, project_id: launch.id, section_id: thisWeek.id, position: 3 },
    { title: 'Reply to design feedback', effort_minutes: 30, priority: 2, scheduled_for: yesterday, position: 4 },
    { title: 'Update the roadmap doc', effort_minutes: 40, priority: 1, scheduled_for: yesterday, project_id: launch.id, position: 5 },
    { title: 'Plan next sprint', effort_minutes: 60, priority: 2, scheduled_for: tomorrow, project_id: launch.id, position: 6 },
    { title: 'Buy domain for landing page', effort_minutes: 15, priority: 1, position: 7 },
    { title: 'Brainstorm onboarding flow', priority: 0, position: 8 },
    { title: 'Book dentist appointment', effort_minutes: 10, priority: 1, project_id: personal.id, position: 9 },
  ].map((t) => ({ workspace_id: workspaceId, status: 'todo', notes, ...t }))

  const { data: inserted, error: taskError } = await supabase
    .from('tasks')
    .insert(taskRows)
    .select('id, title')
  if (taskError) throw taskError

  // --- Subtasks on the announcement ---
  const announcement = inserted.find((t) => t.title === 'Write launch announcement')
  if (announcement) {
    await supabase.from('subtasks').insert([
      { task_id: announcement.id, title: 'Draft copy', position: 0 },
      { task_id: announcement.id, title: 'Get a review', position: 1 },
      { task_id: announcement.id, title: 'Schedule post', position: 2 },
    ])
  }

  console.log(
    `✓ Seeded ${inserted.length} tasks across ${projects.length} projects. Open Today to see the capacity meter + roll-over.`,
  )
}

main().catch((error) => {
  console.error('Seed failed:', error.message ?? error)
  process.exit(1)
})
