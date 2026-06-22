import { Link } from 'react-router-dom'
import { LayoutTemplate } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui'
import { FEATURES } from '@/lib/config'

/**
 * Activation CTA surfaced in empty states (Today / Inbox / Projects). Renders
 * nothing when the templates feature is off, so empty states stay correct.
 */
export function StartFromTemplateCTA({ variant = 'primary' }: { variant?: ButtonProps['variant'] }) {
  if (!FEATURES.templates) return null
  return (
    <Link to="/templates">
      <Button variant={variant}>
        <LayoutTemplate className="h-4 w-4" aria-hidden />
        Start from a template
      </Button>
    </Link>
  )
}
