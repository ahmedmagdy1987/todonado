import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, KeyRound, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-context'
import { Logo } from '@/components/brand/Logo'
import { Button, Card, CardContent, Input } from '@/components/ui'
import { newPasswordError } from './identifier'

type Stage = 'checking' | 'ready' | 'done' | 'invalid'

/**
 * /reset-password — the landing page for the recovery link sent by
 * `resetPasswordForEmail`. The link carries hash tokens that the shared
 * Supabase client (detectSessionInUrl) exchanges for a session before this
 * page settles; once a session exists we let the user set a new password via
 * `updateUser`. A signed-in user can also open this page directly to change
 * their password — same form, same call.
 */
export function ResetPasswordPage() {
  const { session, loading, isConfigured } = useAuth()

  const [stage, setStage] = useState<Stage>('checking')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // An expired/used link arrives as error params instead of tokens
  // (#error=access_denied&error_code=otp_expired&error_description=…).
  // Capture them on mount, before the client can clean the URL.
  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, '') || window.location.search.replace(/^\?/, '')
    const params = new URLSearchParams(raw)
    if (params.get('error_code') === 'otp_expired') {
      setLinkError('That reset link has expired or was already used.')
    } else if (params.get('error')) {
      setLinkError(params.get('error_description') || 'This reset link is invalid.')
    }
  }, [])

  // Session present -> show the form. No session once auth has settled -> give
  // the hash exchange a short grace window, then declare the link invalid. A
  // session that turns up late (slow exchange) still flips us back to ready.
  useEffect(() => {
    if (loading || stage === 'done') return
    if (session) {
      setStage('ready')
      return
    }
    const t = setTimeout(() => setStage((s) => (s === 'checking' ? 'invalid' : s)), 2500)
    return () => clearTimeout(t)
  }, [loading, session, stage])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const invalid = newPasswordError(password, confirm)
    if (invalid) {
      setFormError(invalid)
      return
    }
    setSubmitting(true)
    setFormError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setFormError(
        /different from the old password/i.test(error.message)
          ? 'Your new password must be different from your current password.'
          : error.message || 'Could not update your password — try again.',
      )
      return
    }
    setStage('done')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(108,92,231,0.20) 0%, rgba(78,168,255,0.08) 35%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link to="/welcome" className="focus-ring rounded-2xl" aria-label="Todonado home">
            <Logo iconClassName="h-12 w-12" showWordmark={false} />
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold">Set a new password</h1>
          <p className="mt-1 text-sm text-text-muted">
            Choose a new password for your Todonado account.
          </p>
        </div>

        <Card className="shadow-elevation-lg">
          <CardContent className="p-6 pt-6">
            {!isConfigured ? (
              <p className="text-sm text-text-muted">
                Supabase isn&rsquo;t connected, so passwords can&rsquo;t be updated here.
              </p>
            ) : stage === 'checking' ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Checking your reset link…
              </div>
            ) : stage === 'invalid' ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-2 rounded-lg bg-danger/10 p-2.5 text-xs text-danger">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    {linkError ?? 'This reset link is invalid or has expired.'} Request a new one
                    from the sign-in page.
                  </span>
                </div>
                <Link to="/login" state={{ mode: 'forgot' }}>
                  <Button className="w-full">Request a new link</Button>
                </Link>
              </div>
            ) : stage === 'done' ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-2 rounded-lg bg-success/10 p-2.5 text-xs text-success">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>Your password has been updated. You&rsquo;re signed in.</span>
                </div>
                <Link to="/">
                  <Button className="w-full">Go to my day</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-text-muted">New password</span>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={submitting}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-text-muted">Confirm new password</span>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    disabled={submitting}
                  />
                </label>

                {formError && (
                  <div className="flex items-start gap-2 rounded-lg bg-danger/10 p-2.5 text-xs text-danger">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{formError}</span>
                  </div>
                )}

                <Button type="submit" loading={submitting} className="mt-1">
                  <KeyRound className="h-4 w-4" aria-hidden />
                  Update password
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-text-muted">
          Remembered it after all?{' '}
          <Link to="/login" className="focus-ring rounded text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
