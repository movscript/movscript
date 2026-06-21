import './ResourcesPage.css'
import {
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { ResourceCandidateAttachPanel, candidateResourceFromRawResource } from '@/shared/ui/ResourceCandidateAttachPanel'
import {
  ResourcePageActionButton,
  ResourcePageHiddenFileInput,
  ResourcePageLayout,
  ResourcePageMain,
  ResourcePagePager,
  ResourceDialogSelect,
} from '@/features/resources/components/ResourcePageUi'
import { useTranslation } from 'react-i18next'
import { RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import { MoveDialog, RenameResourceDialog, ShareToProjectDialog } from '@/features/resources/components/ResourcesPageDialogs'
import { ResourceBulkContextMenu } from '@/features/resources/components/ResourcesPageItems'
import { ResourcesPageLibraryContent } from '@/features/resources/components/ResourcesPageLibraryContent'
import { ResourcesPageToolbar } from '@/features/resources/components/ResourcesPageToolbar'
import { VideoClipDialog } from '@/features/resources/components/ResourcesPageVideoClipDialog'
import {
  RESOURCE_PAGE_SIZE_OPTIONS,
  resourceIDs,
} from '@/features/resources/components/resourceLibraryModel'
import type { ResourceLibraryViewProps } from '@/features/resources/components/resourceLibraryViewTypes'
import { useResourceLibraryController } from '@/features/resources/components/useResourceLibraryController'

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ResourceLibraryView({
  variant = 'page',
}: ResourceLibraryViewProps) {
  const { t } = useTranslation()
  const controller = useResourceLibraryController()

  return (
    <ResourcePageLayout data-resource-variant={variant}>
      <ResourcePageMain>
        <ResourcePageHiddenFileInput
          ref={controller.fileRef}
          type="file"
          accept={RESOURCE_UPLOAD_ACCEPT}
          multiple
          onChange={e => {
            controller.uploadFiles(e.target.files)
            e.target.value = ''
          }}
        />

        <ResourcesPageToolbar
          total={controller.total}
          scope={controller.scope}
          filter={controller.filter}
          search={controller.search}
          currentOrgID={controller.currentOrgID}
          currentProjectID={controller.currentProject?.ID}
          viewMode={controller.viewMode}
          selectionMode={controller.selectionMode}
          selectedCount={controller.selectedIDs.length}
          selectedResources={controller.selectedResources}
          selectedPersonalStagingCount={controller.selectedPersonalStagingResources.length}
          selectedProjectBindingCount={controller.selectedProjectBindingIDs.length}
          uploadPending={controller.upload.isPending}
          adoptToTeamPending={controller.adoptToTeam.isPending}
          shareToProjectPending={controller.shareToProject.isPending}
          revokePending={controller.revoke.isPending}
          isProjectScope={controller.isProjectScope}
          onScopeTabChange={controller.setTab}
          onScopeChange={controller.setScopeFilter}
          onFilterChange={controller.setTypeFilter}
          onSearchChange={controller.setSearchFilter}
          onUploadClick={() => controller.fileRef.current?.click()}
          onViewModeChange={controller.setViewMode}
          onToggleSelectionMode={controller.toggleSelectionMode}
          onClearSelection={controller.clearSelection}
          onShareResourcesToTeam={controller.shareResourcesToTeam}
          onShareResourcesToProject={controller.openShareToProject}
          onRevokeSelectedProjectBindings={controller.revokeSelectedProjectBindings}
        />

        <ResourcesPageLibraryContent
          isLoading={controller.isLoading}
          resources={controller.visible}
          search={controller.search}
          viewMode={controller.viewMode}
          currentUserID={controller.currentUser?.ID}
          currentOrgID={controller.currentOrgID ?? undefined}
          isSharedView={controller.isSharedView}
          isProjectScope={controller.isProjectScope}
          selectionMode={controller.selectionMode}
          selectedResourceIDs={controller.selectedResourceIDs}
          projectBindingByResourceID={controller.projectBindingByResourceID}
          canAdoptToTeam={controller.canAdoptToTeam}
          onRemoveResource={id => controller.remove.mutate(id)}
          onRevokeProjectBinding={id => controller.revoke.mutate(id)}
          onMoveResource={controller.setMoveResource}
          onRenameResource={controller.setRenameResource}
          onClipResource={controller.setClipResource}
          onShareResourcesToTeam={controller.shareResourcesToTeam}
          onShareResourcesToProject={controller.openShareToProject}
          onDownloadResource={controller.downloadResource}
          onSelectResource={controller.setResourceSelected}
          onContextMenu={controller.openResourceContextMenu}
          onPreviewResource={controller.setPreviewResource}
          onResourceRowDragStart={controller.handleResourceRowDragStart}
        />

        <ResourcePagePager
          status={t('pages.resources.pageStatus', { page: controller.page, pageCount: controller.pageCount })}
          actions={(
            <>
            <label className="resource-page__page-size-field">
              <span>{t('pages.resources.pageSize', { defaultValue: '每页' })}</span>
              <ResourceDialogSelect
                className="resource-page__page-size-select"
                value={controller.pageSize}
                onChange={event => controller.setLibraryPageSize(Number(event.target.value))}
              >
                {RESOURCE_PAGE_SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </ResourceDialogSelect>
            </label>
            <ResourcePageActionButton variant="outline" size="sm" onClick={() => controller.setPage(p => Math.max(1, p - 1))} disabled={controller.page <= 1}>
              <ChevronLeft size={14} />
              {t('pages.resources.previousPage')}
            </ResourcePageActionButton>
            <ResourcePageActionButton variant="outline" size="sm" onClick={() => controller.setPage(p => Math.min(controller.pageCount, p + 1))} disabled={controller.page >= controller.pageCount}>
              {t('pages.resources.nextPage')}
              <ChevronRight size={14} />
            </ResourcePageActionButton>
            </>
          )}
        />
      </ResourcePageMain>

      {/* Dialogs */}
      {controller.moveResource && (
        <MoveDialog
          resource={controller.moveResource}
          folders={controller.myFolders}
          onClose={() => controller.setMoveResource(null)}
        />
      )}
      {controller.renameResource && (
        <RenameResourceDialog
          resource={controller.renameResource}
          onClose={() => controller.setRenameResource(null)}
        />
      )}
      {controller.clipResource && (
        <VideoClipDialog
          resource={controller.clipResource}
          onClose={() => controller.setClipResource(null)}
          onCreated={controller.clipCreated}
        />
      )}
      {controller.shareProjectResources && (
        <ShareToProjectDialog
          resources={controller.shareProjectResources}
          projects={controller.projects}
          onClose={() => controller.setShareProjectResources(null)}
          isSharing={controller.shareToProject.isPending}
          onShare={(projectID) => controller.shareToProject.mutate({ projectID, ids: resourceIDs(controller.shareProjectResources ?? []) })}
        />
      )}
      {controller.previewResource && (
        <MediaViewer
          resource={controller.previewResource}
          open
          onOpenChange={open => !open && controller.setPreviewResource(null)}
          onPrevious={controller.previewResource.type === 'image' && controller.visibleImageResources.length > 1 ? () => controller.switchPreviewImage(-1) : undefined}
          onNext={controller.previewResource.type === 'image' && controller.visibleImageResources.length > 1 ? () => controller.switchPreviewImage(1) : undefined}
          fit="contain"
          sidePanel={(
            <ResourceCandidateAttachPanel
              resources={[candidateResourceFromRawResource(controller.previewResource)]}
              projectId={controller.currentProject?.ID}
              compact
            />
          )}
        />
      )}
      {controller.contextMenu && (
        <ResourceBulkContextMenu
          x={controller.contextMenu.position.x}
          y={controller.contextMenu.position.y}
          resources={controller.contextMenu.resources}
          canShareToTeam={controller.contextMenu.resources.some(controller.canAdoptToTeam)}
          onClose={() => controller.setContextMenu(null)}
          onShareToTeam={() => controller.shareResourcesToTeam(controller.contextMenu?.resources ?? [])}
          onShareToProject={() => controller.openShareToProject(controller.contextMenu?.resources ?? [])}
        />
      )}
    </ResourcePageLayout>
  )
}

export default function ResourcesPage() {
  return <ResourceLibraryView />
}
