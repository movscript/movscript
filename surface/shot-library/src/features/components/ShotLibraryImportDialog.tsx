import { useTranslation } from 'react-i18next'
import { AlertCircle, FolderOpen, Save, Upload } from 'lucide-react'
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
} from '@movscript/ui/primitives'
import type { RawResource } from '@movscript/shared'
import type { ShotLibrarySource } from '../domain/shotReferenceLibrary'
import {
  importPhaseLabel,
  importProgressLabel,
  isWorkspaceSelected,
  type ShotImportSession,
  type ShotLibraryGroupOption,
  type ShotManualWorkspace,
  type ShotTagSuggestions,
} from '../domain/shotLibraryWorkspaceModel'
import { ShotImportResourceGrid } from './ShotLibraryImportDialogSections'
import { ShotImportWorkspaceBrowser } from './ShotLibraryImportWorkspaceBrowser'
import { normalizedCssAspectRatio } from './shotLibraryVideoPreview'

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
  const previewAspectRatio = normalizedCssAspectRatio(session?.metadata.width ?? 0, session?.metadata.height ?? 0) ?? '16 / 9'

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
                <ShotImportWorkspaceBrowser
                  session={session}
                  activeWorkspace={activeWorkspace}
                  previewAspectRatio={previewAspectRatio}
                  isSaving={isSaving}
                  tagSuggestions={tagSuggestions}
                  onSelectWorkspace={onSelectWorkspace}
                  onToggleWorkspace={onToggleWorkspace}
                  onUpdateWorkspace={onUpdateWorkspace}
                >
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
                </ShotImportWorkspaceBrowser>
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
