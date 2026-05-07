import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Bot, ChevronRight, Send, Loader2,
  Plus, ArrowLeft, Copy, Check, X, ClipboardCheck, CircleStop,
  Image, Video, FileText, Mic, File, Workflow, ShieldCheck,
  Sparkles, Search, ListChecks, Upload, Eye, Wand2,
  Trash2, RefreshCw, History, Database, Save, FolderOpen, GripHorizontal,
} from 'lucide-react'
import { api } from '@/lib/api'
import { getAPIBaseURL, getAPIV1BaseURL } from '@/lib/config'
import { AGENT_PANEL_DRAFT_EVENT, consumeAgentPanelDraft, notifyAgentPanelRunSettled, type AgentPanelDraftPayload } from '@/lib/agentPanelBridge'
import { publicModelLabel } from '@/lib/modelDisplay'
import { buildCommandFirstClientInput, isDiagnosticAgentCommand, normalizeAgentCommandMessage } from '@/lib/agentCommandInput'
import { syncRuntimeModelConfig } from '@/lib/runtimeChat'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import {
  formatLocalAgentAssistantContent,
  LocalAgentWorkflowPanel,
} from '@/components/agent/localRuntime'
import {
  canStartLocalAgentFromClient,
  localAgentClient,
  type AgentHealth,
  type AgentClientInput,
  type AgentDraft,
  type AgentDraftApplyPreview,
  type AgentDraftKind,
  type AgentDraftStatus,
  type AgentManifest,
  type AgentMemory,
  type AgentMemoryKind,
  type AgentMemoryScope,
  type AgentRun,
  type AgentRunPreview,
  type AgentThread as LocalAgentThread,
  type AgentThreadSummary,
} from '@/lib/localAgentClient'
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
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import {
  useAgentStore,
  type ChatMessage,
  type ChatRunActivity,
  type Conversation,
  type AgentAttachment,
  type AgentSettings,
  type AgentWorkMode,
  type AgentPermissionMode,
} from '@/store/agentStore'
import { useUserStore } from '@/store/userStore'
import type { Project, PublicModel, RawResource } from '@/types'

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

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
          return <code key={i} className="px-1 py-0.5 rounded bg-muted/60 text-xs font-mono">{part.slice(1, -1)}</code>
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
          return <strong key={i}>{part.slice(2, -2)}</strong>
        return part.split('\n').map((line, j, arr) => (
          <React.Fragment key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</React.Fragment>
        ))
      })}
    </>
  )
}

function MarkdownContent({ text }: { text: string }) {
  const segments = text.split(/(```[\w]*\n[\s\S]*?```)/g)
  return (
    <div>
      {segments.map((seg, i) => {
        const m = seg.match(/^```([\w]*)\n([\s\S]*?)```$/)
        if (m) return <CodeBlock key={i} lang={m[1]} code={m[2].trimEnd()} />
        return <span key={i}><InlineText text={seg} /></span>
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

function resourceUrl(resource: Pick<RawResource, 'url' | 'direct_url'>) {
  const url = resource.direct_url || resource.url
  if (!url) return ''
  if (/^(https?:|blob:|data:)/i.test(url)) return url
  if (url.startsWith('/api/v1/')) return `${getAPIBaseURL()}${url}`
  if (url.startsWith('/')) return `${getAPIV1BaseURL()}${url}`
  return url
}

function attachmentKind(mimeType: string, fallbackName = ''): AgentAttachment['type'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('text/') || /\.(txt|md|json|csv|srt)$/i.test(fallbackName)) return 'text'
  return 'file'
}

function attachmentFromResource(resource: RawResource): AgentAttachment {
  return {
    id: `res-${resource.ID}`,
    name: resource.name,
    type: attachmentKind(resource.mime_type, resource.name),
    mimeType: resource.mime_type,
    size: resource.size,
    url: resourceUrl(resource),
    resourceId: resource.ID,
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
  const url = attachment.url
  return (
    <div className={cn(
      'overflow-hidden rounded-md border border-border bg-background/70',
      compact ? 'w-28' : 'w-full'
    )}>
      {attachment.type === 'image' && url ? (
        <AuthedImage src={url} alt={attachment.name} className="h-20 w-full object-cover bg-muted" />
      ) : attachment.type === 'video' && url ? (
        <AuthedVideo src={url} className="h-20 w-full object-cover bg-black" muted controls />
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function rawResourceFromUnknown(value: unknown): RawResource | undefined {
  if (!isRecord(value)) return undefined
  const id = Number(value.ID ?? value.id)
  const rawType = value.type
  if (!Number.isFinite(id) || id <= 0) return undefined
  if (rawType !== 'image' && rawType !== 'video' && rawType !== 'audio' && rawType !== 'text' && rawType !== 'file') return undefined
  const type: RawResource['type'] = rawType
  return {
    ID: id,
    owner_id: Number(value.owner_id ?? value.ownerId ?? 0),
    type,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : `resource-${id}`,
    url: typeof value.url === 'string' && value.url ? value.url : `/api/v1/resources/${id}/file`,
    size: typeof value.size === 'number' ? value.size : 0,
    mime_type: typeof value.mime_type === 'string'
      ? value.mime_type
      : typeof value.mimeType === 'string'
        ? value.mimeType
        : type === 'video' ? 'video/mp4' : type === 'image' ? 'image/png' : 'application/octet-stream',
    ...(typeof value.direct_url === 'string' ? { direct_url: value.direct_url } : {}),
    ...(typeof value.storage_backend === 'string' ? { storage_backend: value.storage_backend } : {}),
    ...(typeof value.storage_key === 'string' ? { storage_key: value.storage_key } : {}),
  }
}

function collectGeneratedMediaHints(value: unknown, resources: Map<number, RawResource>, ids: Set<number>, depth = 0): void {
  if (value === undefined || value === null || depth > 7) return
  if (Array.isArray(value)) {
    for (const item of value) collectGeneratedMediaHints(item, resources, ids, depth + 1)
    return
  }
  if (!isRecord(value)) return

  const resource = rawResourceFromUnknown(value)
  if (resource && (resource.type === 'image' || resource.type === 'video')) {
    resources.set(resource.ID, resource)
  }

  for (const key of ['output_resource', 'outputResource', 'media']) {
    const nested = value[key]
    const nestedResource = rawResourceFromUnknown(nested)
    if (nestedResource && (nestedResource.type === 'image' || nestedResource.type === 'video')) {
      resources.set(nestedResource.ID, nestedResource)
    } else {
      collectGeneratedMediaHints(nested, resources, ids, depth + 1)
    }
  }

  for (const key of ['output_resources', 'outputResources']) {
    collectGeneratedMediaHints(value[key], resources, ids, depth + 1)
  }

  const outputId = Number(value.output_resource_id ?? value.outputResourceId)
  if (Number.isInteger(outputId) && outputId > 0) ids.add(outputId)
  const outputIds = value.output_resource_ids ?? value.outputResourceIds
  if (Array.isArray(outputIds)) {
    for (const id of outputIds) {
      const numeric = Number(id)
      if (Number.isInteger(numeric) && numeric > 0) ids.add(numeric)
    }
  }

  const data = value.data
  if (data !== value) collectGeneratedMediaHints(data, resources, ids, depth + 1)
  const job = value.job
  if (job !== value) collectGeneratedMediaHints(job, resources, ids, depth + 1)
}

async function generatedAttachmentsFromRun(run: AgentRun): Promise<AgentAttachment[]> {
  const resources = new Map<number, RawResource>()
  const ids = new Set<number>()
  for (const step of run.steps ?? []) {
    collectGeneratedMediaHints(step.result, resources, ids)
  }
  for (const id of ids) {
    if (!resources.has(id)) {
      const found = await fetchResourceById(id)
      if (found && (found.type === 'image' || found.type === 'video')) resources.set(id, found)
    }
  }
  return Array.from(resources.values())
    .filter((resource) => resource.type === 'image' || resource.type === 'video')
    .map((resource) => ({
      ...attachmentFromResource(resource),
      id: `generated-${resource.ID}`,
    }))
}

async function fetchResourceById(id: number): Promise<RawResource | undefined> {
  try {
    const { data } = await api.get<RawResource[] | { items: RawResource[] }>('/resources', {
      params: { page: 1, page_size: 200, type: 'image,video' },
    })
    const resources = Array.isArray(data) ? data : data.items
    return resources.find((resource) => resource.ID === id)
  } catch {
    return undefined
  }
}

function withGeneratedAttachments(attachments: AgentAttachment[]): { attachments?: AgentAttachment[] } {
  return attachments.length > 0 ? { attachments } : {}
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
  mode: AgentWorkMode
  permissionMode: AgentPermissionMode
  autoPlan: boolean
  project: Project | null
  recentResources: RawResource[]
  includeProjectContext: boolean
  includeRecentResources: boolean
}) {
  const modeGuidance: Record<AgentWorkMode, string> = {
    chat: '以项目超级员工的方式直接协作，先给可执行建议，再补必要解释。',
    plan: '先拆解目标、依赖、风险和下一步行动；涉及执行动作时给出清晰计划。',
    create: '偏向产出可直接使用的创意、文案、镜头、资产或任务草稿。',
    review: '优先发现问题、缺口、风险和返工点，并给出修改建议。',
  }
  const permissionGuidance: Record<AgentPermissionMode, string> = {
    ask: '涉及改动项目数据、创建任务、生成成本或外部调用时，先请求确认。',
    suggest: '只提出建议和草稿，不默认执行项目改动。',
    auto: '可在低风险范围内主动推进，但必须说明做了什么和为什么。',
  }
  const sections = [
    '[Agent 工作模式]',
    modeGuidance[options.mode],
    `[权限边界] ${permissionGuidance[options.permissionMode]}`,
  ]
  if (options.autoPlan) {
    sections.push('[计划要求] 对复杂请求先给 2-5 步简短计划；执行后同步状态和结果。')
  }
  if (options.includeProjectContext && options.project) {
    sections.push(`[当前项目]\n名称：${options.project.name}\n状态：${options.project.status || '未指定'}\n简介：${options.project.description || '无'}`)
  }
  if (options.includeRecentResources && options.recentResources.length > 0) {
    sections.push(`[最近素材]\n${options.recentResources.slice(0, 8).map((r) => `- #${r.ID} ${r.name} (${r.type}, ${formatBytes(r.size)})`).join('\n')}`)
  }
  return sections.join('\n\n')
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
    provider?: string
  }
  agent: {
    id: number | null
    name?: string
    soul?: string
  }
  settings: Pick<AgentSettings, 'mode' | 'permissionMode' | 'includeProjectContext' | 'includeRecentResources' | 'autoPlan'>
  contextLabels: string[]
  context: {
    project?: Pick<Project, 'ID' | 'name' | 'status' | 'description'>
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
    title: string
    projectId?: number
    clientInput?: AgentClientInput
    agentManifest?: AgentManifest
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

function compactProject(project: Project | null): AgentSendDraft['context']['project'] | undefined {
  if (!project) return undefined
  return {
    ID: project.ID,
    name: project.name,
    status: project.status,
    description: project.description,
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
    hints: options.projectId ? { projectId: options.projectId } : undefined,
  })
  return input
}

function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function buildDebugHttpRequests(options: {
  modelId: number | null
  modelName?: string
  messages: AgentSendDraft['outbound']['messages']
  localRuntime?: AgentSendDraft['localRuntime']
}): DebugHttpRequest[] {
  const baseURL = localAgentClient.baseURL
  const requests: DebugHttpRequest[] = []
  if (options.modelId) {
    requests.push({
      id: 'local-save-model-config',
      label: 'Sync runtime model config',
      method: 'POST',
      url: `${baseURL}/model-config`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        modelConfigId: options.modelId,
        model: options.modelName ?? `model_config:${options.modelId}`,
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
      label: 'Load existing local thread',
      method: 'GET',
      url: `${baseURL}/threads/${encodeURIComponent(threadId)}`,
      note: 'If this saved thread is missing, the client creates a new local thread instead.',
    }]
    : [{
      id: 'local-create-thread',
      label: 'Create local thread',
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
      label: 'Append user message',
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
      label: 'Create local runtime run',
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
      label: 'Poll run status',
      method: 'GET',
      url: `${baseURL}/runs/{runId}`,
      note: 'Repeated until completed, completed_with_warnings, requires_action, or failed.',
    },
    {
      id: 'local-final-thread',
      label: 'Fetch final local thread',
      method: 'GET',
      url: `${baseURL}/threads/${resolvedThreadId}`,
    },
  )
  return requests.map((request) => ({
    ...request,
    ...(request.body !== undefined ? { body: compactDebugValue(request.body) } : {}),
  }))
}

function LocalAgentWorkflow({
  run,
  approving = false,
  onApprove,
  onReject,
  onAnswerInput,
}: {
  run: AgentRun | null
  approving?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: { choiceIds?: string[]; text?: string }) => void
}) {
  return (
    <LocalAgentWorkflowPanel
      run={run}
      approving={approving}
      onApprove={onApprove}
      onReject={onReject}
      onAnswerInput={onAnswerInput}
      approvalDetails={(approval) => (
        <>
          {approval.permission && (
            <p className="mt-0.5 truncate text-[9px] text-muted-foreground/70">permission: {approval.permission}</p>
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
              <h2 className="text-sm font-semibold text-foreground">Send debug preview</h2>
              <Badge variant="secondary" className="text-[10px]">{draft.route}</Badge>
              {primaryRequest && <Badge variant="outline" className="text-[10px]">{primaryRequest.method}</Badge>}
            </div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {primaryRequest ? primaryRequest.url : draft.id}
            </p>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onCancel} disabled={sending} aria-label="Close debug preview">
            <X size={14} />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid gap-2 md:grid-cols-4">
            <DebugSummaryItem label="Model" value={[draft.model.provider, draft.model.name ?? draft.model.id].filter(Boolean).join(' / ') || 'none'} />
            <DebugSummaryItem label="Agent" value={draft.agent.name ?? 'No agent'} />
            <DebugSummaryItem label="Mode" value={`${draft.settings.mode} · ${draft.settings.permissionMode}`} />
            <DebugSummaryItem label="Requests" value={String(draft.httpRequests.length)} />
          </div>

          {draft.warnings.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
              <div className="mb-1 font-medium text-amber-800 dark:text-amber-300">Warnings</div>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}

          <DebugSection title="Final HTTP requests">
            <div className="space-y-2">
              {draft.httpRequests.map((request, index) => (
                <DebugHttpRequestCard key={request.id} request={request} index={index} />
              ))}
            </div>
          </DebugSection>

          {preview?.context && (
            <DebugSection title="Context">
              <div className="grid gap-2 text-[11px] md:grid-cols-3">
                <DebugSummaryItem label="Route" value={preview.context.route.pathname} />
                <DebugSummaryItem label="Project" value={preview.context.project ? `#${preview.context.project.id} ${preview.context.project.name ?? ''}`.trim() : 'none'} />
                <DebugSummaryItem label="Memories" value={String(preview.context.memories.length)} />
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
            <DebugSection title="Skills">
              {preview.skills.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">No enabled skills.</div>
              ) : (
                <div className="space-y-1.5">
                  {preview.skills.map((skill) => (
                    <div key={skill.id} className="rounded-md border border-border bg-muted/20 p-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{skill.name}</span>
                        <Badge variant="outline" className="text-[9px]">p{skill.resolvedPriority}</Badge>
                      </div>
                      <p className="mt-0.5 text-muted-foreground">{skill.description || skill.compiledInstruction || '(no instruction)'}</p>
                    </div>
                  ))}
                </div>
              )}
            </DebugSection>
          )}

          {preview?.policy && (
            <DebugSection title="Policy">
              <div className="grid gap-2 text-[11px] md:grid-cols-4">
                <DebugSummaryItem label="Approval mode" value={preview.policy.approvalMode} />
                <DebugSummaryItem label="Max tool calls" value={String(preview.policy.maxToolCalls)} />
                <DebugSummaryItem label="Max iterations" value={String(preview.policy.maxIterations)} />
                <DebugSummaryItem label="File bytes" value={preview.policy.allowFileBytes ? 'allowed' : 'blocked'} />
              </div>
              <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 text-[10px] font-medium text-foreground">Runtime boundaries</div>
                  <div className="space-y-0.5 text-[10px] text-muted-foreground">
                    <div>network: {preview.policy.allowNetwork ? 'allowed' : 'blocked'}</div>
                    <div>file bytes: {preview.policy.allowFileBytes ? 'allowed' : 'blocked'}</div>
                    <div>cost limit: {preview.policy.costLimit ? `${preview.policy.costLimit.amount} ${preview.policy.costLimit.currency}` : 'none'}</div>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 text-[10px] font-medium text-foreground">Manifest grants</div>
                  <div className="space-y-0.5 text-[10px] text-muted-foreground">
                    {(preview.agentManifest?.tools ?? []).slice(0, 8).map((grant) => (
                      <div key={grant.name}>{grant.name} · {grant.mode} · {grant.approval ?? 'default'}</div>
                    ))}
                    {(preview.agentManifest?.tools ?? []).length === 0 && <div>none</div>}
                  </div>
                </div>
              </div>
            </DebugSection>
          )}

          {preview?.tools && (
            <DebugSection title="Tools">
              <div className="grid gap-2 md:grid-cols-3">
                <DebugSummaryItem label="Available" value={String(preview.tools.available.length)} />
                <DebugSummaryItem label="Blocked" value={String(preview.tools.blocked.length)} />
                <DebugSummaryItem label="Discovered" value={String(preview.tools.discovered.length)} />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 text-[10px] font-medium text-foreground">Available tools</div>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    {preview.tools.available.slice(0, 8).map((tool) => (
                      <div key={tool.name}>{tool.name} · {tool.risk ?? 'unknown'} · {tool.approval}</div>
                    ))}
                    {preview.tools.available.length === 0 && <div>none</div>}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 text-[10px] font-medium text-foreground">Blocked tools</div>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    {preview.tools.blocked.slice(0, 8).map((tool) => (
                      <div key={tool.name}>{tool.name} · {tool.unavailableReason ?? 'blocked'}</div>
                    ))}
                    {preview.tools.blocked.length === 0 && <div>none</div>}
                  </div>
                </div>
              </div>
            </DebugSection>
          )}

          {preview && (
            <DebugSection title="Agentic Loop Preview">
              <div className="space-y-2 text-[11px]">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="font-medium text-foreground">{preview.message}</div>
                  <div className="mt-1 text-muted-foreground">
                    project: {preview.currentProjectId ?? 'none'} · memories: {preview.memoryCount} · tool calls: {preview.toolCalls.length} · sandbox: {preview.policy?.sandboxMode ? 'on' : 'off'}
                  </div>
                </div>
                <div className="space-y-1">
                  {preview.toolCalls.length === 0 ? (
                    <div className="rounded-md border border-border bg-background px-2 py-1.5 text-muted-foreground">No immediate tool calls predicted.</div>
                  ) : preview.toolCalls.map((call, index) => (
                    <div key={`${call.name}-${index}`} className="rounded-md border border-border bg-background px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{index + 1}. {call.name}</span>
                        <Badge variant="outline" className="text-[9px]">tool</Badge>
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
            <DebugSection title="Approvals">
              <div className="space-y-2 text-[11px]">
                {draft.localRuntime && (
                  <div className="grid gap-2 md:grid-cols-3">
                    <DebugSummaryItem label="Thread" value={draft.localRuntime.threadId ?? 'new thread'} />
                    <DebugSummaryItem label="Mode" value={draft.localRuntime.diagnosticCommand ? 'diagnostic' : 'conversation'} />
                    <DebugSummaryItem label="Manifest" value="default" />
                  </div>
                )}
                {draft.localRuntime?.previewError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                    {draft.localRuntime.previewError}
                  </div>
                )}
                {pendingApprovals.length > 0 ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                    <div className="mb-1 font-medium text-amber-800 dark:text-amber-300">Approvals before execution</div>
                    <div className="space-y-1">
                      {pendingApprovals.map((approval) => (
                        <div key={approval.id} className="rounded border border-amber-500/20 bg-background/60 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{approval.toolName}</span>
                            <Badge variant="warning" className="text-[9px]">{approval.risk ?? approval.status}</Badge>
                          </div>
                          <p className="mt-0.5 text-muted-foreground">{approval.reason}</p>
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
                    No approval required before execution.
                  </div>
                )}
              </div>
            </DebugSection>
          )}

          <DebugSection title="Outbound messages">
            <div className="space-y-2">
              {draft.outbound.messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className="rounded-md border border-border bg-muted/20">
                  <div className="flex items-center justify-between border-b border-border/60 px-2 py-1">
                    <Badge variant="outline" className="text-[9px]">{message.role}</Badge>
                    <span className="text-[9px] text-muted-foreground">{message.content.length} chars</span>
                  </div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[10px] leading-relaxed text-foreground">
                    {message.content || '(empty)'}
                  </pre>
                </div>
              ))}
            </div>
          </DebugSection>

          {preview?.promptPreview && (
            <DebugSection title="Compiled prompt">
              <div className="space-y-2">
                {preview.promptPreview.debugParts.map((part) => (
                  <div key={part.id} className="rounded-md border border-border bg-muted/20">
                    <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1">
                      <Badge variant="outline" className="text-[9px]">{part.kind}</Badge>
                      <span className="text-[10px] font-medium text-foreground">{part.title}</span>
                    </div>
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[10px] text-muted-foreground">
                      {part.content || '(empty)'}
                    </pre>
                  </div>
                ))}
              </div>
            </DebugSection>
          )}

          <DebugSection title="Raw payload">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 text-[10px] leading-relaxed">
              {raw}
            </pre>
          </DebugSection>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button type="button" size="sm" variant="ghost" onClick={copyRaw} className="h-8 text-xs">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={sending}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={onConfirm} disabled={sending}>
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Send
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
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-2.5 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-background text-[10px] font-medium text-muted-foreground">
          {index + 1}
        </span>
        <Badge variant={request.conditional ? 'secondary' : 'outline'} className="text-[9px]">
          {request.conditional ? 'conditional' : request.method}
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
              <div className="mb-1 text-[9px] font-medium uppercase tracking-normal text-muted-foreground">Headers</div>
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded border border-border/70 bg-muted/20 p-2 text-[10px]">
                {safeJSONStringify(request.headers)}
              </pre>
            </div>
          )}
          {request.body !== undefined && (
            <div className={request.headers ? '' : 'md:col-span-2'}>
              <div className="mb-1 text-[9px] font-medium uppercase tracking-normal text-muted-foreground">Body</div>
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

function workflowStepTitle(step: AgentRun['steps'][number]) {
  if (step.type === 'tool_call') return step.toolName ?? 'Tool call'
  return 'Assistant message'
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
const CONTEXT_PANE_HEIGHT_KEY = 'ai-panel-context-pane-height'
const CONTEXT_PANE_DEFAULT_HEIGHT = 220
const CONTEXT_PANE_MIN_HEIGHT = 96
const CONTEXT_PANE_MAX_HEIGHT = 620

function isStoppableAgentRun(run: AgentRun | null | undefined): run is AgentRun {
  return !!run && STOPPABLE_AGENT_RUN_STATUSES.has(run.status)
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function readStoredNumber(key: string, fallback: number, min: number, max: number) {
  try {
    const parsed = Number(localStorage.getItem(key))
    if (!Number.isFinite(parsed)) return fallback
    return clampNumber(parsed, min, max)
  } catch {
    return fallback
  }
}

function writeStoredNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, String(Math.round(value)))
  } catch {}
}

function compactRunActivity(run: AgentRun): ChatRunActivity {
  const toolStepIds = new Set(run.steps.filter((step) => step.type === 'tool_call').map((step) => step.id))
  return {
    runId: run.id,
    threadId: run.threadId,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.failedAt ? { failedAt: run.failedAt } : {}),
    ...(run.error ? { error: run.error } : {}),
    ...(run.warnings?.length ? { warnings: run.warnings } : {}),
    steps: run.steps
      .filter((step) => step.type === 'tool_call')
      .map((step) => ({
        id: step.id,
        type: step.type,
        status: step.status,
        ...(step.title ? { title: step.title } : {}),
        ...(step.toolName ? { toolName: step.toolName } : {}),
        ...(step.args ? { args: step.args } : {}),
        ...(step.result !== undefined ? { result: step.result } : {}),
        ...(step.error ? { error: step.error } : {}),
        ...(step.sandboxed ? { sandboxed: step.sandboxed } : {}),
        createdAt: step.createdAt,
        ...(step.completedAt ? { completedAt: step.completedAt } : {}),
      })),
    events: (run.traceEvents ?? [])
      .filter((event) => (
        event.kind === 'reasoning'
        || event.kind === 'tool_call'
        || event.kind === 'model_call'
        || event.kind === 'context'
        || event.kind === 'memory'
        || event.kind === 'approval'
        || event.kind === 'input'
        || event.kind === 'assistant'
        || event.kind === 'error'
      ))
      .filter((event) => event.kind !== 'tool_call' || !event.stepId || !toolStepIds.has(event.stepId))
      .map((event) => ({
        id: event.id,
        kind: event.kind,
        title: event.title,
        status: event.status,
        ...(event.summary ? { summary: event.summary } : {}),
        ...(event.toolName ? { toolName: event.toolName } : {}),
        ...(event.stepId ? { stepId: event.stepId } : {}),
        ...(event.data !== undefined ? { data: event.data } : {}),
        createdAt: event.createdAt,
        ...(event.completedAt ? { completedAt: event.completedAt } : {}),
      })),
  }
}

function reasoningTextFromRun(run: AgentRun | null) {
  if (!run) return ''
  const textParts: string[] = []
  for (const event of run.traceEvents ?? []) {
    if (event.kind !== 'reasoning' && !(event.kind === 'model_call' && typeof event.title === 'string' && event.title.toLowerCase().includes('reasoning'))) continue
    const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
    const stream = data?.stream && typeof data.stream === 'object' ? data.stream as Record<string, unknown> : undefined
    const accumulated = typeof stream?.accumulated === 'string' ? stream.accumulated : undefined
    const delta = typeof stream?.delta === 'string' ? stream.delta : undefined
    if (accumulated) {
      textParts.length = 0
      textParts.push(accumulated)
      continue
    }
    if (delta) textParts.push(delta)
  }
  return textParts.join('').trim()
}

function ThinkingBubble({ run }: { run: AgentRun | null }) {
  const reasoning = reasoningTextFromRun(run)
  if (run && run.status !== 'in_progress' && !reasoning) return null
  return (
    <AgentChatMessage
      role="assistant"
      avatar={<Bot size={13} />}
      author="MovScript Agent"
      footer={(
        <Badge variant="outline" className="text-[9px] leading-4 px-1.5 py-0">
          思考中
        </Badge>
      )}
    >
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Loader2 size={11} className="animate-spin" />
          <span>思考中</span>
        </div>
        {reasoning ? <MarkdownContent text={reasoning} /> : <div className="text-[11px] text-muted-foreground">...</div>}
      </div>
    </AgentChatMessage>
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

function activitySummary(activity: ChatRunActivity) {
  const toolCount = activity.steps.length
  const completedCount = activity.steps.filter((step) => step.status === 'completed').length
  if (toolCount > 0) return `${completedCount}/${toolCount} tools`
  return activity.events.length > 0 ? `${activity.events.length} events` : 'no tool calls'
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
  title = 'Activity',
  defaultOpen = false,
  className,
}: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  title?: string
  defaultOpen?: boolean
  className?: string
}) {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const data = activity ?? (run ? compactRunActivity(run) : undefined)
  if (!data) return null

  const items = [
    ...data.steps.map((step) => ({
      id: step.id,
      kind: 'tool',
      title: step.toolName ?? step.title ?? 'Tool call',
      status: step.status,
      time: formatActivityTime(step.createdAt, locale),
      duration: durationLabel(step.createdAt, step.completedAt),
      summary: step.error || (step.sandboxed ? 'sandboxed' : ''),
      args: step.args,
      result: step.result,
      error: step.error,
    })),
    ...data.events.map((event) => ({
      id: event.id,
      kind: event.kind,
      title: event.toolName ? `${event.title}: ${event.toolName}` : event.title,
      status: event.status,
      time: formatActivityTime(event.createdAt, locale),
      duration: durationLabel(event.createdAt, event.completedAt),
      summary: event.summary,
      args: undefined,
      result: event.data,
      error: event.status === 'failed' || event.status === 'blocked' ? event.summary : undefined,
    })),
  ].sort((a, b) => {
    const aTime = new Date((data.steps.find((step) => step.id === a.id)?.createdAt ?? data.events.find((event) => event.id === a.id)?.createdAt ?? '')).getTime()
    const bTime = new Date((data.steps.find((step) => step.id === b.id)?.createdAt ?? data.events.find((event) => event.id === b.id)?.createdAt ?? '')).getTime()
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
          <Badge variant={runStatusVariant(data.status)} className="text-[9px] leading-4 px-1.5 py-0">
            {data.status.replace(/_/g, ' ')}
          </Badge>
          <span className="text-[9px] text-muted-foreground">{activitySummary(data)}</span>
        </span>
      </summary>
      <div className="space-y-1.5 border-t border-border/70 px-2.5 py-2">
        {items.length === 0 ? (
          <div className="rounded border border-border/70 bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
            No tool calls were recorded for this run.
          </div>
        ) : items.map((item) => (
          <div key={item.id} className="rounded border border-border/70 bg-background px-2 py-1.5">
            <div className="flex min-w-0 items-start gap-1.5">
              <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', workflowDotClass(item.status))} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-medium text-foreground">{item.title}</span>
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[9px]', workflowStatusClass(item.status))}>
                    {item.status.replace(/_/g, ' ')}
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
                {item.args !== undefined && <ActivityJSONBlock label="Args" value={item.args} />}
                {item.result !== undefined && <ActivityJSONBlock label={item.error ? 'Error data' : 'Result'} value={item.result} />}
              </div>
            </div>
          </div>
        ))}
        {data.warnings?.length ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
            {data.warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}
        {data.error && (
          <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">
            {data.error}
          </div>
        )}
      </div>
    </details>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const { i18n } = useTranslation()
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const time = new Date(msg.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

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
          {msg.meta.mode && (
            <Badge variant="outline" className="text-[9px] leading-4 px-1.5 py-0">
              {msg.meta.mode}
            </Badge>
          )}
          {msg.meta.contextLabels?.map((label) => (
            <Badge key={label} variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">
              {label}
            </Badge>
          ))}
        </div>
      )}
    >
      {isUser ? msg.content : <MarkdownContent text={msg.content} />}
      {!isUser && msg.meta?.localRunActivity && (
        <RunActivityPanel activity={msg.meta.localRunActivity} title="Tool activity" />
      )}
      {msg.attachments && msg.attachments.length > 0 && (
        <div className={cn('mt-2 grid gap-1.5', msg.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {msg.attachments.map((attachment) => (
            <AttachmentPreview key={attachment.id} attachment={attachment} compact />
          ))}
        </div>
      )}
    </AgentChatMessage>
  )
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

function localThreadTitle(thread: Pick<AgentThreadSummary, 'title' | 'id' | 'messageCount'>) {
  return thread.title || `Local thread ${thread.id.slice(-6)}`
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

function diffRows(currentValue: unknown, proposedValue: unknown) {
  const before = asString(currentValue)
  const after = asString(proposedValue)
  if (before === after) {
    return [{ type: 'same' as const, text: after || '(empty)' }]
  }
  return [
    ...(before ? before.split('\n').map((text) => ({ type: 'removed' as const, text })) : [{ type: 'removed' as const, text: '(empty)' }]),
    ...(after ? after.split('\n').map((text) => ({ type: 'added' as const, text })) : [{ type: 'added' as const, text: '(empty)' }]),
  ]
}

function DraftDiff({ preview }: { preview: AgentDraftApplyPreview }) {
  const rows = diffRows(preview.review.currentValue, preview.review.proposedValue)
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="grid border-b border-border bg-muted/30 text-[10px] font-medium text-muted-foreground md:grid-cols-2">
        <div className="border-b border-border px-2 py-1.5 md:border-b-0 md:border-r">Current</div>
        <div className="px-2 py-1.5">Proposed</div>
      </div>
      <div className="grid md:grid-cols-2">
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-b border-border bg-red-500/5 p-2 text-[10px] leading-relaxed text-red-700 md:border-b-0 md:border-r">
          {asString(preview.review.currentValue) || '(empty)'}
        </pre>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words bg-green-500/5 p-2 text-[10px] leading-relaxed text-green-700">
          {asString(preview.review.proposedValue) || '(empty)'}
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
              {row.text}
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

function MemoryPanel({
  project,
  threadId,
  online,
}: {
  project: Project | null
  threadId?: string
  online: boolean
}) {
  const { i18n } = useTranslation()
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
          Memory
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
          Refresh
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
          {scope === 'project' ? 'Select a project to view project memory.' : 'Send or restore a local thread to view thread memory.'}
        </p>
      ) : (
        <>
          <div className="flex gap-1.5">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!online || saving}
              placeholder="Add memory..."
              rows={2}
              className="min-h-12 flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              type="button"
              size="icon-sm"
              onClick={saveMemory}
              disabled={!online || saving || !content.trim()}
              className="h-12 w-8 shrink-0"
              title="Save memory"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            </Button>
          </div>
          <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
            {memories.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No memory in this scope.</p>
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
                    title="Delete memory"
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

const DRAFT_KINDS: AgentDraftKind[] = ['script', 'asset_slot', 'storyboard_line', 'content_unit', 'prompt', 'note', 'pipeline', 'segment', 'scene_moment', 'production_proposal']
const DRAFT_STATUSES: AgentDraftStatus[] = ['draft', 'accepted', 'rejected', 'applied', 'superseded']

function DraftPanel({
  project,
  threadId,
  online,
  onRunUpdate,
  onAppliedRun,
}: {
  project: Project | null
  threadId?: string
  online: boolean
  onRunUpdate: (run: AgentRun | null) => void
  onAppliedRun: (run: AgentRun, thread: LocalAgentThread) => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [status, setStatus] = useState<AgentDraftStatus | 'all'>('draft')
  const [kind, setKind] = useState<AgentDraftKind | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [targetEntityType, setTargetEntityType] = useState('')
  const [targetEntityId, setTargetEntityId] = useState('')
  const [targetField, setTargetField] = useState('')
  const [currentValue, setCurrentValue] = useState('')
  const [proposedValue, setProposedValue] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [preview, setPreview] = useState<AgentDraftApplyPreview | null>(null)
  const [working, setWorking] = useState(false)
  const query = {
    ...(project ? { projectId: project.ID } : {}),
    ...(kind !== 'all' ? { kind } : {}),
    ...(status !== 'all' ? { status } : {}),
    limit: 20,
  }
  const draftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['local-agent-drafts', localAgentClient.baseURL, query],
    queryFn: () => localAgentClient.listDrafts(query).then((r) => r.drafts),
    enabled: online,
    retry: false,
  })
  const drafts = draftsQuery.data ?? []
  const selectedDraft = drafts.find((draft) => draft.id === selectedId) ?? drafts[0] ?? null

  useEffect(() => {
    if (!selectedDraft) {
      setSelectedId(null)
      setPreview(null)
      return
    }
    if (!selectedId || !drafts.some((draft) => draft.id === selectedId)) {
      setSelectedId(selectedDraft.id)
    }
  }, [drafts, selectedDraft, selectedId])

  useEffect(() => {
    if (!selectedDraft) return
    const target = selectedDraft.target ?? {}
    setTargetEntityType(typeof target.entityType === 'string' ? target.entityType : '')
    setTargetEntityId(target.entityId === undefined || target.entityId === null ? '' : String(target.entityId))
    setTargetField(typeof target.field === 'string' ? target.field : '')
    setProposedValue(selectedDraft.content)
    setCurrentValue('')
    setRejectReason('')
    setPreview(null)
  }, [selectedDraft?.id])

  async function refreshDrafts() {
    await draftsQuery.refetch()
  }

  async function buildPreview() {
    if (!selectedDraft) return
    setWorking(true)
    try {
      const next = await localAgentClient.previewApplyDraft(selectedDraft.id, {
        targetEntityType: targetEntityType.trim(),
        targetEntityId: Number.isFinite(Number(targetEntityId)) && targetEntityId.trim() ? Number(targetEntityId) : targetEntityId.trim(),
        targetField: targetField.trim(),
        currentValue,
        proposedValue: proposedValue || selectedDraft.content,
      })
      setPreview(next)
    } finally {
      setWorking(false)
    }
  }

  async function rejectSelectedDraft() {
    if (!selectedDraft) return
    setWorking(true)
    try {
      await localAgentClient.rejectDraft(selectedDraft.id, rejectReason.trim() || undefined)
      setPreview(null)
      qc.invalidateQueries({ queryKey: ['local-agent-drafts'] })
    } finally {
      setWorking(false)
    }
  }

  async function startApplyRun() {
    if (!selectedDraft) return
    setWorking(true)
    try {
      const activePreview = preview ?? await localAgentClient.previewApplyDraft(selectedDraft.id, {
        targetEntityType: targetEntityType.trim(),
        targetEntityId: Number.isFinite(Number(targetEntityId)) && targetEntityId.trim() ? Number(targetEntityId) : targetEntityId.trim(),
        targetField: targetField.trim(),
        currentValue,
        proposedValue: proposedValue || selectedDraft.content,
      })
      setPreview(activePreview)
      const run = await localAgentClient.createToolRun({
        ...(threadId ? { threadId } : {}),
        title: `Apply draft ${selectedDraft.title}`,
        message: `Apply Agent draft ${selectedDraft.id} to ${String(activePreview.review.target.entityType)} ${String(activePreview.review.target.entityId)}.`,
        toolCall: {
          name: 'movscript_apply_draft',
          args: {
            draftId: selectedDraft.id,
            target: activePreview.review.target,
            currentValue: activePreview.review.currentValue,
            proposedValue: activePreview.review.proposedValue,
          },
        },
      })
      onRunUpdate(run)
      const finalRun = await localAgentClient.waitForRun(run.id, {
        onRunUpdate,
      })
      const thread = await localAgentClient.getThread(finalRun.threadId)
      onAppliedRun(finalRun, thread)
      qc.invalidateQueries({ queryKey: ['local-agent-drafts'] })
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
          <ClipboardCheck size={11} />
          {t('agents.chat.drafts.title')}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={refreshDrafts}
          disabled={!online || draftsQuery.isFetching}
          className="h-5 px-1 text-[10px] text-muted-foreground"
        >
          <RefreshCw size={10} className={draftsQuery.isFetching ? 'animate-spin' : ''} />
          Refresh
        </Button>
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
        <p className="text-[10px] leading-relaxed text-muted-foreground">Start the local runtime to inspect Agent drafts.</p>
      ) : drafts.length === 0 ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">No drafts match this filter.</p>
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
                      {selectedDraft.projectId && <Badge variant="outline" className="text-[9px] leading-4 px-1.5 py-0">project #{selectedDraft.projectId}</Badge>}
                    </div>
                  </div>
                </div>
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-[10px] leading-relaxed">
                  {selectedDraft.content || '(empty draft)'}
                </pre>
              </div>
              <div className="grid gap-1.5 md:grid-cols-3">
                <input
                  value={targetEntityType}
                  onChange={(e) => { setTargetEntityType(e.target.value); setPreview(null) }}
                  placeholder="entity type"
                  className="h-7 rounded-md border border-input bg-background px-2 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <input
                  value={targetEntityId}
                  onChange={(e) => { setTargetEntityId(e.target.value); setPreview(null) }}
                  placeholder="entity id"
                  className="h-7 rounded-md border border-input bg-background px-2 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <input
                  value={targetField}
                  onChange={(e) => { setTargetField(e.target.value); setPreview(null) }}
                  placeholder="field"
                  className="h-7 rounded-md border border-input bg-background px-2 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="grid gap-1.5 md:grid-cols-2">
                <textarea
                  value={currentValue}
                  onChange={(e) => { setCurrentValue(e.target.value); setPreview(null) }}
                  placeholder="Current value for review..."
                  rows={3}
                  className="min-h-20 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <textarea
                  value={proposedValue}
                  onChange={(e) => { setProposedValue(e.target.value); setPreview(null) }}
                  placeholder="Proposed value..."
                  rows={3}
                  className="min-h-20 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              {preview && (
                <div className="space-y-1.5">
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
                    {preview.review.sideEffect} Approval is required before this write can run.
                  </div>
                  <DraftDiff preview={preview} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" size="xs" variant="outline" onClick={buildPreview} disabled={working || !targetEntityType.trim() || !targetEntityId.trim() || !targetField.trim()}>
                  {working ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />}
                  Diff
                </Button>
                <Button type="button" size="xs" variant="secondary" onClick={startApplyRun} disabled={working || !targetEntityType.trim() || !targetEntityId.trim() || !targetField.trim() || selectedDraft.status === 'applied'}>
                  {working ? <Loader2 size={10} className="animate-spin" /> : <ShieldCheck size={10} />}
                  Request apply
                </Button>
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="rejection reason"
                  className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button type="button" size="xs" variant="ghost" onClick={rejectSelectedDraft} disabled={working || selectedDraft.status === 'rejected'} className="text-muted-foreground hover:text-destructive">
                  <X size={10} />
                  Reject
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
  userId,
  onBack,
  externalDraft,
  pageToolRequestId,
  onExternalDraftConsumed,
}: {
  conv: Conversation
  userId: string
  onBack: () => void
  externalDraft?: AgentPanelDraftPayload
  pageToolRequestId?: string
  onExternalDraftConsumed?: () => void
}) {
  const { t } = useTranslation()
  const {
    settings,
    addMessage,
    updateConversationTitle,
    updateSettings,
  } = useAgentStore()
  const qc = useQueryClient()
  const currentProject = useProjectStore((s) => s.current)
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const { data: projects = [], isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then((r) => r.data),
  })
  const { data: textModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'text'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
  })
  const { data: resourcesData } = useQuery<RawResource[] | { items: RawResource[] }>({
    queryKey: ['resources', 'agent-panel'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 24, type: 'image,video,audio,text' } }).then((r) => r.data),
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState<AgentAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [showContext, setShowContextState] = useState(() => {
    try {
      return localStorage.getItem(AGENT_CONTEXT_VISIBLE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [contextPaneHeight, setContextPaneHeight] = useState(() => readStoredNumber(CONTEXT_PANE_HEIGHT_KEY, CONTEXT_PANE_DEFAULT_HEIGHT, CONTEXT_PANE_MIN_HEIGHT, CONTEXT_PANE_MAX_HEIGHT))
  const [activeLocalRun, setActiveLocalRun] = useState<AgentRun | null>(null)
  const [approvingLocalRun, setApprovingLocalRun] = useState(false)
  const [stoppingLocalRun, setStoppingLocalRun] = useState(false)
  const [stopRequestedBeforeRun, setStopRequestedBeforeRun] = useState(false)
  const [startingLocalAgent, setStartingLocalAgent] = useState(false)
  const [localAgentStartError, setLocalAgentStartError] = useState<string | null>(null)
  const localRuntimeEnabled = true
  const [debugBeforeSend, setDebugBeforeSendState] = useState(() => {
    try {
      return localStorage.getItem(AGENT_DEBUG_PREVIEW_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [buildingSendDraft, setBuildingSendDraft] = useState(false)
  const [pendingSendDraft, setPendingSendDraft] = useState<AgentSendDraft | null>(null)
  const [localAgentThreadIds, setLocalAgentThreadIds] = useState<Record<string, string>>(() => readLocalAgentThreadIds())
  const consumedExternalDraftIdsRef = useRef<Set<string>>(new Set())
  const stopRequestedBeforeRunRef = useRef(false)
  const cancelRequestedRunIdsRef = useRef<Set<string>>(new Set())
  const threadRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
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

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' })
  }, [conv.messages, loading, activeLocalRun])
  useEffect(() => { inputRef.current?.focus() }, [conv.id])
  // Auto-clear stale modelId
  useEffect(() => {
    if (textModels.length > 0 && settings.modelId !== null) {
      const exists = textModels.some((m) => m.id === settings.modelId)
      if (!exists) updateSettings({ modelId: null })
    }
  }, [textModels]) // eslint-disable-line react-hooks/exhaustive-deps

  const modelId = settings.modelId ?? textModels[0]?.id ?? null
  const systemPrompt = ''
  const recentResources = Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? [])
  const activeModel = textModels.find((m) => m.id === modelId)
  const contextLabels = [
    'Local Runtime',
    settings.includeProjectContext && currentProject ? currentProject.name : null,
    settings.includeRecentResources && recentResources.length > 0 ? t('agents.chat.recentResourcesCount', { count: Math.min(recentResources.length, 8) }) : null,
    attachments.length > 0 ? t('agents.chat.attachmentsCount', { count: attachments.length }) : null,
  ].filter(Boolean) as string[]
  const canSend = (!!input.trim() || attachments.length > 0) && !loading && !uploading && !buildingSendDraft
  const localAgentOnline = !!localAgentHealth?.ok && !localAgentHealthError
  const canAutoStartLocalAgent = canStartLocalAgentFromClient()
  const localAgentErrorMessage = localAgentStartError
    ?? (!localAgentOnline && localAgentHealthError instanceof Error ? localAgentHealthError.message : null)
  const canStopLocalRun = isStoppableAgentRun(activeLocalRun) || loading || buildingSendDraft || stopRequestedBeforeRun
  const createProject = useMutation({
    mutationFn: (payload: { name: string; description?: string }) => api.post('/projects', payload).then((r) => r.data as Project),
    onSuccess: (project) => {
      setCurrentProject(project)
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  useEffect(() => {
    if (loadingProjects || !currentProject) return
    const latest = projects.find((project) => project.ID === currentProject.ID)
    if (latest) {
      if (latest.UpdatedAt !== currentProject.UpdatedAt) setCurrentProject(latest)
      return
    }
    setCurrentProject(null)
  }, [projects, loadingProjects, currentProject, setCurrentProject])

  function setDebugBeforeSend(next: boolean) {
    setDebugBeforeSendState(next)
    try { localStorage.setItem(AGENT_DEBUG_PREVIEW_KEY, String(next)) } catch {}
  }

  function setShowContext(next: boolean | ((current: boolean) => boolean)) {
    setShowContextState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      try { localStorage.setItem(AGENT_CONTEXT_VISIBLE_KEY, String(resolved)) } catch {}
      return resolved
    })
  }

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
      writeStoredNumber(CONTEXT_PANE_HEIGHT_KEY, nextHeight)
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
    setUploading(true)
    try {
      const uploaded: AgentAttachment[] = []
      for (const file of list) {
        const fd = new FormData()
        fd.append('file', file)
        const { data } = await api.post('/resources/upload', fd)
        uploaded.push(attachmentFromResource(data as RawResource))
      }
      setAttachments((cur) => [...cur, ...uploaded])
      qc.invalidateQueries({ queryKey: ['resources'] })
      qc.invalidateQueries({ queryKey: ['resources', 'agent-panel'] })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function removeAttachment(id: string) {
    setAttachments((cur) => cur.filter((a) => a.id !== id))
  }

  const approveActiveLocalRun = useCallback(async (approvalIds?: string[]) => {
    const run = activeLocalRun
    if (!run || run.status !== 'requires_action' || approvingLocalRun) return

    setApprovingLocalRun(true)
    setLoading(true)
    try {
      const approvedRun = await localAgentClient.approveRun(run.id, { approvalIds })
      setActiveLocalRun(approvedRun)
      const finalRun = await localAgentClient.waitForRun(approvedRun.id, {
        onRunUpdate: setActiveLocalRun,
        timeoutMs: 900_000,
        pollMs: 1000,
      })
      const thread = await localAgentClient.getThread(finalRun.threadId)
      if (finalRun.status !== 'requires_action') {
        const content = formatLocalAgentAssistantContent(finalRun, thread)
        const generatedAttachments = await generatedAttachmentsFromRun(finalRun)
        addMessage(userId, conv.id, {
          role: 'assistant',
          content,
          ...withGeneratedAttachments(generatedAttachments),
          meta: { contextLabels: [`run ${finalRun.status}`], localRunActivity: compactRunActivity(finalRun) },
        })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: `工具确认失败：${message}`,
      })
    } finally {
      setApprovingLocalRun(false)
      setLoading(false)
    }
  }, [activeLocalRun, approvingLocalRun, addMessage, conv.id, userId])

  const rejectActiveLocalRun = useCallback(async (approvalIds?: string[]) => {
    const run = activeLocalRun
    if (!run || run.status !== 'requires_action' || approvingLocalRun) return

    setApprovingLocalRun(true)
    setLoading(true)
    try {
      const rejectedRun = await localAgentClient.rejectRun(run.id, { approvalIds })
      setActiveLocalRun(rejectedRun)
      const thread = await localAgentClient.getThread(rejectedRun.threadId)
      const content = formatLocalAgentAssistantContent(rejectedRun, thread)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content,
        meta: { contextLabels: [`run ${rejectedRun.status}`], localRunActivity: compactRunActivity(rejectedRun) },
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: `工具拒绝失败：${message}`,
      })
    } finally {
      setApprovingLocalRun(false)
      setLoading(false)
    }
  }, [activeLocalRun, approvingLocalRun, addMessage, conv.id, userId])

  const answerActiveLocalRunInput = useCallback(async (requestId: string, answer: { choiceIds?: string[]; text?: string }) => {
    const run = activeLocalRun
    if (!run || run.status !== 'requires_action' || approvingLocalRun) return

    setApprovingLocalRun(true)
    setLoading(true)
    try {
      const answeredRun = await localAgentClient.answerRunInput(run.id, { requestId, ...answer })
      setActiveLocalRun(answeredRun)
      const finalRun = await localAgentClient.waitForRun(answeredRun.id, {
        onRunUpdate: setActiveLocalRun,
        timeoutMs: 900_000,
        pollMs: 1000,
      })
      const thread = await localAgentClient.getThread(finalRun.threadId)
      if (finalRun.status !== 'requires_action') {
        const generatedAttachments = await generatedAttachmentsFromRun(finalRun)
        addMessage(userId, conv.id, {
          role: 'assistant',
          content: formatLocalAgentAssistantContent(finalRun, thread),
          ...withGeneratedAttachments(generatedAttachments),
          meta: { contextLabels: [`run ${finalRun.status}`], localRunActivity: compactRunActivity(finalRun) },
        })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: `补充信息提交失败：${message}`,
      })
    } finally {
      setApprovingLocalRun(false)
      setLoading(false)
    }
  }, [activeLocalRun, approvingLocalRun, addMessage, conv.id, userId])

  const stopActiveLocalRun = useCallback(async () => {
    const run = activeLocalRun
    if (!isStoppableAgentRun(run)) {
      if ((loading || buildingSendDraft) && !stoppingLocalRun) {
        stopRequestedBeforeRunRef.current = true
        setStopRequestedBeforeRun(true)
        setStoppingLocalRun(true)
      }
      return
    }
    if (stoppingLocalRun && !stopRequestedBeforeRun) return

    setStoppingLocalRun(true)
    try {
      const cancelledRun = await localAgentClient.cancelRun(run.id, { reason: '用户停止了当前会话。' })
      setActiveLocalRun(cancelledRun)
      if (!loading) {
        const thread = await localAgentClient.getThread(cancelledRun.threadId)
        addMessage(userId, conv.id, {
          role: 'assistant',
          content: formatLocalAgentAssistantContent(cancelledRun, thread),
          meta: { contextLabels: [`run ${cancelledRun.status}`], localRunActivity: compactRunActivity(cancelledRun) },
        })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: `停止当前会话失败：${message}`,
      })
    } finally {
      stopRequestedBeforeRunRef.current = false
      setStopRequestedBeforeRun(false)
      setStoppingLocalRun(false)
    }
  }, [activeLocalRun, stoppingLocalRun, stopRequestedBeforeRun, loading, buildingSendDraft, addMessage, conv.id, userId])

  const buildSendDraft = useCallback(async (options: {
    includeRuntimePreview?: boolean
    message?: string
    displayMessage?: string
    title?: string
    projectId?: number
    clientInput?: AgentClientInput
    agentManifest?: AgentManifest
    requestId?: string
    timeoutMs?: number
    omitDebugArtifacts?: boolean
  } = {}): Promise<AgentSendDraft> => {
    const text = (options.message ?? input).trim()
    const sentAttachments = attachments
    const visibleText = (options.displayMessage ?? text).trim()
    const visibleUserContent = visibleText || t('agents.chat.attachmentOnlyMessage')
    const runtimeMessage = options.clientInput?.message ?? normalizeAgentCommandMessage(visibleUserContent, settings.mode)
    const diagnosticCommand = isDiagnosticAgentCommand(runtimeMessage)
    const clientInput = options.clientInput ?? buildAgentClientInput({
      message: runtimeMessage,
      attachments: sentAttachments,
      projectId: options.projectId ?? currentProject?.ID,
      labels: contextLabels,
    })
    const agentContext = buildAgentContext({
      mode: settings.mode,
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
    const threadId = diagnosticCommand ? undefined : localAgentThreadIds[conv.id]
    const localRuntime: AgentSendDraft['localRuntime'] = {
      ...(threadId ? { threadId } : {}),
      title: options.title ?? conv.title,
      ...(options.projectId !== undefined ? { projectId: options.projectId } : {}),
      clientInput,
      ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
      ...((options.requestId ?? pageToolRequestId) ? { requestId: options.requestId ?? pageToolRequestId } : {}),
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      diagnosticCommand,
    }

    if (options.includeRuntimePreview) {
      try {
        if (!localAgentOnline) {
          await localAgentClient.ensureRunning()
          await refetchLocalAgentHealth()
        }
        await syncRuntimeModelConfig(modelId, activeModel ? publicModelLabel(activeModel) : undefined)
        try {
          localRuntime.preview = await localAgentClient.previewRun({
            ...(threadId ? { threadId } : {}),
            clientInput,
            ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
          })
        } catch (e) {
          if (!threadId) throw e
          warnings.push('Saved local thread was not previewable; retried preview as a new thread.')
          localRuntime.preview = await localAgentClient.previewRun({
            clientInput,
            ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
          })
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        localRuntime.previewError = message
        warnings.push(`Local runtime dry-run failed: ${message}`)
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
        ...(activeModel?.provider_name ? { provider: activeModel.provider_name } : {}),
      },
      agent: {
        id: null,
      },
      settings: {
        mode: settings.mode,
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
          ...(activeModel ? { modelName: publicModelLabel(activeModel) } : {}),
          messages,
          localRuntime,
        }),
      localRuntime,
      warnings,
    }
  }, [
    input,
    attachments,
    t,
    settings,
    currentProject,
    recentResources,
    systemPrompt,
    conv.messages,
    conv.id,
    conv.title,
    localAgentThreadIds,
    localAgentOnline,
    refetchLocalAgentHealth,
    modelId,
    activeModel,
    contextLabels,
    userId,
    pageToolRequestId,
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

    setInput('')
    setAttachments([])
    setLoading(true)
    setActiveLocalRun(null)
    cancelRequestedRunIdsRef.current.clear()
    setStoppingLocalRun(false)
    addMessage(userId, conv.id, {
      role: 'user',
      content: draft.visibleUserContent,
      attachments: draft.attachments,
      meta: {
        modelId: draft.model.id,
        agentName: 'Local Agent Runtime',
        mode: draft.settings.mode,
        permissionMode: draft.settings.permissionMode,
        contextLabels: draft.contextLabels,
      },
    })
    if (conv.messages.length === 0) {
      const titleBase = draft.visibleUserContent || draft.attachments[0]?.name || t('agents.chat.newConversation')
      updateConversationTitle(userId, conv.id, titleBase.slice(0, 30) + (titleBase.length > 30 ? '…' : ''))
    }

    try {
      if (!localAgentOnline) {
        await localAgentClient.ensureRunning()
        await refetchLocalAgentHealth()
      }
      await syncRuntimeModelConfig(draft.model.id, draft.model.name)
      const runResult = await localAgentClient.runMessageStream({
        threadId: draft.localRuntime?.diagnosticCommand ? undefined : draft.localRuntime?.threadId,
        message: draft.localRuntime?.clientInput?.message ?? draft.visibleUserContent,
        clientInput: draft.localRuntime?.clientInput,
        title: draft.localRuntime?.title ?? conv.title,
        projectId: draft.localRuntime?.projectId,
      }, {
        ...(draft.localRuntime?.agentManifest ? { agentManifest: draft.localRuntime.agentManifest } : {}),
        ...(draft.localRuntime?.timeoutMs ? { timeoutMs: draft.localRuntime.timeoutMs } : {}),
        pollMs: 120,
        onRunUpdate: (nextRun) => {
          setActiveLocalRun(nextRun)
            if (stopRequestedBeforeRunRef.current && isStoppableAgentRun(nextRun) && !cancelRequestedRunIdsRef.current.has(nextRun.id)) {
              cancelRequestedRunIdsRef.current.add(nextRun.id)
              void localAgentClient.cancelRun(nextRun.id, { reason: '用户停止了当前会话。' })
                .then(setActiveLocalRun)
                .finally(() => {
                  stopRequestedBeforeRunRef.current = false
                  setStopRequestedBeforeRun(false)
                })
            }
          },
        })
      const { run, thread } = runResult
      if (!draft.localRuntime?.diagnosticCommand) {
        setLocalAgentThreadIds((cur) => {
          const next = { ...cur, [conv.id]: thread.id }
          writeLocalAgentThreadIds(next)
          return next
        })
      }
      const content = formatLocalAgentAssistantContent(run, thread)
      const generatedAttachments = await generatedAttachmentsFromRun(run)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content,
        ...withGeneratedAttachments(generatedAttachments),
        meta: { contextLabels: [`run ${run.status}`], localRunActivity: compactRunActivity(run) },
      })
      notifyAgentPanelRunSettled({
        requestId: draft.localRuntime?.requestId,
        status: run.status === 'cancelled' ? 'cancelled' : 'completed',
        run,
        thread,
      })
    } catch (e: any) {
      const message = e instanceof Error ? e.message : String(e)
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: `本地 Agent 暂不可用。\n\n启动命令：\`pnpm --filter movscript-agent dev\`\n健康检查：\`${localAgentClient.baseURL}/health\`\n\n错误：${message}`,
      })
      notifyAgentPanelRunSettled({
        requestId: draft.localRuntime?.requestId,
        status: 'error',
        error: message,
      })
    } finally {
      stopRequestedBeforeRunRef.current = false
      cancelRequestedRunIdsRef.current.clear()
      setStopRequestedBeforeRun(false)
      setStoppingLocalRun(false)
      setLoading(false)
    }
  }, [
    addMessage,
    userId,
    conv.id,
    conv.messages.length,
    conv.title,
    t,
    updateConversationTitle,
    localAgentOnline,
    refetchLocalAgentHealth,
    setLocalAgentThreadIds,
  ])

  useEffect(() => {
    if (!externalDraft?.message?.trim()) return
    if (externalDraft.requestId && consumedExternalDraftIdsRef.current.has(externalDraft.requestId)) return
    if (externalDraft.requestId) consumedExternalDraftIdsRef.current.add(externalDraft.requestId)

    setInput(externalDraft.displayMessage ?? externalDraft.message)
    window.setTimeout(() => inputRef.current?.focus(), 0)
    onExternalDraftConsumed?.()

    if (!externalDraft.autoSend) return
    if (loading || uploading || buildingSendDraft) {
      const error = '当前 Agent 对话正在处理上一条请求，请稍后再试'
      addMessage(userId, conv.id, { role: 'assistant', content: error })
      notifyAgentPanelRunSettled({ requestId: externalDraft.requestId, status: 'error', error })
      return
    }

    setBuildingSendDraft(true)
    buildSendDraft({
      message: externalDraft.message,
      displayMessage: externalDraft.displayMessage,
      title: externalDraft.title,
      projectId: externalDraft.projectId,
      clientInput: externalDraft.clientInput,
      agentManifest: externalDraft.agentManifest,
      requestId: externalDraft.requestId,
      timeoutMs: externalDraft.timeoutMs,
      omitDebugArtifacts: true,
    })
      .then((draft) => commitSendDraft(draft))
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e)
        addMessage(userId, conv.id, { role: 'assistant', content: `发送前调试构建失败：${message}` })
        notifyAgentPanelRunSettled({ requestId: externalDraft.requestId, status: 'error', error: message })
      })
      .finally(() => setBuildingSendDraft(false))
  }, [
    externalDraft,
    onExternalDraftConsumed,
    loading,
    uploading,
    buildingSendDraft,
    addMessage,
    userId,
    conv.id,
    buildSendDraft,
    commitSendDraft,
  ])

  const send = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || loading || uploading || buildingSendDraft) return
    if (!modelId) {
      addMessage(userId, conv.id, { role: 'assistant', content: t('agents.chat.selectModelFirst') })
      return
    }

    setBuildingSendDraft(true)
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
    } finally {
      setBuildingSendDraft(false)
    }
  }, [
    input,
    attachments,
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
        <AgentHeader>
          <AgentHeaderContent>
            <AgentTitle className="ai-agent-panel-conversation-title">{conv.title}</AgentTitle>
            <AgentSubtitle>Local Agent Runtime</AgentSubtitle>
          </AgentHeaderContent>
          <AgentHeaderActions>
            <AgentStatus state={loading || buildingSendDraft ? 'running' : 'ready'}>
              {loading || buildingSendDraft ? t('common.loading') : t('agents.chat.messagesCount', { count: conv.messages.length })}
            </AgentStatus>
            {canStopLocalRun && (
              <Button
                size="sm"
                variant="outline"
                onClick={stopActiveLocalRun}
                disabled={stoppingLocalRun}
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                title="Stop current session"
              >
                {stoppingLocalRun ? <Loader2 size={13} className="animate-spin" /> : <CircleStop size={13} />}
                Stop
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" onClick={onBack} aria-label="Back">
              <ArrowLeft size={14} />
            </Button>
          </AgentHeaderActions>
        </AgentHeader>

        <AgentBody>
          <AgentThread ref={threadRef}>
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
                      onClick={() => setInput(item.label)}
                      className="justify-start rounded-md text-left text-[11px]"
                    >
                      {item.icon}
                      <span className="leading-tight">{item.label}</span>
                    </AgentSuggestion>
                  ))}
                </AgentSuggestions>
              </AgentEmpty>
            )}
            {conv.messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
            <LocalAgentWorkflow
              run={activeLocalRun}
              approving={approvingLocalRun}
              onApprove={approveActiveLocalRun}
              onReject={rejectActiveLocalRun}
              onAnswerInput={answerActiveLocalRunInput}
            />
            {activeLocalRun && (
              <div className="mx-1">
                <RunActivityPanel run={activeLocalRun} title="Live tool activity" />
              </div>
            )}
            {loading && <ThinkingBubble run={activeLocalRun} />}
            <div ref={bottomRef} />
          </AgentThread>
        </AgentBody>
      </section>

      <section className={cn('ai-agent-panel-card ai-agent-panel-context-section', showContext && 'ai-agent-panel-context-section--open')}>
        <div className="ai-agent-panel-card-header">
          <div className="min-w-0">
            <p className="ai-agent-panel-card-title">上下文</p>
            <p className="ai-agent-panel-card-subtitle">{contextLabels.length > 0 ? contextLabels.join(' / ') : '未选择上下文'}</p>
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
                {localAgentOnline ? 'Local Runtime online' : (checkingLocalAgent || startingLocalAgent ? (canAutoStartLocalAgent ? 'Starting Local Runtime' : 'Checking Local Runtime') : 'Local Runtime offline')}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => startLocalAgent()}
                disabled={checkingLocalAgent || startingLocalAgent}
                className="h-5 px-1 text-[10px] text-muted-foreground"
              >
                {checkingLocalAgent || startingLocalAgent ? (canAutoStartLocalAgent ? 'Starting' : 'Checking') : (canAutoStartLocalAgent ? 'Start' : 'Refresh')}
              </Button>
            </div>
            {!localAgentOnline && (
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {canAutoStartLocalAgent ? 'MovScript will start the local runtime through the desktop client.' : 'This window cannot start local processes. Open the Electron desktop client or start it manually.'} Browser mode can still start it manually with <code className="rounded bg-muted px-1 py-0.5">pnpm --filter movscript-agent dev</code>.
              </p>
            )}
            {localAgentErrorMessage && (
              <p className="line-clamp-2 text-[10px] leading-relaxed text-destructive">
                {localAgentErrorMessage}
              </p>
            )}
            {localAgentThreadIds[conv.id] && (
              <p className="truncate text-[10px] text-muted-foreground/70">
                Thread: <code className="rounded bg-muted px-1 py-0.5">{localAgentThreadIds[conv.id]}</code>
              </p>
            )}
          </div>
          <ProjectRequirementPanel
            project={currentProject}
            projects={projects}
            loading={loadingProjects}
            creating={createProject.isPending}
            onSelect={setCurrentProject}
            onCreate={(payload) => createProject.mutate(payload)}
          />
          {activeModel && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
              <Wand2 size={10} />
              <span className="truncate">{publicModelLabel(activeModel, true)}</span>
            </div>
          )}
          {showContext && (
            <div className="ai-agent-panel-context-card rounded-md border border-border bg-background/60 p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={settings.includeProjectContext}
                    onChange={(e) => updateSettings({ includeProjectContext: e.target.checked })}
                    className="h-3 w-3"
                  />
                  {t('agents.chat.projectContext')}
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={settings.includeRecentResources}
                    onChange={(e) => updateSettings({ includeRecentResources: e.target.checked })}
                    className="h-3 w-3"
                  />
                  {t('agents.chat.resourceContext')}
                </label>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <label className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={settings.autoPlan}
                    onChange={(e) => updateSettings({ autoPlan: e.target.checked })}
                    className="h-3 w-3"
                  />
                  <span className="truncate">{t('agents.chat.autoPlan')}</span>
                </label>
                {debugBeforeSend && (
                  <Badge variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">
                    Debug preview
                  </Badge>
                )}
                <Select
                  value={settings.permissionMode}
                  onValueChange={(next) => updateSettings({ permissionMode: next as AgentPermissionMode })}
                >
                  <SelectTrigger size="sm" className="ml-auto h-7 w-28 max-w-full text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ask">{t('agents.chat.permissions.ask')}</SelectItem>
                    <SelectItem value="suggest">{t('agents.chat.permissions.suggest')}</SelectItem>
                    <SelectItem value="auto">{t('agents.chat.permissions.auto')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {contextLabels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {contextLabels.map((label) => (
                    <Badge key={label} variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">{label}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="relative">
                  <AttachmentPreview attachment={attachment} compact />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    onClick={() => removeAttachment(attachment.id)}
                    className="absolute right-1 top-1 h-5 w-5 text-muted-foreground hover:text-destructive"
                  >
                    <X size={10} />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {showContext && (
            <div className="ai-agent-panel-context-stack">
              <DraftPanel
                project={currentProject}
                threadId={localAgentThreadIds[conv.id]}
                online={localAgentOnline}
                onRunUpdate={setActiveLocalRun}
                onAppliedRun={async (run, thread) => {
                  const content = formatLocalAgentAssistantContent(run, thread)
                  const generatedAttachments = await generatedAttachmentsFromRun(run)
                  addMessage(userId, conv.id, {
                    role: 'assistant',
                    content,
                    ...withGeneratedAttachments(generatedAttachments),
                    meta: { contextLabels: [`run ${run.status}`, 'Draft apply'], localRunActivity: compactRunActivity(run) },
                  })
                }}
              />
              <MemoryPanel
                project={currentProject}
                threadId={localAgentThreadIds[conv.id]}
                online={localAgentOnline}
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
          className="ai-agent-panel-composer"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.txt,.md,.json,.csv,.srt"
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
          <AgentComposerField
            ref={inputRef}
            placeholder={t('agents.chat.inputPlaceholder')}
            minRows={2}
            value={input}
            className="ai-agent-panel-composer-field"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={loading || buildingSendDraft}
          />
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
              {attachments.length > 0 && (
                <Badge variant="secondary" className="max-w-24 truncate text-[10px]">{t('agents.chat.attachmentsCount', { count: attachments.length })}</Badge>
              )}
              <Button
                type="button"
                size="xs"
                variant={debugBeforeSend ? 'secondary' : 'ghost'}
                onClick={() => setDebugBeforeSend(!debugBeforeSend)}
                className="h-7 px-2 text-[10px]"
                title="Preview payload before sending"
              >
                <Eye size={11} />
                Debug
              </Button>
            </div>
            <AgentComposerSubmit
              type={canStopLocalRun ? 'button' : 'submit'}
              running={canStopLocalRun}
              disabled={canStopLocalRun ? stoppingLocalRun : !canSend}
              label={canStopLocalRun ? 'Stop' : debugBeforeSend ? 'Preview' : t('common.send')}
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

function ConversationList({
  conversations,
  onSelect,
  onNew,
  onDelete,
  onRestoreLocalThread,
}: {
  conversations: Conversation[]
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
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
          <AgentTitle>{t('agents.chat.aiAssistant')}</AgentTitle>
          <AgentSubtitle>{t('agents.chat.newConversation')}</AgentSubtitle>
        </AgentHeaderContent>
        <AgentHeaderActions>
          <Button size="sm" variant="outline" onClick={onNew}>
            <Plus size={13} /> {t('agents.chat.newConversation')}
          </Button>
        </AgentHeaderActions>
      </AgentHeader>
      <AgentBody>
        <ScrollArea className="h-full">
        {conversations.length === 0 ? (
          <AgentEmpty className="min-h-0 py-12">
            <p className="text-sm font-medium text-foreground">{t('agents.chat.noConversations')}</p>
            <Button size="sm" onClick={onNew}>
              <Plus size={13} /> {t('agents.chat.newConversation')}
            </Button>
          </AgentEmpty>
        ) : (
          <AgentSidebarSection>
            {conversations.map((conv) => (
              <div key={conv.id} className="group relative">
                <AgentConversationItem
                  onClick={() => onSelect(conv.id)}
                  title={conv.title}
                  description={conv.messages[conv.messages.length - 1]?.content.slice(0, 54) ?? ''}
                  meta={formatDate(conv.updatedAt)}
                  className="pr-10"
                />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                  className="absolute bottom-2 right-2 h-5 w-5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label="Delete conversation"
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
              <span className="inline-flex items-center gap-1"><History size={11} /> Local Runtime</span>
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
            <p className="px-1 text-[10px] text-muted-foreground">No local runtime threads found.</p>
          ) : localThreads.map((thread) => (
            <AgentConversationItem
              key={thread.id}
              onClick={() => restoreThread(thread.id)}
              title={localThreadTitle(thread)}
              description={`${thread.messageCount} messages${thread.projectId ? ` · project #${thread.projectId}` : ''}`}
              meta={restoringThreadId === thread.id ? 'Restoring' : formatAgentDate(thread.updatedAt, i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US')}
            />
          ))}
        </AgentSidebarSection>
        </ScrollArea>
      </AgentBody>
    </AgentMain>
  )
}

// ── Built-in chat ─────────────────────────────────────────────────────────────

function BuiltinChat({ userId }: { userId: string }) {
  const {
    getConversations,
    getActiveConversationId,
    createConversation,
    setActiveConversation,
    deleteConversation,
    addMessage,
    updateConversationTitle,
  } = useAgentStore()
  const [externalDrafts, setExternalDrafts] = useState<Record<string, AgentPanelDraftPayload>>({})
  const [pageToolRequestIds, setPageToolRequestIds] = useState<Record<string, string>>({})

  const conversations = getConversations(userId)
  const activeConversationId = getActiveConversationId(userId)
  const activeConv = conversations.find((c) => c.id === activeConversationId) ?? null

  function handleNew() {
    createConversation(userId)
  }

  async function handleRestoreLocalThread(threadId: string) {
    const thread = await localAgentClient.getThread(threadId)
    const convId = createConversation(userId)
    updateConversationTitle(userId, convId, thread.title || `Local thread ${thread.id.slice(-6)}`)
    for (const message of thread.messages) {
      if (message.role !== 'user' && message.role !== 'assistant') continue
      addMessage(userId, convId, {
        role: message.role,
        content: message.content,
        meta: { contextLabels: ['Restored Local Runtime'] },
      })
    }
    const ids = { ...readLocalAgentThreadIds(), [convId]: thread.id }
    writeLocalAgentThreadIds(ids)
    setActiveConversation(userId, convId)
  }

  useEffect(() => {
    const pending = consumeAgentPanelDraft()
    if (!pending?.message?.trim()) return
    const convId = pending.newConversation ? createConversation(userId) : (getActiveConversationId(userId) ?? createConversation(userId))
    if (pending.title) updateConversationTitle(userId, convId, pending.title)
    if (pending.mode) useAgentStore.getState().updateSettings({ mode: pending.mode })
    setActiveConversation(userId, convId)
    if (pending.requestId) setPageToolRequestIds((current) => ({ ...current, [convId]: pending.requestId! }))
    setExternalDrafts((current) => ({ ...current, [convId]: pending }))
  }, [createConversation, getActiveConversationId, setActiveConversation, updateConversationTitle, userId])

  useEffect(() => {
    function handleDraft(event: Event) {
      const detail = (event as CustomEvent<AgentPanelDraftPayload>).detail
      if (!detail?.message?.trim()) return
      ;(detail as AgentPanelDraftPayload & { __handledByAgentPanel?: boolean }).__handledByAgentPanel = true
      const convId = detail.newConversation ? createConversation(userId) : (getActiveConversationId(userId) ?? createConversation(userId))
      if (detail.title) updateConversationTitle(userId, convId, detail.title)
      if (detail.mode) useAgentStore.getState().updateSettings({ mode: detail.mode })
      setActiveConversation(userId, convId)
      if (detail.requestId) setPageToolRequestIds((current) => ({ ...current, [convId]: detail.requestId! }))
      setExternalDrafts((current) => ({ ...current, [convId]: detail }))
    }

    window.addEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
    return () => window.removeEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
  }, [createConversation, getActiveConversationId, setActiveConversation, updateConversationTitle, userId])

  return (
    <AgentShell density="compact" className="ai-agent-panel-shell">
      {activeConv ? (
        <ChatView
          conv={activeConv}
          userId={userId}
          onBack={() => setActiveConversation(userId, null)}
          externalDraft={externalDrafts[activeConv.id]}
          pageToolRequestId={pageToolRequestIds[activeConv.id]}
          onExternalDraftConsumed={() => {
            setExternalDrafts((current) => {
              const next = { ...current }
              delete next[activeConv.id]
              return next
            })
          }}
        />
      ) : (
        <ConversationList
          conversations={conversations}
          onSelect={(id) => setActiveConversation(userId, id)}
          onNew={handleNew}
          onDelete={(id) => deleteConversation(userId, id)}
          onRestoreLocalThread={handleRestoreLocalThread}
        />
      )}
    </AgentShell>
  )
}

// ── AIAgentPanel ──────────────────────────────────────────────────────────────

const PANEL_OPEN_KEY = 'ai-panel-open'
const PANEL_WIDTH_KEY = 'ai-panel-width'
const LOCAL_AGENT_THREAD_IDS_KEY = 'ai-panel-local-agent-thread-ids'
const AGENT_DEBUG_PREVIEW_KEY = 'ai-panel-debug-preview'
const AGENT_CONTEXT_VISIBLE_KEY = 'ai-panel-context-visible'

function readLocalAgentThreadIds(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_AGENT_THREAD_IDS_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => (
        typeof entry[0] === 'string' && typeof entry[1] === 'string'
      )),
    )
  } catch {
    return {}
  }
}

function writeLocalAgentThreadIds(value: Record<string, string>): void {
  try {
    localStorage.setItem(LOCAL_AGENT_THREAD_IDS_KEY, JSON.stringify(value))
  } catch {}
}

export function AIAgentPanel() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(PANEL_OPEN_KEY)
      return saved === null ? true : saved === 'true'
    } catch {
      return true
    }
  })
  const [panelWidth, setPanelWidth] = useState(() => readStoredNumber(PANEL_WIDTH_KEY, 420, 320, 760))
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const panelResizeStateRef = React.useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    function handleDraft() {
      setOpen(true)
      try { localStorage.setItem(PANEL_OPEN_KEY, 'true') } catch {}
    }

    window.addEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
    return () => window.removeEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
  }, [])

  function toggleOpen() {
    setOpen((v) => {
      const next = !v
      try { localStorage.setItem(PANEL_OPEN_KEY, String(next)) } catch {}
      return next
    })
  }

  const startPanelResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!open || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startWidth = panelWidth
    const startX = event.clientX
    panelResizeStateRef.current = { startX, startWidth }
    const maxWidth = Math.min(760, Math.max(320, window.innerWidth - 280))
    document.body.classList.add('ai-agent-panel-resizing', 'ai-agent-panel-resizing--x')

    const onMove = (moveEvent: PointerEvent) => {
      const state = panelResizeStateRef.current
      if (!state) return
      const delta = state.startX - moveEvent.clientX
      const nextWidth = clampNumber(state.startWidth + delta, 320, maxWidth)
      setPanelWidth(nextWidth)
      writeStoredNumber(PANEL_WIDTH_KEY, nextWidth)
    }

    const onUp = () => {
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
    <div className={cn(
      'ai-agent-panel relative h-full min-w-0 shrink-0 bg-background flex flex-col overflow-hidden transition-[width] duration-200',
      open ? 'w-[var(--ai-agent-panel-width)]' : 'w-11',
    )} style={{ ['--ai-agent-panel-width' as string]: `${panelWidth}px` }}>
      {open && (
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
      <div className="flex items-center h-11 border-b border-border shrink-0 px-2.5 gap-2 pl-3">
        <button
          onClick={toggleOpen}
          title={open ? t('agents.chat.collapseAssistant') : t('agents.chat.aiAssistant')}
          className="min-w-0 flex flex-1 items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Bot size={16} className="shrink-0 text-foreground" />
          {open && <span className="text-sm font-semibold flex-1 text-left text-foreground truncate">{t('agents.chat.aiAssistant')}</span>}
        </button>
        {open && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={toggleOpen}
            title={t('agents.chat.collapseAssistant')}
            className="h-7 w-7 text-muted-foreground"
          >
            <ChevronRight size={13} />
          </Button>
        )}
      </div>

      {open && (
        <div className="flex flex-col flex-1 min-h-0">
          <BuiltinChat userId={userId} />
        </div>
      )}
    </div>
  )
}
