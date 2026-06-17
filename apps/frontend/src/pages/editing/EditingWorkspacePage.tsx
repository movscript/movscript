import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Copy, Loader2, XCircle } from 'lucide-react'
import { AppContentLayout } from '@movscript/ui/layout'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Progress,
} from '@movscript/ui/primitives'

import {
  readEditingProjectRegistry,
  upsertEditingProjectSummary,
  writeEditingProjectRegistry,
  type EditingProjectSummary,
} from '@/features/app-shell/application/editingProjectRegistry'
import { isEditableKeyboardTarget, readMediaAPI } from '@/features/editing/application/browser'
import { saveEditingProjectSnapshot } from '@/features/editing/application/editingProjectSave'
import { useEditingHeaderStore } from '@/features/editing/application/editingHeaderStore'
import {
  addAssetClipToCompatibleTrackCommand,
  addAssetClipToTrackCommand,
  addClipFromFormCommand,
  addLocalAssetCommand,
  addTimelineTrackCommand,
  copyTimelineClip,
  deleteClipCommand,
  deleteTimelineTrackCommand,
  detachClipAudioCommand,
  extractAudioAssetCommand,
  moveTimelineTrackCommand,
  pasteTimelineClipCommand,
  removeAssetCommand,
  splitClipAtPlayheadCommand,
  type TimelineClipClipboardItem,
  updateClipCommand,
  updateClipTransformCommand,
  updateProjectCanvasCommand,
} from '@/features/editing/application/editingCommands'
import { useEditingTaskStates } from '@/features/editing/application/useEditingTaskStates'
import { useEditingWorkspaceLayout } from '@/features/editing/application/useEditingWorkspaceLayout'
import { AssetLibraryPanel } from '@/features/editing/components/AssetLibraryPanel'
import { EditingPreviewPlayer } from '@/features/editing/components/EditingPreviewPlayer'
import { InspectorPanel } from '@/features/editing/components/InspectorPanel'
import { TimelinePanel } from '@/features/editing/components/TimelinePanel'
import {
  EDITING_ASSET_DRAG_TYPE,
  EDITING_AUTOSAVE_DELAY_MS,
  EDITING_CANVAS_PRESETS,
  STANDALONE_EDITING_PROJECT_ID,
} from '@/features/editing/domain/constants'
import { createLocalAsset, isExtractedAudioAsset } from '@/features/editing/domain/assets'
import {
  applyRippleTrimEndToTrack,
  applyLinkedClipMoveToProject,
  applyLinkedClipTrimToProject,
  assetCanDropOnTrack,
  clipCanDropOnTrack,
  draftClipFromPointerDelta,
  linkedTimelineClipIds,
  normalizeClipPlacement,
} from '@/features/editing/domain/clips'
import {
  clampTimelineMs,
  timelineMsFromPointer,
} from '@/features/editing/domain/timelineGeometry'
import {
  createTimelineViewport,
  zoomTimelineViewportAtRatio,
  type TimelineTool,
} from '@/features/editing/domain/timelineInteraction'
import { buildTimelinePreviewProjection } from '@/features/editing/domain/timelinePreview'
import {
  moveClipToTrack,
  reorderClipWithinTrackByMidpoint,
  trackFromPointer,
  trackIdForAssetType,
} from '@/features/editing/domain/tracks'
import {
  normalizeEditingProjectCanvas,
  refreshTimelineDuration,
} from '@/features/editing/domain/project'
import {
  emptyClipForm,
  type ClipForm,
  type PreviewMode,
  type SaveState,
  type TimelineClipEditMode,
  type TimelineTrack,
  type TimelineTrackType,
} from '@/features/editing/domain/types'
import { clampNumber, formatDuration, safeFileStem } from '@/features/editing/domain/utils'
import { localMediaUrl, probeLocalMediaAsset } from '@/features/editing/media/localMedia'
import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
  ElectronMediaPipelineTaskState,
} from '@/shared/contracts/electronApiMedia'
import { toast } from '@/shared/ui/toastStore'
import './EditingWorkspacePage.css'

type EditingExportFormat = 'mp4' | 'hls'
type EditingExportDialogPhase = 'settings' | 'progress' | 'result'

type EditingExportDialogState = {
  open: boolean
  phase: EditingExportDialogPhase
  format: EditingExportFormat
  filename: string
  taskId?: string
  errorMessage?: string
}

export default function EditingWorkspacePage() {
  const { editingProjectId } = useParams<{ editingProjectId: string }>()
  const [projects, setProjects] = useState<EditingProjectSummary[]>([])
  const [activeProject, setActiveProject] = useState<ElectronMediaPipelineEditingProject | null>(null)
  const [selectedClipId, setSelectedClipId] = useState<string>('')
  const [timelineClipClipboard, setTimelineClipClipboard] = useState<TimelineClipClipboardItem | null>(null)
  const [clipForm, setClipForm] = useState<ClipForm>(emptyClipForm)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [timelineViewStartMs, setTimelineViewStartMs] = useState(0)
  const [timelineTool, setTimelineTool] = useState<TimelineTool>('select')
  const [timelineSnapEnabled, setTimelineSnapEnabled] = useState(true)
  const [linkedSelectionEnabled, setLinkedSelectionEnabled] = useState(true)
  const [rippleEditingEnabled, setRippleEditingEnabled] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('timeline')
  const [previewAssetId, setPreviewAssetId] = useState('')
  const [assetPreviewTimeMs, setAssetPreviewTimeMs] = useState(0)
  const [assetPreviewDurationMs, setAssetPreviewDurationMs] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const [isDirty, setIsDirty] = useState(false)
  const [exportDialog, setExportDialog] = useState<EditingExportDialogState>({
    open: false,
    phase: 'settings',
    format: 'mp4',
    filename: '',
  })
  const pendingSaveRevisionRef = useRef<number | null>(null)
  const activeProjectRef = useRef<ElectronMediaPipelineEditingProject | null>(null)
  const isDirtyRef = useRef(false)
  const editGenerationRef = useRef(0)
  const saveQueueRef = useRef<Promise<ElectronMediaPipelineEditingProject | undefined>>(Promise.resolve(undefined))
  const mediaAPI = readMediaAPI()
  const canCreateTask = Boolean(mediaAPI?.createMediaPipelineTask)
  const { taskStates, upsertTaskState: upsertEditingTaskState } = useEditingTaskStates(mediaAPI, STANDALONE_EDITING_PROJECT_ID)
  const { inspectorResize, layoutStyle, libraryResize, timelineResize } = useEditingWorkspaceLayout()
  const setEditingHeader = useEditingHeaderStore((s) => s.setHeader)
  const resetEditingHeader = useEditingHeaderStore((s) => s.reset)

  useEffect(() => {
    setProjects(readEditingProjectRegistry())
  }, [])

  useEffect(() => {
    activeProjectRef.current = activeProject
  }, [activeProject])

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    if (saveState.status === 'saved' && saveState.message) {
      toast.success(saveState.message)
    }
    if (saveState.status === 'error' && saveState.message) {
      toast.error('剪辑保存失败', saveState.message)
    }
    if (saveState.status === 'conflict' && saveState.message) {
      toast.error('剪辑保存冲突', saveState.message)
    }
  }, [saveState])

  useEffect(() => {
    if (!editingProjectId) return
    const registry = readEditingProjectRegistry()
    setProjects(registry)
    const project = registry.find((candidate) => candidate.id === editingProjectId)
    if (project) {
      void openProject(project)
      return
    }
    void openProject({
      id: editingProjectId,
      projectId: STANDALONE_EDITING_PROJECT_ID,
      title: editingProjectId,
      updatedAt: new Date().toISOString(),
    })
  }, [editingProjectId])

  useEffect(() => {
    if (!activeProject || !isDirty) return undefined
    const timeout = window.setTimeout(() => {
      void saveProject(activeProject, { auto: true })
    }, EDITING_AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [activeProject, isDirty])

  useEffect(() => {
    if (!activeProject || !mediaAPI?.onMediaEditingProjectEvent) return undefined
    return mediaAPI.onMediaEditingProjectEvent((event) => {
      const eventProjectId = event.projectId ?? event.project_id
      const eventEditingProjectId = event.editingProjectId ?? event.editing_project_id
      if (eventProjectId !== activeProject.projectId || eventEditingProjectId !== activeProject.id) return
      const eventProject = normalizeEditingProjectCanvas(event.editingProject ?? event.editing_project)
      const eventRevision = eventProject.revision ?? event.revision ?? 0
      const activeRevision = activeProject.revision ?? 0
      if (eventRevision <= activeRevision) return
      const isPendingSaveEvent = pendingSaveRevisionRef.current === eventRevision
      if (isDirty) {
        if (!isPendingSaveEvent) {
          setSaveState({ status: 'conflict', message: '剪辑项目已被外部更新；请重新载入后再保存本地修改' })
        }
        return
      }
      setActiveEditingProject(eventProject)
      setEditingDirty(false)
      setSaveState((current) => current.status === 'saving' ? current : { status: 'saved', message: '已同步外部剪辑更新' })
      setProjects((currentProjects) => {
        const nextProjects = upsertEditingProjectSummary(currentProjects, {
          id: eventProject.id,
          projectId: eventProject.projectId,
          title: eventProject.title,
          updatedAt: eventProject.updatedAt ?? new Date().toISOString(),
          projectPath: event.projectPath ?? event.project_path,
          snapshot: eventProject,
        })
        writeEditingProjectRegistry(nextProjects)
        return nextProjects
      })
    })
  }, [activeProject, isDirty, mediaAPI, saveState.status])

  const assetById = useMemo(() => {
    return new Map((activeProject?.assets.assets ?? []).map((asset) => [asset.id, asset]))
  }, [activeProject?.assets.assets])
  const selectedClip = useMemo(() => {
    if (!activeProject || !selectedClipId) return null
    for (const track of activeProject.timeline.tracks) {
      const clip = track.clips.find((candidate) => candidate.id === selectedClipId)
      if (clip) return { trackId: track.id, clip }
    }
    return null
  }, [activeProject, selectedClipId])
  const linkedSelectedClipIds = useMemo(() => (
    activeProject && linkedSelectionEnabled && selectedClipId
      ? linkedTimelineClipIds(activeProject, selectedClipId)
      : []
  ), [activeProject, linkedSelectionEnabled, selectedClipId])
  const previewAsset = useMemo(() => {
    if (!previewAssetId) return null
    return assetById.get(previewAssetId) ?? null
  }, [assetById, previewAssetId])
  const selectedAsset = !selectedClip && previewMode === 'asset' ? previewAsset : null
  const timelineDurationMs = Math.max(activeProject?.timeline.durationMs ?? 0, playheadMs, 10000)
  const timelineViewport = createTimelineViewport(timelineDurationMs, timelineZoom, timelineViewStartMs)
  const timelineVisibleDurationMs = timelineViewport.visibleDurationMs
  const timelineVisibleStartMs = timelineViewport.visibleStartMs
  const playheadPercent = timelineVisibleDurationMs <= 0
    ? 0
    : ((playheadMs - timelineVisibleStartMs) / timelineVisibleDurationMs) * 100
  useEffect(() => {
    setTimelineViewStartMs((current) => clampTimelineMs(current, Math.max(0, timelineDurationMs - timelineVisibleDurationMs)))
  }, [timelineDurationMs, timelineVisibleDurationMs])
  const activePreviewClip = useMemo(() => {
    if (!activeProject) return null
    for (const track of activeProject.timeline.tracks) {
      const clip = track.clips.find((candidate) => (
        playheadMs >= candidate.timelineStartMs
        && playheadMs < candidate.timelineStartMs + candidate.durationMs
      ))
      if (clip) return clip
    }
    return null
  }, [activeProject, playheadMs])
  const timelinePreviewProjection = useMemo(() => {
    return buildTimelinePreviewProjection(activeProject, playheadMs)
  }, [activeProject, playheadMs])
  const clipPreviewClip = selectedClip?.clip ?? null
  const previewRange = useMemo(() => {
    if (previewMode === 'clip' && clipPreviewClip) {
      return {
        startMs: clipPreviewClip.timelineStartMs,
        endMs: clipPreviewClip.timelineStartMs + clipPreviewClip.durationMs,
      }
    }
    return { startMs: 0, endMs: timelineDurationMs }
  }, [clipPreviewClip, previewMode, timelineDurationMs])
  const previewCurrentMs = previewMode === 'asset'
    ? assetPreviewTimeMs
    : Math.max(0, playheadMs - previewRange.startMs)
  const previewDurationMs = previewMode === 'asset'
    ? assetPreviewDurationMs
    : Math.max(0, previewRange.endMs - previewRange.startMs)
  const previewPlayable = previewMode === 'asset'
    ? Boolean(previewAsset && (previewAsset.assetType === 'video' || previewAsset.assetType === 'audio') && localMediaUrl(previewAsset))
    : Boolean(activeProject && (previewMode !== 'clip' || clipPreviewClip))
  const currentExportTask = useMemo(() => {
    if (!exportDialog.taskId) return null
    return taskStates.find((task) => task.taskId === exportDialog.taskId) ?? null
  }, [exportDialog.taskId, taskStates])

  useEffect(() => {
    if (!currentExportTask || exportDialog.phase !== 'progress') return
    if (currentExportTask.status === 'succeeded' || currentExportTask.status === 'failed' || currentExportTask.status === 'canceled') {
      setExportDialog((current) => ({
        ...current,
        phase: 'result',
        errorMessage: currentExportTask.errorMessage ?? current.errorMessage,
      }))
    }
  }, [currentExportTask, exportDialog.phase])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeProject) return
      if (isEditableKeyboardTarget(event.target)) return
      const commandKey = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (commandKey && !event.shiftKey && !event.altKey && key === 'c') {
        event.preventDefault()
        copySelectedTimelineClip()
        return
      }
      if (commandKey && !event.shiftKey && !event.altKey && key === 'v') {
        event.preventDefault()
        pasteTimelineClip()
        return
      }
      if (event.code !== 'Space' || event.repeat) return
      event.preventDefault()
      toggleTimelinePlaybackFromKeyboard()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeProject, isPlaying, playheadMs, selectedClip, timelineClipClipboard, timelineDurationMs])

  useEffect(() => {
    if (!isPlaying) return undefined
    if (previewMode === 'asset') return undefined
    let frame = 0
    let previousTimestamp = performance.now()
    const tick = (timestamp: number) => {
      const deltaMs = Math.max(0, timestamp - previousTimestamp)
      previousTimestamp = timestamp
      setPlayheadMs((current) => {
        const next = Math.min(current + deltaMs, previewRange.endMs)
        if (next >= previewRange.endMs) setIsPlaying(false)
        return next
      })
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [isPlaying, previewMode, previewRange.endMs])

  useEffect(() => {
    if (!isPlaying || previewMode !== 'asset') return
    if (!previewAsset || (previewAsset.assetType !== 'video' && previewAsset.assetType !== 'audio')) setIsPlaying(false)
  }, [isPlaying, previewAsset, previewMode])

  useEffect(() => {
    setEditingHeader({
      active: true,
      title: activeProject?.title ?? '剪辑',
      canSave: Boolean(activeProject),
      canRender: Boolean(activeProject && canCreateTask),
      busy: saveState.status === 'saving',
      onSave: activeProject ? () => { void saveProject() } : undefined,
      onCreatePreview: activeProject && canCreateTask ? () => openExportDialog('hls') : undefined,
      onRenderMp4: activeProject && canCreateTask ? () => openExportDialog('mp4') : undefined,
    })
  }, [activeProject, canCreateTask, saveState.status, setEditingHeader])

  useEffect(() => {
    return () => resetEditingHeader()
  }, [resetEditingHeader])

  function setActiveEditingProject(project: ElectronMediaPipelineEditingProject | null) {
    activeProjectRef.current = project
    setActiveProject(project)
  }

  function setEditingDirty(dirty: boolean) {
    isDirtyRef.current = dirty
    setIsDirty(dirty)
  }

  async function openProject(project: EditingProjectSummary) {
    setSaveState({ status: 'idle' })
    if (mediaAPI?.getMediaEditingProject) {
      const result = await mediaAPI.getMediaEditingProject({
        projectId: project.projectId,
        editingProjectId: project.id,
      })
      if (result.status === 'ok') {
        setActiveEditingProject(normalizeEditingProjectCanvas(result.editingProject ?? result.editing_project))
        setSelectedClipId('')
        setPlayheadMs(0)
        setTimelineZoom(1)
        setTimelineViewStartMs(0)
        setIsPlaying(false)
        setPreviewMode('timeline')
        setPreviewAssetId('')
        setAssetPreviewTimeMs(0)
        setAssetPreviewDurationMs(0)
        setEditingDirty(false)
        return
      }
    }
    if (project.snapshot) {
      setActiveEditingProject(normalizeEditingProjectCanvas(project.snapshot))
      setSelectedClipId('')
      setPlayheadMs(0)
      setTimelineZoom(1)
      setTimelineViewStartMs(0)
      setIsPlaying(false)
      setPreviewMode('timeline')
      setPreviewAssetId('')
      setAssetPreviewTimeMs(0)
      setAssetPreviewDurationMs(0)
      setEditingDirty(false)
      return
    }
    setSaveState({ status: 'error', message: '未找到本地剪辑项目文件' })
  }

  async function saveProject(project: ElectronMediaPipelineEditingProject | null = activeProjectRef.current, options: { auto?: boolean } = {}) {
    const requestedProject = project ?? activeProjectRef.current
    if (!requestedProject) return undefined
    const queuedSave = saveQueueRef.current.then(
      () => runProjectSave(requestedProject, options),
      () => runProjectSave(requestedProject, options),
    )
    saveQueueRef.current = queuedSave.catch(() => undefined)
    return queuedSave
  }

  async function runProjectSave(project: ElectronMediaPipelineEditingProject, options: { auto?: boolean }) {
    const projectToSave = activeProjectRef.current ?? project
    if (!projectToSave) return undefined
    if (!isDirtyRef.current && activeProjectRef.current === projectToSave) {
      if (!options.auto) setSaveState({ status: 'saved', message: '已保存到本机剪辑工作区' })
      return projectToSave
    }
    setSaveState({ status: 'saving', message: options.auto ? '正在自动保存' : undefined })
    try {
      const saveGeneration = editGenerationRef.current
      const outcome = await saveEditingProjectSnapshot({
        project: projectToSave,
        mediaAPI,
        onAttempt: (attemptProject) => {
          pendingSaveRevisionRef.current = attemptProject.revision ?? null
        },
      })
      if (outcome.status === 'conflict') {
        pendingSaveRevisionRef.current = null
        setEditingDirty(true)
        setSaveState({ status: 'conflict', message: outcome.result.message || '剪辑项目版本已变化，保存已取消' })
        return undefined
      }
      const savedProject = outcome.editingProject
      pendingSaveRevisionRef.current = savedProject.revision ?? null
      rememberSavedProject(savedProject, outcome.projectPath, outcome.updatedAt)
      const currentProject = activeProjectRef.current
      const isCurrentProject = currentProject?.id === savedProject.id && currentProject.projectId === savedProject.projectId
      if (isCurrentProject && editGenerationRef.current === saveGeneration) {
        setActiveEditingProject(savedProject)
        setEditingDirty(false)
        setSaveState({ status: 'saved', message: outcome.nativeResult ? (options.auto ? '已自动保存' : '已保存到本机剪辑工作区') : '已保存到浏览器本地记录' })
      } else if (isCurrentProject) {
        setEditingDirty(true)
        setSaveState({ status: 'idle' })
      }
      pendingSaveRevisionRef.current = null
      return savedProject
    } catch (error) {
      pendingSaveRevisionRef.current = null
      setSaveState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  }

  function rememberSavedProject(savedProject: ElectronMediaPipelineEditingProject, projectPath: string | undefined, fallbackUpdatedAt: string) {
    setProjects((currentProjects) => {
      const nextProjects = upsertEditingProjectSummary(currentProjects, {
        id: savedProject.id,
        projectId: savedProject.projectId,
        title: savedProject.title,
        updatedAt: savedProject.updatedAt ?? fallbackUpdatedAt,
        projectPath,
        snapshot: savedProject,
      })
      writeEditingProjectRegistry(nextProjects)
      return nextProjects
    })
  }

  function deleteProject(project: EditingProjectSummary) {
    const nextProjects = projects.filter((candidate) => candidate.id !== project.id)
    setProjects(nextProjects)
    writeEditingProjectRegistry(nextProjects)
    if (activeProject?.id === project.id) {
      setActiveEditingProject(null)
      setSelectedClipId('')
      setIsPlaying(false)
      setEditingDirty(false)
    }
  }

  function commitProjectChange(
    project: ElectronMediaPipelineEditingProject,
    options: { selectedClipId?: string; playheadMs?: number; dirty?: boolean } = {},
  ) {
    const nextProject = refreshTimelineDuration(normalizeEditingProjectCanvas(project))
    setActiveEditingProject(nextProject)
    if (options.selectedClipId !== undefined) setSelectedClipId(options.selectedClipId)
    if (options.playheadMs !== undefined) setPlayheadMs(clampTimelineMs(options.playheadMs, Math.max(nextProject.timeline.durationMs ?? 0, 0)))
    if (options.dirty !== false) {
      editGenerationRef.current += 1
      setEditingDirty(true)
      if (saveState.status === 'saved') setSaveState({ status: 'idle' })
    }
  }

  function updateProjectCanvas(patch: Partial<Pick<ElectronMediaPipelineEditingProject['timeline'], 'width' | 'height' | 'fps' | 'background'>>) {
    if (!activeProject) return
    commitProjectChange(updateProjectCanvasCommand(activeProject, patch))
  }

  function applyCanvasPreset(preset: (typeof EDITING_CANVAS_PRESETS)[number]) {
    updateProjectCanvas({ width: preset.width, height: preset.height })
  }

  async function addLocalAssetFromDialog() {
    if (!activeProject || !mediaAPI?.openFile) return
    const path = await mediaAPI.openFile()
    if (!path) return
    void addLocalAsset(path)
  }

  async function addLocalAsset(localPath: string) {
    if (!activeProject) return
    const asset = await probeLocalMediaAsset(createLocalAsset(localPath))
    const { project } = addLocalAssetCommand(activeProject, localPath, asset)
    commitProjectChange(project)
    setClipForm((current) => ({
      ...current,
      assetId: asset.id,
      trackId: trackIdForAssetType(asset.assetType),
    }))
    previewAssetForEditing(asset.id)
  }

  function removeAsset(assetId: string) {
    if (!activeProject) return
    commitProjectChange(removeAssetCommand(activeProject, assetId))
    if (clipForm.assetId === assetId) setClipForm((current) => ({ ...current, assetId: '' }))
    if (previewAssetId === assetId) {
      setPreviewMode('timeline')
      setPreviewAssetId('')
      setAssetPreviewTimeMs(0)
      setAssetPreviewDurationMs(0)
      setIsPlaying(false)
    }
  }

  function extractAudioFromAsset(asset: ElectronMediaPipelineAssetDescriptor) {
    if (!activeProject || asset.assetType !== 'video') return
    const { project, audioAsset } = extractAudioAssetCommand(activeProject, asset)
    commitProjectChange(project)
    setClipForm((current) => ({
      ...current,
      assetId: audioAsset.id,
      trackId: trackIdForAssetType(audioAsset.assetType),
    }))
    previewAssetForEditing(audioAsset.id)
  }

  async function revealAssetInFolder(asset: ElectronMediaPipelineAssetDescriptor) {
    const localPath = asset.localPath?.trim()
    if (!localPath) {
      toast.error('无法打开文件位置', '该素材没有本地文件路径')
      return
    }
    if (!mediaAPI?.revealFileInFolder) {
      toast.error('无法打开文件位置', '当前运行环境不支持打开本地文件位置')
      return
    }
    try {
      await mediaAPI.revealFileInFolder({ path: localPath })
    } catch (error) {
      toast.error('无法打开文件位置', error instanceof Error ? error.message : String(error))
    }
  }

  function addClipFromForm() {
    if (!activeProject || !clipForm.assetId) return
    const asset = assetById.get(clipForm.assetId)
    if (!asset) return
    const { project, clip, track } = addClipFromFormCommand(activeProject, asset, clipForm, playheadMs)
    commitProjectChange(project, { selectedClipId: clip.id, playheadMs: clip.timelineStartMs })
    setClipForm((current) => ({ ...current, trackId: track.id }))
  }

  function updateSelectedClip(patch: Partial<ElectronMediaPipelineClip>) {
    if (!activeProject || !selectedClip) return
    const { project, clip } = updateClipCommand(activeProject, selectedClip, patch, playheadMs)
    commitProjectChange(project, { playheadMs: clip.timelineStartMs })
  }

  function detachSelectedClipAudio() {
    if (!activeProject || !selectedClip || selectedClip.clip.assetType !== 'video' || !selectedClip.clip.asset) return
    const result = detachClipAudioCommand(activeProject, selectedClip)
    if (!result) return
    commitProjectChange(result.project, { selectedClipId: result.audioClip.id, playheadMs: result.audioClip.timelineStartMs })
    setClipForm((current) => ({
      ...current,
      assetId: result.audioAsset.id,
      trackId: result.track.id,
      timelineStartMs: String(result.audioClip.timelineStartMs),
      durationMs: String(result.audioClip.durationMs),
    }))
  }

  function splitSelectedClipAtPlayhead() {
    if (!activeProject || !selectedClip) return
    const result = splitClipAtPlayheadCommand(activeProject, selectedClip, playheadMs)
    if (!result) return
    commitProjectChange(result.project, { selectedClipId: result.right.id, playheadMs: result.right.timelineStartMs })
  }

  function deleteSelectedClip() {
    if (!activeProject || !selectedClip) return
    commitProjectChange(deleteClipCommand(activeProject, selectedClip, { ripple: rippleEditingEnabled }), { selectedClipId: '' })
    if (previewMode === 'clip') setPreviewMode('timeline')
  }

  function copySelectedTimelineClip() {
    if (!selectedClip) return
    setTimelineClipClipboard(copyTimelineClip(selectedClip))
  }

  function pasteTimelineClip() {
    if (!activeProject || !timelineClipClipboard) return
    const { project, clip, track } = pasteTimelineClipCommand(activeProject, timelineClipClipboard, playheadMs)
    setIsPlaying(false)
    setPreviewMode('clip')
    commitProjectChange(project, { selectedClipId: clip.id, playheadMs: clip.timelineStartMs })
    setClipForm((current) => ({
      ...current,
      assetId: clip.asset?.id ?? current.assetId,
      trackId: track.id,
      timelineStartMs: String(clip.timelineStartMs),
      durationMs: String(clip.durationMs),
    }))
  }

  function addTimelineTrack(type: TimelineTrackType) {
    if (!activeProject) return
    const { project, track } = addTimelineTrackCommand(activeProject, type)
    commitProjectChange(project)
    setClipForm((current) => ({ ...current, trackId: track.id }))
  }

  function deleteTimelineTrack(trackId: string) {
    if (!activeProject) return
    const result = deleteTimelineTrackCommand(activeProject, trackId)
    if (!result) return
    commitProjectChange(result.project)
    if (clipForm.trackId === trackId) {
      setClipForm((current) => ({ ...current, trackId: result.nextTracks.find((candidate) => candidate.type === result.track.type)?.id ?? result.nextTracks[0]?.id ?? '' }))
    }
  }

  function moveTimelineTrack(trackId: string, direction: -1 | 1) {
    if (!activeProject) return
    const nextProject = moveTimelineTrackCommand(activeProject, trackId, direction)
    if (nextProject) commitProjectChange(nextProject)
  }

  function toggleTimelineTrackLocked(trackId: string) {
    if (!activeProject) return
    commitProjectChange({
      ...activeProject,
      updatedAt: new Date().toISOString(),
      timeline: {
        ...activeProject.timeline,
        tracks: activeProject.timeline.tracks.map((track) => (
          track.id === trackId ? { ...track, locked: !track.locked } : track
        )),
      },
    })
  }

  function toggleTimelineTrackMuted(trackId: string) {
    if (!activeProject) return
    commitProjectChange({
      ...activeProject,
      updatedAt: new Date().toISOString(),
      timeline: {
        ...activeProject.timeline,
        tracks: activeProject.timeline.tracks.map((track) => (
          track.id === trackId ? { ...track, muted: !track.muted } : track
        )),
      },
    })
  }

  function openExportDialog(format: EditingExportFormat) {
    setExportDialog({
      open: true,
      phase: 'settings',
      format,
      filename: defaultExportFilename(activeProject?.title ?? 'movscript-export', format),
      taskId: undefined,
      errorMessage: undefined,
    })
  }

  function updateExportDialog(patch: Partial<Pick<EditingExportDialogState, 'format' | 'filename'>>) {
    setExportDialog((current) => {
      const format = patch.format ?? current.format
      return {
        ...current,
        ...patch,
        filename: patch.filename ?? (patch.format ? normalizeExportFilename(current.filename, activeProject?.title ?? 'movscript-export', format) : current.filename),
      }
    })
  }

  async function confirmExportTask() {
    if (!activeProject || !mediaAPI?.createMediaPipelineTask) return
    const filename = normalizeExportFilename(exportDialog.filename, activeProject.title, exportDialog.format)
    setExportDialog((current) => ({
      ...current,
      phase: 'progress',
      filename,
      taskId: undefined,
      errorMessage: undefined,
    }))
    const task = await createRenderTask(exportDialog.format, filename)
    setExportDialog((current) => ({
      ...current,
      phase: task ? 'progress' : 'result',
      taskId: task?.taskId,
      errorMessage: task ? undefined : current.errorMessage,
    }))
  }

  async function createRenderTask(format: EditingExportFormat, filename = defaultExportFilename(activeProject?.title ?? 'movscript-export', format)) {
    if (!activeProject || !mediaAPI?.createMediaPipelineTask) return null
    const savedProject = await saveProject(activeProject)
    if (!savedProject) return null
    setSaveState({ status: 'saving', message: '正在创建渲染任务' })
    try {
      const task = await mediaAPI.createMediaPipelineTask({
        projectId: savedProject.projectId,
        taskType: format === 'hls' ? 'timeline_hls' : 'timeline_render',
        editingProject: savedProject,
        output: {
          format,
          filename,
        },
      })
      upsertEditingTaskState(task)
      setSaveState({ status: 'saved', message: `${format === 'hls' ? '预览' : '渲染'}任务已创建` })
      return task
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSaveState({ status: 'error', message })
      setExportDialog((current) => ({ ...current, phase: 'result', errorMessage: message }))
      return null
    }
  }

  function handleAssetDragStart(event: DragEvent<HTMLElement>, asset: ElectronMediaPipelineAssetDescriptor) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(EDITING_ASSET_DRAG_TYPE, asset.id)
    event.dataTransfer.setData('text/plain', asset.label ?? asset.id)
  }

  function previewAssetForEditing(assetId: string) {
    setIsPlaying(false)
    setSelectedClipId('')
    setPreviewMode('asset')
    setPreviewAssetId(assetId)
    setAssetPreviewTimeMs(0)
    setAssetPreviewDurationMs(0)
  }

  function previewTimeline() {
    setIsPlaying(false)
    setPreviewMode('timeline')
  }

  function previewSelectedClip(clip: ElectronMediaPipelineClip) {
    setIsPlaying(false)
    setPreviewMode('clip')
    setPlayheadMs(clip.timelineStartMs)
  }

  function selectPreviewClip(clip: ElectronMediaPipelineClip) {
    setSelectedClipId(clip.id)
    setIsPlaying(false)
    if (previewMode === 'asset') setPreviewMode('timeline')
  }

  function updatePreviewClipTransform(
    clipId: string,
    patch: Pick<Partial<ElectronMediaPipelineClip>, 'xPercent' | 'yPercent'>,
    options: { commit?: boolean } = {},
  ) {
    if (!activeProject) return
    const result = updateClipTransformCommand(activeProject, clipId, patch)
    if (!result) return
    commitProjectChange(result.project, { selectedClipId: clipId, dirty: options.commit !== false })
  }

  function handleTrackDragOver(event: DragEvent<HTMLElement>, track: ElectronMediaPipelineEditingProject['timeline']['tracks'][number]) {
    if (!event.dataTransfer.types.includes(EDITING_ASSET_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    const assetId = event.dataTransfer.getData(EDITING_ASSET_DRAG_TYPE)
    const asset = assetId ? assetById.get(assetId) : undefined
    if (asset && !assetCanDropOnTrack(asset, track)) event.dataTransfer.dropEffect = 'none'
  }

  function handleTrackDrop(event: DragEvent<HTMLElement>, track: ElectronMediaPipelineEditingProject['timeline']['tracks'][number]) {
    if (!activeProject) return
    const assetId = event.dataTransfer.getData(EDITING_ASSET_DRAG_TYPE)
    const asset = assetById.get(assetId)
    if (!asset || !assetCanDropOnTrack(asset, track)) return
    event.preventDefault()
    event.stopPropagation()
    const timelineStartMs = timelineMsFromPointer(event.currentTarget, event.clientX, timelineVisibleStartMs, timelineVisibleDurationMs)
    const { project, clip } = addAssetClipToTrackCommand(activeProject, asset, track.id, timelineStartMs, playheadMs)
    commitProjectChange(project, { selectedClipId: clip.id, playheadMs: clip.timelineStartMs })
    setClipForm((current) => ({
      ...current,
      assetId: asset.id,
      trackId: track.id,
      timelineStartMs: String(timelineStartMs),
      durationMs: String(clip.durationMs),
    }))
  }

  function handleTracksDragOver(event: DragEvent<HTMLElement>) {
    if (!activeProject || activeProject.timeline.tracks.length > 0) return
    if (!event.dataTransfer.types.includes(EDITING_ASSET_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleTracksDrop(event: DragEvent<HTMLElement>) {
    if (!activeProject || activeProject.timeline.tracks.length > 0) return
    const assetId = event.dataTransfer.getData(EDITING_ASSET_DRAG_TYPE)
    const asset = assetById.get(assetId)
    if (!asset) return
    event.preventDefault()
    const { project, clip, track } = addAssetClipToCompatibleTrackCommand(activeProject, asset, playheadMs, playheadMs)
    commitProjectChange(project, { selectedClipId: clip.id, playheadMs: clip.timelineStartMs })
    setClipForm((current) => ({
      ...current,
      assetId: asset.id,
      trackId: track.id,
      timelineStartMs: String(clip.timelineStartMs),
      durationMs: String(clip.durationMs),
    }))
  }

  function handleTimelinePointer(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    setIsPlaying(false)
    const target = event.currentTarget
    const seekFromClientX = (clientX: number) => {
      setPlayheadMs(timelineMsFromPointer(target, clientX, timelineVisibleStartMs, timelineVisibleDurationMs))
    }
    seekFromClientX(event.clientX)

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      seekFromClientX(pointerEvent.clientX)
    }
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
  }

  function handleTimelineWheel(event: ReactWheelEvent<HTMLElement>) {
    if (!activeProject) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    const zoomFactor = Math.exp(-event.deltaY * 0.0018)
    const nextViewport = zoomTimelineViewportAtRatio(timelineViewport, ratio, zoomFactor)
    setTimelineZoom(nextViewport.zoom)
    setTimelineViewStartMs(nextViewport.visibleStartMs)
  }

  function togglePreviewPlayback() {
    if (!previewPlayable) return
    if (!isPlaying && previewMode !== 'asset' && playheadMs >= previewRange.endMs) {
      setPlayheadMs(previewRange.startMs)
    }
    if (!isPlaying && previewMode === 'asset' && assetPreviewDurationMs > 0 && assetPreviewTimeMs >= assetPreviewDurationMs) {
      setAssetPreviewTimeMs(0)
    }
    setIsPlaying((current) => !current)
  }

  function toggleTimelinePlaybackFromKeyboard() {
    setPreviewMode('timeline')
    if (!isPlaying && playheadMs >= timelineDurationMs) setPlayheadMs(0)
    setIsPlaying((current) => !current)
  }

  function handleClipEditPointerDown(
    event: ReactPointerEvent<HTMLElement>,
    track: ElectronMediaPipelineEditingProject['timeline']['tracks'][number],
    clip: ElectronMediaPipelineClip,
    mode: TimelineClipEditMode,
  ) {
    if (!activeProject || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setIsPlaying(false)
    setSelectedClipId(clip.id)
    const lane = event.currentTarget.closest('.editing-workspace-track-lane')
    if (!(lane instanceof HTMLElement)) return
    const rect = lane.getBoundingClientRect()
    if (rect.width <= 0) return
    const pointerPlayheadMs = timelineMsFromPointer(lane, event.clientX, timelineVisibleStartMs, timelineVisibleDurationMs)
    setPlayheadMs(pointerPlayheadMs)
    const startClientX = event.clientX
    const startClip = { ...clip }
    const startProject = activeProject
    const msPerPx = timelineVisibleDurationMs / rect.width
    let latestProject = activeProject
    let latestClip = clip
    let hasChangedClip = false

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const deltaMs = Math.round((pointerEvent.clientX - startClientX) * msPerPx)
      const targetTrack = mode === 'move'
        ? trackFromPointer(startProject, pointerEvent.clientX, pointerEvent.clientY, track)
        : track
      const targetTrackId = clipCanDropOnTrack(startClip, targetTrack) ? targetTrack.id : track.id
      if (deltaMs === 0 && targetTrackId === track.id) return
      const draftClip = draftClipFromPointerDelta(startClip, deltaMs, mode)
      const rippleTrimEnd = rippleEditingEnabled && mode === 'trim-end' && targetTrackId === track.id
      const nextClip = normalizeClipPlacement(startProject, targetTrackId, draftClip, startClip.id, mode, [pointerPlayheadMs], timelineSnapEnabled, {
        allowTrimEndThroughFollowingClips: rippleTrimEnd,
      })
      const draggedCenterMs = draftClip.timelineStartMs + draftClip.durationMs / 2
      hasChangedClip = true
      const reorderResult = mode === 'move' && targetTrackId === track.id
        ? reorderClipWithinTrackByMidpoint(startProject, track.id, startClip.id, draggedCenterMs)
        : undefined
      latestClip = reorderResult?.clip ?? nextClip
      latestProject = rippleTrimEnd
        ? applyRippleTrimEndToTrack(startProject, track.id, startClip.id, startClip, nextClip)
        : reorderResult?.project ?? moveClipToTrack(startProject, track.id, targetTrackId, startClip.id, nextClip)
      if (linkedSelectionEnabled && mode === 'move') {
        latestProject = applyLinkedClipMoveToProject(latestProject, startClip.id, latestClip.timelineStartMs - startClip.timelineStartMs)
      } else if (linkedSelectionEnabled && (mode === 'trim-start' || mode === 'trim-end')) {
        latestProject = applyLinkedClipTrimToProject(latestProject, startClip.id, startClip, latestClip)
      }
      setActiveEditingProject(refreshTimelineDuration(latestProject))
      setPlayheadMs(latestClip.timelineStartMs)
    }
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      if (!hasChangedClip) return
      commitProjectChange(latestProject, { selectedClipId: latestClip.id, playheadMs: latestClip.timelineStartMs })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
  }

  function splitClipAtTimelineTime(
    track: TimelineTrack,
    clip: ElectronMediaPipelineClip,
    splitAtMs: number,
  ) {
    if (!activeProject || track.locked) return
    const result = splitClipAtPlayheadCommand(activeProject, { trackId: track.id, clip }, splitAtMs)
    if (!result) return
    setIsPlaying(false)
    setPreviewMode('clip')
    commitProjectChange(result.project, { selectedClipId: result.right.id, playheadMs: result.right.timelineStartMs })
  }

  return (
    <AppContentLayout
      variant="workspace"
      width="full"
      padding="none"
      scroll="hidden"
      contentClassName="editing-workspace"
      className="editing-workspace-layout"
    >
      <section className="editing-workspace-shell" style={layoutStyle}>
        <section className="editing-workspace-main" aria-label="剪辑内容区">
          <AssetLibraryPanel
            activeProject={activeProject}
            canOpenFile={Boolean(mediaAPI?.openFile)}
            resizeHandleProps={libraryResize.resizeHandleProps}
            onAddLocalAsset={() => void addLocalAssetFromDialog()}
            onAssetDragStart={handleAssetDragStart}
            onClipFormChange={setClipForm}
            onExtractAudio={extractAudioFromAsset}
            onPreviewAsset={previewAssetForEditing}
            onRemoveAsset={removeAsset}
            onRevealAssetInFolder={(asset) => void revealAssetInFolder(asset)}
          />

          <main className="editing-workspace-preview" aria-label="剪辑预览">
            <EditingPreviewPlayer
              activeProject={activeProject}
              asset={previewAsset}
              clip={previewMode === 'clip' ? clipPreviewClip : timelinePreviewProjection.primaryVisualClip}
              currentMs={previewCurrentMs}
              durationMs={previewDurationMs}
              isPlaying={isPlaying}
              mode={previewMode}
              onAssetDurationChange={setAssetPreviewDurationMs}
              onAssetEnded={() => setIsPlaying(false)}
              onAssetTimeChange={setAssetPreviewTimeMs}
              onApplyCanvasPreset={applyCanvasPreset}
              onPreviewClipTransformChange={updatePreviewClipTransform}
              onSelectClip={selectPreviewClip}
              onTogglePlayback={togglePreviewPlayback}
              playable={previewPlayable}
              selectedClipId={selectedClipId}
              timelineProjection={timelinePreviewProjection}
              timelineClip={timelinePreviewProjection.primaryVisualClip ?? activePreviewClip}
            />
          </main>

          <InspectorPanel
            resizeHandleProps={inspectorResize.resizeHandleProps}
            selectedAsset={selectedAsset}
            selectedClip={selectedClip}
            onDetachSelectedClipAudio={detachSelectedClipAudio}
            onUpdateSelectedClip={updateSelectedClip}
          />
        </section>

        <TimelinePanel
          activeProject={activeProject}
          linkedSelectionEnabled={linkedSelectionEnabled}
          playheadMs={playheadMs}
          playheadPercent={playheadPercent}
          resizeHandleProps={timelineResize.resizeHandleProps}
          rippleEditingEnabled={rippleEditingEnabled}
          selectedClipId={selectedClipId}
          linkedSelectedClipIds={linkedSelectedClipIds}
          snapEnabled={timelineSnapEnabled}
          timelineTool={timelineTool}
          timelineViewport={timelineViewport}
          onAddTrack={addTimelineTrack}
          onClipEditPointerDown={handleClipEditPointerDown}
          onDeleteTrack={deleteTimelineTrack}
          onMoveTrack={moveTimelineTrack}
          onSelectClip={(clip) => {
            setSelectedClipId(clip.id)
            setIsPlaying(false)
          }}
          onSplitClipAt={splitClipAtTimelineTime}
          onTimelinePointer={handleTimelinePointer}
          onTimelineToolChange={setTimelineTool}
          onTimelineWheel={handleTimelineWheel}
          onToggleLinkedSelection={() => setLinkedSelectionEnabled((current) => !current)}
          onToggleRippleEditing={() => setRippleEditingEnabled((current) => !current)}
          onToggleSnap={() => setTimelineSnapEnabled((current) => !current)}
          onToggleTrackLocked={toggleTimelineTrackLocked}
          onToggleTrackMuted={toggleTimelineTrackMuted}
          onTrackDragOver={handleTrackDragOver}
          onTrackDrop={handleTrackDrop}
          onTracksDragOver={handleTracksDragOver}
          onTracksDrop={handleTracksDrop}
        />
        <EditingExportDialog
          dialog={exportDialog}
          project={activeProject}
          task={currentExportTask}
          onConfirm={() => void confirmExportTask()}
          onDialogChange={(patch) => setExportDialog((current) => ({ ...current, ...patch }))}
          onOpenChange={(open) => setExportDialog((current) => ({ ...current, open }))}
          onUpdate={updateExportDialog}
        />
      </section>
    </AppContentLayout>
  )
}

function EditingExportDialog({
  dialog,
  project,
  task,
  onConfirm,
  onDialogChange,
  onOpenChange,
  onUpdate,
}: {
  dialog: EditingExportDialogState
  project: ElectronMediaPipelineEditingProject | null
  task: ElectronMediaPipelineTaskState | null
  onConfirm: () => void
  onDialogChange: (patch: Partial<EditingExportDialogState>) => void
  onOpenChange: (open: boolean) => void
  onUpdate: (patch: Partial<Pick<EditingExportDialogState, 'format' | 'filename'>>) => void
}) {
  const progress = clampNumber(task?.progressPercent ?? (dialog.phase === 'progress' ? 3 : 0), 0, 100, 0)
  const terminalStatus = task?.status === 'succeeded' || task?.status === 'failed' || task?.status === 'canceled'
  const succeeded = task?.status === 'succeeded'
  const failed = task?.status === 'failed' || task?.status === 'canceled' || Boolean(dialog.errorMessage && !task)
  const errorDetail = dialog.phase === 'result' && failed ? taskStatusDetail(task, dialog) : ''
  const [copiedError, setCopiedError] = useState(false)
  const title = dialog.phase === 'settings'
    ? '导出设置'
    : dialog.phase === 'progress'
      ? '正在导出'
      : succeeded
        ? '导出成功'
        : '导出失败'
  useEffect(() => {
    setCopiedError(false)
  }, [errorDetail])

  const copyExportError = () => {
    if (!errorDetail) return
    void copyTextToClipboard(errorDetail)
      .then(() => {
        setCopiedError(true)
        toast.success('已复制错误信息')
      })
      .catch((error) => {
        toast.error('复制失败', error instanceof Error ? error.message : String(error))
      })
  }

  return (
    <Dialog open={dialog.open} onOpenChange={onOpenChange}>
      <DialogContent className="editing-workspace-export-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {dialog.phase === 'settings'
              ? '确认导出格式和文件名后开始创建导出任务。'
              : dialog.phase === 'progress'
                ? '导出任务正在运行，进度会随任务状态自动更新。'
                : succeeded
                  ? '导出任务已完成。'
                  : '导出任务没有完成，请查看失败信息。'}
          </DialogDescription>
        </DialogHeader>

        {dialog.phase === 'settings' ? (
          <div className="editing-workspace-export-form">
            <label>
              <span>导出格式</span>
              <select
                value={dialog.format}
                className="editing-workspace-select"
                onChange={(event) => onUpdate({ format: event.target.value as EditingExportFormat })}
              >
                <option value="mp4">MP4 文件</option>
                <option value="hls">HLS 预览</option>
              </select>
            </label>
            <label>
              <span>文件名</span>
              <Input
                value={dialog.filename}
                onChange={(event) => onUpdate({ filename: event.target.value })}
                className="h-8"
              />
            </label>
            <dl className="editing-workspace-export-summary">
              <div>
                <dt>画面</dt>
                <dd>{project ? `${project.timeline.width} x ${project.timeline.height}` : '-'}</dd>
              </div>
              <div>
                <dt>帧率</dt>
                <dd>{project?.timeline.fps ?? '-'}</dd>
              </div>
              <div>
                <dt>时长</dt>
                <dd>{formatDuration(project?.timeline.durationMs ?? 0)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="editing-workspace-export-progress">
            <div className="editing-workspace-export-status" data-status={succeeded ? 'success' : failed ? 'error' : 'running'}>
              {dialog.phase === 'progress' ? <Loader2 size={18} className="animate-spin" /> : succeeded ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <div>
                <strong>{taskStatusTitle(task, dialog)}</strong>
                <span>{taskStatusDetail(task, dialog)}</span>
              </div>
            </div>
            {errorDetail ? (
              <div className="editing-workspace-export-error-detail">
                <div className="editing-workspace-export-error-detail__header">
                  <span>错误信息</span>
                  <Button type="button" size="sm" variant="outline" className="gap-2" onClick={copyExportError}>
                    <Copy size={13} />
                    {copiedError ? '已复制' : '复制'}
                  </Button>
                </div>
                <pre>{errorDetail}</pre>
              </div>
            ) : null}
            {!terminalStatus && !failed ? <Progress value={progress} /> : null}
            <dl className="editing-workspace-export-summary">
              <div>
                <dt>任务</dt>
                <dd>{task?.taskId ?? dialog.taskId ?? '创建中'}</dd>
              </div>
              <div>
                <dt>输出</dt>
                <dd title={taskOutputLabel(task, dialog)}>{taskOutputLabel(task, dialog)}</dd>
              </div>
            </dl>
          </div>
        )}

        <DialogFooter>
          {dialog.phase === 'settings' ? (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
              <Button type="button" onClick={onConfirm}>确认导出</Button>
            </>
          ) : dialog.phase === 'progress' ? (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>后台运行</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onDialogChange({ phase: 'settings', taskId: undefined, errorMessage: undefined })}>
                再次导出
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>关闭</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function defaultExportFilename(title: string, format: EditingExportFormat) {
  return `${safeFileStem(title)}.${exportFileExtension(format)}`
}

function normalizeExportFilename(filename: string, title: string, format: EditingExportFormat) {
  const fallback = defaultExportFilename(title, format)
  const trimmed = filename.trim()
  if (!trimmed) return fallback
  const extension = exportFileExtension(format)
  return trimmed.toLowerCase().endsWith(`.${extension}`) ? trimmed : `${trimmed}.${extension}`
}

function exportFileExtension(format: EditingExportFormat) {
  return format === 'hls' ? 'm3u8' : 'mp4'
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.append(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) throw new Error('浏览器拒绝复制请求')
  } finally {
    textarea.remove()
  }
}

function taskStatusTitle(task: ElectronMediaPipelineTaskState | null, dialog: EditingExportDialogState) {
  if (dialog.errorMessage && !task) return '任务创建失败'
  if (!task) return '正在创建任务'
  if (task.status === 'succeeded') return '任务完成'
  if (task.status === 'failed') return '任务失败'
  if (task.status === 'canceled') return '任务已取消'
  return `${Math.round(clampNumber(task.progressPercent, 0, 100, 0))}%`
}

function taskStatusDetail(task: ElectronMediaPipelineTaskState | null, dialog: EditingExportDialogState) {
  if (dialog.errorMessage) return dialog.errorMessage
  if (!task) return '正在保存项目并提交导出任务'
  return task.errorMessage ?? task.currentStep ?? task.status
}

function taskOutputLabel(task: ElectronMediaPipelineTaskState | null, dialog: EditingExportDialogState) {
  return task?.outputPath
    ?? task?.hlsManifestPath
    ?? task?.hls_manifest_path
    ?? task?.hlsManifestUrl
    ?? task?.hls_manifest_url
    ?? task?.outputName
    ?? dialog.filename
    ?? '-'
}
