import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface WorkspaceShellProps {
  sidebar?: ReactNode
  header: ReactNode
  children: ReactNode
  assistantPanel?: ReactNode
  contentFrameClassName?: string
  contentPaddingClassName?: string
}

export function WorkspaceShell({
  sidebar,
  header,
  children,
  assistantPanel,
  contentFrameClassName,
  contentPaddingClassName = 'p-2.5',
}: WorkspaceShellProps) {
  return (
    <div className="app-shell fixed inset-0 flex flex-col overflow-hidden text-foreground">
      {header}
      <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
          {sidebar}
          <div className={cn('min-w-0 flex-1 overflow-hidden', contentPaddingClassName)}>
            <div className={cn('app-content-frame h-full min-h-0 min-w-0 overflow-hidden rounded-lg', contentFrameClassName)}>
              {children}
            </div>
          </div>
          {assistantPanel}
        </div>
      </main>
    </div>
  )
}
