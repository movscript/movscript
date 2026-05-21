import { Search, SlidersHorizontal } from 'lucide-react'

import { WorkbenchEmptyState, WorkbenchList, WorkbenchListItem, WorkbenchThumbnail } from '@/components/workbench/WorkbenchPrimitives'
import { cn } from '@/lib/utils'
import { Badge, Input } from '@movscript/ui'

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
  onQueryChange,
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
  onQueryChange: (value: string) => void
  onSelectProduction: (value: string) => void
  onSelectSegment: (value: string) => void
  onSelectScene: (value: string) => void
}) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden border-b border-border pb-3 xl:self-stretch xl:border-b-0 xl:border-r xl:pr-3" data-testid="content-workbench-filter-sidebar">
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/25 px-2 py-2 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <SlidersHorizontal size={15} />
          </span>
          <span className="min-w-0">
            <p className="truncate type-body font-semibold text-foreground">分类筛选</p>
            <p className="mt-0.5 truncate type-label text-muted-foreground">{resultCount} 个情节 · {unitCount} 个制作项</p>
          </span>
        </div>
      </div>

      <div className="relative rounded-md border border-border bg-background shadow-sm">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索情节、制作项、提示词"
          className="h-9 border-0 bg-transparent pl-8 type-label shadow-none focus-visible:ring-1"
          data-testid="content-workbench-sidebar-search"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pr-1" data-testid="content-workbench-hierarchy-filter">
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
        <HierarchyFilterColumn
          title="情节导航"
          options={sceneOptions}
          value={sceneValue}
          testId="content-workbench-scene-moment-filter"
          emptyText="当前筛选没有情节"
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-border pt-2" data-testid={testId}>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <p className="truncate type-label font-semibold text-foreground">{title}</p>
        <Badge variant="outline">{options.length}</Badge>
      </div>
      {options.length > 0 ? (
        <WorkbenchList className="min-h-0 flex-1 gap-1 overflow-auto pr-1">
          {options.map((option) => {
            const active = option.value === value
            const identifier = option.identifier || hierarchyOptionInitial(option.label)
            return (
              <WorkbenchListItem
                key={option.value}
                onClick={() => onSelect(option.value)}
                active={active}
                className="flex items-center gap-2 px-2 py-1.5 type-label transition-colors"
              >
                <WorkbenchThumbnail className="h-8 min-w-8 shrink-0 font-semibold" data-testid="content-workbench-hierarchy-thumbnail">
                  <span className="flex h-full w-full items-center justify-center px-1 type-tiny">{identifier}</span>
                </WorkbenchThumbnail>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {option.identifier ? <span className="shrink-0 whitespace-nowrap rounded bg-muted px-1 py-0.5 type-tiny font-semibold text-muted-foreground">{option.identifier}</span> : null}
                    <span className="truncate font-medium">{option.label}</span>
                  </span>
                  <span className="mt-0.5 block truncate type-caption text-muted-foreground">{option.count} 项</span>
                </span>
              </WorkbenchListItem>
            )
          })}
        </WorkbenchList>
      ) : (
        <WorkbenchEmptyState title={emptyText} compact />
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
    <div className="rounded-md border border-border/80 bg-muted/20 px-2 py-2" data-testid={testId}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="truncate type-label font-semibold text-foreground">{title}</p>
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
                  'inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 type-label transition-colors',
                  active ? 'border-primary/70 bg-primary/10 text-primary shadow-sm' : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
                )}
              >
                <span className="truncate">{option.label}</span>
                <span className="shrink-0 type-tiny tabular-nums opacity-80">{option.count}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <WorkbenchEmptyState title={emptyText} compact />
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
