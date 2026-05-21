import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Wrench } from 'lucide-react'

export interface ToolHeaderProps {
  title: string
  description?: string
  icon?: LucideIcon
  metadata?: ReactNode
  actions?: ReactNode
}

export function ToolHeader({
  title,
  description,
  icon: Icon = Wrench,
  metadata,
  actions,
}: ToolHeaderProps) {
  return (
    <header data-testid="tool-header" className="shrink-0 border-b border-border bg-background px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate type-title-sm font-semibold text-foreground">{title}</h1>
              {metadata}
            </div>
            {description ? (
              <p className="mt-1 max-w-4xl truncate type-label text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  )
}
