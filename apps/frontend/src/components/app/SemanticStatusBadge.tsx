import { Badge } from '@movscript/ui'

import { cn } from '@/lib/utils'
import { semanticStatusClass, semanticStatusLabel, type SemanticTone, semanticToneClass } from './semantic'

export function SemanticStatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status?: string | null
  label?: string
  tone?: SemanticTone
  className?: string
}) {
  const badgeClass = tone ? semanticToneClass(tone, 'badge') : semanticStatusClass(status, 'badge')
  return (
    <Badge variant="outline" className={cn('shrink-0 type-tiny', badgeClass, className)}>
      {label ?? semanticStatusLabel(status)}
    </Badge>
  )
}

export function SemanticDot({ status, tone, className }: { status?: string | null; tone?: SemanticTone; className?: string }) {
  const dotClass = tone ? semanticToneClass(tone, 'dot') : semanticStatusClass(status, 'dot')
  return <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dotClass, className)} />
}
