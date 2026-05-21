import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { GitBranch } from 'lucide-react'
import { Badge } from '@movscript/ui'

import { cn } from '@/lib/utils'

export function ProposalReviewShell({
  kind,
  title,
  description,
  countLabel,
  action,
  children,
  className,
  icon: Icon = GitBranch,
}: {
  kind: string
  title: string
  description: string
  countLabel?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  icon?: LucideIcon
}) {
  return (
    <section className={cn('min-w-0 rounded-lg border border-border bg-card p-4', className)}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 type-label font-medium text-muted-foreground">
            <Icon size={14} />
            <span>{kind}</span>
          </div>
          <h2 className="mt-1 type-body font-semibold text-foreground">{title}</h2>
          <p className="mt-1 max-w-3xl type-label leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {countLabel ? <Badge variant="secondary">{countLabel}</Badge> : null}
          {action}
        </div>
      </div>
      {children}
    </section>
  )
}
