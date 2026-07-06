/**
 * Pure helpers for the auth fields. No I/O — unit-tested.
 * Login is email-only; usernames are a signup/profile display identity whose
 * rules mirror the DB check in 20260616120000_accounts_username.sql.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value.trim())
}

/** Inline validation message for a username, or null when it is valid. */
export function usernameError(value: string): string | null {
  const v = value.trim()
  if (v.length === 0) return 'Pick a username.'
  if (v.length < 3) return 'Use at least 3 characters.'
  if (v.length > 30) return 'Use at most 30 characters.'
  if (!USERNAME_RE.test(v)) return 'Letters, numbers, and underscores only.'
  return null
}

/**
 * Inline validation message for the new-password form (reset flow), or null
 * when it is valid. The 6-char minimum mirrors the signup form and GoTrue's
 * default minimum password length.
 */
export function newPasswordError(password: string, confirm: string): string | null {
  if (password.length === 0) return 'Enter a new password.'
  if (password.length < 6) return 'Use at least 6 characters.'
  if (password !== confirm) return 'Passwords don’t match.'
  return null
}
