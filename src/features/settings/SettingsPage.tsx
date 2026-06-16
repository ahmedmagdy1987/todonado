import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  AtSign,
  Crown,
  Download,
  Gauge,
  Settings as SettingsIcon,
  Trash2,
  User,
} from 'lucide-react'
import { Badge, Button, Card, Input, Modal } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useUpdateCapacity } from '@/features/workspace/api/useUpdateCapacity'
import { usePlan } from '@/features/billing/usePlan'
import { useToast } from '@/components/common/toast-context'
import { usernameError } from '@/features/auth/identifier'
import { checkUsernameAvailable } from '@/features/auth/api/accounts'
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
  const toast = useToast()

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

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete account">
        <div className="space-y-4 p-5">
          <p className="text-sm text-text-muted">
            This will permanently delete your account and all of your tasks, projects, and focus
            history. This cannot be undone.
          </p>
          <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            Automated account deletion isn&rsquo;t enabled yet — it&rsquo;s coming soon. Until then
            your data stays private to you, and you can export everything from the section above.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep my account
            </Button>
            <Button
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => {
                setConfirm(false)
                toast.show('Noted — automated account deletion is coming soon. Your data is untouched.')
              }}
            >
              I understand
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

export function SettingsPage() {
  return (
    <div className="animate-fade-in space-y-6">
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
      <DataSection />
      <DangerSection />

      <p className="flex items-center gap-1.5 text-xs text-text-muted">
        <AtSign className="h-3.5 w-3.5" aria-hidden />
        Your username lets you sign in without typing your email.
      </p>
    </div>
  )
}
