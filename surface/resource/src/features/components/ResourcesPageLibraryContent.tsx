import type { DragEvent, MouseEvent } from 'react'
import { Upload } from 'lucide-react'
import {
  ResourcePageAssetGrid,
  ResourcePageAssetList,
  ResourcePageContent,
  ResourcePageEmptyState,
  ResourcePageListCheckbox,
  ResourcePageListRow,
  ResourcePageLoadingState,
} from './ResourcePageUi'
import { useTranslation } from 'react-i18next'

import type { RawResource } from '@movscript/shared'
import { ResourceCard, ResourceListRowItem } from './ResourcesPageItems'

export function ResourcesPageLibraryContent({
  isLoading,
  resources,
  search,
  viewMode,
  currentUserID,
  currentOrgID,
  isSharedView,
  isProjectScope,
  projectScopeEnabled,
  selectionMode,
  selectedResourceIDs,
  projectBindingByResourceID,
  canAdoptToTeam,
  onRemoveResource,
  onRevokeProjectBinding,
  onMoveResource,
  onRenameResource,
  onClipResource,
  onShareResourcesToTeam,
  onShareResourcesToProject,
  onDownloadResource,
  onCertifyProviderAsset,
  onSelectResource,
  onContextMenu,
  onPreviewResource,
  onResourceRowDragStart,
  agentReferenceActions,
}: {
  isLoading: boolean
  resources: RawResource[]
  search: string
  viewMode: 'grid' | 'list'
  currentUserID?: number
  currentOrgID?: number
  isSharedView: boolean
  isProjectScope: boolean
  projectScopeEnabled: boolean
  selectionMode: boolean
  selectedResourceIDs: Set<number>
  projectBindingByResourceID: Map<number, number>
  canAdoptToTeam: (resource: RawResource) => boolean
  onRemoveResource: (id: number) => void
  onRevokeProjectBinding: (id: number) => void
  onMoveResource: (resource: RawResource) => void
  onRenameResource: (resource: RawResource) => void
  onClipResource: (resource: RawResource) => void
  onShareResourcesToTeam: (resources: RawResource[]) => void
  onShareResourcesToProject: (resources: RawResource[]) => void
  onDownloadResource: (resource: RawResource) => void
  onCertifyProviderAsset: (resource: RawResource) => void
  onSelectResource: (resource: RawResource, selected: boolean) => void
  onContextMenu: (event: MouseEvent, resource: RawResource) => void
  onPreviewResource: (resource: RawResource) => void
  onResourceRowDragStart: (event: DragEvent<HTMLDivElement>, resource: RawResource) => void
  agentReferenceActions?: boolean
}) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <ResourcePageContent>
        <ResourcePageLoadingState>{t('common.loadingShort')}</ResourcePageLoadingState>
      </ResourcePageContent>
    )
  }

  if (resources.length === 0) {
    return (
      <ResourcePageContent>
        <ResourcePageEmptyState icon={Upload}>
          {search ? t('pages.resources.noMatchedFiles') : t('pages.resources.noResourcesUpload')}
        </ResourcePageEmptyState>
      </ResourcePageContent>
    )
  }

  if (viewMode === 'grid') {
    return (
      <ResourcePageContent>
        <ResourcePageAssetGrid>
          {resources.map(resource => (
            <ResourceCard
              key={resource.ID}
              resource={resource}
              currentUserID={currentUserID}
              currentOrgID={currentOrgID}
              isSharedView={isSharedView}
              selectionMode={selectionMode}
              onDelete={isProjectScope
                ? (projectBindingByResourceID.get(resource.ID) ? () => onRevokeProjectBinding(projectBindingByResourceID.get(resource.ID)!) : undefined)
                : () => onRemoveResource(resource.ID)}
              onMove={() => onMoveResource(resource)}
              onRename={() => onRenameResource(resource)}
              onClip={() => onClipResource(resource)}
              onShareToTeam={canAdoptToTeam(resource) ? () => onShareResourcesToTeam([resource]) : undefined}
              onShareToProject={projectScopeEnabled ? () => onShareResourcesToProject([resource]) : undefined}
              onDownload={() => onDownloadResource(resource)}
              onCertifyProviderAsset={() => onCertifyProviderAsset(resource)}
              selected={selectionMode && selectedResourceIDs.has(resource.ID)}
              onSelectChange={selectionMode ? selected => onSelectResource(resource, selected) : undefined}
              onContextMenu={onContextMenu}
              onPreview={onPreviewResource}
              agentReferenceActions={agentReferenceActions}
            />
          ))}
        </ResourcePageAssetGrid>
      </ResourcePageContent>
    )
  }

  return (
    <ResourcePageContent>
      <ResourcePageAssetList>
        {resources.map(resource => (
          <ResourcePageListRow
            key={resource.ID}
            selected={selectedResourceIDs.has(resource.ID)}
            draggable={!selectedResourceIDs.has(resource.ID)}
            onDragStart={!selectedResourceIDs.has(resource.ID) ? event => onResourceRowDragStart(event, resource) : undefined}
            onClick={() => onPreviewResource(resource)}
            onContextMenu={event => onContextMenu(event, resource)}
            title={selectedResourceIDs.has(resource.ID) ? t('common.selected') : t('shared.resourcePanel.previewDragTitle')}
          >
            <ResourceListRowItem
              resource={resource}
              currentUserID={currentUserID}
              currentOrgID={currentOrgID}
              isSharedView={isSharedView}
              selectionMode={selectionMode}
              selectControl={selectedResourceIDs.has(resource.ID) || selectionMode ? (
                <ResourcePageListCheckbox
                  data-resource-interactive="true"
                  checked={selectedResourceIDs.has(resource.ID)}
                  onCheckedChange={checked => onSelectResource(resource, checked)}
                  inputProps={{ 'aria-label': t('pages.resources.selectResource', { defaultValue: '选择资源' }) }}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={event => event.stopPropagation()}
                />
              ) : undefined}
              onDelete={isProjectScope
                ? (projectBindingByResourceID.get(resource.ID) ? () => onRevokeProjectBinding(projectBindingByResourceID.get(resource.ID)!) : undefined)
                : () => onRemoveResource(resource.ID)}
              onMove={() => onMoveResource(resource)}
              onRename={() => onRenameResource(resource)}
              onClip={() => onClipResource(resource)}
              onShareToTeam={canAdoptToTeam(resource) ? () => onShareResourcesToTeam([resource]) : undefined}
              onShareToProject={projectScopeEnabled ? () => onShareResourcesToProject([resource]) : undefined}
              onDownload={() => onDownloadResource(resource)}
              onCertifyProviderAsset={() => onCertifyProviderAsset(resource)}
              agentReferenceActions={agentReferenceActions}
            />
          </ResourcePageListRow>
        ))}
      </ResourcePageAssetList>
    </ResourcePageContent>
  )
}
