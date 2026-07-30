import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, Share2 } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import {
  SHARE_CARD_SIZE,
  canvasToPngBlob,
  drawShareCard,
  shareCardCopy,
  shareCardFilename,
  shareCardMessage,
  type ShareCardKind,
} from './shareCard'

type Result = 'idle' | 'shared' | 'copied' | 'downloaded' | 'failed'

/**
 * The share sheet: a PREVIEW first, then the user decides.
 *
 * Showing the exact image before offering to share it is the point. The same
 * `drawShareCard` produces the preview and the exported blob, so what is handed
 * to the OS is byte-for-byte what was on screen — there is no path where the app
 * shares something the user has not seen.
 *
 * Three routes out, in descending order of niceness, because support is wildly
 * uneven: the native share sheet with a file (mobile Safari/Chrome), the
 * clipboard as an image (desktop Chrome/Edge), and a plain download (everything
 * else). Whatever is unavailable is simply not offered.
 */
export function ShareCardDialog({
  open,
  onClose,
  kind,
  days,
  name,
}: {
  open: boolean
  onClose: () => void
  kind: ShareCardKind
  days: number
  /** Optional; only the FIRST word is ever used, and only if it isn't an email. */
  name?: string | null
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [result, setResult] = useState<Result>('idle')
  const [busy, setBusy] = useState(false)

  const copy = shareCardCopy(kind, days, name)

  // Draw on open, and again once the webfonts are ready — the first paint would
  // otherwise fall back to a system face on a cold load and the exported image
  // would not match the brand.
  useEffect(() => {
    if (!open) return
    setResult('idle')
    let cancelled = false

    const paint = () => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      drawShareCard(ctx, copy)
    }

    paint()
    void document.fonts?.ready.then(paint).catch(() => {
      /* fonts API unavailable — the first paint already stands */
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, days, name])

  const withBlob = useCallback(async (fn: (blob: Blob) => Promise<void> | void) => {
    const canvas = canvasRef.current
    if (!canvas) return
    setBusy(true)
    try {
      await fn(await canvasToPngBlob(canvas))
    } catch {
      setResult('failed')
    } finally {
      setBusy(false)
    }
  }, [])

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
  const canCopyImage =
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    !!navigator.clipboard?.write &&
    typeof window.ClipboardItem !== 'undefined'

  async function share() {
    await withBlob(async (blob) => {
      const file = new File([blob], shareCardFilename(kind, days), { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareCardMessage(kind, days) })
        setResult('shared')
        return
      }
      // Claimed support, refused this payload — fall back rather than fail.
      await navigator.share?.({ text: shareCardMessage(kind, days) })
      setResult('shared')
    })
  }

  async function copyImage() {
    await withBlob(async (blob) => {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
      setResult('copied')
    })
  }

  async function download() {
    await withBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = shareCardFilename(kind, days)
      a.click()
      URL.revokeObjectURL(url)
      setResult('downloaded')
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Share this">
      <div className="space-y-4 p-5">
        <canvas
          ref={canvasRef}
          width={SHARE_CARD_SIZE}
          height={SHARE_CARD_SIZE}
          aria-label={`Share card: ${copy.value} ${copy.caption}`}
          role="img"
          className="mx-auto block aspect-square w-full max-w-[18rem] rounded-2xl"
        />

        <p className="text-center text-xs leading-relaxed text-text-muted">
          The image is made here on your device and holds nothing but the number
          {copy.eyebrow.startsWith('On ') ? '' : ' and your first name'}. Nothing is uploaded.
        </p>

        <div className="flex flex-wrap justify-center gap-2">
          {canNativeShare && (
            <Button onClick={share} disabled={busy}>
              <Share2 className="h-4 w-4" aria-hidden /> Share
            </Button>
          )}
          {canCopyImage && (
            <Button variant="secondary" onClick={copyImage} disabled={busy}>
              <Copy className="h-4 w-4" aria-hidden /> Copy image
            </Button>
          )}
          <Button variant="secondary" onClick={download} disabled={busy}>
            <Download className="h-4 w-4" aria-hidden /> Download
          </Button>
        </div>

        {result !== 'idle' && (
          <p
            role="status"
            className={
              result === 'failed'
                ? 'text-center text-xs text-text-muted'
                : 'flex items-center justify-center gap-1.5 text-center text-xs text-success'
            }
          >
            {result === 'failed' ? (
              'That didn’t go through — try Download instead.'
            ) : (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden />
                {result === 'shared' ? 'Shared' : result === 'copied' ? 'Copied' : 'Downloaded'}
              </>
            )}
          </p>
        )}
      </div>
    </Modal>
  )
}
