import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import type { Script, Asset, Episode, Scene, Storyboard, Shot, RawResource } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, LayoutTemplate, ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import {
  ScriptCreateForm, AssetCreateForm, EpisodeCreateForm,
  SceneCreateForm, StoryboardCreateForm, ShotCreateForm,
} from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { type EntityKind, KIND_CONFIG } from './config'
import { ScriptWorkspace } from './workspaces/ScriptWorkspace'
import { AssetWorkspace } from './workspaces/AssetWorkspace'
import { EpisodeWorkspace } from './workspaces/EpisodeWorkspace'
import { SceneWorkspace } from './workspaces/SceneWorkspace'
import { StoryboardWorkspace } from './workspaces/StoryboardWorkspace'
import { ShotWorkspace } from './workspaces/ShotWorkspace'
import { EmptyWorkspace } from './workspaces/EmptyWorkspace'
import { EmbeddedCanvas, type EntityDragItem, type PushTarget } from './EmbeddedCanvas'
import { Button } from '@movscript/ui'

const ALL_KINDS: EntityKind[] = ['script', 'asset', 'episode', 'scene', 'storyboard', 'shot']
const CANVAS_DEFAULT_H = 340

interface OpenTab {
  key: string   // `${kind}:${id}`
  kind: EntityKind
  id: number
  label: string
}

export default function CreationPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [activeKind, setActiveKind] = useState<EntityKind>('script')
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const [canvasOpen, setCanvasOpen] = useState(false)
  const [canvasHeight, setCanvasHeight] = useState(CANVAS_DEFAULT_H)
  const [isResizing, setIsResizing] = useState(false)

  /* ── Data queries ── */
  const { data: _scripts }     = useQuery<Script[]>({     queryKey: ['scripts', projectId],            queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),     enabled: !!projectId })
  const { data: _assets }      = useQuery<Asset[]>({      queryKey: ['assets', projectId],             queryFn: () => api.get(`/projects/${projectId}/assets`).then((r) => r.data),      enabled: !!projectId })
  const { data: _episodes }    = useQuery<Episode[]>({    queryKey: ['episodes-project', projectId],   queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),    enabled: !!projectId })
  const { data: _scenes }      = useQuery<Scene[]>({      queryKey: ['scenes', projectId],             queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),      enabled: !!projectId })
  const { data: _storyboards } = useQuery<Storyboard[]>({ queryKey: ['storyboards-project', projectId], queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data), enabled: !!projectId })
  const { data: _shots }       = useQuery<Shot[]>({       queryKey: ['shots-project', projectId],      queryFn: () => api.get(`/projects/${projectId}/shots`).then((r) => r.data),       enabled: !!projectId })

  const scripts     = _scripts     ?? []
  const assets      = _assets      ?? []
  const episodes    = _episodes    ?? []
  const scenes      = _scenes      ?? []
  const storyboards = _storyboards ?? []
  const shots       = _shots       ?? []

  const counts: Record<EntityKind, number> = {
    script: scripts.length, asset: assets.length, episode: episodes.length,
    scene: scenes.length, storyboard: storyboards.length, shot: shots.length,
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
  function getItems(): { id: number; label: string; sub?: string; resource?: RawResource }[] {
    switch (activeKind) {
      case 'script':     return scripts.map((s) => ({ id: s.ID, label: s.title, sub: s.script_type === 'main' ? t('domain.scriptTypes.mainAlt') : s.script_type === 'episode' ? t('entities.episodes') : t('entities.scenes') }))
      case 'asset':      return assets.map((a) => ({ id: a.ID, label: a.name, sub: t(`domain.assetTypes.${a.type}`, { defaultValue: a.type }), resource: a.views?.find((v) => v.resource)?.resource }))
      case 'episode':    return episodes.map((e) => ({ id: e.ID, label: e.title, sub: `EP${String(e.number).padStart(2, '0')}` }))
      case 'scene':      return scenes.map((s) => ({ id: s.ID, label: s.title, sub: t('details.sceneLabel', { number: s.number }) }))
      case 'storyboard': return storyboards.map((b) => ({ id: b.ID, label: b.title || t('details.storyboardLabel', { order: b.order }), sub: b.description?.slice(0, 20) }))
      case 'shot':       return shots.map((s) => ({ id: s.ID, label: t('details.shotLabel', { order: s.order }), sub: s.description?.slice(0, 20) }))
    }
  }

  /* ── Canvas panel ── */
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startH = canvasHeight
    function onMouseMove(ev: MouseEvent) {
      const delta = startY - ev.clientY
      setCanvasHeight(Math.max(200, Math.min(600, startH + delta)))
    }
    function onMouseUp() {
      setIsResizing(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [canvasHeight])

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
      }
    }
    assets.forEach((a) => { if (!targets.find((t) => t.kind === 'asset' && t.id === a.ID)) targets.push({ kind: 'asset', id: a.ID, label: a.name }) })
    storyboards.forEach((b) => { if (!targets.find((t) => t.kind === 'storyboard' && t.id === b.ID)) targets.push({ kind: 'storyboard', id: b.ID, label: `#${b.order} ${b.title || b.description || t('common.emptyTitle')}` }) })
    scenes.forEach((s) => { if (!targets.find((t) => t.kind === 'scene' && t.id === s.ID)) targets.push({ kind: 'scene', id: s.ID, label: `${t('details.sceneLabel', { number: s.number })} ${s.title}` }) })
    return targets
  }

  /* ── Workspace renderer ── */
  function renderWorkspace() {
    if (!activeTab) return <EmptyWorkspace kind={activeKind} />
    const { kind, id } = activeTab
    switch (kind) {
      case 'script':     { const item = scripts.find((s) => s.ID === id);     return item ? <ScriptWorkspace script={item} episodes={episodes} scenes={scenes} /> : <EmptyWorkspace kind={kind} /> }
      case 'asset':      { const item = assets.find((a) => a.ID === id);      return item ? <AssetWorkspace asset={item} />           : <EmptyWorkspace kind={kind} /> }
      case 'episode':    { const item = episodes.find((e) => e.ID === id);    return item ? <EpisodeWorkspace episode={item} />       : <EmptyWorkspace kind={kind} /> }
      case 'scene':      { const item = scenes.find((s) => s.ID === id);      return item ? <SceneWorkspace scene={item} />           : <EmptyWorkspace kind={kind} /> }
      case 'storyboard': { const item = storyboards.find((b) => b.ID === id); return item ? <StoryboardWorkspace storyboard={item} scenes={scenes} episodes={episodes} shots={shots} onOpenTab={openTab} /> : <EmptyWorkspace kind={kind} /> }
      case 'shot':       { const item = shots.find((s) => s.ID === id);       return item ? <ShotWorkspace shot={item} storyboards={storyboards} onOpenTab={openTab} /> : <EmptyWorkspace kind={kind} /> }
    }
  }

  const items = getItems()

  function renderCreateForm() {
    if (!projectId) return null
    const close = () => setShowCreate(false)
    switch (activeKind) {
      case 'script':     return <ScriptCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'asset':      return <AssetCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'episode':    return <EpisodeCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'scene':      return <SceneCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'storyboard': return <StoryboardCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'shot':       return <ShotCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Top: entity kind selector cards ── */}
      <div className="flex items-stretch gap-2 px-4 py-3 border-b border-border bg-background shrink-0 overflow-x-auto scrollbar-none">
        {ALL_KINDS.map((k) => {
          const cfg = KIND_CONFIG[k]
          const Icon = cfg.icon
          const active = activeKind === k
          return (
            <button
              key={k}
              onClick={() => setActiveKind(k)}
              className={cn(
                'flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-xl border transition-all shrink-0 min-w-[72px]',
                'hover:shadow-sm active:scale-[0.97]',
                active
                  ? 'border-transparent shadow-sm bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-muted/50'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center',
                active ? 'bg-background/15' : cfg.accentSoft,
              )}>
                <Icon size={16} className={active ? 'text-background' : cfg.activeColor} />
              </div>
              <span className="text-xs font-semibold whitespace-nowrap">{t(cfg.labelKey)}</span>
              <span className={cn(
                'text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full leading-none',
                active ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground'
              )}>
                {counts[k]}
              </span>
            </button>
          )
        })}

        <div className="ml-auto flex items-center shrink-0">
          <button
            onClick={() => setCanvasOpen((v) => !v)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all',
              canvasOpen
                ? 'bg-accent text-accent-foreground border-accent'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
            )}
          >
            <LayoutTemplate size={15} />
            <span className="whitespace-nowrap">{canvasOpen ? t('work.collapseCanvas') : t('work.creationCanvas')}</span>
            {canvasOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>

      {/* ── Middle: item cards strip ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-none min-w-0">
          {items.length === 0 ? (
            <span className="text-xs text-muted-foreground py-1">
              {t('work.emptyKindHint', { entity: t(KIND_CONFIG[activeKind].labelKey) })}
            </span>
          ) : (
            items.map((item) => {
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
                  onClick={() => openTab(activeKind, item.id, item.label)}
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

      {/* ── Main content: workspace + canvas split ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className={cn('overflow-hidden transition-none', canvasOpen ? 'flex-1 min-h-0' : 'flex-1')}>
          {renderWorkspace()}
        </div>

        {canvasOpen && (
          <>
            <div
              className={cn(
                'h-1 shrink-0 cursor-ns-resize border-t border-border hover:bg-muted transition-colors',
                isResizing && 'bg-muted'
              )}
              onMouseDown={onResizeMouseDown}
            />
            <div
              className="shrink-0 border-t border-border relative overflow-hidden"
              style={{ height: canvasHeight }}
            >
              <EmbeddedCanvas
                pushTargets={getPushTargets()}
                onClose={() => setCanvasOpen(false)}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Create dialog ── */}
      <CreateDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('work.createEntityTitle', { entity: t(KIND_CONFIG[activeKind].labelKey) })}
      >
        {renderCreateForm()}
      </CreateDialog>
    </div>
  )
}

// ── Entity card (middle strip) ────────────────────────────────────────────────

interface EntityCardProps {
  item: { id: number; label: string; sub?: string; resource?: RawResource }
  kind: EntityKind
  selected: boolean
  hasTab: boolean
  onClick: () => void
}

function EntityCard({ item, kind, selected, hasTab, onClick }: EntityCardProps) {
  const cfg = KIND_CONFIG[kind]

  function onDragStart(e: React.DragEvent) {
    const drag: EntityDragItem = { kind, id: item.id, label: item.label }
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
        'shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left',
        'cursor-grab active:cursor-grabbing hover:shadow-sm',
        selected
          ? 'bg-foreground text-background border-transparent shadow-sm'
          : hasTab
          ? 'border-primary/40 bg-primary/5 text-foreground hover:border-primary/60'
          : 'border-border bg-background text-foreground hover:border-primary/30 hover:bg-muted/30'
      )}
    >
      <GripVertical size={11} className={cn('shrink-0', selected ? 'text-background/50' : 'text-muted-foreground/40')} />
      <div className="min-w-0">
        <p className="text-xs font-medium truncate max-w-[120px] leading-tight">{item.label}</p>
        {item.sub && (
          <p className={cn('text-[10px] truncate max-w-[120px] leading-tight mt-0.5', selected ? 'text-background/60' : 'text-muted-foreground')}>
            {item.sub}
          </p>
        )}
      </div>
    </button>
  )
}
