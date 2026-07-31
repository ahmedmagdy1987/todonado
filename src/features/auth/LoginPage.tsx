import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { AlertTriangle, Check, Info, Loader2, Mail, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-context'
import { Logo } from '@/components/brand/Logo'
import { Button, Card, CardContent, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { isValidEmail, usernameError } from './identifier'
import { isEmailRateLimitError, isNoAccountOtpError, isNoAccountResetError } from './authErrors'
import { checkUsernameAvailable } from './api/accounts'
import { safeRedirectPath } from './safeRedirect'

type Mode = 'signin' | 'signup' | 'forgot'
type Feedback = { type: 'error' | 'info'; text: string } | null
type UStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export function LoginPage() {
  const { session, isConfigured } = useAuth()
  const location = useLocation()
  const stateMode = (location.state as { mode?: Mode } | null)?.mode
  const initialMode: Mode = stateMode === 'signup' || stateMode === 'forgot' ? stateMode : 'signin'
  const [mode, setMode] = useState<Mode>(initialMode)

  const [email, setEmail] = useState('') // login email (sign in + sign up)
  const [fullName, setFullName] = useState('') // signup
  const [username, setUsername] = useState('') // signup
  const [password, setPassword] = useState('')
  const [uStatus, setUStatus] = useState<UStatus>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  // Debounced username availability check (signup only).
  useEffect(() => {
    if (mode !== 'signup') return
    const trimmed = username.trim()
    if (trimmed === '') {
      setUStatus('idle')
      return
    }
    if (usernameError(trimmed)) {
      setUStatus('invalid')
      return
    }
    setUStatus('checking')
    let cancelled = false
    const t = setTimeout(() => {
      void checkUsernameAvailable(trimmed).then((ok) => {
        if (cancelled) return
        setUStatus(ok === null ? 'idle' : ok ? 'available' : 'taken')
      })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [username, mode])

  // Already signed in -> bounce to where they were headed.
  if (session) {
    // Validated even though `location.state` cannot be set by a crafted URL —
    // see safeRedirect.ts. This keeps the open-redirect class impossible if a
    // future caller ever threads a query parameter into it.
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    return <Navigate to={safeRedirectPath(from)} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isConfigured) return
    setSubmitting(true)
    setFeedback(null)
    try {
      if (mode === 'signin') {
        const value = email.trim()
        if (!isValidEmail(value)) {
          setFeedback({ type: 'error', text: 'Enter the email you signed up with.' })
          return
        }
        const { error } = await supabase.auth.signInWithPassword({ email: value, password })
        if (error) {
          if (/email not confirmed/i.test(error.message)) {
            throw new Error('Please confirm your email first — check your inbox for the link.')
          }
          // Generic message: never reveal whether the email exists (no enumeration).
          if (/invalid login credentials/i.test(error.message)) {
            throw new Error('That email and password don’t match an account.')
          }
          throw error
        }
      } else {
        const uname = username.trim()
        const fmt = usernameError(uname)
        if (fmt) {
          setFeedback({ type: 'error', text: fmt })
          return
        }
        if (uStatus === 'taken') {
          setFeedback({ type: 'error', text: 'That username is already taken.' })
          return
        }
        if (!isValidEmail(email)) {
          setFeedback({ type: 'error', text: 'Enter a valid email address.' })
          return
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim(), username: uname },
          },
        })
        if (error) {
          const msg = error.message
          if (/already registered|already exists/i.test(msg)) {
            throw new Error('An account with that email already exists — try signing in instead.')
          }
          // A duplicate username surfaces from the bootstrap trigger as a unique
          // violation / generic "Database error saving new user".
          if (/duplicate|unique|database error/i.test(msg)) {
            throw new Error('That username may be taken — please try another.')
          }
          throw new Error(msg)
        }
        // When email auto-confirm is on, signUp returns a session and
        // onAuthStateChange routes the new user straight into onboarding — no inbox
        // step. Only ask them to confirm when confirmation is actually required.
        if (!data.session) {
          setFeedback({
            type: 'info',
            text: 'Account created — check your inbox to confirm your email, then sign in.',
          })
        }
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleForgotSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isConfigured) return
    const value = email.trim()
    if (!isValidEmail(value)) {
      setFeedback({ type: 'error', text: 'Enter the email you signed up with.' })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    // Neutral confirmation shown whether or not the address has an account, so the
    // reset form can't be used to probe who's registered (non-enumerating).
    const neutral = 'If an account exists for that email, a password reset link is on its way.'
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(value, {
        // window.location.origin: correct on localhost AND on the live domain
        // (covered by the https://www.todonado.com/** redirect wildcard).
        redirectTo: `${window.location.origin}/reset-password`,
      })
      // Swallow both the no-account AND the per-email rate-limit errors into the
      // neutral confirmation — either one, surfaced, would reveal the email exists.
      if (error && !isNoAccountResetError(error) && !isEmailRateLimitError(error)) throw error
      setFeedback({ type: 'info', text: neutral })
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not send the reset email.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMagicLink() {
    if (!isConfigured) return
    const value = email.trim()
    if (!isValidEmail(value)) {
      setFeedback({ type: 'error', text: 'Enter your email first.' })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    // Neutral confirmation shown whether or not the address has an account, so the
    // magic-link button can't be used to probe who's registered (non-enumerating).
    const neutral = 'If an account exists for that email, a magic link is on its way.'
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: value,
        // Only sign IN existing users — never provision an account (and email) for an
        // arbitrary address. Account creation goes through the password signup form.
        options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
      })
      // With shouldCreateUser:false GoTrue rejects an unknown email ("otp_disabled").
      // Treat that as the SAME neutral confirmation so the response never reveals
      // whether the address exists. Also swallow the per-email rate-limit error,
      // which only fires for an existing address (an enumeration oracle); genuine
      // errors (network, IP-based rate limit, config) still surface.
      if (error && !isNoAccountOtpError(error) && !isEmailRateLimitError(error)) throw error
      setFeedback({ type: 'info', text: neutral })
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

  const feedbackEl = feedback && (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg p-2.5 text-xs',
        feedback.type === 'error' ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-accent',
      )}
    >
      {feedback.type === 'error' ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span>{feedback.text}</span>
    </div>
  )

  const uHint =
    mode === 'signup' && username.trim() !== ''
      ? uStatus === 'checking'
        ? { icon: 'spin', text: 'Checking availability…', tone: 'text-text-muted' }
        : uStatus === 'available'
          ? { icon: 'check', text: 'Username is available.', tone: 'text-success' }
          : uStatus === 'taken'
            ? { icon: 'x', text: 'That username is already taken.', tone: 'text-danger' }
            : uStatus === 'invalid'
              ? { icon: 'x', text: usernameError(username.trim()) ?? '', tone: 'text-danger' }
              : null
      : null

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
                    <code className="font-mono text-xs">.env</code>, then restart the dev server to
                    enable sign-in.
                  </p>
                </div>
              </div>
            )}

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
                    mode === m || (m === 'signin' && mode === 'forgot')
                      ? 'bg-surface text-text-primary shadow-elevation'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {m === 'signin' ? 'Sign in' : 'Sign up'}
                </button>
              ))}
            </div>

            {mode === 'forgot' ? (
              <form onSubmit={handleForgotSubmit} className="flex flex-col gap-3">
                <p className="text-sm text-text-muted">
                  Enter the email you signed up with and we&rsquo;ll send you a link to set a new
                  password.
                </p>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-text-muted">Email</span>
                  <Input
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={disabled}
                  />
                </label>
                {feedbackEl}
                <Button type="submit" loading={submitting} disabled={disabled} className="mt-1">
                  Send reset link
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin')
                    setFeedback(null)
                  }}
                  className="focus-ring self-center rounded text-xs text-text-muted hover:text-text-primary"
                >
                  Back to sign in
                </button>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === 'signup' ? (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-text-muted">Name</span>
                    <Input
                      autoComplete="name"
                      placeholder="Your name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      maxLength={80}
                      disabled={disabled}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-text-muted">Username</span>
                    <Input
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      disabled={disabled}
                    />
                    {uHint && (
                      <span className={cn('flex items-center gap-1 text-xs', uHint.tone)}>
                        {uHint.icon === 'spin' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                        {uHint.icon === 'check' && <Check className="h-3 w-3" aria-hidden />}
                        {uHint.text}
                      </span>
                    )}
                  </label>
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
                </>
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-text-muted">Email</span>
                  <Input
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={disabled}
                  />
                </label>
              )}

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

              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot')
                    setFeedback(null)
                  }}
                  className="focus-ring -mt-1 self-end rounded text-xs text-accent hover:underline"
                >
                  Forgot password?
                </button>
              )}

              {feedbackEl}

              <Button type="submit" loading={submitting} disabled={disabled} className="mt-1">
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </form>
            )}

            {mode !== 'forgot' && (
              <>
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
              </>
            )}

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
