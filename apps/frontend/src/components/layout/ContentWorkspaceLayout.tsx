import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ContentWorkspaceLayoutProps {
  header?: ReactNode
  overview: ReactNode
  filters?: ReactNode
  list: ReactNode
  preview: ReactNode
  detail: ReactNode
  upstream: ReactNode
  downstream: ReactNode
  bottom?: ReactNode
  minWidth?: number
  listWidth?: string
  detailWidth?: string
  coreMinWidth?: number
  className?: string
  flow?: boolean
}

export function ContentWorkspaceLayout({
  header,
  overview,
  filters,
  list,
  preview,
  detail,
  upstream,
  downstream,
  bottom,
  minWidth,
  listWidth = '360px',
  detailWidth = 'minmax(0, 1fr)',
  coreMinWidth = 1160,
  className,
  flow = false,
}: ContentWorkspaceLayoutProps) {
  const contentStyle = {
    minWidth,
    '--content-workspace-columns': `${listWidth} ${detailWidth}`,
    '--content-workspace-core-min': `${coreMinWidth}px`,
  } as CSSProperties

  return (
    <div className={cn('content-workspace-shell bg-background', flow ? '' : 'h-full overflow-auto', className)}>
      <div className="space-y-3 p-4" style={contentStyle}>
        {header ? <section className="content-workspace-header">{header}</section> : null}
        <section className="content-workspace-overview">{overview}</section>
        {filters ? <section>{filters}</section> : null}
        <section className={cn('content-workspace-core grid gap-4', flow ? '' : 'h-[min(820px,82vh)] min-h-[560px] overflow-hidden')}>
          <div className={cn('content-workspace-column min-w-0', flow ? 'space-y-4' : 'min-h-0 space-y-4 overflow-y-auto pr-1')}>{list}</div>
          <div className={cn('content-workspace-column min-w-0', flow ? 'flex flex-col gap-4' : 'min-h-0 space-y-4 overflow-y-auto pr-1')}>
            {detail}
            {preview}
          </div>
        </section>
        <section className="border-t border-border pt-4">
          {bottom ?? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="min-w-0 space-y-4">{upstream}</div>
              <div className="min-w-0 space-y-4">{downstream}</div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
