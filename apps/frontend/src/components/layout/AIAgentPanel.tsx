import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  AtSign, Bot, ChevronRight, Send, Loader2,
  Plus, Copy, Check, X, ClipboardCheck, CircleStop,
  Image, Video, FileText, Mic, File, Workflow,
  Sparkles, Search, ListChecks, Upload, Eye, Wand2,
  Trash2, RefreshCw, History, Database, Save, FolderOpen, GripHorizontal,
  SlidersHorizontal, Wrench, Route, PlayIcon,
  MessageSquareText, Braces, FileJson, MoreHorizontal,
  Settings2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { AGENT_PANEL_DRAFT_EVENT, consumeAgentPanelDraft, notifyAgentPanelRunSettled, type AgentPanelDraftPayload } from '@/lib/agentPanelBridge'
import { attachmentFromResource, attachmentKey, attachmentKind, dedupeAttachments, placeholderAttachment } from '@/lib/agentAttachments'
import { publicModelId, publicModelLabel } from '@/lib/modelDisplay'
import { buildCommandFirstClientInput, buildPageContext, isDiagnosticAgentCommand, normalizeAgentCommandMessage } from '@/lib/agentCommandInput'
import { isGeneratedResultAttachment } from '@/lib/agentGeneratedResultAttachments'
import { generationProgressFromEvents, type GenerationProgressState } from '@/lib/agentGenerationMedia'
import { generationJobBadge, generationProgressTitle, generationStatusText, generationTimingLabel, type GenerationJobBadgeTone } from '@/lib/agentGenerationDisplay'
import {
  assistantResultPayloadForRun,
  fetchAllRunTraceEvents,
  fetchResourceById,
  hideGeneratedResultTechnicalSummary,
  hydrateHistoricalGeneratedAttachments,
  outputResourceIdsFromText,
} from '@/lib/agentMessageViewModel'
import { compactRunActivity, compactRunTraceEvents, liveTraceEventKey, mergeRunActivityEvents } from '@/lib/agentRunActivity'
import { agentPermissionModeLabel, agentPlanStatusLabel, agentTraceView, approvalPermissionLabel, approvalRiskLabel, approvalStatusLabel, inputTypeLabel, runApprovalModeLabel, runStatusLabel, toolApprovalLabel, toolGrantModeLabel, traceEventStatusLabel, traceKindLabel } from '@/lib/agentRunUi'
import { isRecord } from '@/lib/jsonValue'
import { syncRuntimeModelConfig } from '@/lib/runtimeChat'
import { toastMCPError, toastMCPStatus } from '@/lib/mcpStatus'
import { needsModelSetupAction } from '@/lib/actionableErrors'
import { openAdminConsole } from '@/lib/adminConsole'
import { RESOURCE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { GenerationJobSummaryCard, GenerationParamAuditCard, GenerationProgressCard, GenerationTraceSummaryCard, GenerationValidationErrorCard } from '@/components/agent/GenerationCards'
import { GeneratedResultCard } from '@/components/agent/GeneratedResultCard'
import {
  formatLocalAgentAssistantContent,
  LocalAgentWorkflowPanel,
  localAgentApprovalImpactText,
} from '@/components/agent/localRuntime'
import { extractAgentTaskArtifacts, type AgentTaskArtifactRef } from '@/lib/agentArtifacts'
import {
  canStartLocalAgentFromClient,
  isLocalAgentNotFoundError,
  localAgentClient,
  type AgentMessage,
  type AgentCapabilitiesResponse,
  type AgentHealth,
  type AgentClientInput,
  type AgentDebugTool,
  type AgentDraft,
  type AgentDraftApplyPreview,
  type AgentDraftKind,
  type AgentDraftStatus,
  type AgentInspectResponse,
  type AgentManifest,
  type AgentMemory,
  type AgentMemoryKind,
  type AgentMemoryScope,
  type AgentPlanSnapshot,
  type AgentRun,
  type AgentRunPolicy,
  type AgentRunPolicyOverride,
  type AgentRunPreview,
  type AgentRunStreamEvent,
  type AgentRunTraceSummary,
  type AgentThreadResolution,
  type AgentTraceEvent,
  type AgentThread as LocalAgentThread,
  type AgentThreadSummary,
} from '@/lib/localAgentClient'
import { actionableRunForPlan, agentTaskStatusLabel, buildPlanArtifactSummary, buildPlanNameConflictViews, buildPlanOverviewStats, buildPlanStatusExplanation, buildPlanTaskViews, plannerRunIdForPlanAction, shouldPollPlanSnapshot } from '@/lib/agentPlanUi'
import { buildDraftArtifactReviewPath, buildDraftReviewPath } from '@/lib/draftDomainModel'
import {
  AgentBody,
  AgentChatMessage,
  AgentComposer,
  AgentComposerAction,
  AgentComposerField,
  AgentComposerSubmit,
  AgentComposerToolbar,
  AgentConversationItem,
  AgentEmpty,
  AgentHeader,
  AgentHeaderActions,
  AgentHeaderContent,
  AgentMain,
  AgentShell,
  AgentSidebarSection,
  AgentSidebarTitle,
  AgentStatus,
  AgentSubtitle,
  AgentSuggestion,
  AgentSuggestions,
  AgentThread,
  AgentTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import {
  activeRunPresetFromSettings,
  useAgentStore,
  type ChatGenerationJob,
  type ChatMessage,
  type ChatRunActivity,
  type ChatRunActivityEvent,
  type ChatContextDiagnostic,
  type ChatContextDiagnosticTool,
  type Conversation,
  type AgentAttachment,
  type AgentSettings,
  type AgentPermissionMode,
} from '@/store/agentStore'
import { conversationIdForLocalThread, useAgentSessionStore, type AgentPageTaskState } from '@/store/agentSessionStore'
import { useUserStore } from '@/store/userStore'
import type { Project, PublicModel, RawResource } from '@/types'
import { ROUTES, agentRunPath } from '@/routes/projectRoutes'

// ── Markdown renderer ─────────────────────────────────────────────────────────

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="rounded-md overflow-hidden bg-black/20 my-2 text-xs">
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/10">
        <span className="font-mono text-muted-foreground/70">{lang || 'code'}</span>
        <button onClick={copy} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-all"><code>{code}</code></pre>
    </div>
  )
}

function renderInlineText(text: string) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={i} className="px-1 py-0.5 rounded bg-muted/60 text-xs font-mono">{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>
    return part.split('\n').map((line, j, arr) => (
      <React.Fragment key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</React.Fragment>
    ))
  })
}

function InlineText({ text, attachmentsById }: { text: string, attachmentsById?: Map<number, AgentAttachment> }) {
  const parts = text.split(/(@\[resource:\d+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^@\[resource:(\d+)\]$/)
        if (match) {
          const attachment = attachmentsById?.get(Number(match[1])) ?? placeholderAttachment(Number(match[1]))
          return <InlineResourceMention key={i} attachment={attachment} />
        }
        return <React.Fragment key={i}>{renderInlineText(part)}</React.Fragment>
      })}
    </>
  )
}

function MarkdownContent({ text, attachments }: { text: string; attachments?: AgentAttachment[] }) {
  const attachmentsById = useMemo(() => {
    const map = new Map<number, AgentAttachment>()
    for (const attachment of attachments ?? []) {
      if (attachment.resourceId !== undefined) map.set(attachment.resourceId, attachment)
    }
    return map
  }, [attachments])
  const segments = text.split(/(```[\w]*\n[\s\S]*?```)/g)
  return (
    <div>
      {segments.map((seg, i) => {
        const m = seg.match(/^```([\w]*)\n([\s\S]*?)```$/)
        if (m) return <CodeBlock key={i} lang={m[1]} code={m[2].trimEnd()} />
        return <span key={i}><InlineText text={seg} attachmentsById={attachmentsById} /></span>
      })}
    </div>
  )
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

function attachmentDisplayUrl(attachment: AgentAttachment) {
  return attachment.previewUrl ?? attachment.url
}

function stripAttachmentPreviewUrl(attachment: AgentAttachment): AgentAttachment {
  return { ...attachment, previewUrl: undefined }
}

function attachmentFromClientInputRef(attachment: NonNullable<AgentClientInput['attachments']>[number]): AgentAttachment {
  const type = attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'audio' || attachment.type === 'text'
    ? attachment.type
    : 'file'
  return {
    id: attachment.id ?? (attachment.resourceId !== undefined ? `res-${attachment.resourceId}` : `${attachment.name ?? 'attachment'}-${Math.random().toString(36).slice(2, 8)}`),
    name: attachment.name ?? `resource-${attachment.resourceId ?? 'attachment'}`,
    type,
    mimeType: attachment.mimeType ?? 'application/octet-stream',
    size: attachment.size ?? 0,
    ...(attachment.resourceId !== undefined ? { resourceId: attachment.resourceId } : {}),
  }
}

function AttachmentIcon({ type, size = 12 }: { type: AgentAttachment['type']; size?: number }) {
  if (type === 'image') return <Image size={size} />
  if (type === 'video') return <Video size={size} />
  if (type === 'audio') return <Mic size={size} />
  if (type === 'text') return <FileText size={size} />
  return <File size={size} />
}

function AttachmentPreview({ attachment, compact = false }: { attachment: AgentAttachment; compact?: boolean }) {
  const url = attachmentDisplayUrl(attachment)
  return (
    <div className={cn(
      'overflow-hidden rounded-md border border-border bg-background/70',
      compact ? 'w-28' : 'w-full'
    )}>
      {attachment.type === 'image' && url ? (
        <AuthedImage src={url} alt={attachment.name} className={cn(compact ? 'h-20' : 'h-56 max-h-[45vh]', 'w-full object-contain bg-muted')} />
      ) : attachment.type === 'video' && url ? (
        <AuthedVideo src={url} className={cn(compact ? 'h-20' : 'h-56 max-h-[45vh]', 'w-full object-contain bg-black')} muted controls />
      ) : (
        <div className="h-12 flex items-center justify-center text-muted-foreground bg-muted/40">
          <AttachmentIcon type={attachment.type} size={16} />
        </div>
      )}
      <div className="px-2 py-1 min-w-0">
        <p className="truncate text-[10px] font-medium text-foreground">{attachment.name}</p>
        <p className="text-[9px] text-muted-foreground">{formatBytes(attachment.size)}</p>
      </div>
    </div>
  )
}

const RESOURCE_MENTION_RE = /@\[resource:(\d+)\]/g
const RESOURCE_MENTION_TRIGGER_RE = /(?:^|[\s(])@([^\s@\[]*)$/u

function resourceMentionToken(resourceId: number) {
  return `@[resource:${resourceId}]`
}

function parseResourceMentionIds(text: string): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  for (const match of text.matchAll(RESOURCE_MENTION_RE)) {
    const id = Number(match[1])
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function stripResourceMentions(text: string): string {
  return text
    .replace(RESOURCE_MENTION_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function normalizeInlineSpacing(text: string): string {
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
}

function resourceMentionAttachments(text: string, byId: Map<number, AgentAttachment>): AgentAttachment[] {
  return parseResourceMentionIds(text).map((resourceId) => byId.get(resourceId) ?? placeholderAttachment(resourceId))
}

function serializeMentionEditor(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  const el = node as HTMLElement
  if (el.dataset?.resourceId) return `${resourceMentionToken(Number(el.dataset.resourceId))} `
  return Array.from(node.childNodes).map(serializeMentionEditor).join('')
}

function setCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function mentionEditorTextBeforeCaret(editor: HTMLElement): { text: string; caret: number } {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) return { text: serializeMentionEditor(editor), caret: 0 }
  const caretRange = selection.getRangeAt(0).cloneRange()
  const prefixRange = document.createRange()
  prefixRange.selectNodeContents(editor)
  prefixRange.setEnd(caretRange.endContainer, caretRange.endOffset)
  const container = document.createElement('div')
  container.appendChild(prefixRange.cloneContents())
  const text = serializeMentionEditor(container)
  return { text, caret: text.length }
}

function isImeComposing(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}

function renderMentionEditorValue(editor: HTMLElement, value: string, attachmentsById: Map<number, AgentAttachment>) {
  editor.replaceChildren()
  let lastIndex = 0
  for (const match of value.matchAll(RESOURCE_MENTION_RE)) {
    if (match.index === undefined) continue
    const before = value.slice(lastIndex, match.index)
    if (before) editor.appendChild(document.createTextNode(before))
    const resourceId = Number(match[1])
    const attachment = attachmentsById.get(resourceId) ?? placeholderAttachment(resourceId)
    editor.appendChild(buildMentionChipElement(attachment))
    lastIndex = match.index + match[0].length
  }
  const rest = value.slice(lastIndex)
  if (rest) editor.appendChild(document.createTextNode(rest))
  if (!editor.childNodes.length) editor.appendChild(document.createTextNode(''))
}

function hydrateMentionEditorMedia(editor: HTMLElement) {
  const mediaItems = Array.from(editor.querySelectorAll<HTMLImageElement | HTMLVideoElement>('.ai-agent-mention-chip__media'))
  for (const media of mediaItems) {
    const src = media.dataset.src
    if (!src || media.dataset.loadedSrc === src) continue
    const existingObjectUrl = media.dataset.objectUrl
    if (existingObjectUrl) URL.revokeObjectURL(existingObjectUrl)
    media.dataset.loadedSrc = src
    if (!mentionChipMediaNeedsAuth(src)) {
      media.src = src
      continue
    }
    api.get(src, { baseURL: '', responseType: 'blob' })
      .then((response) => {
        if (!media.isConnected || media.dataset.loadedSrc !== src) return
        const objectUrl = URL.createObjectURL(response.data)
        media.dataset.objectUrl = objectUrl
        media.src = objectUrl
      })
      .catch(() => {})
  }
}

function mentionChipMediaNeedsAuth(src: string): boolean {
  try {
    return new URL(src, window.location.origin).pathname.startsWith('/api/v1/resources/')
  } catch {
    return src.startsWith('/api/v1/resources/')
  }
}

function buildMentionChipElement(attachment: AgentAttachment): HTMLElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  if (attachment.resourceId !== undefined) chip.dataset.resourceId = String(attachment.resourceId)
  chip.className = 'ai-agent-mention-chip'

  const media = document.createElement(attachment.type === 'video' ? 'video' : 'img') as HTMLImageElement | HTMLVideoElement
  media.className = 'ai-agent-mention-chip__media'
  if (attachment.type === 'video') {
    const video = media as HTMLVideoElement
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
  } else {
    ;(media as HTMLImageElement).alt = attachment.name
  }
  const url = attachmentDisplayUrl(attachment)
  if (url) media.dataset.src = url
  chip.appendChild(media)

  const label = document.createElement('span')
  label.className = 'ai-agent-mention-chip__label'
  label.textContent = attachment.name
  chip.appendChild(label)
  return chip
}

const EMPTY_CONVERSATION_DRAFT: { input: string; attachments: AgentAttachment[] } = {
  input: '',
  attachments: [],
}

function InlineResourceMention({ attachment }: { attachment: AgentAttachment }) {
  const url = attachmentDisplayUrl(attachment)
  const media = attachment.type === 'image' && url ? (
    <AuthedImage src={url} alt={attachment.name} className="h-full w-full object-cover" />
  ) : attachment.type === 'video' && url ? (
    <AuthedVideo src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-muted/70 text-muted-foreground">
      <AttachmentIcon type={attachment.type} size={9} />
    </div>
  )

  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] leading-none text-foreground mx-0.5">
      <span className="h-4 w-4 shrink-0 overflow-hidden rounded bg-background/70">
        {media}
      </span>
      <span className="max-w-[96px] truncate">{attachment.name}</span>
    </span>
  )
}

function ComposerAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: AgentAttachment
  onRemove: () => void
}) {
  const url = attachmentDisplayUrl(attachment)
  const preview = attachment.type === 'image' && url ? (
    <AuthedImage src={url} alt={attachment.name} className="h-full w-full object-cover" />
  ) : attachment.type === 'video' && url ? (
    <AuthedVideo src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      <AttachmentIcon type={attachment.type} size={10} />
    </div>
  )

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background/70 px-2 py-1 text-[11px]">
      <span className="h-7 w-7 shrink-0 overflow-hidden rounded bg-muted/60">
        {preview}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-foreground">{attachment.name}</span>
        </div>
        <p className="truncate text-[9px] text-muted-foreground">{formatBytes(attachment.size)}</p>
      </div>
      <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label={`Remove ${attachment.name}`}>
        <X size={10} />
      </button>
    </div>
  )
}

function MentionResourceOption({ attachment, onSelect }: { attachment: AgentAttachment; onSelect: () => void }) {
  const url = attachmentDisplayUrl(attachment)
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect()
      }}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-muted/60"
    >
      <span className="h-7 w-7 shrink-0 overflow-hidden rounded bg-muted">
        {attachment.type === 'image' && url ? (
          <AuthedImage src={url} alt={attachment.name} className="h-full w-full object-cover" />
        ) : attachment.type === 'video' && url ? (
          <AuthedVideo src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <AttachmentIcon type={attachment.type} size={10} />
          </div>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{attachment.name}</span>
      <span className="shrink-0 text-[9px] text-muted-foreground">
        {attachment.resourceId ? `#${attachment.resourceId}` : ''}
      </span>
    </button>
  )
}

function AgentMentionEditor({
  editorRef,
  disabled,
  placeholder,
  onChange,
  onMentionState,
  onSubmit,
  onEscape,
  onAcceptMention,
}: {
  editorRef: React.RefObject<HTMLDivElement>
  disabled?: boolean
  placeholder: string
  onChange: (value: string) => void
  onMentionState: (value: string, caret: number) => void
  onSubmit: () => void
  onEscape: () => void
  onAcceptMention: () => boolean
}) {
  function syncFromEditor() {
    const editor = editorRef.current
    if (!editor) return
    const next = serializeMentionEditor(editor)
    onChange(next)
    const { text, caret } = mentionEditorTextBeforeCaret(editor)
    onMentionState(text, caret)
  }

  return (
    <div
      ref={editorRef}
      role="textbox"
      aria-multiline="true"
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={cn('ai-agent-panel-mention-editor', disabled && 'ai-agent-panel-mention-editor--disabled')}
      onInput={syncFromEditor}
      onClick={syncFromEditor}
      onKeyUp={(event) => {
        if (event.key === 'Escape') return
        syncFromEditor()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onEscape()
          return
        }
        if (isImeComposing(event)) return
        if ((event.key === 'Enter' || event.key === 'Tab') && onAcceptMention()) {
          event.preventDefault()
          return
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onSubmit()
        }
      }}
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
    />
  )
}

function attachmentPromptBlock(attachments: AgentAttachment[]) {
  if (attachments.length === 0) return ''
  const lines = attachments.map((a, index) => {
    const id = a.resourceId ? `resource_id=${a.resourceId}` : 'local_preview'
    return `${index + 1}. ${a.name} (${a.type}, ${a.mimeType || 'unknown'}, ${formatBytes(a.size)}, ${id})`
  })
  return `\n\n[用户随消息提供的附件]\n${lines.join('\n')}\n请在回答时引用附件名称；当前文本接口只能读取这些附件元数据，不能直接解析二进制内容。`
}

function buildAgentContext(options: {
  permissionMode: AgentPermissionMode
  autoPlan: boolean
  project: Project | null
  recentResources: RawResource[]
  includeProjectContext: boolean
  includeRecentResources: boolean
}) {
  void options
  return ''
}

function agentPermissionModeToApprovalMode(permissionMode: AgentPermissionMode): AgentRunPolicy['approvalMode'] {
  if (permissionMode === 'auto') return 'auto'
  if (permissionMode === 'suggest') return 'auto_readonly'
  return 'interactive'
}

type AgentSendRoute = 'local-runtime'

interface AgentSendDraft {
  id: string
  createdAt: number
  route: AgentSendRoute
  visibleUserContent: string
  attachments: AgentAttachment[]
  model: {
    id: number | null
    name?: string
    runtimeModelId?: string
    provider?: string
  }
  agent: {
    id: number | null
    name?: string
    soul?: string
  }
  settings: Pick<AgentSettings, 'permissionMode' | 'includeProjectContext' | 'includeRecentResources' | 'autoPlan'>
  contextLabels: string[]
  context: {
    project?: Pick<Project, 'ID' | 'name' | 'status' | 'description' | 'aspect_ratio' | 'visual_style' | 'project_style'>
    recentResources: Array<Pick<RawResource, 'ID' | 'name' | 'type' | 'mime_type' | 'size'>>
  }
  outbound: {
    systemPrompt: string
    agentContext: string
    enrichedUserContent: string
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  }
  httpRequests: DebugHttpRequest[]
  localRuntime?: {
    threadId?: string
    title?: string
    projectId?: number
    clientInput?: AgentClientInput
    agentManifest?: AgentManifest
    runPolicy?: AgentRunPolicyOverride
    requestId?: string
    timeoutMs?: number
    diagnosticCommand?: boolean
    preview?: AgentRunPreview
    previewError?: string
  }
  warnings: string[]
}

interface DebugHttpRequest {
  id: string
  label: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  url: string
  headers?: Record<string, string>
  body?: unknown
  note?: string
  conditional?: boolean
}

function makeTraceId() {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

const DEBUG_TEXT_MAX_CHARS = 4000
const STREAMING_ASSISTANT_FLUSH_MS = 50

function compactDebugValue(value: unknown, maxChars = DEBUG_TEXT_MAX_CHARS): unknown {
  if (typeof value === 'string') {
    if (value.length <= maxChars) return value
    return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars for debug preview]`
  }
  if (Array.isArray(value)) return value.map((item) => compactDebugValue(item, maxChars))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, compactDebugValue(item, maxChars)]),
    )
  }
  return value
}

function emptyLabel(t: ReturnType<typeof useTranslation>['t']) {
  return t('agents.chat.panel.runtime.empty')
}

function countCharsLabel(t: ReturnType<typeof useTranslation>['t'], count: number) {
  return t('agents.chat.panel.runtime.chars', { count })
}

function compactProject(project: Project | null): AgentSendDraft['context']['project'] | undefined {
  if (!project) return undefined
  return {
    ID: project.ID,
    name: project.name,
    status: project.status,
    description: project.description,
    aspect_ratio: project.aspect_ratio,
    visual_style: project.visual_style,
    project_style: project.project_style,
  }
}

function compactResource(resource: RawResource): Pick<RawResource, 'ID' | 'name' | 'type' | 'mime_type' | 'size'> {
  return {
    ID: resource.ID,
    name: resource.name,
    type: resource.type,
    mime_type: resource.mime_type,
    size: resource.size,
  }
}

function buildAgentClientInput(options: {
  message: string
  attachments: AgentAttachment[]
  projectId?: number
  labels?: string[]
  route?: { pathname?: string; search?: string; hash?: string }
  productionId?: number
  draftId?: string
  selection?: { entityType?: string; entityId?: number | string; label?: string } | null
}): AgentClientInput {
  const input = buildCommandFirstClientInput({
    message: options.message,
    attachments: options.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      mimeType: attachment.mimeType,
      size: attachment.size,
      ...(attachment.resourceId ? { resourceId: attachment.resourceId } : {}),
    })),
    labels: options.labels,
    hints: {
      ...(options.projectId ? { projectId: options.projectId } : {}),
      ...(options.productionId ? { productionId: options.productionId } : {}),
      ...(options.draftId ? { draftId: options.draftId } : {}),
      ...(options.selection ? { selection: options.selection } : {}),
      ...(options.route ? { route: options.route } : {}),
    },
  })
  return input
}

type ConversationContextTool = AgentDebugTool | AgentInspectResponse['registeredTools'][number]

interface ConversationAgentContextConfig {
  enabled: boolean
  manifest: AgentManifest | null
}

const EMPTY_AGENT_CONTEXT_CONFIG: ConversationAgentContextConfig = {
  enabled: false,
  manifest: null,
}

function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function buildDebugHttpRequests(options: {
  modelId: number | null
  modelName?: string
  messages: AgentSendDraft['outbound']['messages']
  localRuntime?: AgentSendDraft['localRuntime']
  labels: {
    syncModelConfig: string
    loadExistingThread: string
    missingThreadFallback: string
    createThread: string
    appendUserMessage: string
    createRun: string
    pollRun: string
    pollRunNote: string
    fetchFinalThread: string
  }
}): DebugHttpRequest[] {
  const baseURL = localAgentClient.baseURL
  const requests: DebugHttpRequest[] = []
  if (options.modelName) {
    requests.push({
      id: 'local-save-model-config',
      label: options.labels.syncModelConfig,
      method: 'POST',
      url: `${baseURL}/model-config`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        model: options.modelName,
        useForChat: true,
        useForPlanner: true,
      },
    })
  }

  const threadId = options.localRuntime?.threadId
  const resolvedThreadId = threadId ?? '{threadId from POST /threads}'
  const threadRequests: DebugHttpRequest[] = threadId
    ? [{
      id: 'local-get-thread',
      label: options.labels.loadExistingThread,
      method: 'GET',
      url: `${baseURL}/threads/${encodeURIComponent(threadId)}`,
      note: options.labels.missingThreadFallback,
    }]
    : [{
      id: 'local-create-thread',
      label: options.labels.createThread,
      method: 'POST',
      url: `${baseURL}/threads`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        title: options.localRuntime?.title,
      },
    }]

  requests.push(
    ...threadRequests,
    {
      id: 'local-add-message',
      label: options.labels.appendUserMessage,
      method: 'POST',
      url: `${baseURL}/threads/${resolvedThreadId}/messages`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        role: 'user',
        content: options.localRuntime?.clientInput?.message ?? options.messages.at(-1)?.content ?? '',
        ...(options.localRuntime?.clientInput ? { clientInput: options.localRuntime.clientInput } : {}),
      },
    },
    {
      id: 'local-create-run',
      label: options.labels.createRun,
      method: 'POST',
      url: `${baseURL}/runs`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        threadId: resolvedThreadId,
        ...(options.localRuntime?.clientInput ? { clientInput: options.localRuntime.clientInput } : {}),
      },
    },
    {
      id: 'local-poll-run',
      label: options.labels.pollRun,
      method: 'GET',
      url: `${baseURL}/runs/{runId}`,
      note: options.labels.pollRunNote,
    },
    {
      id: 'local-final-thread',
      label: options.labels.fetchFinalThread,
      method: 'GET',
      url: `${baseURL}/threads/${resolvedThreadId}`,
    },
  )
  return requests.map((request) => ({
    ...request,
    ...(request.body !== undefined ? { body: compactDebugValue(request.body) } : {}),
  }))
}

function threadResolutionActivityEvent(resolution: AgentThreadResolution | undefined): ChatRunActivityEvent | null {
  if (!resolution) return null
  const createdAt = new Date().toISOString()
  if (resolution.missingRequestedThread && resolution.requestedThreadId) {
    return {
      id: `local-thread-resolution-${resolution.threadId}`,
      kind: 'runtime',
      title: '本地线程不存在，已创建新线程',
      summary: `${resolution.requestedThreadId} -> ${resolution.threadId}`,
      status: 'info',
      data: {
        requestedThreadId: resolution.requestedThreadId,
        threadId: resolution.threadId,
        missingRequestedThread: true,
      },
      createdAt,
    }
  }
  if (resolution.reusedExistingThread && resolution.requestedThreadId) {
    return {
      id: `local-thread-resolution-${resolution.threadId}`,
      kind: 'runtime',
      title: '已延续本地线程',
      summary: resolution.threadId,
      status: 'completed',
      data: {
        requestedThreadId: resolution.requestedThreadId,
        threadId: resolution.threadId,
        reusedExistingThread: true,
      },
      createdAt,
    }
  }
  if (resolution.createdNewThread) {
    return {
      id: `local-thread-resolution-${resolution.threadId}`,
      kind: 'runtime',
      title: '已创建本地线程',
      summary: resolution.threadId,
      status: 'completed',
      data: {
        threadId: resolution.threadId,
        createdNewThread: true,
      },
      createdAt,
    }
  }
  return null
}

function LocalAgentWorkflow({
  run,
  approving = false,
  events,
  onApprove,
  onReject,
  onAnswerInput,
}: {
  run: AgentRun | null
  approving?: boolean
  events?: ChatRunActivityEvent[]
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: { choiceIds?: string[]; text?: string }) => void
}) {
  const { t } = useTranslation()
  return (
    <LocalAgentWorkflowPanel
      run={run}
      approving={approving}
      events={events}
      onApprove={onApprove}
      onReject={onReject}
      onAnswerInput={onAnswerInput}
      approvalDetails={(approval) => (
        <>
          {approval.permission && (
            <p className="mt-0.5 truncate text-[9px] text-muted-foreground/70">{t('agents.chat.panel.runtime.permission')}: {approvalPermissionLabel(approval.permission)}</p>
          )}
          {approval.args && (
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-1.5 text-[9px] text-muted-foreground">
              {safeJSONStringify(approval.args)}
            </pre>
          )}
          {(() => {
            const applyPreview = isDraftApplyPreview(approval.preview) ? approval.preview : null
            return applyPreview ? (
              <div className="mt-1 space-y-1">
                <div className="rounded bg-amber-500/10 p-1.5 text-[9px] leading-relaxed text-amber-800 dark:text-amber-300">
                  {applyPreview.review.sideEffect}
                </div>
                <DraftDiff preview={applyPreview} />
              </div>
            ) : null
          })()}
        </>
      )}
    />
  )
}

function AgentDebugPreviewDialog({
  draft,
  sending,
  onCancel,
  onConfirm,
}: {
  draft: AgentSendDraft | null
  sending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  if (!draft) return null
  const raw = safeJSONStringify(draft)
  const preview = draft.localRuntime?.preview
  const pendingApprovals = preview?.pendingApprovals.filter((approval) => approval.status === 'pending') ?? []
  const primaryRequest = draft.httpRequests[0]

  async function copyRaw() {
    await navigator.clipboard.writeText(raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3">
      <div className="flex max-h-[90vh] w-[min(1040px,100%)] flex-col overflow-hidden rounded-md border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={15} />
              <h2 className="text-sm font-semibold text-foreground">{t('agents.chat.panel.debugPreview.title')}</h2>
              <Badge variant="secondary" className="text-[10px]">{draft.route}</Badge>
              {primaryRequest && <Badge variant="outline" className="text-[10px]">{primaryRequest.method}</Badge>}
            </div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {primaryRequest ? primaryRequest.url : draft.id}
            </p>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onCancel} disabled={sending} aria-label={t('agents.chat.panel.debugPreview.close')}>
            <X size={14} />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid gap-2 md:grid-cols-4">
            <DebugSummaryItem label={t('agents.chat.panel.debugPreview.model')} value={String(draft.model.name ?? draft.model.id ?? t('common.emptyTitle'))} />
            <DebugSummaryItem label={t('agents.chat.panel.debugPreview.agent')} value={draft.agent.name ?? t('agents.chat.panel.debugPreview.agent')} />
            <DebugSummaryItem label={t('agents.chat.panel.debugPreview.approvalMode')} value={agentPermissionModeLabel(draft.settings.permissionMode)} />
            <DebugSummaryItem label={t('agents.chat.panel.debugPreview.requests')} value={String(draft.httpRequests.length)} />
          </div>

          {draft.warnings.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
              <div className="mb-1 font-medium text-amber-800 dark:text-amber-300">{t('agents.chat.panel.debugPreview.warnings')}</div>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}

          <DebugSection title={t('agents.chat.panel.prompt.finalHttpRequests')}>
            <div className="space-y-2">
              {draft.httpRequests.map((request, index) => (
                <DebugHttpRequestCard key={request.id} request={request} index={index} />
              ))}
            </div>
          </DebugSection>

          {preview?.context && (
            <DebugSection title={t('agents.chat.panel.debugPreview.context')}>
              <div className="grid gap-2 text-[11px] md:grid-cols-3">
                <DebugSummaryItem label={t('agents.chat.panel.debugPreview.route')} value={preview.context.route.pathname} />
                <DebugSummaryItem label={t('agents.chat.panel.debugPreview.project')} value={preview.context.project ? `#${preview.context.project.id} ${preview.context.project.name ?? ''}`.trim() : t('common.emptyTitle')} />
                <DebugSummaryItem label={t('agents.chat.panel.debugPreview.memories')} value={String(preview.context.memories.length)} />
              </div>
              {(preview.context.recentResources.length > 0 || preview.context.attachments.length > 0) && (
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 text-[10px]">
                  {safeJSONStringify({
                    selection: preview.context.selection,
                    recentResources: preview.context.recentResources,
                    attachments: preview.context.attachments,
                  })}
                </pre>
              )}
            </DebugSection>
          )}

          {preview?.skills && (
            <DebugSection title={t('agents.chat.panel.capabilities.skills')}>
              {preview.skills.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">{t('agents.chat.panel.runtime.noEnabledSkills')}</div>
              ) : (
                <div className="space-y-1.5">
                  {preview.skills.map((skill) => (
                    <div key={skill.id} className="rounded-md border border-border bg-muted/20 p-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{skill.name}</span>
                        <Badge variant="outline" className="text-[9px]">p{skill.resolvedPriority}</Badge>
                      </div>
                      <p className="mt-0.5 text-muted-foreground">{skill.description || skill.compiledInstruction || t('agents.chat.panel.runtime.noInstruction')}</p>
                    </div>
                  ))}
                </div>
              )}
            </DebugSection>
          )}

          {preview?.policy && (
            <DebugSection title={t('agents.chat.panel.runtime.policy')}>
              <div className="grid gap-2 text-[11px] md:grid-cols-4">
                <DebugSummaryItem label={t('agents.chat.panel.runtime.approvalMode')} value={runApprovalModeLabel(preview.policy.approvalMode)} />
                <DebugSummaryItem label={t('agents.chat.panel.runtime.maxToolCalls')} value={String(preview.policy.maxToolCalls)} />
                <DebugSummaryItem label={t('agents.chat.panel.runtime.maxIterations')} value={String(preview.policy.maxIterations)} />
                <DebugSummaryItem label={t('agents.chat.panel.runtime.fileBytes')} value={preview.policy.allowFileBytes ? t('agents.chat.panel.capabilities.approval.always') : t('agents.chat.panel.capabilities.approval.never')} />
              </div>
              <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 text-[10px] font-medium text-foreground">{t('agents.chat.panel.runtime.runtimeBoundaries')}</div>
                  <div className="space-y-0.5 text-[10px] text-muted-foreground">
                    <div>{t('agents.chat.panel.runtime.network')}: {preview.policy.allowNetwork ? t('agents.chat.panel.runtime.allowed') : t('agents.chat.panel.runtime.blocked')}</div>
                    <div>{t('agents.chat.panel.runtime.fileBytes')}: {preview.policy.allowFileBytes ? t('agents.chat.panel.runtime.allowed') : t('agents.chat.panel.runtime.blocked')}</div>
                    <div>{t('agents.chat.panel.runtime.costLimit')}: {preview.policy.costLimit ? `${preview.policy.costLimit.amount} ${preview.policy.costLimit.currency}` : t('agents.chat.panel.runtime.none')}</div>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 text-[10px] font-medium text-foreground">{t('agents.chat.panel.runtime.manifestGrants')}</div>
                  <div className="space-y-0.5 text-[10px] text-muted-foreground">
                    {(preview.agentManifest?.tools ?? []).slice(0, 8).map((grant) => (
                      <div key={grant.name}>{grant.name} · {toolGrantModeLabel(grant.mode)} · {grant.approval ? toolApprovalLabel(grant.approval) : t('agents.chat.panel.debugPreview.default')}</div>
                    ))}
                    {(preview.agentManifest?.tools ?? []).length === 0 && <div>{t('agents.chat.panel.runtime.none')}</div>}
                  </div>
                </div>
              </div>
            </DebugSection>
          )}

          {preview?.tools && (
            <DebugSection title={t('agents.chat.panel.capabilities.tools')}>
              <div className="grid gap-2 md:grid-cols-3">
                <DebugSummaryItem label={t('agents.chat.panel.runtime.available')} value={String(preview.tools.available.length)} />
                <DebugSummaryItem label={t('agents.chat.panel.runtime.blocked')} value={String(preview.tools.blocked.length)} />
                <DebugSummaryItem label={t('agents.chat.panel.runtime.discovered')} value={String(preview.tools.discovered.length)} />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 text-[10px] font-medium text-foreground">{t('agents.chat.panel.runtime.availableTools')}</div>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    {preview.tools.available.slice(0, 8).map((tool) => (
                      <div key={tool.name}>{tool.name} · {tool.risk ? approvalRiskLabel(tool.risk) : t('agents.chat.panel.runtime.unknown')} · {toolApprovalLabel(tool.approval)}</div>
                    ))}
                    {preview.tools.available.length === 0 && <div>{t('agents.chat.panel.runtime.none')}</div>}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 text-[10px] font-medium text-foreground">{t('agents.chat.panel.runtime.blockedTools')}</div>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    {preview.tools.blocked.slice(0, 8).map((tool) => (
                      <div key={tool.name}>{tool.name} · {tool.unavailableReason ?? t('agents.chat.panel.runtime.blocked')}</div>
                    ))}
                    {preview.tools.blocked.length === 0 && <div>{t('agents.chat.panel.runtime.none')}</div>}
                  </div>
                </div>
              </div>
            </DebugSection>
          )}

          {preview && (
            <DebugSection title={t('agents.chat.panel.runtime.agenticLoopPreview')}>
              <div className="space-y-2 text-[11px]">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="font-medium text-foreground">{preview.message}</div>
                  <div className="mt-1 text-muted-foreground">
                    {t('agents.chat.panel.runtime.project')}: {preview.currentProjectId ?? t('common.emptyTitle')} · {t('agents.chat.panel.runtime.memories')}: {preview.memoryCount} · {t('agents.chat.panel.runtime.toolCalls')}: {preview.toolCalls.length} · {t('agents.chat.panel.runtime.sandbox')}: {preview.policy?.sandboxMode ? t('agents.chat.panel.runtime.on') : t('agents.chat.panel.runtime.off')}
                  </div>
                </div>
                <div className="space-y-1">
                  {preview.toolCalls.length === 0 ? (
                    <div className="rounded-md border border-border bg-background px-2 py-1.5 text-muted-foreground">{t('agents.chat.panel.prompt.noImmediateToolCalls')}</div>
                  ) : preview.toolCalls.map((call, index) => (
                    <div key={`${call.name}-${index}`} className="rounded-md border border-border bg-background px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{index + 1}. {call.name}</span>
                        <Badge variant="outline" className="text-[9px]">{t('agents.chat.panel.runtime.tool')}</Badge>
                      </div>
                      {call.args && (
                        <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 text-[10px]">
                          {safeJSONStringify(call.args)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </DebugSection>
          )}

          {(draft.localRuntime || pendingApprovals.length > 0) && (
            <DebugSection title={t('agents.chat.panel.prompt.approvals')}>
              <div className="space-y-2 text-[11px]">
                {draft.localRuntime && (
                  <div className="grid gap-2 md:grid-cols-3">
                    <DebugSummaryItem label={t('agents.chat.panel.status.thread')} value={draft.localRuntime.threadId ?? t('agents.chat.panel.status.newThread')} />
                    <DebugSummaryItem label={t('agents.chat.panel.debugPreview.mode')} value={draft.localRuntime.diagnosticCommand ? t('agents.chat.panel.debugPreview.diagnostic') : t('agents.chat.panel.debugPreview.conversation')} />
                    <DebugSummaryItem label={t('agents.chat.panel.debugPreview.agent')} value={t('agents.chat.panel.debugPreview.default')} />
                  </div>
                )}
                {draft.localRuntime?.previewError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                    {draft.localRuntime.previewError}
                  </div>
                )}
                {pendingApprovals.length > 0 ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                    <div className="mb-1 font-medium text-amber-800 dark:text-amber-300">{t('agents.chat.workflow.approvalRequired')}</div>
                    <div className="space-y-1">
                      {pendingApprovals.map((approval) => (
                        <div key={approval.id} className="rounded border border-amber-500/20 bg-background/60 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{approval.toolName}</span>
                            <Badge variant="warning" className="text-[9px]">{approval.risk ? approvalRiskLabel(approval.risk) : approvalStatusLabel(approval.status)}</Badge>
                          </div>
                          <p className="mt-0.5 text-muted-foreground">{approval.reason}</p>
                          <div className="mt-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-1 text-[10px] leading-relaxed text-amber-900 dark:text-amber-200">
                            <span className="font-medium">{t('agents.chat.workflow.approvalImpact.label')}: </span>
                            {localAgentApprovalImpactText(approval)}
                          </div>
                          {approval.args && (
                            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 text-[10px]">
                              {safeJSONStringify(approval.args)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-border bg-muted/20 p-2 text-muted-foreground">
                    {t('agents.chat.panel.prompt.noApprovalRequired')}
                  </div>
                )}
              </div>
            </DebugSection>
          )}

          <DebugSection title={t('agents.chat.panel.prompt.outboundMessages')}>
            <div className="space-y-2">
              {draft.outbound.messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className="rounded-md border border-border bg-muted/20">
                  <div className="flex items-center justify-between border-b border-border/60 px-2 py-1">
                    <Badge variant="outline" className="text-[9px]">{message.role}</Badge>
                    <span className="text-[9px] text-muted-foreground">{countCharsLabel(t, message.content.length)}</span>
                  </div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[10px] leading-relaxed text-foreground">
                    {message.content || emptyLabel(t)}
                  </pre>
                </div>
              ))}
            </div>
          </DebugSection>

          {preview?.promptPreview && (
            <DebugSection title={t('agents.chat.panel.prompt.compiledPrompt')}>
              <div className="space-y-2">
                {preview.promptPreview.debugParts.map((part) => (
                  <div key={part.id} className="rounded-md border border-border bg-muted/20">
                    <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1">
                      <Badge variant="outline" className="text-[9px]">{part.kind}</Badge>
                      <span className="text-[10px] font-medium text-foreground">{part.title}</span>
                    </div>
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[10px] text-muted-foreground">
                      {part.content || emptyLabel(t)}
                    </pre>
                  </div>
                ))}
              </div>
            </DebugSection>
          )}

          <DebugSection title={t('agents.chat.panel.prompt.rawPayload')}>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 text-[10px] leading-relaxed">
              {raw}
            </pre>
          </DebugSection>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button type="button" size="sm" variant="ghost" onClick={copyRaw} className="h-8 text-xs">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? t('agents.chat.panel.debugPreview.copied') : t('agents.chat.panel.debugPreview.copyJson')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={sending}>
              {t('common.cancel')}
            </Button>
            <Button type="button" size="sm" onClick={onConfirm} disabled={sending}>
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {t('agents.chat.panel.debugPreview.send')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DebugSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function DebugHttpRequestCard({ request, index }: { request: DebugHttpRequest; index: number }) {
  const { t } = useTranslation()
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-2.5 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-background text-[10px] font-medium text-muted-foreground">
          {index + 1}
        </span>
        <Badge variant={request.conditional ? 'secondary' : 'outline'} className="text-[9px]">
          {request.conditional ? t('common.switch') : request.method}
        </Badge>
        {request.conditional && <Badge variant="outline" className="text-[9px]">{request.method}</Badge>}
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{request.label}</span>
      </div>
      <div className="space-y-2 p-2.5">
        <div className="min-w-0 rounded border border-border/70 bg-muted/20 px-2 py-1.5 font-mono text-[10px] text-foreground">
          <span className="font-semibold">{request.method}</span> <span className="break-all">{request.url}</span>
        </div>
        {request.note && (
          <p className="text-[10px] leading-relaxed text-muted-foreground">{request.note}</p>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          {request.headers && (
            <div>
              <div className="mb-1 text-[9px] font-medium uppercase tracking-normal text-muted-foreground">{t('agents.chat.panel.runtime.headers')}</div>
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded border border-border/70 bg-muted/20 p-2 text-[10px]">
                {safeJSONStringify(request.headers)}
              </pre>
            </div>
          )}
          {request.body !== undefined && (
            <div className={request.headers ? '' : 'md:col-span-2'}>
              <div className="mb-1 text-[9px] font-medium uppercase tracking-normal text-muted-foreground">{t('agents.chat.panel.runtime.body')}</div>
              <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded border border-border/70 bg-muted/20 p-2 text-[10px]">
                {safeJSONStringify(request.body)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DebugSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/20 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-normal text-muted-foreground">{label}</div>
      <div className="truncate text-[11px] font-medium text-foreground" title={value}>{value}</div>
    </div>
  )
}

interface PageContextSummary {
  pageKey?: string
  pageType?: string
  pageRoute?: string
  pageEntityType?: string
  pageEntityId?: number | string
  draftId?: string
  projectId?: number
  productionId?: number
  selectionLabel?: string
  selectionEntityType?: string
  selectionEntityId?: number | string
  labels: string[]
}

const EMPTY_PAGE_CONTEXT_SUMMARY: PageContextSummary = {
  labels: [],
}

function PageContextPanel({
  context,
}: {
  context: PageContextSummary
}) {
  const { t } = useTranslation()
  const rows = [
    context.pageRoute ? { label: t('agents.chat.panel.pageContext.route'), value: context.pageRoute } : null,
    context.pageKey ? { label: t('agents.chat.panel.pageContext.pageKey'), value: context.pageKey } : null,
    context.selectionLabel ? { label: t('agents.chat.panel.pageContext.selection'), value: context.selectionLabel } : null,
    context.draftId ? { label: t('agents.chat.panel.pageContext.currentDraft'), value: context.draftId } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="grid gap-2 text-[11px] md:grid-cols-3">
        <DebugSummaryItem label={t('agents.chat.panel.pageContext.page')} value={context.pageType || t('agents.chat.panel.pageContext.unknown')} />
        <DebugSummaryItem label={t('agents.chat.panel.pageContext.entity')} value={formatPageEntityLabel(context, t)} />
        <DebugSummaryItem label={t('agents.chat.panel.pageContext.currentDraft')} value={context.draftId || t('agents.chat.panel.pageContext.noDraft')} />
      </div>
      {rows.length > 0 ? (
        <div className="space-y-1">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1 text-[10px]">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="truncate font-mono text-foreground" title={row.value}>{row.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] leading-relaxed text-muted-foreground">{t('agents.chat.panel.pageContext.empty')}</p>
      )}
      {context.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {context.labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">{label}</Badge>
          ))}
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {context.draftId
          ? t('agents.chat.panel.pageContext.draftHint')
          : t('agents.chat.panel.pageContext.noDraftHint')}
      </p>
    </div>
  )
}

function AgentRuntimeContextPanel({
  context,
  emptyText,
}: {
  context?: AgentRunPreview['context']
  emptyText: string
}) {
  const { t } = useTranslation()
  if (!context) {
    return (
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {emptyText}
      </p>
    )
  }
  const route = [context.route.pathname, context.route.search ?? '', context.route.hash ?? ''].join('')
  const rows = [
    route ? { label: t('agents.chat.panel.pageContext.route'), value: route } : null,
    context.selection?.label ? { label: t('agents.chat.panel.pageContext.selection'), value: context.selection.label } : null,
    context.projectsError ? { label: '项目加载错误', value: context.projectsError } : null,
    ...(context.statusDigest ?? []).slice(0, 3).map((value, index) => ({ label: `状态 ${index + 1}`, value })),
    ...(context.rawContextHints ?? []).slice(0, 3).map((value, index) => ({ label: `提示 ${index + 1}`, value })),
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="grid gap-2 text-[11px] md:grid-cols-3">
        <DebugSummaryItem label={t('agents.chat.panel.context.project')} value={context.project ? `${context.project.name ?? `#${context.project.id}`}` : t('common.emptyTitle')} />
        <DebugSummaryItem label={t('agents.chat.panel.context.resources')} value={String(context.recentResources.length)} />
        <DebugSummaryItem label={t('agents.chat.panel.context.attachments')} value={String(context.attachments.length)} />
      </div>
      <div className="grid gap-2 text-[11px] md:grid-cols-3">
        <DebugSummaryItem label="制作" value={context.productionId !== undefined ? `#${context.productionId}` : t('agents.chat.panel.pageContext.none')} />
        <DebugSummaryItem label="项目数" value={String(context.projects?.length ?? 0)} />
        <DebugSummaryItem label="记忆数" value={String(context.memories.length)} />
      </div>
      {rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((row) => (
            <div key={`${row.label}-${row.value}`} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1 text-[10px]">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="truncate font-mono text-foreground" title={row.value}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
      {context.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {context.labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">{label}</Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function formatPageEntityLabel(context: PageContextSummary, t: ReturnType<typeof useTranslation>['t']) {
  const type = context.pageEntityType ?? context.selectionEntityType
  const id = context.pageEntityId ?? context.selectionEntityId
  if (!type && id === undefined) return t('agents.chat.panel.pageContext.none')
  if (!type) return String(id)
  return id === undefined ? type : `${type} #${id}`
}

function pageContextFromAgentContext(context?: AgentRunPreview['context']): PageContextSummary | undefined {
  if (!context) return undefined
  const route = {
    pathname: context.route.pathname,
    search: context.route.search,
    hash: context.route.hash,
  }
  const pageContext = buildPageContext({
    route,
    projectId: context.project?.id,
    productionId: context.productionId,
    selection: context.selection,
    labels: context.labels,
  })
  return {
    pageKey: pageContext?.pageKey,
    pageType: pageContext?.pageType,
    pageRoute: pageContext?.pageRoute,
    pageEntityType: pageContext?.pageEntityType,
    pageEntityId: pageContext?.pageEntityId,
    draftId: pageContext?.draftId,
    ...(context.project?.id !== undefined ? { projectId: context.project.id } : {}),
    ...(context.productionId !== undefined ? { productionId: context.productionId } : {}),
    selectionLabel: context.selection?.label,
    selectionEntityType: context.selection?.entityType,
    selectionEntityId: context.selection?.entityId,
    labels: context.labels,
  }
}

function agentContextFromRun(run: AgentRun | null | undefined): AgentRunPreview['context'] | undefined {
  const context = isRecord(run?.metadata?.context) ? run.metadata.context : undefined
  if (!context) return undefined
  const route = isRecord(context.route) ? context.route : undefined
  const pathname = stringValue(route?.pathname) ?? '/'
  const recentResources = Array.isArray(context.recentResources)
    ? context.recentResources.filter(isRecord).map((resource) => ({
      id: numberValue(resource.id) ?? numberValue(resource.ID) ?? 0,
      name: stringValue(resource.name) ?? '',
      type: stringValue(resource.type) ?? '',
      ...(stringValue(resource.mimeType ?? resource.mime_type) ? { mimeType: stringValue(resource.mimeType ?? resource.mime_type) } : {}),
      ...(numberValue(resource.size) !== undefined ? { size: numberValue(resource.size) } : {}),
    })).filter((resource) => resource.id > 0 && resource.name && resource.type)
    : []
  const attachments = Array.isArray(context.attachments)
    ? context.attachments.filter(isRecord).map((attachment) => ({
      id: stringValue(attachment.id) ?? '',
      name: stringValue(attachment.name) ?? '',
      type: stringValue(attachment.type) ?? 'file',
      ...(numberValue(attachment.resourceId) !== undefined ? { resourceId: numberValue(attachment.resourceId) } : {}),
    })).filter((attachment) => attachment.id && attachment.name)
    : []
  const memories = Array.isArray(context.memories)
    ? context.memories.filter(isRecord).map((memory) => ({
      id: stringValue(memory.id) ?? '',
      scope: stringValue(memory.scope) ?? (numberValue(memory.projectId) !== undefined ? 'project' : 'global'),
      kind: stringValue(memory.kind) ?? '',
      content: stringValue(memory.content) ?? '',
    })).filter((memory) => memory.id && memory.kind)
    : []
  const selection = isRecord(context.selection)
    ? {
      entityType: stringValue(context.selection.entityType) ?? '',
      entityId: stringValue(context.selection.entityId) ?? numberValue(context.selection.entityId) ?? '',
      ...(stringValue(context.selection.label) ? { label: stringValue(context.selection.label) } : {}),
    }
    : null
  return {
    route: {
      pathname,
      ...(stringValue(route?.search) ? { search: stringValue(route?.search) } : {}),
      ...(stringValue(route?.hash) ? { hash: stringValue(route?.hash) } : {}),
    },
    ...(Array.isArray(context.projects) ? { projects: context.projects.filter(isRecord).map((project) => ({
      id: numberValue(project.id) ?? 0,
      name: stringValue(project.name) ?? '',
      ...(stringValue(project.description) ? { description: stringValue(project.description) } : {}),
      ...(stringValue(project.status) ? { status: stringValue(project.status) } : {}),
      ...(numberValue(project.totalEpisodes) !== undefined ? { totalEpisodes: numberValue(project.totalEpisodes) } : {}),
    })).filter((project) => project.id > 0 && project.name) } : {}),
    ...(stringValue(context.projectsError) ? { projectsError: stringValue(context.projectsError) } : {}),
    ...(isRecord(context.project) && numberValue(context.project.id) !== undefined ? {
      project: {
        id: numberValue(context.project.id) as number,
        ...(stringValue(context.project.name) ? { name: stringValue(context.project.name) } : {}),
        ...(stringValue(context.project.status) ? { status: stringValue(context.project.status) } : {}),
        ...(stringValue(context.project.description) ? { description: stringValue(context.project.description) } : {}),
        ...(stringValue(context.project.aspect_ratio) ? { aspect_ratio: stringValue(context.project.aspect_ratio) } : {}),
        ...(stringValue(context.project.visual_style) ? { visual_style: stringValue(context.project.visual_style) } : {}),
        ...(stringValue(context.project.project_style) ? { project_style: stringValue(context.project.project_style) } : {}),
      },
    } : {}),
    ...(numberValue(context.productionId) !== undefined ? { productionId: numberValue(context.productionId) } : {}),
    selection: selection && selection.entityType && selection.entityId !== '' ? selection : null,
    recentResources,
    attachments,
    memories,
    labels: Array.isArray(context.labels) ? context.labels.filter((label): label is string => typeof label === 'string' && !!label.trim()) : [],
    ...(Array.isArray(context.statusDigest) ? { statusDigest: context.statusDigest.filter((item): item is string => typeof item === 'string') } : {}),
    ...(Array.isArray(context.rawContextHints) ? { rawContextHints: context.rawContextHints.filter((item): item is string => typeof item === 'string') } : {}),
  }
}

function clientInputFromRun(run: AgentRun | null | undefined): AgentClientInput | undefined {
  const clientInput = isRecord(run?.metadata?.clientInput) ? run.metadata.clientInput : undefined
  if (!clientInput) return undefined
  const message = stringValue(clientInput.message) ?? stringValue(clientInput.visibleMessage) ?? ''
  return {
    message,
    ...(Array.isArray(clientInput.attachments) ? { attachments: clientInput.attachments as AgentClientInput['attachments'] } : {}),
    ...(isRecord(clientInput.uiSnapshot) ? { uiSnapshot: clientInput.uiSnapshot as AgentClientInput['uiSnapshot'] } : {}),
  }
}

function workflowStepTitle(step: AgentRun['steps'][number]) {
  if (step.type === 'tool_call') return step.toolName ?? '工具调用'
  return '历史消息'
}

function agentStepStatusLabel(status: string): string {
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'in_progress') return '进行中'
  if (status === 'cancelled') return '已取消'
  if (status === 'pending') return '待处理'
  if (status === 'blocked') return '已阻塞'
  return `未知状态 (${status})`
}

function agentStepTypeLabel(type: string): string {
  if (type === 'tool_call') return '工具调用'
  if (type === 'message') return '消息'
  return `未知步骤 (${type})`
}

function genericRunStatusLabel(status: string): string {
  if (status === 'queued' || status === 'in_progress' || status === 'requires_action' || status === 'completed' || status === 'completed_with_warnings' || status === 'failed' || status === 'cancelled') {
    return runStatusLabel(status)
  }
  return `未知状态 (${status})`
}

function activityTraceView(event: ChatRunActivityEvent, runId: string) {
  return agentTraceView({
    id: event.id,
    runId,
    kind: event.kind as AgentTraceEvent['kind'],
    title: event.title,
    status: event.status as AgentTraceEvent['status'],
    ...(event.summary ? { summary: event.summary } : {}),
    ...(event.toolName ? { toolName: event.toolName } : {}),
    ...(event.stepId ? { stepId: event.stepId } : {}),
    ...(event.data !== undefined ? { data: event.data } : {}),
    createdAt: event.createdAt,
    ...(event.completedAt ? { completedAt: event.completedAt } : {}),
  })
}

function workflowStatusClass(status: string) {
  if (status === 'completed') return 'bg-green-500/10 text-green-700'
  if (status === 'failed') return 'bg-destructive/10 text-destructive'
  if (status === 'skipped') return 'bg-amber-500/10 text-amber-700'
  if (status === 'in_progress') return 'bg-blue-500/10 text-blue-700'
  return 'bg-muted text-muted-foreground'
}

function workflowDotClass(status: string) {
  if (status === 'completed') return 'border-green-500/30 bg-green-500/10 text-green-700'
  if (status === 'failed') return 'border-destructive/30 bg-destructive/10 text-destructive'
  return 'border-blue-500/30 bg-blue-500/10 text-blue-700'
}

function runStatusVariant(status: string): 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'completed') return 'success'
  if (status === 'completed_with_warnings' || status === 'requires_action') return 'warning'
  if (status === 'failed') return 'destructive'
  if (status === 'in_progress' || status === 'queued' || status === 'cancelled') return 'secondary'
  return 'outline'
}

const STOPPABLE_AGENT_RUN_STATUSES = new Set<AgentRun['status']>(['queued', 'in_progress', 'requires_action'])
const TERMINAL_AGENT_RUN_STATUSES = new Set<AgentRun['status']>(['completed', 'completed_with_warnings', 'failed', 'cancelled'])
const AGENT_CATALOG_TOOL_NAMES = new Set(['movscript_enable_agent_bundle', 'movscript_reload_agent_catalog'])
const CONTEXT_PANE_DEFAULT_HEIGHT = 220
const CONTEXT_PANE_MIN_HEIGHT = 96
const CONTEXT_PANE_MAX_HEIGHT = 620

function isStoppableAgentRun(run: AgentRun | null | undefined): run is AgentRun {
  return !!run && STOPPABLE_AGENT_RUN_STATUSES.has(run.status)
}

function isTerminalAgentRun(run: AgentRun | null | undefined): run is AgentRun {
  return !!run && TERMINAL_AGENT_RUN_STATUSES.has(run.status)
}

function createLocalAgentStopAbortError(): Error {
  try {
    return new DOMException('用户停止了当前会话。', 'AbortError')
  } catch {
    const error = new Error('用户停止了当前会话。')
    error.name = 'AbortError'
    return error
  }
}

function isLocalAgentAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError'
    || /aborted|abort|用户停止了当前会话|Run was cancelled/i.test(error.message)
}

function runTouchesAgentCatalog(run: AgentRun | null | undefined): boolean {
  if (!run) return false
  if (run.streamPartial) return false
  return run.steps.some((step) => step.type === 'tool_call' && step.toolName && AGENT_CATALOG_TOOL_NAMES.has(step.toolName))
}

function panelRunSettledStatusFromRun(run: AgentRun): 'completed' | 'error' | 'cancelled' {
  if (run.status === 'failed') return 'error'
  if (run.status === 'cancelled') return 'cancelled'
  return 'completed'
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function debugHttpRequestEvents(requests: DebugHttpRequest[], startedAt = new Date().toISOString()): ChatRunActivityEvent[] {
  return requests.map((request, index) => ({
    id: `http-request-${request.id}`,
    kind: 'model_call',
    title: `${request.method} ${request.label}`,
    summary: request.url,
    status: 'info',
    data: {
      httpRequest: {
        method: request.method,
        url: request.url,
        ...(request.headers ? { headers: request.headers } : {}),
        ...(request.body !== undefined ? { body: request.body } : {}),
        ...(request.note ? { note: request.note } : {}),
      },
    },
    createdAt: startedAt,
  }))
}

function setActivityEventStatus(
  events: ChatRunActivityEvent[],
  id: string,
  status: ChatRunActivityEvent['status'],
  completedAt?: string,
): ChatRunActivityEvent[] {
  return events.map((item) => (
    item.id === id
      ? {
        ...item,
        status,
        ...(completedAt ? { completedAt } : {}),
      }
      : item
  ))
}

function upsertActivityEvent(events: ChatRunActivityEvent[], item: ChatRunActivityEvent): ChatRunActivityEvent[] {
  const existingIndex = events.findIndex((candidate) => candidate.id === item.id)
  if (existingIndex >= 0) {
    return events.map((candidate, index) => index === existingIndex
      ? {
        ...candidate,
        ...item,
        data: item.data ?? candidate.data,
      }
      : candidate)
  }
  const setupItems = [...events.filter((candidate) => candidate.id.startsWith('local-runtime-')), item]
  const httpItems = events.filter((candidate) => candidate.id.startsWith('http-request-'))
  const runtimeItems = events.filter((candidate) => !candidate.id.startsWith('local-runtime-') && !candidate.id.startsWith('http-request-'))
  return [...setupItems, ...httpItems, ...runtimeItems]
}

interface ThinkingBubbleState {
  status: 'preparing_request' | 'thinking' | 'preparing_tool_call' | 'calling_tool' | 'retrying_model'
  toolName?: string
  label?: string
}

function toolNameFromToolCallStreamEvent(event: ChatRunActivityEvent): string | undefined {
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
  const stream = data?.stream && typeof data.stream === 'object' ? data.stream as Record<string, unknown> : undefined
  const toolCall = stream?.toolCall && typeof stream.toolCall === 'object' ? stream.toolCall as Record<string, unknown> : undefined
  return typeof toolCall?.name === 'string' && toolCall.name.trim() ? toolCall.name.trim() : undefined
}

async function cancelGenerationJobIfActive(state: GenerationProgressState | null): Promise<void> {
  if (!state || state.terminal || state.jobId === undefined) return
  try {
    await api.post(`/jobs/${state.jobId}/cancel`)
  } catch {
    // Stopping the agent run should still proceed if the backend job has already finished
    // or the generation provider cannot accept cancellation.
  }
}

function getThinkingBubbleState(run: AgentRun | null, events: ChatRunActivityEvent[]): ThinkingBubbleState {
  const retryStatus = latestModelRetryStatus(events)
  if (retryStatus) return { status: 'retrying_model', label: retryStatus }
  if (!run || run.status !== 'in_progress') return { status: 'thinking' }
  const activeToolStep = [...run.steps].reverse().find((step) => step.type === 'tool_call' && step.status === 'in_progress')
  if (activeToolStep) {
    return {
      status: 'calling_tool',
      ...(activeToolStep.toolName ? { toolName: activeToolStep.toolName } : {}),
    }
  }
  const latestToolCallEvent = [...events].reverse().find((event) => event.kind === 'tool_call' && event.title === 'Model tool call delta')
  if (!latestToolCallEvent) return { status: 'thinking' }
  const eventMs = new Date(latestToolCallEvent.createdAt).getTime()
  const hasNewerToolStep = Number.isFinite(eventMs)
    ? run.steps.some((step) => step.type === 'tool_call' && new Date(step.createdAt).getTime() >= eventMs)
    : false
  if (hasNewerToolStep) return { status: 'thinking' }
  return {
    status: 'preparing_tool_call',
    ...(toolNameFromToolCallStreamEvent(latestToolCallEvent) ? { toolName: toolNameFromToolCallStreamEvent(latestToolCallEvent) } : {}),
  }
}

function latestModelRetryStatus(events: ChatRunActivityEvent[]): string | undefined {
  const event = [...events].reverse().find((candidate) => candidate.kind === 'model_call' && candidate.title === 'Model retry scheduled')
  if (!event) return undefined
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
  const retry = data?.retry && typeof data.retry === 'object' ? data.retry as Record<string, unknown> : undefined
  const nextAttempt = typeof retry?.nextAttempt === 'number' ? retry.nextAttempt : undefined
  const maxAttempts = typeof retry?.maxAttempts === 'number' ? retry.maxAttempts : undefined
  const delayMs = typeof retry?.delayMs === 'number' ? retry.delayMs : undefined
  const attemptLabel = nextAttempt !== undefined && maxAttempts !== undefined ? `第 ${nextAttempt}/${maxAttempts} 次` : '下一次'
  const delayLabel = delayMs !== undefined ? `，等待 ${formatDurationLabel(delayMs)}` : ''
  return `模型请求暂时不可用，正在${attemptLabel}重试${delayLabel}`
}

function ThinkingBubble({ state = { status: 'thinking' } }: { run: AgentRun | null; state?: ThinkingBubbleState }) {
  const reasoning = ''
  const label = state.status === 'calling_tool'
    ? `调用工具${state.toolName ? `：${state.toolName}` : ''}`
    : state.status === 'preparing_tool_call'
      ? `准备调用工具${state.toolName ? `：${state.toolName}` : ''}`
      : state.status === 'preparing_request'
        ? '准备请求中'
        : state.status === 'retrying_model' ? state.label ?? '模型请求重试中' : '思考中'
  return (
    <div className="space-y-1">
      <AgentBubbleStatusText label={label} />
      <AgentChatMessage
        role="assistant"
        avatar={<Bot size={13} />}
        author="MovScript Agent"
        footer={(
          <Badge variant="outline" className="text-[9px] leading-4 px-1.5 py-0">
            {label}
          </Badge>
        )}
      >
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Loader2 size={11} className="animate-spin" />
            <span>{label}</span>
          </div>
          {reasoning ? <MarkdownContent text={reasoning} /> : <div className="text-[11px] text-muted-foreground">...</div>}
        </div>
      </AgentChatMessage>
    </div>
  )
}

function AgentBubbleStatusText({ label }: { label?: string }) {
  if (!label) return null
  return (
    <div className="flex justify-start pl-8">
      <div className="inline-flex max-w-[80%] items-center gap-1.5 text-[10px] leading-4 text-muted-foreground">
        <Loader2 size={10} className="animate-spin" />
        <span className="truncate">{label}</span>
      </div>
    </div>
  )
}

function GenerationProgressBubble({ state }: { state: GenerationProgressState }) {
  return (
    <AgentChatMessage
      role="assistant"
      avatar={<Bot size={13} />}
      author="MovScript Agent"
      footer={(
        <Badge variant={state.terminal ? 'outline' : 'secondary'} className="text-[9px] leading-4 px-1.5 py-0">
          {state.terminal ? '生成已结束' : '生成监控中'}
        </Badge>
      )}
    >
      <GenerationProgressCard state={state} />
    </AgentChatMessage>
  )
}

function ContextDiagnosticCard({ diagnostic }: { diagnostic: ChatContextDiagnostic }) {
  const [copied, setCopied] = useState(false)
  const totalChars = diagnostic.promptStats?.totalChars ?? diagnostic.messages.reduce((sum, message) => sum + message.content.length, 0)
  const availableTools = diagnostic.tools.available
  const blockedTools = diagnostic.tools.blocked
  const modelTools = diagnostic.tools.modelTools
  const focusPart = diagnostic.debugParts.find((part) => part.id === 'context.summary')

  function copyJSON() {
    navigator.clipboard.writeText(safeJSONStringify(diagnostic))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mt-1 space-y-2 rounded-md border border-border bg-background/70 p-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <MessageSquareText size={13} />
            <span>运行上下文</span>
            <Badge variant="outline" className="text-[9px] leading-4 px-1.5 py-0">
              /context
            </Badge>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            本地诊断快照；不会发起模型网关调用。
          </p>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={copyJSON}
          aria-label="复制上下文诊断 JSON"
          title="复制上下文诊断 JSON"
          className="shrink-0"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <DebugSummaryItem label="消息" value={String(diagnostic.messages.length)} />
        <DebugSummaryItem label="模型工具" value={String(modelTools.length)} />
        <DebugSummaryItem label="可用工具" value={String(availableTools.length)} />
        <DebugSummaryItem label="字符" value={String(totalChars)} />
      </div>

      {focusPart && (
        <details className="rounded-md border border-border bg-background/70" open>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
            <Route size={10} />
            页面焦点
          </summary>
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words border-t border-border px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {focusPart.content}
          </pre>
        </details>
      )}

      <details className="rounded-md border border-border bg-background/70" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
          <span className="inline-flex items-center gap-1.5"><Wrench size={10} /> 随模型请求发送的工具</span>
          <span className="text-[9px] text-muted-foreground">{modelTools.length}</span>
        </summary>
        <div className="max-h-72 space-y-1.5 overflow-y-auto border-t border-border p-1.5">
          {modelTools.length === 0 ? (
            <p className="px-1 text-[10px] text-muted-foreground">没有随请求发送可调用工具。</p>
          ) : modelTools.map((tool) => {
            const details = availableTools.find((candidate) => candidate.name === tool.name)
            return <ContextDiagnosticToolRow key={tool.name} tool={details ?? tool} parameters={tool.parameters} />
          })}
        </div>
      </details>

      {blockedTools.length > 0 && (
        <details className="rounded-md border border-border bg-background/70">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
            <span className="inline-flex items-center gap-1.5"><CircleStop size={10} /> 被阻止的工具</span>
            <span className="text-[9px] text-muted-foreground">{blockedTools.length}</span>
          </summary>
          <div className="max-h-56 space-y-1.5 overflow-y-auto border-t border-border p-1.5">
            {blockedTools.map((tool) => <ContextDiagnosticToolRow key={tool.name} tool={tool} />)}
          </div>
        </details>
      )}

      <details className="rounded-md border border-border bg-background/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
          <span className="inline-flex items-center gap-1.5"><FileJson size={10} /> 上下文片段</span>
          <span className="text-[9px] text-muted-foreground">{diagnostic.debugParts.length}</span>
        </summary>
        <div className="space-y-1.5 border-t border-border p-1.5">
          {diagnostic.debugParts.map((part) => (
            <div key={part.id} className="rounded border border-border/70 bg-muted/20">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Badge variant="outline" className="text-[8px] leading-3 px-1 py-0">{part.kind}</Badge>
                  <span className="truncate text-[10px] font-medium text-foreground">{part.title}</span>
                </div>
                <span className="shrink-0 text-[9px] text-muted-foreground">{part.content.length}</span>
              </div>
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {part.content}
              </pre>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-md border border-border bg-background/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
          <span className="inline-flex items-center gap-1.5"><Braces size={10} /> 模型请求消息</span>
          <span className="text-[9px] text-muted-foreground">{diagnostic.messages.length}</span>
        </summary>
        <div className="space-y-1.5 border-t border-border p-1.5">
          {diagnostic.messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className="rounded border border-border/70 bg-muted/20">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1">
                <Badge variant="outline" className="text-[8px] leading-3 px-1 py-0">{message.role}</Badge>
                <span className="text-[9px] text-muted-foreground">{message.content.length}</span>
              </div>
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[10px] leading-relaxed text-foreground">
                {message.content}
              </pre>
            </div>
          ))}
        </div>
      </details>

      {diagnostic.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
          {diagnostic.warnings.map((warning) => <div key={warning}>- {warning}</div>)}
        </div>
      )}
    </div>
  )
}

function ContextDiagnosticToolRow({ tool, parameters }: { tool: ChatContextDiagnosticTool | { name: string; description?: string }; parameters?: unknown }) {
  const schema = parameters ?? ('inputSchema' in tool ? tool.inputSchema : undefined)
  return (
    <div className="rounded border border-border/70 bg-background px-2 py-1.5 text-[10px]">
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate font-medium text-foreground">{tool.name}</span>
        {'risk' in tool && tool.risk && <Badge variant="outline" className="text-[8px] leading-3 px-1 py-0">{approvalRiskLabel(tool.risk)}</Badge>}
        {'approval' in tool && tool.approval && <Badge variant="secondary" className="text-[8px] leading-3 px-1 py-0">{toolApprovalLabel(tool.approval)}</Badge>}
        {'unavailableReason' in tool && tool.unavailableReason && <Badge variant="warning" className="text-[8px] leading-3 px-1 py-0">{tool.unavailableReason}</Badge>}
      </div>
      {tool.description && <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">{tool.description}</p>}
      {schema !== undefined && (
        <details className="mt-1 rounded border border-border/60 bg-muted/20">
          <summary className="cursor-pointer list-none px-1.5 py-1 text-[9px] text-muted-foreground marker:hidden">参数结构</summary>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words border-t border-border/60 px-1.5 py-1 text-[9px] text-muted-foreground">
            {safeJSONStringify(schema)}
          </pre>
        </details>
      )}
    </div>
  )
}

function formatActivityTime(value: string | undefined, locale: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function durationLabel(start: string | undefined, end: string | undefined) {
  if (!start || !end) return ''
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return ''
  const ms = endMs - startMs
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

function formatDurationLabel(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

type PlanDispatchSettings = {
  maxWorkers: number
  maxTaskAttempts: number
  workerTimeoutMs: number
}

const DEFAULT_PLAN_DISPATCH_SETTINGS: PlanDispatchSettings = {
  maxWorkers: 2,
  maxTaskAttempts: 2,
  workerTimeoutMs: 15 * 60_000,
}

const PLAN_MAX_WORKER_OPTIONS = [1, 2, 3, 4]
const PLAN_MAX_TASK_ATTEMPT_OPTIONS = [1, 2, 3]
const PLAN_WORKER_TIMEOUT_OPTIONS = [
  { label: '5m', value: 5 * 60_000 },
  { label: '15m', value: 15 * 60_000 },
  { label: '30m', value: 30 * 60_000 },
  { label: '1h', value: 60 * 60_000 },
]

function activitySummary(activity: ChatRunActivity) {
  const toolCount = activity.steps.length
  const completedCount = activity.steps.filter((step) => step.status === 'completed').length
  if (toolCount > 0) return `${completedCount}/${toolCount} 个步骤`
  return activity.events.length > 0 ? `${activity.events.length} 个事件` : '暂无工具调用'
}

function activityFromEvents(events: ChatRunActivityEvent[]): ChatRunActivity | undefined {
  if (events.length === 0) return undefined
  const firstEvent = events[0]
  const lastEvent = events[events.length - 1] ?? firstEvent
  const failed = events.some((event) => event.status === 'failed' || event.status === 'blocked')
  const running = events.some((event) => event.status === 'started' || event.status === 'in_progress')
  return {
    runId: 'pending',
    threadId: 'pending',
    status: failed ? 'failed' : running ? 'in_progress' : lastEvent.status,
    createdAt: firstEvent.createdAt,
    updatedAt: lastEvent.completedAt ?? lastEvent.createdAt,
    events,
    steps: [],
  }
}

function displayRunActivity(input: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
}): ChatRunActivity | undefined {
  const base = input.activity ?? (input.run ? compactRunActivity(input.run) : activityFromEvents(input.events ?? []))
  if (!base) return undefined
  if (!input.events?.length || base.events === input.events) return base
  return { ...base, events: [...base.events, ...input.events] }
}

function formatToolCallStreamDetail(event: ChatRunActivityEvent) {
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
  const stream = data?.stream && typeof data.stream === 'object' ? data.stream as Record<string, unknown> : undefined
  const toolCall = stream?.toolCall && typeof stream.toolCall === 'object' ? stream.toolCall as Record<string, unknown> : undefined
  if (!toolCall) return null
  const name = typeof toolCall.name === 'string' && toolCall.name.trim() ? toolCall.name : undefined
  const id = typeof toolCall.id === 'string' && toolCall.id.trim() ? toolCall.id : undefined
  const parseStatus = toolCallParseStatusLabel(typeof toolCall.parseStatus === 'string' ? toolCall.parseStatus : undefined)
  const args = typeof toolCall.argumentsBuffer === 'string' ? toolCall.argumentsBuffer : ''
  const parsedArgs = toolCall.argumentsJSON
  return {
    label: name ?? id ?? 'tool',
    parseStatus,
    args,
    parsedArgs,
  }
}

function formatGenerationTraceDetail(event: ChatRunActivityEvent) {
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
  const generation = data?.generation && typeof data.generation === 'object' ? data.generation as Record<string, unknown> : undefined
  if (!generation) return null
  const jobId = typeof generation.jobId === 'number' ? generation.jobId : undefined
  const status = typeof generation.status === 'string' ? generation.status : 'unknown'
  const stage = typeof generation.stage === 'string' ? generation.stage : undefined
  const progress = typeof generation.progress === 'number' ? generation.progress : undefined
  const outputResourceId = typeof generation.outputResourceId === 'number' ? generation.outputResourceId : undefined
  const outputResourceIds = generationOutputResourceIds(generation)
  const message = typeof generation.message === 'string' ? generation.message : undefined
  return {
    label: jobId !== undefined ? `生成任务 #${jobId}` : '生成任务',
    summary: [
      generationStatusText(status, stage),
      progress !== undefined ? `${progress}%` : undefined,
      generationOutputResourceSummary(outputResourceIds.length > 0 ? outputResourceIds : outputResourceId !== undefined ? [outputResourceId] : []),
    ].filter(Boolean).join(' · '),
    message,
    generation,
  }
}

function generationOutputResourceIds(generation: Record<string, unknown>) {
  const values = [
    ...(Array.isArray(generation.outputResourceIds) ? generation.outputResourceIds : []),
    ...(Array.isArray(generation.output_resource_ids) ? generation.output_resource_ids : []),
    generation.outputResourceId,
    generation.output_resource_id,
  ]
  const seen = new Set<number>()
  const ids: number[] = []
  for (const value of values) {
    const id = Number(value)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function generationOutputResourceSummary(ids: number[]) {
  if (ids.length === 0) return undefined
  return ids.length === 1 ? `资源 #${ids[0]}` : `资源 ${ids.map((id) => `#${id}`).join('、')}`
}

function toolCallParseStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'valid_json': return '参数已解析'
    case 'partial':
    case undefined: return '参数接收中'
    default: return `未知解析状态 (${status})`
  }
}

function ActivityJSONBlock({ label, value }: { label: string; value: unknown }) {
  const text = safeJSONStringify(value)
  return (
    <details className="mt-1 rounded border border-border/70 bg-muted/20">
      <summary className="cursor-pointer px-2 py-1 text-[9px] font-medium text-muted-foreground">
        {label}
      </summary>
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words border-t border-border/60 px-2 py-1.5 text-[9px] leading-relaxed text-muted-foreground">
        {text}
      </pre>
    </details>
  )
}

function RunActivityPanel({
  activity,
  run,
  events,
  title = 'Activity',
  defaultOpen = false,
  className,
}: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
  title?: string
  defaultOpen?: boolean
  className?: string
}) {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const displayData = displayRunActivity({ activity, run, events })
  if (!displayData) return null
  const runId = run?.id ?? activity?.runId

  const items = [
    ...displayData.steps.map((step) => ({
      id: step.id,
      kind: agentStepTypeLabel(step.type),
      title: step.toolName ?? step.title ?? (step.type === 'tool_call' ? '工具调用' : '历史消息'),
      status: step.status,
      time: formatActivityTime(step.createdAt, locale),
      duration: durationLabel(step.createdAt, step.completedAt),
      summary: step.error || (step.sandboxed ? '沙盒执行' : ''),
      args: step.args,
      result: step.result,
      error: step.error,
    })),
    ...displayData.events.map((event) => {
      const streamToolCall = formatToolCallStreamDetail(event)
      const generationTrace = formatGenerationTraceDetail(event)
      const eventView = activityTraceView(event, displayData.runId)
      const httpRequest = event.data && typeof event.data === 'object' && 'httpRequest' in event.data
        ? (event.data as Record<string, unknown>).httpRequest
        : undefined
      return {
        id: event.id,
        kind: httpRequest ? 'HTTP' : eventView?.categoryLabel ?? traceKindLabel(event.kind as AgentTraceEvent['kind']),
        title: generationTrace ? generationTrace.label : streamToolCall ? streamToolCall.label : event.toolName ? `${eventView?.title ?? event.title}: ${event.toolName}` : eventView?.title ?? event.title,
        status: event.status,
        time: formatActivityTime(event.createdAt, locale),
        duration: durationLabel(event.createdAt, event.completedAt),
        summary: generationTrace
          ? generationTrace.message ?? generationTrace.summary
          : streamToolCall ? `准备参数：${streamToolCall.parseStatus}（${streamToolCall.args.length} 字符）` : eventView?.behavior ?? eventView?.summary ?? event.summary,
        args: undefined,
        result: generationTrace ? generationTrace.generation : streamToolCall ? (streamToolCall.parsedArgs ?? streamToolCall.args) : event.data,
        error: event.status === 'failed' || event.status === 'blocked' ? event.summary : undefined,
      }
    }),
  ].sort((a, b) => {
    const aTime = new Date((displayData.steps.find((step) => step.id === a.id)?.createdAt ?? displayData.events.find((event) => event.id === a.id)?.createdAt ?? '')).getTime()
    const bTime = new Date((displayData.steps.find((step) => step.id === b.id)?.createdAt ?? displayData.events.find((event) => event.id === b.id)?.createdAt ?? '')).getTime()
    return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0)
  })

  return (
    <details
      className={cn('mt-2 rounded-md border border-border bg-background/70 text-xs', className)}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 marker:hidden">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <Workflow size={12} />
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {runId && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-5 px-1.5 text-[9px]"
              title="打开完整运行详情"
              aria-label="打开完整运行详情"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                navigate(agentRunPath(runId))
              }}
            >
              <Route size={9} />
              详情
            </Button>
          )}
          <Badge variant={runStatusVariant(displayData.status)} className="text-[9px] leading-4 px-1.5 py-0">
            {genericRunStatusLabel(displayData.status)}
          </Badge>
          <span className="text-[9px] text-muted-foreground">{activitySummary(displayData)}</span>
        </span>
      </summary>
      <div className="space-y-1.5 border-t border-border/70 px-2.5 py-2">
        {items.length === 0 ? (
          <div className="rounded border border-border/70 bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
            这次运行没有记录工具调用。
          </div>
        ) : items.map((item) => (
          <div key={item.id} className="rounded border border-border/70 bg-background px-2 py-1.5">
            <div className="flex min-w-0 items-start gap-1.5">
              <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', workflowDotClass(item.status))} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-medium text-foreground">{item.title}</span>
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[9px]', workflowStatusClass(item.status))}>
                    {agentStepStatusLabel(item.status)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
                  <span>{item.kind}</span>
                  {item.time && <span>{item.time}</span>}
                  {item.duration && <span>{item.duration}</span>}
                </div>
                {item.summary && (
                  <p className={cn('mt-1 text-[10px] leading-relaxed', item.error ? 'text-destructive' : 'text-muted-foreground')}>
                    {item.summary}
                  </p>
                )}
                {item.args !== undefined && <ActivityJSONBlock label="参数" value={item.args} />}
                {item.result !== undefined && <ActivityJSONBlock label={item.error ? '错误数据' : '结果'} value={item.result} />}
              </div>
            </div>
          </div>
        ))}
        {displayData.warnings?.length ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
            {displayData.warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}
        {displayData.error && (
          <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">
            {displayData.error}
          </div>
        )}
      </div>
    </details>
  )
}

function RunActivityTitleBubble({
  activity,
  run,
  events,
  title = '运行过程',
  className,
}: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
  title?: string
  className?: string
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const displayData = displayRunActivity({ activity, run, events })
  if (!displayData) return null
  const runId = run?.id ?? activity?.runId

  const openCard = () => setOpen(true)
  if (open) {
    return (
      <RunActivityPanel
        activity={activity}
        run={run}
        events={events}
        title={title}
        defaultOpen
        className={cn('mt-2', className)}
      />
    )
  }

  return (
    <div className={cn('mt-2 text-xs', className)}>
      <div className="flex w-full min-w-0 items-center gap-1 rounded-md border border-border bg-background/70 transition-colors hover:bg-muted/30">
        <button
          type="button"
          onDoubleClick={openCard}
          onKeyDown={(event) => {
            if (event.key === 'Enter') openCard()
          }}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title="双击打开运行过程"
          aria-expanded={open}
        >
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
            <Workflow size={12} />
            <span className="truncate">{title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Badge variant={runStatusVariant(displayData.status)} className="text-[9px] leading-4 px-1.5 py-0">
              {genericRunStatusLabel(displayData.status)}
            </Badge>
            <span className="text-[9px] text-muted-foreground">{activitySummary(displayData)}</span>
          </span>
        </button>
        {runId && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="mr-1 h-6 shrink-0 px-1.5 text-[9px]"
            title="打开完整运行详情"
            aria-label="打开完整运行详情"
            onClick={() => navigate(agentRunPath(runId))}
          >
            <Route size={10} />
            详情
          </Button>
        )}
      </div>
    </div>
  )
}

function PlanOverviewPanel({
  snapshot,
  busy,
  onDispatch,
  onReplan,
  onCancelTree,
  onAcceptReview,
  onReworkReview,
  onRejectReview,
  dispatchSettings,
  onDispatchSettingsChange,
}: {
  snapshot?: AgentPlanSnapshot
  busy?: boolean
  onDispatch?: () => void
  onReplan?: () => void
  onCancelTree?: () => void
  onAcceptReview?: (taskId: string) => void
  onReworkReview?: (taskId: string) => void
  onRejectReview?: (taskId: string) => void
  dispatchSettings?: PlanDispatchSettings
  onDispatchSettingsChange?: (settings: PlanDispatchSettings) => void
}) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [artifactTypeFilter, setArtifactTypeFilter] = useState<'all' | string>('all')
  const [traceSummaries, setTraceSummaries] = useState<Record<string, AgentRunTraceSummary>>({})
  const [loadingTraceSummaryRunId, setLoadingTraceSummaryRunId] = useState<string | null>(null)
  const [traceSummaryErrors, setTraceSummaryErrors] = useState<Record<string, string>>({})
  const [traceEventsByRunId, setTraceEventsByRunId] = useState<Record<string, AgentTraceEvent[]>>({})
  const [traceEventHasMoreByRunId, setTraceEventHasMoreByRunId] = useState<Record<string, boolean>>({})
  const [loadingTraceEventsRunId, setLoadingTraceEventsRunId] = useState<string | null>(null)
  const [traceEventErrors, setTraceEventErrors] = useState<Record<string, string>>({})
  const [traceEventKindFilters, setTraceEventKindFilters] = useState<Record<string, 'all' | AgentTraceEvent['kind']>>({})
  if (!snapshot) return null
  const taskViews = buildPlanTaskViews(snapshot)
  const artifactSummary = buildPlanArtifactSummary(snapshot)
  const nameConflicts = buildPlanNameConflictViews(snapshot)
  const overviewStats = buildPlanOverviewStats(snapshot)
  const planStatusExplanation = buildPlanStatusExplanation(snapshot)
  const availableArtifactTypes = new Set(artifactSummary.byType.map((item) => item.type))
  const activeArtifactTypeFilter = artifactTypeFilter === 'all' || availableArtifactTypes.has(artifactTypeFilter)
    ? artifactTypeFilter
    : 'all'
  const visiblePlanArtifacts = activeArtifactTypeFilter === 'all'
    ? artifactSummary.artifacts
    : artifactSummary.artifacts.filter((artifact) => artifact.type === activeArtifactTypeFilter)
  const tasks = taskViews.map((view) => view.task)
  const activeRuns = snapshot.runs.filter((run) => run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action').length
  const rootRun = snapshot.runs.find((run) => run.id === snapshot.plan.rootRunId)
  const canDispatch = activeRuns === 0 && tasks.some((task) => task.status === 'pending')
  const canReplan = tasks.some((task) => task.status === 'blocked' || task.status === 'failed' || task.status === 'cancelled')
  const canCancel = activeRuns > 0 || (rootRun && !isTerminalAgentRun(rootRun))
  const settings = dispatchSettings ?? DEFAULT_PLAN_DISPATCH_SETTINGS
  const updateSettings = (patch: Partial<PlanDispatchSettings>) => {
    onDispatchSettingsChange?.({ ...settings, ...patch })
  }
  const scrollToTask = (taskId: string | undefined) => {
    if (!taskId || typeof document === 'undefined') return
    document.getElementById(`agent-plan-task-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const openRun = (runId: string | undefined) => {
    if (!runId) return
    navigate(agentRunPath(runId))
  }
  const loadTraceSummary = async (runId: string) => {
    if (traceSummaries[runId] || loadingTraceSummaryRunId === runId) return
    setLoadingTraceSummaryRunId(runId)
    setTraceSummaryErrors((current) => {
      const next = { ...current }
      delete next[runId]
      return next
    })
    try {
      const summary = await localAgentClient.getRunTraceSummary(runId)
      setTraceSummaries((current) => ({ ...current, [runId]: summary }))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setTraceSummaryErrors((current) => ({ ...current, [runId]: message }))
    } finally {
      setLoadingTraceSummaryRunId(null)
    }
  }
  const loadTraceEvents = async (runId: string, mode: 'initial' | 'more' = 'initial') => {
    if ((mode === 'initial' && traceEventsByRunId[runId]) || loadingTraceEventsRunId === runId) return
    setLoadingTraceEventsRunId(runId)
    setTraceEventErrors((current) => {
      const next = { ...current }
      delete next[runId]
      return next
    })
    try {
      const currentEvents = traceEventsByRunId[runId] ?? []
      const cursor = mode === 'more' ? currentEvents.at(-1)?.id : undefined
      const response = await localAgentClient.getRunTraceEvents(runId, { limit: 8, ...(cursor ? { cursor } : {}) })
      setTraceEventsByRunId((current) => ({
        ...current,
        [runId]: mode === 'more' ? [...(current[runId] ?? []), ...response.events] : response.events,
      }))
      setTraceEventHasMoreByRunId((current) => ({ ...current, [runId]: typeof response.hasMore === 'boolean' ? response.hasMore : response.events.length >= 8 }))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setTraceEventErrors((current) => ({ ...current, [runId]: message }))
    } finally {
      setLoadingTraceEventsRunId(null)
    }
  }
  return (
    <div data-testid="agent-plan-overview" className="mt-2 rounded-md border border-border bg-background/70 px-2.5 py-2 text-xs">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
            <Route size={12} />
            <span className="truncate">{snapshot.plan.title}</span>
          </div>
          <div data-testid="agent-plan-overview-stats" className="mt-0.5 text-[9px] text-muted-foreground">
            {overviewStats.completedTaskCount}/{overviewStats.taskCount} 个任务 · {overviewStats.activeWorkerCount} 个执行器运行中
            {overviewStats.artifactCount > 0 && <> · {overviewStats.artifactCount} 个产物</>}
            {overviewStats.nameConflictCount > 0 && <> · {overviewStats.nameConflictCount} 个重名冲突</>}
          </div>
          <p data-testid="agent-plan-status-explanation" className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">{planStatusExplanation}</p>
        </div>
        <Badge variant={runStatusVariant(snapshot.plan.status)} className="shrink-0 text-[9px] leading-4 px-1.5 py-0">
          {agentPlanStatusLabel(snapshot.plan.status)}
        </Badge>
      </div>
      {nameConflicts.length > 0 && (
        <div data-testid="agent-plan-name-conflicts" className="mt-2 space-y-1 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[9px] leading-relaxed text-destructive">
          {nameConflicts.map((conflict) => (
            <div key={conflict.subagentName} className="min-w-0">
              <div className="truncate font-medium">子代理重名 · {conflict.subagentName}</div>
              <div className="mt-1 space-y-0.5">
                {conflict.entries.map((entry) => (
                  <div key={entry.taskId} className="flex min-w-0 items-center justify-between gap-2 rounded bg-background/70 px-1.5 py-0.5 text-muted-foreground">
                    <div className="min-w-0">
                      <div className="truncate text-foreground">{entry.taskTitle}</div>
                      <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                        <span className="truncate">任务 {entry.taskId}</span>
                        {entry.taskStatus && <span>{agentTaskStatusLabel(entry.taskStatus)}</span>}
                        {entry.ownerRunId && <span className="truncate">run {entry.ownerRunId}</span>}
                        {entry.ownerRunStatus && <span>{runStatusLabel(entry.ownerRunStatus)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => scrollToTask(entry.taskId)}>
                        任务
                      </Button>
                      {entry.ownerRunId && (
                        <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => openRun(entry.ownerRunId)}>
                          <Route size={8} />
                          运行
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {(onDispatch || onReplan || onCancelTree) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {onDispatch && (
            <Button type="button" size="xs" variant="outline" className="h-6 px-1.5 text-[9px]" disabled={busy || !canDispatch} onClick={onDispatch}>
              {busy ? <Loader2 size={10} className="animate-spin" /> : <PlayIcon size={10} />}
              分派
            </Button>
          )}
          {onReplan && (
            <Button type="button" size="xs" variant="outline" className="h-6 px-1.5 text-[9px]" disabled={busy || !canReplan} onClick={onReplan}>
              {busy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              重新规划
            </Button>
          )}
          {onCancelTree && (
            <Button type="button" size="xs" variant="ghost" className="h-6 px-1.5 text-[9px] text-destructive hover:text-destructive" disabled={busy || !canCancel} onClick={onCancelTree}>
              {busy ? <Loader2 size={10} className="animate-spin" /> : <CircleStop size={10} />}
              取消树
            </Button>
          )}
        </div>
      )}
      {onDispatchSettingsChange && (
        <div className="mt-2 grid grid-cols-3 gap-1">
          <Select value={String(settings.maxWorkers)} onValueChange={(next) => updateSettings({ maxWorkers: Number(next) })}>
            <SelectTrigger size="sm" className="h-6 min-w-0 text-[9px]" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_MAX_WORKER_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>{value} 个 worker</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(settings.maxTaskAttempts)} onValueChange={(next) => updateSettings({ maxTaskAttempts: Number(next) })}>
            <SelectTrigger size="sm" className="h-6 min-w-0 text-[9px]" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_MAX_TASK_ATTEMPT_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>{value} attempt{value === 1 ? '' : 's'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(settings.workerTimeoutMs)} onValueChange={(next) => updateSettings({ workerTimeoutMs: Number(next) })}>
            <SelectTrigger size="sm" className="h-6 min-w-0 text-[9px]" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_WORKER_TIMEOUT_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={String(item.value)}>{item.label} timeout</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round(Math.max(0, Math.min(1, snapshot.plan.progress)) * 100)}%` }}
        />
      </div>
      {artifactSummary.totalCount > 0 && (
        <details data-testid="agent-plan-artifact-summary" className="mt-2 rounded border border-border/70 bg-muted/10">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1 px-2 py-1.5 text-[9px] font-medium text-foreground">
            <FileText size={10} />
            <span>{artifactSummary.totalCount} 个计划产物</span>
            {artifactSummary.byType.slice(0, 3).map((item) => (
              <Badge key={item.type} variant="outline" className="text-[8px] leading-3 px-1 py-0">
                {item.type} {item.count}
              </Badge>
            ))}
          </summary>
          <div className="space-y-1 border-t border-border/60 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-muted-foreground">
                显示 {Math.min(visiblePlanArtifacts.length, 6)}/{visiblePlanArtifacts.length}
              </span>
              <Select value={activeArtifactTypeFilter} onValueChange={(next) => setArtifactTypeFilter(next)}>
                <SelectTrigger size="sm" className="h-6 w-32 max-w-full text-[9px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {artifactSummary.byType.map((item) => (
                    <SelectItem key={item.type} value={item.type}>{item.type} ({item.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {visiblePlanArtifacts.slice(0, 6).map((artifact) => (
              <div key={artifact.id} className="rounded bg-background/80 px-1.5 py-1 text-[9px] leading-relaxed text-muted-foreground">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{artifact.label}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {artifact.taskId && (
                      <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => scrollToTask(artifact.taskId)}>
                        定位
                      </Button>
                    )}
                    {artifact.sourceRunId && (
                      <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => openRun(artifact.sourceRunId)}>
                        <Route size={8} />
                        运行
                      </Button>
                    )}
                    {artifact.sourceTaskOwnerRunId && artifact.sourceTaskOwnerRunId !== artifact.sourceRunId && (
                      <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => openRun(artifact.sourceTaskOwnerRunId)}>
                        来源
                      </Button>
                    )}
                    <span>{artifact.type}</span>
                  </div>
                </div>
                <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                  {artifact.uri && <span className="truncate">URI {artifact.uri}</span>}
                  {artifact.taskTitle && <span className="truncate">任务 {artifact.taskTitle}</span>}
                  {artifact.sourceRunId && <span className="truncate">运行 {artifact.sourceRunId}</span>}
                  {artifact.sourceTaskId && <span className="truncate">来源任务 {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</span>}
                  {artifact.sourceTaskStatus && <span>{agentTaskStatusLabel(artifact.sourceTaskStatus)}</span>}
                  {artifact.subagentName && <span className="truncate">子代理 {artifact.subagentName}</span>}
                  {artifact.toolName && <span className="truncate">工具 {artifact.toolName}</span>}
                  {artifact.policy && <span className="truncate">策略 {artifact.policy}</span>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
      {tasks.length > 0 && (
        <div className="mt-2 space-y-1">
          {taskViews.map((view) => {
            const task = view.task
            return (
              <div id={`agent-plan-task-${task.id}`} key={task.id} className="flex min-w-0 scroll-mt-4 items-start gap-1.5 rounded border border-border/70 bg-background px-2 py-1.5">
                <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', workflowDotClass(task.status === 'done' ? 'completed' : task.status === 'failed' ? 'failed' : 'in_progress'))} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-medium text-foreground">{task.title}</span>
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[9px]', workflowStatusClass(task.status === 'done' ? 'completed' : task.status === 'failed' ? 'failed' : task.status === 'cancelled' ? 'failed' : 'in_progress'))}>
                      {agentPlanStatusLabel(task.status)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] text-muted-foreground">
                    <span>{Math.round(Math.max(0, Math.min(1, task.progress)) * 100)}%</span>
                    {view.ownerLabel ? (
                      <span className={cn('truncate', view.subagentName ? 'font-medium text-foreground' : '')}>{view.ownerLabel}</span>
                    ) : null}
                    {view.waitingInputCount > 0 && <span>{view.waitingInputCount} 个输入</span>}
                    {view.waitingApprovalCount > 0 && <span>{view.waitingApprovalCount} 个审批</span>}
                    {view.retryAttempt && <span>第 {view.retryAttempt}{view.maxTaskAttempts ? `/${view.maxTaskAttempts}` : ''} 次尝试</span>}
                    {!view.retryAttempt && view.maxTaskAttempts && <span>最多 {view.maxTaskAttempts} 次尝试</span>}
                    {view.previousStatus && <span>来自 {agentPlanStatusLabel(view.previousStatus)}</span>}
                    {view.workerTimeoutMs && <span>超时 {formatDurationLabel(view.workerTimeoutMs)}</span>}
                    {view.timedOutRunId && <span className="truncate">超时运行 {view.timedOutRunId}</span>}
                    {view.previousOwnerRunId && <span className="truncate">上次运行 {view.previousOwnerRunId}</span>}
                    {view.artifactCount > 0 && <span>{view.artifactCount} 个产物</span>}
                  </div>
                  <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">{view.statusExplanation}</p>
                  {view.blocker && (
                    <p className="mt-1 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">{view.blocker}</p>
                  )}
                  {view.worker && (
                    <details className="mt-1 rounded border border-border/60 bg-muted/10">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1 px-1.5 py-1 text-[9px] font-medium text-foreground">
                        <Bot size={10} />
                        <span className="truncate">执行器 {view.subagentName ?? view.worker.subagentName ?? view.worker.id}</span>
                        <Badge variant={runStatusVariant(view.worker.status)} className="text-[8px] leading-3 px-1 py-0">
                          {runStatusLabel(view.worker.status)}
                        </Badge>
                      </summary>
                      <div className="space-y-1 border-t border-border/60 px-1.5 py-1 text-[9px] leading-relaxed text-muted-foreground">
                        <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                          <span className="truncate">运行 {view.worker.id}</span>
                          {view.worker.parentRunId && <span className="truncate">上级 {view.worker.parentRunId}</span>}
                          {view.worker.taskId && <span className="truncate">任务 {view.worker.taskId}</span>}
                          {typeof view.worker.progress === 'number' && <span>{Math.round(Math.max(0, Math.min(1, view.worker.progress)) * 100)}%</span>}
                          <span>{view.worker.stepCount} 个步骤</span>
                        </div>
                        <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                          {view.worker.startedAt && <span className="truncate" title={view.worker.startedAt}>开始 {formatAgentDate(view.worker.startedAt, locale)}</span>}
                          {view.worker.completedAt && <span className="truncate" title={view.worker.completedAt}>完成 {formatAgentDate(view.worker.completedAt, locale)}</span>}
                          {view.worker.failedAt && <span className="truncate" title={view.worker.failedAt}>失败 {formatAgentDate(view.worker.failedAt, locale)}</span>}
                          {view.worker.cancelledAt && <span className="truncate" title={view.worker.cancelledAt}>取消 {formatAgentDate(view.worker.cancelledAt, locale)}</span>}
                          <span className="truncate" title={view.worker.updatedAt}>更新 {formatAgentDate(view.worker.updatedAt, locale)}</span>
                          {durationLabel(view.worker.startedAt, view.worker.completedAt ?? view.worker.failedAt ?? view.worker.cancelledAt) && (
                            <span>耗时 {durationLabel(view.worker.startedAt, view.worker.completedAt ?? view.worker.failedAt ?? view.worker.cancelledAt)}</span>
                          )}
                        </div>
                        {view.worker.error && (
                          <p className="text-destructive">{view.worker.error}</p>
                        )}
                        {view.worker.warnings.length > 0 && (
                          <div className="space-y-0.5 text-amber-700 dark:text-amber-300">
                            {view.worker.warnings.slice(0, 3).map((warning) => <div key={warning}>{warning}</div>)}
                          </div>
                        )}
                        {view.worker.recentSteps.length > 0 && (
                          <div className="space-y-1">
                            {view.worker.recentSteps.map((step) => (
                              <div key={step.id} className="rounded bg-background/80 px-1.5 py-1">
                                <div className="flex min-w-0 items-center justify-between gap-2">
                                  <span className="truncate font-medium text-foreground">{step.title}</span>
                                  <span className="shrink-0">{agentStepStatusLabel(step.status)}</span>
                                </div>
                                <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                                  <span>{agentStepTypeLabel(step.type)}</span>
                                  {step.toolName && <span className="truncate">工具 {step.toolName}</span>}
                                  {step.sandboxed && <span>沙盒</span>}
                                  <span className="truncate" title={step.createdAt}>创建 {formatAgentDate(step.createdAt, locale)}</span>
                                  {step.completedAt && <span className="truncate" title={step.completedAt}>完成 {formatAgentDate(step.completedAt, locale)}</span>}
                                  {durationLabel(step.createdAt, step.completedAt) && <span>耗时 {durationLabel(step.createdAt, step.completedAt)}</span>}
                                </div>
                                {step.error && <p className="mt-0.5 text-destructive">{step.error}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            className="h-5 px-1.5 text-[9px]"
                            onClick={() => navigate(agentRunPath(view.worker!.id))}
                          >
                            <Route size={9} />
                            详情
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            className="h-5 px-1.5 text-[9px]"
                            disabled={loadingTraceSummaryRunId === view.worker.id}
                            onClick={() => loadTraceSummary(view.worker!.id)}
                          >
                            {loadingTraceSummaryRunId === view.worker.id ? <Loader2 size={9} className="animate-spin" /> : <ListChecks size={9} />}
                            轨迹统计
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            className="h-5 px-1.5 text-[9px]"
                            disabled={loadingTraceEventsRunId === view.worker.id}
                            onClick={() => loadTraceEvents(view.worker!.id)}
                          >
                            {loadingTraceEventsRunId === view.worker.id ? <Loader2 size={9} className="animate-spin" /> : <History size={9} />}
                            运行事件
                          </Button>
                        </div>
                        {traceSummaries[view.worker.id] && (
                          <div className="rounded bg-background/80 px-1.5 py-1">
                            <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                              <span>{traceSummaries[view.worker.id].total} 个事件</span>
                              {Object.entries(traceSummaries[view.worker.id].byKind).slice(0, 6).map(([kind, count]) => (
                                <Badge key={kind} variant="outline" className="text-[8px] leading-3 px-1 py-0">
                                  {traceKindLabel(kind as AgentTraceEvent['kind'])} {count}
                                </Badge>
                              ))}
                            </div>
                            {traceSummaries[view.worker.id].latestEvent && (() => {
                              const latestView = agentTraceView(traceSummaries[view.worker.id].latestEvent!)
                              return (
                                <div className="mt-0.5 text-muted-foreground">
                                  最新 {latestView.title}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                        {traceSummaryErrors[view.worker.id] && (
                          <p className="text-destructive">{traceSummaryErrors[view.worker.id]}</p>
                        )}
                        {traceEventsByRunId[view.worker.id]?.length > 0 && (
                          <div className="space-y-1">
                            {(() => {
                              const events = traceEventsByRunId[view.worker!.id] ?? []
                              const kinds = Array.from(new Set(events.map((event) => event.kind))).sort()
                              const requestedKind = traceEventKindFilters[view.worker!.id] ?? 'all'
                              const activeKind = requestedKind === 'all' || kinds.includes(requestedKind) ? requestedKind : 'all'
                              const visibleEvents = activeKind === 'all' ? events : events.filter((event) => event.kind === activeKind)
                              return (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[9px] text-muted-foreground">
                                    显示 {visibleEvents.length}/{events.length}
                                  </span>
                                  <Select
                                    value={activeKind}
                                    onValueChange={(next) => {
                                      const filter = next === 'all' || kinds.includes(next as AgentTraceEvent['kind'])
                                        ? next as 'all' | AgentTraceEvent['kind']
                                        : 'all'
                                      setTraceEventKindFilters((current) => ({ ...current, [view.worker!.id]: filter }))
                                    }}
                                  >
                                    <SelectTrigger size="sm" className="h-6 w-32 max-w-full text-[9px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">全部事件</SelectItem>
                                      {kinds.map((kind) => (
                                        <SelectItem key={kind} value={kind}>{traceKindLabel(kind)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )
                            })()}
                            {(() => {
                              const events = traceEventsByRunId[view.worker!.id] ?? []
                              const kinds = Array.from(new Set(events.map((event) => event.kind)))
                              const requestedKind = traceEventKindFilters[view.worker!.id] ?? 'all'
                              const activeKind = requestedKind === 'all' || kinds.includes(requestedKind) ? requestedKind : 'all'
                              return (activeKind === 'all' ? events : events.filter((event) => event.kind === activeKind)).map((event) => {
                                const eventView = agentTraceView(event)
                                return (
                                  <div key={event.id} className="rounded bg-background/80 px-1.5 py-1">
                                    <div className="flex min-w-0 items-center justify-between gap-2">
                                      <span className="truncate font-medium text-foreground">{eventView.title}</span>
                                      <span className="shrink-0">{traceEventStatusLabel(event.status)}</span>
                                    </div>
                                    <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                                      <span>{eventView.categoryLabel}</span>
                                      <span>{traceKindLabel(event.kind)}</span>
                                      {event.toolName && <span className="truncate">工具 {event.toolName}</span>}
                                      {event.stepId && <span className="truncate">步骤 {event.stepId}</span>}
                                      <span className="truncate" title={event.createdAt}>创建 {formatAgentDate(event.createdAt, locale)}</span>
                                      {event.completedAt && <span className="truncate" title={event.completedAt}>完成 {formatAgentDate(event.completedAt, locale)}</span>}
                                      {durationLabel(event.createdAt, event.completedAt) && <span>耗时 {durationLabel(event.createdAt, event.completedAt)}</span>}
                                    </div>
                                    {eventView.behavior && <p className="mt-0.5 text-muted-foreground">行为：{eventView.behavior}</p>}
                                    {eventView.impact && <p className="mt-0.5 text-muted-foreground">影响：{eventView.impact}</p>}
                                    {eventView.summary && <p className="mt-0.5 text-muted-foreground">摘要：{eventView.summary}</p>}
                                  </div>
                                )
                              })
                            })()}
                            {traceEventHasMoreByRunId[view.worker.id] && (
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                className="h-5 px-1.5 text-[9px]"
                                disabled={loadingTraceEventsRunId === view.worker.id}
                                onClick={() => loadTraceEvents(view.worker!.id, 'more')}
                              >
                                {loadingTraceEventsRunId === view.worker.id ? <Loader2 size={9} className="animate-spin" /> : <History size={9} />}
                                加载更多
                              </Button>
                            )}
                          </div>
                        )}
                        {traceEventErrors[view.worker.id] && (
                          <p className="text-destructive">{traceEventErrors[view.worker.id]}</p>
                        )}
                      </div>
                    </details>
                  )}
                  {(view.pendingInputs.length > 0 || view.pendingApprovals.length > 0) && (
                    <details className="mt-1 rounded border border-amber-500/25 bg-amber-500/5">
                      <summary className="flex cursor-pointer list-none items-center gap-1 px-1.5 py-1 text-[9px] font-medium text-amber-800 dark:text-amber-300">
                        <ClipboardCheck size={10} />
                        <span>{view.pendingInputs.length + view.pendingApprovals.length} 个待处理</span>
                      </summary>
                      <div className="space-y-1 border-t border-amber-500/20 px-1.5 py-1">
                        {view.pendingInputs.map((input) => (
                          <div key={input.id} className="rounded bg-background/80 px-1.5 py-1 text-[9px] leading-relaxed">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate font-medium text-foreground">{input.title}</span>
                              <span className="shrink-0 text-muted-foreground">{inputTypeLabel(input.inputType)}</span>
                            </div>
                            <p className="mt-0.5 text-muted-foreground">{input.question}</p>
                            {input.choiceLabels.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {input.choiceLabels.slice(0, 3).map((label) => (
                                  <Badge key={label} variant="outline" className="max-w-full truncate text-[8px] leading-3 px-1 py-0">{label}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {view.pendingApprovals.map((approval) => (
                          <div key={approval.id} className="rounded bg-background/80 px-1.5 py-1 text-[9px] leading-relaxed">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate font-medium text-foreground">{approval.toolName}</span>
                              {approval.risk && <span className="shrink-0 text-muted-foreground">风险 {approvalRiskLabel(approval.risk)}</span>}
                            </div>
                            <p className="mt-0.5 text-muted-foreground">{approval.reason}</p>
                            {approval.permission && <div className="mt-0.5 text-muted-foreground">权限 {approvalPermissionLabel(approval.permission)}</div>}
                            <div className="mt-0.5 text-amber-800 dark:text-amber-300">
                              {t('agents.chat.workflow.approvalImpact.label')}: {localAgentApprovalImpactText(approval)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {task.status === 'needs_review' && (onAcceptReview || onReworkReview || onRejectReview) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {onAcceptReview && (
                        <Button type="button" size="xs" variant="outline" className="h-5 px-1.5 text-[9px]" disabled={busy} onClick={() => onAcceptReview(task.id)}>
                          通过
                        </Button>
                      )}
                      {onReworkReview && (
                        <Button type="button" size="xs" variant="ghost" className="h-5 px-1.5 text-[9px]" disabled={busy} onClick={() => onReworkReview(task.id)}>
                          返工
                        </Button>
                      )}
                      {onRejectReview && (
                        <Button type="button" size="xs" variant="ghost" className="h-5 px-1.5 text-[9px] text-destructive hover:text-destructive" disabled={busy} onClick={() => onRejectReview(task.id)}>
                          拒绝
                        </Button>
                      )}
                    </div>
                  )}
                  {view.artifactDetails.length > 0 && (
                    <details className="mt-1 rounded border border-border/60 bg-muted/10">
                      <summary className="flex cursor-pointer list-none flex-wrap gap-1 px-1.5 py-1">
                        {view.artifactDetails.slice(0, 2).map((artifact) => (
                          <Badge key={artifact.id} variant="outline" className="max-w-full truncate text-[8px] leading-3 px-1 py-0">
                            {artifact.label}
                          </Badge>
                        ))}
                      </summary>
                      <div className="space-y-1 border-t border-border/60 px-1.5 py-1">
                        {view.artifactDetails.map((artifact) => (
                          <div key={artifact.id} className="rounded bg-background/80 px-1.5 py-1 text-[9px] leading-relaxed text-muted-foreground">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate font-medium text-foreground">{artifact.label}</span>
                              <div className="flex shrink-0 items-center gap-1">
                                {artifact.sourceTaskId && (
                                  <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => scrollToTask(artifact.sourceTaskId)}>
                                    任务
                                  </Button>
                                )}
                                {artifact.sourceRunId && (
                                  <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => openRun(artifact.sourceRunId)}>
                                    <Route size={8} />
                                    运行
                                  </Button>
                                )}
                                {artifact.sourceTaskOwnerRunId && artifact.sourceTaskOwnerRunId !== artifact.sourceRunId && (
                                  <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => openRun(artifact.sourceTaskOwnerRunId)}>
                                    来源运行
                                  </Button>
                                )}
                                <span>{artifact.type}</span>
                              </div>
                            </div>
                            <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                              {artifact.uri && <span className="truncate">URI {artifact.uri}</span>}
                              {artifact.sourceRunId && <span className="truncate">运行 {artifact.sourceRunId}</span>}
                              {artifact.sourceTaskId && <span className="truncate">来源任务 {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</span>}
                              {artifact.sourceTaskStatus && <span>{agentTaskStatusLabel(artifact.sourceTaskStatus)}</span>}
                              {artifact.toolName && <span className="truncate">工具 {artifact.toolName}</span>}
                              {artifact.policy && <span className="truncate">策略 {artifact.policy}</span>}
                            </div>
                            {artifact.metadata && <ActivityJSONBlock label="元数据" value={artifact.metadata} />}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, projectId }: { msg: ChatMessage; projectId?: number }) {
  const { t, i18n } = useTranslation()
  const apiBaseURL = useAppSettingsStore((s) => s.settings.apiBaseURL)
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const time = new Date(msg.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const textOutputResourceIds = useMemo(() => outputResourceIdsFromText(msg.content), [msg.content])
  const existingResourceIds = useMemo(() => new Set((msg.attachments ?? []).map((attachment) => attachment.resourceId).filter((id): id is number => id !== undefined)), [msg.attachments])
  const missingTextOutputResourceIds = useMemo(
    () => textOutputResourceIds.filter((id) => !existingResourceIds.has(id)),
    [existingResourceIds, textOutputResourceIds],
  )
  const { data: historicalGeneratedAttachments = [] } = useQuery({
    queryKey: ['agent-historical-generated-attachments', msg.id, missingTextOutputResourceIds],
    queryFn: () => hydrateHistoricalGeneratedAttachments(msg.content, msg.attachments ?? []),
    enabled: !isUser && missingTextOutputResourceIds.length > 0,
    staleTime: 60_000,
  })
  const messageAttachments = useMemo(
    () => dedupeAttachments([...(msg.attachments ?? []), ...historicalGeneratedAttachments]),
    [historicalGeneratedAttachments, msg.attachments],
  )
  const mediaAttachments = messageAttachments.filter((attachment) => attachment.type === 'image' || attachment.type === 'video')
  const generatedMediaAttachments = mediaAttachments.filter(isGeneratedResultAttachment)
  const nonGeneratedMediaAttachments = mediaAttachments.filter((attachment) => !isGeneratedResultAttachment(attachment))
  const otherAttachments = messageAttachments.filter((attachment) => attachment.type !== 'image' && attachment.type !== 'video')
  const showLargeMedia = !isUser && generatedMediaAttachments.length > 0
  const hasUsableGeneratedResource = generatedMediaAttachments.some((attachment) => attachment.resourceId !== undefined)
  const compactAttachments = showLargeMedia ? [...nonGeneratedMediaAttachments, ...otherAttachments] : messageAttachments
  const contextDiagnostic = !isUser ? msg.meta?.contextDiagnostic : undefined
  const displayContent = contextDiagnostic
    ? ''
    : showLargeMedia && hasUsableGeneratedResource ? hideGeneratedResultTechnicalSummary(msg.content) : msg.content
  const showModelSetupAction = !isUser && needsModelSetupAction(msg.content)

  function copy() {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <AgentChatMessage
      role={isUser ? 'user' : 'assistant'}
      avatar={isUser ? '我' : <Bot size={13} />}
      author={isUser ? 'You' : 'MovScript Agent'}
      time={time}
      actions={(
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={copy}
          aria-label="Copy message"
          title="Copy message"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </Button>
      )}
      footer={msg.meta && (
        <div className={cn('flex flex-wrap gap-1', isUser ? 'justify-end' : 'justify-start')}>
          {msg.meta.contextLabels?.map((label) => (
            <Badge key={label} variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">
              {label}
            </Badge>
          ))}
        </div>
      )}
    >
      {displayContent && <MarkdownContent text={displayContent} attachments={messageAttachments} />}
      {showModelSetupAction && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[10px]">
          <div className="flex items-start gap-2">
            <Settings2 size={13} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{t('agents.chat.modelSetupAction.title')}</p>
              <p className="mt-0.5 leading-relaxed text-muted-foreground">{t('agents.chat.modelSetupAction.description')}</p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="mt-2"
                onClick={() => void openAdminConsole(apiBaseURL, '/models')}
              >
                {t('agents.chat.modelSetupAction.openModels')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {contextDiagnostic && <ContextDiagnosticCard diagnostic={contextDiagnostic} />}
      {!isUser && <GenerationTraceSummaryCard jobs={msg.meta?.generationJobs} />}
      {!isUser && <GenerationValidationErrorCard errors={msg.meta?.generationValidationErrors} />}
      {!isUser && <GenerationParamAuditCard audits={msg.meta?.generationParamAudits} />}
      {!isUser && <GenerationJobSummaryCard jobs={msg.meta?.generationJobs} />}
      {!isUser && <AgentDraftResultCards artifacts={msg.meta?.draftArtifacts} />}
      {!isUser && msg.meta?.localRunActivity && (
        <RunActivityTitleBubble
          activity={msg.meta.localRunActivity}
          title="运行过程"
        />
      )}
      {showLargeMedia && <GeneratedResultCard attachments={generatedMediaAttachments} projectId={projectId} />}
      {compactAttachments.length > 0 && (
        <div className={cn('mt-2 grid gap-1.5', compactAttachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {compactAttachments.map((attachment) => (
            <AttachmentPreview key={attachment.id} attachment={attachment} compact />
          ))}
        </div>
      )}
    </AgentChatMessage>
  )
}

function StreamingAssistantBubble({ content }: { content: string }) {
  const { t } = useTranslation()
  if (!content.trim()) return null
  return (
    <AgentChatMessage
      role="assistant"
      avatar={<Bot size={13} />}
      author={t('agents.chat.agentName')}
      footer={(
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">
            {t('agents.chat.streaming')}
          </Badge>
        </div>
      )}
    >
      <MarkdownContent text={content} />
    </AgentChatMessage>
  )
}

function LiveRunActivityBubble({
  run,
  events,
}: {
  run: AgentRun | null
  events: ChatRunActivityEvent[]
}) {
  if (!run && events.length === 0) return null
  const statusLabel = latestModelRetryStatus(events) ?? latestAgentStatusLabel(run, events)
  return (
    <div className="space-y-1">
      <AgentBubbleStatusText label={statusLabel} />
      <AgentChatMessage
        role="assistant"
        avatar={<Bot size={13} />}
        author="MovScript Agent"
        footer={(
          <Badge variant="outline" className="text-[9px] leading-4 px-1.5 py-0">
            运行中
          </Badge>
        )}
      >
        <RunActivityTitleBubble
          run={run}
          events={events}
          title="运行过程"
          className="mt-0"
        />
      </AgentChatMessage>
    </div>
  )
}

function latestAgentStatusLabel(run: AgentRun | null, events: ChatRunActivityEvent[]): string | undefined {
  const latest = [...events].reverse().find((event) => event.status === 'started' || event.status === 'info')
  if (latest?.title === 'Model HTTP request sent') return '正在请求模型'
  if (latest?.title === 'Prompt composed') return '正在整理上下文'
  if (latest?.title === 'Model stream delta') return '正在接收模型回复'
  if (latest?.title === 'Model tool call delta') return '正在准备工具调用'
  if (latest?.kind === 'tool_call') return latest.toolName ? `正在调用工具：${latest.toolName}` : '正在调用工具'
  if (run?.status === 'queued') return '等待 agent 开始'
  if (run?.status === 'in_progress') return 'agent 正在运行'
  return undefined
}

const MEMORY_SCOPES: AgentMemoryScope[] = ['global', 'project', 'thread']
const MEMORY_KINDS: AgentMemoryKind[] = ['preference', 'fact', 'decision', 'entity_ref', 'draft', 'warning']

function formatAgentDate(value: string | number, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

function localThreadTitle(thread: Pick<AgentThreadSummary, 'title' | 'id'>, t: ReturnType<typeof useTranslation>['t']) {
  return thread.title || t('agents.chat.panel.runtime.localThreadTitle', { id: thread.id.slice(-6) })
}

function timestampFromISO(value: string | undefined): number | undefined {
  if (!value) return undefined
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

async function restoredChatMessageFromLocalMessage(
  message: AgentMessage,
  restoredLabel: string,
): Promise<Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }> {
  const base = {
    role: message.role as 'user' | 'assistant',
    content: message.content,
    timestamp: timestampFromISO(message.createdAt),
  }
  if (message.role !== 'assistant' || !message.runId) {
    return {
      ...base,
      meta: { contextLabels: [restoredLabel] },
    }
  }
  try {
    const [run, traceEvents] = await Promise.all([
      localAgentClient.getRun(message.runId),
      fetchAllRunTraceEvents(message.runId),
    ])
    const resultPayload = await assistantResultPayloadForRun(
      { ...run, traceEvents },
      [],
      message.content,
      {
        fetchRunTraceEvents: async () => traceEvents.filter((event) => event.kind === 'tool_call'),
      },
    )
    return {
      ...base,
      ...resultPayload,
      meta: {
        ...resultPayload.meta,
        contextLabels: [
          restoredLabel,
          ...(resultPayload.meta.contextLabels ?? []),
        ],
      },
    }
  } catch {
    return {
      ...base,
      meta: {
        contextLabels: [
          restoredLabel,
          message.runId ? `run ${message.runId.slice(-6)}` : '',
        ].filter(Boolean),
      },
    }
  }
}

function asString(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function draftStatusVariant(status: AgentDraftStatus): 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'applied') return 'success'
  if (status === 'rejected') return 'destructive'
  if (status === 'accepted') return 'warning'
  if (status === 'superseded') return 'secondary'
  return 'outline'
}

function AgentDraftResultCards({ artifacts }: { artifacts?: AgentTaskArtifactRef[] }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const draftIds = useMemo(() => Array.from(new Set((artifacts ?? []).map((artifact) => artifact.draftId).filter(Boolean))), [artifacts])
  const artifactsById = useMemo(() => {
    const map = new Map<string, AgentTaskArtifactRef>()
    for (const artifact of artifacts ?? []) map.set(artifact.draftId, artifact)
    return map
  }, [artifacts])
  const draftsQuery = useQuery({
    queryKey: ['agent-message-draft-artifacts', localAgentClient.baseURL, draftIds],
    queryFn: async () => Promise.all(draftIds.map(async (draftId) => {
      try {
        return await localAgentClient.getDraft(draftId)
      } catch {
        return null
      }
    })),
    enabled: draftIds.length > 0,
    staleTime: 5_000,
    retry: false,
  })
  if (draftIds.length === 0) return null

  const draftsById = new Map((draftsQuery.data ?? []).filter((draft): draft is AgentDraft => !!draft).map((draft) => [draft.id, draft]))
  const draftCards = dedupeDraftResultCards(draftIds, artifactsById, draftsById)

  return (
    <div className="mt-2 space-y-1.5">
      {draftCards.map(({ draftId, artifact, draft }) => {
        const title = draft?.title ?? artifact?.title ?? draftId
        const kind = draft?.kind ?? artifact?.draftKind
        const updatedAt = draft?.updatedAt ?? artifact?.updatedAt
        const openPath = draft ? buildDraftReviewPath(draft) : artifact ? buildDraftArtifactReviewPath(artifact) : null
        return (
          <div key={draftId} className="rounded-md border border-border bg-background/70 px-2.5 py-2 text-xs">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                  <ClipboardCheck size={12} />
                  <span className="truncate">{title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground">
                  {kind && <Badge variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">{t(`agents.chat.drafts.kinds.${kind}`)}</Badge>}
                  {draft?.status && <Badge variant={draftStatusVariant(draft.status)} className="text-[9px] leading-4 px-1.5 py-0">{t(`agents.chat.drafts.status.${draft.status}`)}</Badge>}
                  {updatedAt && <span>{formatAgentDate(updatedAt, locale)}</span>}
                </div>
              </div>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="h-6 shrink-0 px-1.5 text-[10px]"
                disabled={!openPath && draftsQuery.isLoading && !draft}
                onClick={() => navigate(openPath ?? ROUTES.agentDrafts)}
              >
                <Route size={10} />
                {openPath ? t('agents.chat.panel.drafts.openPage') : t('agents.chat.panel.drafts.history')}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function dedupeDraftResultCards(
  draftIds: string[],
  artifactsById: Map<string, AgentTaskArtifactRef>,
  draftsById: Map<string, AgentDraft>,
): Array<{ draftId: string; artifact?: AgentTaskArtifactRef; draft?: AgentDraft }> {
  const cards: Array<{ draftId: string; artifact?: AgentTaskArtifactRef; draft?: AgentDraft }> = []
  const seen = new Set<string>()
  for (const draftId of draftIds) {
    const artifact = artifactsById.get(draftId)
    const draft = draftsById.get(draftId)
    const key = draft ? `draft:${draft.id}` : fallbackDraftCardKey(draftId, artifact)
    if (seen.has(key)) continue
    seen.add(key)
    cards.push({ draftId: draft?.id ?? draftId, artifact, draft })
  }
  return cards
}

function fallbackDraftCardKey(draftId: string, artifact?: AgentTaskArtifactRef) {
  if (artifact?.draftKind || artifact?.title || artifact?.sourceRunId || artifact?.sourceThreadId) {
    return [
      'artifact',
      artifact?.draftKind ?? '',
      artifact?.title ?? '',
      artifact?.sourceRunId ?? '',
      artifact?.sourceThreadId ?? '',
    ].join(':')
  }
  return [
    'artifact',
    draftId,
  ].join(':')
}

function diffRows(currentValue: unknown, proposedValue: unknown) {
  const before = asString(currentValue)
  const after = asString(proposedValue)
  if (before === after) {
    return [{ type: 'same' as const, text: after }]
  }
  return [
    ...(before ? before.split('\n').map((text) => ({ type: 'removed' as const, text })) : [{ type: 'removed' as const, text: '' }]),
    ...(after ? after.split('\n').map((text) => ({ type: 'added' as const, text })) : [{ type: 'added' as const, text: '' }]),
  ]
}

function DraftDiff({ preview }: { preview: AgentDraftApplyPreview }) {
  const { t } = useTranslation()
  const rows = diffRows(preview.review.currentValue, preview.review.proposedValue)
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="grid border-b border-border bg-muted/30 text-[10px] font-medium text-muted-foreground md:grid-cols-2">
        <div className="border-b border-border px-2 py-1.5 md:border-b-0 md:border-r">{t('agents.chat.panel.drafts.current')}</div>
        <div className="px-2 py-1.5">{t('agents.chat.panel.drafts.proposed')}</div>
      </div>
      <div className="grid md:grid-cols-2">
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-b border-border bg-red-500/5 p-2 text-[10px] leading-relaxed text-red-700 md:border-b-0 md:border-r">
          {asString(preview.review.currentValue) || t('common.emptyTitle')}
        </pre>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words bg-green-500/5 p-2 text-[10px] leading-relaxed text-green-700">
          {asString(preview.review.proposedValue) || t('common.emptyTitle')}
        </pre>
      </div>
      <div className="border-t border-border bg-muted/20 p-2">
        <div className="max-h-36 overflow-auto rounded border border-border bg-background font-mono text-[10px]">
          {rows.map((row, index) => (
            <div
              key={`${row.type}-${index}`}
              className={cn(
                'whitespace-pre-wrap break-words px-2 py-0.5',
                row.type === 'removed' && 'bg-red-500/10 text-red-700',
                row.type === 'added' && 'bg-green-500/10 text-green-700',
                row.type === 'same' && 'text-muted-foreground',
              )}
            >
              {row.type === 'removed' ? '- ' : row.type === 'added' ? '+ ' : '  '}
              {row.text || emptyLabel(t)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function isDraftApplyPreview(value: unknown): value is AgentDraftApplyPreview {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<AgentDraftApplyPreview>
  return !!record.review
    && typeof record.review === 'object'
    && typeof record.review.draftId === 'string'
    && !!record.draft
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function MemoryPanel({
  project,
  threadId,
  online,
}: {
  project: Project | null
  threadId?: string
  online: boolean
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [scope, setScope] = useState<AgentMemoryScope>('global')
  const [kind, setKind] = useState<AgentMemoryKind>('preference')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const query = {
    scope,
    ...(scope === 'project' && project ? { projectId: project.ID } : {}),
    ...(scope === 'thread' && threadId ? { threadId } : {}),
  }
  const scopedTargetMissing = (scope === 'project' && !project) || (scope === 'thread' && !threadId)
  const memoriesQuery = useQuery<AgentMemory[]>({
    queryKey: ['local-agent-memories', localAgentClient.baseURL, query],
    queryFn: () => localAgentClient.listMemories(query).then((r) => r.memories),
    enabled: online && !scopedTargetMissing,
    retry: false,
  })
  const memories = memoriesQuery.data ?? []

  async function saveMemory() {
    const text = content.trim()
    if (!text || scopedTargetMissing) return
    setSaving(true)
    try {
      await localAgentClient.createMemory({
        scope,
        kind,
        content: text,
        ...(scope === 'project' && project ? { projectId: project.ID } : {}),
        ...(scope === 'thread' && threadId ? { threadId } : {}),
      })
      setContent('')
      qc.invalidateQueries({ queryKey: ['local-agent-memories'] })
    } finally {
      setSaving(false)
    }
  }

  async function deleteMemory(id: string) {
    await localAgentClient.deleteMemory(id)
    qc.invalidateQueries({ queryKey: ['local-agent-memories'] })
  }

  return (
    <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
          <Database size={11} />
          {t('agents.chat.panel.memory.title')}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => memoriesQuery.refetch()}
          disabled={!online || scopedTargetMissing || memoriesQuery.isFetching}
          className="h-5 px-1 text-[10px] text-muted-foreground"
        >
          <RefreshCw size={10} className={memoriesQuery.isFetching ? 'animate-spin' : ''} />
          {t('agents.chat.panel.memory.refresh')}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Select value={scope} onValueChange={(next) => setScope(next as AgentMemoryScope)}>
          <SelectTrigger size="sm" className="h-7 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMORY_SCOPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(next) => setKind(next as AgentMemoryKind)}>
          <SelectTrigger size="sm" className="h-7 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMORY_KINDS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {scopedTargetMissing ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {scope === 'project' ? t('agents.chat.panel.memory.missingProject') : t('agents.chat.panel.memory.missingThread')}
        </p>
      ) : (
        <>
          <div className="flex gap-1.5">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!online || saving}
              placeholder={t('agents.chat.panel.memory.add')}
              rows={2}
              className="min-h-12 flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              type="button"
              size="icon-sm"
              onClick={saveMemory}
              disabled={!online || saving || !content.trim()}
              className="h-12 w-8 shrink-0"
              title={t('agents.chat.panel.memory.save')}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            </Button>
          </div>
          <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
            {memories.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">{t('agents.chat.panel.memory.noMemory')}</p>
            ) : memories.map((memory) => (
              <div key={memory.id} className="rounded-md border border-border bg-background p-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">{memory.kind}</Badge>
                      <span className="text-[9px] text-muted-foreground">{formatAgentDate(memory.updatedAt, locale)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-foreground">{memory.content}</p>
                  </div>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => deleteMemory(memory.id)}
                      className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                    title={t('agents.chat.panel.memory.delete')}
                  >
                    <Trash2 size={10} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ConversationContextPanel({
  online,
  inspect,
  capabilities,
  loading,
  config,
  onRefresh,
}: {
  online: boolean
  inspect?: AgentInspectResponse
  capabilities?: AgentCapabilitiesResponse
  loading: boolean
  config: ConversationAgentContextConfig
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const skills = inspect?.skills ?? []
  const tools = useMemo<ConversationContextTool[]>(() => capabilities?.resolvedTools.available ?? inspect?.registeredTools ?? [], [capabilities?.resolvedTools.available, inspect?.registeredTools])
  const activeManifest = (config.enabled ? config.manifest : inspect?.defaultAgentManifest) ?? null
  const activeSkillIds = config.enabled
    ? new Set((activeManifest?.skills ?? []).filter((skill) => skill.enabled !== false).map((skill) => skill.id))
    : null
  const activeToolNames = new Set((activeManifest?.tools ?? []).filter((grant) => grant.mode !== 'deny').map((grant) => grant.name))
  const activeSkills = activeSkillIds
    ? skills.filter((skill) => activeSkillIds.has(skill.id))
    : skills.filter((skill) => skill.enabled !== false)
  const activeTools = tools.filter((tool) => activeToolNames.has(tool.name))

  return (
    <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
            <SlidersHorizontal size={11} />
            {t('agents.chat.panel.capabilities.title')}
            <Badge variant={config.enabled ? 'secondary' : 'outline'} className="text-[9px] leading-4 px-1.5 py-0">
              {config.enabled ? t('agents.chat.panel.capabilities.custom') : t('agents.chat.panel.capabilities.runtimeDefault')}
            </Badge>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            {t('agents.chat.panel.capabilities.activeHint')}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onRefresh}
          disabled={loading}
          className="h-5 px-1 text-[10px] text-muted-foreground"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          {t('agents.chat.panel.capabilities.refresh')}
        </Button>
      </div>

      {!online ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">{t('agents.chat.panel.capabilities.startHint')}</p>
      ) : !inspect ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">{loading ? t('agents.chat.panel.capabilities.loadingCatalog') : t('agents.chat.panel.capabilities.notLoaded')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <DebugSummaryItem label={t('agents.chat.panel.capabilities.skills')} value={String(activeSkills.length)} />
            <DebugSummaryItem label={t('agents.chat.panel.capabilities.tools')} value={String(activeTools.length)} />
          </div>

          {activeManifest && (
            <div className="rounded-md border border-border bg-muted/20 p-2 text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-foreground">{activeManifest.name}</span>
                <Badge variant={config.enabled ? 'secondary' : 'outline'} className="text-[9px] leading-4 px-1.5 py-0">
                  {config.enabled ? t('agents.chat.panel.capabilities.custom') : t('agents.chat.panel.capabilities.runtimeDefault')}
                </Badge>
              </div>
              <div className="mt-1 text-muted-foreground">
                {t('agents.chat.panel.capabilities.activeManifest', { skills: activeSkills.length, tools: activeTools.length })}
              </div>
            </div>
          )}

          <details className="rounded-md border border-border bg-background/70" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
              <span className="inline-flex items-center gap-1.5"><ClipboardCheck size={10} /> Skills</span>
              <span className="text-[9px] text-muted-foreground">{activeSkills.length}</span>
            </summary>
            <div className="max-h-44 space-y-1 overflow-y-auto border-t border-border p-1.5">
              {activeSkills.length === 0 ? (
                <p className="px-1 text-[10px] text-muted-foreground">{t('agents.chat.panel.capabilities.noSkillsLoaded')}</p>
              ) : activeSkills.map((skill) => (
                <div key={skill.id} className="rounded border border-border/70 bg-background px-2 py-1.5 text-[10px]">
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate font-medium text-foreground">{skill.name}</span>
                        {!skill.enabled && <Badge variant="secondary" className="text-[8px] leading-3 px-1 py-0">{t('agents.chat.panel.capabilities.disabled')}</Badge>}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">{skill.description || skill.id}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>

          <details className="rounded-md border border-border bg-background/70" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
              <span className="inline-flex items-center gap-1.5"><Wrench size={10} /> Tools</span>
              <span className="text-[9px] text-muted-foreground">{activeTools.length}</span>
            </summary>
            <div className="max-h-56 space-y-1 overflow-y-auto border-t border-border p-1.5">
              {activeTools.length === 0 ? (
                <p className="px-1 text-[10px] text-muted-foreground">{t('agents.chat.panel.capabilities.noToolsLoaded')}</p>
              ) : activeTools.map((tool) => (
                <div key={tool.name} className="rounded border border-border/70 bg-background px-2 py-1.5 text-[10px]">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-medium text-foreground">{tool.name}</span>
                    {tool.risk && <Badge variant="outline" className="text-[8px] leading-3 px-1 py-0">{approvalRiskLabel(tool.risk)}</Badge>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">{tool.description}</p>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  )
}

function PromptLayerPanel({ draft }: { draft: AgentSendDraft | null }) {
  const { t } = useTranslation()
  const preview = draft?.localRuntime?.preview
  if (!draft) {
    return (
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {t('agents.chat.panel.prompt.hint')}
      </p>
    )
  }

  const uiSnapshot = draft.localRuntime?.clientInput?.uiSnapshot

  return (
    <div className="space-y-2">
      <div className="grid gap-2 text-[11px] md:grid-cols-4">
        <DebugSummaryItem label={t('agents.chat.panel.debugPreview.model')} value={String(draft.model.name ?? draft.model.id ?? t('common.emptyTitle'))} />
        <DebugSummaryItem label={t('agents.chat.panel.debugPreview.agent')} value={draft.agent.name ?? t('agents.chat.panel.debugPreview.default')} />
        <DebugSummaryItem label={t('agents.chat.panel.debugPreview.approvalMode')} value={agentPermissionModeLabel(draft.settings.permissionMode)} />
        <DebugSummaryItem label={t('agents.chat.panel.debugPreview.requests')} value={String(draft.httpRequests.length)} />
      </div>

      {uiSnapshot && (
        <details className="rounded-md border border-border bg-background/60">
          <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
            {t('agents.chat.panel.context.snapshot')}
          </summary>
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words border-t border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground">
            {safeJSONStringify(uiSnapshot)}
          </pre>
        </details>
      )}
      {!preview?.promptPreview && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {t('agents.chat.panel.prompt.noCompiledPreview')}
        </p>
      )}

      <div className="grid gap-2 md:grid-cols-2">
        <details className="rounded-md border border-border bg-background/60" open>
          <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
            {t('agents.chat.panel.prompt.outboundMessages')}
          </summary>
          <div className="space-y-1.5 border-t border-border/60 px-2 py-1.5">
            {draft.outbound.messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="rounded border border-border/70 bg-muted/20">
                <div className="flex items-center justify-between border-b border-border/60 px-2 py-1">
                  <Badge variant="outline" className="text-[9px]">{message.role}</Badge>
                  <span className="text-[9px] text-muted-foreground">{countCharsLabel(t, message.content.length)}</span>
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[10px] leading-relaxed text-foreground">
                  {message.content || emptyLabel(t)}
                </pre>
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-md border border-border bg-background/60">
          <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
            {t('agents.chat.panel.prompt.promptLayers')}
          </summary>
          <div className="space-y-1.5 border-t border-border/60 px-2 py-1.5 text-[10px]">
            <div>
              <div className="mb-1 font-medium text-foreground">{t('agents.chat.panel.prompt.systemPrompt')}</div>
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 text-muted-foreground">
                {draft.outbound.systemPrompt || emptyLabel(t)}
              </pre>
            </div>
            <div>
              <div className="mb-1 font-medium text-foreground">{t('agents.chat.panel.prompt.agentContext')}</div>
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 text-muted-foreground">
                {draft.outbound.agentContext || emptyLabel(t)}
              </pre>
            </div>
            <div>
              <div className="mb-1 font-medium text-foreground">{t('agents.chat.panel.prompt.enrichedUserContent')}</div>
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 text-muted-foreground">
                {draft.outbound.enrichedUserContent || emptyLabel(t)}
              </pre>
            </div>
          </div>
        </details>
      </div>

      {draft.localRuntime?.preview?.promptPreview && (
        <details className="rounded-md border border-border bg-background/60" open>
          <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
            {t('agents.chat.panel.prompt.compiledPrompt')}
          </summary>
          <div className="space-y-2 border-t border-border/60 px-2 py-1.5">
            {draft.localRuntime.preview.promptPreview.debugParts.map((part) => (
              <div key={part.id} className="rounded-md border border-border bg-muted/20">
                <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1">
                  <Badge variant="outline" className="text-[9px]">{part.kind}</Badge>
                  <span className="text-[10px] font-medium text-foreground">{part.title}</span>
                </div>
                <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[10px] text-muted-foreground">
                  {part.content || emptyLabel(t)}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}

      {preview && (
        <>
          <div className="grid gap-2 text-[11px] md:grid-cols-3">
            <DebugSummaryItem label={t('agents.chat.panel.prompt.toolCalls')} value={String(preview.toolCalls.length)} />
            <DebugSummaryItem label={t('agents.chat.panel.prompt.approvals')} value={String(preview.pendingApprovals.filter((approval) => approval.status === 'pending').length)} />
            <DebugSummaryItem label={t('agents.chat.panel.prompt.warnings')} value={String(preview.warnings.length)} />
          </div>

          <details className="rounded-md border border-border bg-background/60">
          <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
              {t('agents.chat.panel.prompt.toolCalls')}
          </summary>
            <div className="space-y-1.5 border-t border-border/60 px-2 py-1.5">
              {preview.toolCalls.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">{t('agents.chat.panel.prompt.noImmediateToolCalls')}</p>
              ) : preview.toolCalls.map((call, index) => (
                <div key={`${call.name}-${index}`} className="rounded border border-border/70 bg-background px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-medium text-foreground">{index + 1}. {call.name}</span>
                    <Badge variant="outline" className="text-[9px]">{t('agents.chat.panel.runtime.tool')}</Badge>
                  </div>
                  {call.args && (
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-1.5 text-[10px]">
                      {safeJSONStringify(call.args)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </details>

          <details className="rounded-md border border-border bg-background/60">
          <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
              {t('agents.chat.panel.prompt.approvals')}
          </summary>
            <div className="space-y-1.5 border-t border-border/60 px-2 py-1.5">
              {preview.pendingApprovals.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">{t('agents.chat.panel.prompt.noApprovalRequired')}</p>
              ) : preview.pendingApprovals.map((approval) => (
                <div key={approval.id} className="rounded border border-amber-500/20 bg-amber-500/10 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-medium text-foreground">{approval.toolName}</span>
                    <Badge variant="warning" className="text-[9px]">{approval.risk ? approvalRiskLabel(approval.risk) : approvalStatusLabel(approval.status)}</Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{approval.reason}</p>
                  <div className="mt-1 rounded border border-amber-500/20 bg-background/60 px-1.5 py-1 text-[9px] leading-relaxed text-amber-900 dark:text-amber-200">
                    <span className="font-medium">{t('agents.chat.workflow.approvalImpact.label')}: </span>
                    {localAgentApprovalImpactText(approval)}
                  </div>
                  {approval.args && (
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-1.5 text-[9px] text-muted-foreground">
                      {safeJSONStringify(approval.args)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      <div className="space-y-1.5">
        <div className="text-[10px] font-medium text-foreground">{t('agents.chat.panel.prompt.finalHttpRequests')}</div>
        <div className="space-y-2">
          {draft.httpRequests.map((request, index) => (
            <DebugHttpRequestCard key={request.id} request={request} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}

const DRAFT_KINDS: AgentDraftKind[] = ['setting_proposal', 'script_split_proposal', 'script', 'asset_slot', 'content_unit', 'prompt', 'note', 'pipeline', 'segment', 'scene_moment', 'asset_proposal', 'project_proposal', 'production_proposal', 'content_unit_proposal']
const DRAFT_STATUSES: AgentDraftStatus[] = ['draft', 'accepted', 'rejected', 'applied', 'superseded']
const DRAFT_REFRESH_INTERVAL_MS = 1500

function inferScopedDraftKind(pageContext?: PageContextSummary): AgentDraftKind | undefined {
  if (!pageContext) return undefined
  if (pageContext.pageType === 'production_orchestrate') return 'production_proposal'
  if (pageContext.pageType === 'setting_proposal' || pageContext.labels.some((label) => /creative-references|setting[_-]proposal/i.test(label))) {
    return 'setting_proposal'
  }
  if (pageContext.pageType === 'asset_proposal' || pageContext.labels.some((label) => /asset-proposal|asset_proposal|asset-slots/i.test(label))) {
    return 'asset_proposal'
  }
  if (pageContext.pageType === 'project_proposal' || pageContext.labels.some((label) => /project-(workspace|orchestration|proposal)/i.test(label))) {
    return 'project_proposal'
  }
  return undefined
}

function DraftPanel({
  project,
  online,
  threadId,
  pageContext,
}: {
  project: Project | null
  online: boolean
  threadId?: string
  pageContext?: PageContextSummary
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [status, setStatus] = useState<AgentDraftStatus | 'all'>('draft')
  const [kind, setKind] = useState<AgentDraftKind | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const scopedDraftId = pageContext?.draftId
  const scopedPageKey = pageContext?.pageKey
  const scopedDraftKind = inferScopedDraftKind(pageContext)
  const isPageDraftScope = !!scopedDraftId || (!!scopedDraftKind && !!scopedPageKey)
  const query = {
    ...(project ? { projectId: project.ID } : {}),
    ...(isPageDraftScope ? {} : threadId ? { threadId } : {}),
    ...(scopedDraftKind
      ? { kind: scopedDraftKind }
      : kind !== 'all' ? { kind } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(isPageDraftScope && !scopedDraftId && scopedPageKey ? { pageKey: scopedPageKey } : {}),
    limit: 20,
  }
  const draftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['local-agent-drafts', localAgentClient.baseURL, query, scopedDraftId ?? null],
    queryFn: async () => {
      if (scopedDraftId) {
        const draft = await localAgentClient.getDraft(scopedDraftId)
        if (scopedDraftKind && draft.kind !== scopedDraftKind) return []
        if (status !== 'all' && draft.status !== status) return []
        return [draft]
      }
      return localAgentClient.listDrafts(query).then((r) => r.drafts)
    },
    enabled: online && (isPageDraftScope || !!threadId),
    refetchInterval: online && (isPageDraftScope || threadId) ? DRAFT_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    retry: false,
  })
  const drafts = draftsQuery.data ?? []
  const selectedDraft = drafts.find((draft) => draft.id === selectedId) ?? drafts[0] ?? null
  const openDraftPath = useMemo(() => (selectedDraft ? buildDraftReviewPath(selectedDraft) : null), [selectedDraft])

  useEffect(() => {
    if (!selectedDraft) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !drafts.some((draft) => draft.id === selectedId)) {
      setSelectedId(selectedDraft.id)
    }
  }, [drafts, selectedDraft, selectedId])

  async function refreshDrafts() {
    await draftsQuery.refetch()
  }

  return (
    <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
          <ClipboardCheck size={11} />
          {t('agents.chat.panel.drafts.currentThreadTitle')}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => navigate(ROUTES.agentDrafts)}
            className="h-5 px-1 text-[10px] text-muted-foreground"
          >
            <History size={10} />
            {t('agents.chat.panel.drafts.history')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={refreshDrafts}
            disabled={!online || !threadId || draftsQuery.isFetching}
            className="h-5 px-1 text-[10px] text-muted-foreground"
          >
            <RefreshCw size={10} className={draftsQuery.isFetching ? 'animate-spin' : ''} />
            {t('agents.chat.panel.drafts.refresh')}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Select value={status} onValueChange={(next) => setStatus(next as AgentDraftStatus | 'all')}>
          <SelectTrigger size="sm" className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('agents.chat.drafts.filters.allStatuses')}</SelectItem>
            {DRAFT_STATUSES.map((item) => <SelectItem key={item} value={item}>{t(`agents.chat.drafts.status.${item}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(next) => setKind(next as AgentDraftKind | 'all')}>
          <SelectTrigger size="sm" className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('agents.chat.drafts.filters.allKinds')}</SelectItem>
            {DRAFT_KINDS.map((item) => <SelectItem key={item} value={item}>{t(`agents.chat.drafts.kinds.${item}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {!online ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">{t('agents.chat.panel.drafts.noOnline')}</p>
      ) : !threadId ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">{t('agents.chat.panel.drafts.noThread')}</p>
      ) : drafts.length === 0 ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">{t('agents.chat.panel.drafts.emptyFilter')}</p>
      ) : (
        <div className="grid gap-2 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
            {drafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => setSelectedId(draft.id)}
                className={cn(
                  'w-full rounded-md border px-2 py-1.5 text-left text-[10px] transition-colors',
                  selectedDraft?.id === draft.id ? 'border-ring bg-muted/50' : 'border-border bg-background hover:bg-muted/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 font-medium text-foreground">{draft.title}</span>
                  <Badge variant={draftStatusVariant(draft.status)} className="shrink-0 text-[9px] leading-4 px-1.5 py-0">{t(`agents.chat.drafts.status.${draft.status}`)}</Badge>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span>{t(`agents.chat.drafts.kinds.${draft.kind}`)}</span>
                  <span>·</span>
                  <span>{formatAgentDate(draft.updatedAt, locale)}</span>
                </div>
              </button>
            ))}
          </div>
          {selectedDraft && (
            <div className="min-w-0 space-y-2">
              <div className="rounded-md border border-border bg-background p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-foreground">{selectedDraft.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">{t(`agents.chat.drafts.kinds.${selectedDraft.kind}`)}</Badge>
                      <Badge variant={draftStatusVariant(selectedDraft.status)} className="text-[9px] leading-4 px-1.5 py-0">{t(`agents.chat.drafts.status.${selectedDraft.status}`)}</Badge>
                      {selectedDraft.projectId && <Badge variant="outline" className="text-[9px] leading-4 px-1.5 py-0">{t('agents.chat.panel.drafts.projectBadge', { id: selectedDraft.projectId })}</Badge>}
                    </div>
                  </div>
                </div>
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-[10px] leading-relaxed">
                  {selectedDraft.content || t('agents.chat.panel.drafts.emptyDraft')}
                </pre>
              </div>
              <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {openDraftPath
                  ? t('agents.chat.panel.drafts.pageOnlyHint')
                  : t('agents.chat.panel.drafts.noPage')}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    if (openDraftPath) navigate(openDraftPath)
                  }}
                  disabled={!openDraftPath}
                  className="gap-1.5"
                >
                  <Route size={10} />
                  {t('agents.chat.panel.drafts.openPage')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProjectRequirementPanel({
  project,
  projects,
  loading,
  creating,
  onSelect,
  onCreate,
}: {
  project: Project | null
  projects: Project[]
  loading: boolean
  creating: boolean
  onSelect: (project: Project) => void
  onCreate: (payload: { name: string; description?: string }) => void
}) {
  const { t } = useTranslation()
  const [showCreate, setShowCreate] = useState(projects.length === 0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const selectedValue = project ? String(project.ID) : '__none'

  function submitCreate() {
    const trimmedName = name.trim()
    if (!trimmedName || creating) return
    onCreate({
      name: trimmedName,
      ...(description.trim() ? { description: description.trim() } : {}),
    })
    setName('')
    setDescription('')
    setShowCreate(false)
  }

  return (
    <div className={cn(
      'rounded-md border p-2 space-y-2',
      project ? 'border-border bg-background/60' : 'border-amber-500/35 bg-amber-500/10',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <FolderOpen size={12} className={cn('mt-0.5 shrink-0', project ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300')} />
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-foreground">
              {project ? t('agents.chat.currentProject', { name: project.name }) : t('agents.chat.projectRequiredTitle')}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
              {project ? (project.description || t('agents.chat.projectRequiredHint')) : t('agents.chat.projectRequiredHint')}
            </p>
          </div>
        </div>
        {project?.status && (
          <Badge variant="secondary" className="shrink-0 text-[9px] leading-4 px-1.5 py-0">
            {project.status}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Select
          value={selectedValue}
          onValueChange={(value) => {
            const next = projects.find((item) => String(item.ID) === value)
            if (next) onSelect(next)
          }}
          disabled={loading || projects.length === 0}
        >
          <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 text-[10px]">
            <SelectValue placeholder={loading ? t('common.loadingShort') : t('agents.chat.selectProject')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none" disabled>{loading ? t('common.loadingShort') : t('agents.chat.selectProject')}</SelectItem>
            {projects.map((item) => (
              <SelectItem key={item.ID} value={String(item.ID)}>{item.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="xs"
          variant={showCreate ? 'secondary' : 'outline'}
          onClick={() => setShowCreate((next) => !next)}
          className="h-7 shrink-0 px-2 text-[10px]"
        >
          <Plus size={10} />
          {t('agents.chat.createProjectInline')}
        </Button>
      </div>

      {showCreate && (
        <div className="space-y-1.5 rounded-md border border-border/80 bg-background/70 p-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitCreate()
              }
            }}
            disabled={creating}
            placeholder={t('agents.chat.projectNamePlaceholder')}
            className="h-7 w-full rounded-md border border-input bg-background px-2 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={creating}
            rows={2}
            placeholder={t('agents.chat.projectDescriptionPlaceholder')}
            className="min-h-12 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="xs"
              onClick={submitCreate}
              disabled={creating || !name.trim()}
              className="h-7 px-2 text-[10px]"
            >
              {creating ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
              {t('agents.chat.createAndUseProject')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Chat view ─────────────────────────────────────────────────────────────────

function ChatView({
  conv,
  conversations,
  userId,
  onBack,
  onCollapse,
  onSelectConversation,
  onNewConversation,
  onCloseConversation,
  onCloseConversations,
  externalTask,
  pageToolRequestId,
  onExternalDraftConsumed,
}: {
  conv: Conversation
  conversations: Conversation[]
  userId: string
  onBack: () => void
  onCollapse: () => void
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onCloseConversation: (id: string) => void
  onCloseConversations: (ids: string[]) => void
  externalTask?: AgentPageTaskState | null
  pageToolRequestId?: string
  onExternalDraftConsumed?: () => void
}) {
  const { t } = useTranslation()
  const {
    settings,
    addMessage,
    upsertMessage,
    removeMessage,
    updateConversationTitle,
    updateSettings,
  } = useAgentStore()
  const qc = useQueryClient()
  const currentProject = useProjectStore((s) => s.current)
  const conversationRuntime = useAgentSessionStore((s) => s.conversationRuntimes[conv.id] ?? null)
  const localThreadId = useAgentSessionStore((s) => s.localThreadIdsByConversation[conv.id] ?? '')
  const setConversationRuntime = useAgentSessionStore((s) => s.setConversationRuntime)
  const setConversationRun = useAgentSessionStore((s) => s.setConversationRun)
  const setLocalThreadId = useAgentSessionStore((s) => s.setLocalThreadId)
  const attachPageTaskConversation = useAgentSessionStore((s) => s.attachPageTaskConversation)
  const setPageTaskRunning = useAgentSessionStore((s) => s.setPageTaskRunning)
  const { data: textModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'text'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
  })
  const { data: resourcesData } = useQuery<RawResource[] | { items: RawResource[] }>({
    queryKey: ['resources', 'agent-panel'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 24, type: 'image,video,audio,text' } }).then((r) => r.data),
  })
  const draft = useAgentStore((s) => s.convsByUser[userId]?.draftsByConversation?.[conv.id] ?? EMPTY_CONVERSATION_DRAFT)
  const updateConversationDraft = useAgentStore((s) => s.updateConversationDraft)
  const clearConversationDraft = useAgentStore((s) => s.clearConversationDraft)
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number; query: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [showContext, setShowContextState] = useState(false)
  const [contextPaneHeight, setContextPaneHeight] = useState(CONTEXT_PANE_DEFAULT_HEIGHT)
  const [startingLocalAgent, setStartingLocalAgent] = useState(false)
  const [localAgentStartError, setLocalAgentStartError] = useState<string | null>(null)
  const localRuntimeEnabled = true
  const [debugBeforeSend, setDebugBeforeSendState] = useState(false)
  const [buildingSendDraft, setBuildingSendDraft] = useState(false)
  const [planActionBusy, setPlanActionBusy] = useState(false)
  const [pendingSendDraft, setPendingSendDraft] = useState<AgentSendDraft | null>(null)
  const [streamingAssistantMessageId, setStreamingAssistantMessageId] = useState<string | null>(null)
  const [streamingAssistantText, setStreamingAssistantText] = useState('')
  const [liveTraceEvents, setLiveTraceEvents] = useState<ChatRunActivityEvent[]>([])
  const [pendingAssistantState, setPendingAssistantState] = useState<ThinkingBubbleState | null>(null)
  const [pendingHttpEvents, setPendingHttpEvents] = useState<ChatRunActivityEvent[]>([])
  const liveTraceEventsRef = useRef<ChatRunActivityEvent[]>([])
  const cancelRequestedRunIdsRef = useRef<Set<string>>(new Set())
  const activeSendAbortControllerRef = useRef<AbortController | null>(null)
  const streamingAssistantMessageIdRef = useRef<string | null>(null)
  const streamingAssistantTextRef = useRef('')
  const streamingAssistantTurnsRef = useRef<Map<number, string>>(new Map())
  const streamingFlushTimerRef = useRef<number | null>(null)
  const processedExternalTaskRequestIdRef = useRef<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const planDispatchSettings = useMemo<PlanDispatchSettings>(() => ({
    maxWorkers: settings.planMaxWorkers,
    maxTaskAttempts: settings.planMaxTaskAttempts,
    workerTimeoutMs: settings.planWorkerTimeoutMs,
  }), [settings.planMaxWorkers, settings.planMaxTaskAttempts, settings.planWorkerTimeoutMs])
  const conversationTabs = useMemo(() => {
    const ordered = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
    if (ordered.some((item) => item.id === conv.id)) return ordered
    return [conv, ...ordered]
  }, [conversations, conv])
  const closeAllConversationTabs = useCallback(() => {
    onCloseConversations(conversationTabs.map((item) => item.id))
  }, [conversationTabs, onCloseConversations])
  const closeOtherConversationTabs = useCallback((id: string) => {
    onCloseConversations(conversationTabs.filter((item) => item.id !== id).map((item) => item.id))
  }, [conversationTabs, onCloseConversations])
  const closeRightConversationTabs = useCallback((id: string) => {
    const index = conversationTabs.findIndex((item) => item.id === id)
    if (index < 0) return
    onCloseConversations(conversationTabs.slice(index + 1).map((item) => item.id))
  }, [conversationTabs, onCloseConversations])
  const currentConversationTitle = conversationDisplayTitle(conv, t)
  const updatePlanDispatchSettings = useCallback((next: PlanDispatchSettings) => {
    updateSettings({
      planMaxWorkers: next.maxWorkers,
      planMaxTaskAttempts: next.maxTaskAttempts,
      planWorkerTimeoutMs: next.workerTimeoutMs,
    })
  }, [updateSettings])
  const fileRef = useRef<HTMLInputElement>(null)
  const contextPaneResizeRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const {
    data: localAgentHealth,
    error: localAgentHealthError,
    isFetching: checkingLocalAgent,
    refetch: refetchLocalAgentHealth,
  } = useQuery<AgentHealth>({
    queryKey: ['local-agent-health', localAgentClient.baseURL],
    queryFn: () => localAgentClient.ensureRunning(),
    enabled: localRuntimeEnabled,
    retry: false,
    refetchInterval: localRuntimeEnabled ? 5000 : false,
  })

  const input = draft.input
  const attachments = draft.attachments
  const modelId = settings.modelId ?? textModels[0]?.id ?? null
  const systemPrompt = ''
  const recentResources = Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? [])
  const resourceAttachmentIndex = useMemo(() => {
    const map = new Map<number, AgentAttachment>()
    for (const resource of recentResources) {
      map.set(resource.ID, attachmentFromResource(resource))
    }
    for (const attachment of attachments) {
      if (attachment.resourceId !== undefined) map.set(attachment.resourceId, attachment)
    }
    return map
  }, [recentResources, attachments])

  useEffect(() => { inputRef.current?.focus() }, [conv.id])
  useEffect(() => {
    const editor = inputRef.current
    if (!editor) return
    if (serializeMentionEditor(editor) === input) return
    const selection = window.getSelection()
    const shouldRestoreEnd = document.activeElement === editor && !!selection && editor.contains(selection.anchorNode)
    renderMentionEditorValue(editor, input, resourceAttachmentIndex)
    hydrateMentionEditorMedia(editor)
    if (shouldRestoreEnd) setCaretAtEnd(editor)
  }, [input, resourceAttachmentIndex])
  useEffect(() => () => {
    const editor = inputRef.current
    if (!editor) return
    for (const media of Array.from(editor.querySelectorAll<HTMLElement>('.ai-agent-mention-chip__media'))) {
      const objectUrl = media.dataset.objectUrl
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])
  useEffect(() => {
    shouldAutoScrollRef.current = true
    liveTraceEventsRef.current = []
    setLiveTraceEvents([])
    setPendingHttpEvents([])
  }, [conv.id])
  useEffect(() => () => {
    if (streamingFlushTimerRef.current !== null) window.clearTimeout(streamingFlushTimerRef.current)
  }, [])
  // Auto-clear stale modelId
  useEffect(() => {
    if (textModels.length > 0 && settings.modelId !== null) {
      const exists = textModels.some((m) => m.id === settings.modelId)
      if (!exists) updateSettings({ modelId: null })
    }
  }, [textModels]) // eslint-disable-line react-hooks/exhaustive-deps
  const mentionCandidates = useMemo(() => {
    return dedupeAttachments([
      ...attachments,
      ...recentResources.map(attachmentFromResource),
    ]).filter((attachment) =>
      attachment.resourceId !== undefined
      && (attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'audio')
    )
  }, [attachments, recentResources])
  const mentionResults = useMemo(() => {
    if (!mentionRange) return []
    const query = mentionRange.query.trim().toLowerCase()
    return mentionCandidates
      .filter((attachment) => !query || attachment.name.toLowerCase().includes(query))
      .slice(0, 8)
  }, [mentionCandidates, mentionRange])
  const composerAttachmentEntries = useMemo(() => {
    const map = new Map<string, { attachment: AgentAttachment; explicit: boolean; mentioned: boolean }>()
    for (const attachment of attachments) {
      map.set(attachmentKey(attachment), { attachment, explicit: true, mentioned: false })
    }
    for (const attachment of resourceMentionAttachments(input, resourceAttachmentIndex)) {
      const key = attachmentKey(attachment)
      const existing = map.get(key)
      map.set(key, existing
        ? { ...existing, mentioned: true, attachment: existing.attachment.resourceId !== undefined ? existing.attachment : attachment }
        : { attachment, explicit: false, mentioned: true })
    }
    return Array.from(map.values())
  }, [attachments, input, resourceAttachmentIndex])
  const composerAttachments = useMemo(() => composerAttachmentEntries.map((entry) => entry.attachment), [composerAttachmentEntries])
  const activeModel = textModels.find((m) => m.id === modelId)
  const activeLocalRun = conversationRuntime?.run ?? null
  const contextThreadId = pendingSendDraft?.localRuntime?.preview?.threadId ?? activeLocalRun?.threadId
  const loading = conversationRuntime?.loading ?? false
  const visibleActivityEvents = useMemo(() => {
    if (!pendingHttpEvents.length) return liveTraceEvents
    const existing = new Set(liveTraceEvents.map(liveTraceEventKey))
    return [
      ...pendingHttpEvents.filter((event) => !existing.has(liveTraceEventKey(event))),
      ...liveTraceEvents,
    ]
  }, [liveTraceEvents, pendingHttpEvents])
  const hasStreamingAssistantContent = !!streamingAssistantMessageId || !!streamingAssistantText.trim()
  const thinkingState = pendingAssistantState ?? getThinkingBubbleState(activeLocalRun, visibleActivityEvents)
  const generationTraceEvents = visibleActivityEvents.length > 0 ? visibleActivityEvents : (activeLocalRun?.traceEvents ?? [])
  const generationProgressState = generationProgressFromEvents(generationTraceEvents)
  const showGenerationProgressBubble = !!generationProgressState
    && (loading || buildingSendDraft || activeLocalRun?.status === 'in_progress' || activeLocalRun?.status === 'queued')
    && !hasStreamingAssistantContent
    && !pendingSendDraft
  const showThinkingBubble = (loading || buildingSendDraft || !!pendingAssistantState)
    && !hasStreamingAssistantContent
    && !pendingSendDraft
    && !showGenerationProgressBubble
  const showLiveRunActivityBubble = !pendingSendDraft
    && !hasStreamingAssistantContent
    && (loading || buildingSendDraft || visibleActivityEvents.length > 0)
    && !showGenerationProgressBubble
    && (visibleActivityEvents.length > 0 || !!activeLocalRun)
  const approvingLocalRun = conversationRuntime?.approving ?? false
  const stoppingLocalRun = conversationRuntime?.stopping ?? false
  const stopRequestedBeforeRun = conversationRuntime?.stopRequested ?? false
  const agentContextConfig = EMPTY_AGENT_CONTEXT_CONFIG
  const activeConversationManifest = agentContextConfig.enabled ? agentContextConfig.manifest ?? undefined : undefined
  const agentRuntimeContext = pendingSendDraft?.localRuntime?.preview?.context
    ?? agentContextFromRun(activeLocalRun)
  const agentPageContext = pageContextFromAgentContext(agentRuntimeContext)
    ?? EMPTY_PAGE_CONTEXT_SUMMARY
  useEffect(() => {
    const thread = threadRef.current
    if (!thread || !shouldAutoScrollRef.current) return
    thread.scrollTo({ top: thread.scrollHeight, behavior: 'auto' })
  }, [conv.id, conv.messages.length, loading, buildingSendDraft, hasStreamingAssistantContent, streamingAssistantText, pendingAssistantState, generationProgressState, visibleActivityEvents.length])
  const contextLabels = [
    t('agents.chat.localRuntime'),
    activeConversationManifest ? t('agents.chat.panel.capabilities.custom') : null,
    settings.includeProjectContext && currentProject ? currentProject.name : null,
    settings.includeRecentResources && recentResources.length > 0 ? t('agents.chat.recentResourcesCount', { count: Math.min(recentResources.length, 8) }) : null,
    composerAttachments.length > 0 ? t('agents.chat.attachmentsCount', { count: composerAttachments.length }) : null,
  ].filter(Boolean) as string[]
  const localAgentOnline = !!localAgentHealth?.ok && !localAgentHealthError
  const contextSubtitle = agentRuntimeContext?.labels.length
    ? agentRuntimeContext.labels.join(' / ')
    : localAgentOnline
      ? t('agents.chat.panel.status.localRuntimeOnline')
      : t('agents.chat.panel.status.localRuntimeOffline')
  const canSend = (!!input.trim() || composerAttachments.length > 0) && !loading && !uploading && !buildingSendDraft
  const canAutoStartLocalAgent = canStartLocalAgentFromClient()
  const localAgentErrorMessage = localAgentStartError
    ?? (!localAgentOnline && localAgentHealthError instanceof Error ? localAgentHealthError.message : null)
  const assertMCPReady = useCallback(async () => {
    const getMCPStatus = typeof window === 'undefined' ? undefined : window.api?.getMCPStatus
    if (!getMCPStatus) return
    const status = await getMCPStatus()
    if (status.ok) return
    toastMCPStatus(status)
    throw new Error(status.error || `MCP server is not available at ${status.endpoint}`)
  }, [])
  const hasActiveLocalWork = !isTerminalAgentRun(activeLocalRun) && (loading || buildingSendDraft)
  const canStopLocalRun = isStoppableAgentRun(activeLocalRun) || hasActiveLocalWork || stopRequestedBeforeRun
  const { data: localAgentInspect, isFetching: fetchingLocalAgentInspect, refetch: refetchLocalAgentInspect } = useQuery<AgentInspectResponse>({
    queryKey: ['local-agent-panel-inspect', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.inspect()
    },
    enabled: localRuntimeEnabled && localAgentOnline,
    retry: false,
  })
  const { data: localAgentCapabilities, isFetching: fetchingLocalAgentCapabilities, refetch: refetchLocalAgentCapabilities } = useQuery<AgentCapabilitiesResponse>({
    queryKey: ['local-agent-panel-capabilities', localAgentClient.baseURL, currentProject?.ID ?? null, agentContextConfig.enabled ? agentContextConfig.manifest?.id ?? 'custom' : 'default'],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.getCapabilities({
        ...(currentProject ? { projectId: currentProject.ID } : {}),
      })
    },
    enabled: localRuntimeEnabled && localAgentOnline,
    retry: false,
  })
  const { data: activePlanSnapshot, refetch: refetchActivePlanSnapshot } = useQuery<AgentPlanSnapshot>({
    queryKey: ['local-agent-plan-snapshot', localAgentClient.baseURL, activeLocalRun?.planId ?? null, activeLocalRun?.updatedAt ?? null],
    queryFn: async () => {
      if (!activeLocalRun?.planId) throw new Error('active run is not attached to a plan')
      await localAgentClient.ensureRunning()
      return localAgentClient.getPlanSnapshot(activeLocalRun.planId)
    },
    enabled: localRuntimeEnabled && localAgentOnline && !!activeLocalRun?.planId,
    retry: false,
    refetchInterval: (query) => shouldPollPlanSnapshot(query.state.data, activeLocalRun) ? 1500 : false,
  })
  const actionableLocalRun = actionableRunForPlan(activePlanSnapshot, activeLocalRun)
  const showLocalWorkflow = !!actionableLocalRun
  function setDebugBeforeSend(next: boolean) {
    setDebugBeforeSendState(next)
  }

  function setShowContext(next: boolean | ((current: boolean) => boolean)) {
    setShowContextState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      return resolved
    })
  }

  const refreshAgentCatalogContext = useCallback(() => {
    void refetchLocalAgentInspect()
    void refetchLocalAgentCapabilities()
  }, [refetchLocalAgentCapabilities, refetchLocalAgentInspect])

  const startContextPaneResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!showContext || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const startHeight = contextPaneHeight
    contextPaneResizeRef.current = { startY, startHeight }
    document.body.classList.add('ai-agent-panel-resizing', 'ai-agent-panel-resizing--y')

    const onMove = (moveEvent: PointerEvent) => {
      const state = contextPaneResizeRef.current
      if (!state) return
      const delta = state.startY - moveEvent.clientY
      const nextHeight = clampNumber(state.startHeight + delta, CONTEXT_PANE_MIN_HEIGHT, CONTEXT_PANE_MAX_HEIGHT)
      setContextPaneHeight(nextHeight)
    }

    const onUp = () => {
      contextPaneResizeRef.current = null
      document.body.classList.remove('ai-agent-panel-resizing', 'ai-agent-panel-resizing--y')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [contextPaneHeight, showContext])

  function updateDraft(patch: Partial<typeof EMPTY_CONVERSATION_DRAFT>) {
    updateConversationDraft(userId, conv.id, patch)
  }

  function revokeAttachmentPreviewUrls(items: AgentAttachment[]) {
    for (const attachment of items) {
      if (attachment.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
    }
  }

  async function startLocalAgent() {
    if (startingLocalAgent) return
    setStartingLocalAgent(true)
    setLocalAgentStartError(null)
    try {
      await localAgentClient.ensureRunning()
      await refetchLocalAgentHealth()
    } catch (e) {
      setLocalAgentStartError(e instanceof Error ? e.message : String(e))
    } finally {
      setStartingLocalAgent(false)
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    const pending = list.map((file) => {
      const kind = attachmentKind(file.type, file.name)
      const previewUrl = (kind === 'image' || kind === 'video') ? URL.createObjectURL(file) : undefined
      return {
        id: `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: kind,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        previewUrl,
      } satisfies AgentAttachment
    })
    const currentAttachments = useAgentStore.getState().getConversationDraft(userId, conv.id).attachments
    updateDraft({ attachments: [...currentAttachments, ...pending] })
    setUploading(true)
    try {
      const uploaded: AgentAttachment[] = []
      for (const [index, file] of list.entries()) {
        const fd = new FormData()
        fd.append('file', file)
        const { data } = await api.post('/resources/upload', fd)
        uploaded.push({
          ...attachmentFromResource(data as RawResource),
          id: pending[index]?.id ?? `res-${(data as RawResource).ID}`,
          previewUrl: pending[index]?.previewUrl,
        })
      }
      const latestAttachments = useAgentStore.getState().getConversationDraft(userId, conv.id).attachments
      const uploadedByPendingId = new Map(uploaded.map((attachment) => [attachment.id, attachment]))
      updateDraft({
        attachments: latestAttachments.map((attachment) => uploadedByPendingId.get(attachment.id) ?? attachment),
      })
      setMentionRange(null)
      qc.invalidateQueries({ queryKey: ['resources'] })
      qc.invalidateQueries({ queryKey: ['resources', 'agent-panel'] })
    } catch (e) {
      const latestAttachments = useAgentStore.getState().getConversationDraft(userId, conv.id).attachments
      const pendingIds = new Set(pending.map((attachment) => attachment.id))
      updateDraft({ attachments: latestAttachments.filter((attachment) => !pendingIds.has(attachment.id)) })
      revokeAttachmentPreviewUrls(pending)
      throw e
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function dataTransferTypes(event: React.DragEvent) {
    return Array.from(event.dataTransfer.types)
  }

  function hasFileDrop(event: React.DragEvent) {
    return dataTransferTypes(event).includes('Files') || event.dataTransfer.files.length > 0
  }

  function hasResourceDrop(event: React.DragEvent) {
    const types = dataTransferTypes(event)
    return types.includes('application/canvas-resource') || types.includes('application/resource-id')
  }

  function hasComposerDropData(event: React.DragEvent) {
    return hasFileDrop(event) || hasResourceDrop(event)
  }

  function parseDroppedResource(event: React.DragEvent): RawResource | null {
    const rawResource = event.dataTransfer.getData('application/canvas-resource')
    if (rawResource) {
      try {
        const parsed = JSON.parse(rawResource) as RawResource
        if (parsed && Number.isInteger(parsed.ID) && parsed.ID > 0) return parsed
      } catch {
        return null
      }
    }
    return null
  }

  async function addResourceFromDrop(event: React.DragEvent) {
    const droppedResource = parseDroppedResource(event)
    const resourceId = droppedResource?.ID ?? Number(event.dataTransfer.getData('application/resource-id'))
    if (!Number.isInteger(resourceId) || resourceId <= 0) return

    const resource = droppedResource ?? await fetchResourceById(resourceId)
    const nextAttachment = resource ? attachmentFromResource(resource) : placeholderAttachment(resourceId)
    const latestDraft = useAgentStore.getState().getConversationDraft(userId, conv.id)
    const nextInput = latestDraft.input.includes(resourceMentionToken(resourceId))
      ? latestDraft.input
      : normalizeInlineSpacing(`${latestDraft.input.trimEnd()} ${resourceMentionToken(resourceId)} `)
    updateDraft({
      input: nextInput,
      attachments: dedupeAttachments([...latestDraft.attachments, nextAttachment]),
    })
    setMentionRange(null)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (inputRef.current) setCaretAtEnd(inputRef.current)
    })
  }

  function handleComposerDragOver(event: React.DragEvent) {
    if (!hasComposerDropData(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDraggingFiles(true)
  }

  function handleComposerDragEnter(event: React.DragEvent) {
    if (!hasComposerDropData(event)) return
    event.preventDefault()
    event.stopPropagation()
    setDraggingFiles(true)
  }

  function handleComposerDragLeave(event: React.DragEvent) {
    if (!hasComposerDropData(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDraggingFiles(false)
  }

  async function handleComposerDrop(event: React.DragEvent) {
    if (!hasComposerDropData(event)) return
    event.preventDefault()
    event.stopPropagation()
    setDraggingFiles(false)
    if (hasFileDrop(event)) {
      await uploadFiles(event.dataTransfer.files)
      return
    }
    await addResourceFromDrop(event)
  }

  function updateMentionState(value: string, caret: number) {
    const before = value.slice(0, caret)
    const match = before.match(RESOURCE_MENTION_TRIGGER_RE)
    if (!match) {
      setMentionRange(null)
      return
    }
    setMentionRange({
      start: caret - match[1].length - 1,
      end: caret,
      query: match[1],
    })
  }

  function insertResourceMention(attachment: AgentAttachment) {
    if (attachment.resourceId === undefined) return
    const editor = inputRef.current
    const value = editor ? serializeMentionEditor(editor) : input
    const caretState = editor ? mentionEditorTextBeforeCaret(editor) : { text: value, caret: value.length }
    const start = mentionRange?.start ?? caretState.caret
    const end = mentionRange?.end ?? start
    const token = `${resourceMentionToken(attachment.resourceId)} `
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`
    updateDraft({ input: next })
    setMentionRange(null)
    window.requestAnimationFrame(() => {
      editor?.focus()
      if (editor) setCaretAtEnd(editor)
    })
  }

  function addMentionTrigger() {
    const editor = inputRef.current
    const value = editor ? serializeMentionEditor(editor) : input
    const caretState = editor ? mentionEditorTextBeforeCaret(editor) : { text: value, caret: value.length }
    const start = caretState.caret
    const end = start
    const next = `${value.slice(0, start)}@${value.slice(end)}`
    updateDraft({ input: next })
    const caret = start + 1
    setMentionRange({ start, end: caret, query: '' })
    window.requestAnimationFrame(() => {
      editor?.focus()
      if (editor) setCaretAtEnd(editor)
    })
  }

  function removeAttachment(id: string) {
    const removed = composerAttachments.find((a) => a.id === id)
    updateDraft({ attachments: attachments.filter((a) => a.id !== id) })
    if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl)
    if (removed?.resourceId !== undefined) {
      const tokenPattern = new RegExp(`\\s*@\\[resource:${removed.resourceId}\\]\\s*`, 'g')
      updateDraft({ input: normalizeInlineSpacing(input.replace(tokenPattern, ' ')) })
    }
    setMentionRange(null)
  }

  const resetStreamingAssistant = useCallback(() => {
    if (streamingFlushTimerRef.current !== null) {
      window.clearTimeout(streamingFlushTimerRef.current)
      streamingFlushTimerRef.current = null
    }
    streamingAssistantMessageIdRef.current = null
    streamingAssistantTextRef.current = ''
    streamingAssistantTurnsRef.current = new Map()
    setStreamingAssistantMessageId(null)
    setStreamingAssistantText('')
  }, [])

  const updateStreamingAssistantText = useCallback((runId: string, text: string, roundIndex?: number) => {
    if (!text.trim()) return
    const messageId = streamingAssistantMessageIdRef.current ?? `stream-${runId}`
    const turnKey = typeof roundIndex === 'number' ? roundIndex : 0
    const turns = new Map(streamingAssistantTurnsRef.current)
    turns.set(turnKey, text)
    streamingAssistantTurnsRef.current = turns
    const combined = Array.from(turns.entries())
      .sort(([left], [right]) => left - right)
      .map(([, content]) => content.trim())
      .filter(Boolean)
      .join('\n\n')
    streamingAssistantMessageIdRef.current = messageId
    streamingAssistantTextRef.current = combined
    setStreamingAssistantMessageId((current) => current ?? messageId)
    setStreamingAssistantText((current) => (current === combined ? current : combined))
    if (streamingFlushTimerRef.current !== null) return
    streamingFlushTimerRef.current = window.setTimeout(() => {
      streamingFlushTimerRef.current = null
      setStreamingAssistantText(streamingAssistantTextRef.current)
    }, STREAMING_ASSISTANT_FLUSH_MS)
  }, [])

  const recordLiveTraceEvent = useCallback((event: AgentRunStreamEvent) => {
    if (event.type !== 'trace') return
    const trace = event.event
    if (trace.kind !== 'tool_call' && trace.kind !== 'model_call' && trace.kind !== 'context' && trace.kind !== 'memory' && trace.kind !== 'policy' && trace.kind !== 'tool_catalog') return
    const data = trace.data && typeof trace.data === 'object' ? trace.data as Record<string, unknown> : undefined
    const stream = data?.stream && typeof data.stream === 'object' ? data.stream as Record<string, unknown> : undefined
    if (trace.kind === 'tool_call') {
      setPendingAssistantState({
        status: trace.status === 'started' ? 'calling_tool' : 'preparing_tool_call',
        ...(trace.toolName ? { toolName: trace.toolName } : {}),
      })
    } else if (trace.kind === 'model_call' && stream?.kind === 'tool_call') {
      const toolName = toolNameFromToolCallStreamEvent({
        id: trace.id,
        kind: trace.kind,
        title: trace.title,
        status: trace.status,
        ...(trace.summary ? { summary: trace.summary } : {}),
        ...(trace.toolName ? { toolName: trace.toolName } : {}),
        ...(trace.stepId ? { stepId: trace.stepId } : {}),
        ...(trace.data !== undefined ? { data: trace.data } : {}),
        ...(typeof trace.durationMs === 'number' ? { durationMs: trace.durationMs } : {}),
        createdAt: trace.createdAt,
        ...(trace.completedAt ? { completedAt: trace.completedAt } : {}),
      })
      setPendingAssistantState({
        status: 'preparing_tool_call',
        ...(toolName ? { toolName } : {}),
      })
    }
    const item: ChatRunActivityEvent = {
      id: trace.id,
      kind: trace.kind,
      title: trace.title,
      status: trace.status,
      ...(trace.summary ? { summary: trace.summary } : {}),
      ...(trace.toolName ? { toolName: trace.toolName } : {}),
      ...(trace.stepId ? { stepId: trace.stepId } : {}),
      ...(trace.data !== undefined ? { data: trace.data } : {}),
      ...(typeof trace.durationMs === 'number' ? { durationMs: trace.durationMs } : {}),
      createdAt: trace.createdAt,
      ...(trace.completedAt ? { completedAt: trace.completedAt } : {}),
    }
    setLiveTraceEvents((current) => {
      const itemKey = liveTraceEventKey(item)
      const existingIndex = current.findIndex((candidate) => liveTraceEventKey(candidate) === itemKey)
      const next = existingIndex >= 0
        ? current.map((candidate, index) => index === existingIndex ? item : candidate)
        : [...current, item]
      const httpItems = next.filter((candidate) => candidate.id.startsWith('http-request-'))
      const runtimeItems = next.filter((candidate) => !candidate.id.startsWith('http-request-'))
      const sliced = [...httpItems, ...runtimeItems.slice(-16)]
      liveTraceEventsRef.current = sliced
      return sliced
    })
  }, [])

  const streamFollowUpRun = useCallback(async (runId: string) => {
    return await localAgentClient.streamRun(runId, {
      timeoutMs: 900_000,
      pollMs: 1000,
      onRunUpdate: (nextRun) => setConversationRun(conv.id, nextRun, { approving: true, loading: true }),
      onStreamEvent: recordLiveTraceEvent,
      onAssistantDelta: (event) => {
        updateStreamingAssistantText(event.runId, event.accumulated, event.roundIndex)
      },
    })
  }, [conv.id, recordLiveTraceEvent, setConversationRun, updateStreamingAssistantText])

  const appendAssistantRunResult = useCallback(async (run: AgentRun, thread: LocalAgentThread, liveEvents: ChatRunActivityEvent[] = []) => {
    const content = formatLocalAgentAssistantContent(run, thread)
    const resultPayload = await assistantResultPayloadForRun(run, liveEvents, content)
    const artifacts = resultPayload.meta.draftArtifacts ?? []
    const streamingMessageId = streamingAssistantMessageIdRef.current
    resetStreamingAssistant()
    const message = {
      role: 'assistant' as const,
      content,
      ...resultPayload,
    }
    if (streamingMessageId) {
      upsertMessage(userId, conv.id, streamingMessageId, message)
    } else {
      addMessage(userId, conv.id, message)
    }
    return { artifacts, content }
  }, [addMessage, conv.id, resetStreamingAssistant, upsertMessage, userId])

  const approveActiveLocalRun = useCallback(async (approvalIds?: string[]) => {
    const run = actionableLocalRun
    if (!run || run.status !== 'requires_action' || approvingLocalRun) return

    setConversationRuntime(conv.id, { approving: true, loading: true, error: undefined })
    try {
      const approvedRun = await localAgentClient.approveRun(run.id, { approvalIds })
      setConversationRun(conv.id, approvedRun, { approving: true, loading: true })
      const finalRun = await streamFollowUpRun(approvedRun.id)
      const thread = await localAgentClient.getThread(finalRun.threadId)
      if (finalRun.status !== 'requires_action') {
        await appendAssistantRunResult(finalRun, thread, liveTraceEventsRef.current)
      }
      if (runTouchesAgentCatalog(finalRun)) refreshAgentCatalogContext()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: `工具确认失败：${message}`,
      })
    } finally {
      setConversationRuntime(conv.id, { approving: false, loading: false })
    }
  }, [actionableLocalRun, approvingLocalRun, addMessage, appendAssistantRunResult, conv.id, userId, setConversationRun, setConversationRuntime, refreshAgentCatalogContext, streamFollowUpRun])

  const rejectActiveLocalRun = useCallback(async (approvalIds?: string[]) => {
    const run = actionableLocalRun
    if (!run || run.status !== 'requires_action' || approvingLocalRun) return

    setConversationRuntime(conv.id, { approving: true, loading: true, error: undefined })
    try {
      const rejectedRun = await localAgentClient.rejectRun(run.id, { approvalIds })
      setConversationRun(conv.id, rejectedRun, { approving: true, loading: true })
      const thread = await localAgentClient.getThread(rejectedRun.threadId)
      const content = formatLocalAgentAssistantContent(rejectedRun, thread)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content,
        meta: { contextLabels: [`run ${rejectedRun.status}`] },
      })
      if (runTouchesAgentCatalog(rejectedRun)) refreshAgentCatalogContext()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: `工具拒绝失败：${message}`,
      })
    } finally {
      setConversationRuntime(conv.id, { approving: false, loading: false })
    }
  }, [actionableLocalRun, approvingLocalRun, addMessage, conv.id, userId, setConversationRun, setConversationRuntime, refreshAgentCatalogContext])

  const answerActiveLocalRunInput = useCallback(async (requestId: string, answer: { choiceIds?: string[]; text?: string }) => {
    const run = actionableLocalRun
    if (!run || run.status !== 'requires_action' || approvingLocalRun) return

    setConversationRuntime(conv.id, { approving: true, loading: true, error: undefined })
    try {
      const answeredRun = await localAgentClient.answerRunInput(run.id, { requestId, ...answer })
      setConversationRun(conv.id, answeredRun, { approving: true, loading: true })
      const finalRun = await streamFollowUpRun(answeredRun.id)
      const thread = await localAgentClient.getThread(finalRun.threadId)
      if (finalRun.status !== 'requires_action') {
        await appendAssistantRunResult(finalRun, thread, liveTraceEventsRef.current)
      }
      if (runTouchesAgentCatalog(finalRun)) refreshAgentCatalogContext()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: `补充信息提交失败：${message}`,
      })
    } finally {
      setConversationRuntime(conv.id, { approving: false, loading: false })
    }
  }, [actionableLocalRun, approvingLocalRun, addMessage, appendAssistantRunResult, conv.id, userId, setConversationRun, setConversationRuntime, refreshAgentCatalogContext, streamFollowUpRun])

  const dispatchActivePlan = useCallback(async () => {
    const run = activeLocalRun
    const planId = activePlanSnapshot?.plan.id ?? run?.planId
    const plannerRunId = plannerRunIdForPlanAction(activePlanSnapshot, run)
    if (!run || !planId || !plannerRunId || planActionBusy) return
    setPlanActionBusy(true)
    try {
      const result = await localAgentClient.dispatchPlan(planId, {
        plannerRunId,
        maxWorkers: planDispatchSettings.maxWorkers,
        maxTaskAttempts: planDispatchSettings.maxTaskAttempts,
        workerTimeoutMs: planDispatchSettings.workerTimeoutMs,
      })
      const plannerRun = await localAgentClient.getRun(plannerRunId).catch(() => run)
      setConversationRun(conv.id, plannerRun, { loading: result.spawnedRuns.length > 0 })
      await refetchActivePlanSnapshot()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, { role: 'assistant', content: `计划调度失败：${message}` })
    } finally {
      setPlanActionBusy(false)
    }
  }, [activeLocalRun, activePlanSnapshot, planActionBusy, planDispatchSettings, addMessage, conv.id, userId, setConversationRun, refetchActivePlanSnapshot])

  const replanActivePlan = useCallback(async () => {
    const run = activeLocalRun
    const plannerRunId = plannerRunIdForPlanAction(activePlanSnapshot, run)
    if (!run?.planId || !plannerRunId || planActionBusy) return
    setPlanActionBusy(true)
    try {
      const result = await localAgentClient.replanRun(plannerRunId, {
        resetBlocked: true,
        resetNeedsReview: true,
        resetFailed: true,
        resetCancelled: true,
        retryFailed: true,
        maxTaskAttempts: planDispatchSettings.maxTaskAttempts,
        maxWorkers: planDispatchSettings.maxWorkers,
        workerTimeoutMs: planDispatchSettings.workerTimeoutMs,
      })
      const plannerRun = await localAgentClient.getRun(plannerRunId).catch(() => run)
      setConversationRun(conv.id, plannerRun, { loading: (result.dispatch?.spawnedRuns.length ?? 0) > 0 })
      await refetchActivePlanSnapshot()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, { role: 'assistant', content: `计划重规划失败：${message}` })
    } finally {
      setPlanActionBusy(false)
    }
  }, [activeLocalRun, activePlanSnapshot, planActionBusy, planDispatchSettings, addMessage, conv.id, userId, setConversationRun, refetchActivePlanSnapshot])

  const acceptPlanTaskReview = useCallback(async (taskId: string) => {
    if (planActionBusy) return
    setPlanActionBusy(true)
    try {
      await localAgentClient.updateTask(taskId, {
        status: 'done',
        progress: 1,
        blockedReason: '',
        metadata: {
          reviewOutcome: 'accepted',
          reviewedAt: new Date().toISOString(),
        },
      })
      await refetchActivePlanSnapshot()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, { role: 'assistant', content: `验收任务失败：${message}` })
    } finally {
      setPlanActionBusy(false)
    }
  }, [planActionBusy, addMessage, conv.id, userId, refetchActivePlanSnapshot])

  const rejectPlanTaskReview = useCallback(async (taskId: string) => {
    if (planActionBusy) return
    setPlanActionBusy(true)
    try {
      await localAgentClient.updateTask(taskId, {
        status: 'cancelled',
        progress: 1,
        blockedReason: 'User rejected review.',
        metadata: {
          reviewOutcome: 'rejected',
          reviewedAt: new Date().toISOString(),
        },
      })
      await refetchActivePlanSnapshot()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, { role: 'assistant', content: `拒绝任务失败：${message}` })
    } finally {
      setPlanActionBusy(false)
    }
  }, [planActionBusy, addMessage, conv.id, userId, refetchActivePlanSnapshot])

  const reworkPlanTaskReview = useCallback(async (taskId: string) => {
    const run = activeLocalRun
    const plannerRunId = plannerRunIdForPlanAction(activePlanSnapshot, run)
    if (!run?.planId || !plannerRunId || planActionBusy) return
    setPlanActionBusy(true)
    try {
      const result = await localAgentClient.replanRun(plannerRunId, {
        resetTaskIds: [taskId],
        maxWorkers: 1,
        retryFailed: true,
        maxTaskAttempts: planDispatchSettings.maxTaskAttempts,
        workerTimeoutMs: planDispatchSettings.workerTimeoutMs,
      })
      const plannerRun = await localAgentClient.getRun(plannerRunId).catch(() => run)
      setConversationRun(conv.id, plannerRun, { loading: (result.dispatch?.spawnedRuns.length ?? 0) > 0 })
      await refetchActivePlanSnapshot()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, { role: 'assistant', content: `返工任务失败：${message}` })
    } finally {
      setPlanActionBusy(false)
    }
  }, [activeLocalRun, activePlanSnapshot, planActionBusy, planDispatchSettings, addMessage, conv.id, userId, setConversationRun, refetchActivePlanSnapshot])

  const cancelActivePlanTree = useCallback(async () => {
    const run = activeLocalRun
    const rootRunId = plannerRunIdForPlanAction(activePlanSnapshot, run)
    if (!run || !rootRunId || planActionBusy) return
    setPlanActionBusy(true)
    try {
      await localAgentClient.cancelRunTree(rootRunId, { reason: '用户停止了当前计划树。' })
      const latestRun = await localAgentClient.getRun(rootRunId).catch(() => run)
      setConversationRun(conv.id, latestRun, { loading: false, stopping: false })
      await refetchActivePlanSnapshot()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, { role: 'assistant', content: `取消计划树失败：${message}` })
    } finally {
      setPlanActionBusy(false)
    }
  }, [activeLocalRun, activePlanSnapshot, planActionBusy, addMessage, conv.id, userId, setConversationRun, refetchActivePlanSnapshot])

  const stopActiveLocalRun = useCallback(async () => {
    const run = activeLocalRun
    const sendController = activeSendAbortControllerRef.current
    if (sendController && !sendController.signal.aborted) {
      sendController.abort(createLocalAgentStopAbortError())
    }
    setPendingAssistantState(null)
    resetStreamingAssistant()
    if (!isStoppableAgentRun(run)) {
      if ((loading || buildingSendDraft) && !stoppingLocalRun) {
        setConversationRuntime(conv.id, { stopRequested: false, stopping: false, loading: false, building: false })
      }
      return
    }
    if (stoppingLocalRun && !stopRequestedBeforeRun) return

    const now = new Date().toISOString()
    const cancelledRun = {
      ...run,
      status: 'cancelled' as const,
      cancelledAt: run.cancelledAt ?? now,
      completedAt: run.completedAt ?? now,
      updatedAt: now,
      warnings: Array.from(new Set([...(run.warnings ?? []), '用户停止了当前会话。'])),
    }
    setConversationRun(conv.id, cancelledRun, {
      stopping: false,
      loading: false,
      stopRequested: false,
    })
    setConversationRuntime(conv.id, { stopping: false, loading: false, stopRequested: false })
    try {
      void cancelGenerationJobIfActive(generationProgressState)
      void localAgentClient.cancelRun(run.id, { reason: '用户停止了当前会话。' })
        .then(async (nextRun) => {
          setConversationRun(conv.id, nextRun, {
            stopping: false,
            loading: false,
            stopRequested: false,
          })
          const thread = await localAgentClient.getThread(nextRun.threadId)
          await appendAssistantRunResult(nextRun, thread, liveTraceEventsRef.current)
        })
        .catch(async (error) => {
          const message = error instanceof Error ? error.message : String(error)
          if (/already finished/i.test(message)) {
            const latestRun = await localAgentClient.getRun(run.id).catch(() => undefined)
            if (latestRun) {
              setConversationRun(conv.id, latestRun, { stopRequested: false, stopping: false, loading: false })
            }
            return
          }
          addMessage(userId, conv.id, {
            role: 'assistant',
            content: `停止当前会话失败：${message}`,
          })
        })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (/already finished/i.test(message)) {
        const latestRun = await localAgentClient.getRun(run.id).catch(() => undefined)
        if (latestRun) {
          setConversationRun(conv.id, latestRun, { stopRequested: false, stopping: false, loading: false })
          return
        }
      }
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: `停止当前会话失败：${message}`,
      })
    } finally {
      setConversationRuntime(conv.id, { stopRequested: false, stopping: false, loading: false, building: false })
    }
  }, [activeLocalRun, stoppingLocalRun, stopRequestedBeforeRun, loading, buildingSendDraft, generationProgressState, addMessage, appendAssistantRunResult, conv.id, userId, resetStreamingAssistant, setConversationRun, setConversationRuntime])

  const buildSendDraft = useCallback(async (options: {
    includeRuntimePreview?: boolean
    message?: string
    displayMessage?: string
    title?: string
    projectId?: number
    clientInput?: AgentClientInput
    agentManifest?: AgentManifest
    runPolicy?: AgentRunPolicyOverride
    requestId?: string
    timeoutMs?: number
    omitDebugArtifacts?: boolean
  } = {}): Promise<AgentSendDraft> => {
    const canUseExternalTask = !!externalTask
      && !externalTask.settledAt
      && (externalTask.status === 'queued' || externalTask.status === 'claimed')
    const taskPayload = canUseExternalTask && !options.clientInput && options.message === undefined ? externalTask?.payload : undefined
    const activeRunPreset = activeRunPresetFromSettings(settings)
    const presetRunPolicy: AgentRunPolicyOverride = {
      approvalMode: agentPermissionModeToApprovalMode(settings.permissionMode),
      maxToolCalls: activeRunPreset.maxToolCalls,
      maxIterations: activeRunPreset.maxIterations,
    }
    const effectiveRunPolicy: AgentRunPolicyOverride = {
      ...presetRunPolicy,
      ...(taskPayload?.runPolicy ?? {}),
      ...(options.runPolicy ?? {}),
    }
    const taskRequestId = canUseExternalTask ? pageToolRequestId : undefined
    const text = (options.message ?? input).trim()
    const sentAttachments = options.message === undefined
      ? composerAttachments
      : dedupeAttachments([
        ...(options.clientInput?.attachments?.length ? options.clientInput.attachments.map(attachmentFromClientInputRef) : attachments),
        ...resourceMentionAttachments(text, resourceAttachmentIndex),
      ])
    const visibleText = (options.displayMessage ?? text).trim()
    const visibleUserContent = visibleText || t('agents.chat.attachmentOnlyMessage')
    const runtimeMessage = options.clientInput?.message ?? normalizeAgentCommandMessage(visibleUserContent)
    const diagnosticCommand = isDiagnosticAgentCommand(runtimeMessage)
    const requestedManifest = options.agentManifest ?? activeConversationManifest
    const clientInput = options.clientInput
      ?? (taskPayload?.clientInput
        ? {
            ...taskPayload.clientInput,
            message: runtimeMessage,
            ...(sentAttachments.length > 0
              ? {
                  attachments: sentAttachments.map((attachment) => ({
                    id: attachment.id,
                    name: attachment.name,
                    type: attachment.type,
                    mimeType: attachment.mimeType,
                    size: attachment.size,
                    ...(attachment.resourceId ? { resourceId: attachment.resourceId } : {}),
                  })),
                }
              : {}),
          }
        : buildAgentClientInput({
            message: runtimeMessage,
            attachments: sentAttachments,
            projectId: options.projectId ?? currentProject?.ID,
            labels: contextLabels,
          }))
    const agentContext = buildAgentContext({
      permissionMode: settings.permissionMode,
      autoPlan: settings.autoPlan,
      project: currentProject,
      recentResources,
      includeProjectContext: settings.includeProjectContext,
      includeRecentResources: settings.includeRecentResources,
    })
    const enrichedUserContent = `${visibleUserContent}${attachmentPromptBlock(sentAttachments)}`
    const messages = [
      { role: 'system' as const, content: [systemPrompt, agentContext].filter(Boolean).join('\n\n') },
      ...conv.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: enrichedUserContent },
    ]
    const debugMessages = options.omitDebugArtifacts ? [] : messages
    const warnings: string[] = []
    const threadId = diagnosticCommand ? undefined : localThreadId || undefined
    const localRuntime: AgentSendDraft['localRuntime'] = {
      ...(threadId ? { threadId } : {}),
      ...(threadId && (options.title ?? taskPayload?.title) ? { title: options.title ?? taskPayload?.title } : {}),
      ...((options.projectId ?? taskPayload?.projectId) !== undefined ? { projectId: options.projectId ?? taskPayload?.projectId } : {}),
      clientInput,
      ...(requestedManifest ? { agentManifest: requestedManifest } : {}),
      ...(effectiveRunPolicy ? { runPolicy: effectiveRunPolicy } : {}),
      ...((options.requestId ?? taskRequestId) ? { requestId: options.requestId ?? taskRequestId } : {}),
      ...((options.timeoutMs ?? taskPayload?.timeoutMs) ? { timeoutMs: options.timeoutMs ?? taskPayload?.timeoutMs } : {}),
      diagnosticCommand,
    }

    if (options.includeRuntimePreview) {
      try {
        if (!localAgentOnline) {
          await localAgentClient.ensureRunning()
          await refetchLocalAgentHealth()
        }
        await assertMCPReady()
        await syncRuntimeModelConfig(activeModel ? publicModelId(activeModel) : undefined)
        try {
          localRuntime.preview = await localAgentClient.previewRun({
            ...(threadId ? { threadId } : {}),
            clientInput,
            ...(requestedManifest ? { agentManifest: requestedManifest } : {}),
            ...(effectiveRunPolicy ? { policy: effectiveRunPolicy } : {}),
          })
        } catch (e) {
          if (!threadId || !isLocalAgentNotFoundError(e)) throw e
          warnings.push('Saved local thread was not found; retried preview as a new thread.')
          localRuntime.preview = await localAgentClient.previewRun({
            clientInput,
            ...(requestedManifest ? { agentManifest: requestedManifest } : {}),
            ...(effectiveRunPolicy ? { policy: effectiveRunPolicy } : {}),
          })
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        localRuntime.previewError = message
        warnings.push(`Local runtime dry-run failed: ${message}`)
        toastMCPError(e, localAgentHealth?.mcpEndpoint ?? localAgentClient.baseURL)
      }
    }

    return {
      id: makeTraceId(),
      createdAt: Date.now(),
      route: 'local-runtime',
      visibleUserContent,
      attachments: sentAttachments,
      model: {
        id: modelId,
        ...(activeModel ? { name: publicModelLabel(activeModel) } : {}),
        ...(activeModel ? { runtimeModelId: publicModelId(activeModel) } : {}),
      },
      agent: {
        id: null,
      },
      settings: {
        permissionMode: settings.permissionMode,
        includeProjectContext: settings.includeProjectContext,
        includeRecentResources: settings.includeRecentResources,
        autoPlan: settings.autoPlan,
      },
      contextLabels,
      context: {
        ...(compactProject(currentProject) ? { project: compactProject(currentProject) } : {}),
        recentResources: recentResources.slice(0, 8).map(compactResource),
      },
      outbound: {
        systemPrompt,
        agentContext,
        enrichedUserContent,
        messages: debugMessages,
      },
      httpRequests: options.omitDebugArtifacts
        ? []
        : buildDebugHttpRequests({
          modelId,
          ...(activeModel ? { modelName: publicModelId(activeModel) } : {}),
          messages,
          localRuntime,
          labels: {
            syncModelConfig: t('agents.chat.panel.http.syncModelConfig'),
            loadExistingThread: t('agents.chat.panel.http.loadExistingThread'),
            missingThreadFallback: t('agents.chat.panel.http.missingThreadFallback'),
            createThread: t('agents.chat.panel.http.createThread'),
            appendUserMessage: t('agents.chat.panel.http.appendUserMessage'),
            createRun: t('agents.chat.panel.http.createRun'),
            pollRun: t('agents.chat.panel.http.pollRun'),
            pollRunNote: t('agents.chat.panel.http.pollRunNote'),
            fetchFinalThread: t('agents.chat.panel.http.fetchFinalThread'),
          },
        }),
      localRuntime,
      warnings,
    }
  }, [
    input,
    attachments,
    composerAttachments,
    resourceAttachmentIndex,
    t,
    settings,
    currentProject,
    recentResources,
    systemPrompt,
    conv.messages,
    conv.id,
    conv.title,
    localThreadId,
    localAgentOnline,
    localAgentHealth?.mcpEndpoint,
    refetchLocalAgentHealth,
    assertMCPReady,
    modelId,
    activeModel,
    contextLabels,
    userId,
    pageToolRequestId,
    activeConversationManifest,
    externalTask?.payload,
    externalTask?.settledAt,
    externalTask?.status,
  ])

  const commitSendDraft = useCallback(async (draft: AgentSendDraft) => {
    if (!draft.model.id) {
      addMessage(userId, conv.id, { role: 'assistant', content: t('agents.chat.selectModelFirst') })
      notifyAgentPanelRunSettled({
        requestId: draft.localRuntime?.requestId,
        status: 'error',
        error: t('agents.chat.selectModelFirst'),
      })
      return
    }

    const messageAttachments = draft.attachments.map(stripAttachmentPreviewUrl)
    revokeAttachmentPreviewUrls(useAgentStore.getState().getConversationDraft(userId, conv.id).attachments)
    clearConversationDraft(userId, conv.id)
    setMentionRange(null)
    setConversationRuntime(conv.id, { loading: true, building: false, approving: false, stopping: false, stopRequested: false, error: undefined })
    cancelRequestedRunIdsRef.current.clear()
    const httpEvents = debugHttpRequestEvents(draft.httpRequests)
    liveTraceEventsRef.current = httpEvents
    setLiveTraceEvents(httpEvents)
    setPendingHttpEvents(httpEvents)
    setPendingAssistantState({ status: 'preparing_request' })
    addMessage(userId, conv.id, {
      role: 'user',
      content: draft.visibleUserContent,
      attachments: messageAttachments,
      meta: {
        modelId: draft.model.id,
        agentName: t('agents.chat.localRuntime'),
        permissionMode: draft.settings.permissionMode,
        contextLabels: draft.contextLabels,
      },
    })
    if (draft.localRuntime?.requestId) {
      setPageTaskRunning(draft.localRuntime.requestId, { conversationId: conv.id })
    }
    resetStreamingAssistant()
    const sendController = new AbortController()
    activeSendAbortControllerRef.current = sendController
    const updateActivityEvents = (updater: (events: ChatRunActivityEvent[]) => ChatRunActivityEvent[]) => {
      setPendingHttpEvents((current) => updater(current))
      setLiveTraceEvents((current) => {
        const next = updater(current)
        liveTraceEventsRef.current = next
        return next
      })
    }
    const startActivityEvent = (event: Omit<ChatRunActivityEvent, 'createdAt' | 'status'>) => {
      updateActivityEvents((current) => upsertActivityEvent(current, {
        ...event,
        status: 'started',
        createdAt: new Date().toISOString(),
      }))
    }
    const completeActivityEvent = (id: string, status: ChatRunActivityEvent['status'] = 'completed') => {
      updateActivityEvents((current) => setActivityEventStatus(current, id, status, new Date().toISOString()))
    }

    try {
      if (!localAgentOnline) {
        startActivityEvent({
          id: 'local-runtime-ensure-running',
          kind: 'runtime',
          title: '准备本地 Runtime',
          summary: localAgentClient.baseURL,
        })
        await localAgentClient.ensureRunning()
        completeActivityEvent('local-runtime-ensure-running')
        if (sendController.signal.aborted) throw sendController.signal.reason ?? createLocalAgentStopAbortError()
        await refetchLocalAgentHealth()
        if (sendController.signal.aborted) throw sendController.signal.reason ?? createLocalAgentStopAbortError()
      }
      startActivityEvent({
        id: 'local-runtime-mcp-ready',
        kind: 'runtime',
        title: '检查 MCP 服务',
        summary: localAgentHealth?.mcpEndpoint ?? localAgentClient.baseURL,
      })
      await assertMCPReady()
      completeActivityEvent('local-runtime-mcp-ready')
      setPendingAssistantState({ status: 'thinking' })
      updateActivityEvents((current) => setActivityEventStatus(current, 'http-request-local-save-model-config', 'started'))
      await syncRuntimeModelConfig(draft.model.runtimeModelId ?? draft.model.name)
      completeActivityEvent('http-request-local-save-model-config')
      if (sendController.signal.aborted) throw sendController.signal.reason ?? createLocalAgentStopAbortError()
      updateActivityEvents((current) => setActivityEventStatus(current, 'http-request-local-create-thread', 'started'))
      if (sendController.signal.aborted) throw sendController.signal.reason ?? createLocalAgentStopAbortError()
      const runResult = await localAgentClient.runMessageStream({
        threadId: draft.localRuntime?.diagnosticCommand ? undefined : draft.localRuntime?.threadId,
        message: draft.localRuntime?.clientInput?.message ?? draft.visibleUserContent,
        clientInput: draft.localRuntime?.clientInput,
        ...(draft.localRuntime?.title ? { title: draft.localRuntime.title } : {}),
        projectId: draft.localRuntime?.projectId,
      }, {
        ...(draft.localRuntime?.agentManifest ? { agentManifest: draft.localRuntime.agentManifest } : {}),
        ...(draft.localRuntime?.runPolicy ? { runPolicy: draft.localRuntime.runPolicy } : {}),
        ...(draft.localRuntime?.timeoutMs ? { timeoutMs: draft.localRuntime.timeoutMs } : {}),
        pollMs: 120,
        signal: sendController.signal,
        onRunUpdate: (nextRun) => {
          if (sendController.signal.aborted) return
          const artifacts = extractAgentTaskArtifacts(nextRun)
          if (nextRun.status === 'in_progress' || nextRun.status === 'queued') {
            const nextThinkingState = getThinkingBubbleState(nextRun, [])
            setPendingAssistantState((current) =>
              current?.status === 'preparing_tool_call' && nextThinkingState.status === 'thinking'
                ? current
                : nextThinkingState
            )
          }
          if (runTouchesAgentCatalog(nextRun)) refreshAgentCatalogContext()
          if (draft.localRuntime?.requestId) {
            setPageTaskRunning(draft.localRuntime.requestId, {
              conversationId: conv.id,
              run: nextRun,
              threadId: nextRun.threadId,
              ...(artifacts.length > 0 ? { artifacts } : {}),
            })
          }
          setConversationRun(conv.id, nextRun, {
            loading: true,
            building: false,
          })
          const nextRuntime = useAgentSessionStore.getState().conversationRuntimes[conv.id]
          if (nextRuntime?.stopRequested && isStoppableAgentRun(nextRun) && !cancelRequestedRunIdsRef.current.has(nextRun.id)) {
            cancelRequestedRunIdsRef.current.add(nextRun.id)
            void cancelGenerationJobIfActive(generationProgressFromEvents(liveTraceEventsRef.current))
            void localAgentClient.cancelRun(nextRun.id, { reason: '用户停止了当前会话。' })
              .then((cancelledRun) => {
                const finishedBeforeCancel = isTerminalAgentRun(cancelledRun) && cancelledRun.status !== 'cancelled'
                setConversationRun(conv.id, cancelledRun, {
                  loading: finishedBeforeCancel ? false : true,
                  building: false,
                  approving: false,
                  stopping: finishedBeforeCancel ? false : true,
                  stopRequested: false,
                })
              })
              .catch(async (error) => {
                const message = error instanceof Error ? error.message : String(error)
                if (/already finished/i.test(message)) {
                  const latestRun = await localAgentClient.getRun(nextRun.id).catch(() => undefined)
                  if (latestRun) setConversationRun(conv.id, latestRun, { loading: false, building: false, approving: false, stopping: false, stopRequested: false })
                }
              })
              .finally(() => {
                setConversationRuntime(conv.id, { stopRequested: false, stopping: false, loading: false })
              })
          }
        },
        onAssistantDelta: (event) => {
          if (sendController.signal.aborted) return
          updateStreamingAssistantText(event.runId, event.accumulated)
        },
        onStreamEvent: (event) => {
          if (sendController.signal.aborted) return
          if (event.type === 'thread_title' && event.title.trim()) {
            updateConversationTitle(userId, conv.id, event.title.trim())
          }
          if (event.type === 'run' && event.run?.id) {
            const completedAt = new Date().toISOString()
            setPendingHttpEvents((current) => current.map((item) => (
              item.status === 'started' && item.id.startsWith('http-request-')
                ? { ...item, status: 'completed', completedAt }
                : item
            )))
            setLiveTraceEvents((current) => {
              const next = current.map((item) => (
                item.status === 'started' && item.id.startsWith('http-request-')
                  ? { ...item, status: 'completed' as const, completedAt }
                  : item
              ))
              liveTraceEventsRef.current = next
              return next
            })
          }
          recordLiveTraceEvent(event)
        },
      })
      if (sendController.signal.aborted) throw sendController.signal.reason ?? createLocalAgentStopAbortError()
      const { thread } = runResult
      const run = runResult.run.streamPartial
        ? await localAgentClient.getRun(runResult.run.id).catch(() => runResult.run)
        : runResult.run
      const artifacts = extractAgentTaskArtifacts(run)
      if (!draft.localRuntime?.diagnosticCommand) setLocalThreadId(conv.id, thread.id)
      if (!draft.localRuntime?.diagnosticCommand && thread.title?.trim()) {
        updateConversationTitle(userId, conv.id, thread.title.trim())
      }
      if (draft.localRuntime?.requestId) setPageTaskRunning(draft.localRuntime.requestId, { conversationId: conv.id, run, threadId: thread.id, artifacts })
      setConversationRun(conv.id, run, { loading: false, building: false, approving: false, stopping: false, stopRequested: false })
      setPendingHttpEvents([])
      setPendingAssistantState(null)
      const resolutionEvent = threadResolutionActivityEvent(runResult.threadResolution)
      const liveEvents = resolutionEvent
        ? upsertActivityEvent(liveTraceEventsRef.current, resolutionEvent)
        : liveTraceEventsRef.current
      liveTraceEventsRef.current = liveEvents
      await appendAssistantRunResult(run, thread, liveEvents)
      liveTraceEventsRef.current = []
      setLiveTraceEvents([])
      if (runTouchesAgentCatalog(run)) refreshAgentCatalogContext()
      notifyAgentPanelRunSettled({
        requestId: draft.localRuntime?.requestId,
        status: panelRunSettledStatusFromRun(run),
        run,
        thread,
        artifacts,
      })
    } catch (e: any) {
      const message = e instanceof Error ? e.message : String(e)
      if (isLocalAgentAbortError(e) || sendController.signal.aborted) {
        const streamingMessageId = streamingAssistantMessageIdRef.current
        if (streamingMessageId) removeMessage(userId, conv.id, streamingMessageId)
        setPendingAssistantState(null)
        setPendingHttpEvents([])
        resetStreamingAssistant()
        setConversationRuntime(conv.id, { stopRequested: false, stopping: false, loading: false, building: false })
        notifyAgentPanelRunSettled({
          requestId: draft.localRuntime?.requestId,
          status: 'cancelled',
          error: message,
        })
        return
      }
      toastMCPError(e, localAgentHealth?.mcpEndpoint ?? localAgentClient.baseURL)
      const streamingMessageId = streamingAssistantMessageIdRef.current
      if (streamingMessageId) removeMessage(userId, conv.id, streamingMessageId)
      setPendingAssistantState(null)
      setPendingHttpEvents([])
      resetStreamingAssistant()
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: `本地 Agent 暂不可用。\n\n启动命令：\`pnpm --filter movscript-agent dev\`\n健康检查：\`${localAgentClient.baseURL}/health\`\n\n错误：${message}`,
      })
      setConversationRuntime(conv.id, { error: message, loading: false, building: false })
      notifyAgentPanelRunSettled({
        requestId: draft.localRuntime?.requestId,
        status: 'error',
        error: message,
      })
    } finally {
      if (activeSendAbortControllerRef.current === sendController) {
        activeSendAbortControllerRef.current = null
      }
      cancelRequestedRunIdsRef.current.clear()
      setPendingAssistantState(null)
      resetStreamingAssistant()
      setConversationRuntime(conv.id, { stopRequested: false, stopping: false, loading: false, building: false })
    }
  }, [
    addMessage,
    removeMessage,
    userId,
    conv.id,
    conv.messages.length,
    conv.title,
    t,
    updateConversationTitle,
    localAgentOnline,
    localAgentHealth?.mcpEndpoint,
    refetchLocalAgentHealth,
    assertMCPReady,
    setLocalThreadId,
    setPageTaskRunning,
    setConversationRun,
    setConversationRuntime,
    appendAssistantRunResult,
    clearConversationDraft,
    refreshAgentCatalogContext,
    resetStreamingAssistant,
    updateStreamingAssistantText,
    recordLiveTraceEvent,
  ])

  useEffect(() => {
    const task = externalTask
    const payload = task?.payload
    if (!task || !payload?.message?.trim()) return
    if (task.status !== 'queued' && task.status !== 'claimed') return
    if (processedExternalTaskRequestIdRef.current === payload.requestId) return
    processedExternalTaskRequestIdRef.current = payload.requestId ?? null

    updateDraft({ input: payload.displayMessage ?? payload.message })
    window.setTimeout(() => inputRef.current?.focus(), 0)
    onExternalDraftConsumed?.()

    if (!payload.autoSend) return
    if (loading || uploading || buildingSendDraft) {
      const error = '当前 Agent 对话正在处理上一条请求，请稍后再试'
      addMessage(userId, conv.id, { role: 'assistant', content: error })
      notifyAgentPanelRunSettled({ requestId: payload.requestId, status: 'error', error })
      return
    }

    setConversationRuntime(conv.id, { building: true, loading: false, error: undefined })
    buildSendDraft({
      message: payload.message,
      displayMessage: payload.displayMessage,
      title: payload.title,
      projectId: payload.projectId,
      clientInput: payload.clientInput,
      agentManifest: payload.agentManifest,
      runPolicy: payload.runPolicy,
      requestId: payload.requestId,
      timeoutMs: payload.timeoutMs,
      omitDebugArtifacts: true,
    })
      .then((draft) => commitSendDraft(draft))
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e)
        addMessage(userId, conv.id, { role: 'assistant', content: `发送前调试构建失败：${message}` })
        setConversationRuntime(conv.id, { building: false, error: message })
        notifyAgentPanelRunSettled({ requestId: payload.requestId, status: 'error', error: message })
      })
      .finally(() => setConversationRuntime(conv.id, { building: false }))
  }, [
    externalTask,
    onExternalDraftConsumed,
    loading,
    uploading,
    buildingSendDraft,
    addMessage,
    userId,
    conv.id,
    buildSendDraft,
    commitSendDraft,
    setConversationRuntime,
  ])

  const send = useCallback(async () => {
    if ((!input.trim() && composerAttachments.length === 0) || loading || uploading || buildingSendDraft) return
    if (!modelId) {
      addMessage(userId, conv.id, { role: 'assistant', content: t('agents.chat.selectModelFirst') })
      return
    }

    setConversationRuntime(conv.id, { building: true, loading: false, error: undefined })
    try {
      const draft = await buildSendDraft({ includeRuntimePreview: debugBeforeSend })
      if (debugBeforeSend) {
        setPendingSendDraft(draft)
        return
      }
      await commitSendDraft(draft)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, { role: 'assistant', content: `发送前调试构建失败：${message}` })
      setConversationRuntime(conv.id, { building: false, error: message })
    } finally {
      setConversationRuntime(conv.id, { building: false })
    }
  }, [
    input,
    composerAttachments,
    loading,
    uploading,
    buildingSendDraft,
    modelId,
    currentProject,
    userId,
    conv.id,
    addMessage,
    t,
    buildSendDraft,
    debugBeforeSend,
    commitSendDraft,
    setConversationRuntime,
  ])

  const confirmPendingSendDraft = useCallback(async () => {
    const draft = pendingSendDraft
    if (!draft || loading) return
    setPendingSendDraft(null)
    await commitSendDraft(draft)
  }, [pendingSendDraft, loading, commitSendDraft])

  return (
    <AgentMain className="ai-agent-panel-main">
      <AgentDebugPreviewDialog
        draft={pendingSendDraft}
        sending={loading}
        onCancel={() => setPendingSendDraft(null)}
        onConfirm={confirmPendingSendDraft}
      />
      <section className="ai-agent-panel-card ai-agent-panel-content-card">
        <AgentHeader className="ai-agent-panel-chat-header">
          <AgentHeaderContent className="ai-agent-panel-header-content">
            <div className="ai-agent-panel-title-row">
              <Button size="icon-sm" variant="ghost" onClick={onCollapse} aria-label={t('agents.chat.collapseAssistant')} title={t('agents.chat.collapseAssistant')} className="ai-agent-panel-header-collapse">
                <ChevronRight size={14} />
              </Button>
              <AgentTitle>{t('agents.chat.aiAssistant')}</AgentTitle>
            </div>
            <div
              className="ai-agent-panel-conversation-tabs"
              role="tablist"
              aria-label={t('agents.chat.conversationTabs')}
              data-density={conversationTabs.length > 4 ? 'scroll' : 'fit'}
              style={{ '--ai-agent-panel-tab-count': conversationTabs.length } as React.CSSProperties}
            >
              {conversationTabs.map((item, index) => {
                const title = conversationDisplayTitle(item, t)
                const hasRightTabs = index < conversationTabs.length - 1
                return (
                  <div
                    key={item.id}
                    className="ai-agent-panel-conversation-tab"
                    data-active={item.id === conv.id ? 'true' : 'false'}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={item.id === conv.id}
                      aria-label={title}
                      className="ai-agent-panel-conversation-tab-main"
                      title={title}
                      onClick={() => onSelectConversation(item.id)}
                      onAuxClick={(event) => {
                        if (event.button !== 1) return
                        event.preventDefault()
                        onCloseConversation(item.id)
                      }}
                    >
                      <MessageSquareText size={11} aria-hidden="true" />
                      <span className="ai-agent-panel-conversation-tab-title">{title}</span>
                      {item.messages.length > 0 ? (
                        <span className="ai-agent-panel-conversation-tab-count" aria-label={t('agents.chat.messagesCount', { count: item.messages.length })}>
                          {item.messages.length}
                        </span>
                      ) : null}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="ai-agent-panel-conversation-tab-menu"
                          aria-label={t('agents.chat.tabActions')}
                          title={t('agents.chat.tabActions')}
                        >
                          <MoreHorizontal size={11} aria-hidden="true" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-36">
                        <DropdownMenuItem onSelect={() => onCloseConversation(item.id)}>
                          {t('agents.chat.closeConversation')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={conversationTabs.length <= 1}
                          onSelect={() => closeOtherConversationTabs(item.id)}
                        >
                          {t('agents.chat.closeOtherConversations')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!hasRightTabs}
                          onSelect={() => closeRightConversationTabs(item.id)}
                        >
                          {t('agents.chat.closeRightConversations')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={closeAllConversationTabs}
                        >
                          {t('agents.chat.closeAllConversations')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      type="button"
                      className="ai-agent-panel-conversation-tab-close"
                      aria-label={t('agents.chat.closeConversation')}
                      title={t('agents.chat.closeConversation')}
                      onClick={(event) => {
                        event.stopPropagation()
                        onCloseConversation(item.id)
                      }}
                    >
                      <X size={10} aria-hidden="true" />
                    </button>
                  </div>
                )
              })}
            </div>
            <AgentSubtitle className="sr-only">{currentConversationTitle}</AgentSubtitle>
          </AgentHeaderContent>
          <AgentHeaderActions>
            <Button size="icon-sm" variant="outline" onClick={onNewConversation} aria-label={t('agents.chat.newConversation')} title={t('agents.chat.newConversation')}>
              <Plus size={14} />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={onBack} aria-label={t('agents.chat.conversationHistory')} title={t('agents.chat.conversationHistory')}>
              <History size={14} />
            </Button>
          </AgentHeaderActions>
        </AgentHeader>

        <AgentBody>
          <AgentThread
            ref={threadRef}
            onScroll={(event) => {
              const thread = event.currentTarget
              shouldAutoScrollRef.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 48
            }}
          >
            {conv.messages.length === 0 && (
              <AgentEmpty className="min-h-0 py-6">
                <p className="text-sm font-medium text-foreground">
                  {t('agents.chat.startChat')}
                </p>
                <AgentSuggestions className="grid w-full grid-cols-2 gap-2">
                  {[
                    { icon: <ListChecks size={13} />, label: t('agents.chat.suggestions.planProject') },
                    { icon: <Sparkles size={13} />, label: t('agents.chat.suggestions.createContentUnit') },
                    { icon: <Search size={13} />, label: t('agents.chat.suggestions.reviewAssets') },
                    { icon: <Workflow size={13} />, label: t('agents.chat.suggestions.buildWorkflow') },
                  ].map((item) => (
                    <AgentSuggestion
                      key={item.label}
                      onClick={() => updateDraft({ input: item.label })}
                      className="justify-start rounded-md text-left text-[11px]"
                    >
                      {item.icon}
                      <span className="leading-tight">{item.label}</span>
                    </AgentSuggestion>
                  ))}
                </AgentSuggestions>
              </AgentEmpty>
            )}
            {conv.messages.map((m) => <MessageBubble key={m.id} msg={m} projectId={currentProject?.ID} />)}
            <StreamingAssistantBubble content={streamingAssistantText} />
            {showGenerationProgressBubble && (
              <GenerationProgressBubble state={generationProgressState} />
            )}
            {showLiveRunActivityBubble ? (
              <LiveRunActivityBubble run={activeLocalRun} events={visibleActivityEvents} />
            ) : (
              showThinkingBubble && <ThinkingBubble run={activeLocalRun} state={thinkingState} />
            )}
            <PlanOverviewPanel
              snapshot={activePlanSnapshot}
              busy={planActionBusy}
              onDispatch={dispatchActivePlan}
              onReplan={replanActivePlan}
              onCancelTree={cancelActivePlanTree}
              onAcceptReview={acceptPlanTaskReview}
              onReworkReview={reworkPlanTaskReview}
              onRejectReview={rejectPlanTaskReview}
              dispatchSettings={planDispatchSettings}
              onDispatchSettingsChange={updatePlanDispatchSettings}
            />
            <div ref={bottomRef} />
          </AgentThread>
        </AgentBody>
        {showLocalWorkflow && (
          <div className="border-t border-border/70 px-3 py-2">
            <LocalAgentWorkflow
              run={actionableLocalRun}
              approving={approvingLocalRun}
              events={visibleActivityEvents}
              onApprove={approveActiveLocalRun}
              onReject={rejectActiveLocalRun}
              onAnswerInput={answerActiveLocalRunInput}
            />
          </div>
        )}
      </section>

      <section className={cn('ai-agent-panel-card ai-agent-panel-context-section', showContext && 'ai-agent-panel-context-section--open')}>
        <div className="ai-agent-panel-card-header">
          <div className="min-w-0">
            <p className="ai-agent-panel-card-title">上下文</p>
            <p className="ai-agent-panel-card-subtitle">{contextSubtitle}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setShowContext((v) => !v)}
            className="h-6 shrink-0 px-1 text-[10px] text-muted-foreground"
          >
            <Eye size={10} /> {showContext ? t('agents.chat.hideContext') : t('agents.chat.showContext')}
          </Button>
        </div>
        {showContext && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize context area"
            className="ai-agent-panel-context-resize-handle"
            onPointerDown={startContextPaneResize}
          >
            <GripHorizontal size={18} aria-hidden="true" />
          </div>
        )}
        <div
          className={cn('ai-agent-panel-context-body space-y-2', !showContext && 'hidden')}
          style={{ height: contextPaneHeight }}
        >
          <div className="rounded-md border border-border bg-background/60 p-2 space-y-1">
            <div className="flex min-w-0 items-center justify-between gap-2 text-[10px]">
              <span className={cn('min-w-0 truncate font-medium', localAgentOnline ? 'text-green-600' : 'text-amber-600')}>
                {localAgentOnline ? t('agents.chat.panel.status.localRuntimeOnline') : (checkingLocalAgent || startingLocalAgent ? (canAutoStartLocalAgent ? t('agents.chat.panel.status.startingLocalRuntime') : t('agents.chat.panel.status.checkingLocalRuntime')) : t('agents.chat.panel.status.localRuntimeOffline'))}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => startLocalAgent()}
                disabled={checkingLocalAgent || startingLocalAgent}
                className="h-5 px-1 text-[10px] text-muted-foreground"
              >
                {checkingLocalAgent || startingLocalAgent ? (canAutoStartLocalAgent ? t('agents.chat.panel.status.starting') : t('agents.chat.panel.status.checking')) : (canAutoStartLocalAgent ? t('agents.chat.panel.status.start') : t('agents.chat.panel.status.refresh'))}
              </Button>
            </div>
            {!localAgentOnline && (
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {canAutoStartLocalAgent ? t('agents.chat.panel.status.autoStartHint') : t('agents.chat.panel.status.localRuntimeCannotStart')} {t('agents.chat.browserModeManualStart')} <code className="rounded bg-muted px-1 py-0.5">pnpm --filter movscript-agent dev</code>.
              </p>
            )}
            {localAgentErrorMessage && (
              <p className="line-clamp-2 text-[10px] leading-relaxed text-destructive">
                {localAgentErrorMessage}
              </p>
            )}
            {contextThreadId && (
              <p className="truncate text-[10px] text-muted-foreground/70">
                {t('agents.chat.panel.status.thread')}: <code className="rounded bg-muted px-1 py-0.5">{contextThreadId}</code>
              </p>
            )}
          </div>
          {showContext && (
            <div className="ai-agent-panel-context-stack">
              <DebugSection title={t('agents.chat.panel.layers.productSurface')}>
                <div className="space-y-2">
                  <div className="grid gap-2 text-[11px] md:grid-cols-3">
                    <DebugSummaryItem label={t('agents.chat.panel.status.thread')} value={contextThreadId || t('agents.chat.panel.status.newThread')} />
                    <DebugSummaryItem label={t('agents.chat.panel.context.runtime')} value={localAgentOnline ? t('agents.chat.panel.status.online') : t('agents.chat.panel.status.offline')} />
                    <DebugSummaryItem label={t('agents.chat.panel.context.conversation')} value={activeConversationManifest ? t('agents.chat.panel.context.customContext') : t('agents.chat.panel.context.runtimeDefault')} />
                    <DebugSummaryItem label={t('agents.chat.panel.context.runtime')} value={localAgentHealth?.modelConfig?.configured ? localAgentHealth.modelConfig.model : t('common.emptyTitle')} />
                    <DebugSummaryItem label={t('agents.chat.panel.capabilities.skills')} value={String(localAgentHealth?.pluginCatalog?.skillCount ?? localAgentInspect?.pluginCatalog?.skillCount ?? localAgentInspect?.skills.length ?? 0)} />
                    <DebugSummaryItem label={t('agents.chat.panel.capabilities.tools')} value={String(localAgentHealth?.pluginCatalog?.toolCount ?? localAgentInspect?.pluginCatalog?.toolCount ?? localAgentInspect?.registeredTools.length ?? 0)} />
                  </div>
                  <div className="rounded-md border border-border bg-background/60 p-2 text-[10px]">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <DebugSummaryItem label="MCP" value={localAgentCapabilities?.mcp.connected ? t('agents.chat.panel.status.online') : t('agents.chat.panel.status.offline')} />
                      <DebugSummaryItem label="Resources" value={String(localAgentCapabilities?.mcp.resources.length ?? localAgentInspect?.resources.length ?? 0)} />
                      <DebugSummaryItem label="MCP Tools" value={String(localAgentCapabilities?.mcp.tools.length ?? localAgentInspect?.tools.length ?? 0)} />
                      <DebugSummaryItem label="Warnings" value={String((localAgentCapabilities?.warnings.length ?? 0) + (localAgentInspect?.pluginCatalog?.warnings?.length ?? 0))} />
                    </div>
                    {localAgentHealth?.pluginCatalog?.warnings?.length ? (
                      <div className="mt-2 space-y-1">
                        {localAgentHealth.pluginCatalog.warnings.slice(0, 3).map((warning) => (
                          <p key={warning} className="line-clamp-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700">{warning}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </DebugSection>
              <DebugSection title={t('agents.chat.panel.layers.pageContext')}>
                <PageContextPanel context={agentPageContext} />
              </DebugSection>
              <DebugSection title={t('agents.chat.panel.layers.runtimeContext')}>
                <AgentRuntimeContextPanel context={agentRuntimeContext} emptyText={t('agents.chat.panel.context.noSnapshot')} />
              </DebugSection>
              <ConversationContextPanel
                online={localAgentOnline}
                inspect={localAgentInspect}
                capabilities={localAgentCapabilities}
                loading={fetchingLocalAgentInspect || fetchingLocalAgentCapabilities}
                config={agentContextConfig}
                onRefresh={refreshAgentCatalogContext}
              />
            </div>
          )}
        </div>
      </section>

      <section className="ai-agent-panel-card ai-agent-panel-input-card">
        <div className="ai-agent-panel-card-header ai-agent-panel-input-header">
          <p className="ai-agent-panel-card-title">输入</p>
          <p className="min-w-0 truncate text-right text-[10px] text-muted-foreground/40">{t('agents.chat.inputHint')}</p>
        </div>
        <AgentComposer
          className={cn('ai-agent-panel-composer', draggingFiles && 'ai-agent-panel-composer--dragging')}
          onDragEnter={handleComposerDragEnter}
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={handleComposerDrop}
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={`${RESOURCE_UPLOAD_ACCEPT},.srt`}
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
          {composerAttachmentEntries.length > 0 && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {composerAttachmentEntries.map(({ attachment }) => (
                <ComposerAttachmentChip
                  key={attachmentKey(attachment)}
                  attachment={attachment}
                  onRemove={() => removeAttachment(attachment.id)}
                />
              ))}
            </div>
          )}
          <div className="relative">
            <AgentMentionEditor
              editorRef={inputRef}
              placeholder={t('agents.chat.inputPlaceholder')}
              disabled={loading || buildingSendDraft}
              onChange={(value) => {
                updateDraft({ input: value })
              }}
              onMentionState={updateMentionState}
              onEscape={() => setMentionRange(null)}
              onAcceptMention={() => {
                if (mentionRange && mentionResults.length > 0) {
                  insertResourceMention(mentionResults[0])
                  return true
                }
                return false
              }}
              onSubmit={send}
            />
            {draggingFiles && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-md border border-dashed border-primary/40 bg-primary/8 text-[11px] text-primary">
                {t('agents.chat.dropFilesHere')}
              </div>
            )}
            {mentionRange && mentionResults.length > 0 && (
              <div className="absolute bottom-full left-0 z-30 mb-1.5 w-full overflow-hidden rounded-md border border-border bg-background shadow-lg">
                <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
                  {t('shared.genInput.mention')}
                </div>
                <div className="max-h-48 overflow-auto">
                  {mentionResults.map((attachment) => (
                    <MentionResourceOption
                      key={attachmentKey(attachment)}
                      attachment={attachment}
                      onSelect={() => insertResourceMention(attachment)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <AgentComposerToolbar>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              <AgentComposerAction
                onClick={() => fileRef.current?.click()}
                disabled={uploading || loading || buildingSendDraft}
                aria-label={t('agents.chat.uploadAttachment')}
                title={t('agents.chat.uploadAttachment')}
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              </AgentComposerAction>
              <AgentComposerAction
                onClick={addMentionTrigger}
                disabled={loading || buildingSendDraft}
                aria-label={t('shared.genInput.mention')}
                title={t('shared.genInput.mention')}
              >
                <AtSign size={13} />
              </AgentComposerAction>
              {composerAttachments.length > 0 && (
                <Badge variant="secondary" className="max-w-24 truncate text-[10px]">{t('agents.chat.attachmentsCount', { count: composerAttachments.length })}</Badge>
              )}
              <Button
                type="button"
                size="xs"
                variant={debugBeforeSend ? 'secondary' : 'ghost'}
                onClick={() => setDebugBeforeSend(!debugBeforeSend)}
                className="h-7 px-2 text-[10px]"
                title={t('agents.chat.previewPayload')}
              >
                <Eye size={11} />
                {t('agents.chat.debugPreview')}
              </Button>
            </div>
            <AgentComposerSubmit
              type={canStopLocalRun ? 'button' : 'submit'}
              running={canStopLocalRun}
              disabled={canStopLocalRun ? stoppingLocalRun : !canSend}
              label={canStopLocalRun ? t('agents.chat.stop') : debugBeforeSend ? t('agents.chat.preview') : t('common.send')}
              onClick={canStopLocalRun ? stopActiveLocalRun : undefined}
            >
              {stoppingLocalRun
                ? <Loader2 size={15} className="animate-spin" />
                : canStopLocalRun
                  ? <CircleStop size={15} />
                  : buildingSendDraft
                    ? <Loader2 size={15} className="animate-spin" />
                    : debugBeforeSend ? <Eye size={15} /> : <Send size={15} />}
            </AgentComposerSubmit>
          </AgentComposerToolbar>
        </AgentComposer>
      </section>
    </AgentMain>
  )
}

// ── Conversation list ─────────────────────────────────────────────────────────

function conversationDisplayTitle(conv: Conversation, t: ReturnType<typeof useTranslation>['t']) {
  const title = conv.title.trim()
  if (!title) return t('agents.chat.newConversation')
  if (title === t('agents.chat.aiAssistant')) return t('agents.chat.newConversation')
  return title
}

function ConversationList({
  conversations,
  onSelect,
  onNew,
  onDelete,
  onCollapse,
  onRestoreLocalThread,
}: {
  conversations: Conversation[]
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onCollapse: () => void
  onRestoreLocalThread: (threadId: string) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const localRuntimeEnabled = true
  const [restoringThreadId, setRestoringThreadId] = useState<string | null>(null)
  const { data: localThreads = [], isFetching: fetchingLocalThreads, refetch: refetchLocalThreads } = useQuery<AgentThreadSummary[]>({
    queryKey: ['local-agent-threads', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listThreads().then((r) => r.threads)
    },
    enabled: localRuntimeEnabled,
    retry: false,
  })

  function formatDate(ts: number) {
    const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
    return formatAgentDate(ts, locale)
  }

  async function restoreThread(threadId: string) {
    setRestoringThreadId(threadId)
    try {
      await onRestoreLocalThread(threadId)
    } finally {
      setRestoringThreadId(null)
    }
  }

  return (
    <AgentMain>
      <AgentHeader>
        <AgentHeaderContent>
          <div className="ai-agent-panel-title-row">
            <Button size="icon-sm" variant="ghost" onClick={onCollapse} aria-label={t('agents.chat.collapseAssistant')} title={t('agents.chat.collapseAssistant')} className="ai-agent-panel-header-collapse">
              <ChevronRight size={14} />
            </Button>
            <AgentTitle>{t('agents.chat.aiAssistant')}</AgentTitle>
          </div>
        </AgentHeaderContent>
        <AgentHeaderActions>
          <Button size="sm" variant="outline" onClick={onNew} className="shrink-0">
            <Plus size={13} /> {t('agents.chat.newConversation')}
          </Button>
        </AgentHeaderActions>
      </AgentHeader>
      <AgentBody>
        <ScrollArea className="h-full">
        {conversations.length === 0 ? (
          <AgentEmpty className="min-h-0 py-12">
            <p className="text-sm font-medium text-foreground">{t('agents.chat.noConversations')}</p>
          </AgentEmpty>
        ) : (
          <AgentSidebarSection>
            {conversations.map((conv) => (
              <div key={conv.id} className="group relative">
                <AgentConversationItem
                  onClick={() => onSelect(conv.id)}
                  title={conversationDisplayTitle(conv, t)}
                  description={conv.messages[conv.messages.length - 1]?.content.slice(0, 54) ?? ''}
                  meta={formatDate(conv.updatedAt)}
                  className="pr-10"
                />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                  className="absolute bottom-2 right-2 h-5 w-5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label={t('agents.chat.deleteConversation')}
                >
                  <X size={11} />
                </Button>
              </div>
            ))}
          </AgentSidebarSection>
        )}
        <AgentSidebarSection>
          <div className="mb-1 flex items-center justify-between px-1">
            <AgentSidebarTitle className="px-0">
              <span className="inline-flex items-center gap-1"><History size={11} /> {t('agents.chat.localRuntime')}</span>
            </AgentSidebarTitle>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => refetchLocalThreads()}
              className="h-5 px-1 text-[10px] text-muted-foreground"
            >
              <RefreshCw size={10} className={fetchingLocalThreads ? 'animate-spin' : ''} />
            </Button>
          </div>
          {localThreads.length === 0 ? (
            <p className="px-1 text-[10px] text-muted-foreground">{t('agents.chat.localRuntimeThreadsEmpty')}</p>
          ) : localThreads.map((thread) => (
            <AgentConversationItem
              key={thread.id}
              onClick={() => restoreThread(thread.id)}
              title={localThreadTitle(thread, t)}
              description={[
                t('agents.chat.messagesCount', { count: thread.messageCount }),
                thread.projectId ? t('agents.chat.panel.drafts.projectBadge', { id: thread.projectId }) : null,
              ].filter(Boolean).join(' · ')}
              meta={restoringThreadId === thread.id ? t('agents.chat.restoring') : formatAgentDate(thread.updatedAt, i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US')}
            />
          ))}
        </AgentSidebarSection>
        </ScrollArea>
      </AgentBody>
    </AgentMain>
  )
}

// ── Built-in chat ─────────────────────────────────────────────────────────────

function BuiltinChat({ userId, onCollapse }: { userId: string; onCollapse: () => void }) {
  const { t } = useTranslation()
  const {
    getConversations,
    getActiveConversationId,
    createConversation,
    setActiveConversation,
    deleteConversation,
    deleteConversations,
    addMessage,
    updateConversationTitle,
  } = useAgentStore()
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const attachPageTaskConversation = useAgentSessionStore((s) => s.attachPageTaskConversation)
  const setLocalThreadId = useAgentSessionStore((s) => s.setLocalThreadId)

  const conversations = getConversations(userId)
  const activeConversationId = getActiveConversationId(userId)
  const activeConv = conversations.find((c) => c.id === activeConversationId) ?? null
  const activeTask = useMemo(() => {
    if (!activeConv) return null
    const tasks = Object.values(pageTasks).filter((task) => task.conversationId === activeConv.id)
    const activeTasks = tasks.filter((task) => task.status === 'queued' || task.status === 'claimed' || task.status === 'running')
    const ordered = (list: typeof tasks) => [...list].sort((a, b) => a.updatedAt - b.updatedAt)
    return ordered(activeTasks).at(-1) ?? ordered(tasks).at(-1) ?? null
  }, [activeConv?.id, pageTasks])

  function handleNew() {
    createConversation(userId)
  }

  async function handleRestoreLocalThread(threadId: string) {
    const sessionState = useAgentSessionStore.getState()
    const existingConvId = conversationIdForLocalThread({
      threadId,
      localThreadIdsByConversation: sessionState.localThreadIdsByConversation,
      conversationRuntimes: sessionState.conversationRuntimes,
    })
    if (existingConvId && conversations.some((conversation) => conversation.id === existingConvId)) {
      setActiveConversation(userId, existingConvId)
      return
    }

    const thread = await localAgentClient.getThread(threadId)
    const convId = createConversation(userId)
    const restoredLabel = t('agents.chat.panel.runtime.restoredLocalRuntime')
    updateConversationTitle(userId, convId, localThreadTitle(thread, t))
    const restoredMessages = await Promise.all(
      thread.messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => restoredChatMessageFromLocalMessage(message, restoredLabel)),
    )
    for (const message of restoredMessages) {
      addMessage(userId, convId, message)
    }
    setLocalThreadId(convId, thread.id)
    setActiveConversation(userId, convId)
  }

  useEffect(() => {
    let pending = consumeAgentPanelDraft()
    while (pending?.message?.trim()) {
      const convId = pending.newConversation ? createConversation(userId) : (getActiveConversationId(userId) ?? createConversation(userId))
      if (pending.title) updateConversationTitle(userId, convId, pending.title)
      setActiveConversation(userId, convId)
      if (pending.requestId) attachPageTaskConversation(pending.requestId, convId)
      pending = consumeAgentPanelDraft()
    }
  }, [attachPageTaskConversation, createConversation, getActiveConversationId, setActiveConversation, updateConversationTitle, userId])

  useEffect(() => {
    function handleDraft(event: Event) {
      const detail = (event as CustomEvent<AgentPanelDraftPayload>).detail
      if (!detail?.message?.trim()) return
      const convId = detail.newConversation ? createConversation(userId) : (getActiveConversationId(userId) ?? createConversation(userId))
      if (detail.title) updateConversationTitle(userId, convId, detail.title)
      setActiveConversation(userId, convId)
      if (detail.requestId) attachPageTaskConversation(detail.requestId, convId)
    }

    window.addEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
    return () => window.removeEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
  }, [attachPageTaskConversation, createConversation, getActiveConversationId, setActiveConversation, updateConversationTitle, userId])

  return (
    <AgentShell density="compact" className="ai-agent-panel-shell">
      {activeConv ? (
        <ChatView
          key={activeConv.id}
          conv={activeConv}
          conversations={conversations}
          userId={userId}
          onBack={() => setActiveConversation(userId, null)}
          onCollapse={onCollapse}
          onSelectConversation={(id) => setActiveConversation(userId, id)}
          onNewConversation={handleNew}
          onCloseConversation={(id) => deleteConversation(userId, id)}
          onCloseConversations={(ids) => deleteConversations(userId, ids)}
          externalTask={activeTask}
          pageToolRequestId={activeTask?.requestId}
        />
      ) : (
        <ConversationList
          conversations={conversations}
          onSelect={(id) => setActiveConversation(userId, id)}
          onNew={handleNew}
          onDelete={(id) => deleteConversation(userId, id)}
          onCollapse={onCollapse}
          onRestoreLocalThread={handleRestoreLocalThread}
        />
      )}
    </AgentShell>
  )
}

// ── AIAgentPanel ──────────────────────────────────────────────────────────────

export function AIAgentPanel() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 960 : true)
  const [panelWidth, setPanelWidth] = useState(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
    return viewportWidth < 1280 ? 360 : 420
  })
  const [dockLayout, setDockLayout] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 960 : true)
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelResizeFrameRef = useRef<number | null>(null)
  const panelResizeStateRef = useRef<{ startX: number; startWidth: number; latestWidth: number; maxWidth: number } | null>(null)

  useEffect(() => {
    function handleDraft() {
      setOpen(true)
    }

    window.addEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
    return () => window.removeEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
  }, [])

  useEffect(() => {
    function updateDockLayout() {
      const viewportWidth = window.innerWidth
      setDockLayout(viewportWidth >= 960)
      setPanelWidth((current) => viewportWidth < 1280 ? Math.min(current, 360) : current)
    }

    updateDockLayout()
    window.addEventListener('resize', updateDockLayout)
    return () => window.removeEventListener('resize', updateDockLayout)
  }, [])

  function toggleOpen() {
    setOpen((v) => {
      const next = !v
      return next
    })
  }

  const startPanelResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!open || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startWidth = panelWidth
    const startX = event.clientX
    const viewportWidth = window.innerWidth
    const maxWidth = viewportWidth >= 1440
      ? 760
      : Math.min(520, Math.max(320, Math.round(viewportWidth * 0.42)))
    panelResizeStateRef.current = { startX, startWidth, latestWidth: startWidth, maxWidth }
    document.body.classList.add('ai-agent-panel-resizing', 'ai-agent-panel-resizing--x')

    const onMove = (moveEvent: PointerEvent) => {
      const state = panelResizeStateRef.current
      if (!state) return
      const delta = state.startX - moveEvent.clientX
      state.latestWidth = clampNumber(state.startWidth + delta, 320, state.maxWidth)
      if (panelResizeFrameRef.current !== null) return
      panelResizeFrameRef.current = window.requestAnimationFrame(() => {
        panelResizeFrameRef.current = null
        const latest = panelResizeStateRef.current
        if (!latest) return
        panelRef.current?.style.setProperty('--ai-agent-panel-width', `${latest.latestWidth}px`)
      })
    }

    const onUp = () => {
      const finalWidth = panelResizeStateRef.current?.latestWidth ?? panelWidth
      if (panelResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(panelResizeFrameRef.current)
        panelResizeFrameRef.current = null
      }
      panelRef.current?.style.setProperty('--ai-agent-panel-width', `${finalWidth}px`)
      setPanelWidth(finalWidth)
      panelResizeStateRef.current = null
      document.body.classList.remove('ai-agent-panel-resizing', 'ai-agent-panel-resizing--x')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [open, panelWidth])

  return (
    <div ref={panelRef} className={cn(
      'ai-agent-panel z-20 flex min-h-0 min-w-0 bg-background flex-col overflow-hidden transition-[width] duration-200',
      dockLayout
        ? cn(
            'relative h-full shrink-0 border-l border-border',
            open ? 'w-[var(--ai-agent-panel-width)]' : 'ai-agent-panel--collapsed-dock w-11',
          )
        : cn(
            'fixed right-3 top-3 h-[calc(100vh-1.5rem)] rounded-md border border-border shadow-lg',
            open ? 'w-[min(420px,calc(100vw-1.5rem))]' : 'w-11',
          ),
    )} style={{ ['--ai-agent-panel-width' as string]: `${panelWidth}px` }}>
      {dockLayout && open && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize assistant panel"
          className="absolute left-0 top-0 z-20 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/30"
          onPointerDown={startPanelResize}
        >
          <div className="absolute left-1/2 top-1/2 h-10 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/80" />
        </div>
      )}
      {!open && (
        <button
          onClick={toggleOpen}
          title={t('agents.chat.aiAssistant')}
          aria-label={t('agents.chat.aiAssistant')}
          className="ai-agent-panel-collapsed-toggle"
        >
          <Bot size={16} className="text-foreground" />
        </button>
      )}

      {open && (
        <div className="flex flex-col flex-1 min-h-0">
          <BuiltinChat userId={userId} onCollapse={toggleOpen} />
        </div>
      )}
    </div>
  )
}
