import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, ArrowRight, Boxes, FileText, GitBranch, Layers3, Pencil, Plus, Route, ScrollText, Target } from 'lucide-react'

import type { SemanticEntityRecord } from '@/api/semanticEntities'
import type { ScriptVersion } from '@/api/scriptVersions'
import {
  ProductionScriptSourceSummary,
  ScriptVersionBindingBar,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  return (
    <div className={cn(
      'grid min-h-0 grid-cols-1 gap-3 transition-[grid-template-columns]',
      sidebarCollapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[280px_minmax(0,1fr)]',
    )}>
      <ProductionSegmentNavigator
        segments={segments}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebarCollapsed={() => setSidebarCollapsed((value) => !value)}
        onCreateSegment={onCreateSegment}
        onCreateSceneMoment={onCreateSceneMoment}
        onEditSegment={onEditSegment}
        onSelectSceneMoment={onSelectSceneMoment}
      />
      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  )
}

export function ProductionWorkspaceOverviewPanel({
  projectName,
  productionLabel,
  segmentCount,
  sceneMomentCount,
  writingProgressLabel,
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
  writingProgressLabel: string
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
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
            <Boxes size={12} />
            制作信息
          </div>
          <h1 className="mt-1 type-title-sm font-semibold text-foreground">{productionLabel}</h1>
          <p className="mt-1 max-w-3xl type-label leading-5 text-muted-foreground">
            制作在这里绑定剧本；情节编辑时再从这份剧本里选择具体剧本块。
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant="outline" className="h-7 rounded-full px-2 type-label">{segmentCount} 编排段</Badge>
          <Badge variant="outline" className="h-7 rounded-full px-2 type-label">{sceneMomentCount} 情节</Badge>
          <Badge variant="outline" className="h-7 rounded-full px-2 type-label">{writingProgressLabel}</Badge>
        </div>
      </div>
      <ScriptVersionBindingBar
        scriptVersions={scriptVersions}
        selectedScriptVersion={selectedScriptVersion}
        isFetching={isFetchingScriptVersions}
        isSaving={isBindingScriptVersion}
        disabled={disabled}
        onChange={onBindScriptVersion}
      />
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <ProductionContextLine icon={Layers3} label="项目" value={projectName} />
        <ProductionContextLine icon={ScrollText} label="制作剧本" value={selectedScriptVersion ? selectedScriptVersion.title || `剧本 #${selectedScriptVersion.ID}` : '未绑定'} />
        <ProductionContextLine icon={FileText} label="可选剧本块" value={`${scriptBlockCount} 个`} />
        <ProductionContextLine icon={Target} label="下一步" value={nextStep} />
      </div>
      <ProductionScriptSourceSummary scriptVersion={selectedScriptVersion} scriptText={scriptText} />
    </section>
  )
}

export function ProductionSegmentNavigator({
  segments,
  sidebarCollapsed,
  onToggleSidebarCollapsed,
  onCreateSegment,
  onCreateSceneMoment,
  onEditSegment,
  onSelectSceneMoment,
}: {
  segments: ProductionSegmentNavigatorItem[]
  sidebarCollapsed: boolean
  onToggleSidebarCollapsed: () => void
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onEditSegment: (record: SemanticEntityRecord) => void
  onSelectSceneMoment: (momentId: number) => void
}) {
  return (
    <aside className={cn('min-h-0 overflow-hidden rounded-lg border border-border bg-background lg:sticky lg:top-[76px] lg:self-start', sidebarCollapsed ? 'px-1.5' : '')} data-sidebar-collapsed={sidebarCollapsed ? 'true' : undefined}>
      <div className={cn('border-b border-border bg-muted/30 py-3', sidebarCollapsed ? 'px-1' : 'px-3')}>
        <div className={cn('flex gap-2', sidebarCollapsed ? 'flex-col items-center' : 'items-start justify-between')}>
          <div className={cn('min-w-0', sidebarCollapsed ? 'sr-only' : '')}>
            <h2 className="type-body font-semibold text-foreground">编排段列表</h2>
            <p className="mt-1 type-label leading-5 text-muted-foreground">按顺序查看编排段，并选择要编辑的情节。</p>
          </div>
          <div className={cn('flex shrink-0 gap-1', sidebarCollapsed ? 'flex-col' : '')}>
            <Button
              type="button"
              size={sidebarCollapsed ? 'icon-sm' : 'sm'}
              variant="ghost"
              className={cn('type-label', sidebarCollapsed ? '' : 'gap-1.5')}
              title={sidebarCollapsed ? '展开左侧栏' : '缩略左侧栏'}
              aria-label={sidebarCollapsed ? '展开左侧栏' : '缩略左侧栏'}
              onClick={onToggleSidebarCollapsed}
            >
              {sidebarCollapsed ? <ArrowRight size={13} /> : (
                <>
                  <ArrowLeft size={13} />
                  <span>缩略</span>
                </>
              )}
            </Button>
            <Button size="icon-sm" variant="outline" aria-label="新增编排段" onClick={onCreateSegment}>
              <Plus size={12} />
            </Button>
          </div>
        </div>
      </div>
      <div className={cn('max-h-none overflow-visible lg:max-h-[calc(100vh-190px)] lg:overflow-auto', sidebarCollapsed ? 'p-1.5' : 'p-2')}>
        {segments.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 type-label leading-5 text-muted-foreground">
            还没有编排段。先添加一个铺垫、发现、反转或释放段，再把情节放进去。
          </div>
        ) : (
          <div className="space-y-2">
            {segments.map((segment) => (
              <section key={segment.id} className="overflow-hidden rounded-md border border-border bg-background">
                <div className={cn('border-b border-border px-3 py-2.5', sidebarCollapsed ? 'hidden' : '', segment.active ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : 'bg-muted/20')}>
                  <div className={cn('flex gap-2', sidebarCollapsed ? 'justify-center' : 'items-start justify-between')}>
                    <div className="min-w-0">
                      <div className={cn('flex flex-wrap items-center gap-1.5', sidebarCollapsed ? 'justify-center' : '')}>
                        <span className="rounded bg-foreground px-1.5 py-0.5 type-tiny font-semibold text-background">{segment.indexLabel}</span>
                        <span className={cn('rounded-full px-1.5 py-0.5 type-tiny', sidebarCollapsed ? 'hidden' : '', segment.statusClassName)}>
                          {segment.statusLabel}
                        </span>
                      </div>
                      <h3 className={cn('mt-2 line-clamp-2 type-body font-semibold leading-5 text-foreground', sidebarCollapsed ? 'sr-only' : '')}>{segment.title}</h3>
                      <p className={cn('mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground', sidebarCollapsed ? 'sr-only' : '')}>{segment.summary}</p>
                    </div>
                    <Button size="icon-xs" variant="ghost" className={cn(sidebarCollapsed ? 'hidden' : '')} aria-label={`编辑编排段 ${segment.title}`} onClick={() => onEditSegment(segment.rawRecord)}>
                      <Pencil size={11} />
                    </Button>
                  </div>
                  <div className={cn('mt-2 flex flex-wrap gap-1.5', sidebarCollapsed ? 'hidden' : '')}>
                    <Badge variant="outline" className="h-5 rounded-full px-1.5 type-tiny">{segment.moments.length} 情节</Badge>
                    <Badge variant="outline" className="h-5 rounded-full px-1.5 type-tiny">{segment.kindLabel}</Badge>
                  </div>
                </div>
                <div className={cn('space-y-1.5', sidebarCollapsed ? 'p-1' : 'p-2')}>
                  {segment.moments.length === 0 ? (
                    sidebarCollapsed ? null : <button
                      type="button"
                      className="w-full rounded border border-dashed border-border bg-muted/10 px-2 py-3 text-left type-caption leading-4 text-muted-foreground hover:border-primary/50 hover:bg-primary/5"
                      onClick={() => onCreateSceneMoment(segment.id)}
                    >
                      这个编排段还没有情节，点击添加。
                    </button>
                  ) : segment.moments.map((moment) => (
                    <button
                      key={moment.id}
                      type="button"
                      className={cn(
                        'w-full rounded-md border text-left transition-colors',
                        sidebarCollapsed ? 'px-1 py-1.5 text-center' : 'px-2.5 py-2',
                        moment.active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50 hover:bg-primary/5',
                      )}
                      title={sidebarCollapsed ? `${moment.identifier} · ${moment.title}` : undefined}
                      aria-label={sidebarCollapsed ? `${moment.identifier}，${moment.title}` : undefined}
                      onClick={() => onSelectSceneMoment(moment.id)}
                    >
                      <div className={cn('flex gap-2', sidebarCollapsed ? 'justify-center' : 'items-start justify-between')}>
                        <div className="min-w-0">
                          <p className={cn('truncate font-semibold text-foreground', sidebarCollapsed ? 'type-tiny' : 'type-label')}>
                            <span className={cn('whitespace-nowrap rounded bg-muted px-1.5 py-0.5 type-tiny font-semibold text-muted-foreground', sidebarCollapsed ? 'bg-transparent px-0 text-foreground' : 'mr-1.5')}>{moment.identifier}</span>
                            <span className={sidebarCollapsed ? 'sr-only' : ''}>{moment.title}</span>
                          </p>
                          <p className={cn('mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground', sidebarCollapsed ? 'sr-only' : '')}>{moment.description}</p>
                        </div>
                        <Badge variant={moment.lineCount === 0 ? 'warning' : 'outline'} className={cn('h-5 rounded-full px-1.5 type-tiny', sidebarCollapsed ? 'hidden' : '')}>{moment.lineCount} 条</Badge>
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
    <section className="rounded-lg border border-border bg-background p-4">
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
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <ProductionContextLine icon={Route} label="所属编排段" value={selectedSegmentTitle} />
        <ProductionContextLine icon={Target} label="戏剧任务" value={dramaticTask} />
        <ProductionContextLine icon={ScrollText} label="表达数量" value={writingProgressLabel} />
      </div>
    </>
  )
}

function ProductionContextLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-2 type-label">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon size={12} />
        {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
