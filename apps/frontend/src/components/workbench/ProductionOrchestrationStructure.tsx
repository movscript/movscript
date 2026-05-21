import { type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { GitBranch, Pencil, Plus, Route, ScrollText, Target } from 'lucide-react'

import type { SemanticEntityRecord } from '@/api/semanticEntities'
import type { ScriptVersion } from '@/api/scriptVersions'
import {
  ScriptVersionBindingInline,
} from '@/components/workbench/ProductionScriptBinding'
import { cn } from '@/lib/utils'
import { Badge, Button } from '@movscript/ui'

export interface ProductionSegmentNavigatorMoment {
  id: number
  identifier: string
  title: string
  description: string
  lineCount: number
  active: boolean
}

export interface ProductionSegmentNavigatorItem {
  id: number
  indexLabel: string
  title: string
  summary: string
  statusClassName: string
  statusLabel: string
  kindLabel: string
  active: boolean
  moments: ProductionSegmentNavigatorMoment[]
  rawRecord: SemanticEntityRecord
}

export function ProductionStructureWorkspaceLayout({
  segments,
  onCreateSegment,
  onCreateSceneMoment,
  onEditSegment,
  onSelectSceneMoment,
  children,
}: {
  segments: ProductionSegmentNavigatorItem[]
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onEditSegment: (record: SemanticEntityRecord) => void
  onSelectSceneMoment: (momentId: number) => void
  children: ReactNode
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)] lg:items-stretch lg:gap-4 lg:overflow-hidden">
      <ProductionSegmentNavigator
        segments={segments}
        onCreateSegment={onCreateSegment}
        onCreateSceneMoment={onCreateSceneMoment}
        onEditSegment={onEditSegment}
        onSelectSceneMoment={onSelectSceneMoment}
      />
      <div className="min-h-0 min-w-0 space-y-3 lg:h-full lg:overflow-y-auto lg:pr-3" style={{ scrollbarGutter: 'stable' }}>{children}</div>
    </div>
  )
}

export function ProductionWorkspaceHeaderContext({
  projectName,
  productionLabel,
  segmentCount,
  sceneMomentCount,
  writingExpressionCount,
  selectedScriptVersion,
  scriptVersions,
  scriptText,
  scriptBlockCount,
  nextStep,
  isFetchingScriptVersions,
  isBindingScriptVersion,
  disabled,
  onBindScriptVersion,
}: {
  projectName: string
  productionLabel: string
  segmentCount: number
  sceneMomentCount: number
  writingExpressionCount: number
  selectedScriptVersion: ScriptVersion | null
  scriptVersions: ScriptVersion[]
  scriptText: string
  scriptBlockCount: number
  nextStep: string
  isFetchingScriptVersions: boolean
  isBindingScriptVersion: boolean
  disabled: boolean
  onBindScriptVersion: (scriptVersionId: number | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 truncate type-label font-semibold text-foreground">{productionLabel}</span>
        <span className="type-tiny text-muted-foreground">{projectName}</span>
        <Badge variant="outline" className="h-6 shrink-0 rounded-full px-2 type-tiny">{segmentCount} 编排段</Badge>
        <Badge variant="outline" className="h-6 shrink-0 rounded-full px-2 type-tiny">{sceneMomentCount} 情节</Badge>
        <Badge variant={writingExpressionCount === 0 ? 'warning' : 'outline'} className="h-6 shrink-0 rounded-full px-2 type-tiny">
          {writingExpressionCount === 0 ? '待补表达' : `${writingExpressionCount} 条表达`}
        </Badge>
        <span className="max-w-[320px] truncate type-tiny text-muted-foreground">下一步：{nextStep}</span>
      </div>
      <ScriptVersionBindingInline
        scriptVersions={scriptVersions}
        selectedScriptVersion={selectedScriptVersion}
        scriptText={scriptText}
        scriptBlockCount={scriptBlockCount}
        isFetching={isFetchingScriptVersions}
        isSaving={isBindingScriptVersion}
        disabled={disabled}
        onChange={onBindScriptVersion}
      />
    </div>
  )
}

export function ProductionSegmentNavigator({
  segments,
  onCreateSegment,
  onCreateSceneMoment,
  onEditSegment,
  onSelectSceneMoment,
}: {
  segments: ProductionSegmentNavigatorItem[]
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onEditSegment: (record: SemanticEntityRecord) => void
  onSelectSceneMoment: (momentId: number) => void
}) {
  return (
    <aside className="min-h-0 pr-3 lg:flex lg:h-full lg:flex-col lg:border-r lg:border-border lg:pr-4">
      <div className="shrink-0 border-b border-border pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="type-body font-semibold text-foreground">编排结构</h2>
            <p className="mt-1 type-label leading-5 text-muted-foreground">按剧本顺序推进编排段和情节。</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="icon-sm" variant="outline" aria-label="新增编排段" onClick={onCreateSegment}>
              <Plus size={12} />
            </Button>
          </div>
        </div>
      </div>
      <div className="max-h-none overflow-visible py-3 pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2" style={{ scrollbarGutter: 'stable' }}>
        {segments.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 type-label leading-5 text-muted-foreground">
            还没有编排段。先添加一个铺垫、发现、反转或释放段，再把情节放进去。
          </div>
        ) : (
          <div className="space-y-3">
            {segments.map((segment) => (
              <section
                key={segment.id}
                className={cn(
                  'relative border-l pl-3 pr-1',
                  segment.active ? 'border-l-primary' : 'border-l-border',
                )}
              >
                <span className={cn(
                  'absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full border bg-background',
                  segment.active ? 'border-primary bg-primary' : 'border-border',
                )} />
                <div className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-foreground px-1.5 py-0.5 type-tiny font-semibold text-background">{segment.indexLabel}</span>
                        <span className={cn('rounded-full px-1.5 py-0.5 type-tiny', segment.statusClassName)}>
                          {segment.statusLabel}
                        </span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 type-label font-semibold leading-5 text-foreground">{segment.title}</h3>
                      <p className="mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground">{segment.summary}</p>
                    </div>
                    <Button size="icon-xs" variant="ghost" aria-label={`编辑编排段 ${segment.title}`} onClick={() => onEditSegment(segment.rawRecord)}>
                      <Pencil size={12} />
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="h-5 rounded-full px-1.5 type-tiny">{segment.moments.length} 情节</Badge>
                    <Badge variant="outline" className="h-5 rounded-full px-1.5 type-tiny">{segment.kindLabel}</Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  {segment.moments.length === 0 ? (
                    <button
                      type="button"
                      className="box-border w-full max-w-full overflow-hidden rounded border border-dashed border-border bg-muted/10 px-2 py-2 text-left type-caption leading-4 text-muted-foreground hover:border-primary/50 hover:bg-primary/5"
                      onClick={() => onCreateSceneMoment(segment.id)}
                    >
                      这个编排段还没有情节，点击添加。
                    </button>
                  ) : segment.moments.map((moment) => (
                    <button
                      key={moment.id}
                      type="button"
                      className={cn(
                        'box-border w-full max-w-full overflow-hidden rounded-md text-left transition-colors',
                        'px-2.5 py-2',
                        moment.active ? 'bg-primary/10 text-foreground ring-1 ring-primary/25' : 'hover:bg-muted/60',
                      )}
                      onClick={() => onSelectSceneMoment(moment.id)}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 items-center type-label font-semibold text-foreground">
                            <span className="mr-1.5 shrink-0 whitespace-nowrap rounded bg-muted px-1.5 py-0.5 type-tiny font-semibold text-muted-foreground">{moment.identifier}</span>
                            <span className="min-w-0 truncate">{moment.title}</span>
                          </p>
                          <p className="mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground">{moment.description}</p>
                        </div>
                        <Badge variant={moment.lineCount === 0 ? 'warning' : 'outline'} className="h-5 shrink-0 rounded-full px-1.5 type-tiny">{moment.lineCount} 条</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

export function ProductionSelectedSegmentSummary({
  selectedSegmentTitle,
  selectedSegmentSummary,
  momentCount,
  lineCount,
  selectedSegmentId,
  onCreateSceneMoment,
}: {
  selectedSegmentTitle: string
  selectedSegmentSummary: string
  momentCount: number
  lineCount: number
  selectedSegmentId: number | null
  onCreateSceneMoment: (segmentId: number) => void
}) {
  return (
    <section className="border-b border-border pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
            <Route size={12} />
            当前编排段
          </div>
          <h2 className="mt-1 type-body font-semibold text-foreground">{selectedSegmentTitle}</h2>
          <p className="mt-1 type-label leading-5 text-muted-foreground">{selectedSegmentSummary}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="outline" className="h-6 rounded-full px-2 type-tiny">{momentCount} 个情节 · {lineCount} 条表达</Badge>
          {selectedSegmentId ? (
            <Button size="sm" className="gap-1.5 type-label" onClick={() => onCreateSceneMoment(selectedSegmentId)}>
              <Plus size={12} />
              添加情节
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function ProductionSceneEditorHeader({
  title,
  selectedSegmentTitle,
  dramaticTask,
  writingProgressLabel,
}: {
  title: string
  selectedSegmentTitle: string
  dramaticTask: string
  writingProgressLabel: string
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
            <GitBranch size={12} />
            情节编辑
          </div>
          <h1 className="mt-1 type-title-sm font-semibold text-foreground">{title}</h1>
          <p className="mt-1 max-w-3xl type-label leading-5 text-muted-foreground">
            情节负责语境和任务；先绑定剧本块，再按顺序写对白、动作、旁白、屏幕文字和镜头描述。
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ProductionContextLine icon={Route} label="所属编排段" value={selectedSegmentTitle} />
        <ProductionContextLine icon={Target} label="戏剧任务" value={dramaticTask} />
        <ProductionContextLine icon={ScrollText} label="表达数量" value={writingProgressLabel} />
      </div>
    </>
  )
}

function ProductionContextLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-border pl-2 type-label">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon size={12} />
        {label}
      </span>
      <span className="mt-1 block truncate font-medium text-foreground">{value}</span>
    </div>
  )
}
