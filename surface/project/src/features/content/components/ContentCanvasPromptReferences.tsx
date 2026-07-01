import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent, type FocusEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { File, Image, Trash2, Video } from 'lucide-react'

import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { readResourceDragPayload, resourceDropAcceptsPayload, type ResourceDragPayloadResource } from '@movscript/resource-surface/resource-interaction'
import { resolveResourceFileImageUrl, resolveResourceFileUrl } from '@movscript/resource-surface/resource-media'
import { ResourceFileImage, ResourceFileVideo } from '@movscript/resource-surface/resource-media-components'
import { formatResourceMention, parseResourceMentions } from '@movscript/workspace'
import {
  generationDefaultReferenceRoleForMediaType,
  generationReferenceMediaTypeShortLabel,
  generationReferenceRoleLabel,
  generationReferenceRoleOptionsForMediaType,
  generationResourceReferenceLabel,
} from '@movscript/core/generation'

import { candidatesForNode, generationReferencesFromContentNode, iconForContentNode } from './contentCanvasWorkspaceModel'
import type { CandidateSelections } from './contentCanvasWorkspaceTypes'

export type PromptReferenceItem = {
  kind: 'asset' | 'candidate' | 'resource' | 'keyframe' | 'storyboard' | 'scene_moment' | 'expression_unit' | 'content_unit'
  referenceId?: string
  token: string
  raw: string
  title: string
  label: string
  sourceLabel: string
  node?: ContentCanvasNode
  resourceId?: number
  mediaType?: 'image' | 'video' | 'audio' | 'file'
  role?: string
  selectedResourceId?: number
  selectedMediaType?: 'image' | 'video' | 'audio' | 'file'
  previewResourceId?: number
  previewMediaType?: 'image' | 'video' | 'audio' | 'file'
  state: 'selected' | 'pending' | 'empty' | 'missing'
  actionLabel: string
  missing?: boolean
}

export type PromptReferenceDroppedResource = {
  id: number
  name: string
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
  mimeType?: string
}

const PROMPT_REFERENCE_PATTERN = /\{\{\s*(ref|asset|candidate|resource|keyframe|storyboard|scene_moment|expression_unit|content_unit):{1,2}\s*([^}]+?)\s*\}\}/g
const PROMPT_REFERENCE_TRIGGER_RE = /(?:^|[\s([{（【，,。.;；:：、])[@＠]([^\s@＠\[{]*)$/u

type PromptReferenceMatchKind = PromptReferenceItem['kind'] | 'ref'

type PromptReferenceMatch = {
  kind: PromptReferenceMatchKind
  referenceId?: string
  token: string
  raw: string
  index: number
  label?: string
  resourceId?: number
  mediaType?: PromptReferenceItem['mediaType']
  role?: string
}

export function PromptReferenceInlineEditor({
  prompt,
  nodes,
  mentionNodes = nodes,
  ownerNode,
  referenceItems,
  candidateSelections,
  className,
  ariaLabel,
  onChange,
  onBlur,
  onSelectNode,
  onResourceReferenceDrop,
}: {
  prompt: string
  nodes: ContentCanvasNode[]
  mentionNodes?: ContentCanvasNode[]
  ownerNode: ContentCanvasNode | undefined
  referenceItems?: PromptReferenceItem[]
  candidateSelections: CandidateSelections
  className?: string
  ariaLabel: string
  onChange: (prompt: string) => void
  onBlur: (prompt: string) => void
  onSelectNode: (node: ContentCanvasNode) => void
  onResourceReferenceDrop?: (resource: PromptReferenceDroppedResource) => void
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const lastEditorValueRef = useRef(prompt)
  const [mentionRange, setMentionRange] = useState<PromptMentionRange | null>(null)
  const [mentionMenuPoint, setMentionMenuPoint] = useState<PromptMentionMenuPoint | null>(null)
  const [roleMenu, setRoleMenu] = useState<PromptReferenceRoleMenuState | null>(null)
  const mentionOptions = useMemo(
    () => referenceItems
      ? filterPromptMentionOptions(referenceItems, mentionRange?.query ?? '')
      : promptMentionOptions(mentionNodes, ownerNode, candidateSelections, mentionRange?.query ?? ''),
    [candidateSelections, mentionNodes, mentionRange?.query, ownerNode, referenceItems],
  )
  const mentionMenuOpen = Boolean(mentionRange)
  const segments = useMemo(
    () => promptReferenceSegments(prompt, nodes, ownerNode, candidateSelections, referenceItems),
    [candidateSelections, nodes, ownerNode, prompt, referenceItems],
  )
  const referencesByRaw = useMemo(() => {
    const entries = segments.flatMap((part) => part.kind === 'reference'
      ? [[part.reference.raw, part.reference] as const]
      : [])
    return new Map(entries)
  }, [segments])
  const html = useMemo(() => promptReferenceEditorHtml(segments), [segments])
  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const currentValue = serializePromptEditor(editor)
    if (currentValue === prompt && editor.innerHTML === html) {
      lastEditorValueRef.current = prompt
      return
    }
    if (document.activeElement === editor && lastEditorValueRef.current === prompt) return
    editor.innerHTML = html
    lastEditorValueRef.current = prompt
  }, [html, prompt])
  const handleInput = useCallback((event: FormEvent<HTMLDivElement>) => {
    const state = readPromptEditorState(event.currentTarget)
    lastEditorValueRef.current = state.value
    onChange(state.value)
    setRoleMenu(null)
    const nextMentionRange = promptMentionRangeFromTextBeforeCaret(state.textBeforeCaret, state.caret)
    setMentionRange(nextMentionRange)
    setMentionMenuPoint(nextMentionRange ? promptMentionMenuPointForEditor(event.currentTarget) : null)
  }, [onChange])
  const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    setMentionRange(null)
    setMentionMenuPoint(null)
  }, [])
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!resourceDropAcceptsPayload(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = onResourceReferenceDrop ? 'copy' : 'none'
  }, [onResourceReferenceDrop])
  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!resourceDropAcceptsPayload(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    setMentionRange(null)
    setMentionMenuPoint(null)
    setRoleMenu(null)
    const resource = promptReferenceDroppedResourceFromDropEvent(event)
    if (resource) onResourceReferenceDrop?.(resource)
  }, [onResourceReferenceDrop])
  const handleMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>('[data-prompt-reference-raw]')
      : null
    const raw = target?.dataset.promptReferenceRaw
    if (!raw) return
    event.preventDefault()
    const reference = referencesByRaw.get(raw)
    if (reference) {
      if (reference.referenceId) return
      const shell = shellRef.current
      const targetRect = target.getBoundingClientRect()
      const shellRect = shell?.getBoundingClientRect()
      const mediaType = reference.previewMediaType ?? reference.selectedMediaType ?? reference.mediaType ?? 'image'
      setMentionRange(null)
      setMentionMenuPoint(null)
      setRoleMenu({
        kind: reference.kind,
        raw,
        token: reference.token,
        ...(reference.resourceId !== undefined ? { resourceId: reference.resourceId } : {}),
        mediaType,
        role: reference.role ?? defaultReferenceRoleForMediaType(mediaType),
        left: shellRect ? Math.max(0, Math.min(targetRect.left - shellRect.left, shellRect.width - 220)) : 0,
        top: shellRect ? targetRect.bottom - shellRect.top + 6 : 0,
      })
    }
  }, [referencesByRaw])
  const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    setMentionRange(null)
    setMentionMenuPoint(null)
    onBlur(serializePromptEditor(event.currentTarget))
  }, [onBlur])
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && mentionRange) {
      event.preventDefault()
      setMentionRange(null)
      setMentionMenuPoint(null)
      return
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && mentionRange && mentionOptions[0]) {
      event.preventDefault()
      insertPromptReferenceToken({
        editor: event.currentTarget,
        token: mentionOptions[0].raw,
        prompt,
        onChange,
        setMentionRange,
        setMentionMenuPoint,
        range: mentionRange,
      })
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.currentTarget.blur()
    }
  }, [mentionOptions, mentionRange, onChange, prompt])

  return (
    <div className="content-canvas-prompt-inline-editor-shell" ref={shellRef}>
      <div
        ref={editorRef}
        className={['content-canvas-prompt-inline-editor', className].filter(Boolean).join(' ')}
        role="textbox"
        contentEditable
        suppressContentEditableWarning
        aria-label={ariaLabel}
        spellCheck={false}
        data-empty={prompt.trim() ? undefined : 'true'}
        onInput={handleInput}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {mentionMenuOpen ? (
        <PromptMentionMenu
          options={mentionOptions}
          point={mentionMenuPoint}
          emptyLabel={referenceItems ? '先在引用区添加图片或视频参考' : '没有可引用的节点'}
          onSelect={(option) => {
            const editor = editorRef.current
            if (!editor || !mentionRange) return
            const mediaType = option.previewMediaType ?? option.selectedMediaType ?? option.mediaType ?? 'image'
            insertPromptReferenceToken({
              editor,
              token: promptReferenceInsertionToken(option, {
                mediaType,
                role: option.role ?? defaultReferenceRoleForMediaType(mediaType),
              }),
              prompt,
              onChange,
              setMentionRange,
              setMentionMenuPoint,
              range: mentionRange,
            })
          }}
        />
      ) : null}
      {roleMenu ? (
        <PromptReferenceRoleMenu
          state={roleMenu}
          onSelect={(role) => {
            const nextPrompt = replacePromptReferenceRaw(
              prompt,
              roleMenu.raw,
              roleMenu.kind === 'resource' && roleMenu.resourceId !== undefined
                ? formatResourceMention(roleMenu.resourceId, {
                  mediaType: roleMenu.mediaType,
                  role,
                })
                : formatPromptReferenceToken(roleMenu.kind, roleMenu.token, {
                  mediaType: roleMenu.mediaType,
                  role,
                }),
            )
            setRoleMenu(null)
            onChange(nextPrompt)
          }}
          onClose={() => setRoleMenu(null)}
        />
      ) : null}
    </div>
  )
}

export function PromptReferenceStrip({
  prompt,
  nodes,
  ownerNode,
  candidateSelections = {},
  onSelectNode,
}: {
  prompt: string
  nodes: ContentCanvasNode[]
  ownerNode: ContentCanvasNode | undefined
  candidateSelections?: CandidateSelections
  onSelectNode: (node: ContentCanvasNode) => void
}) {
  const references = promptReferenceItems(prompt, nodes, ownerNode, candidateSelections)
  if (!references.length) return null
  return (
    <div className="content-canvas-prompt-reference-strip" aria-label="提示词引用预览">
      {references.map((reference) => (
        <button
          key={`${reference.kind}:${reference.token}`}
          type="button"
          data-state={reference.state}
          data-missing={reference.missing ? 'true' : undefined}
          onClick={() => {
            if (reference.node) onSelectNode(reference.node)
          }}
          disabled={!reference.node}
        >
          <span className="content-canvas-prompt-reference-strip__meta">
            <small>{promptReferenceMediaLabel(reference.previewMediaType ?? reference.selectedMediaType ?? reference.mediaType)}</small>
            <b>{promptReferenceInlineRoleLabel(reference)}</b>
          </span>
          <PromptReferenceThumb reference={reference} />
          <span className="content-canvas-prompt-reference-strip__body">
            <strong>{reference.title}</strong>
          </span>
        </button>
      ))}
    </div>
  )
}

export function PromptReferencePoolStrip({
  references,
  onReferenceRemove,
  onReferenceRoleChange,
  onResourceReferenceDrop,
  onSelectNode,
}: {
  references: PromptReferenceItem[]
  onReferenceRemove?: (reference: PromptReferenceItem) => void
  onReferenceRoleChange?: (reference: PromptReferenceItem, role: string) => void
  onResourceReferenceDrop?: (resource: PromptReferenceDroppedResource) => void
  onSelectNode: (node: ContentCanvasNode) => void
}) {
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!onResourceReferenceDrop || !resourceDropAcceptsPayload(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }, [onResourceReferenceDrop])
  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!onResourceReferenceDrop || !resourceDropAcceptsPayload(event.dataTransfer)) return
    const resource = promptReferenceDroppedResourceFromDropEvent(event)
    if (!resource) return
    event.preventDefault()
    event.stopPropagation()
    onResourceReferenceDrop(resource)
  }, [onResourceReferenceDrop])
  if (!references.length && !onResourceReferenceDrop) return null
  return (
    <div
      className="content-canvas-prompt-reference-strip"
      aria-label="生成引用参数"
      data-empty={references.length ? undefined : 'true'}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {references.map((reference) => (
        <div
          key={`pool:${reference.referenceId ?? reference.kind}:${reference.token}:${reference.role ?? ''}`}
          className="content-canvas-prompt-reference-strip__item"
          data-state={reference.state}
          data-missing={reference.missing ? 'true' : undefined}
        >
          <button
            className="content-canvas-prompt-reference-strip__main"
            type="button"
            onClick={() => {
              if (reference.node) onSelectNode(reference.node)
            }}
            disabled={!reference.node}
          >
            <span className="content-canvas-prompt-reference-strip__meta">
              <small>{promptReferenceMediaLabel(reference.previewMediaType ?? reference.selectedMediaType ?? reference.mediaType)}</small>
              <b>{promptReferenceInlineRoleLabel(reference)}</b>
            </span>
            <PromptReferenceThumb reference={reference} />
            <span className="content-canvas-prompt-reference-strip__body">
              <strong>{reference.title}</strong>
            </span>
          </button>
          {onReferenceRoleChange ? (
            <select
              className="content-canvas-prompt-reference-strip__role nodrag"
              aria-label={`${reference.title} 引用类型`}
              value={reference.role ?? defaultReferenceRoleForReference(reference)}
              onChange={(event) => onReferenceRoleChange(reference, event.currentTarget.value)}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {promptReferenceRoleOptions(reference.previewMediaType ?? reference.selectedMediaType ?? reference.mediaType).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : null}
          {onReferenceRemove ? (
            <button
              className="content-canvas-prompt-reference-strip__remove nodrag"
              type="button"
              aria-label={`移除 ${reference.title}`}
              title="移除引用"
              onClick={() => onReferenceRemove(reference)}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

type PromptReferenceDragPayloadResource = ResourceDragPayloadResource & {
  name?: unknown
  type?: unknown
  mime_type?: unknown
  mimeType?: unknown
}

function promptReferenceDroppedResourceFromDropEvent(event: DragEvent): PromptReferenceDroppedResource | null {
  const payload = readResourceDragPayload<PromptReferenceDragPayloadResource>(event.dataTransfer)
  if (!payload) return null
  const resource = payload.resource
  const mimeType = stringValue(resource?.mime_type) ?? stringValue(resource?.mimeType)
  return {
    id: payload.resourceId,
    name: stringValue(resource?.name) ?? `Resource ${payload.resourceId}`,
    type: promptReferenceDroppedResourceType(resource?.type, mimeType),
    ...(mimeType ? { mimeType } : {}),
  }
}

function promptReferenceDroppedResourceType(value: unknown, mimeType: string | undefined): PromptReferenceDroppedResource['type'] {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'file') return value
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType?.startsWith('audio/')) return 'audio'
  if (mimeType?.startsWith('text/')) return 'text'
  return 'file'
}

function PromptReferenceThumb({ reference }: { reference: PromptReferenceItem }) {
  if (reference.previewResourceId !== undefined && reference.previewMediaType === 'image') {
    return <ResourceFileImage resourceId={reference.previewResourceId} alt={reference.title} loading="lazy" thumbnailMaxSize={96} />
  }
  if (reference.previewResourceId !== undefined && reference.previewMediaType === 'video') {
    return <ResourceFileVideo resourceId={reference.previewResourceId} muted playsInline preload="metadata" />
  }
  const Icon = iconForPromptReference(reference)
  return (
    <span className="content-canvas-prompt-reference-strip__fallback">
      <Icon size={15} aria-hidden="true" />
    </span>
  )
}

function promptReferenceItems(
  prompt: string,
  nodes: ContentCanvasNode[],
  ownerNode: ContentCanvasNode | undefined,
  candidateSelections: CandidateSelections,
): PromptReferenceItem[] {
  const output: PromptReferenceItem[] = []
  const seen = new Set<string>()
  for (const match of promptReferenceMatches(prompt)) {
    const key = `${match.kind}:${match.token}:${match.mediaType ?? ''}:${match.role ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(resolvePromptReference(match, nodes, ownerNode, candidateSelections))
  }
  return output
}

export function promptReferenceItemsFromGenerationReferences(
  ownerNode: ContentCanvasNode | undefined,
  nodes: ContentCanvasNode[],
  candidateSelections: CandidateSelections,
  references = generationReferencesFromContentNode(ownerNode),
): PromptReferenceItem[] {
  return promptReferenceItemsFromReferences(references, ownerNode, nodes, candidateSelections)
}

export function promptReferenceItemsFromReferences(
  references: ReturnType<typeof generationReferencesFromContentNode>,
  ownerNode: ContentCanvasNode | undefined,
  nodes: ContentCanvasNode[],
  candidateSelections: CandidateSelections,
): PromptReferenceItem[] {
  return references.flatMap((reference): PromptReferenceItem[] => {
    const kind = promptReferenceKindFromValue(reference.kind)
    const token = promptReferenceTokenFromGenerationReference(reference)
    if (!kind || !token) return []
    const mediaType = promptReferenceMediaType(reference.media_type)
    const referenceId = stringValue(reference.id)
    return [resolvePromptReference({
      kind,
      ...(referenceId ? { referenceId } : {}),
      token,
      raw: referenceId ? formatCanonicalPromptReferenceToken(referenceId) : reference.raw ?? reference.source_ref ?? (kind === 'resource'
        ? formatResourceMention(Number(token), {
          ...(mediaType ? { mediaType } : {}),
          ...(reference.role ? { role: reference.role } : {}),
        })
        : formatPromptReferenceToken(kind, token, {
          ...(mediaType ? { mediaType } : {}),
          ...(reference.role ? { role: reference.role } : {}),
        })),
      index: -1,
      ...(reference.label ? { label: reference.label } : {}),
      ...(reference.resource_id !== undefined ? { resourceId: reference.resource_id } : {}),
      ...(mediaType ? { mediaType } : {}),
      ...(reference.role ? { role: reference.role } : {}),
    }, nodes, ownerNode, candidateSelections)]
  })
}

export function repairedGenerationReferencesFromPrompt(
  prompt: string,
  references: ReturnType<typeof generationReferencesFromContentNode>,
): ReturnType<typeof generationReferencesFromContentNode> {
  let next = references
  for (const match of promptReferenceMatches(prompt)) {
    if (match.kind === 'ref') continue
    if (generationReferencePoolMatchesPromptReference(next, match)) continue
    const repair = generationReferenceFromPromptReferenceMatch(match)
    if (!repair) continue
    if (next === references) next = [...references]
    next.push(repair)
  }
  return next
}

function generationReferencePoolMatchesPromptReference(
  references: ReturnType<typeof generationReferencesFromContentNode>,
  match: PromptReferenceMatch,
): boolean {
  return references.some((reference) => {
    if (reference.raw === match.raw || reference.source_ref === match.raw) return true
    const kind = promptReferenceKindFromValue(reference.kind)
    if (kind !== match.kind) return false
    if (kind === 'resource') {
      const left = resourceIdFromPromptReferenceValue(reference.resource_id ?? reference.ref ?? reference.id)
      const right = resourceIdFromPromptReferenceValue(match.token)
      return left !== undefined && right !== undefined && left === right
    }
    return String(promptReferenceTokenFromGenerationReference(reference)) === String(promptEntityTokenFromPromptReferenceValue(match.token, kind))
  })
}

function generationReferenceFromPromptReferenceMatch(
  match: PromptReferenceMatch,
): ReturnType<typeof generationReferencesFromContentNode>[number] | undefined {
  if (match.kind === 'ref') return undefined
  const mediaType = match.mediaType ?? promptReferenceMediaTypeFromRole(match.role) ?? 'image'
  const role = match.role ?? defaultReferenceRoleForMediaType(mediaType)
  if (match.kind === 'resource') {
    const resourceId = resourceIdFromPromptReferenceValue(match.token)
    if (resourceId === undefined) return undefined
    return {
      id: `resource:${resourceId}`,
      kind: 'resource',
      ref: resourceId,
      resource_id: resourceId,
      media_type: mediaType,
      role,
      source_ref: match.raw,
      label: `Resource ${resourceId}`,
      source: 'prompt_legacy_auto_repair',
    }
  }
  const token = promptEntityTokenFromPromptReferenceValue(match.token, match.kind)
  if (token === undefined) return undefined
  return {
    id: `${match.kind}:${String(token)}`,
    kind: match.kind,
    ref: token,
    media_type: mediaType,
    role,
    source_ref: match.raw,
    source: 'prompt_legacy_auto_repair',
  }
}

function promptReferenceTokenFromGenerationReference(reference: ReturnType<typeof generationReferencesFromContentNode>[number]): string {
  if (reference.kind === 'resource') {
    const resourceId = resourceIdFromPromptReferenceValue(reference.resource_id)
      ?? resourceIdFromPromptReferenceValue(reference.ref)
      ?? resourceIdFromPromptReferenceValue(reference.raw)
      ?? resourceIdFromPromptReferenceValue(reference.source_ref)
      ?? resourceIdFromPromptReferenceValue(reference.id)
    if (resourceId !== undefined) return String(resourceId)
  }
  const kind = promptReferenceKindFromValue(reference.kind)
  return String(promptEntityTokenFromPromptReferenceValue(reference.ref ?? reference.id, kind) ?? '')
}

function promptReferenceSegments(
  prompt: string,
  nodes: ContentCanvasNode[],
  ownerNode: ContentCanvasNode | undefined,
  candidateSelections: CandidateSelections,
  referenceItems?: PromptReferenceItem[],
): Array<{ kind: 'text'; text: string } | { kind: 'reference'; reference: PromptReferenceItem }> {
  const segments: Array<{ kind: 'text'; text: string } | { kind: 'reference'; reference: PromptReferenceItem }> = []
  let lastIndex = 0
  for (const match of promptReferenceMatches(prompt)) {
    if (match.index > lastIndex) segments.push({ kind: 'text', text: prompt.slice(lastIndex, match.index) })
    segments.push({
      kind: 'reference',
      reference: resolvePromptReference(match, nodes, ownerNode, candidateSelections, referenceItems),
    })
    lastIndex = match.index + match.raw.length
  }
  if (lastIndex < prompt.length) segments.push({ kind: 'text', text: prompt.slice(lastIndex) })
  if (!segments.length) segments.push({ kind: 'text', text: '' })
  return segments
}

function promptReferenceMatches(prompt: string): PromptReferenceMatch[] {
  const matches: PromptReferenceMatch[] = []
  for (const mention of parseResourceMentions(prompt)) {
    matches.push({
      kind: 'resource',
      token: String(mention.id),
      raw: mention.token,
      index: mention.index,
      ...(mention.mediaType ? { mediaType: promptReferenceMediaType(mention.mediaType) } : {}),
      ...(mention.role ? { role: mention.role } : {}),
    })
  }
  let match: RegExpExecArray | null
  PROMPT_REFERENCE_PATTERN.lastIndex = 0
  while ((match = PROMPT_REFERENCE_PATTERN.exec(prompt)) !== null) {
    const kind = match[1] as PromptReferenceMatchKind | undefined
    const payload = parsePromptReferencePayload(match[2])
    if (!kind || !payload.token) continue
    const index = match.index
    const raw = match[0]
    const overlapsResourceMention = matches.some((item) => index < item.index + item.raw.length && item.index < index + raw.length)
    if (overlapsResourceMention) continue
    matches.push({
      kind,
      token: payload.token,
      raw,
      index,
      ...(payload.mediaType ? { mediaType: payload.mediaType } : {}),
      ...(payload.role ? { role: payload.role } : {}),
    })
  }
  return matches.sort((left, right) => left.index - right.index)
}

function parsePromptReferencePayload(value: string | undefined): { token: string; mediaType?: PromptReferenceItem['mediaType']; role?: string } {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean)
  const token = parts.shift() ?? ''
  let mediaType: PromptReferenceItem['mediaType'] | undefined
  let role = ''
  for (const part of parts) {
    const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)=(.+)$/)
    if (!match) continue
    const key = normalizePromptReferenceMetadataPart(match[1])
    const metadataValue = normalizePromptReferenceMetadataPart(match[2])
    if (!metadataValue) continue
    if (key === 'role') role = metadataValue
    if (key === 'media' || key === 'media_type' || key === 'mediatype') mediaType = promptReferenceMediaType(metadataValue)
  }
  return {
    token,
    ...(mediaType ? { mediaType } : {}),
    ...(role ? { role } : {}),
  }
}

function normalizePromptReferenceMetadataPart(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/^['"]|['"]$/g, '').replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
}

function promptReferenceEditorHtml(
  segments: Array<{ kind: 'text'; text: string } | { kind: 'reference'; reference: PromptReferenceItem }>,
): string {
  return segments.map((part) => {
    if (part.kind === 'text') return escapeHtml(part.text)
    return [
      `<span class="content-canvas-prompt-inline-reference" contenteditable="false"`,
      ` data-prompt-reference="true"`,
      ` data-prompt-reference-raw="${escapeAttribute(part.reference.raw)}"`,
      ` data-state="${escapeAttribute(part.reference.state)}"`,
      ` data-media-type="${escapeAttribute(part.reference.previewMediaType ?? part.reference.mediaType ?? 'file')}"`,
      part.reference.role ? ` data-role="${escapeAttribute(part.reference.role)}"` : '',
      ` data-source-label="${escapeAttribute(part.reference.sourceLabel)}"`,
      ` title="${escapeAttribute(promptReferenceInlineTitle(part.reference))}"`,
      part.reference.missing ? ' data-missing="true"' : '',
      '>',
      promptReferenceInlineThumbHtml(part.reference),
      '<span class="content-canvas-prompt-inline-reference__body">',
      '<span class="content-canvas-prompt-inline-reference__meta">',
      `<small>${escapeHtml(promptReferenceMediaLabel(part.reference.previewMediaType ?? part.reference.selectedMediaType ?? part.reference.mediaType))}</small>`,
      `<strong>${escapeHtml(promptReferenceInlineRoleLabel(part.reference))}</strong>`,
      '</span>',
      `<em>${escapeHtml(part.reference.title)}</em>`,
      '</span>',
      '</span>',
    ].join('')
  }).join('')
}

function promptReferenceInlineThumbHtml(reference: PromptReferenceItem): string {
  if (reference.previewResourceId !== undefined && reference.previewMediaType === 'image') {
    const src = resolveResourceFileImageUrl(reference.previewResourceId)
    if (src) {
      return `<img class="content-canvas-prompt-inline-reference__thumb" src="${escapeAttribute(src)}" alt="${escapeAttribute(reference.title)}" loading="lazy" />`
    }
  }
  if (reference.previewResourceId !== undefined && reference.previewMediaType === 'video') {
    const src = resolveResourceFileUrl(reference.previewResourceId)
    if (src) {
      return `<video class="content-canvas-prompt-inline-reference__thumb" src="${escapeAttribute(src)}" muted playsinline preload="metadata"></video>`
    }
  }
  return [
    `<span class="content-canvas-prompt-reference-strip__fallback content-canvas-prompt-inline-reference__thumb" data-media-type="${escapeAttribute(reference.previewMediaType ?? reference.mediaType ?? 'file')}">`,
    escapeHtml(generationReferenceMediaTypeShortLabel(reference.previewMediaType ?? reference.mediaType ?? 'file')),
    '</span>',
  ].join('')
}

function promptReferenceInlineRoleLabel(reference: PromptReferenceItem): string {
  if (reference.role) return promptReferenceRoleShortLabel(reference.role)
  return generationReferenceRoleLabel(defaultReferenceRoleForReference(reference)) || '参考'
}

function promptReferenceInlineTitle(reference: PromptReferenceItem): string {
  return [
    promptReferenceMediaLabel(reference.previewMediaType ?? reference.selectedMediaType ?? reference.mediaType),
    promptReferenceInlineRoleLabel(reference),
    reference.title,
    reference.sourceLabel,
  ].filter(Boolean).join(' · ')
}

function promptReferenceMediaLabel(mediaType: PromptReferenceItem['mediaType'] | undefined): string {
  if (mediaType === 'image') return '图片'
  if (mediaType === 'video') return '视频'
  if (mediaType === 'audio') return '音频'
  return '文件'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function serializePromptEditor(root: HTMLElement): string {
  const serializeNode = (node: ChildNode): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (!(node instanceof HTMLElement)) return ''
    const rawReference = node.dataset.promptReferenceRaw
    if (rawReference) return rawReference
    if (node.tagName === 'BR') return '\n'
    const text = Array.from(node.childNodes).map(serializeNode).join('')
    if (node.tagName === 'DIV' || node.tagName === 'P') return `${text}\n`
    return text
  }
  return Array.from(root.childNodes).map(serializeNode).join('').replace(/\n$/, '')
}

type PromptMentionRange = {
  start: number
  end: number
  query: string
}

type PromptMentionMenuPoint = {
  left: number
  top: number
  width: number
}

type PromptReferenceRoleMenuState = {
  kind: PromptReferenceItem['kind']
  raw: string
  token: string
  resourceId?: number
  mediaType: PromptReferenceItem['mediaType']
  role: string
  left: number
  top: number
}

function replacePromptReferenceRaw(prompt: string, raw: string, nextRaw: string): string {
  const index = prompt.indexOf(raw)
  if (index < 0) return prompt
  return `${prompt.slice(0, index)}${nextRaw}${prompt.slice(index + raw.length)}`
}

function promptReferenceTokenForNode(node: ContentCanvasNode): string {
  return `{{${promptReferenceKindForNode(node)}:${node.entityKey || node.id}}}`
}

function formatPromptReferenceToken(
  kind: PromptReferenceItem['kind'],
  token: string,
  options: { mediaType?: PromptReferenceItem['mediaType']; role?: string } = {},
): string {
  const metadata = [
    options.role ? `role=${normalizePromptReferenceMetadataPart(options.role)}` : '',
    options.mediaType ? `media=${normalizePromptReferenceMetadataPart(options.mediaType)}` : '',
  ].filter(Boolean).join(' ')
  return `{{${kind}::${token}${metadata ? ` ${metadata}` : ''}}}`
}

function formatCanonicalPromptReferenceToken(referenceId: string): string {
  return `{{ref:${referenceId}}}`
}

function promptReferenceInsertionToken(
  reference: PromptReferenceItem,
  options: { mediaType?: PromptReferenceItem['mediaType']; role?: string } = {},
): string {
  if (reference.referenceId) return formatCanonicalPromptReferenceToken(reference.referenceId)
  if (reference.kind === 'resource' && reference.resourceId !== undefined) {
    return formatResourceMention(reference.resourceId, options)
  }
  return formatPromptReferenceToken(reference.kind, reference.token, options)
}

function promptReferenceKindForNode(node: ContentCanvasNode): PromptReferenceItem['kind'] {
  if (node.kind === 'keyframe') return 'keyframe'
  if (node.kind === 'storyboard') return 'storyboard'
  if (node.kind === 'candidate') return 'candidate'
  if (node.kind === 'resource') return 'resource'
  if (node.kind === 'scene_moment') return 'scene_moment'
  if (node.kind === 'expression_unit') return 'expression_unit'
  if (node.kind === 'content_unit') return 'content_unit'
  return 'asset'
}

function promptReferenceKindFromValue(value: string | undefined): PromptReferenceItem['kind'] | undefined {
  if (
    value === 'asset'
    || value === 'candidate'
    || value === 'resource'
    || value === 'keyframe'
    || value === 'storyboard'
    || value === 'scene_moment'
    || value === 'expression_unit'
    || value === 'content_unit'
  ) return value
  return undefined
}

function readPromptEditorState(editor: HTMLElement): { value: string; textBeforeCaret: string; caret: number } {
  const selection = window.getSelection()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  const hasCaret = !!range && editor.contains(range.endContainer)
  if (!hasCaret) {
    return { value: serializePromptEditor(editor), textBeforeCaret: '', caret: 0 }
  }

  const state = {
    endContainer: range.endContainer,
    endOffset: range.endOffset,
    prefixActive: true,
    prefixParts: [] as string[],
    valueParts: [] as string[],
  }
  appendPromptEditorState(editor, state)
  const textBeforeCaret = state.prefixParts.join('')
  return {
    value: state.valueParts.join('').replace(/\n$/, ''),
    textBeforeCaret,
    caret: textBeforeCaret.length,
  }
}

function appendPromptEditorState(
  node: Node,
  state: {
    endContainer: Node
    endOffset: number
    prefixActive: boolean
    prefixParts: string[]
    valueParts: string[]
  },
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    state.valueParts.push(text)
    if (state.prefixActive) {
      if (node === state.endContainer) {
        state.prefixParts.push(text.slice(0, state.endOffset))
        state.prefixActive = false
      } else {
        state.prefixParts.push(text)
      }
    }
    return
  }
  if (!(node instanceof HTMLElement)) return
  const rawReference = node.dataset.promptReferenceRaw
  if (rawReference) {
    state.valueParts.push(rawReference)
    if (state.prefixActive) state.prefixParts.push(rawReference)
    if (node === state.endContainer || node.contains(state.endContainer)) state.prefixActive = false
    return
  }
  if (node.tagName === 'BR') {
    state.valueParts.push('\n')
    if (state.prefixActive) state.prefixParts.push('\n')
    return
  }
  if (node === state.endContainer) {
    let index = 0
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (state.prefixActive && index >= state.endOffset) state.prefixActive = false
      appendPromptEditorState(child, state)
      index += 1
    }
    state.prefixActive = false
    return
  }
  for (let child = node.firstChild; child; child = child.nextSibling) {
    appendPromptEditorState(child, state)
  }
  if (node.tagName === 'DIV' || node.tagName === 'P') {
    state.valueParts.push('\n')
    if (state.prefixActive) state.prefixParts.push('\n')
  }
}

function promptMentionRangeFromTextBeforeCaret(
  textBeforeCaret: string,
  caret: number,
): PromptMentionRange | null {
  const match = textBeforeCaret.match(PROMPT_REFERENCE_TRIGGER_RE)
  if (!match) return null
  const query = match[1] ?? ''
  return {
    start: caret - query.length - 1,
    end: caret,
    query,
  }
}

function promptMentionMenuPointForEditor(editor: HTMLElement): PromptMentionMenuPoint {
  const editorRect = editor.getBoundingClientRect()
  const caretRect = promptEditorCaretRect(editor)
  const sourceRect = caretRect && caretRect.width + caretRect.height > 0 ? caretRect : editorRect
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || editorRect.right
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || editorRect.bottom
  const width = Math.min(360, Math.max(240, editorRect.width))
  const left = Math.max(8, Math.min(sourceRect.left, viewportWidth - width - 8))
  const preferredTop = sourceRect.bottom + 6
  const top = preferredTop > viewportHeight - 120
    ? Math.max(8, sourceRect.top - 266)
    : preferredTop
  return { left, top, width }
}

function promptEditorCaretRect(editor: HTMLElement): DOMRect | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.endContainer)) return null
  const caretRange = range.cloneRange()
  caretRange.collapse(false)
  const rect = Array.from(caretRange.getClientRects()).at(0) ?? caretRange.getBoundingClientRect()
  if (rect.width || rect.height) return rect
  return null
}

function insertPromptReferenceToken({
  editor,
  token,
  prompt,
  onChange,
  setMentionRange,
  setMentionMenuPoint,
  range,
  insertAt,
}: {
  editor: HTMLElement
  token: string
  prompt: string
  onChange: (prompt: string) => void
  setMentionRange: (range: PromptMentionRange | null) => void
  setMentionMenuPoint?: (point: PromptMentionMenuPoint | null) => void
  range?: PromptMentionRange | null
  insertAt?: { value: string; start: number; end: number }
}) {
  const editorState = readPromptEditorState(editor)
  const value = insertAt?.value ?? (editorState.value || prompt)
  if (value.includes(token)) {
    setMentionRange(null)
    setMentionMenuPoint?.(null)
    if (range) {
      const nextPrompt = `${value.slice(0, range.start)}${value.slice(range.end)}`.replace(/[ \t]{2,}/g, ' ')
      onChange(nextPrompt)
    }
    return
  }
  const start = range?.start ?? insertAt?.start ?? editorState.caret
  const end = range?.end ?? insertAt?.end ?? editorState.caret
  const prefix = value.slice(0, start).replace(/[ \t]*$/, '')
  const suffix = value.slice(end).replace(/^[ \t]*/, '')
  const separatorBefore = prefix && !prefix.endsWith('\n') ? ' ' : ''
  const separatorAfter = suffix && !suffix.startsWith('\n') ? ' ' : ''
  const nextPrompt = `${prefix}${separatorBefore}${token}${separatorAfter}${suffix}`
  setMentionRange(null)
  setMentionMenuPoint?.(null)
  onChange(nextPrompt)
  requestAnimationFrame(() => {
    editor.focus()
    placeCaretAtEnd(editor)
  })
}

function placeCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function promptMentionOptions(
  nodes: ContentCanvasNode[],
  ownerNode: ContentCanvasNode | undefined,
  candidateSelections: CandidateSelections,
  query: string,
): PromptReferenceItem[] {
  const normalizedQuery = query.trim().toLowerCase()
  const ownerKeys = new Set([ownerNode?.id, ownerNode?.entityKey, ownerNode?.sourcePath].filter(Boolean))
  const seen = new Set<string>()
  return nodes
    .filter((node) => !ownerKeys.has(node.id) && !ownerKeys.has(node.entityKey) && !ownerKeys.has(node.sourcePath))
    .map((node) => resolvePromptReference({
      kind: promptReferenceKindForNode(node),
      token: node.entityKey || node.id,
      raw: promptReferenceTokenForNode(node),
      index: -1,
    }, nodes, ownerNode, candidateSelections))
    .filter((reference) => {
      const key = `${reference.kind}:${reference.token}`
      if (seen.has(key)) return false
      seen.add(key)
      if (!normalizedQuery) return true
      return [
        reference.title,
        reference.token,
        reference.kind,
        reference.label,
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
    .slice(0, 18)
}

function filterPromptMentionOptions(options: PromptReferenceItem[], query: string): PromptReferenceItem[] {
  const normalizedQuery = query.trim().toLowerCase()
  const seen = new Set<string>()
  return options
    .filter((reference) => {
      const key = `${reference.kind}:${reference.token}:${reference.mediaType ?? ''}:${reference.role ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      if (!normalizedQuery) return true
      return [
        reference.title,
        reference.token,
        reference.kind,
        reference.label,
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
    .slice(0, 18)
}

function PromptMentionMenu({
  emptyLabel,
  options,
  point,
  onSelect,
}: {
  emptyLabel: string
  options: PromptReferenceItem[]
  point?: PromptMentionMenuPoint | null
  onSelect: (option: PromptReferenceItem) => void
}) {
  const style: CSSProperties | undefined = point
    ? {
      position: 'fixed',
      left: point.left,
      top: point.top,
      width: point.width,
      zIndex: 10000,
    }
    : undefined
  const menu = (
    <div
      className="content-canvas-prompt-mention-menu"
      role="listbox"
      aria-label="可引用列表"
      style={style}
      onMouseDown={(event) => event.preventDefault()}
    >
      {options.length === 0 ? (
        <p className="content-canvas-prompt-mention-menu__empty">{emptyLabel}</p>
      ) : options.map((option) => (
        <button
          key={`${option.kind}:${option.token}`}
          type="button"
          role="option"
          onMouseDown={(event) => {
            event.preventDefault()
            onSelect(option)
          }}
        >
          <PromptReferenceThumb reference={option} />
          <span>
            <strong>{option.title}</strong>
            <small>{option.label}</small>
          </span>
        </button>
      ))}
    </div>
  )
  if (point && typeof document !== 'undefined') return createPortal(menu, document.body)
  return menu
}

function PromptReferenceRoleMenu({
  state,
  onSelect,
  onClose,
}: {
  state: PromptReferenceRoleMenuState
  onSelect: (role: string) => void
  onClose: () => void
}) {
  const options = promptReferenceRoleOptions(state.mediaType)
  return (
    <div
      className="content-canvas-prompt-role-menu"
      role="menu"
      aria-label="引用角色"
      style={{ left: state.left, top: state.top }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="menuitemradio"
          aria-checked={option.value === state.role}
          data-active={option.value === state.role ? 'true' : undefined}
          onClick={() => onSelect(option.value)}
        >
          <span>{option.label}</span>
          <small>{option.hint}</small>
        </button>
      ))}
      <button type="button" role="menuitem" onClick={onClose}>
        <span>关闭</span>
        <small>不修改引用角色</small>
      </button>
    </div>
  )
}

function resolvePromptReference(
  match: PromptReferenceMatch,
  nodes: ContentCanvasNode[],
  ownerNode: ContentCanvasNode | undefined,
  candidateSelections: CandidateSelections,
  referenceItems?: PromptReferenceItem[],
): PromptReferenceItem {
  const { kind, token, raw } = match
  if (kind === 'ref') {
    const reference = referenceItems?.find((item) => item.referenceId === token || item.raw === raw)
    if (reference) {
      return {
        ...reference,
        raw,
      }
    }
    return {
      kind: 'resource',
      referenceId: token,
      token,
      raw,
      title: token,
      label: '引用池项缺失',
      sourceLabel: '引用池',
      state: 'missing',
      actionLabel: '引用缺失',
      missing: true,
    }
  }
  const poolReference = referenceItems?.find((item) => item.kind === kind && (item.raw === raw || item.token === token))
  if (poolReference) {
    return {
      ...poolReference,
      raw,
    }
  }
  if (kind === 'resource') {
    const resourceId = match.resourceId ?? resourceIdFromPromptReferenceValue(token)
    const mediaType = match.mediaType ?? 'image'
    const role = match.role ?? defaultReferenceRoleForMediaType(mediaType)
    return {
      kind,
      ...(match.referenceId ? { referenceId: match.referenceId } : {}),
      token,
      raw,
      title: match.label ?? (resourceId !== undefined ? `Resource ${resourceId}` : token),
      label: resourceId !== undefined ? resourceReferenceLabel(role) : '资源引用缺失',
      sourceLabel: '资源',
      resourceId,
      role,
      selectedResourceId: resourceId,
      mediaType,
      selectedMediaType: mediaType,
      previewResourceId: resourceId,
      previewMediaType: mediaType,
      state: resourceId !== undefined ? 'selected' : 'missing',
      actionLabel: resourceId !== undefined ? '已选择资源' : '资源缺失',
      missing: resourceId === undefined,
    }
  }
  if (kind === 'candidate') {
    const candidate = candidatesForNode(ownerNode).find((item) => item.id === token || String(item.resourceId) === token || item.artifactRef === token)
    const mediaType = mediaTypeForReference(candidate?.resourceKind, candidate?.artifactRef)
    const role = match.role ?? defaultReferenceRoleForMediaType(mediaType)
    if (candidate) {
      return {
        kind,
        ...(match.referenceId ? { referenceId: match.referenceId } : {}),
        token,
        raw,
        title: candidate.title,
        label: candidate.resourceId !== undefined ? `已选择候选 · ${promptReferenceRoleShortLabel(role)}` : `候选引用 · ${promptReferenceRoleShortLabel(role)}`,
        sourceLabel: '候选',
        resourceId: candidate.resourceId,
        role,
        selectedResourceId: candidate.resourceId,
        mediaType,
        selectedMediaType: mediaType,
        previewResourceId: candidate.resourceId,
        previewMediaType: mediaType,
        state: 'selected',
        actionLabel: candidate.resourceId !== undefined ? '已选择' : '已引用候选',
      }
    }
  }
  const node = nodes.find((item) => (
    item.kind === kind
    && (item.entityKey === token || item.id === token || item.id === `${kind}:${token}` || item.sourcePath === token)
  ))
  if (node) {
    const candidates = candidatesForNode(node)
    const selectedCandidate = explicitSelectedCandidateForNode(node, candidateSelections)
    const firstPreviewCandidate = candidates.find((candidate) => candidate.resourceId !== undefined) ?? candidates[0]
    const fallbackResourceId = match.resourceId ?? numberValue(node.record.resource_id ?? node.record.resourceId)
    const fallbackMediaType = match.mediaType
      ?? mediaTypeForReference(stringValue(node.record.resource_kind ?? node.record.resourceKind), stringValue(node.record.artifact_ref ?? node.record.artifactRef))
    const nodeMediaType = mediaTypeForReference(
      stringValue(node.generationTask?.outputKind ?? node.record.output_kind ?? node.record.outputKind ?? node.record.content_unit_type ?? node.record.contentUnitType),
      stringValue(node.record.artifact_ref ?? node.record.artifactRef),
    )
    const selectedMediaType = match.mediaType ?? mediaTypeForReference(selectedCandidate?.resourceKind, selectedCandidate?.artifactRef) ?? fallbackMediaType ?? nodeMediaType
    const selectedResourceId = selectedCandidate?.resourceId ?? fallbackResourceId
    const pendingMediaType = mediaTypeForReference(firstPreviewCandidate?.resourceKind, firstPreviewCandidate?.artifactRef) ?? nodeMediaType
    const previewResourceId = selectedResourceId ?? (selectedCandidate ? undefined : firstPreviewCandidate?.resourceId)
    const previewMediaType = selectedResourceId !== undefined || selectedCandidate
      ? selectedMediaType
      : pendingMediaType
    const role = match.role ?? defaultReferenceRoleForMediaType(previewMediaType ?? selectedMediaType ?? fallbackMediaType ?? nodeMediaType)
    const state = selectedCandidate || fallbackResourceId !== undefined
      ? 'selected'
      : candidates.length > 0
        ? 'pending'
        : 'empty'
    return {
      kind,
      ...(match.referenceId ? { referenceId: match.referenceId } : {}),
      token,
      raw,
      title: match.label ?? node.title,
      label: `${promptReferenceStateLabel(kind, state)} · ${promptReferenceRoleShortLabel(role)}`,
      sourceLabel: promptReferenceSourceLabel(kind, node),
      node,
      resourceId: fallbackResourceId,
      role,
      selectedResourceId,
      mediaType: fallbackMediaType,
      selectedMediaType,
      previewResourceId,
      previewMediaType,
      state,
      actionLabel: promptReferenceActionLabel(state, candidates.length),
    }
  }
  if (match.label || match.resourceId !== undefined) {
    const mediaType = match.mediaType ?? 'image'
    const role = match.role ?? defaultReferenceRoleForMediaType(mediaType)
    const state: PromptReferenceItem['state'] = match.resourceId !== undefined ? 'selected' : 'pending'
    return {
      kind,
      ...(match.referenceId ? { referenceId: match.referenceId } : {}),
      token,
      raw,
      title: match.label ?? token,
      label: `${promptReferenceStateLabel(kind, state)} · ${promptReferenceRoleShortLabel(role)}`,
      sourceLabel: promptReferenceSourceLabel(kind),
      ...(match.resourceId !== undefined ? {
        resourceId: match.resourceId,
        selectedResourceId: match.resourceId,
        previewResourceId: match.resourceId,
      } : {}),
      role,
      mediaType,
      selectedMediaType: mediaType,
      previewMediaType: mediaType,
      state,
      actionLabel: promptReferenceActionLabel(state, match.resourceId !== undefined ? 1 : 0),
    }
  }
  return {
    kind,
    ...(match.referenceId ? { referenceId: match.referenceId } : {}),
    token,
    raw,
    title: token,
    label: `${promptReferenceLabel(kind)}缺失`,
    sourceLabel: promptReferenceSourceLabel(kind),
    state: 'missing',
    actionLabel: '引用缺失',
    missing: true,
  }
}

function iconForPromptReference(reference: PromptReferenceItem) {
  const mediaType = reference.previewMediaType ?? reference.selectedMediaType ?? reference.mediaType
  if (mediaType === 'video') return Video
  if (mediaType === 'image') return Image
  if (reference.node) return iconForContentNode(reference.node)
  return File
}

function promptReferenceLabel(kind: PromptReferenceItem['kind']): string {
  if (kind === 'asset') return '资源引用'
  if (kind === 'keyframe') return '关键帧引用'
  if (kind === 'storyboard') return '故事版引用'
  if (kind === 'scene_moment') return '情节引用'
  if (kind === 'expression_unit') return '表达单元引用'
  if (kind === 'content_unit') return '内容单元引用'
  if (kind === 'resource') return '资源引用'
  return '候选引用'
}

function promptReferenceSourceLabel(kind: PromptReferenceItem['kind'], node?: ContentCanvasNode): string {
  if (kind === 'resource') return '资源'
  if (kind === 'candidate') return '候选'
  if (kind === 'keyframe') return '关键帧'
  if (kind === 'storyboard') return '故事版'
  if (kind === 'asset') return '资源'
  if (kind === 'scene_moment') return '情节'
  if (kind === 'expression_unit') return '表达'
  if (kind === 'content_unit') {
    return contentUnitTypeShortLabel(
      stringValue(node?.generationTask?.contentUnitType ?? node?.record.content_unit_type ?? node?.record.contentUnitType)
      ?? stringValue(node?.generationTask?.outputKind ?? node?.record.output_kind ?? node?.record.outputKind),
    )
  }
  return promptReferenceLabel(kind).replace(/引用$/, '')
}

function contentUnitTypeShortLabel(value: string | undefined): string {
  const normalized = normalizePromptReferenceMetadataPart(value)
  if (!normalized) return '内容'
  if (normalized.includes('storyboard')) return '故事版'
  if (normalized.includes('keyframe')) return '关键帧'
  if (normalized.includes('asset')) return '资源'
  if (normalized.includes('scene_moment')) return '情节'
  if (normalized.includes('expression_unit')) return '表达'
  if (normalized.includes('timeline')) return '剪辑'
  if (normalized.includes('audio')) return '音频'
  if (normalized.includes('video')) return '视频'
  if (normalized.includes('image')) return '图片'
  return value?.replace(/[_-]+ref$/i, '').replace(/[_-]+/g, ' ').trim() || '内容'
}

function promptReferenceStateLabel(kind: PromptReferenceItem['kind'], state: PromptReferenceItem['state']): string {
  if (state === 'selected') return `${promptReferenceLabel(kind)} · 已选择`
  if (state === 'pending') return `${promptReferenceLabel(kind)} · 待选择`
  if (state === 'empty') return `${promptReferenceLabel(kind)} · 待生成`
  return `${promptReferenceLabel(kind)}缺失`
}

function promptReferenceActionLabel(state: PromptReferenceItem['state'], candidateCount: number): string {
  if (state === 'selected') return '已选择'
  if (state === 'pending') return candidateCount > 0 ? '去选择' : '待选择'
  if (state === 'empty') return '去生成'
  return '缺失'
}

function explicitSelectedCandidateForNode(
  node: ContentCanvasNode,
  candidateSelections: CandidateSelections,
): ContentCanvasCandidate | undefined {
  const candidates = candidatesForNode(node)
  const selectedId = candidateSelectionKeysForNode(node)
    .map((key) => candidateSelections[key])
    .find((candidateId): candidateId is string => Boolean(candidateId))
  return candidates.find((candidate) => candidate.id === selectedId)
    ?? candidates.find((candidate) => candidate.selected)
}

function candidateSelectionKeysForNode(node: ContentCanvasNode): string[] {
  return uniqueStrings(
    node.id,
    node.entityKey,
    node.generationTask?.nodeId,
    node.generationTask?.id,
  )
}

function mediaTypeForReference(resourceKind: string | undefined, artifactRef: string | undefined): PromptReferenceItem['mediaType'] {
  const value = `${resourceKind ?? ''} ${artifactRef ?? ''}`.toLowerCase()
  if (!value.trim()) return undefined
  if (value.includes('video') || /\.(mp4|mov|webm|m4v)(\?|#|$)/.test(value)) return 'video'
  if (value.includes('audio') || /\.(mp3|wav|m4a|aac|ogg)(\?|#|$)/.test(value)) return 'audio'
  if (value.includes('image') || /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/.test(value)) return 'image'
  return 'file'
}

function promptReferenceMediaType(value: string | undefined): PromptReferenceItem['mediaType'] | undefined {
  if (value === 'image' || value === 'video' || value === 'audio') return value
  if (value === 'file' || value === 'text') return 'file'
  return undefined
}

function promptReferenceMediaTypeFromRole(role: string | undefined): PromptReferenceItem['mediaType'] | undefined {
  if (!role) return undefined
  if (role.includes('video')) return 'video'
  if (role.includes('audio')) return 'audio'
  return undefined
}

function defaultReferenceRoleForMediaType(mediaType: PromptReferenceItem['mediaType'] | undefined): string {
  return generationDefaultReferenceRoleForMediaType(mediaType) ?? 'reference_image'
}

function defaultReferenceRoleForReference(reference: PromptReferenceItem): string {
  return defaultReferenceRoleForMediaType(reference.previewMediaType ?? reference.selectedMediaType ?? reference.mediaType)
}

function promptReferenceRoleOptions(mediaType: PromptReferenceItem['mediaType'] | undefined): Array<{ value: string; label: string; hint: string }> {
  return generationReferenceRoleOptionsForMediaType(mediaType)
}

function resourceReferenceLabel(role: string | undefined): string {
  return generationResourceReferenceLabel(role)
}

function promptReferenceRoleShortLabel(role: string): string {
  return generationReferenceRoleLabel(role)
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function resourceIdFromPromptReferenceValue(value: unknown): number | undefined {
  const direct = numberValue(value)
  if (direct !== undefined) return direct
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  const modernMention = parseResourceMentions(text)[0]
  if (modernMention) return modernMention.id
  const internalRef = text.match(/^resource(?:::|:)(\d+)$/i)
  return internalRef ? numberValue(internalRef[1]) : undefined
}

function promptEntityTokenFromPromptReferenceValue(
  value: unknown,
  kind: PromptReferenceItem['kind'] | undefined,
): string | number | undefined {
  if (value === undefined || value === null || kind === 'resource') return undefined
  if (typeof value === 'number') return value
  const text = String(value).trim()
  if (!text) return undefined
  return kind ? text.replace(new RegExp(`^${kind}(?:::|:)`, 'i'), '') : text
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function uniqueStrings(...values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}
