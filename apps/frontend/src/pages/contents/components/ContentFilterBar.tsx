import type { ReactNode } from 'react'
import { ListFilter, Search, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button, Input } from '@movscript/ui'

export interface FilterOption {
  value: string
  label: string
  count?: number
}

interface ContentFilterBarProps {
  query: string
  onQueryChange: (value: string) => void
  queryPlaceholder?: string
  filters?: Array<{
    id: string
    label: string
    value: string
    options: FilterOption[]
    onChange: (value: string) => void
  }>
  chips?: Array<{
    id: string
    label: string
    onRemove: () => void
  }>
  resultCount?: number
  totalCount?: number
  actions?: ReactNode
  className?: string
}

export function ContentFilterBar({
  query,
  onQueryChange,
  queryPlaceholder = '搜索',
  filters = [],
  chips = [],
  resultCount,
  totalCount,
  actions,
  className,
}: ContentFilterBarProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={queryPlaceholder}
            className="h-9 pl-8 type-body"
          />
        </div>

        {filters.map((filter) => (
          <label key={filter.id} className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-2.5">
            <span className="flex items-center gap-1.5 type-label text-muted-foreground">
              <ListFilter size={14} />
              {filter.label}
            </span>
            <select
              value={filter.value}
              onChange={(event) => filter.onChange(event.target.value)}
              className="h-7 min-w-28 bg-transparent type-label text-foreground outline-none"
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.count === undefined ? option.label : `${option.label} (${option.count})`}
                </option>
              ))}
            </select>
          </label>
        ))}

        {typeof resultCount === 'number' && typeof totalCount === 'number' ? (
          <span className="shrink-0 type-label text-muted-foreground">
            {resultCount} / {totalCount}
          </span>
        ) : null}

        {actions}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2">
          <span className="type-label text-muted-foreground">当前筛选</span>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.onRemove}
              className="inline-flex h-6 max-w-[240px] items-center gap-1 rounded-md bg-muted px-2 type-caption text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="truncate">{chip.label}</span>
              <X size={12} />
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => chips.forEach((chip) => chip.onRemove())}
            className="ml-auto"
          >
            清空
          </Button>
        </div>
      ) : null}
    </div>
  )
}
