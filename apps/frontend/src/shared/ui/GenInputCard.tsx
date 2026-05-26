import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Upload, Wand2, Loader2, X, AtSign, ImageIcon, VideoIcon, Library } from 'lucide-react'
import { MediaViewer } from './MediaViewer'
import {
  CheckboxField,
  GenerationActionBar,
  GenerationActionButton,
  GenerationActionHint,
  GenerationActionSpacer,
  GenerationAttachmentList,
  GenerationAttachmentPreview,
  GenerationAttachmentTag,
  GenerationGenerateButton,
  GenerationHiddenFileInput,
  GenerationInputRoot,
  GenerationInputSlotCard,
  GenerationMentionEmpty,
  GenerationMentionItem,
  GenerationMentionList,
  GenerationMentionMenu,
  GenerationParamItem,
  GenerationParamsRow,
  GenerationPromptArea,
  GenerationPromptEditor,
  GenerationSlotAttachmentList,
  GenerationSlotAttachmentTag,
  GenerationSlotEmpty,
  GenerationSlotList,
  Input,
  NativeSelect,
} from '@movscript/ui'
import { generationParamLabel, generationSlotLabel } from '@/shared/domain/paramLabels'
import type { RawResource, ParamDef } from '@/types'
import { api } from '@/shared/infrastructure/api'
import { API_BASE_URL as API_BASE } from '@/shared/infrastructure/config'
import { IMAGE_UPLOAD_ACCEPT, MEDIA_UPLOAD_ACCEPT } from '@/features/resources/domain/mediaTypes'

// Fetch a media URL for a resource. Backend resource URLs become revocable blob URLs;
// public direct URLs can be assigned as-is.
async function fetchChipMediaUrl(resource: RawResource): Promise<string> {
  if (resource.direct_url) return resource.direct_url
  const src = `${API_BASE}${resource.url}`
  const res = await api.get(src, { baseURL: '', responseType: 'blob' })
  return URL.createObjectURL(res.data)
}

// Builds a chip DOM node with a placeholder thumb container.
// Returns the chip element and the img/video element inside it so the caller can set src later.
function buildChipElement(resource: RawResource): { chip: HTMLElement; media: HTMLImageElement | HTMLVideoElement } {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.resourceName = resource.name
  chip.dataset.resourceId = String(resource.ID)
  chip.className = 'generation-input-chip'

  let media: HTMLImageElement | HTMLVideoElement
  if (resource.type === 'video') {
    const vid = document.createElement('video')
    vid.muted = true
    vid.playsInline = true
    vid.preload = 'metadata'
    vid.className = 'generation-input-chip__media'
    chip.appendChild(vid)
    media = vid
  } else {
    const img = document.createElement('img')
    img.alt = resource.name
    img.className = 'generation-input-chip__media'
    chip.appendChild(img)
    media = img
  }

  const label = document.createElement('span')
  label.textContent = resource.name
  label.className = 'generation-input-chip__label'
  chip.appendChild(label)

  return { chip, media }
}

function AttachmentTag({ resource, onRemove }: { resource: RawResource; onRemove: () => void }) {
  const { t } = useTranslation()
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tagRef = useRef<HTMLDivElement>(null)

  function handleMouseEnter() {
    timerRef.current = setTimeout(() => {
      if (tagRef.current) {
        const rect = tagRef.current.getBoundingClientRect()
        setPreviewPos({ x: rect.left, y: rect.top })
      }
      setShowPreview(true)
    }, 2000)
  }

  function handleMouseLeave() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setShowPreview(false)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const previewLeft = Math.min(previewPos.x, window.innerWidth - 216)
  const previewTop = Math.max(8, previewPos.y - 232)

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
          style={{ left: previewLeft, top: previewTop }}
        />,
        document.body
      )}
    </>
  )
}

export interface InputSlotDef {
  key: string
  label: string       // e.g. "reference image", "source video"
  type: 'image' | 'video'
  required: boolean
  maxCount: number    // 0 = unlimited
}

export interface GenInputCardProps {
  prompt: string
  onPromptChange: (v: string) => void
  attachments: RawResource[]
  onRemoveAttachment: (i: number) => void
  // inputSlots: when provided, replaces the legacy inputType-based attachment UI.
  // Each slot defines what kind of resource is expected at that position.
  inputSlots?: InputSlotDef[]
  params: ParamDef[]
  paramValues: Record<string, string | number | boolean>
  onParamChange: (key: string, val: string | number | boolean) => void
  onGenerate: () => void
  onUpload: (file: File) => void
  isRunning: boolean
  canGenerate: boolean
  selectedModelId: number | null
  inputType: 'image' | 'video' | 'image+video'
  promptPlaceholder?: string
  uploading: boolean
  imageEditRequired?: boolean
}

function buildSlotGroups(slots: InputSlotDef[], attachments: RawResource[]) {
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

export function GenInputCard({
  prompt,
  onPromptChange,
  attachments,
  onRemoveAttachment,
  inputSlots,
  params,
  paramValues,
  onParamChange,
  onGenerate,
  onUpload,
  isRunning,
  canGenerate,
  selectedModelId: _selectedModelId,
  inputType,
  promptPlaceholder,
  uploading,
  imageEditRequired: _imageEditRequired,
}: GenInputCardProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const chipObjectUrlsRef = useRef<Set<string>>(new Set())
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)

  const accept = inputType === 'video' ? 'video/*' : inputType === 'image' ? IMAGE_UPLOAD_ACCEPT : MEDIA_UPLOAD_ACCEPT

  const mentionResources = attachments
    .filter((r) => {
      if (!mentionQuery) return true
      return r.name.toLowerCase().includes(mentionQuery)
    })
    .slice(0, 8)

  // Serialize contenteditable DOM → plain text (chip spans → @[resource:ID])
  function serialize(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    const el = node as HTMLElement
    if (el.dataset?.resourceId) return `@[resource:${el.dataset.resourceId}] `
    return Array.from(node.childNodes).map(serialize).join('')
  }

  // Sync contenteditable → prompt state
  function handleInput() {
    if (!editorRef.current) return
    const text = serialize(editorRef.current)
    onPromptChange(text)

    // Detect @query at cursor
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) { setMentionQuery(null); return }
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) { setMentionQuery(null); return }
    const before = (node.textContent ?? '').slice(0, range.startOffset)
    const match = before.match(/@(\w*)$/)
    setMentionQuery(match ? match[1].toLowerCase() : null)
  }

  // Insert a resource chip at cursor, replacing the @query trigger
  function insertMentionChip(resource: RawResource) {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType === Node.TEXT_NODE) {
      const before = (node.textContent ?? '').slice(0, range.startOffset)
      const match = before.match(/@(\w*)$/)
      if (match) {
        const deleteRange = document.createRange()
        deleteRange.setStart(node, range.startOffset - match[0].length)
        deleteRange.setEnd(node, range.startOffset)
        deleteRange.deleteContents()
      }
    }

    const { chip, media } = buildChipElement(resource)

    const space = document.createTextNode('​')
    const insertRange = sel.getRangeAt(0)
    insertRange.insertNode(space)
    insertRange.insertNode(chip)

    const newRange = document.createRange()
    newRange.setStartAfter(space)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)

    setMentionQuery(null)
    onPromptChange(serialize(editorRef.current))

    // Fetch media URL via authed api and set directly on the media element.
    // Errors are suppressed (no toast) because responseType=blob is excluded in the interceptor.
    fetchChipMediaUrl(resource).then((mediaUrl) => {
      // If the media element was detached by the browser's editing engine, find it again by resource ID
      let target: HTMLImageElement | HTMLVideoElement | null = media
      if (!media.isConnected && editorRef.current) {
        const chip = editorRef.current.querySelector(`[data-resource-id="${resource.ID}"]`)
        target = chip?.querySelector('img, video') as HTMLImageElement | HTMLVideoElement | null
      }
      if (target) {
        if (target.src.startsWith('blob:')) {
          URL.revokeObjectURL(target.src)
          chipObjectUrlsRef.current.delete(target.src)
        }
        target.src = mediaUrl
        if (mediaUrl.startsWith('blob:')) chipObjectUrlsRef.current.add(mediaUrl)
        if (resource.type === 'video') {
          const vid = target as HTMLVideoElement
          vid.addEventListener('loadedmetadata', () => { vid.currentTime = 0.1 }, { once: true })
        }
      } else if (mediaUrl.startsWith('blob:')) {
        URL.revokeObjectURL(mediaUrl)
      }
    }).catch((e) => { console.error('[chip thumb] fetch failed', resource.url, e?.response?.status, e?.message) })
  }

  // Keep editor DOM in sync when prompt is cleared externally (e.g. after generate)
  const prevPromptRef = useRef(prompt)
  useEffect(() => {
    if (prompt === '' && prevPromptRef.current !== '' && editorRef.current) {
      for (const url of chipObjectUrlsRef.current) URL.revokeObjectURL(url)
      chipObjectUrlsRef.current.clear()
      editorRef.current.innerHTML = ''
    }
    prevPromptRef.current = prompt
  }, [prompt])

  useEffect(() => {
    return () => {
      for (const url of chipObjectUrlsRef.current) URL.revokeObjectURL(url)
      chipObjectUrlsRef.current.clear()
    }
  }, [])

  return (
    <GenerationInputRoot>
      {/* Prompt area — contenteditable */}
      <GenerationPromptArea>
        <GenerationPromptEditor
          ref={editorRef}
          onInput={handleInput}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMentionQuery(null)
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onGenerate() }
          }}
          data-placeholder={
            promptPlaceholder ??
            t(`shared.genInput.promptPlaceholder.${inputType}`)
          }
        />

        {mentionQuery !== null && (
          <GenerationMentionMenu>
            {mentionResources.length === 0 ? (
              <GenerationMentionEmpty>
                {attachments.length === 0 ? t('shared.genInput.addResourcesFirst') : t('shared.genInput.noMatchedResources')}
              </GenerationMentionEmpty>
            ) : (
              <GenerationMentionList>
                {mentionResources.map((r) => (
                  <GenerationMentionItem
                    key={r.ID}
                    media={<MediaViewer resource={r} lightbox={false} />}
                    label={r.name}
                    onMouseDown={(e) => { e.preventDefault(); insertMentionChip(r) }}
                  />
                ))}
              </GenerationMentionList>
            )}
          </GenerationMentionMenu>
        )}
      </GenerationPromptArea>

      {/* Input slots (typed, ordered) — shown when model declares specific input requirements */}
      {inputSlots && inputSlots.length > 0 ? (
        <GenerationSlotList>
          {buildSlotGroups(inputSlots, attachments).map(({ slot, items }, i) => {
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
      ) : attachments.length > 0 ? (
        /* Legacy flat attachment list */
        <GenerationAttachmentList>
          {attachments.map((r, i) => (
            <AttachmentTag key={r.ID} resource={r} onRemove={() => onRemoveAttachment(i)} />
          ))}
        </GenerationAttachmentList>
      ) : null}

      {/* Params row */}
      {params.length > 0 && (
        <GenerationParamsRow>
          {params.map((p) => {
            const val = paramValues[p.key] ?? p.default ?? ''
            return (
              <GenerationParamItem key={p.key} label={generationParamLabel(p, t)}>
                {p.type === 'select' && p.options ? (
                  <NativeSelect
                    controlSize="sm"
                    className="type-label"
                    value={String(val)}
                    onChange={(e) => onParamChange(p.key, e.target.value)}
                  >
                    {p.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </NativeSelect>
                ) : p.type === 'number' ? (
                  <Input
                    type="number"
                    className="h-8 w-16 type-label"
                    value={Number(val)}
                    min={p.min}
                    max={p.max}
                    step={p.step ?? 1}
                    onChange={(e) => onParamChange(p.key, Number(e.target.value))}
                  />
                ) : p.type === 'boolean' ? (
                  <CheckboxField
                    controlSize="sm"
                    variant="subtle"
                    checked={Boolean(val)}
                    onCheckedChange={(checked) => onParamChange(p.key, checked)}
                  />
                ) : p.type === 'string' ? (
                  <Input
                    type="text"
                    className="h-8 w-32 type-label"
                    value={String(val)}
                    onChange={(e) => onParamChange(p.key, e.target.value)}
                  />
                ) : null}
              </GenerationParamItem>
            )
          })}
        </GenerationParamsRow>
      )}

      {/* Action bar */}
      <GenerationActionBar>
        <GenerationActionButton
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          icon={uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        >
          {t('shared.genInput.addToLibrary')}
        </GenerationActionButton>
        <GenerationHiddenFileInput
          ref={fileRef}
          accept={accept}
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
        <GenerationActionButton
          onClick={() => {
            const el = editorRef.current
            if (!el) return
            el.focus()
            document.execCommand('insertText', false, '@')
            setMentionQuery('')
          }}
          icon={<AtSign size={12} />}
        >
          {t('shared.genInput.mention')}
        </GenerationActionButton>
        <GenerationActionHint data-variant="library" icon={<Library size={12} />}>
          {t('shared.genInput.libraryOnlyHint')}
        </GenerationActionHint>
        <GenerationActionSpacer />
        <GenerationActionHint data-variant="shortcut">⌘ + Enter</GenerationActionHint>
        <GenerationGenerateButton
          onClick={onGenerate}
          disabled={!canGenerate}
          icon={isRunning ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
        >
          {isRunning ? t('pages.jobs.generating') : t('shared.genInput.generate')}
        </GenerationGenerateButton>
      </GenerationActionBar>
    </GenerationInputRoot>
  )
}
