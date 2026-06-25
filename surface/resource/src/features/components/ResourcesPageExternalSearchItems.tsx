import type { CSSProperties } from 'react'
import { Download, Image as ImageIcon, Video, X as XIcon } from 'lucide-react'
import type { ExternalResourceItem } from '@movscript/shared'
import { UrlImage, UrlMediaPreview } from '../../resourceMediaComponents.js'
import { ResourceTypeIcon } from './ResourceTypeIcon'
import { externalResourceKey } from '../application/externalResourceSearchModel'
import {
  ResourceAssetCard,
  ResourceAssetSelectCheckbox,
  ResourceMediaFillFrame,
} from '@movscript/ui/business/resource'
import {
  ResourceAssetName,
  ResourceAssetPreviewFallback,
  ResourceDialogCloseButton,
  ResourceDialogContent,
  ResourceDialogFooter,
  ResourceDialogHeader,
  ResourceDialogStack,
  ResourceDialogText,
  ResourcePageActionButton,
} from './ResourcePageUi'
import { Dialog } from '@movscript/ui/primitives'

export { externalResourceKey }

export function ExternalResourceCard({
  item,
  selected,
  onSelectChange,
  onPreview,
}: {
  item: ExternalResourceItem
  selected: boolean
  onSelectChange: (selected: boolean) => void
  onPreview: () => void
}) {
  const name = item.title || `${item.provider_key} #${item.external_id}`
  const meta = externalResourceMeta(item)

  return (
    <ResourceAssetCard
      selected={selected}
      title="点击预览"
      style={{ cursor: 'pointer' }}
      onClick={onPreview}
      preview={(
        <ResourceMediaFillFrame fit="cover">
          {item.thumbnail_url ? (
            <UrlImage src={item.thumbnail_url} alt={name} loading="lazy" />
          ) : (
            <ResourceAssetPreviewFallback>
              <ResourceTypeIcon type={item.media_type} />
            </ResourceAssetPreviewFallback>
          )}
        </ResourceMediaFillFrame>
      )}
      selectControl={(
        <ResourceAssetSelectCheckbox
          data-resource-interactive="true"
          checked={selected}
          onCheckedChange={onSelectChange}
          inputProps={{ 'aria-label': '选择外部资源' }}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        />
      )}
      typeIcon={<ResourceTypeIcon type={item.media_type} />}
      name={<ResourceAssetName title={name}>{name}</ResourceAssetName>}
      size={meta}
      owner={item.author_name ? (
        <span title={item.author_name} style={{ fontSize: 11, lineHeight: '14px' }}>
          {item.author_name}
        </span>
      ) : item.license_label}
    />
  )
}

export function ExternalResourcePreviewDialog({
  item,
  onClose,
  onAdd,
  adding,
}: {
  item: ExternalResourceItem
  onClose: () => void
  onAdd: () => void
  adding?: boolean
}) {
  const name = item.title || `${item.provider_key} #${item.external_id}`
  const previewUrl = item.preview_url || item.thumbnail_url
  const aspectRatio = externalResourceAspectRatio(item)
  const dialogStyle = {
    '--external-resource-aspect-ratio': aspectRatio,
    '--external-resource-dialog-preferred-width': `${roundCssNumber(aspectRatio * 68)}vh`,
    '--external-resource-dialog-max-by-media': `${Math.max(320, Math.round(aspectRatio * 640))}px`,
  } as CSSProperties

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <ResourceDialogContent
        size="md"
        hideClose
        className="resource-page__external-preview-dialog"
        style={dialogStyle}
      >
        <ResourceDialogHeader
          icon={item.media_type === 'video' ? Video : ImageIcon}
          title={name}
          close={<ResourceDialogCloseButton aria-label="关闭"><XIcon size={16} /></ResourceDialogCloseButton>}
        />
        <ResourceDialogStack className="resource-page__external-preview-stack">
          <div className="resource-page__external-preview-stage" data-media-type={item.media_type}>
            {previewUrl ? (
              <UrlMediaPreview
                src={previewUrl}
                type={item.media_type}
                poster={item.thumbnail_url}
                alt={name}
              />
            ) : (
              <ResourceAssetPreviewFallback>
                <ResourceTypeIcon type={item.media_type} />
              </ResourceAssetPreviewFallback>
            )}
          </div>
          <ResourceDialogText tone="foreground">
            {[externalResourceMeta(item), item.author_name, item.license_label].filter(Boolean).join(' · ')}
          </ResourceDialogText>
          {item.description ? <ResourceDialogText>{item.description}</ResourceDialogText> : null}
        </ResourceDialogStack>
        <ResourceDialogFooter>
          <ResourcePageActionButton variant="outline" size="sm" onClick={onClose}>
            关闭
          </ResourcePageActionButton>
          <ResourcePageActionButton size="sm" onClick={onAdd} disabled={adding}>
            <Download size={14} />
            加入素材库
          </ResourcePageActionButton>
        </ResourceDialogFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}

function externalResourceMeta(item: ExternalResourceItem) {
  const dimensions = item.width && item.height ? `${item.width}x${item.height}` : ''
  const duration = item.duration_seconds ? `${item.duration_seconds}s` : ''
  return [dimensions, duration].filter(Boolean).join(' · ') || item.media_type
}

function externalResourceAspectRatio(item: ExternalResourceItem) {
  const width = Number(item.width)
  const height = Number(item.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return item.media_type === 'video' ? 16 / 9 : 1
  }
  return clampResourceNumber(width / height, 0.25, 3.2)
}

function roundCssNumber(value: number) {
  return Math.round(value * 1000) / 1000
}

function clampResourceNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
