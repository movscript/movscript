import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useParams } from 'react-router-dom'
import { AppContentLayout } from '@movscript/ui/layout'

import { readMediaAPI } from '@/features/editing/application/browser'
import { useEditingExportController } from '@/features/editing/application/useEditingExportController'
import { useEditingHeaderStore } from '@/features/editing/application/editingHeaderStore'
import { useEditingPreviewController } from '@/features/editing/application/useEditingPreviewController'
import { useEditingProjectPersistence } from '@/features/editing/application/useEditingProjectPersistence'
import { useEditingTimelineController } from '@/features/editing/application/useEditingTimelineController'
import { useEditingSessionStore } from '@/features/editing/application/editingSessionStore'
import {
  addClipFromFormCommand,
  addLocalAssetCommand,
  detachClipAudioCommand,
  extractAudioAssetCommand,
  removeAssetCommand,
  trackIdForAssetType,
  updateClipCommand,
  updateClipTransformCommand,
  updateProjectCanvasCommand,
} from '@/features/editing/application/editingCommands'
import { useEditingTaskStates } from '@/features/editing/application/useEditingTaskStates'
import { useEditingWorkspaceLayout } from '@/features/editing/application/useEditingWorkspaceLayout'
import { AssetLibraryPanel } from '@/features/editing/components/AssetLibraryPanel'
import { EditingExportDialog } from '@/features/editing/components/EditingExportDialog'
import { EditingPreviewPlayer } from '@/features/editing/components/EditingPreviewPlayer'
import { InspectorPanel } from '@/features/editing/components/InspectorPanel'
import { TimelinePanel } from '@/features/editing/components/TimelinePanel'
import {
  EDITING_ASSET_DRAG_TYPE,
  EDITING_CANVAS_PRESETS,
  STANDALONE_EDITING_PROJECT_ID,
} from '@/features/editing/domain/constants'
import { createLocalAsset } from '@/features/editing/domain/assets'
import {
  emptyClipForm,
  type ClipForm,
} from '@/features/editing/domain/types'
import { probeLocalMediaAsset } from '@/features/editing/media/localMedia'
import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'
import { toast } from '@/shared/ui/toastStore'
import './EditingWorkspacePage.css'

export default function EditingWorkspacePage() {
  const { editingProjectId } = useParams<{ editingProjectId: string }>()
  const [clipForm, setClipForm] = useState<ClipForm>(emptyClipForm)
  const resetTimelineViewStateRef = useRef<() => void>(() => {})
  const mediaAPI = readMediaAPI()
  const canCreateTask = Boolean(mediaAPI?.createMediaPipelineTask)
  const activeProject = useEditingSessionStore((state) => state.activeProject)
  const selectedClipId = useEditingSessionStore((state) => state.selectedClipId)
  const playheadMs = useEditingSessionStore((state) => state.playheadMs)
  const saveState = useEditingSessionStore((state) => state.saveState)
  const setSelectedClipId = useEditingSessionStore((state) => state.setSelectedClipId)
  const setPlayheadMs = useEditingSessionStore((state) => state.setPlayheadMs)
  const setSaveState = useEditingSessionStore((state) => state.setSaveState)
  const { taskStates, upsertTaskState: upsertEditingTaskState } = useEditingTaskStates(mediaAPI, STANDALONE_EDITING_PROJECT_ID)
  const { inspectorResize, layoutStyle, libraryResize, timelineResize } = useEditingWorkspaceLayout()
  const setEditingHeader = useEditingHeaderStore((s) => s.setHeader)
  const resetEditingHeader = useEditingHeaderStore((s) => s.reset)

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
  const timelineDurationMs = Math.max(activeProject?.timeline.durationMs ?? 0, playheadMs, 10000)

  const {
    activePreviewClip,
    clearRemovedAssetPreview,
    clipPreviewClip,
    isPlaying,
    previewAsset,
    previewAssetForEditing,
    previewCurrentMs,
    previewDurationMs,
    previewMode,
    previewPlayable,
    previewSelectedClip,
    resetPreviewState,
    selectPreviewClip,
    selectedAsset,
    setAssetPreviewDurationMs,
    setAssetPreviewTimeMs,
    stopPreviewPlayback,
    timelinePreviewProjection,
    togglePreviewPlayback,
    toggleTimelinePlaybackFromKeyboard,
  } = useEditingPreviewController({
    activeProject,
    assetById,
    playheadMs,
    selectedClip,
    selectedClipId,
    setPlayheadMs,
    setSelectedClipId,
    timelineDurationMs,
  })

  const resetWorkspaceViewState = useCallback(() => {
    setSelectedClipId('')
    setPlayheadMs(0)
    resetTimelineViewStateRef.current()
    resetPreviewState()
  }, [resetPreviewState, setPlayheadMs, setSelectedClipId])
  const { commitProjectChange, saveProject, setActiveEditingProject } = useEditingProjectPersistence({
    editingProjectId,
    mediaAPI,
    resetWorkspaceViewState,
  })
  const {
    confirmExportTask,
    currentExportTask,
    exportDialog,
    openExportDialog,
    setExportDialog,
    updateExportDialog,
  } = useEditingExportController({
    activeProject,
    mediaAPI,
    saveProject,
    setSaveState,
    taskStates,
    upsertEditingTaskState,
  })
  const timelineController = useEditingTimelineController({
    activeProject,
    assetById,
    commitProjectChange,
    playheadMs,
    previewSelectedClip,
    selectedClip,
    selectedClipId,
    setActiveEditingProject,
    setClipForm,
    setPlayheadMs,
    setSelectedClipId,
    stopPreviewPlayback,
    timelineDurationMs,
    toggleTimelinePlaybackFromKeyboard,
  })
  resetTimelineViewStateRef.current = timelineController.resetTimelineViewState

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
  }, [activeProject, canCreateTask, openExportDialog, saveProject, saveState.status, setEditingHeader])

  useEffect(() => {
    return () => resetEditingHeader()
  }, [resetEditingHeader])

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
    clearRemovedAssetPreview(assetId)
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

  function handleAssetDragStart(event: DragEvent<HTMLElement>, asset: ElectronMediaPipelineAssetDescriptor) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(EDITING_ASSET_DRAG_TYPE, asset.id)
    event.dataTransfer.setData('text/plain', asset.label ?? asset.id)
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
              onAssetEnded={stopPreviewPlayback}
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
          linkedSelectionEnabled={timelineController.linkedSelectionEnabled}
          playheadMs={playheadMs}
          playheadPercent={timelineController.playheadPercent}
          resizeHandleProps={timelineResize.resizeHandleProps}
          rippleEditingEnabled={timelineController.rippleEditingEnabled}
          selectedClipId={selectedClipId}
          linkedSelectedClipIds={timelineController.linkedSelectedClipIds}
          snapEnabled={timelineController.snapEnabled}
          timelineTool={timelineController.timelineTool}
          timelineViewport={timelineController.timelineViewport}
          onAddTrack={timelineController.onAddTrack}
          onClipEditPointerDown={timelineController.onClipEditPointerDown}
          onDeleteTrack={timelineController.onDeleteTrack}
          onMoveTrack={timelineController.onMoveTrack}
          onSelectClip={timelineController.onSelectClip}
          onSplitClipAt={timelineController.onSplitClipAt}
          onTimelinePointer={timelineController.onTimelinePointer}
          onTimelineToolChange={timelineController.onTimelineToolChange}
          onTimelineWheel={timelineController.onTimelineWheel}
          onToggleLinkedSelection={timelineController.onToggleLinkedSelection}
          onToggleRippleEditing={timelineController.onToggleRippleEditing}
          onToggleSnap={timelineController.onToggleSnap}
          onToggleTrackLocked={timelineController.onToggleTrackLocked}
          onToggleTrackMuted={timelineController.onToggleTrackMuted}
          onTrackDragOver={timelineController.onTrackDragOver}
          onTrackDrop={timelineController.onTrackDrop}
          onTracksDragOver={timelineController.onTracksDragOver}
          onTracksDrop={timelineController.onTracksDrop}
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
