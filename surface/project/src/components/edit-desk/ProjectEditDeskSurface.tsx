import {
  compileTimelineAssemblyToFinishingProject,
  type MediaEditingProject,
  type MediaTimelineDiagnostic,
  type MovScriptAssetManifest,
  type MovScriptEditDecisionsArtifact,
  type TimelineAssemblyCompileDiagnostic,
  type TimelineAssemblyCompileManifest,
  type TimelineAssemblyFinishingCompileResult,
  type TimelineAssemblyMediaEditingCompileResult,
} from '@movscript/editing/browser'
import { useEffect, useMemo, useState, type Dispatch, type DragEvent, type MouseEvent, type SetStateAction } from 'react'

import type { AgentSurfaceSnapshot } from '../../data.js'
import {
  agentSurfaceDomainFocus,
  agentSurfaceFocusLabel,
  agentSurfaceLegacyProductionId,
  agentSurfaceSnapshotDomainFocus,
  arrayValue,
  numberValue,
  recordValue,
  stringValue,
} from '../../data.js'
import { useProjectSurfaceRuntime, type EditingServiceGateway } from '../../runtime/index.js'
import {
  AgentSurfaceJson,
  AgentSurfaceLink,
  AgentSurfaceShell,
} from '../AgentSurfaceShell.js'
import './ProjectEditDeskSurface.css'

type ProjectEditDeskReadModelStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ProjectEditDeskSurfaceProps {
  params?: URLSearchParams
  productionId?: string
  readModelStatus?: ProjectEditDeskReadModelStatus
  readModel?: unknown
  snapshot?: AgentSurfaceSnapshot
  error?: Error
}

interface WorkflowRequiredAssetRow {
  id: string
  title: string
  type: string
  contentUnitId?: string
  sceneId?: string
  expressionUnitId?: string
  targetRef?: string
  candidateCount: number
  selectedCandidate?: string
  selectedResource?: string
  blockers: string[]
  raw: Record<string, unknown>
}

interface WorkflowAssetManifestRow {
  id: string
  title: string
  type: string
  contentUnitId?: string
  candidateId?: string
  resourceId?: string
  status: 'selected' | 'needs_selection' | 'missing_candidate'
  raw: Record<string, unknown>
}

interface WorkflowEditRow {
  id: string
  title: string
  target: string
  status: string
  clipCount: number
  blockerCount: number
  editingProjectId?: string
  raw: Record<string, unknown>
}

interface WorkflowRenderRow {
  id: string
  title: string
  status: string
  resourceId?: string
  editingProjectId?: string
  raw: Record<string, unknown>
}

interface WorkflowTimelineNamespaceRow {
  id: string
  kind: string
  title: string
  path?: string
  parentId?: string
  parentKind?: string
  entityKind?: string
  raw: Record<string, unknown>
}

export interface WorkflowArtifactDebugView {
  schema: 'movscript.workflow_artifact_debug_view.v1'
  timelineNamespaces: WorkflowTimelineNamespaceRow[]
  requiredAssets: WorkflowRequiredAssetRow[]
  assetManifest: WorkflowAssetManifestRow[]
  editDecisions: WorkflowEditRow[]
  renderReport: WorkflowRenderRow[]
  blockers: Array<Record<string, unknown>>
  debug: Record<string, number>
  raw: Record<string, unknown>
}

type AssemblyTrackKind = 'video' | 'audio' | 'subtitle' | 'effect' | 'marker'
type AssemblyClipKind = 'visual' | 'voice' | 'music' | 'sfx' | 'subtitle' | 'effect'
type CopyStatus = 'idle' | 'copied' | 'failed'
type ComposeStatus = 'idle' | 'running' | 'succeeded' | 'blocked' | 'error'
type AssemblyValidationSeverity = 'error' | 'warning' | 'info'
type TimelineAssemblyOpenMontageLayer = 'primary' | 'overlay' | 'background'
type TimelineAssemblyEditActionFamily = 'visual' | 'overlay' | 'audio' | 'subtitle' | 'transition' | 'runtime' | 'validation'
type TimelineAssemblyEditActionKind =
  | 'cut'
  | 'overlay'
  | 'narration_segment'
  | 'music_bed'
  | 'sfx_hit'
  | 'subtitle_style'
  | 'subtitle_segment'
  | 'global_transition'
  | 'runtime_lock'
  | 'timeline_coverage_check'

interface TimelineAssemblyCropIntent {
  x: number
  y: number
  width: number
  height: number
}

interface TimelineAssemblyTransformIntent {
  scale: number
  position: string
  animation: string
  crop?: TimelineAssemblyCropIntent
}

interface TimelineAssemblyOverlayIntent {
  x: number
  y: number
  width: number
  height: number
  opacity: number
  animation: string
}

interface TimelineAssemblyClipEditIntent {
  layer: TimelineAssemblyOpenMontageLayer
  speed: number
  transform: TimelineAssemblyTransformIntent
  transitionIn: string
  transitionOut: string
  transitionDurationMs: number
  overlay: TimelineAssemblyOverlayIntent
  reason: string
}

interface TimelineAssemblySubtitleProfile {
  enabled: boolean
  style: 'phrase' | 'sentence' | 'word-by-word' | 'karaoke'
  font: string
  fontSize: number
  color: string
  background: string
  position: 'top-center' | 'bottom-center' | 'center'
  maxWordsPerLine: number
}

interface TimelineAssemblyAudioProfile {
  musicVolume: number
  musicFadeInMs: number
  musicFadeOutMs: number
  ducking: {
    enabled: boolean
    thresholdDb: number
    reductionDb: number
    attackMs: number
    releaseMs: number
  }
}

interface TimelineAssemblyPacingProfile {
  minSceneHoldMs: number
  maxSceneHoldMs: number
  textCardHoldMs: number
  transitionDurationMs: number
}

interface TimelineAssemblyEditProfile {
  schema: 'movscript.timeline_assembly.openmontage_edit_profile.v1'
  rendererFamily: string
  renderRuntime: string
  compositionMode: 'templated' | 'atelier' | 'timeline_assembly'
  subtitles: TimelineAssemblySubtitleProfile
  audio: TimelineAssemblyAudioProfile
  pacing: TimelineAssemblyPacingProfile
}

interface AssemblyValidationIssue {
  code: string
  severity: AssemblyValidationSeverity
  message: string
  trackId?: string
  clipId?: string
  details?: Record<string, unknown>
}

interface AssemblyValidationResult {
  ok: boolean
  blockerCount: number
  warningCount: number
  infoCount: number
  unresolvedClipCount: number
  emptyTrackCount: number
  selectedResourceCount: number
  issues: AssemblyValidationIssue[]
}

interface TimelineAssemblySourceNamespaceNode {
  id: string
  kind: string
  title: string
  path?: string
  parentId?: string
  parentKind?: string
  entityKind?: string
}

interface TimelineAssemblySourceNamespace {
  schema: 'movscript.timeline_assembly.source_namespace.v1'
  targetRef: string
  scopeKind?: string
  scopeRef?: string
  root?: TimelineAssemblySourceNamespaceNode
  nodes: TimelineAssemblySourceNamespaceNode[]
}

interface TimelineAssemblyIntentRef {
  productionId?: string
  scopeKind?: string
  scopeRef?: string
  namespaceNodeId?: string
  namespaceKind?: string
  namespacePath?: string
  sceneMomentId?: string
  expressionUnitId?: string
  contentUnitId?: string
  targetRef?: string
}

type TimelineAssemblyCoverageStatus = 'covered' | 'blocked' | 'uncovered'

interface TimelineAssemblyCoverageItem {
  id: string
  kind: 'content_unit'
  title: string
  contentUnitId?: string
  sceneMomentId?: string
  expressionUnitId?: string
  targetRef?: string
  clipIds: string[]
  selectedClipCount: number
  status: TimelineAssemblyCoverageStatus
  blockers: string[]
}

interface TimelineAssemblyCoverageMap {
  schema: 'movscript.timeline_assembly.coverage_map.v1'
  sourceNamespace: TimelineAssemblySourceNamespace
  summary: {
    expectedContentUnitCount: number
    coveredContentUnitCount: number
    blockedContentUnitCount: number
    uncoveredContentUnitCount: number
    unboundClipCount: number
  }
  items: TimelineAssemblyCoverageItem[]
}

type TimelineAssemblyDecisionSeverity = 'error' | 'warning' | 'info'

interface TimelineAssemblyDecisionLogEntry {
  id: string
  kind: 'required_asset_uncovered' | 'placeholder_source' | 'unbound_clip' | 'namespace_scope_mismatch'
  severity: TimelineAssemblyDecisionSeverity
  message: string
  clipId?: string
  contentUnitId?: string
  sceneMomentId?: string
  expressionUnitId?: string
}

interface TimelineAssemblyEditAction {
  id: string
  family: TimelineAssemblyEditActionFamily
  kind: TimelineAssemblyEditActionKind
  clipId?: string
  trackId?: string
  sourceAssetId?: string
  startMs?: number
  endMs?: number
  params: Record<string, unknown>
}

interface TimelineAssemblyEditActionPlan {
  schema: 'movscript.timeline_assembly.openmontage_edit_actions.v1'
  source: 'openmontage_edit_decisions'
  actions: TimelineAssemblyEditAction[]
  runtimeLock: {
    renderRuntime: string
    fallbackPolicy: 'no_implicit_fallback'
    forbiddenImplicitFallbacks: string[]
  }
  reviewGates: string[]
}

type EditDeskFinishingBackend = 'media_editing_project' | 'hyperframes' | 'remotion'

interface EditDeskFinishingBackendOption {
  backend: EditDeskFinishingBackend
  label: string
  role: 'system_editing' | 'html_composition' | 'react_composition'
  status: string
  compile_manifest_id: string
  render_runtime?: string
  runtime_locked: boolean
  fallback_policy: 'no_implicit_fallback'
  editable: boolean
  entrypoint?: string
  file_count: number
  summary: string
}

export interface EditDeskHandoffBundle {
  schema: 'movscript.edit_desk.handoff.v1'
  production_id?: string
  target_ref: string
  timeline_assembly_id: string
  duration_ms: number
  source_artifacts: Record<string, number>
  source_namespace: TimelineAssemblySourceNamespace
  coverage_map: TimelineAssemblyCoverageMap
  decision_log: TimelineAssemblyDecisionLogEntry[]
  edit_action_plan: TimelineAssemblyEditActionPlan
  assembly: Record<string, unknown>
  openmontage: {
    asset_manifest: MovScriptAssetManifest
    edit_decisions: MovScriptEditDecisionsArtifact
  }
  compile_manifest: TimelineAssemblyCompileManifest
  compile_result: TimelineAssemblyMediaEditingCompileResult
  backend_options: EditDeskFinishingBackendOption[]
  finishing_projects: Record<EditDeskFinishingBackend, TimelineAssemblyFinishingCompileResult>
  editing_project_create_from_edit_decisions: Record<string, unknown>
  video_compose_request: Record<string, unknown>
  media_editing_project_preview?: MediaEditingProject
  validation: AssemblyValidationResult & {
    compile_diagnostics: TimelineAssemblyCompileDiagnostic[]
    editing_timeline_diagnostics: MediaTimelineDiagnostic[]
  }
}

interface EditDeskAssetItem extends WorkflowAssetManifestRow {
  blockers: string[]
  mediaUrl?: string
  localPath?: string
  sceneId?: string
  expressionUnitId?: string
  targetRef?: string
}

interface EditDeskComposeState {
  status: ComposeStatus
  message?: string
  result?: Record<string, unknown>
  taskId?: string
  projectId?: string
  taskStatus?: string
  progressPercent?: number
  outputPath?: string
  updatedAt?: string
}

interface AssemblyTrack {
  id: string
  name: string
  kind: AssemblyTrackKind
  role: string
  color: 'blue' | 'green' | 'orange' | 'violet' | 'rose' | 'slate'
  order: number
  muted?: boolean
  locked?: boolean
}

interface AssemblyClip {
  id: string
  trackId: string
  title: string
  kind: AssemblyClipKind
  startMs: number
  durationMs: number
  sourceInMs: number
  volume: number
  notes: string
  source: {
    assetId: string
    type: string
    status: WorkflowAssetManifestRow['status']
    contentUnitId?: string
    candidateId?: string
    resourceId?: string
    mediaUrl?: string
    localPath?: string
  }
  binding: {
    sceneId?: string
    expressionUnitId?: string
    targetRef?: string
  }
  intentRef: TimelineAssemblyIntentRef
  edit: TimelineAssemblyClipEditIntent
}

export interface TimelineAssemblyState {
  schema: 'movscript.timeline_assembly.intent_workbench.v1'
  id: string
  seedKey: string
  productionId?: string
  targetRef: string
  sourceNamespace: TimelineAssemblySourceNamespace
  editProfile: TimelineAssemblyEditProfile
  tracks: AssemblyTrack[]
  clips: AssemblyClip[]
  selectedClipId?: string
  playheadMs: number
  zoomPxPerSecond: number
  revision: number
}

type EditDeskDragPayload = {
  kind: 'asset' | 'clip'
  id: string
}

const EDIT_DESK_DRAG_MIME = 'application/x-movscript-edit-desk'
const TIMELINE_SNAP_MS = 250
const MIN_CLIP_DURATION_MS = 500

const DEFAULT_ASSEMBLY_TRACKS: AssemblyTrack[] = [
  { id: 'video_main', name: '主画面', kind: 'video', role: 'picture', color: 'blue', order: 10 },
  { id: 'video_overlay', name: '叠加画面', kind: 'video', role: 'overlay', color: 'violet', order: 20 },
  { id: 'voice', name: '旁白/对白', kind: 'audio', role: 'voice', color: 'green', order: 30 },
  { id: 'music', name: '音乐', kind: 'audio', role: 'music', color: 'orange', order: 40 },
  { id: 'sfx', name: '音效', kind: 'audio', role: 'sound_effect', color: 'rose', order: 50 },
  { id: 'subtitle', name: '字幕', kind: 'subtitle', role: 'subtitle', color: 'slate', order: 60 },
  { id: 'effect', name: '转场/特效', kind: 'effect', role: 'effect', color: 'violet', order: 70 },
]

const DEFAULT_EDIT_PROFILE: TimelineAssemblyEditProfile = {
  schema: 'movscript.timeline_assembly.openmontage_edit_profile.v1',
  rendererFamily: 'explainer-data',
  renderRuntime: 'movscript_media_pipeline',
  compositionMode: 'templated',
  subtitles: {
    enabled: true,
    style: 'phrase',
    font: 'Inter',
    fontSize: 42,
    color: '#FFFFFF',
    background: '#00000088',
    position: 'bottom-center',
    maxWordsPerLine: 8,
  },
  audio: {
    musicVolume: 0.45,
    musicFadeInMs: 1000,
    musicFadeOutMs: 1000,
    ducking: {
      enabled: true,
      thresholdDb: -3,
      reductionDb: -8,
      attackMs: 200,
      releaseMs: 500,
    },
  },
  pacing: {
    minSceneHoldMs: 1000,
    maxSceneHoldMs: 10000,
    textCardHoldMs: 3000,
    transitionDurationMs: 300,
  },
}

const OPENMONTAGE_REVIEW_GATES = [
  'all_cuts_reference_manifest_assets',
  'primary_visuals_cover_full_duration',
  'primary_visuals_have_no_overlap',
  'subtitles_enabled_or_explicitly_disabled',
  'music_ducking_configured_when_narration_exists',
  'render_runtime_locked_no_silent_swap',
]

export function ProjectEditDeskSurface({
  params = new URLSearchParams(),
  productionId,
  readModelStatus = 'idle',
  readModel,
  snapshot,
  error,
}: ProjectEditDeskSurfaceProps) {
  const runtime = useProjectSurfaceRuntime()
  const domainFocus = agentSurfaceSnapshotDomainFocus(snapshot)
    ?? agentSurfaceDomainFocus(params, { projectId: runtime.project.projectId, productionId })
  const legacyProductionId = agentSurfaceLegacyProductionId(domainFocus, productionId)
  const focusLabel = agentSurfaceFocusLabel(domainFocus, legacyProductionId ? `production: ${legacyProductionId}` : '')
  const debugView = useMemo(() => buildWorkflowArtifactDebugView({ readModel, snapshot }), [readModel, snapshot])
  const assemblySeed = useMemo(() => buildTimelineAssemblyState({
    debugView,
    productionId: legacyProductionId,
    targetRef: domainFocus.target?.targetRef ?? '',
    focusLabel,
  }), [debugView, domainFocus.target?.targetRef, focusLabel, legacyProductionId])
  const [assembly, setAssembly] = useState<TimelineAssemblyState>(assemblySeed)
  const [activeSeedKey, setActiveSeedKey] = useState(assemblySeed.seedKey)

  useEffect(() => {
    if (activeSeedKey === assemblySeed.seedKey) return
    setAssembly(assemblySeed)
    setActiveSeedKey(assemblySeed.seedKey)
  }, [activeSeedKey, assemblySeed])

  const resetAssembly = () => {
    setAssembly(assemblySeed)
    setActiveSeedKey(assemblySeed.seedKey)
  }

  return (
    <AgentSurfaceShell
      title="剪辑台"
      chips={[
        `project: ${runtime.project.projectId}`,
        focusLabel || domainFocus.target?.targetRef || 'timeline assembly',
      ]}
      ready
    >
      {readModelStatus === 'loading' ? (
        <div className="agent-surface-status">Loading edit desk...</div>
      ) : error ? (
        <div className="agent-surface-status">{error.message}</div>
      ) : (
        <ProjectEditDeskWorkbench
          assembly={assembly}
          debugView={debugView}
          focusLabel={focusLabel}
          generatedAt={snapshot?.generated_at}
          params={params}
          projectId={runtime.project.projectId}
          editingGateway={runtime.gateways.editing}
          readModelStatus={readModelStatus}
          setAssembly={setAssembly}
          onResetAssembly={resetAssembly}
        />
      )}
    </AgentSurfaceShell>
  )
}

function ProjectEditDeskWorkbench({
  assembly,
  debugView,
  focusLabel,
  generatedAt,
  params,
  projectId,
  editingGateway,
  readModelStatus,
  setAssembly,
  onResetAssembly,
}: {
  assembly: TimelineAssemblyState
  debugView: WorkflowArtifactDebugView
  focusLabel: string
  generatedAt?: string
  params: URLSearchParams
  projectId: string
  editingGateway?: EditingServiceGateway
  readModelStatus: ProjectEditDeskReadModelStatus
  setAssembly: Dispatch<SetStateAction<TimelineAssemblyState>>
  onResetAssembly: () => void
}) {
  const assets = useMemo(() => editDeskAssetItems(debugView), [debugView])
  const selectedClip = assembly.clips.find((clip) => clip.id === assembly.selectedClipId)
  const activeClip = selectedClip ?? clipAtPlayhead(assembly)
  const handoff = useMemo(() => buildEditDecisionHandoff(assembly, debugView, projectId), [assembly, debugView, projectId])
  const validation = handoff.validation
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [composeState, setComposeState] = useState<EditDeskComposeState>({ status: 'idle' })

  const updateAssembly = (updater: (current: TimelineAssemblyState) => TimelineAssemblyState) => {
    setAssembly((current) => updater(current))
    setCopyStatus('idle')
    setComposeState((current) => current.status === 'idle' ? current : { status: 'idle' })
  }

  const updateClip = (clipId: string, patch: Partial<AssemblyClip>) => {
    updateAssembly((current) => nextAssembly(current, {
      clips: current.clips.map((clip) => clip.id === clipId ? normalizeClip({ ...clip, ...patch }) : clip),
      selectedClipId: clipId,
    }))
  }

  const selectClip = (clipId: string) => {
    updateAssembly((current) => nextAssembly(current, { selectedClipId: clipId }))
  }

  const movePlayhead = (playheadMs: number) => {
    updateAssembly((current) => nextAssembly(current, { playheadMs: clampTimelineMs(playheadMs) }))
  }

  const handleTimelineDrop = (trackId: string, startMs: number, payload: EditDeskDragPayload) => {
    updateAssembly((current) => {
      if (payload.kind === 'clip') {
        return nextAssembly(current, {
          clips: current.clips.map((clip) => clip.id === payload.id
            ? normalizeClip({ ...clip, trackId, startMs })
            : clip),
          selectedClipId: payload.id,
          playheadMs: startMs,
        })
      }
      const asset = assets.find((item) => item.id === payload.id)
      if (!asset) return current
      const clip = clipFromAsset(asset, trackId, startMs, current.clips.length + current.revision + 1, current.sourceNamespace, current.productionId)
      return nextAssembly(current, {
        clips: [...current.clips, clip],
        selectedClipId: clip.id,
        playheadMs: startMs,
      })
    })
  }

  const deleteClip = (clipId: string) => {
    updateAssembly((current) => {
      const remaining = current.clips.filter((clip) => clip.id !== clipId)
      return nextAssembly(current, {
        clips: remaining,
        selectedClipId: remaining[0]?.id,
      })
    })
  }

  const duplicateClip = (clipId: string) => {
    updateAssembly((current) => {
      const clip = current.clips.find((item) => item.id === clipId)
      if (!clip) return current
      const duplicate = normalizeClip({
        ...clip,
        id: `${clip.id}-copy-${current.revision + 1}`,
        title: `${clip.title} copy`,
        startMs: clip.startMs + clip.durationMs,
      })
      return nextAssembly(current, {
        clips: [...current.clips, duplicate],
        selectedClipId: duplicate.id,
        playheadMs: duplicate.startMs,
      })
    })
  }

  const splitClip = (clipId: string) => {
    updateAssembly((current) => {
      const clip = current.clips.find((item) => item.id === clipId)
      if (!clip) return current
      const splitAt = clampTimelineMs(current.playheadMs)
      const offset = splitAt - clip.startMs
      if (offset < MIN_CLIP_DURATION_MS || clip.durationMs - offset < MIN_CLIP_DURATION_MS) return current
      const first = normalizeClip({ ...clip, durationMs: offset })
      const second = normalizeClip({
        ...clip,
        id: `${clip.id}-split-${current.revision + 1}`,
        title: `${clip.title} 2`,
        startMs: splitAt,
        durationMs: clip.durationMs - offset,
        sourceInMs: clip.sourceInMs + offset,
      })
      return nextAssembly(current, {
        clips: current.clips.flatMap((item) => item.id === clipId ? [first, second] : [item]),
        selectedClipId: second.id,
      })
    })
  }

  const copyJson = async (value: unknown) => {
    const text = JSON.stringify(value, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  const copyHandoff = () => copyJson(handoff)
  const copyOpenMontage = () => copyJson(handoff.openmontage)
  const copyEditingProjectRequest = () => copyJson(handoff.editing_project_create_from_edit_decisions)
  const copyVideoComposeRequest = () => copyJson(handoff.video_compose_request)

  const runVideoCompose = async () => {
    if (!editingGateway?.render) {
      setComposeState({
        status: 'error',
        message: '当前 project surface 没有 Editing Service gateway，无法直接创建成片任务。',
      })
      return
    }
    setComposeState({ status: 'running', message: '正在创建 MediaEditingProject 和渲染任务...' })
    try {
      const result = await editingGateway.render(handoff.video_compose_request)
      const resultRecord = recordValue(result) ?? { result }
      const status = stringValue(resultRecord.status)
      if (status === 'blocked' || status === 'unsupported_runtime') {
        setComposeState({
          status: 'blocked',
          message: stringValue(resultRecord.message) ?? '成片请求被编译或运行时能力检查阻塞。',
          result: resultRecord,
        })
        return
      }
      setComposeState({
        status: composeStatusFromTask(composeTaskRecord(resultRecord), 'succeeded'),
        message: composeResultMessage(resultRecord),
        result: resultRecord,
        taskId: composeTaskId(resultRecord),
        projectId: composeProjectId(resultRecord) ?? projectId,
        taskStatus: composeTaskStatus(resultRecord),
        progressPercent: composeTaskProgress(resultRecord),
        outputPath: composeOutputPath(resultRecord),
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      setComposeState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  useEffect(() => {
    if (!editingGateway?.taskGet || !composeState.taskId || composeState.status !== 'running') return
    let cancelled = false
    let timeout: number | undefined
    const taskId = composeState.taskId
    const taskProjectId = composeState.projectId ?? projectId

    const pollTask = async () => {
      try {
        const response = await editingGateway.taskGet?.({ projectId: taskProjectId, taskId })
        if (cancelled) return
        const responseRecord = recordValue(response) ?? {}
        const task = recordValue(responseRecord.task ?? responseRecord.media_pipeline_task ?? response)
        if (!task) {
          setComposeState((current) => current.taskId === taskId
            ? {
              ...current,
              status: 'error',
              message: `成片任务不存在：${taskId}`,
              updatedAt: new Date().toISOString(),
            }
            : current)
          return
        }
        setComposeState((current) => {
          if (current.taskId !== taskId) return current
          const result = mergeComposeTaskResult(current.result, task)
          return {
            ...current,
            status: composeStatusFromTask(task, current.status),
            message: composeResultMessage(result),
            result,
            taskStatus: composeTaskStatus(result),
            progressPercent: composeTaskProgress(result),
            outputPath: composeOutputPath(result),
            updatedAt: new Date().toISOString(),
          }
        })
        if (!composeTaskIsTerminal(task)) {
          timeout = window.setTimeout(pollTask, 1000)
        }
      } catch (error) {
        if (cancelled) return
        setComposeState((current) => current.taskId === taskId
          ? {
            ...current,
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
            updatedAt: new Date().toISOString(),
          }
          : current)
      }
    }

    timeout = window.setTimeout(pollTask, 350)
    return () => {
      cancelled = true
      if (timeout !== undefined) window.clearTimeout(timeout)
    }
  }, [composeState.projectId, composeState.status, composeState.taskId, editingGateway, projectId])

  return (
    <div className="edit-desk-workbench">
      <div className="edit-desk-toolbar">
        <div className="edit-desk-toolbar__title">
          <span>TimelineAssembly</span>
          <strong>{assembly.targetRef || focusLabel || 'draft timeline'}</strong>
        </div>
        <div className="edit-desk-toolbar__metrics" aria-label="剪辑台状态">
          <EditDeskMetric label="素材" value={assets.length} />
          <EditDeskMetric label="Clips" value={assembly.clips.length} />
          <EditDeskMetric label="动作" value={handoff.edit_action_plan.actions.length} />
          <EditDeskMetric label="时长" value={formatDuration(assemblyDurationMs(assembly))} />
          <EditDeskMetric label="阻塞" value={validation.blockerCount} tone={validation.blockerCount > 0 ? 'warning' : 'ok'} />
        </div>
        <div className="edit-desk-toolbar__actions">
          <button className="agent-surface-button" type="button" onClick={onResetAssembly}>重建草案</button>
          <button
            className="agent-surface-button"
            type="button"
            data-intent="adopt"
            disabled={composeState.status === 'running' || handoff.compile_manifest.status !== 'ready'}
            onClick={() => void runVideoCompose()}
          >
            {composeState.status === 'running' ? '创建中...' : '创建成片任务'}
          </button>
          <button className="agent-surface-button" type="button" data-intent="adopt" onClick={copyHandoff}>复制 edit decisions</button>
        </div>
      </div>

      <div className="edit-desk-main">
        <div className="edit-desk-left-rail">
          <NamespaceSpinePanel
            coverage={handoff.coverage_map}
            decisionLog={handoff.decision_log}
            sourceNamespace={assembly.sourceNamespace}
          />
          <AssetLibraryPanel
            assets={assets}
            params={params}
            projectId={projectId}
          />
        </div>
        <ProgramPreview
          activeClip={activeClip}
          assembly={assembly}
          generatedAt={generatedAt}
          readModelStatus={readModelStatus}
          validation={validation}
        />
        <ClipInspector
          assembly={assembly}
          clip={selectedClip}
          handoff={handoff}
          copyStatus={copyStatus}
          onCopyHandoff={copyHandoff}
          onDeleteClip={deleteClip}
          onDuplicateClip={duplicateClip}
          onMoveClipToPlayhead={(clipId) => updateClip(clipId, { startMs: assembly.playheadMs })}
          onSplitClip={splitClip}
          onUpdateClip={updateClip}
        />
      </div>

      <AssemblyTimeline
        assembly={assembly}
        onDropPayload={handleTimelineDrop}
        onMovePlayhead={movePlayhead}
        onSelectClip={selectClip}
      />

      <HandoffPanel
        copyStatus={copyStatus}
        debugView={debugView}
        handoff={handoff}
        composeState={composeState}
        validation={validation}
        onCopyHandoff={copyHandoff}
        onCopyEditingProjectRequest={copyEditingProjectRequest}
        onCopyOpenMontage={copyOpenMontage}
        onCopyVideoComposeRequest={copyVideoComposeRequest}
        onRunVideoCompose={() => void runVideoCompose()}
      />
    </div>
  )
}

function NamespaceSpinePanel({
  coverage,
  decisionLog,
  sourceNamespace,
}: {
  coverage: TimelineAssemblyCoverageMap
  decisionLog: TimelineAssemblyDecisionLogEntry[]
  sourceNamespace: TimelineAssemblySourceNamespace
}) {
  const visibleNodes = sourceNamespace.nodes.slice(0, 6)
  const hiddenNodeCount = Math.max(0, sourceNamespace.nodes.length - visibleNodes.length)
  const decisionBlockers = decisionLog.filter((entry) => entry.severity === 'error').length

  return (
    <section className="edit-desk-panel edit-desk-namespace-spine" aria-label="影视意图主干">
      <header className="edit-desk-panel__header">
        <div>
          <span>影视意图主干</span>
          <strong>{sourceNamespace.root?.title ?? sourceNamespace.targetRef}</strong>
        </div>
        <small>{sourceNamespace.scopeKind && sourceNamespace.scopeRef ? `${sourceNamespace.scopeKind}:${sourceNamespace.scopeRef}` : 'timeline scope'}</small>
      </header>
      <div className="edit-desk-spine-list">
        {visibleNodes.length > 0 ? visibleNodes.map((node) => (
          <article key={`${node.kind}:${node.id}`} className="edit-desk-spine-node">
            <strong>{node.title}</strong>
            <span>{[node.kind, node.entityKind, node.parentId ? `parent ${node.parentId}` : undefined].filter(Boolean).join(' · ')}</span>
          </article>
        )) : (
          <p className="edit-desk-empty">还没有读到 timeline namespace；当前 assembly 会作为独立草案保留 targetRef。</p>
        )}
        {hiddenNodeCount > 0 ? <p className="edit-desk-empty">还有 {hiddenNodeCount} 个 namespace 节点未展开。</p> : null}
      </div>
      <div className="edit-desk-coverage-strip">
        <EditDeskMetric label="应覆盖 CU" value={coverage.summary.expectedContentUnitCount} />
        <EditDeskMetric label="已覆盖" value={coverage.summary.coveredContentUnitCount} tone={coverage.summary.uncoveredContentUnitCount === 0 ? 'ok' : undefined} />
        <EditDeskMetric label="未覆盖" value={coverage.summary.uncoveredContentUnitCount} tone={coverage.summary.uncoveredContentUnitCount > 0 ? 'warning' : 'ok'} />
        <EditDeskMetric label="待决策" value={decisionLog.length} tone={decisionBlockers > 0 ? 'warning' : undefined} />
      </div>
    </section>
  )
}

function AssetLibraryPanel({
  assets,
  params,
  projectId,
}: {
  assets: EditDeskAssetItem[]
  params: URLSearchParams
  projectId: string
}) {
  const selectedAssets = assets.filter((asset) => asset.status === 'selected')
  const pendingAssets = assets.filter((asset) => asset.status !== 'selected')

  return (
    <section className="edit-desk-panel edit-desk-asset-library" aria-label="素材池">
      <header className="edit-desk-panel__header">
        <div>
          <span>素材池</span>
          <strong>ContentUnit outputs</strong>
        </div>
        <small>拖到下方轨道</small>
      </header>
      <div className="edit-desk-asset-library__group">
        <h3>已选择素材</h3>
        {selectedAssets.length > 0 ? selectedAssets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} params={params} projectId={projectId} />
        )) : <p className="edit-desk-empty">还没有可用 Selection，可先把占位素材排入时间线。</p>}
      </div>
      <div className="edit-desk-asset-library__group">
        <h3>待补齐</h3>
        {pendingAssets.length > 0 ? pendingAssets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} params={params} projectId={projectId} />
        )) : <p className="edit-desk-empty">没有阻塞素材。</p>}
      </div>
    </section>
  )
}

function AssetCard({
  asset,
  params,
  projectId,
}: {
  asset: EditDeskAssetItem
  params: URLSearchParams
  projectId: string
}) {
  return (
    <article
      className="edit-desk-asset-card"
      data-status={asset.status}
      draggable
      onDragStart={(event) => writeDragPayload(event, { kind: 'asset', id: asset.id })}
    >
      <div className="edit-desk-asset-card__main">
        <strong>{asset.title}</strong>
        <span>{[
          asset.type,
          asset.contentUnitId ? `CU ${asset.contentUnitId}` : undefined,
          asset.resourceId ? `resource ${asset.resourceId}` : undefined,
        ].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="edit-desk-chip-row">
        <StatusPill status={asset.status} />
        {asset.candidateId ? <span className="edit-desk-chip">candidate {asset.candidateId}</span> : null}
      </div>
      {asset.blockers.length > 0 ? <p>{asset.blockers.join(' · ')}</p> : null}
      <div className="edit-desk-card-actions">
        {asset.resourceId ? <AgentSurfaceLink href={withParams(`/agent/resources/${asset.resourceId}`, params, { projectId })}>资源</AgentSurfaceLink> : null}
        {asset.contentUnitId ? <AgentSurfaceLink href={withParams('/agent/content/candidates', params, { projectId, contentUnitId: asset.contentUnitId, candidateId: asset.candidateId, resourceId: asset.resourceId })}>候选</AgentSurfaceLink> : null}
      </div>
    </article>
  )
}

function ProgramPreview({
  activeClip,
  assembly,
  generatedAt,
  readModelStatus,
  validation,
}: {
  activeClip?: AssemblyClip
  assembly: TimelineAssemblyState
  generatedAt?: string
  readModelStatus: ProjectEditDeskReadModelStatus
  validation: ReturnType<typeof assemblyValidation>
}) {
  const mediaUrl = activeClip?.source.mediaUrl
  const isVideo = activeClip ? activeClip.kind === 'visual' && looksLikeVideo(mediaUrl, activeClip.source.type) : false
  const isImage = activeClip ? activeClip.kind === 'visual' && mediaUrl && !isVideo : false

  return (
    <section className="edit-desk-panel edit-desk-preview" aria-label="节目预览">
      <header className="edit-desk-panel__header">
        <div>
          <span>节目预览</span>
          <strong>{activeClip?.title ?? '选择或拖入一个 clip'}</strong>
        </div>
        <small>{formatDuration(assembly.playheadMs)} / {formatDuration(assemblyDurationMs(assembly))}</small>
      </header>
      <div className="edit-desk-preview__stage">
        {isVideo && mediaUrl ? (
          <video src={mediaUrl} controls />
        ) : isImage && mediaUrl ? (
          <img src={mediaUrl} alt={activeClip?.title ?? 'preview'} />
        ) : (
          <div className="edit-desk-preview__placeholder">
            <span>{activeClip ? clipKindLabel(activeClip.kind) : 'TimelineAssembly'}</span>
            <strong>{activeClip?.title ?? '把素材拖到时间线开始编排'}</strong>
            <p>{activeClip?.source.resourceId ? `resource ${activeClip.source.resourceId}` : '这里是影视意图到剪辑交接前的组装预览。'}</p>
          </div>
        )}
      </div>
      <div className="edit-desk-preview__meta">
        <EditDeskMetric label="Read model" value={readModelStatus} />
        <EditDeskMetric label="Generated" value={generatedAt ? new Date(generatedAt).toLocaleString() : 'draft'} />
        <EditDeskMetric label="可渲染" value={validation.blockerCount === 0 ? 'ready' : 'blocked'} tone={validation.blockerCount === 0 ? 'ok' : 'warning'} />
      </div>
    </section>
  )
}

function ClipInspector({
  assembly,
  clip,
  handoff,
  copyStatus,
  onCopyHandoff,
  onDeleteClip,
  onDuplicateClip,
  onMoveClipToPlayhead,
  onSplitClip,
  onUpdateClip,
}: {
  assembly: TimelineAssemblyState
  clip?: AssemblyClip
  handoff: EditDeskHandoffBundle
  copyStatus: CopyStatus
  onCopyHandoff: () => void
  onDeleteClip: (clipId: string) => void
  onDuplicateClip: (clipId: string) => void
  onMoveClipToPlayhead: (clipId: string) => void
  onSplitClip: (clipId: string) => void
  onUpdateClip: (clipId: string, patch: Partial<AssemblyClip>) => void
}) {
  return (
    <section className="edit-desk-panel edit-desk-inspector" aria-label="检查器">
      <header className="edit-desk-panel__header">
        <div>
          <span>检查器</span>
          <strong>{clip ? 'Clip intent' : 'Handoff'}</strong>
        </div>
        <button className="agent-surface-button" type="button" onClick={onCopyHandoff}>复制</button>
      </header>
      {clip ? (
        <div className="edit-desk-inspector__body">
          <label className="edit-desk-field">
            <span>标题</span>
            <input value={clip.title} onChange={(event) => onUpdateClip(clip.id, { title: event.currentTarget.value })} />
          </label>
          <div className="edit-desk-field-grid">
            <label className="edit-desk-field">
              <span>轨道</span>
              <select value={clip.trackId} onChange={(event) => onUpdateClip(clip.id, { trackId: event.currentTarget.value })}>
                {assembly.tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
              </select>
            </label>
            <label className="edit-desk-field">
              <span>类型</span>
              <input value={clipKindLabel(clip.kind)} readOnly />
            </label>
          </div>
          <div className="edit-desk-field-grid">
            <label className="edit-desk-field">
              <span>起点 秒</span>
              <input
                min={0}
                step={0.25}
                type="number"
                value={formatSecondsInput(clip.startMs)}
                onChange={(event) => onUpdateClip(clip.id, { startMs: secondsToMs(event.currentTarget.value) })}
              />
            </label>
            <label className="edit-desk-field">
              <span>时长 秒</span>
              <input
                min={0.5}
                step={0.25}
                type="number"
                value={formatSecondsInput(clip.durationMs)}
                onChange={(event) => onUpdateClip(clip.id, { durationMs: Math.max(MIN_CLIP_DURATION_MS, secondsToMs(event.currentTarget.value)) })}
              />
            </label>
          </div>
          <div className="edit-desk-field-grid">
            <label className="edit-desk-field">
              <span>Source in 秒</span>
              <input
                min={0}
                step={0.25}
                type="number"
                value={formatSecondsInput(clip.sourceInMs)}
                onChange={(event) => onUpdateClip(clip.id, { sourceInMs: secondsToMs(event.currentTarget.value) })}
              />
            </label>
            <label className="edit-desk-field">
              <span>音量</span>
              <input
                max={2}
                min={0}
                step={0.05}
                type="number"
                value={clip.volume}
                onChange={(event) => onUpdateClip(clip.id, { volume: Number(event.currentTarget.value) || 0 })}
              />
            </label>
          </div>
          <label className="edit-desk-field">
            <span>意图备注</span>
            <textarea value={clip.notes} rows={4} onChange={(event) => onUpdateClip(clip.id, { notes: event.currentTarget.value })} />
          </label>
          <details className="edit-desk-inspector-section" open>
            <summary>OpenMontage 动作</summary>
            <div className="edit-desk-field-grid">
              <label className="edit-desk-field">
                <span>Layer</span>
                <select value={clip.edit.layer} onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, layer: event.currentTarget.value as TimelineAssemblyOpenMontageLayer } })}>
                  <option value="primary">primary</option>
                  <option value="overlay">overlay</option>
                  <option value="background">background</option>
                </select>
              </label>
              <label className="edit-desk-field">
                <span>Speed</span>
                <input
                  min={0.1}
                  step={0.1}
                  type="number"
                  value={clip.edit.speed}
                  onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, speed: Number(event.currentTarget.value) || 1 } })}
                />
              </label>
            </div>
            <div className="edit-desk-field-grid">
              <label className="edit-desk-field">
                <span>Motion</span>
                <select value={clip.edit.transform.animation} onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, transform: { ...clip.edit.transform, animation: event.currentTarget.value } } })}>
                  <option value="static">static</option>
                  <option value="ken-burns-slow-zoom">ken-burns-slow-zoom</option>
                  <option value="pan-left">pan-left</option>
                  <option value="pan-right">pan-right</option>
                  <option value="push-in">push-in</option>
                </select>
              </label>
              <label className="edit-desk-field">
                <span>Scale</span>
                <input
                  min={0}
                  step={0.05}
                  type="number"
                  value={clip.edit.transform.scale}
                  onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, transform: { ...clip.edit.transform, scale: Number(event.currentTarget.value) || 1 } } })}
                />
              </label>
            </div>
            <div className="edit-desk-field-grid">
              <label className="edit-desk-field">
                <span>Transition in</span>
                <select value={clip.edit.transitionIn} onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, transitionIn: event.currentTarget.value } })}>
                  <option value="cut">cut</option>
                  <option value="fade">fade</option>
                  <option value="dissolve">dissolve</option>
                  <option value="wipe">wipe</option>
                </select>
              </label>
              <label className="edit-desk-field">
                <span>Transition out</span>
                <select value={clip.edit.transitionOut} onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, transitionOut: event.currentTarget.value } })}>
                  <option value="cut">cut</option>
                  <option value="fade">fade</option>
                  <option value="dissolve">dissolve</option>
                  <option value="wipe">wipe</option>
                </select>
              </label>
            </div>
            <div className="edit-desk-field-grid">
              <label className="edit-desk-field">
                <span>Transition 秒</span>
                <input
                  min={0}
                  step={0.1}
                  type="number"
                  value={formatSecondsInput(clip.edit.transitionDurationMs)}
                  onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, transitionDurationMs: secondsToDurationMs(event.currentTarget.value) } })}
                />
              </label>
              <label className="edit-desk-field">
                <span>Position</span>
                <input
                  value={clip.edit.transform.position}
                  onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, transform: { ...clip.edit.transform, position: event.currentTarget.value } } })}
                />
              </label>
            </div>
            <div className="edit-desk-field-grid edit-desk-field-grid--overlay">
              <label className="edit-desk-field">
                <span>Overlay X</span>
                <input min={0} max={1} step={0.05} type="number" value={clip.edit.overlay.x} onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, overlay: { ...clip.edit.overlay, x: Number(event.currentTarget.value) || 0 } } })} />
              </label>
              <label className="edit-desk-field">
                <span>Overlay Y</span>
                <input min={0} max={1} step={0.05} type="number" value={clip.edit.overlay.y} onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, overlay: { ...clip.edit.overlay, y: Number(event.currentTarget.value) || 0 } } })} />
              </label>
              <label className="edit-desk-field">
                <span>W</span>
                <input min={0} max={1} step={0.05} type="number" value={clip.edit.overlay.width} onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, overlay: { ...clip.edit.overlay, width: Number(event.currentTarget.value) || 1 } } })} />
              </label>
              <label className="edit-desk-field">
                <span>H</span>
                <input min={0} max={1} step={0.05} type="number" value={clip.edit.overlay.height} onChange={(event) => onUpdateClip(clip.id, { edit: { ...clip.edit, overlay: { ...clip.edit.overlay, height: Number(event.currentTarget.value) || 1 } } })} />
              </label>
            </div>
          </details>
          <div className="edit-desk-chip-row">
            <StatusPill status={clip.source.status} />
            {clip.source.contentUnitId ? <span className="edit-desk-chip">CU {clip.source.contentUnitId}</span> : null}
            {clip.source.resourceId ? <span className="edit-desk-chip">resource {clip.source.resourceId}</span> : null}
            {clip.intentRef.sceneMomentId ? <span className="edit-desk-chip">scene {clip.intentRef.sceneMomentId}</span> : null}
            {clip.intentRef.expressionUnitId ? <span className="edit-desk-chip">expression {clip.intentRef.expressionUnitId}</span> : null}
            {clip.intentRef.namespaceKind && clip.intentRef.scopeRef ? <span className="edit-desk-chip">{clip.intentRef.namespaceKind} {clip.intentRef.scopeRef}</span> : null}
          </div>
          <div className="edit-desk-inspector__actions">
            <button className="agent-surface-button" type="button" onClick={() => onMoveClipToPlayhead(clip.id)}>对齐播放头</button>
            <button className="agent-surface-button" type="button" onClick={() => onSplitClip(clip.id)}>按播放头拆分</button>
            <button className="agent-surface-button" type="button" onClick={() => onDuplicateClip(clip.id)}>复制 clip</button>
            <button className="agent-surface-button" type="button" data-intent="reject" onClick={() => onDeleteClip(clip.id)}>删除</button>
          </div>
        </div>
      ) : (
        <div className="edit-desk-inspector__empty">
          <p>选择时间线上的 clip 后可以调整轨道、时间、音量和意图备注。</p>
          <div className="edit-desk-chip-row">
            <span className="edit-desk-chip">schema {String(handoff.schema)}</span>
            <span className="edit-desk-chip">copy {copyStatus}</span>
          </div>
        </div>
      )}
    </section>
  )
}

function AssemblyTimeline({
  assembly,
  onDropPayload,
  onMovePlayhead,
  onSelectClip,
}: {
  assembly: TimelineAssemblyState
  onDropPayload: (trackId: string, startMs: number, payload: EditDeskDragPayload) => void
  onMovePlayhead: (playheadMs: number) => void
  onSelectClip: (clipId: string) => void
}) {
  const durationMs = assemblyDurationMs(assembly)
  const width = Math.max(980, Math.ceil((durationMs / 1000) * assembly.zoomPxPerSecond) + 160)
  const ticks = timelineTicks(durationMs)

  return (
    <section className="edit-desk-panel edit-desk-timeline" aria-label="多轨意图时间线">
      <header className="edit-desk-panel__header">
        <div>
          <span>多轨意图时间线</span>
          <strong>影视意图层 + 组装层</strong>
        </div>
        <small>拖动素材或 clip，点击轨道设置播放头</small>
      </header>
      <div className="edit-desk-timeline__shell">
        <div className="edit-desk-timeline__track-spacer" />
        <div className="edit-desk-timeline__scroll">
          <div className="edit-desk-ruler" style={{ width }}>
            {ticks.map((tick) => (
              <span key={tick} style={{ left: tickToLeft(tick, assembly.zoomPxPerSecond) }}>{formatDuration(tick)}</span>
            ))}
            <i className="edit-desk-playhead" style={{ left: tickToLeft(assembly.playheadMs, assembly.zoomPxPerSecond) }} />
          </div>
          {assembly.tracks.map((track) => (
            <div key={track.id} className="edit-desk-track">
              <div className="edit-desk-track__label" data-kind={track.kind}>
                <strong>{track.name}</strong>
                <span>{track.role}</span>
              </div>
              <div
                className="edit-desk-track__lane"
                onClick={(event) => onMovePlayhead(pointerMs(event, assembly.zoomPxPerSecond))}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const payload = readDragPayload(event)
                  if (!payload) return
                  event.preventDefault()
                  onDropPayload(track.id, pointerMs(event, assembly.zoomPxPerSecond), payload)
                }}
              >
                <div className="edit-desk-track__content" style={{ width }}>
                  {ticks.map((tick) => <i key={tick} className="edit-desk-gridline" style={{ left: tickToLeft(tick, assembly.zoomPxPerSecond) }} />)}
                  {assembly.clips.filter((clip) => clip.trackId === track.id).map((clip) => (
                    <button
                      key={clip.id}
                      className="edit-desk-clip"
                      data-color={track.color}
                      data-selected={clip.id === assembly.selectedClipId}
                      draggable
                      style={{
                        left: tickToLeft(clip.startMs, assembly.zoomPxPerSecond),
                        width: Math.max(48, tickToLeft(clip.durationMs, assembly.zoomPxPerSecond)),
                      }}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectClip(clip.id)
                      }}
                      onDragStart={(event) => writeDragPayload(event, { kind: 'clip', id: clip.id })}
                    >
                      <span>{clip.title}</span>
                      <small>{formatDuration(clip.durationMs)}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HandoffPanel({
  copyStatus,
  composeState,
  debugView,
  handoff,
  validation,
  onCopyHandoff,
  onCopyEditingProjectRequest,
  onCopyOpenMontage,
  onCopyVideoComposeRequest,
  onRunVideoCompose,
}: {
  copyStatus: CopyStatus
  composeState: EditDeskComposeState
  debugView: WorkflowArtifactDebugView
  handoff: EditDeskHandoffBundle
  validation: AssemblyValidationResult
  onCopyHandoff: () => void
  onCopyEditingProjectRequest: () => void
  onCopyOpenMontage: () => void
  onCopyVideoComposeRequest: () => void
  onRunVideoCompose: () => void
}) {
  return (
    <section className="edit-desk-panel edit-desk-handoff" aria-label="交接与调试">
      <header className="edit-desk-panel__header">
        <div>
          <span>video_compose handoff</span>
          <strong>{validation.blockerCount > 0 ? '需要补齐素材' : '可以交给剪辑工具'}</strong>
        </div>
        <div className="edit-desk-panel__actions">
          <button className="agent-surface-button" type="button" onClick={onCopyOpenMontage}>复制 OpenMontage</button>
          <button className="agent-surface-button" type="button" onClick={onCopyEditingProjectRequest}>复制创建请求</button>
          <button
            className="agent-surface-button"
            type="button"
            data-intent="adopt"
            disabled={composeState.status === 'running' || handoff.compile_manifest.status !== 'ready'}
            onClick={onRunVideoCompose}
          >
            {composeState.status === 'running' ? '创建中...' : '创建成片任务'}
          </button>
          <button className="agent-surface-button" type="button" data-intent="adopt" onClick={onCopyVideoComposeRequest}>复制成片请求</button>
          <button className="agent-surface-button" type="button" onClick={onCopyHandoff}>复制全部</button>
        </div>
      </header>
      <div className="edit-desk-handoff__summary">
        <EditDeskMetric label="未选择素材" value={validation.unresolvedClipCount} tone={validation.unresolvedClipCount > 0 ? 'warning' : 'ok'} />
        <EditDeskMetric label="未覆盖 CU" value={handoff.coverage_map.summary.uncoveredContentUnitCount} tone={handoff.coverage_map.summary.uncoveredContentUnitCount > 0 ? 'warning' : 'ok'} />
        <EditDeskMetric label="决策日志" value={handoff.decision_log.length} tone={handoff.decision_log.some((entry) => entry.severity === 'error') ? 'warning' : undefined} />
        <EditDeskMetric label="剪辑动作" value={handoff.edit_action_plan.actions.length} />
        <EditDeskMetric label="编译" value={handoff.compile_manifest.status} tone={handoff.compile_manifest.status === 'ready' ? 'ok' : 'warning'} />
        <EditDeskMetric label="后端草案" value={`${handoff.backend_options.filter((option) => option.status === 'ready').length}/${handoff.backend_options.length}`} tone={handoff.backend_options.every((option) => option.status === 'ready') ? 'ok' : 'warning'} />
        <EditDeskMetric label="空轨道" value={validation.emptyTrackCount} />
        <EditDeskMetric label="编译诊断" value={handoff.validation.compile_diagnostics.length} tone={handoff.validation.compile_diagnostics.some((issue) => issue.severity === 'error') ? 'warning' : 'ok'} />
        <EditDeskMetric label="时间线诊断" value={handoff.validation.editing_timeline_diagnostics.length} tone={handoff.validation.editing_timeline_diagnostics.some((issue) => issue.severity === 'error') ? 'warning' : 'ok'} />
        <EditDeskMetric label="OpenMontage rows" value={debugView.editDecisions.length} />
        <EditDeskMetric label="成片任务" value={composeState.status} tone={composeState.status === 'succeeded' ? 'ok' : composeState.status === 'blocked' || composeState.status === 'error' ? 'warning' : undefined} />
        <EditDeskMetric label="复制状态" value={copyStatus} />
      </div>
      <div className="edit-desk-backend-options" aria-label="Finishing backend options">
        {handoff.backend_options.map((option) => (
          <article key={option.backend} className="edit-desk-backend-option" data-status={option.status}>
            <div>
              <strong>{option.label}</strong>
              <span>{option.role}</span>
            </div>
            <p>{option.summary}</p>
            <small>{[
              option.status,
              option.render_runtime ? `runtime ${option.render_runtime}` : undefined,
              option.entrypoint,
              option.file_count > 0 ? `${option.file_count} files` : undefined,
            ].filter(Boolean).join(' · ')}</small>
          </article>
        ))}
      </div>
      {composeState.status !== 'idle' ? (
        <ComposeResultCard composeState={composeState} />
      ) : null}
      {validation.issues.length > 0 ? (
        <div className="edit-desk-issues" aria-label="TimelineAssembly blockers">
          {validation.issues.map((issue) => (
            <article key={`${issue.code}:${issue.clipId ?? issue.trackId ?? issue.message}`} className="edit-desk-issue" data-severity={issue.severity}>
              <strong>{issue.code}</strong>
              <p>{issue.message}</p>
              <span>{[issue.trackId ? `track ${issue.trackId}` : undefined, issue.clipId ? `clip ${issue.clipId}` : undefined].filter(Boolean).join(' · ')}</span>
            </article>
          ))}
        </div>
      ) : null}
      {handoff.validation.compile_diagnostics.length > 0 ? (
        <div className="edit-desk-issues" aria-label="TimelineAssembly compile diagnostics">
          {handoff.validation.compile_diagnostics.map((issue) => (
            <article key={`${issue.code}:${issue.asset_ref ?? issue.action ?? issue.message}`} className="edit-desk-issue" data-severity={issue.severity}>
              <strong>{issue.code}</strong>
              <p>{issue.message}</p>
              <span>{[issue.action ? `action ${issue.action}` : undefined, issue.asset_ref ? `asset ${issue.asset_ref}` : undefined].filter(Boolean).join(' · ')}</span>
            </article>
          ))}
        </div>
      ) : null}
      <details className="edit-desk-details">
        <summary>TimelineAssembly coverage / decision log</summary>
        <AgentSurfaceJson value={{ coverage_map: handoff.coverage_map, decision_log: handoff.decision_log }} />
      </details>
      <details className="edit-desk-details">
        <summary>CompileManifest</summary>
        <AgentSurfaceJson value={handoff.compile_manifest} />
      </details>
      <details className="edit-desk-details">
        <summary>TimelineAssembly compile result</summary>
        <AgentSurfaceJson value={handoff.compile_result} />
      </details>
      <details className="edit-desk-details">
        <summary>Finishing backend projects</summary>
        <AgentSurfaceJson value={{ backend_options: handoff.backend_options, finishing_projects: handoff.finishing_projects }} />
      </details>
      <details className="edit-desk-details">
        <summary>OpenMontage edit action plan</summary>
        <AgentSurfaceJson value={handoff.edit_action_plan} />
      </details>
      <details className="edit-desk-details">
        <summary>OpenMontage asset_manifest / edit_decisions</summary>
        <AgentSurfaceJson value={handoff.openmontage} />
      </details>
      <details className="edit-desk-details">
        <summary>EditingProject 创建请求</summary>
        <AgentSurfaceJson value={handoff.editing_project_create_from_edit_decisions} />
      </details>
      <details className="edit-desk-details">
        <summary>editing_video_compose 成片请求</summary>
        <AgentSurfaceJson value={handoff.video_compose_request} />
      </details>
      {composeState.result ? (
        <details className="edit-desk-details" open>
          <summary>成片任务结果</summary>
          <AgentSurfaceJson value={composeState.result} />
        </details>
      ) : null}
      <details className="edit-desk-details">
        <summary>MediaEditingProject 预览</summary>
        <AgentSurfaceJson value={handoff.media_editing_project_preview ?? { status: 'blocked', diagnostics: handoff.validation.editing_timeline_diagnostics }} />
      </details>
      <details className="edit-desk-details">
        <summary>完整 handoff bundle</summary>
        <AgentSurfaceJson value={handoff} />
      </details>
      <details className="edit-desk-details">
        <summary>OpenMontage artifact debug view</summary>
        <AgentSurfaceJson value={debugView} />
      </details>
    </section>
  )
}

function ComposeResultCard({ composeState }: { composeState: EditDeskComposeState }) {
  const progress = composeState.progressPercent ?? composeTaskProgress(composeState.result)
  const outputPath = composeState.outputPath ?? composeOutputPath(composeState.result)
  const taskId = composeState.taskId ?? composeTaskId(composeState.result)
  const taskStatus = composeState.taskStatus ?? composeTaskStatus(composeState.result)
  return (
    <div className="edit-desk-compose-card" data-status={composeState.status} aria-label="Video compose result">
      <div className="edit-desk-compose-card__header">
        <div>
          <span>Render</span>
          <strong>{composeState.message ?? '成片任务状态已更新。'}</strong>
        </div>
        <StatusDot status={composeState.status} />
      </div>
      <div className="edit-desk-compose-card__metrics">
        <EditDeskMetric label="task" value={taskId ?? 'pending'} />
        <EditDeskMetric label="status" value={taskStatus ?? composeState.status} tone={composeState.status === 'succeeded' ? 'ok' : composeState.status === 'blocked' || composeState.status === 'error' ? 'warning' : undefined} />
        <EditDeskMetric label="progress" value={progress !== undefined ? `${Math.round(progress)}%` : 'n/a'} />
        <EditDeskMetric label="output" value={outputPath ?? 'pending'} tone={outputPath && composeState.status === 'succeeded' ? 'ok' : undefined} />
      </div>
      {progress !== undefined ? (
        <div className="edit-desk-compose-progress" aria-label="Render progress">
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
      <p>{composeResultSummary(composeState.result) || composeState.message}</p>
      {composeState.updatedAt ? <small>updated {new Date(composeState.updatedAt).toLocaleTimeString()}</small> : null}
    </div>
  )
}

function StatusDot({ status }: { status: ComposeStatus }) {
  return <span className="edit-desk-status-dot" data-status={status}>{status}</span>
}

function EditDeskMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: 'ok' | 'warning'
}) {
  return (
    <div className="edit-desk-metric" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatusPill({ status }: { status: WorkflowAssetManifestRow['status'] }) {
  return <span className="edit-desk-status-pill" data-status={status}>{assetStatusLabel(status)}</span>
}

function composeTaskRecord(result: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!result) return undefined
  return recordValue(result.task ?? result.media_pipeline_task)
}

function composeRenderReport(result: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return recordValue(result?.render_report)
}

function composeTaskId(result: Record<string, unknown> | undefined): string | undefined {
  const task = composeTaskRecord(result)
  const renderReport = composeRenderReport(result)
  return stringValue(task?.taskId ?? task?.task_id ?? renderReport?.task_id)
}

function composeProjectId(result: Record<string, unknown> | undefined): string | undefined {
  const task = composeTaskRecord(result)
  const renderReport = composeRenderReport(result)
  const editingProject = recordValue(result?.editing_project ?? result?.editingProject)
  return stringValue(task?.projectId ?? task?.project_id ?? renderReport?.project_id ?? editingProject?.projectId ?? editingProject?.project_id)
}

function composeTaskStatus(resultOrTask: Record<string, unknown> | undefined): string | undefined {
  const task = composeTaskRecord(resultOrTask) ?? resultOrTask
  const renderReport = composeRenderReport(resultOrTask)
  return stringValue(task?.status ?? renderReport?.status)
}

function composeTaskProgress(resultOrTask: Record<string, unknown> | undefined): number | undefined {
  const task = composeTaskRecord(resultOrTask) ?? resultOrTask
  const progress = numberValue(task?.progressPercent ?? task?.progress_percent)
  return progress === undefined ? undefined : Math.max(0, Math.min(100, progress))
}

function composeOutputPath(result: Record<string, unknown> | undefined): string | undefined {
  const task = composeTaskRecord(result)
  const renderReport = composeRenderReport(result)
  return stringValue(task?.outputPath ?? task?.output_path ?? renderReport?.output_path)
}

function composeTaskIsTerminal(resultOrTask: Record<string, unknown> | undefined): boolean {
  const status = composeTaskStatus(resultOrTask)
  return status === 'succeeded' || status === 'failed' || status === 'canceled'
}

function composeStatusFromTask(task: Record<string, unknown> | undefined, fallback: ComposeStatus): ComposeStatus {
  const status = composeTaskStatus(task)
  if (status === 'succeeded') return 'succeeded'
  if (status === 'failed' || status === 'canceled') return 'error'
  if (status === 'queued' || status === 'running') return 'running'
  return fallback
}

function mergeComposeTaskResult(result: Record<string, unknown> | undefined, task: Record<string, unknown>): Record<string, unknown> {
  const renderReport = composeRenderReport(result)
  const taskId = stringValue(task.taskId ?? task.task_id)
  const outputPath = stringValue(task.outputPath ?? task.output_path)
  return {
    ...(result ?? {}),
    task,
    media_pipeline_task: task,
    render_report: {
      ...(renderReport ?? {}),
      ...(stringValue(task.status) ? { status: stringValue(task.status) } : {}),
      ...(taskId ? { task_id: taskId } : {}),
      ...(outputPath ? { output_path: outputPath } : {}),
      ...(task.outputResourceId !== undefined ? { output_resource_id: task.outputResourceId } : {}),
    },
  }
}

function composeResultMessage(result: Record<string, unknown>): string {
  const taskId = composeTaskId(result)
  const taskStatus = composeTaskStatus(result)
  const outputPath = composeOutputPath(result)
  if (taskStatus === 'succeeded' && outputPath) return `成片已完成：${outputPath}`
  if (taskStatus === 'failed' || taskStatus === 'canceled') return `成片任务${taskStatus === 'failed' ? '失败' : '已取消'}：${taskId ?? 'unknown task'}`
  if (taskId) return `成片任务已创建：${taskId}${taskStatus ? ` (${taskStatus})` : ''}`

  const renderReport = composeRenderReport(result)
  const editingProject = recordValue(result.editing_project ?? result.editingProject)
  const editingProjectId = stringValue(editingProject?.id ?? renderReport?.editing_project_id)
  if (editingProjectId) return `MediaEditingProject 已创建：${editingProjectId}`

  return stringValue(result.message) ?? '成片任务已创建。'
}

function composeResultSummary(result: Record<string, unknown> | undefined): string {
  if (!result) return ''
  const taskId = composeTaskId(result)
  const taskStatus = composeTaskStatus(result)
  const progress = composeTaskProgress(result)
  const outputPath = composeOutputPath(result)
  return [
    taskId ? `task ${taskId}` : undefined,
    taskStatus ? `status ${taskStatus}` : undefined,
    progress !== undefined ? `progress ${Math.round(progress)}%` : undefined,
    outputPath ? `output ${outputPath}` : undefined,
  ].filter(Boolean).join(' · ')
}

export function buildTimelineAssemblyState({
  debugView,
  productionId,
  targetRef,
  focusLabel,
}: {
  debugView: WorkflowArtifactDebugView
  productionId?: string
  targetRef: string
  focusLabel: string
}): TimelineAssemblyState {
  const assets = editDeskAssetItems(debugView)
  const sourceNamespace = buildTimelineAssemblySourceNamespace({
    debugView,
    productionId,
    targetRef,
    focusLabel,
  })
  const preferredAssets = assets.filter((asset) => asset.status === 'selected')
  const timelineAssets = preferredAssets.length > 0 ? preferredAssets : assets
  let visualCursor = 0
  let voiceCursor = 0
  let subtitleCursor = 0
  const clips = timelineAssets.map((asset, index) => {
    const trackId = defaultTrackIdForAsset(asset)
    const startMs = defaultStartMsForTrack(trackId, {
      visualCursor,
      voiceCursor,
      subtitleCursor,
    })
    const clip = clipFromAsset(asset, trackId, startMs, index + 1, sourceNamespace, productionId)
    if (trackId === 'video_main') visualCursor += clip.durationMs
    if (trackId === 'voice' || trackId === 'sfx') voiceCursor += clip.durationMs
    if (trackId === 'subtitle') subtitleCursor += clip.durationMs
    return clip
  })
  const seedKey = [
    productionId ?? '',
    targetRef,
    assets.map((asset) => `${asset.id}:${asset.status}:${asset.resourceId ?? ''}`).join('|'),
    debugView.editDecisions.map((row) => row.id).join('|'),
  ].join('::')

  return {
    schema: 'movscript.timeline_assembly.intent_workbench.v1',
    id: `timeline-assembly-${sanitizeId(productionId ?? targetRef ?? focusLabel ?? 'draft')}`,
    seedKey,
    productionId,
    targetRef: targetRef || focusLabel || 'timeline_assembly:draft',
    sourceNamespace,
    editProfile: { ...DEFAULT_EDIT_PROFILE },
    tracks: DEFAULT_ASSEMBLY_TRACKS.map((track) => ({ ...track })),
    clips,
    selectedClipId: clips[0]?.id,
    playheadMs: 0,
    zoomPxPerSecond: 72,
    revision: 1,
  }
}

function buildTimelineAssemblySourceNamespace({
  debugView,
  productionId,
  targetRef,
  focusLabel,
}: {
  debugView: WorkflowArtifactDebugView
  productionId?: string
  targetRef: string
  focusLabel: string
}): TimelineAssemblySourceNamespace {
  const scope = scopeFromTargetRef({ productionId, targetRef })
  const target = targetRef || (scope.scopeKind && scope.scopeRef ? `timeline_assembly:${scope.scopeKind}:${scope.scopeRef}` : focusLabel || 'timeline_assembly:draft')
  const nodes = debugView.timelineNamespaces.map(timelineNamespaceExport)
  const root = sourceNamespaceRoot(nodes, scope)
  return {
    schema: 'movscript.timeline_assembly.source_namespace.v1',
    targetRef: target,
    ...(scope.scopeKind ? { scopeKind: scope.scopeKind } : {}),
    ...(scope.scopeRef ? { scopeRef: scope.scopeRef } : {}),
    ...(root ? { root } : {}),
    nodes,
  }
}

function timelineNamespaceExport(row: WorkflowTimelineNamespaceRow): TimelineAssemblySourceNamespaceNode {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    ...(row.path ? { path: row.path } : {}),
    ...(row.parentId ? { parentId: row.parentId } : {}),
    ...(row.parentKind ? { parentKind: row.parentKind } : {}),
    ...(row.entityKind ? { entityKind: row.entityKind } : {}),
  }
}

function sourceNamespaceRoot(
  nodes: TimelineAssemblySourceNamespaceNode[],
  scope: { scopeKind?: string; scopeRef?: string },
): TimelineAssemblySourceNamespaceNode | undefined {
  if (nodes.length === 0) return undefined
  if (scope.scopeRef) {
    const scoped = nodes.find((node) =>
      sameLooseId(node.id, scope.scopeRef)
      && (!scope.scopeKind || node.kind === scope.scopeKind || node.entityKind === scope.scopeKind))
    if (scoped) return scoped
  }
  return nodes.find((node) => !node.parentId) ?? nodes[0]
}

function scopeFromTargetRef(input: { productionId?: string; targetRef?: string }): { scopeKind?: string; scopeRef?: string } {
  if (input.productionId) return { scopeKind: 'production', scopeRef: input.productionId }
  const match = input.targetRef?.match(/^timeline_assembly:([^:]+):(.+)$/)
  if (!match) return {}
  const scopeKind = match[1]
  const scopeRef = match[2]
  return {
    ...(scopeKind ? { scopeKind } : {}),
    ...(scopeRef ? { scopeRef } : {}),
  }
}

function editDeskAssetItems(debugView: WorkflowArtifactDebugView): EditDeskAssetItem[] {
  return debugView.assetManifest.map((asset) => {
    const requiredAsset = debugView.requiredAssets.find((row) => row.contentUnitId === asset.contentUnitId || row.id === asset.contentUnitId)
    return {
      ...asset,
      blockers: requiredAsset?.blockers ?? [],
      mediaUrl: mediaUrlFromRecord(asset.raw),
      localPath: mediaLocalPathFromRecord(asset.raw),
      sceneId: requiredAsset?.sceneId,
      expressionUnitId: requiredAsset?.expressionUnitId,
      targetRef: requiredAsset?.targetRef,
    }
  })
}

function intentRefFromAsset(
  asset: EditDeskAssetItem,
  sourceNamespace: TimelineAssemblySourceNamespace,
  productionId?: string,
): TimelineAssemblyIntentRef {
  const explicitScope = scopeFromTargetRef({ targetRef: asset.targetRef })
  const scopeKind = explicitScope.scopeKind ?? sourceNamespace.scopeKind
  const scopeRef = explicitScope.scopeRef ?? sourceNamespace.scopeRef
  const namespaceNode = namespaceNodeForAsset(asset, sourceNamespace, { scopeKind, scopeRef })
  return compactRecord({
    productionId,
    scopeKind,
    scopeRef,
    namespaceNodeId: namespaceNode?.id,
    namespaceKind: namespaceNode?.kind ?? scopeKind,
    namespacePath: namespaceNode?.path,
    sceneMomentId: asset.sceneId,
    expressionUnitId: asset.expressionUnitId,
    contentUnitId: asset.contentUnitId,
    targetRef: asset.targetRef ?? sourceNamespace.targetRef,
  }) as TimelineAssemblyIntentRef
}

function namespaceNodeForAsset(
  asset: EditDeskAssetItem,
  sourceNamespace: TimelineAssemblySourceNamespace,
  scope: { scopeKind?: string; scopeRef?: string },
): TimelineAssemblySourceNamespaceNode | undefined {
  if (asset.targetRef) {
    const assetScope = scopeFromTargetRef({ targetRef: asset.targetRef })
    const scopedNode = sourceNamespaceRoot(sourceNamespace.nodes, assetScope)
    if (scopedNode) return scopedNode
  }
  if (scope.scopeRef) {
    const scopedNode = sourceNamespaceRoot(sourceNamespace.nodes, scope)
    if (scopedNode) return scopedNode
  }
  return sourceNamespace.root
}

function clipFromAsset(
  asset: EditDeskAssetItem,
  trackId: string,
  startMs: number,
  index: number,
  sourceNamespace: TimelineAssemblySourceNamespace,
  productionId?: string,
): AssemblyClip {
  const kind = clipKindForAsset(asset)
  const intentRef = intentRefFromAsset(asset, sourceNamespace, productionId)
  const edit = defaultClipEditIntent(asset, trackId, startMs, kind)
  return normalizeClip({
    id: `clip-${sanitizeId(asset.id)}-${index}`,
    trackId,
    title: asset.title || `Clip ${index}`,
    kind,
    startMs,
    durationMs: defaultDurationMsForAsset(asset),
    sourceInMs: 0,
    volume: kind === 'music' ? 0.45 : 1,
    notes: asset.status === 'selected' ? '' : '素材还未完成选择，先作为剪辑意图占位。',
    source: {
      assetId: asset.id,
      type: asset.type,
      status: asset.status,
      contentUnitId: asset.contentUnitId,
      candidateId: asset.candidateId,
      resourceId: asset.resourceId,
      mediaUrl: asset.mediaUrl,
      localPath: asset.localPath,
    },
    binding: {
      sceneId: asset.sceneId,
      expressionUnitId: asset.expressionUnitId,
      targetRef: asset.targetRef,
    },
    intentRef,
    edit,
  })
}

function defaultClipEditIntent(
  asset: EditDeskAssetItem,
  trackId: string,
  startMs: number,
  kind: AssemblyClipKind,
): TimelineAssemblyClipEditIntent {
  const isStill = asset.type.toLowerCase().includes('image')
    || asset.type.toLowerCase().includes('storyboard')
    || asset.type.toLowerCase().includes('keyframe')
  const layer: TimelineAssemblyOpenMontageLayer = trackId === 'video_overlay' || kind === 'effect'
    ? 'overlay'
    : trackId === 'effect'
      ? 'background'
      : 'primary'
  return {
    layer,
    speed: 1,
    transform: {
      scale: 1,
      position: 'center',
      animation: isStill ? 'ken-burns-slow-zoom' : 'static',
    },
    transitionIn: startMs === 0 ? 'fade' : 'cut',
    transitionOut: 'cut',
    transitionDurationMs: startMs === 0 ? DEFAULT_EDIT_PROFILE.pacing.transitionDurationMs : 0,
    overlay: {
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      opacity: 1,
      animation: 'fade-in',
    },
    reason: '',
  }
}

export function buildEditDecisionHandoff(
  assembly: TimelineAssemblyState,
  debugView: WorkflowArtifactDebugView,
  projectId: string,
): EditDeskHandoffBundle {
  const assetManifest = buildOpenMontageAssetManifest(assembly)
  const coverage = timelineAssemblyCoverage(assembly, debugView)
  const decisionLog = timelineAssemblyDecisionLog(assembly, debugView, coverage)
  const editDecisions = buildOpenMontageEditDecisions(assembly, coverage, decisionLog)
  const editActionPlan = buildTimelineAssemblyEditActionPlan(assembly, coverage)
  const validation = assemblyValidation(assembly, debugView)
  const scope = scopeFromAssembly(assembly)
  const assemblyExport = timelineAssemblyExport(assembly)
  const finishingCompileInput = {
    timelineAssembly: assemblyExport,
    assetManifest,
    editDecisions,
    runtimeLocked: true,
    renderSettings: {
      width: 1920,
      height: 1080,
      fps: 30,
      background: '#000000',
      default_duration_ms: 4000,
    },
    projectOptions: {
      projectId,
      title: `Edit desk ${assembly.targetRef}`,
      productionId: assembly.productionId,
      targetKind: 'timeline_assembly',
      targetRef: assembly.targetRef,
      scopeKind: scope.scopeKind,
      scopeRef: scope.scopeRef,
      width: 1920,
      height: 1080,
      fps: 30,
      background: '#000000',
      defaultDurationMs: 4000,
    },
  }
  const mediaFinishingProject = compileTimelineAssemblyToFinishingProject({
    ...finishingCompileInput,
    backend: 'media_editing_project',
    renderRuntime: assembly.editProfile.renderRuntime,
  })
  const hyperframesFinishingProject = compileTimelineAssemblyToFinishingProject({
    ...finishingCompileInput,
    backend: 'hyperframes',
  })
  const remotionFinishingProject = compileTimelineAssemblyToFinishingProject({
    ...finishingCompileInput,
    backend: 'remotion',
  })
  const finishingProjects: Record<EditDeskFinishingBackend, TimelineAssemblyFinishingCompileResult> = {
    media_editing_project: mediaFinishingProject,
    hyperframes: hyperframesFinishingProject,
    remotion: remotionFinishingProject,
  }
  const backendOptions = buildFinishingBackendOptions(finishingProjects)
  const compileResult = mediaEditingCompileResultFromFinishing(mediaFinishingProject)
  const editingProjectRequest = buildEditingProjectCreateRequest({
    assembly,
    assetManifest,
    compileManifest: compileResult.compile_manifest,
    editDecisions,
    projectId,
    scope,
  })
  const videoComposeRequest = buildVideoComposeRequest({
    assembly,
    assemblyExport,
    assetManifest,
    compileManifest: compileResult.compile_manifest,
    editDecisions,
    projectId,
    scope,
  })

  return {
    schema: 'movscript.edit_desk.handoff.v1',
    production_id: assembly.productionId,
    target_ref: assembly.targetRef,
    timeline_assembly_id: assembly.id,
    duration_ms: assemblyDurationMs(assembly),
    source_artifacts: {
      timeline_namespace_count: debugView.timelineNamespaces.length,
      required_assets_count: debugView.requiredAssets.length,
      asset_manifest_count: debugView.assetManifest.length,
      openmontage_edit_decisions_count: debugView.editDecisions.length,
    },
    source_namespace: assembly.sourceNamespace,
    coverage_map: coverage,
    decision_log: decisionLog,
    edit_action_plan: editActionPlan,
    assembly: assemblyExport,
    openmontage: {
      asset_manifest: assetManifest,
      edit_decisions: editDecisions,
    },
    compile_manifest: compileResult.compile_manifest,
    compile_result: compileResult,
    backend_options: backendOptions,
    finishing_projects: finishingProjects,
    editing_project_create_from_edit_decisions: editingProjectRequest,
    video_compose_request: videoComposeRequest,
    ...(compileResult.media_editing_project ? { media_editing_project_preview: compileResult.media_editing_project } : {}),
    validation: {
      ...validation,
      compile_diagnostics: compileResult.diagnostics,
      editing_timeline_diagnostics: compileResult.editing_timeline_diagnostics,
    },
  }
}

function mediaEditingCompileResultFromFinishing(
  result: TimelineAssemblyFinishingCompileResult,
): TimelineAssemblyMediaEditingCompileResult {
  const mediaEditingProject = result.media_editing_project ?? result.finishing_project?.media_editing_project
  return {
    schema: 'movscript.timeline_assembly.media_editing_compile_result.v1',
    status: result.status,
    compile_manifest: result.compile_manifest,
    ...(mediaEditingProject ? { media_editing_project: mediaEditingProject } : {}),
    editing_timeline_diagnostics: result.editing_timeline_diagnostics,
    diagnostics: result.diagnostics,
  }
}

function buildFinishingBackendOptions(
  projects: Record<EditDeskFinishingBackend, TimelineAssemblyFinishingCompileResult>,
): EditDeskFinishingBackendOption[] {
  const labels: Record<EditDeskFinishingBackend, string> = {
    media_editing_project: '系统剪辑项目',
    hyperframes: 'HyperFrames',
    remotion: 'Remotion',
  }
  const roles: Record<EditDeskFinishingBackend, EditDeskFinishingBackendOption['role']> = {
    media_editing_project: 'system_editing',
    hyperframes: 'html_composition',
    remotion: 'react_composition',
  }
  const summaries: Record<EditDeskFinishingBackend, string> = {
    media_editing_project: '当前可创建成片任务的默认路径，细剪继续在 MovScript MediaEditingProject 中完成。',
    hyperframes: '生成 HTML/GSAP 静态 composition 草案，适合动画字幕、视觉包装和网页式细剪。',
    remotion: '生成 React/Remotion composition 草案，适合代码化组件、参数化模板和可测试细剪。',
  }

  return (['media_editing_project', 'hyperframes', 'remotion'] as EditDeskFinishingBackend[]).map((backend) => {
    const result = projects[backend]
    return {
      backend,
      label: labels[backend],
      role: roles[backend],
      status: result.status,
      compile_manifest_id: result.compile_manifest.id,
      render_runtime: result.compile_manifest.backend.render_runtime,
      runtime_locked: result.compile_manifest.backend.runtime_locked,
      fallback_policy: result.compile_manifest.backend.fallback_policy,
      editable: result.finishing_project?.editable === true,
      entrypoint: result.finishing_project?.entrypoint,
      file_count: result.finishing_project?.files?.length ?? 0,
      summary: summaries[backend],
    }
  })
}

function buildOpenMontageAssetManifest(assembly: TimelineAssemblyState): MovScriptAssetManifest {
  const assets = uniqueClipsByAsset(assembly.clips)
  return {
    version: '1.0',
    assets: assets.map((clip) => {
      const resourceId = resourceIdNumber(clip.source.resourceId)
      const localPath = clip.source.localPath
      return {
        id: openMontageAssetIdForClip(clip),
        type: openMontageAssetType(clip),
        path: localPath ?? (resourceId !== undefined ? `resource:${resourceId}` : clip.source.mediaUrl ?? `content-unit:${clip.source.contentUnitId ?? clip.source.assetId}`),
        source_tool: clip.source.status === 'selected' ? 'movscript_content_unit_selection' : 'movscript_placeholder',
        scene_id: clip.binding.sceneId ?? clip.source.contentUnitId ?? 'timeline_assembly',
        title: clip.title,
        duration_seconds: clip.durationMs / 1000,
        ...(resourceId !== undefined ? { resource_id: resourceId } : {}),
        ...(localPath ? { localPath, local_path: localPath } : {}),
        metadata: {
          content_unit_id: clip.source.contentUnitId,
          candidate_id: clip.source.candidateId,
          expression_unit_id: clip.binding.expressionUnitId,
          target_ref: clip.binding.targetRef,
          status: clip.source.status,
          intent_ref: compactRecord({
            production_id: clip.intentRef.productionId,
            scope_kind: clip.intentRef.scopeKind,
            scope_ref: clip.intentRef.scopeRef,
            namespace_node_id: clip.intentRef.namespaceNodeId,
            namespace_kind: clip.intentRef.namespaceKind,
            namespace_path: clip.intentRef.namespacePath,
            scene_moment_id: clip.intentRef.sceneMomentId,
            expression_unit_id: clip.intentRef.expressionUnitId,
            content_unit_id: clip.intentRef.contentUnitId,
            target_ref: clip.intentRef.targetRef,
          }),
        },
      }
    }),
    metadata: {
      source: 'movscript_edit_desk',
      timeline_assembly_id: assembly.id,
      target_ref: assembly.targetRef,
      source_namespace: assembly.sourceNamespace,
    },
  }
}

function buildOpenMontageEditDecisions(
  assembly: TimelineAssemblyState,
  coverage: TimelineAssemblyCoverageMap,
  decisionLog: TimelineAssemblyDecisionLogEntry[],
): MovScriptEditDecisionsArtifact {
  const sortedClips = [...assembly.clips].sort((a, b) => a.startMs - b.startMs || a.trackId.localeCompare(b.trackId))
  const visualClips = sortedClips.filter((clip) => clip.kind === 'visual')
  const cutClips = visualClips.filter((clip) => clip.edit.layer !== 'overlay')
  const overlayClips = visualClips.filter((clip) => clip.edit.layer === 'overlay')
  const narrationClips = sortedClips.filter((clip) => clip.kind === 'voice')
  const musicClip = sortedClips.find((clip) => clip.kind === 'music')
  const sfxClips = sortedClips.filter((clip) => clip.kind === 'sfx')
  const subtitleClips = sortedClips.filter((clip) => clip.kind === 'subtitle')
  const subtitleProfile = assembly.editProfile.subtitles
  const audioProfile = assembly.editProfile.audio

  return {
    schema: 'openmontage/artifacts/edit_decisions',
    version: '1.0',
    renderer_family: assembly.editProfile.rendererFamily,
    render_runtime: assembly.editProfile.renderRuntime,
    composition_mode: assembly.editProfile.compositionMode,
    cuts: cutClips.map((clip) => ({
      id: clip.id,
      source: openMontageAssetIdForClip(clip),
      in_seconds: clip.sourceInMs / 1000,
      out_seconds: (clip.sourceInMs + clip.durationMs) / 1000,
      timeline_start_seconds: clip.startMs / 1000,
      duration_seconds: clip.durationMs / 1000,
      speed: clip.edit.speed,
      layer: clip.edit.layer,
      transform: {
        scale: clip.edit.transform.scale,
        position: clip.edit.transform.position,
        animation: clip.edit.transform.animation,
        ...(clip.edit.transform.crop ? { crop: clip.edit.transform.crop } : {}),
      },
      transition_in: clip.edit.transitionIn,
      transition_out: clip.edit.transitionOut,
      transition_duration: clip.edit.transitionDurationMs / 1000,
      reason: clip.edit.reason || clip.notes || `TimelineAssembly ${clip.edit.layer} visual from ${clip.source.contentUnitId ?? clip.source.assetId}`,
      metadata: editDecisionClipMetadata(clip),
    })),
    overlays: overlayClips.map((clip) => ({
      id: clip.id,
      asset_id: openMontageAssetIdForClip(clip),
      start_seconds: clip.startMs / 1000,
      end_seconds: (clip.startMs + clip.durationMs) / 1000,
      position: {
        x: clip.edit.overlay.x,
        y: clip.edit.overlay.y,
        width: clip.edit.overlay.width,
        height: clip.edit.overlay.height,
      },
      opacity: clip.edit.overlay.opacity,
      animation: clip.edit.overlay.animation,
      metadata: editDecisionClipMetadata(clip),
    })),
    audio: {
      narration: {
        segments: narrationClips.map((clip) => ({
          id: clip.id,
          asset_id: openMontageAssetIdForClip(clip),
          start_seconds: clip.startMs / 1000,
          end_seconds: (clip.startMs + clip.durationMs) / 1000,
          volume: normalizedOpenMontageVolume(clip.volume),
          metadata: editDecisionClipMetadata(clip),
        })),
      },
      ...(musicClip ? {
        music: {
          asset_id: openMontageAssetIdForClip(musicClip),
          start_seconds: musicClip.startMs / 1000,
          end_seconds: (musicClip.startMs + musicClip.durationMs) / 1000,
          volume: normalizedOpenMontageVolume(musicClip.volume || audioProfile.musicVolume),
          fade_in_seconds: audioProfile.musicFadeInMs / 1000,
          fade_out_seconds: audioProfile.musicFadeOutMs / 1000,
          ducking: {
            enabled: audioProfile.ducking.enabled && narrationClips.length > 0,
            threshold_db: audioProfile.ducking.thresholdDb,
            reduction_db: audioProfile.ducking.reductionDb,
            attack_ms: audioProfile.ducking.attackMs,
            release_ms: audioProfile.ducking.releaseMs,
          },
          metadata: editDecisionClipMetadata(musicClip),
        },
      } : {}),
      sfx: sfxClips.map((clip) => ({
        id: clip.id,
        asset_id: openMontageAssetIdForClip(clip),
        start_seconds: clip.startMs / 1000,
        end_seconds: (clip.startMs + clip.durationMs) / 1000,
        volume: normalizedOpenMontageVolume(clip.volume),
        metadata: editDecisionClipMetadata(clip),
      })),
    },
    ...(musicClip ? {
      music: {
        asset_id: openMontageAssetIdForClip(musicClip),
        volume: normalizedOpenMontageVolume(musicClip.volume || audioProfile.musicVolume),
        fade_in_seconds: audioProfile.musicFadeInMs / 1000,
        fade_out_seconds: audioProfile.musicFadeOutMs / 1000,
        ducking: audioProfile.ducking.enabled && narrationClips.length > 0,
      },
    } : {}),
    subtitles: {
      enabled: subtitleProfile.enabled && subtitleClips.length > 0,
      style: {
        mode: subtitleProfile.style,
        fontFamily: subtitleProfile.font,
        fontSize: subtitleProfile.fontSize,
        color: subtitleProfile.color,
        backgroundColor: subtitleProfile.background,
        position: subtitleProfile.position,
      },
      openmontage_style: subtitleProfile.style,
      font: subtitleProfile.font,
      font_size: subtitleProfile.fontSize,
      color: subtitleProfile.color,
      background: subtitleProfile.background,
      position: subtitleProfile.position,
      max_words_per_line: subtitleProfile.maxWordsPerLine,
      segments: subtitleClips.map((clip) => ({
        id: clip.id,
        text: clip.notes || clip.title,
        start_seconds: clip.startMs / 1000,
        end_seconds: (clip.startMs + clip.durationMs) / 1000,
      })),
    },
    transitions: openMontageTransitionsFromClips(cutClips),
    metadata: {
      source: 'movscript_edit_desk',
      timeline_assembly_id: assembly.id,
      target_ref: assembly.targetRef,
      source_namespace: assembly.sourceNamespace,
      edit_profile: assembly.editProfile,
      movscript_composition_mode: 'timeline_assembly',
      coverage_summary: coverage.summary,
      decision_log: decisionLog,
      render_contract: {
        runtime: 'video_compose',
        fallback_policy: 'no_implicit_fallback',
        forbidden_implicit_fallbacks: ['remotion', 'ffmpeg', 'hyperframes'],
      },
    },
  }
}

function buildEditingProjectCreateRequest({
  assembly,
  assetManifest,
  compileManifest,
  editDecisions,
  projectId,
  scope,
}: {
  assembly: TimelineAssemblyState
  assetManifest: MovScriptAssetManifest
  compileManifest: TimelineAssemblyCompileManifest
  editDecisions: MovScriptEditDecisionsArtifact
  projectId: string
  scope: ReturnType<typeof scopeFromAssembly>
}): Record<string, unknown> {
  return {
    tool: 'editing_project_create_from_edit_decisions',
    projectId,
    editDecisions,
    assetManifest,
    title: `Edit desk ${assembly.targetRef}`,
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    defaultDurationMs: 4000,
    ...(assembly.productionId ? { productionId: assembly.productionId } : {}),
    targetKind: 'timeline_assembly',
    targetRef: assembly.targetRef,
    ...(scope.scopeKind ? { scopeKind: scope.scopeKind } : {}),
    ...(scope.scopeRef ? { scopeRef: scope.scopeRef } : {}),
    compileManifest,
    timelineAssembly: timelineAssemblyExport(assembly),
  }
}

function buildVideoComposeRequest({
  assembly,
  assemblyExport,
  assetManifest,
  compileManifest,
  editDecisions,
  projectId,
  scope,
}: {
  assembly: TimelineAssemblyState
  assemblyExport: Record<string, unknown>
  assetManifest: MovScriptAssetManifest
  compileManifest: TimelineAssemblyCompileManifest
  editDecisions: MovScriptEditDecisionsArtifact
  projectId: string
  scope: ReturnType<typeof scopeFromAssembly>
}): Record<string, unknown> {
  return {
    tool: 'editing_video_compose',
    projectId,
    render_runtime: assembly.editProfile.renderRuntime,
    format: 'mp4',
    output: {
      format: 'mp4',
      importToResource: false,
    },
    editDecisions,
    assetManifest,
    timelineAssembly: assemblyExport,
    compileManifest,
    title: `Edit desk ${assembly.targetRef}`,
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    defaultDurationMs: 4000,
    ...(assembly.productionId ? { productionId: assembly.productionId } : {}),
    targetKind: 'timeline_assembly',
    targetRef: assembly.targetRef,
    ...(scope.scopeKind ? { scopeKind: scope.scopeKind } : {}),
    ...(scope.scopeRef ? { scopeRef: scope.scopeRef } : {}),
  }
}

function timelineAssemblyExport(assembly: TimelineAssemblyState): Record<string, unknown> {
  return {
    schema: assembly.schema,
    id: assembly.id,
    production_id: assembly.productionId,
    target_ref: assembly.targetRef,
    source_namespace: assembly.sourceNamespace,
    edit_profile: assembly.editProfile,
    duration_ms: assemblyDurationMs(assembly),
    tracks: assembly.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      kind: track.kind,
      role: track.role,
      order: track.order,
    })),
    clips: [...assembly.clips].sort((a, b) => a.startMs - b.startMs || a.trackId.localeCompare(b.trackId)).map((clip) => ({
      id: clip.id,
      track_id: clip.trackId,
      kind: clip.kind,
      start_ms: clip.startMs,
      duration_ms: clip.durationMs,
      source_in_ms: clip.sourceInMs,
      title: clip.title,
      volume: clip.volume,
      notes: clip.notes,
      source: {
        asset_id: clip.source.assetId,
        content_unit_id: clip.source.contentUnitId,
        candidate_id: clip.source.candidateId,
        resource_id: clip.source.resourceId,
        local_path: clip.source.localPath,
        status: clip.source.status,
        type: clip.source.type,
      },
      binding: {
        scene_moment_id: clip.binding.sceneId,
        expression_unit_id: clip.binding.expressionUnitId,
        target_ref: clip.binding.targetRef,
      },
      intent_ref: compactRecord({
        production_id: clip.intentRef.productionId,
        scope_kind: clip.intentRef.scopeKind,
        scope_ref: clip.intentRef.scopeRef,
        namespace_node_id: clip.intentRef.namespaceNodeId,
        namespace_kind: clip.intentRef.namespaceKind,
        namespace_path: clip.intentRef.namespacePath,
        scene_moment_id: clip.intentRef.sceneMomentId,
        expression_unit_id: clip.intentRef.expressionUnitId,
        content_unit_id: clip.intentRef.contentUnitId,
        target_ref: clip.intentRef.targetRef,
      }),
      edit: clipEditExport(clip),
    })),
  }
}

function clipEditExport(clip: AssemblyClip): Record<string, unknown> {
  return {
    layer: clip.edit.layer,
    speed: clip.edit.speed,
    transform: {
      scale: clip.edit.transform.scale,
      position: clip.edit.transform.position,
      animation: clip.edit.transform.animation,
      ...(clip.edit.transform.crop ? { crop: clip.edit.transform.crop } : {}),
    },
    transition_in: clip.edit.transitionIn,
    transition_out: clip.edit.transitionOut,
    transition_duration_ms: clip.edit.transitionDurationMs,
    overlay: clip.edit.overlay,
    reason: clip.edit.reason,
  }
}

function assemblyValidation(assembly: TimelineAssemblyState, debugView?: WorkflowArtifactDebugView): AssemblyValidationResult {
  const issues: AssemblyValidationIssue[] = []
  const unresolvedClipCount = assembly.clips.filter((clip) => clip.source.status !== 'selected').length
  const emptyTrackCount = assembly.tracks.filter((track) => !assembly.clips.some((clip) => clip.trackId === track.id)).length
  const trackIds = new Set(assembly.tracks.map((track) => track.id))
  for (const clip of assembly.clips) {
    if (!trackIds.has(clip.trackId)) {
      issues.push({
        code: 'clip_track_missing',
        severity: 'error',
        clipId: clip.id,
        trackId: clip.trackId,
        message: `${clip.title} references a track that does not exist.`,
      })
    }
    if (clip.source.status !== 'selected') {
      issues.push({
        code: 'clip_source_unselected',
        severity: 'error',
        clipId: clip.id,
        message: `${clip.title} is still a placeholder and needs a selected candidate/resource before render.`,
      })
    }
    if (clip.source.status === 'selected' && assembly.editProfile.renderRuntime === 'movscript_media_pipeline' && !clip.source.localPath) {
      const resourceId = resourceIdNumber(clip.source.resourceId)
      issues.push({
        code: resourceId !== undefined ? 'selected_asset_runtime_resolution_required' : 'selected_asset_local_path_missing',
        severity: resourceId !== undefined ? 'info' : 'warning',
        clipId: clip.id,
        message: resourceId !== undefined
          ? `${clip.title} will be materialized from resource ${resourceId} by MediaPipeline before compose.`
          : `${clip.title} has a selected asset but no local media path; local MediaPipeline render must resolve the resource before compose.`,
        details: {
          resourceId: clip.source.resourceId,
          mediaUrl: clip.source.mediaUrl,
          renderRuntime: assembly.editProfile.renderRuntime,
          ...(resourceId !== undefined ? { resolver: 'resourceDownload' } : {}),
        },
      })
    }
    if (clip.durationMs < MIN_CLIP_DURATION_MS) {
      issues.push({
        code: 'clip_duration_too_short',
        severity: 'error',
        clipId: clip.id,
        message: `${clip.title} is shorter than ${MIN_CLIP_DURATION_MS}ms.`,
      })
    }
    if (clip.edit.speed < 0.1) {
      issues.push({
        code: 'clip_speed_too_low',
        severity: 'error',
        clipId: clip.id,
        message: `${clip.title} speed is below OpenMontage's minimum 0.1.`,
      })
    }
    if (clip.edit.transitionDurationMs > clip.durationMs / 2) {
      issues.push({
        code: 'transition_too_long',
        severity: 'warning',
        clipId: clip.id,
        message: `${clip.title} transition is longer than half of the clip duration.`,
      })
    }
    if (clip.volume > 1) {
      issues.push({
        code: 'clip_volume_above_mix_range',
        severity: 'warning',
        clipId: clip.id,
        message: `${clip.title} volume is above 1.0; OpenMontage audio export will clamp it for compose.`,
      })
    }
    if (!clip.intentRef.contentUnitId && !clip.intentRef.sceneMomentId && !clip.intentRef.expressionUnitId && !clip.intentRef.targetRef) {
      issues.push({
        code: 'clip_intent_ref_missing',
        severity: 'warning',
        clipId: clip.id,
        message: `${clip.title} has no namespace, scene, expression, or content-unit intent reference.`,
      })
    }
  }

  const primaryClips = assembly.clips
    .filter((clip) => clip.trackId === 'video_main' && clip.kind === 'visual')
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
  if (primaryClips.length === 0) {
    issues.push({
      code: 'primary_visual_missing',
      severity: 'error',
      trackId: 'video_main',
      message: '主画面轨道没有 visual clip，无法形成完整影片画面。',
    })
  }
  let cursor = 0
  for (const clip of primaryClips) {
    if (clip.durationMs < assembly.editProfile.pacing.minSceneHoldMs) {
      issues.push({
        code: 'primary_visual_hold_too_short',
        severity: 'warning',
        clipId: clip.id,
        trackId: clip.trackId,
        message: `${clip.title} is shorter than the OpenMontage pacing minimum hold.`,
      })
    }
    if (clip.durationMs > assembly.editProfile.pacing.maxSceneHoldMs) {
      issues.push({
        code: 'primary_visual_hold_too_long',
        severity: 'warning',
        clipId: clip.id,
        trackId: clip.trackId,
        message: `${clip.title} is longer than the OpenMontage pacing maximum hold.`,
      })
    }
    if (clip.startMs > cursor + TIMELINE_SNAP_MS) {
      issues.push({
        code: 'primary_visual_gap',
        severity: 'error',
        clipId: clip.id,
        trackId: clip.trackId,
        message: `主画面在 ${formatDuration(cursor)} 到 ${formatDuration(clip.startMs)} 之间有空洞。`,
        details: { gapStartMs: cursor, gapEndMs: clip.startMs },
      })
    }
    if (clip.startMs < cursor - TIMELINE_SNAP_MS) {
      issues.push({
        code: 'primary_visual_overlap',
        severity: 'error',
        clipId: clip.id,
        trackId: clip.trackId,
        message: `${clip.title} overlaps the previous primary visual clip.`,
        details: { previousEndMs: cursor, clipStartMs: clip.startMs },
      })
    }
    cursor = Math.max(cursor, clip.startMs + clip.durationMs)
  }

  if (debugView) {
    const coverage = timelineAssemblyCoverage(assembly, debugView)
    for (const item of coverage.items) {
      if (item.status === 'uncovered') {
        issues.push({
          code: 'required_asset_uncovered',
          severity: 'error',
          message: `${item.title} is required by the source plan but has no clip in TimelineAssembly.`,
          details: {
            contentUnitId: item.contentUnitId,
            sceneMomentId: item.sceneMomentId,
            expressionUnitId: item.expressionUnitId,
          },
        })
      }
    }
  }

  const blockerCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const infoCount = issues.filter((issue) => issue.severity === 'info').length
  return {
    ok: blockerCount === 0,
    blockerCount,
    warningCount,
    infoCount,
    unresolvedClipCount,
    emptyTrackCount,
    selectedResourceCount: assembly.clips.filter((clip) => clip.source.resourceId).length,
    issues,
  }
}

function buildTimelineAssemblyEditActionPlan(
  assembly: TimelineAssemblyState,
  coverage: TimelineAssemblyCoverageMap,
): TimelineAssemblyEditActionPlan {
  const sortedClips = [...assembly.clips].sort((a, b) => a.startMs - b.startMs || a.trackId.localeCompare(b.trackId))
  const actions: TimelineAssemblyEditAction[] = [{
    id: 'runtime-lock',
    family: 'runtime',
    kind: 'runtime_lock',
    params: {
      renderer_family: assembly.editProfile.rendererFamily,
      render_runtime: assembly.editProfile.renderRuntime,
      composition_mode: assembly.editProfile.compositionMode,
      fallback_policy: 'no_implicit_fallback',
      forbidden_implicit_fallbacks: ['remotion', 'ffmpeg', 'hyperframes'],
    },
  }, {
    id: 'timeline-coverage-check',
    family: 'validation',
    kind: 'timeline_coverage_check',
    params: coverage.summary,
  }]

  for (const clip of sortedClips) {
    if (clip.kind === 'visual' && clip.edit.layer !== 'overlay') {
      actions.push({
        id: `cut:${clip.id}`,
        family: 'visual',
        kind: 'cut',
        clipId: clip.id,
        trackId: clip.trackId,
        sourceAssetId: openMontageAssetIdForClip(clip),
        startMs: clip.startMs,
        endMs: clip.startMs + clip.durationMs,
        params: {
          source: openMontageAssetIdForClip(clip),
          in_seconds: clip.sourceInMs / 1000,
          out_seconds: (clip.sourceInMs + clip.durationMs) / 1000,
          speed: clip.edit.speed,
          layer: clip.edit.layer,
          transform: clip.edit.transform,
          transition_in: clip.edit.transitionIn,
          transition_out: clip.edit.transitionOut,
          transition_duration_seconds: clip.edit.transitionDurationMs / 1000,
          reason: clip.edit.reason || clip.notes,
        },
      })
    }
    if (clip.kind === 'visual' && clip.edit.layer === 'overlay') {
      actions.push({
        id: `overlay:${clip.id}`,
        family: 'overlay',
        kind: 'overlay',
        clipId: clip.id,
        trackId: clip.trackId,
        sourceAssetId: openMontageAssetIdForClip(clip),
        startMs: clip.startMs,
        endMs: clip.startMs + clip.durationMs,
        params: {
          asset_id: openMontageAssetIdForClip(clip),
          position: {
            x: clip.edit.overlay.x,
            y: clip.edit.overlay.y,
            width: clip.edit.overlay.width,
            height: clip.edit.overlay.height,
          },
          opacity: clip.edit.overlay.opacity,
          animation: clip.edit.overlay.animation,
        },
      })
    }
    if (clip.kind === 'voice') {
      actions.push({
        id: `narration:${clip.id}`,
        family: 'audio',
        kind: 'narration_segment',
        clipId: clip.id,
        trackId: clip.trackId,
        sourceAssetId: openMontageAssetIdForClip(clip),
        startMs: clip.startMs,
        endMs: clip.startMs + clip.durationMs,
        params: {
          asset_id: openMontageAssetIdForClip(clip),
          volume: normalizedOpenMontageVolume(clip.volume),
        },
      })
    }
    if (clip.kind === 'music') {
      actions.push({
        id: `music:${clip.id}`,
        family: 'audio',
        kind: 'music_bed',
        clipId: clip.id,
        trackId: clip.trackId,
        sourceAssetId: openMontageAssetIdForClip(clip),
        startMs: clip.startMs,
        endMs: clip.startMs + clip.durationMs,
        params: {
          asset_id: openMontageAssetIdForClip(clip),
          volume: normalizedOpenMontageVolume(clip.volume || assembly.editProfile.audio.musicVolume),
          fade_in_seconds: assembly.editProfile.audio.musicFadeInMs / 1000,
          fade_out_seconds: assembly.editProfile.audio.musicFadeOutMs / 1000,
          ducking: assembly.editProfile.audio.ducking,
        },
      })
    }
    if (clip.kind === 'sfx') {
      actions.push({
        id: `sfx:${clip.id}`,
        family: 'audio',
        kind: 'sfx_hit',
        clipId: clip.id,
        trackId: clip.trackId,
        sourceAssetId: openMontageAssetIdForClip(clip),
        startMs: clip.startMs,
        endMs: clip.startMs + clip.durationMs,
        params: {
          asset_id: openMontageAssetIdForClip(clip),
          volume: normalizedOpenMontageVolume(clip.volume),
        },
      })
    }
    if (clip.kind === 'subtitle') {
      actions.push({
        id: `subtitle:${clip.id}`,
        family: 'subtitle',
        kind: 'subtitle_segment',
        clipId: clip.id,
        trackId: clip.trackId,
        startMs: clip.startMs,
        endMs: clip.startMs + clip.durationMs,
        params: {
          text: clip.notes || clip.title,
          style: assembly.editProfile.subtitles,
        },
      })
    }
  }

  for (const transition of openMontageTransitionsFromClips(sortedClips.filter((clip) => clip.kind === 'visual' && clip.edit.layer !== 'overlay'))) {
    actions.push({
      id: `transition:${transition.type}:${transition.at_seconds}`,
      family: 'transition',
      kind: 'global_transition',
      startMs: Math.round(Number(transition.at_seconds) * 1000),
      params: transition,
    })
  }

  if (assembly.editProfile.subtitles.enabled) {
    actions.push({
      id: 'subtitle-style',
      family: 'subtitle',
      kind: 'subtitle_style',
      params: subtitleProfileRecord(assembly.editProfile.subtitles),
    })
  }

  return {
    schema: 'movscript.timeline_assembly.openmontage_edit_actions.v1',
    source: 'openmontage_edit_decisions',
    actions,
    runtimeLock: {
      renderRuntime: assembly.editProfile.renderRuntime,
      fallbackPolicy: 'no_implicit_fallback',
      forbiddenImplicitFallbacks: ['remotion', 'ffmpeg', 'hyperframes'],
    },
    reviewGates: OPENMONTAGE_REVIEW_GATES,
  }
}

function subtitleProfileRecord(profile: TimelineAssemblySubtitleProfile): Record<string, unknown> {
  return {
    enabled: profile.enabled,
    style: profile.style,
    font: profile.font,
    font_size: profile.fontSize,
    color: profile.color,
    background: profile.background,
    position: profile.position,
    max_words_per_line: profile.maxWordsPerLine,
  }
}

function timelineAssemblyCoverage(
  assembly: TimelineAssemblyState,
  debugView: WorkflowArtifactDebugView,
): TimelineAssemblyCoverageMap {
  const items = debugView.requiredAssets.map((asset): TimelineAssemblyCoverageItem => {
    const clips = assembly.clips.filter((clip) => clipMatchesRequiredAsset(clip, asset))
    const selectedClipCount = clips.filter((clip) => clip.source.status === 'selected').length
    const status: TimelineAssemblyCoverageStatus = clips.length === 0
      ? 'uncovered'
      : selectedClipCount === clips.length && asset.blockers.length === 0
        ? 'covered'
        : 'blocked'
    return {
      id: asset.contentUnitId ?? asset.id,
      kind: 'content_unit',
      title: asset.title,
      ...(asset.contentUnitId ? { contentUnitId: asset.contentUnitId } : {}),
      ...(asset.sceneId ? { sceneMomentId: asset.sceneId } : {}),
      ...(asset.expressionUnitId ? { expressionUnitId: asset.expressionUnitId } : {}),
      ...(asset.targetRef ? { targetRef: asset.targetRef } : {}),
      clipIds: clips.map((clip) => clip.id),
      selectedClipCount,
      status,
      blockers: asset.blockers,
    }
  })
  const uncoveredContentUnitCount = items.filter((item) => item.status === 'uncovered').length
  const blockedContentUnitCount = items.filter((item) => item.status === 'blocked').length
  const coveredContentUnitCount = items.filter((item) => item.status === 'covered').length
  return {
    schema: 'movscript.timeline_assembly.coverage_map.v1',
    sourceNamespace: assembly.sourceNamespace,
    summary: {
      expectedContentUnitCount: items.length,
      coveredContentUnitCount,
      blockedContentUnitCount,
      uncoveredContentUnitCount,
      unboundClipCount: assembly.clips.filter((clip) => !clipHasIntentRef(clip)).length,
    },
    items,
  }
}

function timelineAssemblyDecisionLog(
  assembly: TimelineAssemblyState,
  _debugView: WorkflowArtifactDebugView,
  coverage: TimelineAssemblyCoverageMap,
): TimelineAssemblyDecisionLogEntry[] {
  const entries: TimelineAssemblyDecisionLogEntry[] = []
  for (const item of coverage.items) {
    if (item.status !== 'uncovered') continue
    entries.push({
      id: `required-asset-uncovered:${item.id}`,
      kind: 'required_asset_uncovered',
      severity: 'error',
      message: `${item.title} is still required by the source plan but is not placed in TimelineAssembly.`,
      ...(item.contentUnitId ? { contentUnitId: item.contentUnitId } : {}),
      ...(item.sceneMomentId ? { sceneMomentId: item.sceneMomentId } : {}),
      ...(item.expressionUnitId ? { expressionUnitId: item.expressionUnitId } : {}),
    })
  }
  for (const clip of assembly.clips) {
    if (clip.source.status !== 'selected') {
      entries.push({
        id: `placeholder-source:${clip.id}`,
        kind: 'placeholder_source',
        severity: 'error',
        message: `${clip.title} is an edit intent placeholder and still needs a selected candidate/resource.`,
        clipId: clip.id,
        ...(clip.source.contentUnitId ? { contentUnitId: clip.source.contentUnitId } : {}),
        ...(clip.intentRef.sceneMomentId ? { sceneMomentId: clip.intentRef.sceneMomentId } : {}),
        ...(clip.intentRef.expressionUnitId ? { expressionUnitId: clip.intentRef.expressionUnitId } : {}),
      })
    }
    if (!clipHasIntentRef(clip)) {
      entries.push({
        id: `unbound-clip:${clip.id}`,
        kind: 'unbound_clip',
        severity: 'warning',
        message: `${clip.title} has no MovScript semantic intent reference.`,
        clipId: clip.id,
      })
    }
    const clipScope = scopeFromTargetRef({ targetRef: clip.intentRef.targetRef })
    if (
      clipScope.scopeKind
      && clipScope.scopeRef
      && assembly.sourceNamespace.scopeKind
      && assembly.sourceNamespace.scopeRef
      && (clipScope.scopeKind !== assembly.sourceNamespace.scopeKind || clipScope.scopeRef !== assembly.sourceNamespace.scopeRef)
    ) {
      entries.push({
        id: `namespace-scope-mismatch:${clip.id}`,
        kind: 'namespace_scope_mismatch',
        severity: 'info',
        message: `${clip.title} comes from ${clipScope.scopeKind}:${clipScope.scopeRef} while the assembly target is ${assembly.sourceNamespace.scopeKind}:${assembly.sourceNamespace.scopeRef}.`,
        clipId: clip.id,
        ...(clip.source.contentUnitId ? { contentUnitId: clip.source.contentUnitId } : {}),
      })
    }
  }
  return entries
}

function clipMatchesRequiredAsset(clip: AssemblyClip, asset: WorkflowRequiredAssetRow): boolean {
  if (asset.contentUnitId && (clip.source.contentUnitId === asset.contentUnitId || clip.intentRef.contentUnitId === asset.contentUnitId)) return true
  if (clip.source.assetId === asset.id) return true
  if (asset.sceneId && clip.intentRef.sceneMomentId === asset.sceneId && !asset.expressionUnitId) return true
  if (asset.expressionUnitId && clip.intentRef.expressionUnitId === asset.expressionUnitId) return true
  return false
}

function clipHasIntentRef(clip: AssemblyClip): boolean {
  return Boolean(
    clip.intentRef.contentUnitId
      || clip.intentRef.sceneMomentId
      || clip.intentRef.expressionUnitId
      || clip.intentRef.targetRef
      || clip.intentRef.namespaceNodeId,
  )
}

function uniqueClipsByAsset(clips: AssemblyClip[]): AssemblyClip[] {
  const seen = new Set<string>()
  const output: AssemblyClip[] = []
  for (const clip of clips) {
    const key = [
      clip.source.resourceId,
      clip.source.candidateId,
      clip.source.contentUnitId,
      clip.source.assetId,
    ].filter(Boolean).join(':') || clip.id
    if (seen.has(key)) continue
    seen.add(key)
    output.push(clip)
  }
  return output
}

function openMontageAssetIdForClip(clip: AssemblyClip): string {
  const resourceId = resourceIdNumber(clip.source.resourceId)
  if (resourceId !== undefined) return `resource_${resourceId}`
  return sanitizeId(clip.source.contentUnitId ?? clip.source.candidateId ?? clip.source.assetId)
}

function openMontageAssetType(clip: AssemblyClip): string {
  if (clip.kind === 'voice') return 'narration'
  if (clip.kind === 'music') return 'music'
  if (clip.kind === 'sfx') return 'sfx'
  if (clip.kind === 'subtitle') return 'subtitle'
  if (clip.kind === 'effect') return 'animation'
  const type = clip.source.type.toLowerCase()
  if (type.includes('image') || type.includes('storyboard') || type.includes('keyframe')) return 'image'
  if (type.includes('diagram')) return 'diagram'
  if (type.includes('animation')) return 'animation'
  return 'video'
}

function openMontageTransitionsFromClips(clips: AssemblyClip[]): Array<Record<string, unknown>> {
  return clips
    .filter((clip) => clip.edit.transitionOut !== 'cut' && clip.edit.transitionDurationMs > 0)
    .map((clip) => ({
      type: clip.edit.transitionOut,
      at_seconds: (clip.startMs + clip.durationMs) / 1000,
      duration_seconds: clip.edit.transitionDurationMs / 1000,
      clip_id: clip.id,
    }))
}

function editDecisionClipMetadata(clip: AssemblyClip): Record<string, unknown> {
  return {
    movscript: {
      timeline_assembly_clip_id: clip.id,
      track_id: clip.trackId,
      content_unit_id: clip.source.contentUnitId,
      candidate_id: clip.source.candidateId,
      resource_id: clip.source.resourceId,
      scene_moment_id: clip.binding.sceneId,
      expression_unit_id: clip.binding.expressionUnitId,
      target_ref: clip.binding.targetRef,
      source_status: clip.source.status,
      intent_ref: compactRecord({
        production_id: clip.intentRef.productionId,
        scope_kind: clip.intentRef.scopeKind,
        scope_ref: clip.intentRef.scopeRef,
        namespace_node_id: clip.intentRef.namespaceNodeId,
        namespace_kind: clip.intentRef.namespaceKind,
        namespace_path: clip.intentRef.namespacePath,
        scene_moment_id: clip.intentRef.sceneMomentId,
        expression_unit_id: clip.intentRef.expressionUnitId,
        content_unit_id: clip.intentRef.contentUnitId,
        target_ref: clip.intentRef.targetRef,
      }),
    },
  }
}

function normalizedOpenMontageVolume(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function resourceIdNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const direct = Number(value)
  if (Number.isInteger(direct) && direct > 0) return direct
  const match = value.match(/^(?:resource|raw_resource|backend_resource)[:_](\d+)$/i)
  if (!match) return undefined
  const parsed = Number(match[1])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function scopeFromAssembly(assembly: TimelineAssemblyState): { scopeKind?: string; scopeRef?: string } {
  if (assembly.productionId) return { scopeKind: 'production', scopeRef: assembly.productionId }
  const match = assembly.targetRef.match(/^timeline_assembly:([^:]+):(.+)$/)
  if (!match) return {}
  return {
    scopeKind: match[1],
    scopeRef: match[2],
  }
}

function nextAssembly(current: TimelineAssemblyState, patch: Partial<TimelineAssemblyState>): TimelineAssemblyState {
  return {
    ...current,
    ...patch,
    revision: current.revision + 1,
  }
}

function normalizeClip(clip: AssemblyClip): AssemblyClip {
  return {
    ...clip,
    startMs: clampTimelineMs(clip.startMs),
    durationMs: Math.max(MIN_CLIP_DURATION_MS, snapMs(clip.durationMs)),
    sourceInMs: clampTimelineMs(clip.sourceInMs),
    volume: Math.max(0, Math.min(2, clip.volume)),
    edit: normalizeClipEditIntent(clip.edit),
  }
}

function normalizeClipEditIntent(edit: TimelineAssemblyClipEditIntent): TimelineAssemblyClipEditIntent {
  return {
    ...edit,
    speed: Math.max(0.1, edit.speed),
    transitionDurationMs: Math.max(0, Number.isFinite(edit.transitionDurationMs) ? edit.transitionDurationMs : 0),
    transform: {
      ...edit.transform,
      scale: Math.max(0, edit.transform.scale),
    },
    overlay: {
      ...edit.overlay,
      x: Math.max(0, Math.min(1, edit.overlay.x)),
      y: Math.max(0, Math.min(1, edit.overlay.y)),
      width: Math.max(0, Math.min(1, edit.overlay.width)),
      height: Math.max(0, Math.min(1, edit.overlay.height)),
      opacity: Math.max(0, Math.min(1, edit.overlay.opacity)),
    },
  }
}

function clipAtPlayhead(assembly: TimelineAssemblyState): AssemblyClip | undefined {
  return assembly.clips
    .filter((clip) => assembly.playheadMs >= clip.startMs && assembly.playheadMs < clip.startMs + clip.durationMs)
    .sort((a, b) => b.startMs - a.startMs)[0]
}

function assemblyDurationMs(assembly: TimelineAssemblyState): number {
  return Math.max(
    12000,
    ...assembly.clips.map((clip) => clip.startMs + clip.durationMs),
  )
}

function timelineTicks(durationMs: number): number[] {
  const max = Math.ceil(durationMs / 2000) * 2000
  const ticks: number[] = []
  for (let tick = 0; tick <= max; tick += 2000) ticks.push(tick)
  return ticks
}

function pointerMs(event: DragEvent<HTMLElement> | MouseEvent<HTMLElement>, zoomPxPerSecond: number): number {
  const rect = event.currentTarget.getBoundingClientRect()
  return snapMs(Math.max(0, ((event.clientX - rect.left) / zoomPxPerSecond) * 1000))
}

function tickToLeft(valueMs: number, zoomPxPerSecond: number): number {
  return (valueMs / 1000) * zoomPxPerSecond
}

function snapMs(valueMs: number): number {
  return Math.round(valueMs / TIMELINE_SNAP_MS) * TIMELINE_SNAP_MS
}

function clampTimelineMs(valueMs: number): number {
  return Math.max(0, snapMs(Number.isFinite(valueMs) ? valueMs : 0))
}

function secondsToMs(value: string): number {
  return clampTimelineMs((Number(value) || 0) * 1000)
}

function secondsToDurationMs(value: string): number {
  return Math.max(0, Math.round((Number(value) || 0) * 1000))
}

function formatSecondsInput(valueMs: number): string {
  return String(Math.round(valueMs / 10) / 100)
}

function formatDuration(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function defaultStartMsForTrack(trackId: string, cursors: { visualCursor: number; voiceCursor: number; subtitleCursor: number }): number {
  if (trackId === 'video_main') return cursors.visualCursor
  if (trackId === 'voice' || trackId === 'sfx') return cursors.voiceCursor
  if (trackId === 'subtitle') return cursors.subtitleCursor
  return 0
}

function defaultTrackIdForAsset(asset: EditDeskAssetItem): string {
  const type = asset.type.toLowerCase()
  if (type.includes('voice') || type.includes('dialogue') || type.includes('narration')) return 'voice'
  if (type.includes('music') || type.includes('score')) return 'music'
  if (type.includes('sfx') || type.includes('sound')) return 'sfx'
  if (type.includes('subtitle') || type.includes('caption')) return 'subtitle'
  if (type.includes('effect') || type.includes('transition')) return 'effect'
  if (type.includes('overlay')) return 'video_overlay'
  return 'video_main'
}

function clipKindForAsset(asset: EditDeskAssetItem): AssemblyClipKind {
  const type = asset.type.toLowerCase()
  if (type.includes('voice') || type.includes('dialogue') || type.includes('narration')) return 'voice'
  if (type.includes('music') || type.includes('score')) return 'music'
  if (type.includes('sfx') || type.includes('sound')) return 'sfx'
  if (type.includes('subtitle') || type.includes('caption')) return 'subtitle'
  if (type.includes('effect') || type.includes('transition')) return 'effect'
  return 'visual'
}

function defaultDurationMsForAsset(asset: EditDeskAssetItem): number {
  const explicitDuration = numberValue(asset.raw.duration_ms ?? asset.raw.durationMs)
    ?? (numberValue(asset.raw.duration_seconds ?? asset.raw.durationSeconds) ? numberValue(asset.raw.duration_seconds ?? asset.raw.durationSeconds)! * 1000 : undefined)
  if (explicitDuration) return Math.max(MIN_CLIP_DURATION_MS, snapMs(explicitDuration))
  const kind = clipKindForAsset(asset)
  if (kind === 'music') return 12000
  if (kind === 'subtitle') return 3000
  if (kind === 'effect') return 1000
  if (kind === 'sfx') return 1500
  return 4000
}

function clipKindLabel(kind: AssemblyClipKind): string {
  switch (kind) {
    case 'voice':
      return '旁白/对白'
    case 'music':
      return '音乐'
    case 'sfx':
      return '音效'
    case 'subtitle':
      return '字幕'
    case 'effect':
      return '特效'
    case 'visual':
    default:
      return '画面'
  }
}

function assetStatusLabel(status: WorkflowAssetManifestRow['status']): string {
  if (status === 'selected') return '已选择'
  if (status === 'needs_selection') return '待选择'
  return '缺候选'
}

function writeDragPayload(event: DragEvent<HTMLElement>, payload: EditDeskDragPayload): void {
  const value = `${payload.kind}:${payload.id}`
  event.dataTransfer.effectAllowed = payload.kind === 'asset' ? 'copy' : 'move'
  event.dataTransfer.setData(EDIT_DESK_DRAG_MIME, value)
  event.dataTransfer.setData('text/plain', value)
}

function readDragPayload(event: DragEvent<HTMLElement>): EditDeskDragPayload | undefined {
  const value = event.dataTransfer.getData(EDIT_DESK_DRAG_MIME) || event.dataTransfer.getData('text/plain')
  const [kind, ...idParts] = value.split(':')
  const id = idParts.join(':')
  if ((kind === 'asset' || kind === 'clip') && id) return { kind, id }
  return undefined
}

function mediaUrlFromRecord(row: Record<string, unknown>): string | undefined {
  const selection = recordValue(row.selection)
  const resource = recordValue(row.resource)
    ?? recordValue(row.selected_resource)
    ?? recordValue(row.selectedResource)
    ?? recordValue(selection?.resource)
  const candidates = [
    row.preview_url,
    row.previewUrl,
    row.thumbnail_url,
    row.thumbnailUrl,
    row.url,
    row.uri,
    row.file_url,
    row.fileUrl,
    row.resource_url,
    row.resourceUrl,
    resource?.preview_url,
    resource?.previewUrl,
    resource?.thumbnail_url,
    resource?.thumbnailUrl,
    resource?.url,
    resource?.uri,
    resource?.file_url,
    resource?.fileUrl,
  ]
  return candidates.map(stringValue).find((value) => Boolean(value))
}

function mediaLocalPathFromRecord(row: Record<string, unknown>): string | undefined {
  const selection = recordValue(row.selection)
  const resource = recordValue(row.resource)
    ?? recordValue(row.selected_resource)
    ?? recordValue(row.selectedResource)
    ?? recordValue(selection?.resource)
  const candidates = [
    row.localPath,
    row.local_path,
    row.file_path,
    row.filePath,
    row.path,
    resource?.localPath,
    resource?.local_path,
    resource?.file_path,
    resource?.filePath,
    resource?.path,
  ]
  return candidates
    .map(stringValue)
    .map(normalizeLocalMediaPath)
    .find((value) => Boolean(value))
}

function normalizeLocalMediaPath(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (/^file:\/\//i.test(value)) {
    try {
      return decodeURIComponent(new URL(value).pathname)
    } catch {
      return undefined
    }
  }
  if (/^(https?:|blob:|data:|resource:|content-unit:)/i.test(value)) return undefined
  if (value.startsWith('/') || value.startsWith('~/') || /^[a-zA-Z]:[\\/]/.test(value)) return value
  return undefined
}

function looksLikeVideo(mediaUrl: string | undefined, type: string): boolean {
  const lowerUrl = mediaUrl?.toLowerCase() ?? ''
  const lowerType = type.toLowerCase()
  return lowerType.includes('video') || lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mov') || lowerUrl.endsWith('.webm')
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'draft'
}

export function buildWorkflowArtifactDebugView({
  readModel,
  snapshot,
}: {
  readModel?: unknown
  snapshot?: AgentSurfaceSnapshot
}): WorkflowArtifactDebugView {
  const readModelRecord = recordValue(recordValue(readModel)?.projectReadModel ?? readModel) ?? {}
  const summary = recordValue(snapshot?.data?.status_summary)
  const timelineStatus = projectTimelineStatus(readModelRecord, summary)
  const timelineNamespaces = timelineNamespaceRows(timelineStatus)
  const contentUnits = contentUnitRows(readModelRecord, summary)
  const requiredAssets = contentUnits.map(requiredAssetRow)
  const assetManifest = requiredAssets.flatMap(assetManifestRows)
  const editingTimelines = editingTimelineRows(readModelRecord, snapshot)
  const editDecisions = editingTimelines.length > 0 ? editingTimelines : derivedEditDecisionRows(assetManifest)
  const renderReport = renderReportRows(timelineStatus, editDecisions)
  const blockers = [
    ...requiredAssets.flatMap((row) => row.blockers.map((blocker) => ({
      artifact: 'required_assets',
      content_unit_id: row.contentUnitId,
      message: blocker,
    }))),
    ...editDecisions.flatMap((row) => row.blockerCount > 0 ? [{
      artifact: 'edit_decisions',
      target: row.target,
      blocker_count: row.blockerCount,
    }] : []),
  ]

  return {
    schema: 'movscript.workflow_artifact_debug_view.v1',
    timelineNamespaces,
    requiredAssets,
    assetManifest,
    editDecisions,
    renderReport,
    blockers,
    debug: {
      sourceEntityCount: numberValue(timelineStatus?.timeline_namespace_count ?? timelineStatus?.timelineNamespaceCount) ?? 0,
      timelineNamespaceCount: timelineNamespaces.length,
      contentUnitCount: contentUnits.length,
      candidateCount: requiredAssets.reduce((sum, row) => sum + row.candidateCount, 0),
      selectedCandidateCount: requiredAssets.filter((row) => row.selectedCandidate).length,
      selectedResourceCount: requiredAssets.filter((row) => row.selectedResource).length,
      editingProjectCount: editDecisions.filter((row) => row.editingProjectId).length,
      renderTaskCount: renderReport.length,
    },
    raw: {
      project_timeline_status: timelineStatus,
      status_summary: summary,
      read_model: readModelRecord,
    },
  }
}

function timelineNamespaceRows(timelineStatus: Record<string, unknown> | undefined): WorkflowTimelineNamespaceRow[] {
  return arrayValue(timelineStatus?.timeline_namespaces ?? timelineStatus?.timelineNamespaces)
    .map(recordValue)
    .filter(isRecord)
    .map((row, index): WorkflowTimelineNamespaceRow => {
      const parent = recordValue(row.parent)
      const id = stringValue(row.id ?? row.ref ?? row.path) ?? `timeline-namespace-${index + 1}`
      return {
        id,
        kind: stringValue(row.kind ?? row.namespace_kind ?? row.namespaceKind) ?? 'timeline_namespace',
        title: stringValue(row.title ?? row.name) ?? id,
        ...(stringValue(row.path) ? { path: stringValue(row.path) } : {}),
        ...(stringValue(parent?.id) ? { parentId: stringValue(parent?.id) } : {}),
        ...(stringValue(parent?.kind) ? { parentKind: stringValue(parent?.kind) } : {}),
        ...(stringValue(row.entity_kind ?? row.entityKind) ? { entityKind: stringValue(row.entity_kind ?? row.entityKind) } : {}),
        raw: row,
      }
    })
}

function projectTimelineStatus(readModel: Record<string, unknown>, summary: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const overview = recordValue(readModel.overview)
  return recordValue(readModel.projectTimelineStatus)
    ?? recordValue(readModel.project_timeline_status)
    ?? recordValue(overview?.projectTimelineStatus)
    ?? recordValue(overview?.project_timeline_status)
    ?? recordValue(summary?.project_timeline_status)
    ?? recordValue(summary?.projectTimelineStatus)
}

function contentUnitRows(readModel: Record<string, unknown>, summary: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const overview = recordValue(readModel.overview)
  const contentSummary = recordValue(readModel.contentSummary)
    ?? recordValue(readModel.content_summary)
    ?? recordValue(overview?.content)
  const readiness = recordValue(readModel.readiness)
    ?? recordValue(overview?.readiness)
  const timelineStatus = projectTimelineStatus(readModel, summary)
  const firstProduction = recordValue(arrayValue(summary?.productions)[0])
  const candidates = [
    readModel.contentUnits,
    readModel.content_units,
    contentSummary?.items,
    contentSummary?.contentUnits,
    contentSummary?.content_units,
    readiness?.contentUnits,
    readiness?.content_units,
    firstProduction?.content_units,
    firstProduction?.contentUnits,
    timelineStatus?.timeline_assemblies,
    timelineStatus?.timelineAssemblies,
  ]
  for (const candidate of candidates) {
    const rows = arrayValue(candidate).map(recordValue).filter(isRecord)
    if (rows.length > 0) return rows
  }
  return []
}

function requiredAssetRow(row: Record<string, unknown>, index: number): WorkflowRequiredAssetRow {
  const contentUnitId = stringValue(row.content_unit_id ?? row.contentUnitId ?? row.id)
  const candidateIds = arrayValue(row.candidate_ids ?? row.candidateIds ?? row.candidates)
    .map((candidate) => stringValue(recordValue(candidate)?.id ?? recordValue(candidate)?.candidate_id ?? candidate))
    .filter(isString)
  const candidateCount = numberValue(row.candidate_count ?? row.candidateCount) ?? candidateIds.length
  const selectedCandidate = stringValue(
    row.selected_candidate
      ?? row.selectedCandidate
      ?? recordValue(row.selection)?.candidate_id
      ?? recordValue(row.selection)?.candidateId,
  )
  const selectedResource = stringValue(
    row.selected_resource
      ?? row.selectedResource
      ?? recordValue(row.selection)?.resource_id
      ?? recordValue(row.selection)?.resourceId,
  )
  const blockers = arrayValue(row.blocking_refs ?? row.blockingRefs)
    .map((value) => stringValue(value) ?? stringValue(recordValue(value)?.message))
    .filter(isString)
  if (candidateCount > 0 && !selectedCandidate) blockers.push('selection_missing')
  return {
    id: contentUnitId ?? `required-asset-${index + 1}`,
    title: stringValue(row.title ?? row.name) ?? contentUnitId ?? `Required asset ${index + 1}`,
    type: stringValue(row.output_kind ?? row.outputKind ?? row.content_unit_type ?? row.contentUnitType ?? row.type) ?? 'unknown',
    ...(contentUnitId ? { contentUnitId } : {}),
    ...(stringValue(row.scene_moment_id ?? row.sceneMomentId ?? row.scene_id ?? row.sceneId) ? { sceneId: stringValue(row.scene_moment_id ?? row.sceneMomentId ?? row.scene_id ?? row.sceneId) } : {}),
    ...(stringValue(row.expression_unit_id ?? row.expressionUnitId) ? { expressionUnitId: stringValue(row.expression_unit_id ?? row.expressionUnitId) } : {}),
    ...(stringValue(row.target_ref ?? row.targetRef) ? { targetRef: stringValue(row.target_ref ?? row.targetRef) } : {}),
    candidateCount,
    ...(selectedCandidate ? { selectedCandidate } : {}),
    ...(selectedResource ? { selectedResource } : {}),
    blockers: uniqueStrings(blockers),
    raw: row,
  }
}

function assetManifestRows(row: WorkflowRequiredAssetRow): WorkflowAssetManifestRow[] {
  if (row.selectedResource) {
    return [{
      id: `asset-${row.contentUnitId ?? row.id}-${row.selectedResource}`,
      title: row.title,
      type: row.type,
      contentUnitId: row.contentUnitId,
      candidateId: row.selectedCandidate,
      resourceId: row.selectedResource,
      status: 'selected',
      raw: row.raw,
    }]
  }
  if (row.candidateCount > 0) {
    return [{
      id: `asset-${row.contentUnitId ?? row.id}-needs-selection`,
      title: row.title,
      type: row.type,
      contentUnitId: row.contentUnitId,
      candidateId: row.selectedCandidate,
      status: 'needs_selection',
      raw: row.raw,
    }]
  }
  return [{
    id: `asset-${row.contentUnitId ?? row.id}-missing-candidate`,
    title: row.title,
    type: row.type,
    contentUnitId: row.contentUnitId,
    status: 'missing_candidate',
    raw: row.raw,
  }]
}

function editingTimelineRows(readModel: Record<string, unknown>, snapshot: AgentSurfaceSnapshot | undefined): WorkflowEditRow[] {
  const rows = [
    ...arrayValue(readModel.editingTimelines),
    ...arrayValue(readModel.editing_timelines),
    ...arrayValue(recordValue(readModel.workspace)?.editingTimelines),
    ...arrayValue(recordValue(readModel.workspace)?.editing_timelines),
  ].map(recordValue).filter(isRecord)
  const productionTimeline = recordValue(snapshot?.data?.production_timeline)
  if (productionTimeline) rows.unshift(productionTimeline)
  return rows.map(editingTimelineRow)
}

function editingTimelineRow(row: Record<string, unknown>, index: number): WorkflowEditRow {
  const mediaEditingProject = recordValue(row.mediaEditingProject ?? row.media_editing_project)
  const timeline = recordValue(mediaEditingProject?.timeline)
  const tracks = arrayValue(timeline?.tracks)
  const clipCount = tracks.reduce((count: number, track: unknown) => count + arrayValue(recordValue(track)?.clips).length, 0)
    || arrayValue(row.clips).length
  const blockers = arrayValue(row.blockers)
  const target = [
    stringValue(row.targetKind ?? row.target_kind),
    stringValue(row.targetRef ?? row.target_ref ?? row.targetId ?? row.target_id),
  ].filter(Boolean).join(':') || `edit-decision-${index + 1}`
  return {
    id: stringValue(row.id) ?? stringValue(mediaEditingProject?.id) ?? `edit-decision-${index + 1}`,
    title: stringValue(mediaEditingProject?.title ?? row.title) ?? target,
    target,
    status: stringValue(row.status) ?? (blockers.length > 0 ? 'blocked' : 'ready_to_edit'),
    clipCount,
    blockerCount: blockers.length,
    editingProjectId: stringValue(mediaEditingProject?.id),
    raw: row,
  }
}

function derivedEditDecisionRows(assetManifest: WorkflowAssetManifestRow[]): WorkflowEditRow[] {
  const selectedAssets = assetManifest.filter((row) => row.status === 'selected' && row.resourceId)
  const blockers = assetManifest.filter((row) => row.status !== 'selected').length
  if (selectedAssets.length === 0 && blockers === 0) return []
  return [{
    id: 'derived-edit-decisions',
    title: 'Derived edit handoff',
    target: 'timeline_assembly:draft',
    status: blockers > 0 ? 'blocked' : 'ready_to_handoff',
    clipCount: selectedAssets.length,
    blockerCount: blockers,
    raw: {
      cuts: selectedAssets.map((asset, index) => ({
        id: `cut_${index + 1}`,
        source: asset.resourceId,
        content_unit_id: asset.contentUnitId,
        candidate_id: asset.candidateId,
      })),
    },
  }]
}

function renderReportRows(timelineStatus: Record<string, unknown> | undefined, editRows: WorkflowEditRow[]): WorkflowRenderRow[] {
  const renderReports = [
    ...arrayValue(timelineStatus?.render_reports),
    ...arrayValue(timelineStatus?.renderReports),
  ].map(recordValue).filter(isRecord)
  if (renderReports.length > 0) {
    return renderReports.map((row, index) => ({
      id: stringValue(row.id) ?? `render-report-${index + 1}`,
      title: stringValue(row.title ?? row.output_path ?? row.outputPath) ?? `Render report ${index + 1}`,
      status: stringValue(row.status) ?? 'unknown',
      resourceId: stringValue(row.resource_id ?? row.resourceId),
      editingProjectId: stringValue(row.editing_project_id ?? row.editingProjectId),
      raw: row,
    }))
  }
  return editRows
    .filter((row) => row.editingProjectId)
    .map((row) => ({
      id: `render-ready-${row.id}`,
      title: `Render pending: ${row.title}`,
      status: row.blockerCount > 0 ? 'blocked' : 'ready_to_render',
      editingProjectId: row.editingProjectId,
      raw: row.raw,
    }))
}

function withParams(pathname: string, params: URLSearchParams, extra: Record<string, string | number | undefined> = {}): string {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && String(value).trim()) next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') output[key] = value
  }
  return output
}

function sameLooseId(left: string | number | undefined, right: string | number | undefined): boolean {
  if (left === undefined || right === undefined) return false
  return String(left) === String(right)
}

function isRecord(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return Boolean(value)
}

function isString(value: string | undefined): value is string {
  return Boolean(value)
}
