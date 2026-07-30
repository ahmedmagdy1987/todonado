import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  AtSign,
  Bell,
  Check,
  Copy,
  Crown,
  Download,
  Gauge,
  Gift,
  LayoutGrid,
  Play,
  Settings as SettingsIcon,
  Trash2,
  User,
} from 'lucide-react'
import { Badge, Button, Card, Input, Modal } from '@/components/ui'
import { FEATURES } from '@/lib/config'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { CalendarSettings } from '@/features/calendar/CalendarSettings'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useUpdateCapacity } from '@/features/workspace/api/useUpdateCapacity'
import { usePlan } from '@/features/billing/usePlan'
import { useToast } from '@/components/common/toast-context'
import { usernameError } from '@/features/auth/identifier'
import { checkUsernameAvailable } from '@/features/auth/api/accounts'
import { InterestChip } from '@/components/common/InterestChip'
import { playTone } from '@/features/focus/sound'
import { CHIME_TONES, setPrefs, usePrefs, type StartScreen } from './prefs'
import { useUpdateProfile, UsernameTakenError } from './api/useUpdateProfile'
import { downloadJson, gatherExport } from './exportData'

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold">{title}</h3>
          {description && <p className="text-sm text-text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      {children}
    </label>
  )
}

type UStatus = 'idle' | 'unchanged' | 'checking' | 'available' | 'taken' | 'invalid'

function AccountSection() {
  const { profile } = useWorkspace()
  const { user } = useAuth()
  const updateProfile = useUpdateProfile()
  const toast = useToast()

  const [name, setName] = useState(profile?.full_name ?? profile?.display_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [status, setStatus] = useState<UStatus>('unchanged')
  const [error, setError] = useState<string | null>(null)

  const currentUsername = (profile?.username ?? '').trim()

  useEffect(() => {
    const trimmed = username.trim()
    if (trimmed.toLowerCase() === currentUsername.toLowerCase()) {
      setStatus('unchanged')
      return
    }
    if (trimmed === '') {
      setStatus('idle') // clearing the username is allowed
      return
    }
    if (usernameError(trimmed)) {
      setStatus('invalid')
      return
    }
    setStatus('checking')
    let cancelled = false
    const t = setTimeout(() => {
      void checkUsernameAvailable(trimmed).then((ok) => {
        if (cancelled) return
        setStatus(ok === null ? 'idle' : ok ? 'available' : 'taken')
      })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [username, currentUsername])

  async function save() {
    setError(null)
    const trimmed = username.trim()
    if (trimmed !== '') {
      const fmt = usernameError(trimmed)
      if (fmt) {
        setError(fmt)
        return
      }
      if (status === 'taken') {
        setError('That username is already taken.')
        return
      }
    }
    try {
      await updateProfile.mutateAsync({
        full_name: name.trim() || null,
        username: trimmed || null,
      })
      setStatus('unchanged')
      toast.show('Account updated')
    } catch (e) {
      setError(e instanceof UsernameTakenError ? 'That username is already taken.' : 'Could not save — try again.')
    }
  }

  const usernameHint =
    status === 'checking'
      ? 'Checking availability…'
      : status === 'available'
        ? 'Username is available.'
        : status === 'taken'
          ? 'That username is already taken.'
          : status === 'invalid'
            ? (usernameError(username.trim()) ?? '')
            : ''
  const hintTone = status === 'available' ? 'text-success' : status === 'taken' || status === 'invalid' ? 'text-danger' : 'text-text-muted'

  return (
    <Section icon={User} title="Account" description="Your name, username, and login email.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={80} />
        </Field>
        <Field label="Username">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
      </div>
      {usernameHint && <p className={`mt-1.5 text-xs ${hintTone}`}>{usernameHint}</p>}

      <div className="mt-4">
        <Field label="Email">
          <Input value={user?.email ?? ''} disabled readOnly />
        </Field>
        <p className="mt-1.5 text-xs text-text-muted">
          Your email is used to sign in and cannot be changed here yet.
        </p>
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-5">
        <Button
          onClick={save}
          loading={updateProfile.isPending}
          disabled={status === 'checking' || status === 'invalid' || status === 'taken'}
        >
          Save changes
        </Button>
      </div>
    </Section>
  )
}

function PlanSection() {
  const { isPro, isFounding } = usePlan()
  const label = isFounding ? 'Founding' : isPro ? 'Pro' : 'Free'
  return (
    <Section icon={Crown} title="Plan" description="Your subscription tier.">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Current plan</span>
          <Badge variant={isPro ? 'brand' : 'outline'}>{label}</Badge>
        </div>
        <Link to="/settings/plan">
          <Button variant="secondary" size="sm">
            {isPro ? 'View plan' : 'View & upgrade'}
          </Button>
        </Link>
      </div>
    </Section>
  )
}

function PlanningSection() {
  const { capacityMinutes } = useWorkspace()
  const updateCapacity = useUpdateCapacity()
  const toast = useToast()
  const [value, setValue] = useState(String(capacityMinutes))

  function save() {
    const minutes = Math.max(15, Math.round(Number(value) || capacityMinutes))
    updateCapacity.mutate(minutes, { onSuccess: () => toast.show('Daily capacity updated') })
    setValue(String(minutes))
  }

  const hours = (Math.round(Number(value) || 0) / 60).toFixed(1)

  return (
    <Section
      icon={Gauge}
      title="Planning"
      description="How many minutes of focused work fit in a normal day. Powers the capacity meter."
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Daily capacity (minutes)">
          <Input
            type="number"
            min={15}
            step={15}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-40"
          />
        </Field>
        <Button onClick={save} loading={updateCapacity.isPending}>
          Save
        </Button>
        <span className="pb-2 text-xs text-text-muted">≈ {hours}h / day</span>
      </div>
    </Section>
  )
}

function DataSection() {
  const { workspaceId } = useWorkspace()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function exportNow() {
    setBusy(true)
    try {
      const data = await gatherExport(workspaceId)
      downloadJson('todonado-export.json', data)
      toast.show('Your data was exported')
    } catch {
      toast.show('Export failed — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      icon={Download}
      title="Your data"
      description="Download everything you have in Todonado as a JSON file."
    >
      <Button variant="secondary" onClick={exportNow} loading={busy}>
        <Download className="h-4 w-4" aria-hidden /> Export my data (JSON)
      </Button>
    </Section>
  )
}

function DangerSection() {
  const [confirm, setConfirm] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const armed = phrase.trim() === 'DELETE'

  function close() {
    if (busy) return
    setConfirm(false)
    setPhrase('')
    setError(null)
  }

  async function deleteAccount() {
    if (!armed || busy) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('delete_own_account')
    if (rpcError) {
      setBusy(false)
      setError('Could not delete your account — please try again in a moment.')
      return
    }
    // The auth.users row (and, via cascades, all user data) is gone. The local
    // session is orphaned — clear it locally only (a server sign-out would 403:
    // the user no longer exists) and hard-navigate so every in-memory cache of
    // the deleted user's data (TanStack Query, contexts) is dropped with it.
    await supabase.auth.signOut({ scope: 'local' })
    window.location.assign('/welcome')
  }

  return (
    <Card className="border-danger/20 p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
          <Trash2 className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold">Delete account</h3>
          <p className="text-sm text-text-muted">Permanently remove your account and all your data.</p>
        </div>
      </div>
      <Button variant="outline" className="border-danger/40 text-danger hover:bg-danger/10" onClick={() => setConfirm(true)}>
        Delete account
      </Button>

      <Modal open={confirm} onClose={close} title="Delete account">
        <div className="space-y-4 p-5">
          <p className="text-sm text-text-muted">
            This permanently deletes your account and everything in it — tasks, projects, focus
            history, wellness log, and calendar sources. There is no undo. If you want a copy,
            export your data from the section above first.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted">
              Type <span className="font-mono font-semibold text-danger">DELETE</span> to confirm
            </span>
            <Input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="DELETE"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={busy}>
              Keep my account
            </Button>
            <Button
              className="bg-danger text-white hover:bg-danger/90"
              disabled={!armed || busy}
              loading={busy}
              onClick={deleteAccount}
            >
              Delete my account
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

/**
 * A plain on/off row. There is no Switch primitive in the design system and the
 * Checkbox reads as a task-completion circle, so this is a labelled switch
 * button — the same shape the focus timer's sound toggle already uses.
 */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-text-primary">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'focus-ring relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-gradient' : 'bg-surface-2 ring-1 ring-inset ring-white/10',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}

/**
 * Sounds and in-app notices.
 *
 * Everything here is DEVICE-LOCAL (localStorage, see prefs.ts): which machine is
 * allowed to make a noise is a property of the machine, not of the account.
 *
 * Deliberately honest about scope: these are IN-APP settings. Web push and email
 * reminders are not built, so there is no toggle pretending they are — the line
 * at the bottom says so plainly rather than leaving a switch that does nothing.
 */
function NotificationsSection() {
  const prefs = usePrefs()

  return (
    <Section
      icon={Bell}
      title="Sounds & notices"
      description="What this device does while you work. Saved on this device only."
    >
      <div className="divide-y divide-white/5">
        <ToggleRow
          label="Sounds"
          hint="The end-of-session chime in Focus, Pomodoro and Breathwork."
          checked={prefs.sound}
          onChange={(sound) => setPrefs({ sound })}
        />

        {prefs.sound && (
          <div className="space-y-3 py-3">
            <div>
              <label
                htmlFor="chime-volume"
                className="mb-1.5 block text-xs font-medium text-text-muted"
              >
                Volume
              </label>
              <input
                id="chime-volume"
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(prefs.volume * 100)}
                onChange={(e) => setPrefs({ volume: Number(e.target.value) / 100 })}
                className="focus-ring h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-brand"
              />
            </div>

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-text-muted">Chime</legend>
              <div className="flex flex-wrap gap-2">
                {CHIME_TONES.map((tone) => (
                  <button
                    key={tone.id}
                    type="button"
                    aria-pressed={prefs.tone === tone.id}
                    title={tone.description}
                    onClick={() => {
                      setPrefs({ tone: tone.id })
                      // Previewed inside the click, which also unlocks the shared
                      // AudioContext for later gesture-less chimes.
                      playTone(tone.id, prefs.volume)
                    }}
                    className={cn(
                      'focus-ring inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors',
                      prefs.tone === tone.id
                        ? 'border-transparent bg-brand-gradient text-white'
                        : 'border-white/10 text-text-muted hover:text-text-primary',
                    )}
                  >
                    <Play className="h-3 w-3" aria-hidden />
                    {tone.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-text-muted">
                All three are generated in the browser — no audio files, nothing to download.
              </p>
            </fieldset>
          </div>
        )}

        {FEATURES.digest && (
          <ToggleRow
            label="Start-your-day briefing"
            hint="The summary card at the top of Today. Off hides it for good, not just for today."
            checked={!prefs.digestHidden}
            onChange={(show) => setPrefs({ digestHidden: !show })}
          />
        )}

        <ToggleRow
          label="Milestone celebrations"
          hint="The quiet note when a quit-habit streak reaches a milestone."
          checked={prefs.celebrations}
          onChange={(celebrations) => setPrefs({ celebrations })}
        />
      </div>

      <p className="mt-3 border-t border-white/5 pt-3 text-xs leading-relaxed text-text-muted">
        These are in-app only. Push notifications and email reminders aren&rsquo;t built yet, so
        there&rsquo;s no switch here pretending otherwise.
      </p>
    </Section>
  )
}

/**
 * Inviting people.
 *
 * WHAT IS REAL TODAY: a plain link anyone can copy and send. It works right now,
 * costs nothing and promises nothing.
 *
 * WHAT IS NOT: referral rewards and discount codes. Those need Stripe live with
 * promotion codes, a `referrals` table and attribution — none of which exist. So
 * there is no fake "your referral code" to copy, no invented credit balance and
 * no "invite 3 friends to unlock" that could never pay out. Just the honest link,
 * and one chip that records whether the rewards are actually wanted.
 */
function InviteSection() {
  const [copied, setCopied] = useState(false)
  const link = 'https://todonado.com'

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Section
      icon={Gift}
      title="Invite a friend"
      description="Share the app with someone who'd get something out of it."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input readOnly value={link} aria-label="Link to share" className="min-w-0 flex-1" />
        <Button variant="secondary" onClick={copy}>
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden /> Copy link
            </>
          )}
        </Button>
      </div>

      <div className="mt-4 border-t border-white/5 pt-3">
        <p className="text-sm text-text-primary">Referral rewards are not built yet</p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          Giving you and a friend a real discount needs billing switched on properly first. Rather
          than show a code that wouldn&rsquo;t work, here&rsquo;s a way to say you&rsquo;d want one.
        </p>
        <InterestChip
          featureKey="referral"
          source="settings"
          label="I’d use referral rewards"
          className="mt-2"
        />
      </div>
    </Section>
  )
}

/**
 * Which screen `/` opens on.
 *
 * Today is the default and stays the default — the activation flow that is known
 * to work lands there, and changing that for someone who never asked would be a
 * decision the app has no business making. This is the one tap that moves it.
 */
function StartScreenSection() {
  const { startOn } = usePrefs()
  const options: { value: StartScreen; label: string; hint: string }[] = [
    { value: 'today', label: 'Today', hint: 'Straight into the day' },
    { value: 'hub', label: 'Hub', hint: 'Every door, one screen' },
  ]

  return (
    <Section
      icon={LayoutGrid}
      title="Start my day on"
      description="Where the app opens. Saved on this device."
    >
      <div role="radiogroup" aria-label="Start my day on" className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={startOn === o.value}
            onClick={() => setPrefs({ startOn: o.value })}
            className={cn(
              'focus-ring rounded-xl border p-3 text-left transition-colors',
              startOn === o.value
                ? 'border-brand/50 bg-brand-gradient-soft'
                : 'border-white/10 hover:bg-surface-2/60',
            )}
          >
            <span className="block text-sm font-medium text-text-primary">{o.label}</span>
            <span className="mt-0.5 block text-xs text-text-muted">{o.hint}</span>
          </button>
        ))}
      </div>
    </Section>
  )
}

export function SettingsPage() {
  return (
    // Form/text page: cap at a comfortable reading width, centered in the wider frame.
    <div className="animate-fade-in mx-auto max-w-2xl space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <SettingsIcon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Settings</h2>
          <p className="text-sm text-text-muted">Manage your account, plan, and data.</p>
        </div>
      </header>

      <AccountSection />
      <PlanSection />
      <PlanningSection />
      {FEATURES.calendarImport && <CalendarSettings />}
      {FEATURES.hub && <StartScreenSection />}
      <NotificationsSection />
      <InviteSection />
      <DataSection />
      <DangerSection />

      <p className="flex items-center gap-1.5 text-xs text-text-muted">
        <AtSign className="h-3.5 w-3.5" aria-hidden />
        Your username is your handle in Todonado — you sign in with your email.
      </p>
    </div>
  )
}
