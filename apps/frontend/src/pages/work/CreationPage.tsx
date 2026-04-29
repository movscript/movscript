import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { ArtifactRef, Script, Setting, Asset, Episode, Scene, Storyboard, Shot, FinalVideo, RawResource, Pipeline, PipelineNode, ProjectMember } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, LayoutTemplate, GripVertical, Network, Search, X } from 'lucide-react'
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
import { FinalVideoDetail } from '@/pages/final-videos/FinalVideosPage'
import PipelineEditorPage from '@/pages/pipeline/PipelineEditorPage'
import { ArtifactWorkspaceFrame } from './ArtifactWorkspaceFrame'
import { isWorkbenchEntityKind } from './workbenchNavigation'

const CANVAS_PANEL_DEFAULT_H = 420
const CANVAS_PANEL_MIN_H = 260
const CANVAS_PANEL_CHROME_H = 44

type WorkSurface = 'canvas' | 'pipeline'

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
  pipeline_node_id?: number
  resource?: RawResource
}

export default function CreationPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [searchParams] = useSearchParams()
  const [activeKind, setActiveKind] = useState<WorkArtifactKind>('script')
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [finalVideoTitle, setFinalVideoTitle] = useState('')
  const [artifactSearch, setArtifactSearch] = useState('')

  const [workSurface, setWorkSurface] = useState<WorkSurface>('canvas')
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
  const { data: pipeline }     = useQuery<Pipeline>({     queryKey: ['pipeline', projectId],           queryFn: () => api.get(`/projects/${projectId}/pipeline`).then((r) => r.data),      enabled: !!projectId })
  const { data: projectDetail } = useQuery<{ members?: ProjectMember[] }>({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((r) => r.data),
    enabled: !!projectId,
  })

  const scripts     = _scripts     ?? []
  const settings    = _settings    ?? []
  const assets      = _assets      ?? []
  const episodes    = _episodes    ?? []
  const scenes      = _scenes      ?? []
  const storyboards = _storyboards ?? []
  const shots       = _shots       ?? []
  const finalVideos = _finalVideos ?? []
  const artifactRefs = _artifactRefs ?? []
  const members = projectDetail?.members ?? []
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

  function pipelineNodeIdForEntity(kind: EntityKind, id: number) {
    switch (kind) {
      case 'script':
        return scripts.find((item) => item.ID === id)?.pipeline_node_id
          ?? artifactRefs.find((item) => item.kind === kind && item.id === id)?.pipeline_node_id
      case 'asset':
        return assets.find((item) => item.ID === id)?.pipeline_node_id
          ?? artifactRefs.find((item) => item.kind === kind && item.id === id)?.pipeline_node_id
      case 'episode':
        return episodes.find((item) => item.ID === id)?.pipeline_node_id
      case 'scene':
        return scenes.find((item) => item.ID === id)?.pipeline_node_id
      case 'storyboard':
        return storyboards.find((item) => item.ID === id)?.pipeline_node_id
          ?? artifactRefs.find((item) => item.kind === kind && item.id === id)?.pipeline_node_id
      case 'shot':
        return shots.find((item) => item.ID === id)?.pipeline_node_id
          ?? artifactRefs.find((item) => item.kind === kind && item.id === id)?.pipeline_node_id
      case 'final_video':
        return finalVideos.find((item) => item.ID === id)?.pipeline_node_id
          ?? artifactRefs.find((item) => item.kind === kind && item.id === id)?.pipeline_node_id
      case 'setting':
        return undefined
    }
  }

  function entityTargetForPipelineNode(nodeId: number): { kind: EntityKind; id: number } | null {
    const node = pipeline?.nodes.find((item) => item.ID === nodeId)
    if (node && isWorkbenchEntityKind(node.entity_type) && node.entity_id) {
      return { kind: node.entity_type, id: node.entity_id }
    }

    const script = scripts.find((item) => item.pipeline_node_id === nodeId)
    if (script) return { kind: 'script', id: script.ID }
    const asset = assets.find((item) => item.pipeline_node_id === nodeId)
    if (asset) return { kind: 'asset', id: asset.ID }
    const episode = episodes.find((item) => item.pipeline_node_id === nodeId)
    if (episode) return { kind: 'episode', id: episode.ID }
    const scene = scenes.find((item) => item.pipeline_node_id === nodeId)
    if (scene) return { kind: 'scene', id: scene.ID }
    const storyboard = storyboards.find((item) => item.pipeline_node_id === nodeId)
    if (storyboard) return { kind: 'storyboard', id: storyboard.ID }
    const shot = shots.find((item) => item.pipeline_node_id === nodeId)
    if (shot) return { kind: 'shot', id: shot.ID }
    const finalVideo = finalVideos.find((item) => item.pipeline_node_id === nodeId)
    if (finalVideo) return { kind: 'final_video', id: finalVideo.ID }

    const ref = artifactRefs.find((item) => item.pipeline_node_id === nodeId)
    return ref && isWorkbenchEntityKind(ref.kind) ? { kind: ref.kind, id: ref.id } : null
  }

  useEffect(() => {
    const rawKind = searchParams.get('kind')
    const rawId = searchParams.get('id')
    const rawNodeId = searchParams.get('node')
    const nodeId = rawNodeId ? Number(rawNodeId) : undefined
    const directKind = isWorkbenchEntityKind(rawKind) ? rawKind : undefined
    const directId = rawId ? Number(rawId) : undefined

    let target: { kind: EntityKind; id: number; nodeId?: number } | null = null
    if (directKind && directId && Number.isFinite(directId)) {
      target = { kind: directKind, id: directId, nodeId }
    } else if (nodeId && Number.isFinite(nodeId)) {
      const entityTarget = entityTargetForPipelineNode(nodeId)
      if (entityTarget) target = { ...entityTarget, nodeId }
    }

    if (!target) return
    const key = `${target.kind}:${target.id}:${target.nodeId ?? ''}`
    if (autoOpenedRef.current === key) return

    const label = entityLabel(target.kind, target.id)
    if (!label) return

    setActiveKind(target.kind)
    openTab(target.kind, target.id, label)
    autoOpenedRef.current = key
  }, [searchParams, pipeline, scripts, settings, assets, episodes, scenes, storyboards, shots, finalVideos, artifactRefs])

  /* ── Item strip ── */
  function getItems(): WorkListItem[] {
    switch (activeKind) {
      case 'episode':
        return episodes.map((episode) => ({
          kind: 'episode',
          id: episode.ID,
          title: episode.title || `EP${episode.number}`,
          subtitle: `EP${String(episode.number).padStart(2, '0')}`,
          status: episode.status,
          pipeline_node_id: episode.pipeline_node_id,
        }))
      case 'scene':
        return scenes.map((scene) => ({
          kind: 'scene',
          id: scene.ID,
          title: scene.title || `${t('details.sceneLabel', { number: scene.number })}`,
          subtitle: scene.location || t('details.sceneLabel', { number: scene.number }),
          pipeline_node_id: scene.pipeline_node_id,
        }))
      case 'setting':
        return settings.map((setting) => ({
          kind: 'setting',
          id: setting.ID,
          title: setting.name,
          subtitle: setting.description || t(`domain.settingTypes.${setting.type === 'world_rule' ? 'worldRule' : setting.type}`, { defaultValue: setting.type }),
          status: setting.status,
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
            pipeline_node_id: item.pipeline_node_id,
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
            subtitle={item.status}
            node={node}
            pipeline={pipeline}
            members={members}
            onNodeUpdated={handleNodeUpdated}
          >
            <FinalVideoDetail video={item} episodes={episodes} scenes={scenes} storyboards={storyboards} shots={shots} showHeader={false} />
          </ArtifactWorkspaceFrame>
        ) : <EmptyWorkspace kind={kind} />
      }
    }
  }

  function findNodeFor(kind: EntityKind, id: number): PipelineNode | undefined {
    const nodes = pipeline?.nodes ?? []
    const entityPipelineNodeId = pipelineNodeIdForEntity(kind, id)
    const requestedNodeId = Number(searchParams.get('node'))
    const requestedNode = Number.isFinite(requestedNodeId)
      ? nodes.find((node) => node.ID === requestedNodeId)
      : undefined

    if (
      requestedNode &&
      (
        (requestedNode.entity_type === kind && requestedNode.entity_id === id) ||
        requestedNode.ID === entityPipelineNodeId
      )
    ) {
      return requestedNode
    }

    return nodes.find((node) =>
      (node.entity_type === kind && node.entity_id === id) ||
      node.ID === entityPipelineNodeId
    )
  }

  function handleNodeUpdated(updated: PipelineNode) {
    qc.setQueryData<Pipeline | undefined>(['pipeline', projectId], (current) => {
      if (!current) return current
      return {
        ...current,
        nodes: current.nodes.map((node) => node.ID === updated.ID ? updated : node),
      }
    })
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

        {activeTab && (
          <div
            className={cn(
              'h-1 shrink-0 cursor-ns-resize border-t border-border hover:bg-muted transition-colors',
              isResizing && 'bg-muted'
            )}
            onMouseDown={onResizeMouseDown}
          />
        )}

        {activeTab && (
          <div className="flex h-10 shrink-0 items-center justify-between border-t border-border bg-card px-3">
            <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
              <BottomPanelTab
                active={workSurface === 'canvas'}
                icon={<LayoutTemplate size={13} />}
                label={t('work.creationCanvas')}
                onClick={() => setWorkSurface('canvas')}
              />
              <BottomPanelTab
                active={workSurface === 'pipeline'}
                icon={<Network size={13} />}
                label={t('work.pipeline', { defaultValue: '管线' })}
                onClick={() => setWorkSurface('pipeline')}
              />
            </div>
          </div>
        )}

        <div
          className={cn(
            'relative overflow-hidden',
            activeTab ? 'shrink-0 border-t border-border' : 'min-h-0 flex-1',
          )}
          style={activeTab ? { height: canvasPanelHeight } : undefined}
        >
          {!activeTab || workSurface === 'canvas' ? (
            <EmbeddedCanvas
              pushTargets={getPushTargets()}
            />
          ) : (
            <PipelineEditorPage embedded />
          )}
        </div>
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
  const [type, setType] = useState<Setting['type']>('character')
  const [description, setDescription] = useState('')

  const settingTypes: { type: Setting['type']; labelKey: string }[] = [
    { type: 'character', labelKey: 'domain.settingTypes.character' },
    { type: 'scene', labelKey: 'domain.settingTypes.scene' },
    { type: 'prop', labelKey: 'domain.settingTypes.prop' },
    { type: 'world_rule', labelKey: 'domain.settingTypes.worldRule' },
  ]

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/settings`, {
      name: name.trim(),
      type,
      description: description.trim() || undefined,
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
        <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.typeRequired')}</Label>
        <div className="flex flex-wrap gap-2">
          {settingTypes.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => setType(item.type)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs transition-colors',
                type === item.type
                  ? 'border-transparent bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:border-ring hover:text-foreground',
              )}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.summaryOptional')}</Label>
        <Textarea className="resize-none" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
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
  onClick: () => void
}

function EntityCard({ item, kind, selected, hasTab, onClick }: EntityCardProps) {
  const cfg = KIND_CONFIG[kind]

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
