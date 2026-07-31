/**
 * Where a post-authentication redirect is allowed to send someone.
 *
 * Today the only source of that path is `location.state.from`, which React
 * Router holds in memory and a crafted URL cannot set — so the open-redirect
 * advisories against react-router are not reachable in this app. This exists so
 * that stays true by CONSTRUCTION rather than by inspection: the moment anyone
 * threads a query parameter, a hash, or a stored value into a redirect, it goes
 * through here and the dangerous shapes are already refused.
 *
 * REFUSED, and why each one matters:
 *   `https://evil.test`   — absolute URL, the obvious case
 *   `//evil.test`         — protocol-relative; browsers treat it as absolute
 *   `/\evil.test`         — backslash after the slash: the exact shape of
 *                           CVE-2025-68470's bypass, which browsers normalise
 *                           to `//` and therefore also treat as absolute
 *   `javascript:…`        — scheme injection
 *   control characters    — header/redirect smuggling past a naive check
 *   anything not starting with `/` — not an in-app route
 */
export function safeRedirectPath(candidate: unknown, fallback = '/'): string {
  if (typeof candidate !== 'string') return fallback
  const path = candidate.trim()
  if (!path.startsWith('/')) return fallback
  // Reject `//host` and `/\host` — both resolve to a different origin.
  if (path.length > 1 && (path[1] === '/' || path[1] === '\\')) return fallback
  // Control characters (newline, CR, NUL) can smuggle a value past a naive
  // upstream check; a legitimate route never contains one.
  for (let i = 0; i < path.length; i += 1) {
    const code = path.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return fallback
  }
  return path
}
