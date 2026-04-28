import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import type { ArtifactRef, Script, Asset, Episode, Scene, Storyboard, Shot, FinalVideo, RawResource, Pipeline, PipelineNode, ProjectMember } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, LayoutTemplate, ChevronDown, GripVertical, Network, Search, X } from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import {
  ScriptCreateForm, AssetCreateForm, StoryboardCreateForm, ShotCreateForm,
} from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { type EntityKind, type WorkArtifactKind, KIND_CONFIG, WORK_ARTIFACT_KINDS } from './config'
import { ScriptWorkspace } from './workspaces/ScriptWorkspace'
import { AssetWorkspace } from './workspaces/AssetWorkspace'
import { StoryboardWorkspace } from './workspaces/StoryboardWorkspace'
import { ShotWorkspace } from './workspaces/ShotWorkspace'
import { EmptyWorkspace } from './workspaces/EmptyWorkspace'
import { EmbeddedCanvas, type EntityDragItem, type PushTarget } from './EmbeddedCanvas'
import { Button, Input, Label } from '@movscript/ui'
import { FinalVideoDetail } from '@/pages/final-videos/FinalVideosPage'
import PipelineEditorPage from '@/pages/pipeline/PipelineEditorPage'

const BOTTOM_PANEL_DEFAULT_H = 420
const BOTTOM_PANEL_MIN_H = 260
const BOTTOM_PANEL_CHROME_H = 44

type BottomPanel = 'canvas' | 'pipeline' | null

interface OpenTab {
  key: string   // `${kind}:${id}`
  kind: EntityKind
  id: number
  label: string
}

export default function CreationPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [activeKind, setActiveKind] = useState<WorkArtifactKind>('script')
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [finalVideoTitle, setFinalVideoTitle] = useState('')
  const [artifactSearch, setArtifactSearch] = useState('')

  const [bottomPanel, setBottomPanel] = useState<BottomPanel>(null)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(BOTTOM_PANEL_DEFAULT_H)
  const [isResizing, setIsResizing] = useState(false)
  const workspaceBodyRef = useRef<HTMLDivElement | null>(null)

  /* ── Data queries ── */
  const { data: _scripts }     = useQuery<Script[]>({     queryKey: ['scripts', projectId],            queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),     enabled: !!projectId })
  const { data: _assets }      = useQuery<Asset[]>({      queryKey: ['assets', projectId],             queryFn: () => api.get(`/projects/${projectId}/assets`).then((r) => r.data),      enabled: !!projectId })
  const { data: _episodes }    = useQuery<Episode[]>({    queryKey: ['episodes-project', projectId],   queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),    enabled: !!projectId })
  const { data: _scenes }      = useQuery<Scene[]>({      queryKey: ['scenes', projectId],             queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),      enabled: !!projectId })
  const { data: _storyboards } = useQuery<Storyboard[]>({ queryKey: ['storyboards-project', projectId], queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data), enabled: !!projectId })
  const { data: _shots }       = useQuery<Shot[]>({       queryKey: ['shots-project', projectId],      queryFn: () => api.get(`/projects/${projectId}/shots`).then((r) => r.data),       enabled: !!projectId })
  const { data: _finalVideos } = useQuery<FinalVideo[]>({ queryKey: ['final-videos', projectId],       queryFn: () => api.get(`/projects/${projectId}/final-videos`).then((r) => r.data), enabled: !!projectId })
  const { data: _artifactRefs } = useQuery<ArtifactRef[]>({ queryKey: ['artifact-refs', projectId],     queryFn: () => api.get(`/projects/${projectId}/artifact-refs`).then((r) => r.data), enabled: !!projectId })
  const { data: pipeline }     = useQuery<Pipeline>({     queryKey: ['pipeline', projectId],           queryFn: () => api.get(`/projects/${projectId}/pipeline`).then((r) => r.data),      enabled: !!projectId })
  const { data: projectDetail } = useQuery<{ members?: ProjectMember[] }>({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((r) => r.data),
    enabled: !!projectId,
  })

  const scripts     = _scripts     ?? []
  const assets      = _assets      ?? []
  const episodes    = _episodes    ?? []
  const scenes      = _scenes      ?? []
  const storyboards = _storyboards ?? []
  const shots       = _shots       ?? []
  const finalVideos = _finalVideos ?? []
  const artifactRefs = _artifactRefs ?? []
  const members = projectDetail?.members ?? []

  const counts: Record<WorkArtifactKind, number> = {
    script: artifactRefs.filter((item) => item.kind === 'script').length,
    asset: artifactRefs.filter((item) => item.kind === 'asset').length,
    storyboard: artifactRefs.filter((item) => item.kind === 'storyboard').length,
    shot: artifactRefs.filter((item) => item.kind === 'shot').length,
    final_video: artifactRefs.filter((item) => item.kind === 'final_video').length,
  }

  /* ── Tab management ── */
  function tabKey(kind: EntityKind, id: number) { return `${kind}:${id}` }

  function openTab(kind: EntityKind, id: number, label: string) {
    const key = tabKey(kind, id)
    setOpenTabs((prev) => {
      if (prev.find((t) => t.key === key)) return prev
      return [...prev, { key, kind, id, label }]
    })
    setActiveTabKey(key)
  }

  function closeTab(key: string) {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.key === key)
      const next = prev.filter((t) => t.key !== key)
      if (activeTabKey === key) {
        const newActive = next[Math.min(idx, next.length - 1)]
        setActiveTabKey(newActive?.key ?? null)
      }
      return next
    })
  }

  const activeTab = openTabs.find((t) => t.key === activeTabKey) ?? null

  /* ── Item strip ── */
  function getItems(): ArtifactRef[] {
    return artifactRefs.filter((item) => item.kind === activeKind)
  }

  /* ── Bottom panel ── */
  const getBottomPanelMaxHeight = useCallback(() => {
    const bodyHeight = workspaceBodyRef.current?.clientHeight ?? window.innerHeight - 180
    return Math.max(BOTTOM_PANEL_MIN_H, bodyHeight - BOTTOM_PANEL_CHROME_H)
  }, [])

  const clampBottomPanelHeight = useCallback((height: number) => {
    return Math.max(BOTTOM_PANEL_MIN_H, Math.min(getBottomPanelMaxHeight(), height))
  }, [getBottomPanelMaxHeight])

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startH = bottomPanelHeight
    function onMouseMove(ev: MouseEvent) {
      const delta = startY - ev.clientY
      setBottomPanelHeight(clampBottomPanelHeight(startH + delta))
    }
    function onMouseUp() {
      setIsResizing(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [bottomPanelHeight, clampBottomPanelHeight])

  useEffect(() => {
    if (!bottomPanel) return

    const clampCurrentHeight = () => {
      setBottomPanelHeight((height) => clampBottomPanelHeight(height))
    }

    clampCurrentHeight()
    window.addEventListener('resize', clampCurrentHeight)

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(clampCurrentHeight)
      : null
    if (observer && workspaceBodyRef.current) observer.observe(workspaceBodyRef.current)

    return () => {
      window.removeEventListener('resize', clampCurrentHeight)
      observer?.disconnect()
    }
  }, [bottomPanel, clampBottomPanelHeight])

  /* ── Push targets ── */
  function getPushTargets(): PushTarget[] {
    const targets: PushTarget[] = []
    if (activeTab) {
      if (activeTab.kind === 'asset') {
        const a = assets.find((x) => x.ID === activeTab.id)
        if (a) targets.push({ kind: 'asset', id: a.ID, label: a.name })
      } else if (activeTab.kind === 'storyboard') {
        const b = storyboards.find((x) => x.ID === activeTab.id)
        if (b) targets.push({ kind: 'storyboard', id: b.ID, label: `#${b.order} ${b.title || b.description || t('common.emptyTitle')}` })
      } else if (activeTab.kind === 'scene') {
        const s = scenes.find((x) => x.ID === activeTab.id)
        if (s) targets.push({ kind: 'scene', id: s.ID, label: `${t('details.sceneLabel', { number: s.number })} ${s.title}` })
      } else if (activeTab.kind === 'final_video') {
        const v = finalVideos.find((x) => x.ID === activeTab.id)
        if (v) targets.push({ kind: 'final_video', id: v.ID, label: v.title || t('pages.finalVideos.defaultTitle') })
      }
    }
    assets.forEach((a) => { if (!targets.find((t) => t.kind === 'asset' && t.id === a.ID)) targets.push({ kind: 'asset', id: a.ID, label: a.name }) })
    storyboards.forEach((b) => { if (!targets.find((t) => t.kind === 'storyboard' && t.id === b.ID)) targets.push({ kind: 'storyboard', id: b.ID, label: `#${b.order} ${b.title || b.description || t('common.emptyTitle')}` }) })
    scenes.forEach((s) => { if (!targets.find((t) => t.kind === 'scene' && t.id === s.ID)) targets.push({ kind: 'scene', id: s.ID, label: `${t('details.sceneLabel', { number: s.number })} ${s.title}` }) })
    finalVideos.forEach((v) => { if (!targets.find((t) => t.kind === 'final_video' && t.id === v.ID)) targets.push({ kind: 'final_video', id: v.ID, label: v.title || t('pages.finalVideos.defaultTitle') }) })
    return targets
  }

  /* ── Workspace renderer ── */
  function renderWorkspace() {
    if (!activeTab) return <EmptyWorkspace kind={activeKind} />
    const { kind, id } = activeTab
    const node = findNodeFor(kind, id)
    const common = {
      node,
      pipeline,
      members,
      onNodeUpdated: handleNodeUpdated,
      onOpenTab: openTab,
    }
    switch (kind) {
      case 'script':     { const item = scripts.find((s) => s.ID === id);     return item ? <ScriptWorkspace script={item} episodes={episodes} scenes={scenes} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'asset':      { const item = assets.find((a) => a.ID === id);      return item ? <AssetWorkspace asset={item} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'storyboard': { const item = storyboards.find((b) => b.ID === id); return item ? <StoryboardWorkspace storyboard={item} scenes={scenes} episodes={episodes} shots={shots} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'shot':       { const item = shots.find((s) => s.ID === id);       return item ? <ShotWorkspace shot={item} storyboards={storyboards} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'final_video':{ const item = finalVideos.find((v) => v.ID === id); return item ? <FinalVideoDetail video={item} episodes={episodes} scenes={scenes} storyboards={storyboards} shots={shots} showHeader={false} /> : <EmptyWorkspace kind={kind} /> }
    }
  }

  function findNodeFor(kind: EntityKind, id: number): PipelineNode | undefined {
    return pipeline?.nodes.find((node) =>
      (node.entity_type === kind && node.entity_id === id)
      || (kind === 'script' && scripts.find((s) => s.ID === id)?.pipeline_node_id === node.ID)
      || (kind === 'asset' && assets.find((a) => a.ID === id)?.pipeline_node_id === node.ID)
      || (kind === 'episode' && episodes.find((e) => e.ID === id)?.pipeline_node_id === node.ID)
      || (kind === 'scene' && scenes.find((s) => s.ID === id)?.pipeline_node_id === node.ID)
      || (kind === 'storyboard' && storyboards.find((b) => b.ID === id)?.pipeline_node_id === node.ID)
      || (kind === 'shot' && shots.find((s) => s.ID === id)?.pipeline_node_id === node.ID)
      || (kind === 'final_video' && finalVideos.find((v) => v.ID === id)?.pipeline_node_id === node.ID)
    )
  }

  function handleNodeUpdated(updated: PipelineNode) {
    // The query invalidation in the rail refreshes the source data. This hook is
    // present so workspaces can optimistically react later without changing APIs.
    void updated
  }

  const items = getItems()
  const normalizedArtifactSearch = artifactSearch.trim().toLowerCase()
  const visibleItems = normalizedArtifactSearch
    ? items.filter((item) =>
        `${item.title} ${item.subtitle ?? ''}`.toLowerCase().includes(normalizedArtifactSearch),
      )
    : items

  function renderCreateForm() {
    if (!projectId) return null
    const close = () => setShowCreate(false)
    switch (activeKind) {
      case 'script':     return <ScriptCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'asset':      return <AssetCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'storyboard': return <StoryboardCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'shot':       return <ShotCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'final_video':return (
        <FinalVideoCreateInlineForm
          projectId={projectId}
          title={finalVideoTitle}
          onTitleChange={setFinalVideoTitle}
          onSuccess={() => {
            setFinalVideoTitle('')
            close()
          }}
          onCancel={close}
        />
      )
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Top: entity kind selector ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background shrink-0">
        <div className="flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none">
          {WORK_ARTIFACT_KINDS.map((k) => {
            const cfg = KIND_CONFIG[k]
            const Icon = cfg.icon
            const active = activeKind === k
            return (
              <button
                key={k}
                onClick={() => setActiveKind(k)}
                className={cn(
                  'flex h-9 w-[116px] shrink-0 items-center justify-between gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors',
                  active
                    ? 'border-transparent bg-foreground text-background shadow-sm'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon size={14} className={cn('shrink-0', active ? 'text-background' : cfg.activeColor)} />
                  <span className="truncate">{t(cfg.labelKey)}</span>
                </span>
                <span className={cn(
                  'min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-mono leading-none tabular-nums',
                  active ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground'
                )}>
                  {counts[k]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="relative w-60 shrink-0">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={artifactSearch}
            onChange={(event) => setArtifactSearch(event.target.value)}
            className="h-9 pl-8 pr-3 text-xs"
            placeholder={t('work.searchPlaceholder', {
              entity: t(KIND_CONFIG[activeKind].labelKey),
              defaultValue: `搜索${t(KIND_CONFIG[activeKind].labelKey)}`,
            })}
          />
        </div>
      </div>

      {/* ── Middle: item cards strip ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-none min-w-0">
          {items.length === 0 ? (
            <span className="text-xs text-muted-foreground py-1">
              {t('work.emptyKindHint', { entity: t(KIND_CONFIG[activeKind].labelKey) })}
            </span>
          ) : visibleItems.length === 0 ? (
            <span className="text-xs text-muted-foreground py-1">
              {t('work.noSearchResults', { defaultValue: '没有匹配的产物' })}
            </span>
          ) : (
            visibleItems.map((item) => {
              const key = tabKey(activeKind, item.id)
              const isOpen = openTabs.some((t) => t.key === key)
              const isActive = activeTabKey === key
              return (
                <EntityCard
                  key={item.id}
                  item={item}
                  kind={activeKind}
                  selected={isActive}
                  hasTab={isOpen}
                  onClick={() => openTab(activeKind, item.id, item.title)}
                />
              )
            })
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreate(true)}
          className="shrink-0 gap-1"
        >
          <Plus size={13} />
          {t('common.create')}
        </Button>
      </div>

      {/* ── Main content: workspace + canvas split ── */}
      <div ref={workspaceBodyRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden transition-none">
          {/* ── Tab bar ── */}
          {openTabs.length > 0 && (
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-background shrink-0 overflow-x-auto scrollbar-none">
              {openTabs.map((tab) => {
                const cfg = KIND_CONFIG[tab.kind]
                const Icon = cfg.icon
                const isActive = activeTabKey === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTabKey(tab.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 group',
                      isActive
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon size={11} className={isActive ? 'text-background' : cfg.activeColor} />
                    <span className="max-w-[100px] truncate">{tab.label}</span>
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.key) }}
                      className={cn(
                        'ml-0.5 rounded-sm p-0.5 transition-colors',
                        isActive
                          ? 'hover:bg-background/20 text-background/70 hover:text-background'
                          : 'opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20'
                      )}
                    >
                      <X size={10} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden">
            {renderWorkspace()}
          </div>
        </div>

        {bottomPanel && (
          <div
            className={cn(
              'h-1 shrink-0 cursor-ns-resize border-t border-border hover:bg-muted transition-colors',
              isResizing && 'bg-muted'
            )}
            onMouseDown={onResizeMouseDown}
          />
        )}

        <div className="flex h-10 shrink-0 items-center justify-between border-t border-border bg-card px-3">
          <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
            <BottomPanelTab
              active={bottomPanel === 'canvas'}
              icon={<LayoutTemplate size={13} />}
              label={t('work.creationCanvas')}
              onClick={() => setBottomPanel((current) => current === 'canvas' ? null : 'canvas')}
            />
            <BottomPanelTab
              active={bottomPanel === 'pipeline'}
              icon={<Network size={13} />}
              label={t('work.pipeline', { defaultValue: '管线' })}
              onClick={() => setBottomPanel((current) => current === 'pipeline' ? null : 'pipeline')}
            />
          </div>
          {bottomPanel ? (
            <button
              type="button"
              onClick={() => setBottomPanel(null)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('common.close')}
            >
              <ChevronDown size={14} />
            </button>
          ) : null}
        </div>

        {bottomPanel && (
          <div
            className="shrink-0 border-t border-border relative overflow-hidden"
            style={{ height: bottomPanelHeight }}
          >
            {bottomPanel === 'canvas' ? (
              <EmbeddedCanvas
                pushTargets={getPushTargets()}
                onClose={() => setBottomPanel(null)}
              />
            ) : (
              <PipelineEditorPage embedded />
            )}
          </div>
        )}
      </div>

      {/* ── Create dialog ── */}
      <CreateDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('work.createArtifactTitle', {
          artifact: t(KIND_CONFIG[activeKind].labelKey),
          defaultValue: t('work.createEntityTitle', { entity: t(KIND_CONFIG[activeKind].labelKey) }),
        })}
      >
        {renderCreateForm()}
      </CreateDialog>
    </div>
  )
}

function FinalVideoCreateInlineForm({
  projectId,
  title,
  onTitleChange,
  onSuccess,
  onCancel,
}: {
  projectId: number
  title: string
  onTitleChange: (value: string) => void
  onSuccess: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/final-videos`, {
      title: title.trim() || t('pages.finalVideos.defaultTitle'),
      status: 'draft',
    }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['final-videos', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
      qc.invalidateQueries({ queryKey: ['pipeline', projectId] })
      onSuccess()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.titleRequired')}</Label>
        <Input
          autoFocus
          placeholder={t('pages.finalVideos.titlePlaceholder')}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && title.trim() && create.mutate()}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending} className="flex-1">
          {create.isPending ? t('common.creating') : t('common.create')}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}

function BottomPanelTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 min-w-[92px] items-center justify-center gap-1.5 rounded px-3 text-xs font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

// ── Artifact card (middle strip) ──────────────────────────────────────────────

interface EntityCardProps {
  item: ArtifactRef
  kind: WorkArtifactKind
  selected: boolean
  hasTab: boolean
  onClick: () => void
}

function EntityCard({ item, kind, selected, hasTab, onClick }: EntityCardProps) {
  const cfg = KIND_CONFIG[kind]

  function onDragStart(e: React.DragEvent) {
    const drag: EntityDragItem = {
      kind,
      id: item.id,
      label: item.title,
      title: item.subtitle ? `${item.title} · ${item.subtitle}` : item.title,
    }
    e.dataTransfer.setData('application/entity-node', JSON.stringify(drag))
    if (item.resource) {
      e.dataTransfer.setData('application/canvas-resource', JSON.stringify(item.resource))
    }
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'h-12 w-[168px] shrink-0 flex items-center gap-2 px-3 rounded-lg border transition-all text-left',
        'cursor-grab active:cursor-grabbing hover:shadow-sm',
        selected
          ? 'bg-foreground text-background border-transparent shadow-sm'
          : hasTab
          ? 'border-primary/40 bg-primary/5 text-foreground hover:border-primary/60'
          : 'border-border bg-background text-foreground hover:border-primary/30 hover:bg-muted/30'
      )}
    >
      <GripVertical size={11} className={cn('shrink-0', selected ? 'text-background/50' : 'text-muted-foreground/40')} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate leading-tight">{item.title}</p>
        {item.subtitle && (
          <p className={cn('text-[10px] truncate leading-tight mt-0.5', selected ? 'text-background/60' : 'text-muted-foreground')}>
            {item.subtitle}
          </p>
        )}
      </div>
    </button>
  )
}
