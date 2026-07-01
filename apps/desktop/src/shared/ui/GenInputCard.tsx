import { useRef, useState, useEffect, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatResourceMention } from '@movscript/workspace'
import {
  generationDefaultReferenceRoleForMediaType,
  generationParamRequiresValueSatisfied,
  generationReferenceRoleLabel,
  generationReferenceRoleOptionsForMediaType,
} from '@movscript/core/generation'
import { generationParamLabel } from '@movscript/shared'
import { Upload, Wand2, Loader2, AtSign, Library } from 'lucide-react'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
import { AgentComposerAction, AgentComposerSubmit } from '@/shared/ui/AgentComposerUi'
import {
  GenerationCallBadge,
  GenerationCallComposerForm,
  GenerationCallConfigBlock,
  GenerationCallField,
  GenerationCallFooter,
  GenerationCallMessages,
  GenerationCallMetaRow,
  GenerationCallPromptBlock,
  GenerationActionHint,
  GenerationAttachmentList,
  GenerationHiddenFileInput,
  GenerationMentionEmpty,
  GenerationMentionItem,
  GenerationMentionList,
  GenerationMentionMenu,
  GenerationParamPreview,
  GenerationPromptEditor,
  GenerationReferenceRoleMenu,
} from '@movscript/ui/business/generation'
import type { RawResource, ParamDef } from '@/types'
import { buildResourceChipElement, resourceChipDisplayLabel } from '@/shared/ui/ResourceChipDom'
import { IMAGE_UPLOAD_ACCEPT, MEDIA_UPLOAD_ACCEPT, RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import { AttachmentTag, GenerationInputSlots } from '@/shared/ui/GenInputAttachments'
import { genInputResourceRoleMenuPositionFromElements } from '@/shared/ui/genInputAttachmentPreviewPlacement'
import { GenerationParamControls } from './GenerationParamControls'

export type ToolInputResourceType = 'image' | 'video' | 'audio' | 'text'
export type ToolInputType = 'none' | ToolInputResourceType | 'image+video' | 'media'
export type GenInputReferenceAsset = {
  role: string
  media_type?: string
  resource_id?: number
}

type ResourceRoleMenuState = {
  left: number
  top: number
  resourceId: number
  mediaType?: string
  role?: string
}

export interface InputSlotDef {
  key: string
  label: string       // e.g. "reference image", "source video"
  type: ToolInputResourceType
  required: boolean
  maxCount: number    // 0 = unlimited
}

export interface GenInputCardProps {
  prompt: string
  onPromptChange: (v: string) => void
  attachments: RawResource[]
  onRemoveAttachment: (i: number) => void
  onReferenceAssetRoleChange?: (resourceId: number, role: string) => void
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
  selectedModelId: string | null
  inputType: ToolInputType
  promptPlaceholder?: string
  uploading: boolean
  referenceAssets?: readonly GenInputReferenceAsset[]
  intentLabel?: ReactNode
  outputLabel?: ReactNode
  modelControl?: ReactNode
  modelLabel?: ReactNode
  messages?: readonly ReactNode[]
}

export function GenInputCard({
  prompt,
  onPromptChange,
  attachments,
  onRemoveAttachment,
  onReferenceAssetRoleChange,
  inputSlots,
  params,
  paramValues,
  onParamChange,
  onGenerate,
  onUpload,
  isRunning,
  canGenerate,
  selectedModelId,
  inputType,
  promptPlaceholder,
  uploading,
  referenceAssets,
  intentLabel,
  outputLabel,
  modelControl,
  modelLabel,
  messages = [],
}: GenInputCardProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const promptShellRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const roleMenuChipRef = useRef<HTMLElement | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [roleMenu, setRoleMenu] = useState<ResourceRoleMenuState | null>(null)

  const acceptsMediaInput = inputType !== 'none'
  const accept = inputType === 'video'
    ? 'video/*'
    : inputType === 'audio'
      ? 'audio/*'
      : inputType === 'image'
        ? IMAGE_UPLOAD_ACCEPT
        : inputType === 'media'
          ? RESOURCE_UPLOAD_ACCEPT
          : MEDIA_UPLOAD_ACCEPT

  const mentionResources = attachments
    .filter((r) => {
      if (!mentionQuery) return true
      return r.name.toLowerCase().includes(mentionQuery)
    })
    .slice(0, 8)
  const referenceAssetById = new Map(
    (referenceAssets ?? [])
      .filter((asset) => asset.resource_id)
      .map((asset) => [asset.resource_id as number, asset]),
  )
  const referenceAssetsKey = (referenceAssets ?? [])
    .map((asset) => `${asset.resource_id ?? ''}:${asset.media_type ?? ''}:${asset.role}`)
    .join('|')
  const visibleParamPreviewItems = params
    .filter((param) => generationParamRequiresValueSatisfied(param, paramValues))
    .slice(0, 6)
    .map((param) => ({
      label: generationParamLabel(param, t),
      value: String(paramValues[param.key] ?? param.default ?? '默认'),
    }))
  const paramPreviewItems = [
    {
      label: t('shared.generation.intentLabel', { defaultValue: '品类' }),
      value: intentLabel ?? t('shared.generation.intentUnknown', { defaultValue: '待推导' }),
      tone: canGenerate ? 'ready' as const : 'warning' as const,
    },
    {
      label: t('shared.generation.outputLabel', { defaultValue: '输出' }),
      value: outputLabel ?? t(`shared.genInput.promptPlaceholder.${inputType}`, { defaultValue: inputType }),
    },
    ...(selectedModelId ? [{
      label: modelLabel ?? t('shared.modelSelector.label', { defaultValue: '模型' }),
      value: selectedModelId,
    }] : []),
    ...visibleParamPreviewItems,
    ...(params.filter((param) => generationParamRequiresValueSatisfied(param, paramValues)).length > 6 ? [{
      label: t('common.more', { defaultValue: '更多' }),
      value: `+${params.filter((param) => generationParamRequiresValueSatisfied(param, paramValues)).length - 6}`,
    }] : []),
  ]

  // Serialize contenteditable DOM → plain text (chip spans → @[resource:ID])
  function serialize(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    const el = node as HTMLElement
    if (el.dataset?.resourceId) {
      const resourceId = Number(el.dataset.resourceId)
      const asset = referenceAssetById.get(resourceId)
      return `${formatResourceMention(resourceId, {
        mediaType: el.dataset.mediaType ?? asset?.media_type,
        role: el.dataset.role ?? asset?.role,
      })} `
    }
    return Array.from(node.childNodes).map(serialize).join('')
  }

  // Sync contenteditable → prompt state
  function handleInput() {
    if (!editorRef.current) return
    setRoleMenu(null)
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

    const metadata = referenceMetadataForResource(resource)
    const { chip } = buildResourceChipElement(resource, {
      mediaType: metadata.mediaType,
      role: metadata.role,
      roleLabel: generationReferenceRoleLabel(metadata.role),
      sourceLabel: t('shared.generation.referenceSource.resource', { defaultValue: '资源' }),
    })

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
  }

  function referenceMetadataForResource(resource: RawResource) {
    const asset = referenceAssetById.get(resource.ID)
    const mediaType = asset?.media_type ?? resource.type
    const role = asset?.role ?? generationDefaultReferenceRoleForMediaType(mediaType)
    return { mediaType, role }
  }

  function handleEditorMouseDown(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null
    const chip = target?.closest<HTMLElement>('[data-resource-id]')
    if (!chip || !editorRef.current?.contains(chip)) {
      setRoleMenu(null)
      roleMenuChipRef.current = null
      return
    }
    event.preventDefault()
    const resourceId = Number(chip.dataset.resourceId)
    if (!Number.isInteger(resourceId)) return
    const menuPosition = genInputResourceRoleMenuPositionFromElements(chip, promptShellRef.current)
    roleMenuChipRef.current = chip
    const mediaType = chip.dataset.mediaType ?? referenceAssetById.get(resourceId)?.media_type
    const role = chip.dataset.role ?? referenceAssetById.get(resourceId)?.role
    setMentionQuery(null)
    setRoleMenu({
      resourceId,
      mediaType,
      role,
      ...menuPosition,
    })
  }

  function selectResourceRole(role: string) {
    const chip = roleMenuChipRef.current
    if (!chip || !editorRef.current) {
      setRoleMenu(null)
      return
    }
    const mediaType = roleMenu?.mediaType ?? chip.dataset.mediaType
    const resourceId = roleMenu?.resourceId ?? Number(chip.dataset.resourceId)
    chip.dataset.role = role
    if (mediaType) chip.dataset.mediaType = mediaType
    const label = chip.querySelector<HTMLElement>('.generation-input-chip__label')
    if (label) {
      label.textContent = resourceChipDisplayLabel({
        role,
        mediaType,
        sourceLabel: chip.dataset.sourceLabel,
      })
    }
    onReferenceAssetRoleChange?.(resourceId, role)
    onPromptChange(serialize(editorRef.current))
    setRoleMenu(null)
    roleMenuChipRef.current = null
  }

  // Keep editor DOM in sync when prompt is cleared externally (e.g. after generate)
  const prevPromptRef = useRef(prompt)
  useEffect(() => {
    if (prompt === '' && prevPromptRef.current !== '' && editorRef.current) {
      editorRef.current.innerHTML = ''
    }
    prevPromptRef.current = prompt
  }, [prompt])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    let changed = false
    for (const chip of Array.from(editor.querySelectorAll<HTMLElement>('[data-resource-id]'))) {
      const resourceId = Number(chip.dataset.resourceId)
      if (!Number.isInteger(resourceId)) continue
      const asset = referenceAssetById.get(resourceId)
      if (!asset) continue
      const mediaType = asset.media_type ?? chip.dataset.mediaType
      const role = asset.role ?? chip.dataset.role
      if (mediaType && chip.dataset.mediaType !== mediaType) {
        chip.dataset.mediaType = mediaType
        changed = true
      }
      if (role && chip.dataset.role !== role) {
        chip.dataset.role = role
        const label = chip.querySelector<HTMLElement>('.generation-input-chip__label')
        if (label) {
          label.textContent = resourceChipDisplayLabel({
            role,
            mediaType,
            sourceLabel: chip.dataset.sourceLabel,
          })
        }
        changed = true
      }
    }
    if (changed) {
      const nextPrompt = serialize(editor)
      if (nextPrompt !== prompt) onPromptChange(nextPrompt)
    }
  }, [referenceAssetsKey, prompt, onPromptChange])

  return (
    <GenerationCallComposerForm
      className="ms-agent-composer--panel"
      onSubmit={(event) => {
        event.preventDefault()
        if (canGenerate) onGenerate()
      }}
    >
      <GenerationCallPromptBlock label={t('shared.generation.promptLabel', { defaultValue: '提示词' })}>
        <div ref={promptShellRef} className="relative">
          <GenerationPromptEditor
            ref={editorRef}
            className="ms-agent-composer__rich-field"
            onInput={handleInput}
            onMouseDown={handleEditorMouseDown}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMentionQuery(null)
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (canGenerate) onGenerate()
              }
            }}
            data-placeholder={
              promptPlaceholder ??
              t(`shared.genInput.promptPlaceholder.${inputType}`)
            }
          />

          {roleMenu ? (
            <GenerationReferenceRoleMenu
              options={generationReferenceRoleOptionsForMediaType(roleMenu.mediaType)}
              value={roleMenu.role}
              onRoleSelect={selectResourceRole}
              style={{ left: roleMenu.left, top: roleMenu.top }}
            />
          ) : null}

          {acceptsMediaInput && mentionQuery !== null && (
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

        {inputSlots && inputSlots.length > 0 ? (
          <GenerationInputSlots
            slots={inputSlots}
            attachments={attachments}
            referenceAssets={referenceAssets}
            onReferenceRoleChange={onReferenceAssetRoleChange}
            onRemoveAttachment={onRemoveAttachment}
          />
        ) : acceptsMediaInput && attachments.length > 0 ? (
          <GenerationAttachmentList>
            {attachments.map((r, i) => (
              <AttachmentTag
                key={r.ID}
                resource={r}
                referenceAsset={referenceAssetById.get(r.ID)}
                onReferenceRoleChange={onReferenceAssetRoleChange}
                onRemove={() => onRemoveAttachment(i)}
              />
            ))}
          </GenerationAttachmentList>
        ) : null}
      </GenerationCallPromptBlock>

      <GenerationCallConfigBlock label={t('shared.generation.parametersLabel', { defaultValue: '模型与参数' })}>
        <GenerationCallMetaRow>
          <GenerationCallField label={t('shared.generation.intentLabel', { defaultValue: '品类' })}>
            <GenerationCallBadge tone={canGenerate ? 'ready' : messages.length > 0 ? 'warning' : 'neutral'}>
              {intentLabel ?? t('shared.generation.intentUnknown', { defaultValue: '待推导' })}
            </GenerationCallBadge>
          </GenerationCallField>
          <GenerationCallField label={t('shared.generation.outputLabel', { defaultValue: '输出' })}>
            <GenerationCallBadge>
              {outputLabel ?? t(`shared.genInput.promptPlaceholder.${inputType}`, { defaultValue: inputType })}
            </GenerationCallBadge>
          </GenerationCallField>
          {modelControl ? (
            <GenerationCallField label={modelLabel ?? t('shared.modelSelector.label', { defaultValue: '模型' })}>
              {modelControl}
            </GenerationCallField>
          ) : null}
        </GenerationCallMetaRow>

        <GenerationParamControls
          params={params}
          values={paramValues}
          onChange={onParamChange}
          className="ms-agent-composer__workspace-row"
        />

        <GenerationParamPreview items={paramPreviewItems} />

        <GenerationCallMessages messages={messages} />

        <GenerationCallFooter>
        <div className="ms-agent-composer__toolstrip flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {acceptsMediaInput ? (
            <>
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
            </>
          ) : null}
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
        </GenerationCallFooter>
      </GenerationCallConfigBlock>
    </GenerationCallComposerForm>
  )
}
