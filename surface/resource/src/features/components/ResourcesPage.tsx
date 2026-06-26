import './ResourcesPage.css'
import {
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { MediaViewer } from '../../resourceMediaViewer.js'
import { ResourceCandidateAttachPanel, candidateResourceFromRawResource } from '../../resourceCandidateAttachPanel.js'
import {
  ResourcePageActionButton,
  ResourcePageHiddenFileInput,
  ResourcePageLayout,
  ResourcePageMain,
  ResourcePagePager,
  ResourceDialogSelect,
} from './ResourcePageUi'
import { useTranslation } from 'react-i18next'
import { RESOURCE_UPLOAD_ACCEPT } from '@movscript/core/resources'
import { MoveDialog, ProviderAssetCertificationDialog, RenameResourceDialog, ShareToProjectDialog } from './ResourcesPageDialogs'
import { ResourceBulkContextMenu } from './ResourcesPageItems'
import { ResourcesPageLibraryContent } from './ResourcesPageLibraryContent'
import { ResourcesPageToolbar } from './ResourcesPageToolbar'
import { VideoClipDialog } from './ResourcesPageVideoClipDialog'
import {
  RESOURCE_LIBRARY_PAGE_SIZE_OPTIONS,
  resourceIDs,
  type ResourceLibraryViewProps,
} from '../../resourceLibrary.js'
import { ResourceLibraryBrowserView } from '../../resource-browser.js'
import { useResourceLibraryController } from './useResourceLibraryController'
import type { Project, RawResource, ResourceBinding, ResourceFolder } from '@movscript/shared'

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ResourceLibraryView({
  variant = 'page',
  initialSearch,
  initialType,
  initialScope,
  focusResourceId,
  agentReferenceActions,
}: ResourceLibraryViewProps) {
  const { t } = useTranslation()
  const controller = useResourceLibraryController({
    initialSearch,
    initialType,
    initialScope,
    focusResourceId,
  })

  return (
    <ResourceLibraryBrowserView<RawResource, ResourceBinding, ResourceFolder, Project>
      variant={variant}
      controller={controller}
      agentReferenceActions={agentReferenceActions}
      slots={{
        renderLayout: ({ variant, children }) => (
          <ResourcePageLayout data-resource-variant={variant}>
            {children}
          </ResourcePageLayout>
        ),
        renderMain: ({ children }) => (
          <ResourcePageMain>
            {children}
          </ResourcePageMain>
        ),
        renderUploadInput: ({ controller }) => (
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
        ),
        renderToolbar: ({ controller }) => (
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
            projectScopeEnabled={controller.projectScopeEnabled}
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
        ),
        renderContent: ({ controller, agentReferenceActions }) => (
          <ResourcesPageLibraryContent
            isLoading={controller.isLoading}
            resources={controller.visible}
            search={controller.search}
            viewMode={controller.viewMode}
            currentUserID={controller.currentUser?.ID}
            currentOrgID={controller.currentOrgID ?? undefined}
            isSharedView={controller.isSharedView}
            isProjectScope={controller.isProjectScope}
            projectScopeEnabled={controller.projectScopeEnabled}
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
            providerAssetProviders={controller.providerAssetProviders}
            onCertifyProviderAsset={(resource, providerID) => {
              const provider = controller.providerAssetProviders.find(item => item.provider_id === providerID)
              if (provider?.provider_kind === 'yunwu_gateway') {
                controller.setProviderAssetCertificationRequest({ resource, provider, providerID })
                return
              }
              controller.certifyProviderAsset.mutate({ resource, providerID })
            }}
            onSelectResource={controller.setResourceSelected}
            onContextMenu={controller.openResourceContextMenu}
            onPreviewResource={controller.setPreviewResource}
            onResourceRowDragStart={controller.handleResourceRowDragStart}
            agentReferenceActions={agentReferenceActions}
          />
        ),
        renderPager: ({ controller }) => (
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
                  {RESOURCE_LIBRARY_PAGE_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </ResourceDialogSelect>
              </label>
              <ResourcePageActionButton variant="outline" size="sm" onClick={() => controller.setPage((p: number) => Math.max(1, p - 1))} disabled={controller.page <= 1}>
                <ChevronLeft size={14} />
                {t('pages.resources.previousPage')}
              </ResourcePageActionButton>
              <ResourcePageActionButton variant="outline" size="sm" onClick={() => controller.setPage((p: number) => Math.min(controller.pageCount, p + 1))} disabled={controller.page >= controller.pageCount}>
                {t('pages.resources.nextPage')}
                <ChevronRight size={14} />
              </ResourcePageActionButton>
              </>
            )}
          />
        ),
        renderDialogs: ({ controller }) => (
          <>
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
            {controller.projectScopeEnabled && controller.shareProjectResources && (
              <ShareToProjectDialog
                resources={controller.shareProjectResources}
                projects={controller.projects}
                onClose={() => controller.setShareProjectResources(null)}
                isSharing={controller.shareToProject.isPending}
                onShare={(projectID) => controller.shareToProject.mutate({ projectID, ids: resourceIDs(controller.shareProjectResources ?? []) })}
              />
            )}
            {controller.providerAssetCertificationRequest && (
              <ProviderAssetCertificationDialog
                resource={controller.providerAssetCertificationRequest.resource}
                provider={controller.providerAssetCertificationRequest.provider}
                providerID={controller.providerAssetCertificationRequest.providerID}
                onClose={() => controller.setProviderAssetCertificationRequest(null)}
                isCertifying={controller.certifyProviderAsset.isPending}
                onConfirm={({ providerID, model }) => controller.certifyProviderAsset.mutate({
                  resource: controller.providerAssetCertificationRequest!.resource,
                  providerID,
                  model,
                })}
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
                canShareToProject={controller.projectScopeEnabled}
                onClose={() => controller.setContextMenu(null)}
                onShareToTeam={() => controller.shareResourcesToTeam(controller.contextMenu?.resources ?? [])}
                onShareToProject={() => controller.openShareToProject(controller.contextMenu?.resources ?? [])}
              />
            )}
          </>
        ),
      }}
    />
  )
}

export default function ResourcesPage() {
  return <ResourceLibraryView />
}
