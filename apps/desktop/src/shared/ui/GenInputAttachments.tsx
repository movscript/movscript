import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ImageIcon, VideoIcon, X } from 'lucide-react'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
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
import type { InputSlotDef } from '@/shared/ui/GenInputCard'

export function AttachmentTag({ resource, onRemove }: { resource: RawResource; onRemove: () => void }) {
  const { t } = useTranslation()
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState<GenInputAttachmentPreviewPosition>({ left: 8, top: 8 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tagRef = useRef<HTMLDivElement>(null)

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
      <GenerationAttachmentTag
        ref={tagRef}
        media={<MediaViewer resource={resource} lightbox={false} />}
        label={resource.name}
        removeIcon={<X size={12} />}
        onRemove={onRemove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

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
  onRemoveAttachment,
}: {
  slots: InputSlotDef[]
  attachments: RawResource[]
  onRemoveAttachment: (index: number) => void
}) {
  const { t } = useTranslation()

  return (
    <GenerationSlotList>
      {buildSlotGroups(slots, attachments).map(({ slot, items }, i) => {
        const Icon = slot.type === 'video' ? VideoIcon : ImageIcon
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
                  <GenerationSlotAttachmentTag
                    key={`${resource.ID}-${index}`}
                    media={<MediaViewer resource={resource} lightbox={false} />}
                    label={resource.name}
                    removeIcon={<X size={10} />}
                    onRemove={() => onRemoveAttachment(index)}
                  />
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
