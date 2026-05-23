import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { GitBranch } from 'lucide-react'
import { AppSection, Badge } from '@movscript/ui'

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
  const sectionAction = countLabel || action ? (
    <>
      {countLabel ? <Badge variant="secondary">{countLabel}</Badge> : null}
      {action}
    </>
  ) : null

  return (
    <AppSection
      icon={Icon}
      eyebrow={kind}
      title={title}
      description={description}
      action={sectionAction}
      className={className}
    >
      {children}
    </AppSection>
  )
}
