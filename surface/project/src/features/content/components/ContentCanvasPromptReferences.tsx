import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FocusEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { File, Image, Video } from 'lucide-react'

import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { readResourceDragPayload, resourceDropAcceptsPayload } from '@movscript/resource-surface/resource-interaction'
import { ResourceFileImage, ResourceFileVideo } from '@movscript/resource-surface/resource-media-components'
import { formatResourceMention, parseResourceMentions } from '@movscript/workspace'
import {
  generationDefaultReferenceRoleForMediaType,
  generationReferenceRoleLabel,
  generationReferenceRoleOptionsForMediaType,
  generationResourceReferenceLabel,
} from '@movscript/core/generation'

import { candidatesForNode, iconForContentNode } from './contentCanvasWorkspaceModel'
import type { CandidateSelections } from './contentCanvasWorkspaceTypes'

export type PromptReferenceItem = {
  kind: 'asset' | 'candidate' | 'resource' | 'keyframe' | 'storyboard' | 'scene_moment' | 'expression_unit' | 'content_unit'
  token: string
  raw: string
  title: string
  label: string
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

const PROMPT_REFERENCE_PATTERN = /\{\{\s*(asset|candidate|resource|keyframe|storyboard|scene_moment|expression_unit|content_unit):{1,2}\s*([^}]+?)\s*\}\}/g
const PROMPT_REFERENCE_TRIGGER_RE = /(?:^|[\s(])@([^\s@\[{]*)$/u

type PromptReferenceMatch = {
  kind: PromptReferenceItem['kind']
  token: string
  raw: string
  index: number
  mediaType?: PromptReferenceItem['mediaType']
  role?: string
}

export function PromptReferenceInlineEditor({
  prompt,
  nodes,
  mentionNodes = nodes,
  ownerNode,
  candidateSelections,
  className,
  ariaLabel,
  onChange,
  onBlur,
  onSelectNode,
}: {
  prompt: string
  nodes: ContentCanvasNode[]
  mentionNodes?: ContentCanvasNode[]
  ownerNode: ContentCanvasNode | undefined
  candidateSelections: CandidateSelections
  className?: string
  ariaLabel: string
  onChange: (prompt: string) => void
  onBlur: (prompt: string) => void
  onSelectNode: (node: ContentCanvasNode) => void
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [mentionRange, setMentionRange] = useState<PromptMentionRange | null>(null)
  const [roleMenu, setRoleMenu] = useState<PromptReferenceRoleMenuState | null>(null)
  const [dropRoleMenu, setDropRoleMenu] = useState<PromptReferenceDropRoleMenuState | null>(null)
  const mentionOptions = useMemo(
    () => promptMentionOptions(mentionNodes, ownerNode, candidateSelections, mentionRange?.query ?? ''),
    [candidateSelections, mentionNodes, mentionRange?.query, ownerNode],
  )
  const mentionMenuOpen = Boolean(mentionRange && mentionOptions.length > 0)
  const segments = useMemo(
    () => promptReferenceSegments(prompt, nodes, ownerNode, candidateSelections),
    [candidateSelections, nodes, ownerNode, prompt],
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
    if (document.activeElement === editor) return
    if (serializePromptEditor(editor) === prompt) return
    editor.innerHTML = html
  }, [html, prompt])
  const handleInput = useCallback((event: FormEvent<HTMLDivElement>) => {
    const state = readPromptEditorState(event.currentTarget)
    onChange(state.value)
    setRoleMenu(null)
    setDropRoleMenu(null)
    updatePromptMentionRange(state.textBeforeCaret, state.caret, setMentionRange)
  }, [onChange])
  const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    setMentionRange(null)
    setDropRoleMenu(null)
  }, [])
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!resourceDropAcceptsPayload(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }, [])
  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!resourceDropAcceptsPayload(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    const payload = readResourceDragPayload(event.dataTransfer)
    if (!payload) return
    const mediaType = droppedResourceMediaType(payload.resource) ?? 'image'
    const editorState = readPromptEditorState(event.currentTarget)
    const roleOptions = promptReferenceRoleOptions(mediaType)
    const shellRect = shellRef.current?.getBoundingClientRect()
    if (roleOptions.length > 1) {
      setMentionRange(null)
      setRoleMenu(null)
      setDropRoleMenu({
        resourceId: payload.resourceId,
        mediaType,
        role: defaultReferenceRoleForMediaType(mediaType),
        promptValue: editorState.value || prompt,
        start: editorState.caret,
        end: editorState.caret,
        left: shellRect ? Math.max(0, Math.min(event.clientX - shellRect.left, shellRect.width - 220)) : 0,
        top: shellRect ? event.clientY - shellRect.top + 8 : 0,
      })
      return
    }
    insertPromptReferenceToken({
      editor: event.currentTarget,
      token: promptResourceReferenceToken(payload.resourceId, mediaType),
      prompt,
      onChange,
      setMentionRange,
      insertAt: {
        value: editorState.value || prompt,
        start: editorState.caret,
        end: editorState.caret,
      },
    })
  }, [onChange, prompt])
  const handleMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>('[data-prompt-reference-raw]')
      : null
    const raw = target?.dataset.promptReferenceRaw
    if (!raw) return
    event.preventDefault()
    setDropRoleMenu(null)
    const reference = referencesByRaw.get(raw)
    if (reference) {
      const shell = shellRef.current
      const targetRect = target.getBoundingClientRect()
      const shellRect = shell?.getBoundingClientRect()
      const mediaType = reference.previewMediaType ?? reference.selectedMediaType ?? reference.mediaType ?? 'image'
      setMentionRange(null)
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
    setDropRoleMenu(null)
    onBlur(serializePromptEditor(event.currentTarget))
  }, [onBlur])
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && dropRoleMenu) {
      event.preventDefault()
      setDropRoleMenu(null)
      return
    }
    if (event.key === 'Escape' && mentionRange) {
      event.preventDefault()
      setMentionRange(null)
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
        range: mentionRange,
      })
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.currentTarget.blur()
    }
  }, [dropRoleMenu, mentionOptions, mentionRange, onChange, prompt])

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
          onSelect={(option) => {
            const editor = editorRef.current
            if (!editor || !mentionRange) return
            insertPromptReferenceToken({
              editor,
              token: option.raw,
              prompt,
              onChange,
              setMentionRange,
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
      {dropRoleMenu ? (
        <PromptReferenceDropRoleMenu
          state={dropRoleMenu}
          onSelect={(role) => {
            const editor = editorRef.current
            if (!editor) return
            insertPromptReferenceToken({
              editor,
              token: formatResourceMention(dropRoleMenu.resourceId, {
                mediaType: dropRoleMenu.mediaType,
                role,
              }),
              prompt,
              onChange,
              setMentionRange,
              insertAt: {
                value: dropRoleMenu.promptValue,
                start: dropRoleMenu.start,
                end: dropRoleMenu.end,
              },
            })
            setDropRoleMenu(null)
          }}
          onClose={() => setDropRoleMenu(null)}
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

function promptReferenceSegments(
  prompt: string,
  nodes: ContentCanvasNode[],
  ownerNode: ContentCanvasNode | undefined,
  candidateSelections: CandidateSelections,
): Array<{ kind: 'text'; text: string } | { kind: 'reference'; reference: PromptReferenceItem }> {
  const segments: Array<{ kind: 'text'; text: string } | { kind: 'reference'; reference: PromptReferenceItem }> = []
  let lastIndex = 0
  for (const match of promptReferenceMatches(prompt)) {
    if (match.index > lastIndex) segments.push({ kind: 'text', text: prompt.slice(lastIndex, match.index) })
    segments.push({
      kind: 'reference',
      reference: resolvePromptReference(match, nodes, ownerNode, candidateSelections),
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
    const kind = match[1] as PromptReferenceItem['kind'] | undefined
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
      part.reference.missing ? ' data-missing="true"' : '',
      '>',
      promptReferenceInlineThumbHtml(part.reference),
      '<span>',
      `<strong>${escapeHtml(part.reference.title)}</strong>`,
      `<small>${escapeHtml(part.reference.label)}</small>`,
      '</span>',
      '</span>',
    ].join('')
  }).join('')
}

function promptReferenceInlineThumbHtml(reference: PromptReferenceItem): string {
  return [
    `<span class="content-canvas-prompt-reference-strip__fallback" data-media-type="${escapeAttribute(reference.previewMediaType ?? reference.mediaType ?? 'file')}">`,
    promptReferenceInlineFallbackIcon(reference.previewMediaType ?? reference.mediaType ?? 'file'),
    '</span>',
  ].join('')
}

function promptReferenceInlineFallbackIcon(mediaType: PromptReferenceItem['mediaType']): string {
  if (mediaType === 'video') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.94a.5.5 0 0 0-.78-.42L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>'
  }
  if (mediaType === 'image') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/></svg>'
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>'
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

type PromptReferenceDropRoleMenuState = {
  resourceId: number
  mediaType: PromptReferenceItem['mediaType']
  role: string
  left: number
  top: number
  promptValue: string
  start: number
  end: number
}

function promptResourceReferenceToken(resourceId: number, mediaType: PromptReferenceItem['mediaType'] = 'image'): string {
  return formatResourceMention(resourceId, {
    mediaType,
    role: defaultReferenceRoleForMediaType(mediaType),
  })
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

function updatePromptMentionRange(
  textBeforeCaret: string,
  caret: number,
  setMentionRange: (range: PromptMentionRange | null) => void,
) {
  const match = textBeforeCaret.match(PROMPT_REFERENCE_TRIGGER_RE)
  if (!match) {
    setMentionRange(null)
    return
  }
  const query = match[1] ?? ''
  setMentionRange({
    start: caret - query.length - 1,
    end: caret,
    query,
  })
}

function insertPromptReferenceToken({
  editor,
  token,
  prompt,
  onChange,
  setMentionRange,
  range,
  insertAt,
}: {
  editor: HTMLElement
  token: string
  prompt: string
  onChange: (prompt: string) => void
  setMentionRange: (range: PromptMentionRange | null) => void
  range?: PromptMentionRange | null
  insertAt?: { value: string; start: number; end: number }
}) {
  const editorState = readPromptEditorState(editor)
  const value = insertAt?.value ?? (editorState.value || prompt)
  if (value.includes(token)) {
    setMentionRange(null)
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

function PromptMentionMenu({
  options,
  onSelect,
}: {
  options: PromptReferenceItem[]
  onSelect: (option: PromptReferenceItem) => void
}) {
  return (
    <div className="content-canvas-prompt-mention-menu" role="listbox" aria-label="可引用列表">
      {options.map((option) => (
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

function PromptReferenceDropRoleMenu({
  state,
  onSelect,
  onClose,
}: {
  state: PromptReferenceDropRoleMenuState
  onSelect: (role: string) => void
  onClose: () => void
}) {
  const options = promptReferenceRoleOptions(state.mediaType)
  return (
    <div
      className="content-canvas-prompt-role-menu"
      role="menu"
      aria-label="选择引用角色"
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
        <span>取消插入</span>
        <small>不把该资源加入提示词</small>
      </button>
    </div>
  )
}

function resolvePromptReference(
  match: PromptReferenceMatch,
  nodes: ContentCanvasNode[],
  ownerNode: ContentCanvasNode | undefined,
  candidateSelections: CandidateSelections,
): PromptReferenceItem {
  const { kind, token, raw } = match
  if (kind === 'resource') {
    const resourceId = numberValue(token)
    const mediaType = match.mediaType ?? 'image'
    const role = match.role ?? defaultReferenceRoleForMediaType(mediaType)
    return {
      kind,
      token,
      raw,
      title: resourceId !== undefined ? `Resource ${resourceId}` : token,
      label: resourceId !== undefined ? resourceReferenceLabel(role) : '资源引用缺失',
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
    const fallbackResourceId = numberValue(node.record.resource_id ?? node.record.resourceId)
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
    const state = selectedCandidate || fallbackResourceId !== undefined
      ? 'selected'
      : candidates.length > 0
        ? 'pending'
        : 'empty'
    return {
      kind,
      token,
      raw,
      title: node.title,
      label: match.role ? `${promptReferenceStateLabel(kind, state)} · ${promptReferenceRoleShortLabel(match.role)}` : promptReferenceStateLabel(kind, state),
      node,
      resourceId: fallbackResourceId,
      role: match.role,
      selectedResourceId,
      mediaType: fallbackMediaType,
      selectedMediaType,
      previewResourceId,
      previewMediaType,
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

function iconForPromptReference(reference: PromptReferenceItem) {
  const mediaType = reference.previewMediaType ?? reference.selectedMediaType ?? reference.mediaType
  if (mediaType === 'video') return Video
  if (mediaType === 'image') return Image
  if (reference.node) return iconForContentNode(reference.node)
  return File
}

function promptReferenceLabel(kind: PromptReferenceItem['kind']): string {
  if (kind === 'asset') return 'Asset 引用'
  if (kind === 'keyframe') return '关键帧引用'
  if (kind === 'storyboard') return '分镜图引用'
  if (kind === 'scene_moment') return '情节引用'
  if (kind === 'expression_unit') return '表达单元引用'
  if (kind === 'content_unit') return '内容单元引用'
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

function droppedResourceMediaType(resource: unknown): PromptReferenceItem['mediaType'] | undefined {
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return undefined
  const record = resource as Record<string, unknown>
  return mediaTypeForReference(
    stringValue(record.type ?? record.resource_kind ?? record.resourceKind ?? record.mime_type ?? record.mimeType),
    stringValue(record.name ?? record.filename ?? record.artifact_ref ?? record.artifactRef ?? record.url),
  )
}

function defaultReferenceRoleForMediaType(mediaType: PromptReferenceItem['mediaType'] | undefined): string {
  return generationDefaultReferenceRoleForMediaType(mediaType) ?? 'reference_image'
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

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function uniqueStrings(...values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}
