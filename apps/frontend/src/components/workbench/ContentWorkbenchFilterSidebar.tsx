import { ArrowLeft, ArrowRight, Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge, Button, Input } from '@movscript/ui'

export interface HierarchyFilterOption {
  value: string
  label: string
  identifier?: string
  count: number
}

interface ContentWorkbenchSearchRecord {
  title?: unknown
  name?: unknown
  label?: unknown
  kind?: unknown
  status?: unknown
  description?: unknown
  prompt?: unknown
  content?: unknown
}

export interface ContentWorkbenchSearchRow {
  title: string
  scope: string
  moment: ContentWorkbenchSearchRecord
  segment?: ContentWorkbenchSearchRecord
  references: ContentWorkbenchSearchRecord[]
  units: ContentWorkbenchSearchRecord[]
  keyframes: ContentWorkbenchSearchRecord[]
}

export function ContentWorkbenchFilterSidebar({
  productionOptions,
  productionValue,
  segmentOptions,
  segmentValue,
  sceneOptions,
  sceneValue,
  query,
  resultCount,
  unitCount,
  collapsed,
  onQueryChange,
  onToggleCollapsed,
  onSelectProduction,
  onSelectSegment,
  onSelectScene,
}: {
  productionOptions: HierarchyFilterOption[]
  productionValue: string
  segmentOptions: HierarchyFilterOption[]
  segmentValue: string
  sceneOptions: HierarchyFilterOption[]
  sceneValue: string
  query: string
  resultCount: number
  unitCount: number
  collapsed: boolean
  onQueryChange: (value: string) => void
  onToggleCollapsed: () => void
  onSelectProduction: (value: string) => void
  onSelectSegment: (value: string) => void
  onSelectScene: (value: string) => void
}) {
  return (
    <aside className={cn('flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card p-2.5 transition-[width]', collapsed ? 'items-center px-2' : '')} data-testid="content-workbench-filter-sidebar" data-sidebar-collapsed={collapsed ? 'true' : undefined}>
      <div className={cn('flex items-center gap-2 px-0.5', collapsed ? 'justify-center' : 'justify-between')}>
        <div className={cn('min-w-0', collapsed ? 'sr-only' : '')}>
          <p className="truncate text-sm font-semibold text-foreground">分类筛选</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{resultCount} 个情节 · {unitCount} 个制作项</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn('h-7 shrink-0 text-xs', collapsed ? 'w-8 px-0' : 'px-2')}
          onClick={onToggleCollapsed}
          title={collapsed ? '展开左侧栏' : '缩略左侧栏'}
          aria-label={collapsed ? '展开左侧栏' : '缩略左侧栏'}
          data-testid="content-workbench-sidebar-collapse"
        >
          {collapsed ? <ArrowRight size={14} /> : (
            <>
              <ArrowLeft size={13} />
              <span>缩略</span>
            </>
          )}
        </Button>
      </div>

      <div className={cn('relative', collapsed ? 'hidden' : '')}>
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索情节、制作项、提示词"
          className="h-9 pl-8 text-xs"
          data-testid="content-workbench-sidebar-search"
        />
      </div>

      <div className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-hidden', collapsed ? 'w-full pr-0' : 'pr-1')} data-testid="content-workbench-hierarchy-filter">
        {collapsed ? null : (
          <>
            <CategoryFilterGroup
              title="制作分类"
              options={productionOptions}
              value={productionValue}
              testId="content-workbench-production-filter"
              emptyText="暂无制作分类"
              onSelect={onSelectProduction}
            />
            <CategoryFilterGroup
              title="情绪段分类"
              options={segmentOptions}
              value={segmentValue}
              testId="content-workbench-segment-filter"
              emptyText="暂无情绪段"
              onSelect={onSelectSegment}
            />
          </>
        )}
        <HierarchyFilterColumn
          title={collapsed ? '情节缩略' : '情节卡片'}
          options={sceneOptions}
          value={sceneValue}
          testId="content-workbench-scene-moment-filter"
          emptyText="当前筛选没有情节"
          rail={collapsed}
          onSelect={onSelectScene}
        />
      </div>
    </aside>
  )
}

export function contentWorkbenchRowMatchesSearch(row: ContentWorkbenchSearchRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return contentWorkbenchRowSearchText(row).includes(normalizedQuery)
}

function HierarchyFilterColumn({
  title,
  options,
  value,
  testId,
  emptyText,
  rail = false,
  onSelect,
}: {
  title: string
  options: HierarchyFilterOption[]
  value: string
  testId: string
  emptyText: string
  rail?: boolean
  onSelect: (value: string) => void
}) {
  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-border bg-background p-2', rail ? 'border-transparent bg-transparent p-0' : '')} data-testid={testId} data-sidebar-rail={rail ? 'true' : undefined}>
      <div className={cn('mb-1.5 flex items-center justify-between gap-2 px-0.5', rail ? 'sr-only' : '')}>
        <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
        <Badge variant="outline">{options.length}</Badge>
      </div>
      {options.length > 0 ? (
        <div className={cn('min-h-0 flex-1 space-y-1 overflow-auto', rail ? 'pr-0' : 'pr-1')} data-testid={rail ? 'content-workbench-scene-rail' : undefined}>
          {options.map((option) => {
            const active = option.value === value
            const identifier = option.identifier || hierarchyOptionInitial(option.label)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelect(option.value)}
                title={rail ? `${identifier} · ${option.label} · ${option.count} 项` : undefined}
                aria-label={rail ? `${option.label}，${option.count} 项` : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border text-left text-xs transition-colors',
                  rail ? 'justify-center px-1 py-1.5' : 'px-2 py-1.5',
                  active ? 'border-primary/60 bg-primary/5 text-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
                )}
                data-sidebar-rail-card={rail ? 'true' : undefined}
              >
                <span className={cn(
                  'flex shrink-0 items-center justify-center whitespace-nowrap rounded border font-semibold',
                  rail ? 'min-h-8 w-full px-1 text-[10px]' : 'h-8 min-w-8 px-1.5 text-[10px]',
                  active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground',
                )} data-testid="content-workbench-hierarchy-thumbnail">
                  {identifier}
                </span>
                <span className={cn('min-w-0 flex-1', rail ? 'sr-only' : '')}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {option.identifier ? <span className="shrink-0 whitespace-nowrap rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">{option.identifier}</span> : null}
                    <span className="truncate font-medium">{option.label}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{option.count} 项</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  )
}

function CategoryFilterGroup({
  title,
  options,
  value,
  testId,
  emptyText,
  onSelect,
}: {
  title: string
  options: HierarchyFilterOption[]
  value: string
  testId: string
  emptyText: string
  onSelect: (value: string) => void
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2" data-testid={testId}>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
        <Badge variant="outline">{options.length}</Badge>
      </div>
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {options.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelect(option.value)}
                className={cn(
                  'inline-flex h-7 max-w-full items-center gap-1.5 rounded border px-2 text-xs transition-colors',
                  active ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
                )}
              >
                <span className="truncate">{option.label}</span>
                <span className="shrink-0 text-[10px] tabular-nums opacity-80">{option.count}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  )
}

function contentWorkbenchRowSearchText(row: ContentWorkbenchSearchRow) {
  const values: string[] = [
    row.title,
    row.scope,
    titleOfRecord(row.moment),
    row.segment ? titleOfRecord(row.segment) : '',
    ...row.references.map((record) => `${titleOfRecord(record)} ${firstText(record.kind, record.description)}`),
    ...row.units.map((unit) => [
      titleOfRecord(unit),
      firstText(unit.kind, unit.status),
      firstText(unit.prompt, unit.description, unit.content),
    ].join(' ')),
    ...row.keyframes.map((keyframe) => `${titleOfRecord(keyframe)} ${firstText(keyframe.prompt, keyframe.description)}`),
  ]
  return values.join(' ').toLowerCase()
}

function hierarchyOptionInitial(label: string) {
  const trimmed = label.trim()
  if (!trimmed) return '#'
  const alphaNumeric = trimmed.match(/[A-Za-z0-9]/)?.[0]
  if (alphaNumeric) return alphaNumeric.toUpperCase()
  return trimmed.slice(0, 1)
}

function titleOfRecord(record?: ContentWorkbenchSearchRecord | null) {
  return firstText(record?.title, record?.name, record?.label, '未命名')
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}
