import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileAudio, FileText, Package } from 'lucide-react'
import {
  ResourceAssetSlotBody,
  ResourceAssetSlotCard,
  ResourceAssetSlotDragButton,
  ResourceAssetSlotHeader,
  ResourceAssetSlotMeta,
  ResourceAssetSlotTitle,
  ResourceListItemShell,
  ResourcePanelItemName,
  ResourcePanelSelectedLabel,
  ResourcePanelThumb,
  ResourcePanelThumbFallback,
} from '@movscript/ui/business/resource'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
import { ResourceCandidateAttachPanel, candidateResourceFromRawResource } from '@movscript/resource-surface/resource-candidate-attach-panel'
import { startResourceDragSource } from '@movscript/resource-surface/resource-interaction'
import type { SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import type { AssetSlot, RawResource } from '@/types'

type AssetSlotPanelRecord = SemanticEntityRecord & AssetSlot

export function ResourcePreviewDialog({
  resource,
  projectId,
  onClose,
  onPrevious,
  onNext,
}: {
  resource: RawResource
  projectId?: number
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
}) {
  return (
    <MediaViewer
      resource={resource}
      open
      onOpenChange={v => !v && onClose()}
      onPrevious={onPrevious}
      onNext={onNext}
      fit="contain"
      sidePanel={(
        <ResourceCandidateAttachPanel
          resources={[candidateResourceFromRawResource(resource)]}
          projectId={projectId}
          compact
        />
      )}
    />
  )
}

interface ResourceListItemProps {
  resource: RawResource
  selected?: boolean
  onClick?: () => void
  draggable?: boolean
  trailing?: React.ReactNode
  thumbSize?: 'sm' | 'md'
  previewProjectId?: number
  previewResources?: RawResource[]
}

export function ResourceListItem({
  resource: r,
  selected,
  onClick,
  draggable: isDraggable,
  trailing,
  thumbSize = 'sm',
  previewProjectId,
  previewResources = [r],
}: ResourceListItemProps) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<RawResource | null>(null)
  const previewImages = previewResources.filter((resource) => resource.type === 'image')

  function handleDragStart(e: React.DragEvent) {
    startResourceDragSource({ dataTransfer: e.dataTransfer, resource: r })
  }

  function handleClick() {
    if (onClick) { onClick(); return }
    setPreview(r)
  }

  function switchPreviewImage(direction: -1 | 1) {
    setPreview(current => {
      if (!current || current.type !== 'image' || previewImages.length < 2) return current
      return adjacentResource(previewImages, current, direction)
    })
  }

  return (
    <>
      <ResourceListItemShell
        selected={selected}
        draggableActive={Boolean(isDraggable && !selected)}
        draggable={isDraggable && !selected}
        onDragStart={isDraggable && !selected ? handleDragStart : undefined}
        onClick={handleClick}
        title={selected ? t('common.selected') : isDraggable ? t('shared.resourcePanel.previewDragTitle') : undefined}
      >
        <ResourcePanelThumb size={thumbSize}>
          {r.type === 'image' || r.type === 'video' || r.type === 'text' ? (
            <MediaViewer resource={r} lightbox={false} />
          ) : r.type === 'audio' ? (
            <ResourcePanelThumbFallback>
              <FileAudio size={thumbSize === 'sm' ? 12 : 14} />
            </ResourcePanelThumbFallback>
          ) : (
            <ResourcePanelThumbFallback>
              <FileText size={thumbSize === 'sm' ? 12 : 14} />
            </ResourcePanelThumbFallback>
          )}
        </ResourcePanelThumb>
        <ResourcePanelItemName>{r.name}</ResourcePanelItemName>
        {selected && <ResourcePanelSelectedLabel>{t('common.selected')}</ResourcePanelSelectedLabel>}
        {trailing}
      </ResourceListItemShell>

      {preview && (
        <ResourcePreviewDialog
          resource={preview}
          projectId={previewProjectId}
          onClose={() => setPreview(null)}
          onPrevious={preview.type === 'image' && previewImages.length > 1 ? () => switchPreviewImage(-1) : undefined}
          onNext={preview.type === 'image' && previewImages.length > 1 ? () => switchPreviewImage(1) : undefined}
        />
      )}
    </>
  )
}

interface AssetSlotListItemProps {
  slot: AssetSlotPanelRecord
  selected?: boolean
  onClick?: () => void
  draggable?: boolean
  selectedResourceIds?: number[]
  trailing?: React.ReactNode
  previewProjectId?: number
  previewResources?: RawResource[]
}

export function AssetSlotListItem({
  slot,
  selected,
  onClick,
  draggable: isDraggable,
  selectedResourceIds = [],
  trailing,
  previewProjectId,
  previewResources = [],
}: AssetSlotListItemProps) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<RawResource | null>(null)
  const resource = slot.resource
  const previewImages = previewResources.filter((item) => item.type === 'image')

  function handleDragStart(e: React.DragEvent, res: RawResource) {
    startResourceDragSource({ dataTransfer: e.dataTransfer, resource: res })
  }

  function switchPreviewImage(direction: -1 | 1) {
    setPreview(current => {
      if (!current || current.type !== 'image' || previewImages.length < 2) return current
      return adjacentResource(previewImages, current, direction)
    })
  }

  return (
    <>
      <ResourceAssetSlotCard
        selected={selected}
        clickable={Boolean(onClick)}
        onClick={onClick}
      >
        <ResourceAssetSlotHeader>
          <ResourcePanelThumb size="sm">
            {resource ? (
              <MediaViewer resource={resource} lightbox={false} />
            ) : (
              <ResourcePanelThumbFallback>
                <Package size={12} />
              </ResourcePanelThumbFallback>
            )}
          </ResourcePanelThumb>
          <ResourceAssetSlotBody>
            <ResourceAssetSlotTitle>{slot.name || `#${slot.ID}`}</ResourceAssetSlotTitle>
            <ResourceAssetSlotMeta>
              {slot.owner_type && slot.owner_id ? `${slot.owner_type} #${slot.owner_id}` : t('shared.resourcePanel.assetLibrary')}
              {' · '}
              {slot.kind || 'reference'}
            </ResourceAssetSlotMeta>
          </ResourceAssetSlotBody>
          {trailing}
        </ResourceAssetSlotHeader>

        {isDraggable && resource && (
          <ResourceAssetSlotDragButton
            selected={selectedResourceIds.includes(resource.ID)}
            role="button"
            tabIndex={0}
            draggable={!selectedResourceIds.includes(resource.ID)}
            onDragStart={e => { e.stopPropagation(); !selectedResourceIds.includes(resource.ID) && handleDragStart(e, resource) }}
            onClick={e => { e.stopPropagation(); setPreview(resource) }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                setPreview(resource)
              }
            }}
            title={resource.name}
          >
            <MediaViewer resource={resource} lightbox={false} />
          </ResourceAssetSlotDragButton>
        )}
      </ResourceAssetSlotCard>

      {preview && (
        <ResourcePreviewDialog
          resource={preview}
          projectId={previewProjectId}
          onClose={() => setPreview(null)}
          onPrevious={preview.type === 'image' && previewImages.length > 1 ? () => switchPreviewImage(-1) : undefined}
          onNext={preview.type === 'image' && previewImages.length > 1 ? () => switchPreviewImage(1) : undefined}
        />
      )}
    </>
  )
}

function adjacentResource(resources: RawResource[], current: RawResource, direction: -1 | 1) {
  const currentIndex = resources.findIndex(resource => resource.ID === current.ID)
  if (currentIndex < 0) return current
  return resources[(currentIndex + direction + resources.length) % resources.length]
}
