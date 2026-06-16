import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Upload, Wand2, Loader2, X, AtSign, ImageIcon, VideoIcon, Library } from 'lucide-react'
import { MediaViewer } from './MediaViewer'
import { AgentComposer, AgentComposerAction, AgentComposerSubmit, AgentComposerToolbar } from '@/shared/ui/AgentComposerUi'
import {
  GenerationActionHint,
  GenerationAttachmentList,
  GenerationAttachmentPreview,
  GenerationAttachmentTag,
  GenerationHiddenFileInput,
  GenerationInputSlotCard,
  GenerationMentionEmpty,
  GenerationMentionItem,
  GenerationMentionList,
  GenerationMentionMenu,
  GenerationParamItem,
  GenerationParamsRow,
  GenerationPromptEditor,
  GenerationSlotAttachmentList,
  GenerationSlotAttachmentTag,
  GenerationSlotEmpty,
  GenerationSlotList
} from '@movscript/ui/business/generation'
import { CheckboxField, Input, NativeSelect } from '@movscript/ui/primitives'
import { generationParamLabel, generationSlotLabel } from '@/shared/domain/paramLabels'
import type { RawResource, ParamDef } from '@/types'
import { api } from '@/shared/infrastructure/api'
import { applyResourceChipMediaUrl, buildResourceChipElement, loadResourceChipMediaUrl } from '@/shared/ui/ResourceChipDom'
import { revokeObjectUrls } from '@/shared/ui/objectUrl'
import { IMAGE_UPLOAD_ACCEPT, MEDIA_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import {
  genInputAttachmentPreviewPositionFromElement,
  genInputAttachmentPreviewStyleFromPosition,
  type GenInputAttachmentPreviewPosition,
} from '@/shared/ui/genInputAttachmentPreviewPlacement'

function AttachmentTag({ resource, onRemove }: { resource: RawResource; onRemove: () => void }) {
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

    const { chip, media } = buildResourceChipElement(resource)

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

    // Errors are suppressed (no toast) because responseType=blob is excluded in the interceptor.
    loadResourceChipMediaUrl(resource)
      .then((mediaUrl) => {
        applyResourceChipMediaUrl({
          root: editorRef.current,
          resource,
          media,
          mediaUrl,
          objectUrls: chipObjectUrlsRef.current,
        })
      })
      .catch((e) => { console.error('[chip thumb] fetch failed', resource.url, e?.response?.status, e?.message) })
  }

  // Keep editor DOM in sync when prompt is cleared externally (e.g. after generate)
  const prevPromptRef = useRef(prompt)
  useEffect(() => {
    if (prompt === '' && prevPromptRef.current !== '' && editorRef.current) {
      revokeObjectUrls(chipObjectUrlsRef.current)
      chipObjectUrlsRef.current.clear()
      editorRef.current.innerHTML = ''
    }
    prevPromptRef.current = prompt
  }, [prompt])

  useEffect(() => {
    return () => {
      revokeObjectUrls(chipObjectUrlsRef.current)
      chipObjectUrlsRef.current.clear()
    }
  }, [])

  return (
    <AgentComposer
      className="ms-agent-composer--panel"
      onSubmit={(event) => {
        event.preventDefault()
        if (canGenerate) onGenerate()
      }}
    >
      {/* Prompt area — contenteditable */}
      <div className="relative">
        <GenerationPromptEditor
          ref={editorRef}
          className="ms-agent-composer__rich-field"
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
      </div>

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
        <GenerationParamsRow className="ms-agent-composer__workspace-row">
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
      <AgentComposerToolbar>
        <div className="ms-agent-composer__toolstrip flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <AgentComposerAction
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label={t('shared.genInput.addToLibrary')}
            title={t('shared.genInput.addToLibrary')}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          </AgentComposerAction>
          <GenerationHiddenFileInput
            ref={fileRef}
            accept={accept}
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
          <AgentComposerAction
            onClick={() => {
              const el = editorRef.current
              if (!el) return
              el.focus()
              document.execCommand('insertText', false, '@')
              setMentionQuery('')
            }}
            aria-label={t('shared.genInput.mention')}
            title={t('shared.genInput.mention')}
          >
            <AtSign size={14} />
          </AgentComposerAction>
          <GenerationActionHint data-variant="library" icon={<Library size={12} />}>
            {t('shared.genInput.libraryOnlyHint')}
          </GenerationActionHint>
        </div>
        <div className="ms-agent-composer__submit-group">
          <GenerationActionHint data-variant="shortcut">⌘ + Enter</GenerationActionHint>
          <AgentComposerSubmit
            disabled={!canGenerate}
            running={isRunning}
            label={isRunning ? t('pages.jobs.generating') : t('shared.genInput.generate')}
          >
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          </AgentComposerSubmit>
        </div>
      </AgentComposerToolbar>
    </AgentComposer>
  )
}
