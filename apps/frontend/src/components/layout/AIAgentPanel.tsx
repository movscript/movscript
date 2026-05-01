import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Bot, ChevronRight, Send, Loader2,
  Plus, ArrowLeft, Copy, Check, X, ClipboardCheck,
  Image, Video, FileText, Mic, File, Workflow, ShieldCheck,
  Sparkles, Search, ListChecks, Upload, Eye, Wand2,
  Trash2, RefreshCw, History, Database, Save,
} from 'lucide-react'
import { api } from '@/lib/api'
import { translateApiError } from '@/lib/apiError'
import { API_V1_BASE_URL } from '@/lib/config'
import { publicModelLabel } from '@/lib/modelDisplay'
import {
  canStartLocalAgentFromClient,
  localAgentClient,
  type AgentHealth,
  type AgentClientInput,
  type AgentDraft,
  type AgentDraftApplyPreview,
  type AgentDraftKind,
  type AgentDraftStatus,
  type AgentMemory,
  type AgentMemoryKind,
  type AgentMemoryScope,
  type AgentManifest,
  type AgentRun,
  type AgentRunPreview,
  type AgentThread as LocalAgentThread,
  type AgentThreadSummary,
} from '@/lib/localAgentClient'
import {
  AgentBody,
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
  AgentMessage,
  AgentMessageActions,
  AgentMessageAvatar,
  AgentMessageBody,
  AgentMessageContent,
  AgentMessageMeta,
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
  return resource.direct_url || resource.url
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
        <img src={url} alt={attachment.name} className="h-20 w-full object-cover bg-muted" />
      ) : attachment.type === 'video' && url ? (
        <video src={url} className="h-20 w-full object-cover bg-black" muted controls />
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

type AgentSendRoute = 'cloud-chat' | 'local-runtime'

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
    projectId?: number
    title: string
    clientInput?: AgentClientInput
    agentManifest?: AgentManifest
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
  project: Project | null
  recentResources: RawResource[]
  labels: string[]
}): AgentClientInput {
  const route = typeof window !== 'undefined'
    ? { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }
    : undefined
  return {
    message: options.message,
    attachments: options.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      mimeType: attachment.mimeType,
      size: attachment.size,
      ...(attachment.resourceId ? { resourceId: attachment.resourceId } : {}),
    })),
    uiSnapshot: {
      ...(route ? { route } : {}),
      ...(options.project ? {
        project: {
          id: options.project.ID,
          name: options.project.name,
          status: options.project.status,
          description: options.project.description,
        },
      } : {}),
      recentResources: options.recentResources.slice(0, 8).map((resource) => ({
        id: resource.ID,
        name: resource.name,
        type: resource.type,
        mimeType: resource.mime_type,
        size: resource.size,
      })),
      labels: options.labels,
    },
  }
}

function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function buildDebugHttpRequests(options: {
  route: AgentSendRoute
  modelId: number | null
  messages: AgentSendDraft['outbound']['messages']
  localRuntime?: AgentSendDraft['localRuntime']
}): DebugHttpRequest[] {
  if (options.route === 'cloud-chat') {
    return [{
      id: 'cloud-chat',
      label: 'Cloud chat completion',
      method: 'POST',
      url: `${API_V1_BASE_URL}/ai/chat`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer <session-token>',
      },
      body: {
        model_config_id: options.modelId,
        messages: options.messages,
      },
    }]
  }

  const baseURL = localAgentClient.baseURL
  const threadId = options.localRuntime?.threadId
  const resolvedThreadId = threadId ?? '{threadId from POST /threads}'
  const requests: DebugHttpRequest[] = threadId
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
        ...(options.localRuntime?.projectId ? { projectId: options.localRuntime.projectId } : {}),
      },
    }]

  requests.push(
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
      label: 'Create local agent run',
      method: 'POST',
      url: `${baseURL}/runs`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        threadId: resolvedThreadId,
        ...(options.localRuntime?.clientInput ? { clientInput: options.localRuntime.clientInput } : {}),
        ...(options.localRuntime?.agentManifest ? { agentManifest: options.localRuntime.agentManifest } : {}),
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
  return requests
}

function formatLocalAgentAssistantContent(run: AgentRun, thread: LocalAgentThread) {
  const assistant = thread.messages.find((item) => item.id === run.assistantMessageId)
    ?? [...thread.messages].reverse().find((item) => item.role === 'assistant')
  const content = assistant?.content
    ?? (run.status === 'failed'
      ? `运行失败：${run.error ?? 'unknown error'}`
      : run.status === 'requires_action'
        ? `需要确认后继续执行：\n${(run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').map((approval) => `- ${approval.toolName}: ${approval.reason}`).join('\n') || '- 等待工具调用确认'}`
        : '本地 Agent Runtime 没有返回 assistant message。')

  if (run.status !== 'completed_with_warnings' || !run.warnings?.length) return content
  const missing = run.warnings.filter((warning) => !content.includes(warning))
  if (missing.length === 0) return content
  return `${content}\n\nWarnings:\n${missing.map((warning) => `- ${warning}`).join('\n')}`
}

function LocalAgentWorkflow({
  run,
  approving = false,
  onApprove,
  onReject,
}: {
  run: AgentRun | null
  approving?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
}) {
  if (!run) return null
  const tasks = run.plan?.tasks ?? []
  const pendingApprovals = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')
  const statusLabel = run.status === 'requires_action'
    ? 'Waiting for approval'
    : run.status.replace(/_/g, ' ')

  return (
    <div className="mx-1 my-2 rounded-md border border-border bg-background/70 p-2.5 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <Workflow size={13} />
          <span className="truncate">Agent workflow</span>
        </div>
        <Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'requires_action' ? 'warning' : run.status === 'in_progress' ? 'secondary' : 'outline'} className="shrink-0 text-[9px]">
          {statusLabel}
        </Badge>
      </div>

      {pendingApprovals.length > 0 && (
        <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
              <ShieldCheck size={12} />
              <span className="truncate">Approval required</span>
            </div>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => onReject?.(pendingApprovals.map((approval) => approval.id))}
              disabled={approving || !onReject}
              className="h-6 shrink-0 px-2 text-[10px] text-muted-foreground hover:text-destructive"
            >
              <X size={10} />
              Reject
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => onApprove?.(pendingApprovals.map((approval) => approval.id))}
              disabled={approving || !onApprove}
              className="h-6 shrink-0 px-2 text-[10px]"
            >
              {approving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
              Approve
            </Button>
          </div>
          <div className="space-y-1">
            {pendingApprovals.map((approval) => (
              <div key={approval.id} className="rounded border border-amber-500/20 bg-background/60 px-2 py-1.5">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">{approval.toolName}</span>
                    {approval.risk && (
                      <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                        {approval.risk}
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => onReject?.([approval.id])}
                      disabled={approving || !onReject}
                      className="h-5 px-1.5 text-[9px] text-muted-foreground hover:text-destructive"
                    >
                      Reject
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      onClick={() => onApprove?.([approval.id])}
                      disabled={approving || !onApprove}
                      className="h-5 px-1.5 text-[9px]"
                    >
                      Approve
                    </Button>
                  </div>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{approval.reason}</p>
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
              </div>
            ))}
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="mb-2 space-y-1">
          {tasks.map((task, index) => (
            <div key={task.id} className="grid grid-cols-[16px_1fr_auto] items-start gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1.5">
              <span className="pt-0.5 text-[10px] text-muted-foreground">{index + 1}</span>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">{task.title}</span>
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">{task.agentRole}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{task.description}</p>
              </div>
              <span className={cn('rounded px-1 py-0.5 text-[9px]', workflowStatusClass(task.status))}>{task.status}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {run.steps.map((step) => (
          <div key={step.id} className="flex items-start gap-2 text-[10px]">
            <span className={cn('mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', workflowDotClass(step.status))}>
              {step.status === 'in_progress' ? <Loader2 size={10} className="animate-spin" /> : step.status === 'completed' ? <Check size={10} /> : <X size={10} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium text-foreground">{workflowStepTitle(step)}</span>
                <span className="shrink-0 text-muted-foreground/60">{step.type}</span>
              </div>
              {step.agentRole && <p className="truncate text-muted-foreground">subagent: {step.agentRole}</p>}
              {step.error && <p className="text-destructive">{step.error}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
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
            <DebugSection title="Plan">
              <div className="space-y-2 text-[11px]">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-foreground">{preview.plan.objective}</div>
                    <Badge variant={preview.planner === 'model' ? 'secondary' : 'outline'} className="shrink-0 text-[9px]">
                      {preview.planner ?? 'rule'} planner
                    </Badge>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{preview.plan.strategy}</div>
                  <div className="mt-1 text-muted-foreground">
                    project: {preview.currentProjectId ?? 'none'} · memories: {preview.memoryCount} · planned tool calls: {preview.toolCalls.length}
                  </div>
                  {preview.plannerWarnings.length > 0 && (
                    <div className="mt-1 space-y-0.5 text-amber-700 dark:text-amber-300">
                      {preview.plannerWarnings.map((warning) => <div key={warning}>{warning}</div>)}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  {preview.plan.tasks.map((task, index) => (
                    <div key={task.id} className="rounded-md border border-border bg-background px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{index + 1}. {task.title}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Badge variant="outline" className="text-[9px]">{task.agentRole}</Badge>
                          <Badge variant={task.status === 'skipped' ? 'warning' : 'outline'} className="text-[9px]">{task.status}</Badge>
                        </div>
                      </div>
                      <p className="mt-0.5 text-muted-foreground">{task.description}</p>
                      {task.successCriteria && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground/80">success: {task.successCriteria}</p>
                      )}
                      {task.toolCalls.length > 0 && (
                        <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 text-[10px]">
                          {safeJSONStringify(task.toolCalls)}
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
                    <DebugSummaryItem label="Project" value={draft.localRuntime.projectId ? String(draft.localRuntime.projectId) : 'runtime context'} />
                    <DebugSummaryItem label="Manifest" value={draft.localRuntime.agentManifest?.name ?? 'default'} />
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
  if (step.type === 'planning') return step.title ?? 'Task planning'
  if (step.type === 'subagent') return step.title ?? step.agentRole ?? 'Subagent'
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
    <AgentMessage role={isUser ? 'user' : 'assistant'} className="group">
      <AgentMessageAvatar label={isUser ? '我' : <Bot size={13} />} />
      <AgentMessageBody>
        <AgentMessageMeta>
          <span>{isUser ? 'You' : 'MovScript Agent'}</span>
          <span>{time}</span>
          <AgentMessageActions>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={copy}
              aria-label="Copy message"
              title="Copy message"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </Button>
          </AgentMessageActions>
        </AgentMessageMeta>
        <AgentMessageContent>
          {isUser ? msg.content : <MarkdownContent text={msg.content} />}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className={cn('mt-2 grid gap-1.5', msg.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
              {msg.attachments.map((attachment) => (
                <AttachmentPreview key={attachment.id} attachment={attachment} compact />
              ))}
            </div>
          )}
        </AgentMessageContent>
        {msg.meta && (
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
      </AgentMessageBody>
    </AgentMessage>
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

const DRAFT_KINDS: AgentDraftKind[] = ['script', 'setting', 'storyboard', 'shot', 'prompt', 'note']
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
  const { i18n } = useTranslation()
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
          name: 'movscript.apply_draft',
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
          Drafts
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
            <SelectItem value="all">all statuses</SelectItem>
            {DRAFT_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(next) => setKind(next as AgentDraftKind | 'all')}>
          <SelectTrigger size="sm" className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all kinds</SelectItem>
            {DRAFT_KINDS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
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
                  <Badge variant={draftStatusVariant(draft.status)} className="shrink-0 text-[9px] leading-4 px-1.5 py-0">{draft.status}</Badge>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span>{draft.kind}</span>
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
                      <Badge variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">{selectedDraft.kind}</Badge>
                      <Badge variant={draftStatusVariant(selectedDraft.status)} className="text-[9px] leading-4 px-1.5 py-0">{selectedDraft.status}</Badge>
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

// ── Chat view ─────────────────────────────────────────────────────────────────

function ChatView({ conv, userId, onBack }: { conv: Conversation; userId: string; onBack: () => void }) {
  const { t } = useTranslation()
  const {
    settings,
    addMessage,
    updateConversationTitle,
    updateSettings,
  } = useAgentStore()
  const qc = useQueryClient()
  const currentProject = useProjectStore((s) => s.current)
  const { data: textModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'assistant_chat'],
    queryFn: async () => {
      try {
        return await api.get('/models?feature=assistant_chat').then((r) => r.data)
      } catch {
        return await api.get('/models?capability=text').then((r) => r.data)
      }
    },
  })
  const { data: resourcesData } = useQuery<RawResource[] | { items: RawResource[] }>({
    queryKey: ['resources', 'agent-panel'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 24, type: 'image,video,audio,text' } }).then((r) => r.data),
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState<AgentAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [showContext, setShowContext] = useState(true)
  const [activeLocalRun, setActiveLocalRun] = useState<AgentRun | null>(null)
  const [approvingLocalRun, setApprovingLocalRun] = useState(false)
  const [startingLocalAgent, setStartingLocalAgent] = useState(false)
  const [localAgentStartError, setLocalAgentStartError] = useState<string | null>(null)
  const [localRuntimeEnabled, setLocalRuntimeEnabledState] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_AGENT_MODE_KEY) !== 'false'
    } catch {
      return true
    }
  })
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conv.messages, loading, activeLocalRun])
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
    localRuntimeEnabled ? 'Local Runtime' : null,
    settings.includeProjectContext && currentProject ? currentProject.name : null,
    settings.includeRecentResources && recentResources.length > 0 ? t('agents.chat.recentResourcesCount', { count: Math.min(recentResources.length, 8) }) : null,
    attachments.length > 0 ? t('agents.chat.attachmentsCount', { count: attachments.length }) : null,
  ].filter(Boolean) as string[]
  const canSend = (!!input.trim() || attachments.length > 0) && !loading && !uploading && !buildingSendDraft
  const localAgentOnline = !!localAgentHealth?.ok && !localAgentHealthError
  const canAutoStartLocalAgent = canStartLocalAgentFromClient()
  const localAgentErrorMessage = localAgentStartError
    ?? (!localAgentOnline && localAgentHealthError instanceof Error ? localAgentHealthError.message : null)

  function setLocalRuntimeEnabled(next: boolean) {
    setLocalRuntimeEnabledState(next)
    try { localStorage.setItem(LOCAL_AGENT_MODE_KEY, String(next)) } catch {}
  }

  function setDebugBeforeSend(next: boolean) {
    setDebugBeforeSendState(next)
    try { localStorage.setItem(AGENT_DEBUG_PREVIEW_KEY, String(next)) } catch {}
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
      })
      const thread = await localAgentClient.getThread(finalRun.threadId)
      if (finalRun.status !== 'requires_action') {
        const content = formatLocalAgentAssistantContent(finalRun, thread)
        addMessage(userId, conv.id, {
          role: 'assistant',
          content,
          meta: { contextLabels: [`run ${finalRun.status}`] },
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
        meta: { contextLabels: [`run ${rejectedRun.status}`] },
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

  const buildSendDraft = useCallback(async (options: { includeRuntimePreview?: boolean } = {}): Promise<AgentSendDraft> => {
    const text = input.trim()
    const sentAttachments = attachments
    const visibleUserContent = text || t('agents.chat.attachmentOnlyMessage')
    const clientInput = buildAgentClientInput({
      message: visibleUserContent,
      attachments: sentAttachments,
      project: currentProject,
      recentResources,
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
    const warnings: string[] = []
    let localRuntime: AgentSendDraft['localRuntime']

    if (localRuntimeEnabled) {
      const threadId = localAgentThreadIds[conv.id]
      localRuntime = {
        ...(threadId ? { threadId } : {}),
        ...(currentProject?.ID ? { projectId: currentProject.ID } : {}),
        title: conv.title,
        clientInput,
      }

      if (options.includeRuntimePreview) {
        try {
          if (!localAgentOnline) {
            await localAgentClient.ensureRunning()
            await refetchLocalAgentHealth()
          }
          try {
            localRuntime.preview = await localAgentClient.previewRun({
              ...(threadId ? { threadId } : {}),
              clientInput,
            })
          } catch (e) {
            if (!threadId) throw e
            warnings.push('Saved local thread was not previewable; retried preview as a new thread.')
            localRuntime.preview = await localAgentClient.previewRun({
              clientInput,
            })
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          localRuntime.previewError = message
          warnings.push(`Local runtime dry-run failed: ${message}`)
        }
      }
    }

    return {
      id: makeTraceId(),
      createdAt: Date.now(),
      route: localRuntimeEnabled ? 'local-runtime' : 'cloud-chat',
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
        messages,
      },
      httpRequests: buildDebugHttpRequests({
        route: localRuntimeEnabled ? 'local-runtime' : 'cloud-chat',
        modelId,
        messages,
        ...(localRuntime ? { localRuntime } : {}),
      }),
      ...(localRuntime ? { localRuntime } : {}),
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
    localRuntimeEnabled,
    localAgentThreadIds,
    localAgentOnline,
    refetchLocalAgentHealth,
    modelId,
    activeModel,
    contextLabels,
    userId,
  ])

  const commitSendDraft = useCallback(async (draft: AgentSendDraft) => {
    if (!draft.model.id && draft.route !== 'local-runtime') {
      addMessage(userId, conv.id, { role: 'assistant', content: t('agents.chat.selectModelFirst') })
      return
    }

    setInput('')
    setAttachments([])
    setLoading(true)
    setActiveLocalRun(null)
    addMessage(userId, conv.id, {
      role: 'user',
      content: draft.visibleUserContent,
      attachments: draft.attachments,
      meta: {
        modelId: draft.model.id,
        agentName: draft.route === 'local-runtime' ? 'Local Agent Runtime' : draft.agent.name,
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
      if (draft.route === 'local-runtime') {
        if (!localAgentOnline) {
          await localAgentClient.ensureRunning()
          await refetchLocalAgentHealth()
        }
        const { run, thread } = await localAgentClient.runMessage({
          threadId: draft.localRuntime?.threadId,
          message: draft.visibleUserContent,
          clientInput: draft.localRuntime?.clientInput,
          title: draft.localRuntime?.title ?? conv.title,
          projectId: draft.localRuntime?.projectId,
        }, {
          onRunUpdate: setActiveLocalRun,
          agentManifest: draft.localRuntime?.agentManifest,
        })
        setLocalAgentThreadIds((cur) => {
          const next = { ...cur, [conv.id]: thread.id }
          writeLocalAgentThreadIds(next)
          return next
        })
        const content = formatLocalAgentAssistantContent(run, thread)
        addMessage(userId, conv.id, {
          role: 'assistant',
          content,
          meta: { contextLabels: [`run ${run.status}`] },
        })
        return
      }

      const { data } = await api.post('/ai/chat', { model_config_id: draft.model.id, messages: draft.outbound.messages })
      addMessage(userId, conv.id, { role: 'assistant', content: data.content })
    } catch (e: any) {
      if (draft.route === 'local-runtime') {
        const message = e instanceof Error ? e.message : String(e)
        addMessage(userId, conv.id, {
          role: 'assistant',
          content: `本地 Agent Runtime 暂不可用。\n\n启动命令：\`pnpm --filter movscript-agent dev\`\n健康检查：\`${localAgentClient.baseURL}/health\`\n\n错误：${message}`,
        })
        return
      }
      const rawErr: string = e?.response?.data?.error ?? e?.response?.data?.message ?? String(e)
      const errMsg = translateApiError(e?.response?.data)
      if (rawErr.includes('not found') || rawErr.includes('disabled')) {
        updateSettings({ modelId: null })
        addMessage(userId, conv.id, { role: 'assistant', content: t('agents.chat.modelInvalid') })
      } else {
        addMessage(userId, conv.id, { role: 'assistant', content: t('agents.chat.errorMessage', { message: errMsg }) })
      }
    } finally {
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
    updateSettings,
  ])

  const send = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || loading || uploading || buildingSendDraft) return
    if (!modelId && !localRuntimeEnabled) {
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
    <AgentMain>
      <AgentDebugPreviewDialog
        draft={pendingSendDraft}
        sending={loading}
        onCancel={() => setPendingSendDraft(null)}
        onConfirm={confirmPendingSendDraft}
      />
      <AgentHeader>
        <AgentHeaderContent>
          <AgentTitle>{conv.title}</AgentTitle>
          <AgentSubtitle>
            {localRuntimeEnabled ? 'Local Agent Runtime' : t('agents.chat.aiAssistant')}
          </AgentSubtitle>
        </AgentHeaderContent>
        <AgentHeaderActions>
          <AgentStatus state={loading || buildingSendDraft ? 'running' : 'ready'}>
            {loading || buildingSendDraft ? t('common.loading') : t('agents.chat.messagesCount', { count: conv.messages.length })}
          </AgentStatus>
          <Button size="icon-sm" variant="ghost" onClick={onBack} aria-label="Back">
            <ArrowLeft size={14} />
          </Button>
        </AgentHeaderActions>
      </AgentHeader>

      <AgentBody>
        <AgentThread>
          {conv.messages.length === 0 && (
            <AgentEmpty className="min-h-0 py-6">
              <p className="text-sm font-medium text-foreground">
                {t('agents.chat.startChat')}
              </p>
              <AgentSuggestions className="grid w-full grid-cols-2 gap-2">
                {[
                  { icon: <ListChecks size={13} />, label: t('agents.chat.suggestions.planProject') },
                  { icon: <Sparkles size={13} />, label: t('agents.chat.suggestions.createShot') },
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
          {localRuntimeEnabled && (
            <LocalAgentWorkflow
              run={activeLocalRun}
              approving={approvingLocalRun}
              onApprove={approveActiveLocalRun}
              onReject={rejectActiveLocalRun}
            />
          )}
          {loading && (
            <AgentMessage role="assistant">
              <AgentMessageAvatar label={<Bot size={13} />} />
              <AgentMessageBody>
                <AgentMessageMeta>{t('common.loading')}</AgentMessageMeta>
                <AgentMessageContent className="inline-flex w-fit items-center gap-2">
                  <Loader2 size={13} className="animate-spin" />
                </AgentMessageContent>
              </AgentMessageBody>
            </AgentMessage>
          )}
          <div ref={bottomRef} />
        </AgentThread>
      </AgentBody>

      <div className="px-3 py-2.5 shrink-0 space-y-2">
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={localRuntimeEnabled ? 'secondary' : 'outline'}
            onClick={() => setLocalRuntimeEnabled(!localRuntimeEnabled)}
            className="h-8 px-2 text-[10px]"
            title="Local Agent Runtime"
          >
            <Bot size={11} />
            Local
          </Button>
        </div>
        {localRuntimeEnabled && (
          <div className="rounded-md border border-border bg-background/60 p-2 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className={cn('font-medium', localAgentOnline ? 'text-green-600' : 'text-amber-600')}>
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
        )}
        {activeModel && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
            <Wand2 size={10} />
            <span className="truncate">{publicModelLabel(activeModel, true)}</span>
          </div>
        )}
        {showContext && (
          <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
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
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={settings.autoPlan}
                  onChange={(e) => updateSettings({ autoPlan: e.target.checked })}
                  className="h-3 w-3"
                />
                {t('agents.chat.autoPlan')}
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
                <SelectTrigger size="sm" className="ml-auto h-7 w-28 text-[10px]">
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
        {localRuntimeEnabled && showContext && (
          <>
            <DraftPanel
              project={currentProject}
              threadId={localAgentThreadIds[conv.id]}
              online={localAgentOnline}
              onRunUpdate={setActiveLocalRun}
              onAppliedRun={(run, thread) => {
                const content = formatLocalAgentAssistantContent(run, thread)
                addMessage(userId, conv.id, {
                  role: 'assistant',
                  content,
                  meta: { contextLabels: [`run ${run.status}`, 'Draft apply'] },
                })
              }}
            />
            <MemoryPanel
              project={currentProject}
              threadId={localAgentThreadIds[conv.id]}
              online={localAgentOnline}
            />
          </>
        )}
        <AgentComposer
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={loading || buildingSendDraft}
          />
          <AgentComposerToolbar>
            <div className="flex items-center gap-1">
              <AgentComposerAction
                onClick={() => fileRef.current?.click()}
                disabled={uploading || loading || buildingSendDraft}
                aria-label={t('agents.chat.uploadAttachment')}
                title={t('agents.chat.uploadAttachment')}
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              </AgentComposerAction>
              {attachments.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{t('agents.chat.attachmentsCount', { count: attachments.length })}</Badge>
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
            <AgentComposerSubmit disabled={!canSend} label={debugBeforeSend ? 'Preview' : t('common.send')}>
              {buildingSendDraft ? <Loader2 size={15} className="animate-spin" /> : debugBeforeSend ? <Eye size={15} /> : <Send size={15} />}
            </AgentComposerSubmit>
          </AgentComposerToolbar>
        </AgentComposer>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setShowContext((v) => !v)}
            className="h-6 px-1 text-[10px] text-muted-foreground"
          >
            <Eye size={10} /> {showContext ? t('agents.chat.hideContext') : t('agents.chat.showContext')}
          </Button>
          <p className="text-[10px] text-muted-foreground/40 text-right">{t('agents.chat.inputHint')}</p>
        </div>
      </div>
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
  const [localRuntimeEnabled] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_AGENT_MODE_KEY) !== 'false'
    } catch {
      return true
    }
  })
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
        {localRuntimeEnabled && (
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
        )}
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
    try { localStorage.setItem(LOCAL_AGENT_MODE_KEY, 'true') } catch {}
    setActiveConversation(userId, convId)
  }

  return (
    <AgentShell density="compact" className="ai-agent-panel-shell">
      {activeConv ? (
        <ChatView
          conv={activeConv}
          userId={userId}
          onBack={() => setActiveConversation(userId, null)}
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
const LOCAL_AGENT_MODE_KEY = 'ai-panel-local-agent-runtime'
const LOCAL_AGENT_THREAD_IDS_KEY = 'ai-panel-local-agent-thread-ids'
const AGENT_DEBUG_PREVIEW_KEY = 'ai-panel-debug-preview'

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
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''

  function toggleOpen() {
    setOpen((v) => {
      const next = !v
      try { localStorage.setItem(PANEL_OPEN_KEY, String(next)) } catch {}
      return next
    })
  }

  return (
    <div className={cn(
      'ai-agent-panel shrink-0 border-l border-sidebar-border bg-background flex flex-col overflow-hidden transition-all duration-200',
      open ? 'w-[420px]' : 'w-11'
    )}>
      <div className="flex items-center h-11 border-b border-border shrink-0 px-2.5 gap-2">
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
