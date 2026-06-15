import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FolderOpen, MoreHorizontal, MoveRight, Pencil, Scissors, Share2, Trash2 } from 'lucide-react'
import type { RawResource } from '@/types'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { startResourceDragSource } from '@/features/resources/domain/resourceInteraction'
import { useResourceContextMenuDismiss } from '@/features/resources/application/useResourceContextMenuDismiss'
import { ResourceTypeIcon } from '@/features/resources/components/ResourceTypeIcon'
import { formatResourceBytes } from '@/features/resources/components/resourceLibraryFormatting'
import {
  ResourceAssetCard,
  ResourceAssetSelectCheckbox,
  ResourcePanelThumb,
  ResourcePanelThumbFallback,
} from '@movscript/ui/business/resource'
import {
  ResourceAssetActionButton,
  ResourceAssetName,
  ResourceAssetPreviewFallback,
  ResourceContextMenu,
  ResourceContextMenuButton,
  ResourceDangerMenuItem,
  ResourceSharedIndicator,
  ResourcePageActionButton,
} from '@/features/resources/components/ResourcePageUi'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@movscript/ui/primitives'

function resourceScopeLabel(resource: RawResource, currentUserID: number | undefined, currentOrgID: number | undefined, t: ReturnType<typeof useTranslation>['t']) {
  if (currentOrgID && resource.org_id === currentOrgID) {
    if (resource.owner && resource.owner_id !== currentUserID) {
      return t('pages.resources.teamResourceWithOwner', { owner: resource.owner.username, defaultValue: `Team library / ${resource.owner.username}` })
    }
    return t('pages.resources.teamResource', { defaultValue: 'Team library' })
  }
  if (resource.owner_id === currentUserID) {
    return t('pages.resources.personalStaging', { defaultValue: 'Personal staging' })
  }
  if (resource.owner?.username) {
    return t('pages.resources.resourceOwner', { owner: resource.owner.username, defaultValue: `Owner: ${resource.owner.username}` })
  }
  return undefined
}


function resourceTypeLabel(resource: RawResource, t: ReturnType<typeof useTranslation>['t']) {
  return t(`pages.resources.types.${resource.type}`, { defaultValue: resource.type })
}


export function ResourceBulkContextMenu({
  x,
  y,
  resources,
  canShareToTeam,
  onClose,
  onShareToTeam,
  onShareToProject,
}: {
  x: number
  y: number
  resources: RawResource[]
  canShareToTeam: boolean
  onClose: () => void
  onShareToTeam: () => void
  onShareToProject: () => void
}) {
  const { t } = useTranslation()
  useResourceContextMenuDismiss(onClose)

  return (
    <ResourceContextMenu
      x={x}
      y={y}
      label={t('pages.resources.selectedCount', { count: resources.length, defaultValue: `${resources.length} selected` })}
      onClick={event => event.stopPropagation()}
    >
      {canShareToTeam && (
        <ResourceContextMenuButton onClick={onShareToTeam}>
          <Share2 size={14} />
          {t('pages.resources.shareToTeam', { defaultValue: '加入团队资源库' })}
        </ResourceContextMenuButton>
      )}
      <ResourceContextMenuButton onClick={onShareToProject}>
        <FolderOpen size={14} />
        {t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
      </ResourceContextMenuButton>
    </ResourceContextMenu>
  )
}


function ResourceItemDropdownMenu({
  trigger,
  isSharedView,
  canShareToTeam,
  resourceType,
  onDownload,
  onRename,
  onShareToTeam,
  onShareToProject,
  onMove,
  onClip,
  onDelete,
}: {
  trigger: ReactNode
  isSharedView?: boolean
  canShareToTeam: boolean
  resourceType: RawResource['type']
  onDownload: () => void
  onRename: () => void
  onShareToTeam?: () => void
  onShareToProject: () => void
  onMove: () => void
  onClip?: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
        <DropdownMenuItem onSelect={onDownload}>
          <Download size={14} />
          {t('shared.mediaViewer.download')}
        </DropdownMenuItem>
        {!isSharedView && (
          <DropdownMenuItem onSelect={onRename}>
            <Pencil size={14} />
            {t('pages.resources.renameResource')}
          </DropdownMenuItem>
        )}
        {canShareToTeam && onShareToTeam && (
          <DropdownMenuItem onSelect={onShareToTeam}>
            <Share2 size={14} />
            {t('pages.resources.shareToTeam', { defaultValue: '加入团队资源库' })}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onShareToProject}>
          <FolderOpen size={14} />
          {t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
        </DropdownMenuItem>
        {!isSharedView && (
          <DropdownMenuItem onSelect={onMove}>
            <MoveRight size={14} />
            {t('pages.resources.moveToFolder')}
          </DropdownMenuItem>
        )}
        {!isSharedView && resourceType === 'video' && onClip && (
          <DropdownMenuItem onSelect={onClip}>
            <Scissors size={14} />
            {t('pages.resources.clipVideo')}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <ResourceDangerMenuItem onSelect={onDelete}>
              <Trash2 size={14} />
              {t('common.delete')}
            </ResourceDangerMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}


export function ResourceCard({
  resource,
  currentUserID,
  currentOrgID,
  onDelete,
  onMove,
  onRename,
  onDownload,
  onClip,
  onShareToTeam,
  onShareToProject,
  isSharedView,
  selectionMode,
  selected,
  onSelectChange,
  onContextMenu,
  onPreview,
}: {
  resource: RawResource
  currentUserID?: number
  currentOrgID?: number
  onDelete?: () => void
  onMove: () => void
  onRename: () => void
  onDownload: () => void
  onClip?: () => void
  onShareToTeam?: () => void
  onShareToProject: () => void
  isSharedView?: boolean
  selectionMode?: boolean
  selected?: boolean
  onSelectChange?: (selected: boolean) => void
  onContextMenu?: (event: MouseEvent, resource: RawResource) => void
  onPreview?: (resource: RawResource) => void
}) {
  const { t } = useTranslation()
  const scopeLabel = resourceScopeLabel(resource, currentUserID, currentOrgID, t)

  return (
    <ResourceAssetCard
      selected={selected}
      draggable
      onClick={(event) => {
        if ((event.target as HTMLElement | null)?.closest('[data-resource-interactive="true"]')) return
        onPreview?.(resource)
      }}
      onContextMenu={(event) => onContextMenu?.(event, resource)}
      onDragStart={(event) => {
        startResourceDragSource({
          dataTransfer: event.dataTransfer,
          resource,
          target: event.target,
          preventDefault: () => event.preventDefault(),
        })
      }}
      title={t('shared.resourcePanel.previewDragTitle')}
      preview={(
        resource.type === 'image' || resource.type === 'video' || resource.type === 'audio' || resource.type === 'text' ? (
            <MediaViewer
              resource={resource}
              fit="cover"
              lightbox={false}
            />
        ) : (
          <ResourceAssetPreviewFallback>
            <ResourceTypeIcon type={resource.type} />
          </ResourceAssetPreviewFallback>
        )
      )}
      selectControl={onSelectChange ? (
          <ResourceAssetSelectCheckbox
            data-resource-interactive="true"
            checked={Boolean(selected)}
            onCheckedChange={onSelectChange}
            inputProps={{ 'aria-label': t('pages.resources.selectResource', { defaultValue: '选择资源' }) }}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
          />
        ) : undefined}
      actionControl={(
        <ResourceItemDropdownMenu
          trigger={(
            <ResourceAssetActionButton
              data-resource-interactive="true"
              draggable={false}
              title={t('pages.resources.actions')}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => event.stopPropagation()}
              onDragStart={event => event.preventDefault()}
            >
              <MoreHorizontal size={12} />
            </ResourceAssetActionButton>
          )}
          isSharedView={isSharedView}
          canShareToTeam={Boolean(onShareToTeam)}
          resourceType={resource.type}
          onDownload={onDownload}
          onRename={onRename}
          onShareToTeam={onShareToTeam}
          onShareToProject={onShareToProject}
          onMove={onMove}
          onClip={onClip}
          onDelete={onDelete}
        />
      )}
      sharedBadge={scopeLabel ? <ResourceSharedIndicator>{scopeLabel}</ResourceSharedIndicator> : undefined}
      typeIcon={<ResourceTypeIcon type={resource.type} />}
      name={<ResourceAssetName title={resource.name}>{resource.name}</ResourceAssetName>}
      size={formatResourceBytes(resource.size)}
      owner={resourceScopeLabel(resource, currentUserID, currentOrgID, t)}
    />
  )
}


export function ResourceListRowItem({
  resource,
  currentUserID,
  currentOrgID,
  isSharedView,
  selectionMode,
  selectControl,
  onDelete,
  onMove,
  onRename,
  onDownload,
  onClip,
  onShareToTeam,
  onShareToProject,
}: {
  resource: RawResource
  currentUserID?: number
  currentOrgID?: number
  isSharedView?: boolean
  selectionMode?: boolean
  selectControl?: ReactNode
  onDelete?: () => void
  onMove: () => void
  onRename: () => void
  onDownload: () => void
  onClip?: () => void
  onShareToTeam?: () => void
  onShareToProject: () => void
}) {
  const { t } = useTranslation()
  const scopeLabel = resourceScopeLabel(resource, currentUserID, currentOrgID, t)

  return (
    <>
      {selectionMode ? selectControl : null}
      <ResourcePanelThumb size="md">
        {resource.type === 'image' || resource.type === 'video' || resource.type === 'text' ? (
          <MediaViewer resource={resource} lightbox={false} />
        ) : (
          <ResourcePanelThumbFallback>
            <ResourceTypeIcon type={resource.type} />
          </ResourcePanelThumbFallback>
        )}
      </ResourcePanelThumb>
      <div className="resource-page__list-body">
        <span className="resource-page__list-name" title={resource.name}>{resource.name}</span>
        <span className="resource-page__list-meta">
          <span className="resource-page__list-meta-item">
            <ResourceTypeIcon type={resource.type} />
            {resourceTypeLabel(resource, t)}
          </span>
          <span>{formatResourceBytes(resource.size)}</span>
          {scopeLabel ? <ResourceSharedIndicator muted>{scopeLabel}</ResourceSharedIndicator> : null}
        </span>
      </div>
      <ResourceItemDropdownMenu
        trigger={(
          <ResourcePageActionButton
            data-resource-interactive="true"
            draggable={false}
            type="button"
            variant="ghost"
            size="icon-xs"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onDragStart={event => event.preventDefault()}
            title={t('pages.resources.actions')}
          >
            <MoreHorizontal size={14} />
          </ResourcePageActionButton>
        )}
        isSharedView={isSharedView}
        canShareToTeam={Boolean(onShareToTeam)}
        resourceType={resource.type}
        onDownload={onDownload}
        onRename={onRename}
        onShareToTeam={onShareToTeam}
        onShareToProject={onShareToProject}
        onMove={onMove}
        onClip={onClip}
        onDelete={onDelete}
      />

    </>
  )
}
