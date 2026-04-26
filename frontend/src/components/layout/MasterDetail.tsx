import { cn } from '@/lib/utils'

interface MasterDetailProps {
  list: React.ReactNode
  detail: React.ReactNode
  listWidth?: number
  className?: string
}

export function MasterDetail({ list, detail, listWidth = 288, className }: MasterDetailProps) {
  return (
    <div className={cn('flex h-full overflow-hidden bg-background', className)}>
      <div
        style={{ width: listWidth }}
        className="shrink-0 border-r border-border flex flex-col overflow-hidden bg-muted/50"
      >
        {list}
      </div>
      <div className="flex-1 overflow-hidden">
        {detail}
      </div>
    </div>
  )
}

interface EmptyDetailProps {
  message?: string
}

export function EmptyDetail({ message = '从左侧列表选择一个项目' }: EmptyDetailProps) {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      {message}
    </div>
  )
}
