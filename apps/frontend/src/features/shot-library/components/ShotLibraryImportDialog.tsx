import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle2, Film, FolderOpen, Loader2, Pause, Play, Save, Scissors, Upload } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  StatusBadge,
  cn,
} from '@movscript/ui/primitives'
import { ResourceVideo } from '@/shared/ui/ResourceVideo'
import { UrlImage } from '@/shared/ui/UrlMedia'
import type { RawResource } from '@/types'
import type { ShotLibrarySource } from '@/features/shot-library/domain/shotReferenceLibrary'
import {
  formatClipProgress,
  formatWorkspaceRange,
  importPhaseLabel,
  importProgressLabel,
  isWorkspaceSelected,
  optionalNumber,
  workspaceRangeDuration,
  type ShotImportSession,
  type ShotImportWorkspace,
  type ShotLibraryGroupOption,
  type ShotManualWorkspace,
  type ShotTagSuggestions,
} from '@/features/shot-library/domain/shotLibraryWorkspaceModel'
import { calculateShotWorkspaceGridMetrics } from '@/features/shot-library/domain/shotLibraryLayout'
import { subscribeShotLibraryMeasuredBox } from '@/features/shot-library/presentation/shotLibraryMeasurement'
import { ShotImportResourceGrid, ShotImportWorkspaceEditor } from '@/features/shot-library/components/ShotLibraryImportDialogSections'
import { normalizedCssAspectRatio, seekVideoToTime, videoElementAspectRatio } from '@/features/shot-library/components/shotLibraryVideoPreview'

export function ShotImportDialog({
  open,
  session,
  uploadSource,
  groupOptions,
  tagSuggestions,
  resources,
  selectedResource,
  resourceSearch,
  resourcePage,
  resourcePageCount,
  resourceTotal,
  isResourceLoading,
  isSaving,
  onOpenChange,
  onChooseFile,
  onResourceSearch,
  onResourcePage,
  onSelectResource,
  onClearResource,
  onSelectWorkspace,
  onToggleWorkspace,
  onUpdateWorkspace,
  onTargetGroup,
  onTargetGroupTitle,
  onConfirm,
}: {
  open: boolean
  session: ShotImportSession | null
  uploadSource?: ShotLibrarySource
  groupOptions: ShotLibraryGroupOption[]
  tagSuggestions: ShotTagSuggestions
  resources: RawResource[]
  selectedResource: RawResource | null
  resourceSearch: string
  resourcePage: number
  resourcePageCount: number
  resourceTotal: number
  isResourceLoading: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onChooseFile: () => void
  onResourceSearch: (value: string) => void
  onResourcePage: (value: number) => void
  onSelectResource: (resource: RawResource) => void
  onClearResource: () => void
  onSelectWorkspace: (workspaceId: string) => void
  onToggleWorkspace: (workspaceId: string, selected: boolean) => void
  onUpdateWorkspace: (workspaceId: string, patch: Partial<ShotManualWorkspace>) => void
  onTargetGroup: (groupId: number | undefined) => void
  onTargetGroupTitle: (title: string) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const activeWorkspace = session?.workspaces.find(workspace => workspace.id === session.activeWorkspaceId) ?? session?.workspaces[0]
  const canConfirm = Boolean(uploadSource && session?.phase === 'review' && session.workspaces.some(isWorkspaceSelected))
  const workspaceGridRef = useRef<HTMLDivElement | null>(null)
  const [workspacePage, setWorkspacePage] = useState(0)
  const workspaceGridMetrics = useShotWorkspaceGridMetrics(workspaceGridRef, session?.workspaces.length ?? 0)
  const previewAspectRatio = normalizedCssAspectRatio(session?.metadata.width ?? 0, session?.metadata.height ?? 0) ?? '16 / 9'
  const workspaceGridStyle = useMemo(() => ({
    '--shot-import-workspace-columns': String(workspaceGridMetrics.columns),
  }) as CSSProperties, [workspaceGridMetrics.columns])
  const workspaces = session?.workspaces ?? []
  const workspacePageSize = Math.max(4, workspaceGridMetrics.pageSize)
  const workspacePageCount = Math.max(1, Math.ceil(workspaces.length / workspacePageSize))
  const normalizedWorkspacePage = Math.min(workspacePage, workspacePageCount - 1)
  const pagedWorkspaces = workspaces.slice(normalizedWorkspacePage * workspacePageSize, normalizedWorkspacePage * workspacePageSize + workspacePageSize)

  useEffect(() => {
    setWorkspacePage(current => Math.min(current, Math.max(0, workspacePageCount - 1)))
  }, [workspacePageCount])

  useEffect(() => {
    if (!activeWorkspace) return
    const activeIndex = workspaces.findIndex(workspace => workspace.id === activeWorkspace.id)
    if (activeIndex < 0) return
    const activePage = Math.floor(activeIndex / workspacePageSize)
    setWorkspacePage(activePage)
  }, [activeWorkspace?.id, workspacePageSize, workspaces])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}>
      <DialogContent className="shot-import-dialog">
        <DialogHeader className="shot-import-dialog__header">
          <div className="shot-import-dialog__title-row">
            <DialogTitle>{t('pages.shotLibrary.importDialogTitle')}</DialogTitle>
            {session ? <span title={session.sourceName}>{session.sourceName}</span> : null}
          </div>
          {session ? null : (
            <DialogDescription>
              {t('pages.shotLibrary.importDialogDescription')}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="shot-import-dialog__body" data-scroll-owner="dialog-body">
          <aside className="shot-import-dialog__source-pane">
            <div className="shot-import-dialog__source-actions">
              <Button type="button" size="sm" variant="outline" onClick={onChooseFile} disabled={isSaving}>
                <Upload size={14} />
                {t('pages.shotLibrary.chooseLocalVideo')}
              </Button>
              <div className="shot-import-dialog__source-target">
                <span>{t('pages.shotLibrary.importTarget')}</span>
                <strong>{uploadSource?.name ?? t('pages.shotLibrary.noWritableSource')}</strong>
              </div>
            </div>
            <ShotImportResourceGrid
              resources={resources}
              selectedResource={selectedResource}
              search={resourceSearch}
              page={resourcePage}
              pageCount={resourcePageCount}
              total={resourceTotal}
              isLoading={isResourceLoading}
              onSearch={onResourceSearch}
              onPage={onResourcePage}
              onSelect={onSelectResource}
              onClear={onClearResource}
              disabled={isSaving}
            />
            {session ? (
              <div className="shot-import-dialog__group-editor">
                <label className="shot-library-manual-form__field">
                  <span>{t('pages.shotLibrary.targetGroup')}</span>
                  <select
                    value={session.targetGroupId ?? ''}
                    onChange={event => onTargetGroup(event.target.value ? Number(event.target.value) : undefined)}
                    disabled={isSaving}
                  >
                    <option value="">{t('pages.shotLibrary.createNewGroup')}</option>
                    {groupOptions.map(group => (
                      <option key={group.id} value={group.id}>{group.title}</option>
                    ))}
                  </select>
                </label>
                {session.targetGroupId ? null : (
                  <label className="shot-import-dialog__group-name">
                    <FolderOpen size={14} />
                    <Input
                      value={session.targetGroupTitle ?? ''}
                      disabled={isSaving}
                      placeholder={t('pages.shotLibrary.newGroupNamePlaceholder')}
                      aria-label={t('pages.shotLibrary.newGroupName')}
                      onChange={event => onTargetGroupTitle(event.target.value)}
                    />
                  </label>
                )}
              </div>
            ) : null}
          </aside>

          <section className="shot-import-dialog__review-pane">
            {session ? (
              <>
                <div
                  className="shot-import-dialog__preview"
                  style={{ '--shot-import-preview-aspect-ratio': previewAspectRatio } as CSSProperties}
                >
                  <ShotWorkspaceClipPlayer resource={session.sourceResource} workspace={activeWorkspace} />
                </div>
                <div className="shot-import-dialog__status-row">
                  <StatusBadge intent={session.phase === 'review' ? 'success' : session.error ? 'danger' : 'info'} emphasis="soft">
                    {importPhaseLabel(session.phase, t)}
                  </StatusBadge>
                  <span>{importProgressLabel(session, t)}</span>
                </div>
                {session.error ? (
                  <div className="shot-import-dialog__error">
                    <AlertCircle size={14} />
                    <span>{session.error}</span>
                  </div>
                ) : null}
                <div className="shot-import-dialog__workspace-layout">
                  <div className="shot-import-dialog__workspace-browser">
                    <div ref={workspaceGridRef} className="shot-import-dialog__workspace-grid" style={workspaceGridStyle}>
                    {session.workspaces.length === 0 ? (
                      <div className="shot-import-dialog__empty">
                        {session.phase === 'preparing' ? <Loader2 size={16} /> : <Scissors size={16} />}
                        <span>{session.phase === 'preparing' ? t('pages.shotLibrary.readingSource') : t('pages.shotLibrary.cuttingShots')}</span>
                      </div>
                    ) : pagedWorkspaces.map(workspace => (
                      <button
                        key={workspace.id}
                        type="button"
                        className={cn('shot-import-dialog__workspace-card', activeWorkspace?.id === workspace.id && 'shot-import-dialog__workspace-card--active')}
                        onClick={() => onSelectWorkspace(workspace.id)}
                      >
                        <span
                          className="shot-import-dialog__workspace-thumb"
                          style={{ '--shot-import-workspace-aspect-ratio': previewAspectRatio } as CSSProperties}
                        >
                          {workspace.thumbnailUrl ? <UrlImage src={workspace.thumbnailUrl} alt="" /> : <Film size={18} />}
                          <span>{formatWorkspaceRange(workspace)}</span>
                        </span>
                        <span className="shot-import-dialog__workspace-card-body">
                          <span className="shot-import-dialog__workspace-card-topline">
                            <span>{String(workspace.order).padStart(2, '0')}</span>
                            {workspace.status === 'ready' ? <CheckCircle2 size={14} /> : <Loader2 size={14} />}
                          </span>
                          <strong>{workspace.title}</strong>
                        </span>
                        <span className="shot-import-dialog__workspace-include" onClick={event => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isWorkspaceSelected(workspace)}
                            disabled={isSaving}
                            onChange={event => onToggleWorkspace(workspace.id, event.currentTarget.checked)}
                            aria-label={t('pages.shotLibrary.includeShot')}
                          />
                        </span>
                      </button>
                    ))}
                    </div>
                    {workspaces.length > workspacePageSize ? (
                      <div className="shot-import-dialog__workspace-pager">
                        <span>{t('pages.shotLibrary.storyboardPageStatus', { page: normalizedWorkspacePage + 1, total: workspacePageCount })}</span>
                        <div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={normalizedWorkspacePage <= 0}
                            onClick={() => setWorkspacePage(page => Math.max(0, page - 1))}
                          >
                            {t('pages.resources.previousPage')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={normalizedWorkspacePage >= workspacePageCount - 1}
                            onClick={() => setWorkspacePage(page => Math.min(workspacePageCount - 1, page + 1))}
                          >
                            {t('pages.resources.nextPage')}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {activeWorkspace ? (
                    <ShotImportWorkspaceEditor
                      workspace={activeWorkspace}
                      disabled={isSaving}
                      tagSuggestions={tagSuggestions}
                      onChange={(patch) => onUpdateWorkspace(activeWorkspace.id, patch)}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <div className="shot-import-dialog__starter">
                <FolderOpen size={20} />
                <span>{t('pages.shotLibrary.importStarter')}</span>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="shot-import-dialog__footer">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!canConfirm || isSaving} loading={isSaving}>
            <Save size={14} />
            {t('pages.shotLibrary.confirmImport')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ShotWorkspaceClipPlayer({
  resource,
  workspace,
  onAspectRatio,
}: {
  resource: RawResource
  workspace?: ShotImportWorkspace
  onAspectRatio?: (aspectRatio: string) => void
}) {
  const { t, i18n } = useTranslation()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState(false)
  const startSec = workspace ? optionalNumber(workspace.startSec) ?? 0 : 0
  const endSec = workspace ? optionalNumber(workspace.endSec) : undefined
  const previewKey = `${resource.ID}:${workspace?.id ?? 'source'}:${startSec}:${endSec ?? ''}`
  const clipDuration = workspaceRangeDuration(workspace)

  const seekToStart = (video: HTMLVideoElement) => {
    if (!Number.isFinite(startSec)) return
    seekVideoToTime(video, startSec)
    updateClipProgress(video)
  }

  const withinWorkspaceRange = (video: HTMLVideoElement) => {
    if (video.currentTime < startSec - 0.15) return false
    if (endSec !== undefined && video.currentTime >= endSec) return false
    return true
  }

  const currentClipDuration = (video: HTMLVideoElement) => {
    if (endSec !== undefined) return Math.max(0.1, endSec - startSec)
    const duration = Number.isFinite(video.duration) ? video.duration : undefined
    return duration === undefined ? clipDuration : Math.max(0.1, duration - startSec)
  }

  const updateClipProgress = (video: HTMLVideoElement) => {
    const duration = currentClipDuration(video)
    const elapsed = Math.max(0, Math.min(duration, video.currentTime - startSec))
    setProgress(duration > 0 ? elapsed / duration : 0)
  }

  useEffect(() => {
    setPlaying(false)
    setProgress(0)
    setReady(false)
  }, [previewKey])

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video || !ready) return
    if (playing) {
      video.pause()
      return
    }
    if (!withinWorkspaceRange(video)) seekToStart(video)
    await video.play().catch(() => setPlaying(false))
  }

  const seekClipProgress = (nextProgress: number) => {
    const video = videoRef.current
    if (!video) return
    const duration = currentClipDuration(video)
    video.currentTime = startSec + duration * nextProgress
    setProgress(nextProgress)
  }

  return (
    <div className="shot-import-clip-player">
      <ResourceVideo
        ref={videoRef}
        key={previewKey}
        className="shot-import-dialog__preview-video"
        resource={resource}
        playsInline
        preload="metadata"
        diagnosticLabel={`shot-import:${resource.ID}:${workspace?.id ?? 'source'}`}
        onLoadedMetadata={event => {
          setReady(true)
          const aspectRatio = videoElementAspectRatio(event.currentTarget)
          if (aspectRatio) onAspectRatio?.(aspectRatio)
          seekToStart(event.currentTarget)
        }}
        onPlay={event => {
          setPlaying(true)
          if (!withinWorkspaceRange(event.currentTarget)) seekToStart(event.currentTarget)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={event => {
          const video = event.currentTarget
          if (endSec !== undefined && video.currentTime >= endSec) {
            video.pause()
            seekToStart(video)
            return
          }
          updateClipProgress(video)
        }}
      />
      <div className="shot-import-clip-player__controls">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          onClick={togglePlayback}
          disabled={!ready || !workspace}
          aria-label={playing ? t('pages.shotLibrary.pauseShot') : t('pages.shotLibrary.playShot')}
          title={playing ? t('pages.shotLibrary.pauseShot') : t('pages.shotLibrary.playShot')}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </Button>
        <input
          type="range"
          min="0"
          max="1000"
          value={Math.round(progress * 1000)}
          disabled={!ready || !workspace}
          onChange={event => seekClipProgress(Number(event.currentTarget.value) / 1000)}
          aria-label={t('pages.shotLibrary.clipProgress')}
        />
        <span>{formatClipProgress(progress, clipDuration, i18n.language)}</span>
      </div>
    </div>
  )
}

function useShotWorkspaceGridMetrics(gridRef: RefObject<HTMLElement>, workspaceCount: number): { columns: number; pageSize: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    return subscribeShotLibraryMeasuredBox(gridRef.current, setSize)
  }, [gridRef])

  return calculateShotWorkspaceGridMetrics(size, workspaceCount)
}
