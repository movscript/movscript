import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AudioLines, FileText, ImageIcon, VideoIcon, X } from 'lucide-react'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
import {
  generationDefaultReferenceRoleForMediaType,
  generationReferenceRoleOptionsForMediaType,
} from '@movscript/core/generation'
import {
  GenerationAttachmentPreview,
  GenerationAttachmentTag,
  GenerationInputSlotCard,
  GenerationSlotAttachmentList,
  GenerationSlotAttachmentTag,
  GenerationSlotEmpty,
  GenerationSlotList,
} from '@movscript/ui/business/generation'
import { generationSlotLabel } from '@/shared/domain/paramLabels'
import type { RawResource } from '@/types'
import {
  genInputAttachmentPreviewPositionFromElement,
  genInputAttachmentPreviewStyleFromPosition,
  type GenInputAttachmentPreviewPosition,
} from '@/shared/ui/genInputAttachmentPreviewPlacement'
import type { GenInputReferenceAsset, InputSlotDef } from '@/shared/ui/GenInputCard'

export function AttachmentTag({
  resource,
  referenceAsset,
  onReferenceRoleChange,
  onRemove,
}: {
  resource: RawResource
  referenceAsset?: GenInputReferenceAsset
  onReferenceRoleChange?: (resourceId: number, role: string) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState<GenInputAttachmentPreviewPosition>({ left: 8, top: 8 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tagRef = useRef<HTMLDivElement>(null)
  const mediaType = referenceAsset?.media_type ?? resource.type
  const role = referenceAsset?.role ?? generationDefaultReferenceRoleForMediaType(mediaType) ?? 'generic'

  function handleMouseEnter() {
    timerRef.current = setTimeout(() => {
      if (tagRef.current) {
        setPreviewPos(genInputAttachmentPreviewPositionFromElement(tagRef.current))
      }
      setShowPreview(true)
    }, 2000)
  }

  function handleMouseLeave() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setShowPreview(false)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <GenerationAttachmentTag
          ref={tagRef}
          media={<MediaViewer resource={resource} lightbox={false} />}
          label={resource.name}
          removeIcon={<X size={12} />}
          onRemove={onRemove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
        {onReferenceRoleChange ? (
          <select
            className="h-7 min-w-[92px] rounded-md border border-border bg-surface px-2 text-[11px] font-semibold text-foreground"
            aria-label={`${resource.name} 引用类型`}
            value={role}
            onChange={(event) => onReferenceRoleChange(resource.ID, event.currentTarget.value)}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {generationReferenceRoleOptionsForMediaType(mediaType).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : null}
      </div>

      {showPreview && createPortal(
        <GenerationAttachmentPreview
          media={<MediaViewer resource={resource} lightbox={false} />}
          name={resource.name}
          typeLabel={t(`pages.resources.types.${resource.type}`, { defaultValue: resource.type })}
          style={genInputAttachmentPreviewStyleFromPosition(previewPos)}
        />,
        document.body
      )}
    </>
  )
}

export function GenerationInputSlots({
  slots,
  attachments,
  referenceAssets,
  onReferenceRoleChange,
  onRemoveAttachment,
}: {
  slots: InputSlotDef[]
  attachments: RawResource[]
  referenceAssets?: readonly GenInputReferenceAsset[]
  onReferenceRoleChange?: (resourceId: number, role: string) => void
  onRemoveAttachment: (index: number) => void
}) {
  const { t } = useTranslation()
  const referenceAssetById = new Map(
    (referenceAssets ?? [])
      .filter((asset) => asset.resource_id)
      .map((asset) => [asset.resource_id as number, asset]),
  )

  return (
    <GenerationSlotList>
      {buildSlotGroups(slots, attachments).map(({ slot, items }, i) => {
        const Icon = slot.type === 'video'
          ? VideoIcon
          : slot.type === 'audio'
            ? AudioLines
            : slot.type === 'text'
              ? FileText
              : ImageIcon
        const limitText = slot.maxCount > 0 ? t('shared.genInput.maxCount', { count: slot.maxCount }) : t('shared.genInput.multipleAllowed')
        return (
          <GenerationInputSlotCard
            key={slot.key || i}
            indexLabel={i + 1}
            icon={<Icon size={12} />}
            label={generationSlotLabel(slot, t)}
            requiredLabel={slot.required ? t('shared.genInput.required') : undefined}
            limitLabel={limitText}
            state={items.length > 0 ? 'filled' : slot.required ? 'required' : 'optional'}
          >
            {items.length > 0 ? (
              <GenerationSlotAttachmentList>
                {items.map(({ resource, index }) => (
                  <div key={`${resource.ID}-${index}`} className="flex min-w-0 flex-wrap items-center gap-1">
                    <GenerationSlotAttachmentTag
                      media={<MediaViewer resource={resource} lightbox={false} />}
                      label={resource.name}
                      removeIcon={<X size={10} />}
                      onRemove={() => onRemoveAttachment(index)}
                    />
                    {onReferenceRoleChange ? (
                      <select
                        className="h-7 min-w-[92px] rounded-md border border-border bg-surface px-2 text-[11px] font-semibold text-foreground"
                        aria-label={`${resource.name} 引用类型`}
                        value={referenceAssetById.get(resource.ID)?.role ?? generationDefaultReferenceRoleForMediaType(referenceAssetById.get(resource.ID)?.media_type ?? resource.type) ?? 'generic'}
                        onChange={(event) => onReferenceRoleChange(resource.ID, event.currentTarget.value)}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        {generationReferenceRoleOptionsForMediaType(referenceAssetById.get(resource.ID)?.media_type ?? resource.type).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                ))}
              </GenerationSlotAttachmentList>
            ) : (
              <GenerationSlotEmpty icon={<Icon size={12} />}>
                {t('shared.genInput.selectOrUploadHint')}
              </GenerationSlotEmpty>
            )}
          </GenerationInputSlotCard>
        )
      })}
    </GenerationSlotList>
  )
}

export function buildSlotGroups(slots: InputSlotDef[], attachments: RawResource[]) {
  const used = new Set<number>()
  return slots.map((slot) => {
    const items: Array<{ resource: RawResource; index: number }> = []
    for (let i = 0; i < attachments.length; i++) {
      if (used.has(i)) continue
      const r = attachments[i]
      if (r.type !== slot.type) continue
      if (slot.maxCount > 0 && items.length >= slot.maxCount) continue
      used.add(i)
      items.push({ resource: r, index: i })
    }
    return { slot, items }
  })
}
