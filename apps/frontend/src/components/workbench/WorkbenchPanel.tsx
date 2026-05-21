import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export function WorkbenchPanel({
  title,
  icon: Icon,
  children,
  action,
  className,
  bodyClassName,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
  action?: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-md border border-border bg-card', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={15} className="shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn('p-2.5', bodyClassName)}>{children}</div>
    </section>
  )
}
