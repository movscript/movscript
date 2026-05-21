import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { Label } from '@movscript/ui'

export function ContentUnitEditSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  const unsetValue = '__unset'
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value || unsetValue} onValueChange={(next) => onChange(next === unsetValue ? '' : next)}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value || 'unset'} value={option.value || unsetValue}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ContentUnitGenerationInputCard({
  testId,
  icon: Icon,
  title,
  badge,
  badgeVariant,
  detail,
  status,
  tone,
  action,
  onOpen,
}: {
  testId: string
  icon: LucideIcon
  title: string
  badge: string
  badgeVariant: 'outline' | 'secondary' | 'success' | 'warning'
  detail: string
  status: string
  tone: 'default' | 'success' | 'warning'
  action?: ReactNode
  onOpen?: () => void
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2 transition-colors',
        onOpen ? 'cursor-pointer hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : '',
      )}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `打开${title}` : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      data-testid={testId}
    >
      <span className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md',
        tone === 'warning'
          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : tone === 'success'
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'bg-muted text-muted-foreground',
      )}>
        <Icon size={14} />
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">{title}</span>
          <Badge variant={badgeVariant} className="text-[10px]">{badge}</Badge>
        </span>
        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{detail}</span>
      </span>
      <span className="flex max-w-[128px] flex-col items-end gap-2" onClick={(event) => event.stopPropagation()}>
        <Badge variant={tone === 'warning' ? 'warning' : tone === 'success' ? 'success' : 'outline'}>{status}</Badge>
        {action}
      </span>
    </div>
  )
}
