import { useCallback, useLayoutEffect, useMemo, useRef, type ClipboardEvent, type FormEvent, type MouseEvent } from 'react'
import { Image } from 'lucide-react'

import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { ResourceFileImage } from '@/shared/ui/ResourceFileImage'
import { ResourceFileVideo } from '@/shared/ui/ResourceFileVideo'

import { candidatesForNode, iconForContentNode } from './contentCanvasWorkspaceModel'
import type { CandidateSelections } from './contentCanvasWorkspaceTypes'

export type PromptReferenceItem = {
  kind: 'asset' | 'candidate' | 'resource' | 'keyframe' | 'storyboard'
  token: string
  raw: string
  title: string
  label: string
  node?: ContentCanvasNode
  resourceId?: number
  mediaType?: 'image' | 'video' | 'audio' | 'file'
  selectedResourceId?: number
  selectedMediaType?: 'image' | 'video' | 'audio' | 'file'
  state: 'selected' | 'pending' | 'empty' | 'missing'
  actionLabel: string
  missing?: boolean
}

const PROMPT_REFERENCE_PATTERN = /\{\{\s*(asset|candidate|resource|keyframe|storyboard):([^}]+?)\s*\}\}/g

export function PromptReferenceInlineEditor({
  prompt,
  nodes,
  ownerNode,
  candidateSelections,
  ariaLabel,
  onChange,
  onBlur,
  onSelectNode,
}: {
  prompt: string
  nodes: ContentCanvasNode[]
  ownerNode: ContentCanvasNode | undefined
  candidateSelections: CandidateSelections
  ariaLabel: string
  onChange: (prompt: string) => void
  onBlur: () => void
  onSelectNode: (node: ContentCanvasNode) => void
}) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const segments = useMemo(
    () => promptReferenceSegments(prompt, nodes, ownerNode, candidateSelections),
    [candidateSelections, nodes, ownerNode, prompt],
  )
  const referenceNodesByRaw = useMemo(() => {
    const entries = segments.flatMap((part) => part.kind === 'reference' && part.reference.node
      ? [[part.reference.raw, part.reference.node] as const]
      : [])
    return new Map(entries)
  }, [segments])
  const html = useMemo(() => promptReferenceEditorHtml(segments), [segments])
  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (document.activeElement === editor) return
    if (serializePromptEditor(editor) === prompt) return
    editor.innerHTML = html
  }, [html, prompt])
  const handleInput = useCallback((event: FormEvent<HTMLDivElement>) => {
    onChange(serializePromptEditor(event.currentTarget))
  }, [onChange])
  const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }, [])
  const handleMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>('[data-prompt-reference-raw]')
      : null
    const raw = target?.dataset.promptReferenceRaw
    if (!raw) return
    event.preventDefault()
    const referenceNode = referenceNodesByRaw.get(raw)
    if (referenceNode) onSelectNode(referenceNode)
  }, [onSelectNode, referenceNodesByRaw])

  return (
    <div className="content-canvas-prompt-inline-editor-shell">
      <div
        ref={editorRef}
        className="content-canvas-prompt-inline-editor"
        role="textbox"
        contentEditable
        suppressContentEditableWarning
        aria-label={ariaLabel}
        spellCheck={false}
        data-empty={prompt.trim() ? undefined : 'true'}
        onInput={handleInput}
        onPaste={handlePaste}
        onMouseDown={handleMouseDown}
        onBlur={onBlur}
      />
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
          <PromptReferenceThumb reference={reference} />
          <span>
            <strong>{reference.title}</strong>
            <small>{reference.label}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

function PromptReferenceThumb({ reference }: { reference: PromptReferenceItem }) {
  if (reference.resourceId !== undefined && reference.mediaType === 'image') {
    return <ResourceFileImage resourceId={reference.resourceId} alt={reference.title} loading="lazy" />
  }
  if (reference.resourceId !== undefined && reference.mediaType === 'video') {
    return <ResourceFileVideo resourceId={reference.resourceId} muted playsInline preload="metadata" />
  }
  const Icon = reference.node ? iconForContentNode(reference.node) : Image
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
  let match: RegExpExecArray | null
  PROMPT_REFERENCE_PATTERN.lastIndex = 0
  while ((match = PROMPT_REFERENCE_PATTERN.exec(prompt)) !== null) {
    const kind = match[1] as PromptReferenceItem['kind']
    const token = match[2].trim()
    const key = `${kind}:${token}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(resolvePromptReference(kind, token, match[0], nodes, ownerNode, candidateSelections))
  }
  return output
}

function promptReferenceSegments(
  prompt: string,
  nodes: ContentCanvasNode[],
  ownerNode: ContentCanvasNode | undefined,
  candidateSelections: CandidateSelections,
): Array<{ kind: 'text'; text: string } | { kind: 'reference'; reference: PromptReferenceItem }> {
  const segments: Array<{ kind: 'text'; text: string } | { kind: 'reference'; reference: PromptReferenceItem }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  PROMPT_REFERENCE_PATTERN.lastIndex = 0
  while ((match = PROMPT_REFERENCE_PATTERN.exec(prompt)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', text: prompt.slice(lastIndex, match.index) })
    }
    const kind = match[1] as PromptReferenceItem['kind']
    const token = match[2].trim()
    segments.push({
      kind: 'reference',
      reference: resolvePromptReference(kind, token, match[0], nodes, ownerNode, candidateSelections),
    })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < prompt.length) segments.push({ kind: 'text', text: prompt.slice(lastIndex) })
  if (!segments.length) segments.push({ kind: 'text', text: '' })
  return segments
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
      part.reference.missing ? ' data-missing="true"' : '',
      '>',
      `<span class="content-canvas-prompt-reference-strip__fallback">${escapeHtml(promptReferenceGlyph(part.reference.kind))}</span>`,
      '<span>',
      `<strong>${escapeHtml(part.reference.title)}</strong>`,
      `<small>${escapeHtml(part.reference.label)}</small>`,
      '</span>',
      '</span>',
    ].join('')
  }).join('')
}

function promptReferenceGlyph(kind: PromptReferenceItem['kind']): string {
  if (kind === 'asset') return 'A'
  if (kind === 'keyframe') return 'K'
  if (kind === 'storyboard') return 'S'
  if (kind === 'candidate') return 'C'
  return 'R'
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

function resolvePromptReference(
  kind: PromptReferenceItem['kind'],
  token: string,
  raw: string,
  nodes: ContentCanvasNode[],
  ownerNode: ContentCanvasNode | undefined,
  candidateSelections: CandidateSelections,
): PromptReferenceItem {
  if (kind === 'resource') {
    const resourceId = numberValue(token)
    return {
      kind,
      token,
      raw,
      title: resourceId !== undefined ? `Resource ${resourceId}` : token,
      label: resourceId !== undefined ? '资源引用' : '资源引用缺失',
      resourceId,
      selectedResourceId: resourceId,
      mediaType: 'image',
      selectedMediaType: 'image',
      state: resourceId !== undefined ? 'selected' : 'missing',
      actionLabel: resourceId !== undefined ? '已选择资源' : '资源缺失',
      missing: resourceId === undefined,
    }
  }
  if (kind === 'candidate') {
    const candidate = candidatesForNode(ownerNode).find((item) => item.id === token || String(item.resourceId) === token || item.artifactRef === token)
    const mediaType = mediaTypeForReference(candidate?.resourceKind, candidate?.artifactRef)
    if (candidate) {
      return {
        kind,
        token,
        raw,
        title: candidate.title,
        label: candidate.resourceId !== undefined ? '已选择候选' : '候选引用',
        resourceId: candidate.resourceId,
        selectedResourceId: candidate.resourceId,
        mediaType,
        selectedMediaType: mediaType,
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
    const fallbackResourceId = numberValue(node.record.resource_id ?? node.record.resourceId)
    const fallbackMediaType = mediaTypeForReference(stringValue(node.record.resource_kind ?? node.record.resourceKind), stringValue(node.record.artifact_ref ?? node.record.artifactRef))
    const selectedMediaType = mediaTypeForReference(selectedCandidate?.resourceKind, selectedCandidate?.artifactRef) ?? fallbackMediaType
    const selectedResourceId = selectedCandidate?.resourceId ?? fallbackResourceId
    const state = selectedResourceId !== undefined || selectedCandidate
      ? 'selected'
      : candidates.length > 0
        ? 'pending'
        : 'empty'
    return {
      kind,
      token,
      raw,
      title: node.title,
      label: promptReferenceStateLabel(kind, state),
      node,
      resourceId: fallbackResourceId,
      selectedResourceId,
      mediaType: fallbackMediaType,
      selectedMediaType,
      state,
      actionLabel: promptReferenceActionLabel(state, candidates.length),
    }
  }
  return {
    kind,
    token,
    raw,
    title: token,
    label: `${promptReferenceLabel(kind)}缺失`,
    state: 'missing',
    actionLabel: '引用缺失',
    missing: true,
  }
}

function promptReferenceLabel(kind: PromptReferenceItem['kind']): string {
  if (kind === 'asset') return 'Asset 引用'
  if (kind === 'keyframe') return '关键帧引用'
  if (kind === 'storyboard') return '分镜图引用'
  if (kind === 'resource') return '资源引用'
  return '候选引用'
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
  if (value.includes('video') || /\.(mp4|mov|webm|m4v)(\?|#|$)/.test(value)) return 'video'
  if (value.includes('audio') || /\.(mp3|wav|m4a|aac|ogg)(\?|#|$)/.test(value)) return 'audio'
  if (value.includes('image') || /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/.test(value)) return 'image'
  return 'file'
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function uniqueStrings(...values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}
