/**
 * The share card: a branded PNG drawn in the browser.
 *
 * NOTHING LEAVES THE DEVICE UNTIL THE USER SHARES IT. The image is drawn on a
 * canvas here, in the page — there is no upload, no server render, no image
 * service and no request of any kind. The bytes exist only in memory until the
 * user hands them to the OS share sheet themselves.
 *
 * WHAT IT CAN CONTAIN, exhaustively: one number, one line of copy about that
 * number, an optional FIRST name, and the wordmark. No task titles, no habit
 * names, no dates, no email, no avatar. This matters most for the quit tracker,
 * where the habit's name is exactly the thing somebody would be mortified to
 * post — so the name is not passed to this module at all, rather than passed and
 * carefully not drawn.
 */

/** What the card is celebrating. */
export type ShareCardKind = 'streak' | 'quit' | 'challenge'

export interface ShareCardCopy {
  /** The big number. */
  value: string
  /** The line under it. */
  caption: string
  /** Small line at the top; empty when there is no name to use. */
  eyebrow: string
}

/** Square: the one aspect ratio that survives every feed and message thread. */
export const SHARE_CARD_SIZE = 1080

/**
 * First name only, trimmed and capped — and never anything that could be an
 * email or a full identity. A blank/absent name simply drops the line.
 */
export function firstNameOnly(name: string | null | undefined): string {
  if (!name) return ''
  const first = name.trim().split(/\s+/)[0] ?? ''
  if (!first || first.includes('@')) return ''
  return first.slice(0, 20)
}

/**
 * The copy on the card. Pure, so the wording is unit-tested rather than trusted.
 *
 * The quit line says "days clean" and NOT what was quit. The streak line says
 * "days planning" and not what was planned. Both are true, both are shareable
 * without disclosing anything, and neither is a boast the user did not make.
 */
export function shareCardCopy(
  kind: ShareCardKind,
  days: number,
  name?: string | null,
): ShareCardCopy {
  const n = Math.max(0, Math.floor(days))
  const first = firstNameOnly(name)
  const eyebrow = first ? `${first} on Todonado` : 'On Todonado'

  if (kind === 'quit') {
    return {
      value: String(n),
      caption: n === 1 ? 'day clean' : 'days clean',
      eyebrow,
    }
  }

  // A challenge card carries its LENGTH, never which challenge it was. That is
  // the same rule as the quit card and it exists for the same reason: one of
  // the challenges counts clean days, and "30 days clean" on a public card is
  // the user's business to disclose, not the app's. Every challenge therefore
  // produces the same neutral card, and nothing private can leak through it.
  if (kind === 'challenge') {
    return {
      value: String(n),
      // No plural branch: the number qualifies "day challenge", so it reads
      // "7 day challenge, done" and "1 day challenge, done" alike.
      caption: 'day challenge, done',
      eyebrow,
    }
  }
  return {
    value: String(n),
    caption: n === 1 ? 'day of showing up' : 'days of showing up',
    eyebrow,
  }
}

/** The filename a download gets. Contains no personal data. */
export function shareCardFilename(kind: ShareCardKind, days: number): string {
  const n = Math.max(0, Math.floor(days))
  const slug = kind === 'quit' ? 'clean' : kind === 'challenge' ? 'challenge' : 'streak'
  return `todonado-${slug}-${n}-days.png`
}

/** Text that accompanies the image in the native share sheet. */
export function shareCardMessage(kind: ShareCardKind, days: number): string {
  const n = Math.max(0, Math.floor(days))
  const noun = n === 1 ? 'day' : 'days'
  if (kind === 'quit') return `${n} ${noun} clean. 🌪️ todonado.com`
  if (kind === 'challenge') return `${n}-day challenge, done. 🌪️ todonado.com`
  return `${n} ${noun} of showing up. 🌪️ todonado.com`
}

/**
 * Draw the card onto a 2D context sized SHARE_CARD_SIZE square.
 *
 * Kept separate from any React so the same function serves the on-screen preview
 * and the exported blob — the user can never be shown one image and hand over a
 * different one.
 *
 * Colours are the design-system tokens written as literals, because a canvas
 * cannot resolve a Tailwind class. This is the same sanctioned exception the
 * template catalog's `color` values use.
 */
export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  copy: ShareCardCopy,
  size: number = SHARE_CARD_SIZE,
): void {
  const S = size
  ctx.clearRect(0, 0, S, S)

  // Background: the app's own background, with the brand gradient bleeding in
  // from the top-left exactly as bg-brand-gradient does.
  ctx.fillStyle = '#0A0D16'
  ctx.fillRect(0, 0, S, S)

  const glow = ctx.createLinearGradient(0, 0, S, S)
  glow.addColorStop(0, 'rgba(108, 92, 231, 0.55)') // brand violet
  glow.addColorStop(0.55, 'rgba(78, 168, 255, 0.18)') // accent blue
  glow.addColorStop(1, 'rgba(10, 13, 22, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, S, S)

  // Inner card, so the artwork reads as a card rather than a full-bleed poster.
  const pad = S * 0.07
  const r = S * 0.055
  roundRect(ctx, pad, pad, S - pad * 2, S - pad * 2, r)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)' // surface
  ctx.fill()
  ctx.lineWidth = Math.max(2, S * 0.002)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.stroke()

  ctx.textAlign = 'center'

  // Eyebrow
  ctx.fillStyle = '#94A3B8' // text-muted
  ctx.font = `500 ${Math.round(S * 0.035)}px Inter, system-ui, sans-serif`
  ctx.fillText(copy.eyebrow, S / 2, S * 0.28)

  // The number — the whole point of the card.
  const numberGradient = ctx.createLinearGradient(S * 0.2, 0, S * 0.8, 0)
  numberGradient.addColorStop(0, '#6C5CE7')
  numberGradient.addColorStop(1, '#4EA8FF')
  ctx.fillStyle = numberGradient
  ctx.font = `700 ${Math.round(S * 0.26)}px Poppins, Inter, system-ui, sans-serif`
  ctx.fillText(copy.value, S / 2, S * 0.53)

  // Caption
  ctx.fillStyle = '#F8FAFC' // text-primary
  ctx.font = `600 ${Math.round(S * 0.062)}px Poppins, Inter, system-ui, sans-serif`
  ctx.fillText(copy.caption, S / 2, S * 0.645)

  // Wordmark
  ctx.fillStyle = '#94A3B8'
  ctx.font = `500 ${Math.round(S * 0.032)}px Inter, system-ui, sans-serif`
  ctx.fillText('🌪️  todonado.com', S / 2, S * 0.845)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Canvas → PNG blob. Rejects rather than silently producing an empty file. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not render the image'))
    }, 'image/png')
  })
}
