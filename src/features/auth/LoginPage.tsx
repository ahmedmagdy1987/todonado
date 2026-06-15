import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { AlertTriangle, Info, Mail, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-context'
import { Logo } from '@/components/brand/Logo'
import { Button, Card, CardContent, Input } from '@/components/ui'
import { cn } from '@/lib/utils'

type Mode = 'signin' | 'signup'
type Feedback = { type: 'error' | 'info'; text: string } | null

export function LoginPage() {
  const { session, isConfigured } = useAuth()
  const location = useLocation()
  const initialMode: Mode =
    (location.state as { mode?: Mode } | null)?.mode === 'signup' ? 'signup' : 'signin'
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  // Already signed in -> bounce to where they were headed (or the command center).
  if (session) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname
    return <Navigate to={from ?? '/'} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isConfigured) return
    setSubmitting(true)
    setFeedback(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setFeedback({
          type: 'info',
          text: 'Account created. Check your inbox to confirm, then sign in.',
        })
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMagicLink() {
    if (!isConfigured) return
    if (!email) {
      setFeedback({ type: 'error', text: 'Enter your email first.' })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw error
      setFeedback({
        type: 'info',
        text: 'Magic link sent — check your email to finish signing in.',
      })
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not send the magic link.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const disabled = submitting || !isConfigured

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Ambient brand glow */}
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
          <h1 className="mt-4 font-display text-2xl font-bold">
            Welcome to <span className="text-gradient-brand">Todonado</span>
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Your daily command center. Capture, plan, focus, recover.
          </p>
        </div>

        <Card className="shadow-elevation-lg">
          <CardContent className="p-6 pt-6">
            {!isConfigured && (
              <div className="mb-5 flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="text-left text-text-primary/90">
                  <p className="font-medium text-warning">Supabase not connected</p>
                  <p className="mt-0.5 text-text-muted">
                    Add <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
                    <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> to{' '}
                    <code className="font-mono text-xs">.env</code>, then restart the dev
                    server to enable sign-in.
                  </p>
                </div>
              </div>
            )}

            {/* Mode toggle */}
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-surface-2/60 p-1">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    setFeedback(null)
                  }}
                  className={cn(
                    'focus-ring rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    mode === m
                      ? 'bg-surface text-text-primary shadow-elevation'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {m === 'signin' ? 'Sign in' : 'Sign up'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-text-muted">Email</span>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={disabled}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-text-muted">Password</span>
                <Input
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={disabled}
                />
              </label>

              {feedback && (
                <div
                  className={cn(
                    'flex items-start gap-2 rounded-lg p-2.5 text-xs',
                    feedback.type === 'error'
                      ? 'bg-danger/10 text-danger'
                      : 'bg-accent/10 text-accent',
                  )}
                >
                  {feedback.type === 'error' ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}

              <Button type="submit" loading={submitting} disabled={disabled} className="mt-1">
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3 text-xs text-text-muted">
              <span className="h-px flex-1 bg-white/10" />
              or
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleMagicLink}
              disabled={disabled}
              className="w-full"
            >
              <Mail className="h-4 w-4" aria-hidden />
              Email me a magic link
            </Button>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-text-muted">
              <Sparkles className="h-3 w-3 text-brand" aria-hidden />
              Plan a realistic day. Execute with focus.
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-text-muted">
          New here?{' '}
          <Link to="/welcome" className="focus-ring rounded text-accent hover:underline">
            See what Todonado does
          </Link>{' '}
          ·{' '}
          <Link to="/pricing" className="focus-ring rounded text-accent hover:underline">
            Pricing
          </Link>
        </p>
      </div>
    </div>
  )
}
