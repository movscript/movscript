import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import type { ArtifactRef, Script, Setting, Asset, AssetView, Episode, Scene, Storyboard, Shot, FinalVideo, RawResource } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, LayoutTemplate, GripVertical, Search, X, Image as ImageIcon } from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import {
  ScriptCreateForm, AssetCreateForm, EpisodeCreateForm, SceneCreateForm, StoryboardCreateForm, ShotCreateForm,
} from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { type EntityKind, type WorkArtifactKind, KIND_CONFIG, WORK_ARTIFACT_KINDS } from './config'
import { ScriptWorkspace } from './workspaces/ScriptWorkspace'
import { SettingWorkspace } from './workspaces/SettingWorkspace'
import { AssetWorkspace } from './workspaces/AssetWorkspace'
import { EpisodeWorkspace } from './workspaces/EpisodeWorkspace'
import { SceneWorkspace } from './workspaces/SceneWorkspace'
import { StoryboardWorkspace } from './workspaces/StoryboardWorkspace'
import { ShotWorkspace } from './workspaces/ShotWorkspace'
import { EmptyWorkspace } from './workspaces/EmptyWorkspace'
import { EmbeddedCanvas, type EntityDragItem, type PushTarget } from './EmbeddedCanvas'
import { Button, Input, Label, Textarea } from '@movscript/ui'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { FinalVideoDetail } from '@/pages/final-videos/FinalVideosPage'
import { ArtifactWorkspaceFrame } from './ArtifactWorkspaceFrame'
import { isWorkbenchEntityKind } from './workbenchNavigation'
import { BUILT_IN_SETTING_TYPES, DEFAULT_SETTING_STATUS, settingTypeLabel } from '@/components/settings/SettingDetailEditor'

const CANVAS_PANEL_DEFAULT_H = 420
const CANVAS_PANEL_MIN_H = 260
const CANVAS_PANEL_CHROME_H = 44

type WorkSurface = 'canvas'

interface OpenTab {
  key: string   // `${kind}:${id}`
  kind: EntityKind
  id: number
  label: string
}

interface WorkListItem {
  kind: WorkArtifactKind
  id: number
  title: string
  subtitle?: string
  status?: string
  resource?: RawResource
  previews?: WorkListPreview[]
  previewCount?: number
}

interface WorkListPreview {
  key: string
  src: string
  isVideo: boolean
}

function resourceMediaSrc(resource?: RawResource): string | undefined {
  if (!resource?.url) return undefined
  return `${API_BASE}${resource.url}`
}

function viewMediaSrc(view: AssetView): string | undefined {
  if (view.resource?.url) return `${API_BASE}${view.resource.url}`
  if (view.image_url) return view.image_url.startsWith('http') ? view.image_url : `${API_BASE}${view.image_url}`
  return undefined
}

function isVideoResource(resource?: RawResource): boolean {
  return resource?.type === 'video' || !!resource?.mime_type?.startsWith('video/')
}

function isVideoView(view: AssetView): boolean {
  return view.resource?.type === 'video' || !!view.resource?.mime_type?.startsWith('video/')
}

function assetPreviews(asset: Asset, limit = 4): WorkListPreview[] {
  const candidates: WorkListPreview[] = []
  const resourceSrc = resourceMediaSrc(asset.resource)
  if (resourceSrc) {
    candidates.push({
      key: `resource:${asset.resource?.ID ?? resourceSrc}`,
      src: resourceSrc,
      isVideo: isVideoResource(asset.resource),
    })
  }

  for (const view of asset.views ?? []) {
    const src = viewMediaSrc(view)
    if (!src) continue
    candidates.push({
      key: `view:${view.ID}:${src}`,
      src,
      isVideo: view.resource ? isVideoView(view) : false,
    })
  }

  const seen = new Set<string>()
  return candidates.filter((preview) => {
    if (seen.has(preview.src)) return false
    seen.add(preview.src)
    return true
  }).slice(0, limit)
}

function settingPreviews(settingId: number, assets: Asset[], limit = 4): WorkListPreview[] {
  const previews: WorkListPreview[] = []
  const seen = new Set<string>()
  for (const asset of assets) {
    if (asset.setting_id !== settingId) continue
    for (const preview of assetPreviews(asset, limit)) {
      if (seen.has(preview.src)) continue
      seen.add(preview.src)
      previews.push(preview)
      if (previews.length >= limit) return previews
    }
  }
  return previews
}

export default function CreationPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [searchParams] = useSearchParams()
  const [activeKind, setActiveKind] = useState<WorkArtifactKind>('script')
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [finalVideoTitle, setFinalVideoTitle] = useState('')
  const [artifactSearch, setArtifactSearch] = useState('')

  const [workSurface, setWorkSurface] = useState<WorkSurface | null>('canvas')
  const [canvasPanelHeight, setCanvasPanelHeight] = useState(CANVAS_PANEL_DEFAULT_H)
  const [isResizing, setIsResizing] = useState(false)
  const workspaceBodyRef = useRef<HTMLDivElement | null>(null)

  /* ── Data queries ── */
  const { data: _scripts }     = useQuery<Script[]>({     queryKey: ['scripts', projectId],            queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),     enabled: !!projectId })
  const { data: _settings }    = useQuery<Setting[]>({    queryKey: ['settings', projectId],           queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),    enabled: !!projectId })
  const { data: _assets }      = useQuery<Asset[]>({      queryKey: ['assets', projectId],             queryFn: () => api.get(`/projects/${projectId}/assets`).then((r) => r.data),      enabled: !!projectId })
  const { data: _episodes }    = useQuery<Episode[]>({    queryKey: ['episodes-project', projectId],   queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),    enabled: !!projectId })
  const { data: _scenes }      = useQuery<Scene[]>({      queryKey: ['scenes', projectId],             queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),      enabled: !!projectId })
  const { data: _storyboards } = useQuery<Storyboard[]>({ queryKey: ['storyboards-project', projectId], queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data), enabled: !!projectId })
  const { data: _shots }       = useQuery<Shot[]>({       queryKey: ['shots-project', projectId],      queryFn: () => api.get(`/projects/${projectId}/shots`).then((r) => r.data),       enabled: !!projectId })
  const { data: _finalVideos } = useQuery<FinalVideo[]>({ queryKey: ['final-videos', projectId],       queryFn: () => api.get(`/projects/${projectId}/final-videos`).then((r) => r.data), enabled: !!projectId })
  const { data: _artifactRefs } = useQuery<ArtifactRef[]>({ queryKey: ['artifact-refs', projectId],     queryFn: () => api.get(`/projects/${projectId}/artifact-refs`).then((r) => r.data), enabled: !!projectId })
  const scripts     = _scripts     ?? []
  const settings    = _settings    ?? []
  const assets      = _assets      ?? []
  const episodes    = _episodes    ?? []
  const scenes      = _scenes      ?? []
  const storyboards = _storyboards ?? []
  const shots       = _shots       ?? []
  const finalVideos = _finalVideos ?? []
  const artifactRefs = _artifactRefs ?? []
  const autoOpenedRef = useRef<string | null>(null)

  const counts: Record<WorkArtifactKind, number> = {
    script: artifactRefs.filter((item) => item.kind === 'script').length,
    setting: settings.length,
    asset: artifactRefs.filter((item) => item.kind === 'asset').length,
    episode: episodes.length,
    scene: scenes.length,
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
    setWorkSurface(null)
  }

  function selectTab(key: string) {
    setActiveTabKey((current) => current === key ? null : key)
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

  function startEntityDrag(e: React.DragEvent, item: { kind: EntityKind; id: number; label: string; title?: string }) {
    const drag: EntityDragItem = {
      kind: item.kind,
      id: item.id,
      label: item.label,
      title: item.title ?? item.label,
    }
    e.dataTransfer.setData('application/entity-node', JSON.stringify(drag))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const activeTab = openTabs.find((t) => t.key === activeTabKey) ?? null

  function entityLabel(kind: EntityKind, id: number) {
    switch (kind) {
      case 'script': {
        const script = scripts.find((item) => item.ID === id)
        return script?.title || artifactRefs.find((item) => item.kind === kind && item.id === id)?.title
      }
      case 'setting':
        return settings.find((item) => item.ID === id)?.name
      case 'asset':
        return assets.find((item) => item.ID === id)?.name || artifactRefs.find((item) => item.kind === kind && item.id === id)?.title
      case 'episode': {
        const episode = episodes.find((item) => item.ID === id)
        return episode?.title || (episode ? `EP${episode.number}` : undefined)
      }
      case 'scene': {
        const scene = scenes.find((item) => item.ID === id)
        return scene?.title || (scene ? t('details.sceneLabel', { number: scene.number }) : undefined)
      }
      case 'storyboard': {
        const storyboard = storyboards.find((item) => item.ID === id)
        return storyboard?.title || artifactRefs.find((item) => item.kind === kind && item.id === id)?.title || (storyboard ? `#${storyboard.order}` : undefined)
      }
      case 'shot': {
        const shot = shots.find((item) => item.ID === id)
        return shot?.description || artifactRefs.find((item) => item.kind === kind && item.id === id)?.title || (shot ? `镜头 #${shot.ID}` : undefined)
      }
      case 'final_video': {
        const video = finalVideos.find((item) => item.ID === id)
        return video?.title || artifactRefs.find((item) => item.kind === kind && item.id === id)?.title || (video ? t('pages.finalVideos.defaultTitle') : undefined)
      }
    }
  }

  useEffect(() => {
    const rawKind = searchParams.get('kind')
    const rawId = searchParams.get('id')
    const directKind = isWorkbenchEntityKind(rawKind) ? rawKind : undefined
    const directId = rawId ? Number(rawId) : undefined

    let target: { kind: EntityKind; id: number } | null = null
    if (directKind && directId && Number.isFinite(directId)) {
      target = { kind: directKind, id: directId }
    }

    if (!target) return
    const key = `${target.kind}:${target.id}`
    if (autoOpenedRef.current === key) return

    const label = entityLabel(target.kind, target.id)
    if (!label) return

    setActiveKind(target.kind)
    openTab(target.kind, target.id, label)
    autoOpenedRef.current = key
  }, [searchParams, scripts, settings, assets, episodes, scenes, storyboards, shots, finalVideos, artifactRefs])

  /* ── Item strip ── */
  function getItems(): WorkListItem[] {
    switch (activeKind) {
      case 'episode':
        return episodes.map((episode) => ({
          kind: 'episode',
          id: episode.ID,
          title: episode.title || `EP${episode.number}`,
          subtitle: `EP${String(episode.number).padStart(2, '0')}`,
        }))
      case 'scene':
        return scenes.map((scene) => ({
          kind: 'scene',
          id: scene.ID,
          title: scene.title || `${t('details.sceneLabel', { number: scene.number })}`,
          subtitle: t('details.sceneLabel', { number: scene.number }),
        }))
      case 'setting':
        return settings.map((setting) => ({
          kind: 'setting',
          id: setting.ID,
          title: setting.name,
          subtitle: setting.description || settingTypeLabel(setting.type),
          status: setting.status,
          previews: settingPreviews(setting.ID, assets),
          previewCount: assets.filter((asset) => asset.setting_id === setting.ID && assetPreviews(asset, 1).length > 0).length,
        }))
      case 'asset':
        return assets.map((asset) => ({
          kind: 'asset',
          id: asset.ID,
          title: asset.name,
          subtitle: asset.setting?.name
            ?? (asset.setting_id ? settings.find((setting) => setting.ID === asset.setting_id)?.name : undefined)
            ?? asset.type,
          status: asset.state || asset.effective_status || asset.review_status,
          resource: asset.resource ?? asset.views?.find((view) => view.resource)?.resource,
          previews: assetPreviews(asset, 3),
          previewCount: assetPreviews(asset, 8).length,
        }))
      default:
        return artifactRefs
          .filter((item) => item.kind === activeKind)
          .map((item) => ({
            kind: activeKind,
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            status: item.status,
            resource: item.resource,
          }))
    }
  }

  /* ── Canvas split ── */
  const getCanvasPanelMaxHeight = useCallback(() => {
    const bodyHeight = workspaceBodyRef.current?.clientHeight ?? window.innerHeight - 180
    return Math.max(CANVAS_PANEL_MIN_H, bodyHeight - CANVAS_PANEL_CHROME_H)
  }, [])

  const clampCanvasPanelHeight = useCallback((height: number) => {
    return Math.max(CANVAS_PANEL_MIN_H, Math.min(getCanvasPanelMaxHeight(), height))
  }, [getCanvasPanelMaxHeight])

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startH = canvasPanelHeight
    function onMouseMove(ev: MouseEvent) {
      const delta = startY - ev.clientY
      setCanvasPanelHeight(clampCanvasPanelHeight(startH + delta))
    }
    function onMouseUp() {
      setIsResizing(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [canvasPanelHeight, clampCanvasPanelHeight])

  useEffect(() => {
    const clampCurrentHeight = () => setCanvasPanelHeight((height) => clampCanvasPanelHeight(height))

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
  }, [clampCanvasPanelHeight])

  const toggleWorkSurface = useCallback((surface: WorkSurface) => {
    setWorkSurface((current) => current === surface ? null : surface)
  }, [])

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
    const common = {
      onOpenTab: openTab,
    }
    switch (kind) {
      case 'script':     { const item = scripts.find((s) => s.ID === id);     return item ? <ScriptWorkspace script={item} episodes={episodes} scenes={scenes} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'setting':    { const item = settings.find((s) => s.ID === id);    return item ? <SettingWorkspace setting={item} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'asset':      { const item = assets.find((a) => a.ID === id);      return item ? <AssetWorkspace asset={item} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'episode':    { const item = episodes.find((e) => e.ID === id);    return item ? <EpisodeWorkspace episode={item} scripts={scripts} scenes={scenes} storyboards={storyboards} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'scene':      { const item = scenes.find((s) => s.ID === id);      return item ? <SceneWorkspace scene={item} episodes={episodes} storyboards={storyboards} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'storyboard': { const item = storyboards.find((b) => b.ID === id); return item ? <StoryboardWorkspace storyboard={item} scenes={scenes} episodes={episodes} shots={shots} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'shot':       { const item = shots.find((s) => s.ID === id);       return item ? <ShotWorkspace shot={item} storyboards={storyboards} {...common} /> : <EmptyWorkspace kind={kind} /> }
      case 'final_video': {
        const item = finalVideos.find((v) => v.ID === id)
        return item ? (
          <ArtifactWorkspaceFrame
            kind="final_video"
            title={item.title || t('pages.finalVideos.defaultTitle')}
            subtitle={item.description}
          >
            <FinalVideoDetail video={item} episodes={episodes} scenes={scenes} storyboards={storyboards} shots={shots} showHeader={false} />
          </ArtifactWorkspaceFrame>
        ) : <EmptyWorkspace kind={kind} />
      }
    }
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
      case 'setting':    return <SettingCreateInlineForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'asset':      return <AssetCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'episode':    return <EpisodeCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
      case 'scene':      return <SceneCreateForm projectId={projectId} onSuccess={close} onCancel={close} />
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
      <div className={cn(
        'flex items-center gap-2 border-b border-border bg-card shrink-0',
        activeTab ? 'px-3 py-1.5' : 'px-4 py-2.5'
      )}>
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
                  compact={!!activeTab}
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
                  draggable
                  onDragStart={(event) => {
                    startEntityDrag(event, {
                      kind: tab.kind,
                      id: tab.id,
                      label: tab.label,
                      title: entityLabel(tab.kind, tab.id) ?? tab.label,
                    })
                  }}
                  onClick={() => selectTab(tab.key)}
                  className={cn(
                    'flex cursor-grab items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 group active:cursor-grabbing',
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

        {activeTab && (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden transition-none">
            <div className="flex-1 min-h-0 overflow-hidden">
              {renderWorkspace()}
            </div>
          </div>
        )}

        {activeTab && workSurface && (
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
              active={workSurface === 'canvas'}
              icon={<LayoutTemplate size={13} />}
              label={t('work.creationCanvas')}
              onClick={() => toggleWorkSurface('canvas')}
            />
          </div>
        </div>

        {workSurface && (
          <div
            className={cn(
              'relative overflow-hidden',
              activeTab ? 'shrink-0 border-t border-border' : 'min-h-0 flex-1',
            )}
            style={activeTab ? { height: canvasPanelHeight } : undefined}
          >
            <EmbeddedCanvas
              pushTargets={getPushTargets()}
            />
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
    }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['final-videos', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
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

function SettingCreateInlineForm({
  projectId,
  onSuccess,
  onCancel,
}: {
  projectId: number
  onSuccess: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState('')

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/settings`, {
      name: name.trim(),
      type: type.trim(),
      status: DEFAULT_SETTING_STATUS,
    }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', projectId] })
      onSuccess()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.nameRequired')}</Label>
        <Input
          autoFocus
          placeholder={t('pages.scripts.settingName')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && name.trim() && create.mutate()}
        />
      </div>
      <div>
        <Label className="mb-1 text-xs font-medium text-muted-foreground">类型（可选）</Label>
        <div className="flex flex-wrap gap-2">
          {BUILT_IN_SETTING_TYPES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setType(item.value)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs transition-colors',
                type === item.value
                  ? 'border-transparent bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:border-ring hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
          <Input
            className="h-8 w-44 text-xs"
            value={type}
            onChange={(event) => setType(event.target.value)}
            placeholder="自定义类型"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending} className="flex-1">
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
  item: WorkListItem
  kind: WorkArtifactKind
  selected: boolean
  hasTab: boolean
  compact?: boolean
  onClick: () => void
}

function EntityCard({ item, kind, selected, hasTab, compact = false, onClick }: EntityCardProps) {
  const cfg = KIND_CONFIG[kind]
  const previews = item.previews ?? []
  const showPreview = !compact && previews.length > 0 && (kind === 'setting' || kind === 'asset')

  function onDragStart(e: React.DragEvent) {
    const dragTitle = item.subtitle ? `${item.title} · ${item.subtitle}` : item.title
    const drag: EntityDragItem = { kind, id: item.id, label: item.title, title: dragTitle }
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
        'shrink-0 flex items-center gap-2 rounded-md border transition-all text-left',
        compact ? 'h-9 w-[144px] px-2' : showPreview ? 'h-20 w-[220px] p-2' : 'h-12 w-[168px] px-3',
        'cursor-grab active:cursor-grabbing hover:shadow-sm',
        selected
          ? 'bg-foreground text-background border-transparent shadow-sm'
          : hasTab
          ? 'border-primary/40 bg-primary/5 text-foreground hover:border-primary/60'
          : 'border-border bg-background text-foreground hover:border-primary/30 hover:bg-muted/30'
      )}
    >
      <GripVertical size={11} className={cn('shrink-0', selected ? 'text-background/50' : 'text-muted-foreground/40')} />
      {showPreview && (
        <EntityCardPreview
          previews={previews}
          title={item.title}
          selected={selected}
          extraCount={Math.max(0, (item.previewCount ?? previews.length) - previews.length)}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate leading-tight">{item.title}</p>
        {item.subtitle && !compact && (
          <p className={cn('text-[10px] truncate leading-tight mt-0.5', selected ? 'text-background/60' : 'text-muted-foreground')}>
            {item.subtitle}
          </p>
        )}
      </div>
    </button>
  )
}

function EntityCardPreview({
  previews,
  title,
  selected,
  extraCount,
}: {
  previews: WorkListPreview[]
  title: string
  selected: boolean
  extraCount: number
}) {
  return (
    <div className={cn(
      'relative grid h-14 w-16 shrink-0 overflow-hidden rounded-md bg-muted',
      previews.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
      previews.length > 2 && 'grid-rows-2',
      selected && 'bg-background/15',
    )}>
      {previews.slice(0, 4).map((preview) => (
        <div key={preview.key} className="min-h-0 min-w-0 overflow-hidden">
          {preview.isVideo ? (
            <AuthedVideo src={preview.src} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <AuthedImage src={preview.src} alt={title} className="h-full w-full object-cover" />
          )}
        </div>
      ))}
      {previews.length === 0 && (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageIcon size={16} />
        </div>
      )}
      {extraCount > 0 && (
        <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1 text-[10px] font-medium leading-4 text-white">
          +{extraCount}
        </span>
      )}
    </div>
  )
}
