import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@movscript/ui'

export function CompactShotListCard({
  active = false,
  kind,
  title,
  frameCount,
  expression,
  cue,
  status,
  context,
  actions,
  onOpen,
  onEdit,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean
  kind: ReactNode
  title: ReactNode
  frameCount: number
  expression?: ReactNode
  cue?: ReactNode
  status?: ReactNode
  context?: ReactNode
  actions?: ReactNode
  onOpen: () => void
  onEdit?: () => void
}) {
  return (
    <div
      className={cn('content-compact-shot-card', className)}
      data-active={active ? 'true' : undefined}
      data-testid="content-compact-shot-card"
      {...props}
    >
      <button
        type="button"
        className="content-compact-shot-card__button"
        onClick={onOpen}
        onDoubleClick={onEdit}
      >
        <span className="content-compact-shot-card__topline">
          <span className="content-compact-shot-card__kind">{kind}</span>
          <span className="content-compact-shot-card__title">{title}</span>
          {status ? <span className="content-compact-shot-card__status">{status}</span> : null}
        </span>
        <span className="content-compact-shot-card__expression">{expression || '未填写镜头表达'}</span>
        {cue ? <span className="content-compact-shot-card__cue">{cue}</span> : null}
        <span className="content-compact-shot-card__meta">
          <span>{frameCount} 关键帧</span>
          {context ? <span>{context}</span> : null}
        </span>
      </button>
      {actions ? <div className="content-compact-shot-card__actions">{actions}</div> : null}
    </div>
  )
}
