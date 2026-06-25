import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Film, Loader2, Scissors } from 'lucide-react'
import { Button, cn } from '@movscript/ui/primitives'
import { UrlImage } from '@movscript/resource-surface/resource-media-components'
import {
  formatWorkspaceRange,
  isWorkspaceSelected,
  type ShotImportSession,
  type ShotImportWorkspace,
  type ShotManualWorkspace,
  type ShotTagSuggestions,
} from '../domain/shotLibraryWorkspaceModel'
import { calculateShotWorkspaceGridMetrics } from '../domain/shotLibraryLayout'
import { subscribeShotLibraryMeasuredBox } from '../presentation/shotLibraryMeasurement'
import { ShotImportWorkspaceEditor } from './ShotLibraryImportDialogSections'
import { ShotWorkspaceClipPlayer } from './ShotLibraryImportClipPlayer'

export function ShotImportWorkspaceBrowser({
  session,
  activeWorkspace,
  previewAspectRatio,
  isSaving,
  tagSuggestions,
  onSelectWorkspace,
  onToggleWorkspace,
  onUpdateWorkspace,
  children,
}: {
  session: ShotImportSession
  activeWorkspace?: ShotImportWorkspace
  previewAspectRatio: string
  isSaving: boolean
  tagSuggestions: ShotTagSuggestions
  onSelectWorkspace: (workspaceId: string) => void
  onToggleWorkspace: (workspaceId: string, selected: boolean) => void
  onUpdateWorkspace: (workspaceId: string, patch: Partial<ShotManualWorkspace>) => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const workspaceGridRef = useRef<HTMLDivElement | null>(null)
  const [workspacePage, setWorkspacePage] = useState(0)
  const workspaces = session.workspaces
  const workspaceGridMetrics = useShotWorkspaceGridMetrics(workspaceGridRef, workspaces.length)
  const workspaceGridStyle = useMemo(() => ({
    '--shot-import-workspace-columns': String(workspaceGridMetrics.columns),
  }) as CSSProperties, [workspaceGridMetrics.columns])
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
    <>
      <div
        className="shot-import-dialog__preview"
        style={{ '--shot-import-preview-aspect-ratio': previewAspectRatio } as CSSProperties}
      >
        <ShotWorkspaceClipPlayer resource={session.sourceResource} workspace={activeWorkspace} />
      </div>
      {children}
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
  )
}

function useShotWorkspaceGridMetrics(gridRef: RefObject<HTMLElement>, workspaceCount: number): { columns: number; pageSize: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    return subscribeShotLibraryMeasuredBox(gridRef.current, setSize)
  }, [gridRef])

  return calculateShotWorkspaceGridMetrics(size, workspaceCount)
}
