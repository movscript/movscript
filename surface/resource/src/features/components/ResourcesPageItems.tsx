import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Braces, Clipboard, Download, FolderOpen, KeyRound, MoreHorizontal, MoveRight, Pencil, Scissors, Share2, ShieldCheck, Trash2 } from 'lucide-react'
import type { RawResource } from '@movscript/shared'
import { MediaViewer } from '../../resourceMediaViewer.js'
import { toast } from '@movscript/ui/toast'
import { startResourceDragSource } from '../../resourceInteraction.js'
import { useResourceContextMenuDismiss } from '../application/useResourceContextMenuDismiss'
import { ResourceTypeIcon } from './ResourceTypeIcon'
import { formatResourceBytes } from './resourceLibraryFormatting'
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
} from './ResourcePageUi'
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

type ProviderAssetCertificationView = {
  providerID: string
  certification: Record<string, unknown>
}

function providerAssetCertification(resource: RawResource): ProviderAssetCertificationView | undefined {
  const certifications = resource.provider_asset_certifications
  if (!certifications) return undefined
  const entries = Object.entries(certifications)
    .map(([providerID, certification]) => ({
      providerID: String(certification.provider_id ?? certification.provider ?? providerID),
      certification,
    }))
    .filter(item => item.providerID && item.certification)
  return entries.find(item => providerAssetCertificationIsUsable(item.certification)) ?? entries[0]
}

function providerAssetCertificationIsUsable(certification: Record<string, unknown> | undefined) {
  const status = String(certification?.status ?? '').toLowerCase()
  return status === 'active' || status === 'succeeded' || status === 'success'
}

function isProviderAssetCertified(resource: RawResource) {
  return providerAssetCertificationIsUsable(providerAssetCertification(resource)?.certification)
}

function providerAssetCertificationTitle(resource: RawResource, t: ReturnType<typeof useTranslation>['t']) {
  const item = providerAssetCertification(resource)
  if (!item) return ''
  const certification = item.certification
  const assetUri = String(certification.asset_uri ?? certification.assetUri ?? certification.hub_asset_id ?? '')
  const status = String(certification.status ?? '')
  const certifiedAt = String(certification.certified_at ?? certification.certifiedAt ?? '')
  return [
    t('pages.resources.providerAssetCertifiedTitle', { defaultValue: '已认证到火山素材库' }),
    item.providerID ? `${t('pages.resources.providerAssetProvider', { defaultValue: 'Provider' })}: ${item.providerID}` : '',
    status ? `${t('pages.resources.providerAssetStatus', { defaultValue: '状态' })}: ${status}` : '',
    assetUri ? `${t('pages.resources.providerAssetURI', { defaultValue: '素材' })}: ${assetUri}` : '',
    certifiedAt ? `${t('pages.resources.providerAssetCertifiedAt', { defaultValue: '认证时间' })}: ${certifiedAt}` : '',
  ].filter(Boolean).join('\n')
}

function isImageVerified(resource: RawResource) {
  return resource.verification_status === 'verified'
}

function imageVerificationTitle(resource: RawResource, t: ReturnType<typeof useTranslation>['t']) {
  return [
    t('pages.resources.imageVerifiedTitle', { defaultValue: '实人/内容审核已通过' }),
    resource.verification_provider ? `${t('pages.resources.providerAssetProvider', { defaultValue: '服务' })}: ${resource.verification_provider}` : '',
    resource.verified_at ? `${t('pages.resources.providerAssetCertifiedAt', { defaultValue: '认证时间' })}: ${resource.verified_at}` : '',
  ].filter(Boolean).join('\n')
}

function ResourceCertificationBadges({ resource }: { resource: RawResource }) {
  const { t } = useTranslation()
  const verified = isImageVerified(resource)
  const providerCertified = isProviderAssetCertified(resource)
  if (!verified && !providerCertified) return null
  return (
    <span className="resource-page__cert-badges">
      {verified ? (
        <span className="resource-page__cert-badge resource-page__cert-badge--verified" title={imageVerificationTitle(resource, t)}>
          <ShieldCheck size={12} />
        </span>
      ) : null}
      {providerCertified ? (
        <span className="resource-page__cert-badge resource-page__cert-badge--provider" title={providerAssetCertificationTitle(resource, t)}>
          <BadgeCheck size={12} />
        </span>
      ) : null}
    </span>
  )
}


export function ResourceBulkContextMenu({
  x,
  y,
  resources,
  canShareToTeam,
  canShareToProject,
  onClose,
  onShareToTeam,
  onShareToProject,
}: {
  x: number
  y: number
  resources: RawResource[]
  canShareToTeam: boolean
  canShareToProject: boolean
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
      {canShareToProject ? (
        <ResourceContextMenuButton onClick={onShareToProject}>
          <FolderOpen size={14} />
          {t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
        </ResourceContextMenuButton>
      ) : null}
    </ResourceContextMenu>
  )
}


function ResourceItemDropdownMenu({
  trigger,
  isSharedView,
  canShareToTeam,
  resourceId,
  resourceType,
  agentReferenceActions,
  onDownload,
  onRename,
  onShareToTeam,
  onShareToProject,
  onMove,
  onClip,
  onCertifyProviderAsset,
  onDelete,
}: {
  trigger: ReactNode
  isSharedView?: boolean
  canShareToTeam: boolean
  resourceId: number
  resourceType: RawResource['type']
  agentReferenceActions?: boolean
  onDownload: () => void
  onRename: () => void
  onShareToTeam?: () => void
  onShareToProject?: () => void
  onMove: () => void
  onClip?: () => void
  onCertifyProviderAsset?: () => void
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
        {agentReferenceActions && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => copyAgentResourceReference(String(resourceId), 'raw')}>
              <Clipboard size={14} />
              Copy RawResource ID
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyAgentResourceReference(String(resourceId), 'semantic')}>
              <Braces size={14} />
              Copy semantic ref
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyAgentResourceReference(String(resourceId), 'input')}>
              <Clipboard size={14} />
              Copy input ref
            </DropdownMenuItem>
          </>
        )}
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
        {onShareToProject ? (
          <DropdownMenuItem onSelect={onShareToProject}>
            <FolderOpen size={14} />
            {t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
          </DropdownMenuItem>
        ) : null}
        {!isSharedView && (
          <DropdownMenuItem onSelect={onMove}>
            <MoveRight size={14} />
            {t('pages.resources.moveToFolder')}
          </DropdownMenuItem>
        )}
        {!isSharedView && resourceType === 'video' && onClip && (
          <DropdownMenuItem onSelect={onClip}>
            <Scissors size={14} />
            {t('pages.resources.trimVideoSegment')}
          </DropdownMenuItem>
        )}
        {resourceType === 'image' && onCertifyProviderAsset && (
          <DropdownMenuItem onSelect={onCertifyProviderAsset}>
            <KeyRound size={14} />
            {t('pages.resources.certifyProviderAsset', { defaultValue: '认证到火山素材库' })}
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
  onCertifyProviderAsset,
  onShareToTeam,
  onShareToProject,
  isSharedView,
  selectionMode,
  selected,
  onSelectChange,
  onContextMenu,
  onPreview,
  agentReferenceActions,
}: {
  resource: RawResource
  currentUserID?: number
  currentOrgID?: number
  onDelete?: () => void
  onMove: () => void
  onRename: () => void
  onDownload: () => void
  onClip?: () => void
  onCertifyProviderAsset?: () => void
  onShareToTeam?: () => void
  onShareToProject?: () => void
  isSharedView?: boolean
  selectionMode?: boolean
  selected?: boolean
  onSelectChange?: (selected: boolean) => void
  onContextMenu?: (event: MouseEvent, resource: RawResource) => void
  onPreview?: (resource: RawResource) => void
  agentReferenceActions?: boolean
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
          resourceId={resource.ID}
          resourceType={resource.type}
          agentReferenceActions={agentReferenceActions}
          onDownload={onDownload}
          onRename={onRename}
          onShareToTeam={onShareToTeam}
          onShareToProject={onShareToProject}
          onMove={onMove}
          onClip={onClip}
          onCertifyProviderAsset={onCertifyProviderAsset}
          onDelete={onDelete}
        />
      )}
      sharedBadge={scopeLabel ? <ResourceSharedIndicator>{scopeLabel}</ResourceSharedIndicator> : undefined}
      typeIcon={<ResourceTypeIcon type={resource.type} />}
      name={(
        <span className="resource-page__asset-title">
          <ResourceAssetName title={resource.name}>{resource.name}</ResourceAssetName>
          <ResourceCertificationBadges resource={resource} />
        </span>
      )}
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
  onCertifyProviderAsset,
  onShareToTeam,
  onShareToProject,
  agentReferenceActions,
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
  onCertifyProviderAsset?: () => void
  onShareToTeam?: () => void
  onShareToProject?: () => void
  agentReferenceActions?: boolean
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
        <span className="resource-page__list-title">
          <span className="resource-page__list-name" title={resource.name}>{resource.name}</span>
          <ResourceCertificationBadges resource={resource} />
        </span>
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
        resourceId={resource.ID}
        resourceType={resource.type}
        agentReferenceActions={agentReferenceActions}
        onDownload={onDownload}
        onRename={onRename}
        onShareToTeam={onShareToTeam}
        onShareToProject={onShareToProject}
        onMove={onMove}
        onClip={onClip}
        onCertifyProviderAsset={onCertifyProviderAsset}
        onDelete={onDelete}
      />

    </>
  )
}

function copyAgentResourceReference(resourceId: string, kind: 'raw' | 'semantic' | 'input') {
  const value = kind === 'raw'
    ? resourceId
    : kind === 'semantic'
      ? `{{resource::${resourceId}}}`
      : `input_resource_ids: [${resourceId}]`
  void navigator.clipboard?.writeText(value)
  toast.success('Copied resource reference')
}
