import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Upload, Wand2, Loader2, X, AtSign, ImageIcon, VideoIcon, Library } from 'lucide-react'
import { MediaViewer } from './MediaViewer'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { generationParamLabel, generationSlotLabel } from '@/lib/paramLabels'
import type { RawResource, ParamDef } from '@/types'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { IMAGE_UPLOAD_ACCEPT, MEDIA_UPLOAD_ACCEPT } from '@/lib/mediaTypes'

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
  chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;vertical-align:middle;background:var(--muted);border-radius:6px;padding:1px 5px;margin:0 2px;font-size:12px;line-height:1.4;white-space:nowrap;cursor:default;'

  let media: HTMLImageElement | HTMLVideoElement
  if (resource.type === 'video') {
    const vid = document.createElement('video')
    vid.muted = true
    vid.playsInline = true
    vid.preload = 'metadata'
    vid.style.cssText = 'width:18px;height:18px;object-fit:cover;border-radius:3px;flex-shrink:0;background:var(--muted);'
    chip.appendChild(vid)
    media = vid
  } else {
    const img = document.createElement('img')
    img.alt = resource.name
    img.style.cssText = 'width:18px;height:18px;object-fit:cover;border-radius:3px;flex-shrink:0;background:var(--muted);'
    chip.appendChild(img)
    media = img
  }

  const label = document.createElement('span')
  label.textContent = resource.name
  label.style.cssText = 'max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
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
      <div
        ref={tagRef}
        className="flex items-center gap-1.5 bg-muted rounded-full px-2 py-1 cursor-default"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
          <MediaViewer resource={resource} className="w-full h-full" lightbox={false} />
        </div>
        <span className="text-xs text-foreground max-w-[72px] truncate">{resource.name}</span>
        <button onClick={onRemove} className="text-muted-foreground hover:text-foreground shrink-0 transition-colors">
          <X size={11} />
        </button>
      </div>

      {showPreview && createPortal(
        <div
          className="fixed z-[200] bg-background border border-border rounded-xl shadow-2xl p-2 pointer-events-none"
          style={{ left: previewLeft, top: previewTop }}
        >
          <div className="w-48 h-48 rounded-lg overflow-hidden bg-muted">
            <MediaViewer resource={resource} className="w-full h-full" lightbox={false} />
          </div>
          <p className="text-xs text-foreground mt-1.5 truncate max-w-[192px] px-0.5">{resource.name}</p>
          <p className="text-[10px] text-muted-foreground px-0.5 capitalize">{t(`pages.resources.types.${resource.type}`, { defaultValue: resource.type })}</p>
        </div>,
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
    <div className="space-y-0">
      {/* Prompt area — contenteditable */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMentionQuery(null)
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onGenerate() }
          }}
          className="w-full text-sm focus:outline-none bg-transparent text-foreground leading-relaxed min-h-[80px] px-1 py-1 mention-editor"
          data-placeholder={
            promptPlaceholder ??
            t(`shared.genInput.promptPlaceholder.${inputType}`)
          }
        />

        {mentionQuery !== null && (
          <div className="absolute bottom-full left-0 mb-1.5 bg-background border border-border rounded-xl shadow-lg z-20 w-56 overflow-hidden">
            {mentionResources.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2.5">
                {attachments.length === 0 ? t('shared.genInput.addResourcesFirst') : t('shared.genInput.noMatchedResources')}
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                {mentionResources.map((r) => (
                  <button
                    key={r.ID}
                    onMouseDown={(e) => { e.preventDefault(); insertMentionChip(r) }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 text-left transition-colors"
                  >
                    <div className="w-6 h-6 rounded overflow-hidden shrink-0 bg-muted">
                      <MediaViewer resource={r} className="w-full h-full" lightbox={false} />
                    </div>
                    <span className="text-xs text-foreground truncate">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input slots (typed, ordered) — shown when model declares specific input requirements */}
      {inputSlots && inputSlots.length > 0 ? (
        <div className="grid gap-2 py-2">
          {buildSlotGroups(inputSlots, attachments).map(({ slot, items }, i) => {
            const Icon = slot.type === 'video' ? VideoIcon : ImageIcon
            const limitText = slot.maxCount > 0 ? t('shared.genInput.maxCount', { count: slot.maxCount }) : t('shared.genInput.multipleAllowed')
            return (
              <div
                key={slot.key || i}
                className={cn(
                  'rounded-lg border px-2.5 py-2 text-xs transition-colors',
                  items.length > 0
                    ? 'border-border bg-muted'
                    : slot.required
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                    : 'border-dashed border-border text-muted-foreground'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground w-4 text-center">{i + 1}</span>
                  <Icon size={12} className="shrink-0" />
                  <span className="font-medium text-foreground">{generationSlotLabel(slot, t)}</span>
                  {slot.required && <span className="text-[10px] text-amber-600 dark:text-amber-400">{t('shared.genInput.required')}</span>}
                  <span className="text-[10px] text-muted-foreground">{limitText}</span>
                </div>
                {items.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2 pl-5">
                    {items.map(({ resource, index }) => (
                      <div key={`${resource.ID}-${index}`} className="flex items-center gap-1.5 bg-background rounded-full px-2 py-1">
                        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
                          <MediaViewer resource={resource} className="w-full h-full" lightbox={false} />
                        </div>
                        <span className="max-w-[96px] truncate text-foreground">{resource.name}</span>
                        <button onClick={() => onRemoveAttachment(index)} className="text-muted-foreground hover:text-foreground shrink-0">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1 pl-5 text-muted-foreground">
                    <Icon size={11} className="shrink-0" />
                    <span>{t('shared.genInput.selectOrUploadHint')}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : attachments.length > 0 ? (
        /* Legacy flat attachment list */
        <div className="flex flex-wrap gap-1.5 py-1">
          {attachments.map((r, i) => (
            <AttachmentTag key={r.ID} resource={r} onRemove={() => onRemoveAttachment(i)} />
          ))}
        </div>
      ) : null}

      {/* Params row */}
      {params.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 border-t border-border/50">
          {params.map((p) => {
            const val = paramValues[p.key] ?? p.default ?? ''
            return (
              <div key={p.key} className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{generationParamLabel(p, t)}</span>
                {p.type === 'select' && p.options ? (
                  <select
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background text-foreground"
                    value={String(val)}
                    onChange={(e) => onParamChange(p.key, e.target.value)}
                  >
                    {p.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : p.type === 'number' ? (
                  <input
                    type="number"
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background text-foreground w-16"
                    value={Number(val)}
                    min={p.min}
                    max={p.max}
                    step={p.step ?? 1}
                    onChange={(e) => onParamChange(p.key, Number(e.target.value))}
                  />
                ) : p.type === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={(e) => onParamChange(p.key, e.target.checked)}
                    className="rounded"
                  />
                ) : p.type === 'string' ? (
                  <input
                    type="text"
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background text-foreground w-32"
                    value={String(val)}
                    onChange={(e) => onParamChange(p.key, e.target.value)}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {t('shared.genInput.addToLibrary')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
        <button
          onClick={() => {
            const el = editorRef.current
            if (!el) return
            el.focus()
            document.execCommand('insertText', false, '@')
            setMentionQuery('')
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-3 py-1.5 transition-colors"
        >
          <AtSign size={12} /> {t('shared.genInput.mention')}
        </button>
        <span className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground/60">
          <Library size={11} /> {t('shared.genInput.libraryOnlyHint')}
        </span>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground/50 hidden sm:block">⌘ + Enter</span>
        <Button
          onClick={onGenerate}
          disabled={!canGenerate}
          size="sm"
          className="rounded-full"
        >
          {isRunning
            ? <><Loader2 size={13} className="animate-spin mr-1.5" />{t('pages.jobs.generating')}</>
            : <><Wand2 size={13} className="mr-1.5" />{t('shared.genInput.generate')}</>
          }
        </Button>
      </div>
    </div>
  )
}
