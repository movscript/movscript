import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Bot, ChevronRight, Send, Loader2,
  Plus, ArrowLeft, Copy, Check, Settings, MessageSquare, X,
  Paperclip, Image, Video, FileText, Mic, File, Workflow, ShieldCheck, Brain,
  Sparkles, Search, ListChecks, Upload, Eye, Wand2, ClipboardCheck,
  Trash2, RefreshCw, History, Database, Save,
} from 'lucide-react'
import { api } from '@/lib/api'
import { translateApiError } from '@/lib/apiError'
import {
  canStartLocalAgentFromClient,
  localAgentClient,
  type AgentHealth,
  type AgentMemory,
  type AgentMemoryKind,
  type AgentMemoryScope,
  type AgentManifest,
  type AgentRun,
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
  type UserAgent,
  type AgentTemplate,
  type AgentAttachment,
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

function buildLocalAgentManifest(agent: (UserAgent | AgentTemplate) | null): AgentManifest | undefined {
  if (!agent) return undefined
  return {
    schema: 'movscript.agent.v1',
    id: `movscript.ui-agent.${agent.id}`,
    version: String(agent.updated_at || 1),
    name: agent.name,
    description: agent.soul || undefined,
    soul: agent.soul || undefined,
    permissions: ['project.read', 'draft.read', 'draft.write', 'ui.navigate'],
    tools: [
      { name: 'movscript.search_entities', mode: 'allow', approval: 'never' },
      { name: 'movscript.read_entity', mode: 'allow', approval: 'never' },
      { name: 'movscript.create_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript.list_drafts', mode: 'allow', approval: 'never' },
      { name: 'movscript.open_entity', mode: 'allow', approval: 'never' },
    ],
    metadata: {
      source: 'movscript-ui',
      skillIds: (agent.skills ?? []).map((skill) => skill.id),
    },
  }
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

  return (
    <div className="mx-1 my-2 rounded-md border border-border bg-background/70 p-2.5 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <Workflow size={13} />
          <span className="truncate">Agent workflow</span>
        </div>
        <Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'in_progress' ? 'secondary' : 'outline'} className="shrink-0 text-[9px]">
          {run.status}
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
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">{approval.toolName}</span>
                  {approval.risk && (
                    <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                      {approval.risk}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{approval.reason}</p>
                {approval.permission && (
                  <p className="mt-0.5 truncate text-[9px] text-muted-foreground/70">permission: {approval.permission}</p>
                )}
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

// ── Agent picker ──────────────────────────────────────────────────────────────

function AgentPicker({ onSelect, onCancel }: {
  onSelect: (userAgentId: number | null) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: templates = [] } = useQuery<AgentTemplate[]>({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then((r) => r.data),
  })
  const { data: myAgents = [] } = useQuery<UserAgent[]>({
    queryKey: ['agents', 'my'],
    queryFn: () => api.get('/agents/my').then((r) => r.data),
  })

  async function pickTemplate(tpl: AgentTemplate) {
    // Find or create a UserAgent linked to this template
    const existing = myAgents.find((a) => a.source_template_id === tpl.id)
    if (existing) {
      onSelect(existing.id)
      return
    }
    const { data } = await api.post('/agents/my', {
      name: tpl.name,
      source_template_id: tpl.id,
      accept_platform_updates: true,
      soul: tpl.soul,
      skills: tpl.skills,
      platform_model_id: tpl.platform_model_id,
    })
    qc.invalidateQueries({ queryKey: ['agents', 'my'] })
    onSelect(data.id)
  }

  return (
    <AgentMain>
      <AgentHeader>
        <AgentHeaderContent>
          <AgentTitle>{t('agents.chat.selectAgent')}</AgentTitle>
          <AgentSubtitle>{t('agents.chat.aiAssistant')}</AgentSubtitle>
        </AgentHeaderContent>
        <AgentHeaderActions>
          <Button size="icon-sm" variant="ghost" onClick={onCancel} aria-label="Close">
          <X size={14} />
          </Button>
        </AgentHeaderActions>
      </AgentHeader>
      <AgentBody>
        <ScrollArea className="h-full">
          <div className="p-3 space-y-4">
          {/* Platform templates */}
          {templates.length > 0 && (
            <AgentSidebarSection className="p-0">
              <AgentSidebarTitle className="px-1">{t('agents.chat.platformTemplates')}</AgentSidebarTitle>
              {templates.map((tpl) => (
                <AgentConversationItem
                  key={tpl.id}
                  onClick={() => pickTemplate(tpl)}
                  title={tpl.name}
                  description={tpl.soul}
                />
              ))}
            </AgentSidebarSection>
          )}

          {/* User's own agents */}
          {myAgents.length > 0 && (
            <AgentSidebarSection className="p-0">
              <AgentSidebarTitle className="px-1">{t('agents.chat.myAgents')}</AgentSidebarTitle>
              {myAgents.map((agent) => (
                <AgentConversationItem
                  key={agent.id}
                  onClick={() => onSelect(agent.id)}
                  title={agent.name}
                  description={agent.soul}
                />
              ))}
            </AgentSidebarSection>
          )}

          {/* No agent option */}
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => onSelect(null)}>
            {t('agents.chat.noAgent')}
          </Button>

          <div className="pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { onCancel(); navigate('/agents') }}
              className="w-full justify-center text-muted-foreground"
            >
              {t('agents.chat.manageMyAgents')}
            </Button>
          </div>
          </div>
        </ScrollArea>
      </AgentBody>
    </AgentMain>
  )
}

function AgentMiniPicker({
  value,
  onChange,
  myAgents,
}: {
  value: number | null
  onChange: (id: number | null) => void
  myAgents: UserAgent[]
}) {
  const { t } = useTranslation()
  return (
    <Select value={value === null ? 'none' : String(value)} onValueChange={(next) => onChange(next === 'none' ? null : Number(next))}>
      <SelectTrigger size="sm" className="min-w-0 flex-1" title={t('agents.chat.identity')}>
        <SelectValue placeholder={t('agents.chat.noAgentShort')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t('agents.chat.noAgentShort')}</SelectItem>
        {myAgents.map((agent) => (
          <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ModeButton({
  mode,
  active,
  icon,
  label,
  onClick,
}: {
  mode: AgentWorkMode
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: (mode: AgentWorkMode) => void
}) {
  return (
    <Button
      type="button"
      onClick={() => onClick(mode)}
      title={label}
      variant={active ? 'secondary' : 'ghost'}
      size="xs"
      className={cn(
        'h-8 min-w-0 flex-1 px-2 text-[10px]',
        active ? 'border border-border text-foreground shadow-sm' : 'text-muted-foreground'
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Button>
  )
}

function AgentCapabilityStrip({ effectiveAgent }: { effectiveAgent: (UserAgent | AgentTemplate) | null }) {
  const { t } = useTranslation()
  const skills = effectiveAgent?.skills ?? []
  const items = [
    { icon: <Brain size={11} />, label: t('agents.chat.capabilities.memory') },
    { icon: <Paperclip size={11} />, label: t('agents.chat.capabilities.multimodal') },
    { icon: <Workflow size={11} />, label: t('agents.chat.capabilities.workflow') },
    { icon: <ShieldCheck size={11} />, label: t('agents.chat.capabilities.audit') },
  ]
  return (
    <div className="px-3 py-2 border-b border-border bg-background/75 space-y-1.5">
      <div className="grid grid-cols-4 gap-1">
        {items.map((item) => (
          <div key={item.label} title={item.label} className="h-8 rounded-md border border-border bg-background flex items-center justify-center text-muted-foreground shadow-sm">
            {item.icon}
          </div>
        ))}
      </div>
      {skills.length > 0 && (
        <div className="flex gap-1 overflow-hidden">
          {skills.slice(0, 3).map((skill) => (
            <Badge key={skill.id} variant="secondary" className="min-w-0 max-w-full truncate text-[9px] leading-4 px-1.5 py-0">
              {skill.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
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

// ── Chat view ─────────────────────────────────────────────────────────────────

function ChatView({ conv, userId, onBack }: { conv: Conversation; userId: string; onBack: () => void }) {
  const { t } = useTranslation()
  const {
    settings,
    addMessage,
    updateConversationTitle,
    updateSettings,
    updateConversationAgent,
  } = useAgentStore()
  const qc = useQueryClient()
  const currentProject = useProjectStore((s) => s.current)
  const { data: textModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'text'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
  })
  const { data: resourcesData } = useQuery<RawResource[] | { items: RawResource[] }>({
    queryKey: ['resources', 'agent-panel'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 24, type: 'image,video,audio,text' } }).then((r) => r.data),
  })
  const { data: myAgents = [] } = useQuery<UserAgent[]>({
    queryKey: ['agents', 'my'],
    queryFn: () => api.get('/agents/my').then((r) => r.data),
  })
  const { data: templates = [] } = useQuery<AgentTemplate[]>({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then((r) => r.data),
  })

  const userAgent = myAgents.find((a) => a.id === conv.userAgentId) ?? null

  // If agent follows platform updates, merge template soul/skills/model
  const effectiveAgent = (() => {
    if (!userAgent) return null
    if (userAgent.accept_platform_updates && userAgent.source_template_id) {
      const tpl = templates.find((t) => t.id === userAgent.source_template_id)
      if (tpl) return { ...userAgent, soul: tpl.soul, skills: tpl.skills, platform_model_id: tpl.platform_model_id }
    }
    return userAgent
  })()

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
      return localStorage.getItem(LOCAL_AGENT_MODE_KEY) === 'true'
    } catch {
      return false
    }
  })
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

  const selectedFallbackModelId = settings.modelId ?? textModels[0]?.id ?? null
  const modelId = effectiveAgent?.platform_model_id ?? selectedFallbackModelId
  const systemPrompt = effectiveAgent?.soul ?? ''
  const recentResources = Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? [])
  const activeModel = textModels.find((m) => m.id === modelId)
  const contextLabels = [
    localRuntimeEnabled ? 'Local Runtime' : null,
    settings.includeProjectContext && currentProject ? currentProject.name : null,
    settings.includeRecentResources && recentResources.length > 0 ? t('agents.chat.recentResourcesCount', { count: Math.min(recentResources.length, 8) }) : null,
    attachments.length > 0 ? t('agents.chat.attachmentsCount', { count: attachments.length }) : null,
  ].filter(Boolean) as string[]
  const canSend = (!!input.trim() || attachments.length > 0) && !loading && !uploading
  const localAgentOnline = !!localAgentHealth?.ok && !localAgentHealthError
  const canAutoStartLocalAgent = canStartLocalAgentFromClient()
  const localAgentErrorMessage = localAgentStartError
    ?? (!localAgentOnline && localAgentHealthError instanceof Error ? localAgentHealthError.message : null)

  function setLocalRuntimeEnabled(next: boolean) {
    setLocalRuntimeEnabledState(next)
    try { localStorage.setItem(LOCAL_AGENT_MODE_KEY, String(next)) } catch {}
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
        addMessage(userId, conv.id, {
          role: 'assistant',
          content: formatLocalAgentAssistantContent(finalRun, thread),
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
      addMessage(userId, conv.id, {
        role: 'assistant',
        content: formatLocalAgentAssistantContent(rejectedRun, thread),
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

  const send = useCallback(async () => {
    const text = input.trim()
    if ((!text && attachments.length === 0) || loading || uploading) return
    if (!localRuntimeEnabled && !modelId) {
      addMessage(userId, conv.id, { role: 'assistant', content: t('agents.chat.selectModelFirst') })
      return
    }
    setInput('')
    const sentAttachments = attachments
    setAttachments([])
    setLoading(true)
    setActiveLocalRun(null)

    addMessage(userId, conv.id, {
      role: 'user',
      content: text || t('agents.chat.attachmentOnlyMessage'),
      attachments: sentAttachments,
      meta: {
        modelId: localRuntimeEnabled ? null : modelId,
        agentName: localRuntimeEnabled ? 'Local Agent Runtime' : effectiveAgent?.name,
        mode: settings.mode,
        permissionMode: settings.permissionMode,
        contextLabels,
      },
    })
    if (conv.messages.length === 0) {
      const titleBase = text || sentAttachments[0]?.name || t('agents.chat.newConversation')
      updateConversationTitle(userId, conv.id, titleBase.slice(0, 30) + (titleBase.length > 30 ? '…' : ''))
    }

    const agentContext = buildAgentContext({
      mode: settings.mode,
      permissionMode: settings.permissionMode,
      autoPlan: settings.autoPlan,
      project: currentProject,
      recentResources,
      includeProjectContext: settings.includeProjectContext,
      includeRecentResources: settings.includeRecentResources,
    })
    const enrichedUserContent = `${text || t('agents.chat.attachmentOnlyMessage')}${attachmentPromptBlock(sentAttachments)}`
    const messages = [
      { role: 'system' as const, content: [systemPrompt, agentContext].filter(Boolean).join('\n\n') },
      ...conv.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: enrichedUserContent },
    ]

    try {
      if (localRuntimeEnabled) {
        if (!localAgentOnline) {
          await localAgentClient.ensureRunning()
          await refetchLocalAgentHealth()
        }
        const { run, thread } = await localAgentClient.runMessage({
          threadId: localAgentThreadIds[conv.id],
          message: enrichedUserContent,
          title: conv.title,
          projectId: currentProject?.ID,
        }, {
          onRunUpdate: setActiveLocalRun,
          agentManifest: buildLocalAgentManifest(effectiveAgent),
        })
        setLocalAgentThreadIds((cur) => {
          const next = { ...cur, [conv.id]: thread.id }
          writeLocalAgentThreadIds(next)
          return next
        })
        addMessage(userId, conv.id, {
          role: 'assistant',
          content: formatLocalAgentAssistantContent(run, thread),
          meta: { contextLabels: [`run ${run.status}`] },
        })
        return
      }

      const { data } = await api.post('/ai/chat', { model_config_id: modelId, messages })
      addMessage(userId, conv.id, { role: 'assistant', content: data.content })
    } catch (e: any) {
      if (localRuntimeEnabled) {
        const message = e instanceof Error ? e.message : String(e)
        addMessage(userId, conv.id, {
          role: 'assistant',
          content: `本地 Agent Runtime 暂不可用。\n\n启动命令：\`cd movscript-agent && npm run dev\`\n健康检查：\`${localAgentClient.baseURL}/health\`\n\n错误：${message}`,
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
    input,
    attachments,
    loading,
    uploading,
    conv,
    systemPrompt,
    modelId,
    localRuntimeEnabled,
    localAgentHealthError,
    localAgentOnline,
    refetchLocalAgentHealth,
    localAgentThreadIds,
    userId,
    addMessage,
    updateConversationTitle,
    updateSettings,
    t,
    effectiveAgent,
    settings,
    contextLabels,
    currentProject,
    recentResources,
  ])

  return (
    <AgentMain>
      <AgentHeader>
        <AgentHeaderContent>
          <AgentTitle>{conv.title}</AgentTitle>
          <AgentSubtitle>
            {localRuntimeEnabled ? 'Local Agent Runtime' : (effectiveAgent ? effectiveAgent.name : t('agents.chat.noAgentShort'))}
          </AgentSubtitle>
        </AgentHeaderContent>
        <AgentHeaderActions>
          <AgentStatus state={loading ? 'running' : 'ready'}>
            {loading ? t('common.loading') : t('agents.chat.messagesCount', { count: conv.messages.length })}
          </AgentStatus>
          <Button size="icon-sm" variant="ghost" onClick={onBack} aria-label="Back">
            <ArrowLeft size={14} />
          </Button>
        </AgentHeaderActions>
      </AgentHeader>
      <AgentCapabilityStrip effectiveAgent={effectiveAgent} />

      <AgentBody>
        <AgentThread>
          {conv.messages.length === 0 && (
            <AgentEmpty className="min-h-0 py-6">
              <p className="text-sm font-medium text-foreground">
                {effectiveAgent ? t('agents.chat.agentReady', { name: effectiveAgent.name }) : t('agents.chat.startChat')}
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
          <AgentMiniPicker
            value={conv.userAgentId}
            myAgents={myAgents}
            onChange={(id) => updateConversationAgent(userId, conv.id, id)}
          />
          {textModels.length > 0 && (
            <Select
              value={selectedFallbackModelId === null ? undefined : String(selectedFallbackModelId)}
              onValueChange={(next) => updateSettings({ modelId: Number(next) || null })}
              disabled={localRuntimeEnabled || !!effectiveAgent?.platform_model_id}
            >
              <SelectTrigger
                size="sm"
                className="min-w-0 flex-1"
                title={effectiveAgent?.platform_model_id ? t('agents.chat.modelLockedByAgent') : t('agents.model')}
              >
                <SelectValue placeholder={t('agents.model')} />
              </SelectTrigger>
              <SelectContent>
                {textModels.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            size="sm"
            variant={localRuntimeEnabled ? 'secondary' : 'outline'}
            onClick={() => setLocalRuntimeEnabled(!localRuntimeEnabled)}
            className="h-8 shrink-0 px-2 text-[10px]"
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
                {canAutoStartLocalAgent ? 'MovScript will start the local runtime through the desktop client.' : 'This window cannot start local processes. Open the Electron desktop client or start it manually.'} Browser mode can still start it manually with <code className="rounded bg-muted px-1 py-0.5">cd movscript-agent && npm run dev</code>.
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
        {!localRuntimeEnabled && activeModel && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
            <Wand2 size={10} />
            <span className="truncate">{activeModel.provider_name} · {activeModel.display_name}</span>
          </div>
        )}
        <div className="grid grid-cols-4 gap-1">
          <ModeButton mode="chat" active={settings.mode === 'chat'} label={t('agents.chat.modes.chat')} icon={<MessageSquare size={11} />} onClick={(mode) => updateSettings({ mode })} />
          <ModeButton mode="plan" active={settings.mode === 'plan'} label={t('agents.chat.modes.plan')} icon={<ListChecks size={11} />} onClick={(mode) => updateSettings({ mode })} />
          <ModeButton mode="create" active={settings.mode === 'create'} label={t('agents.chat.modes.create')} icon={<Sparkles size={11} />} onClick={(mode) => updateSettings({ mode })} />
          <ModeButton mode="review" active={settings.mode === 'review'} label={t('agents.chat.modes.review')} icon={<ClipboardCheck size={11} />} onClick={(mode) => updateSettings({ mode })} />
        </div>
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
          <MemoryPanel
            project={currentProject}
            threadId={localAgentThreadIds[conv.id]}
            online={localAgentOnline}
          />
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
            disabled={loading}
          />
          <AgentComposerToolbar>
            <div className="flex items-center gap-1">
              <AgentComposerAction
                onClick={() => fileRef.current?.click()}
                disabled={uploading || loading}
                aria-label={t('agents.chat.uploadAttachment')}
                title={t('agents.chat.uploadAttachment')}
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              </AgentComposerAction>
              {attachments.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{t('agents.chat.attachmentsCount', { count: attachments.length })}</Badge>
              )}
            </div>
            <AgentComposerSubmit disabled={!canSend} label={t('common.send')}>
              <Send size={15} />
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
      return localStorage.getItem(LOCAL_AGENT_MODE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [restoringThreadId, setRestoringThreadId] = useState<string | null>(null)
  const { data: myAgents = [] } = useQuery<UserAgent[]>({
    queryKey: ['agents', 'my'],
    queryFn: () => api.get('/agents/my').then((r) => r.data),
  })
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
            {conversations.map((conv) => {
              const agent = myAgents.find((a) => a.id === conv.userAgentId)
              return (
                <div key={conv.id} className="group relative">
                  <AgentConversationItem
                    onClick={() => onSelect(conv.id)}
                    title={conv.title}
                    description={agent ? agent.name : (conv.messages[conv.messages.length - 1]?.content.slice(0, 54) ?? '')}
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
              )
            })}
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
  const [picking, setPicking] = useState(false)

  const conversations = getConversations(userId)
  const activeConversationId = getActiveConversationId(userId)
  const activeConv = conversations.find((c) => c.id === activeConversationId) ?? null

  function handleNew() {
    setPicking(true)
  }

  function handlePickAgent(userAgentId: number | null) {
    setPicking(false)
    createConversation(userId, userAgentId)
  }

  async function handleRestoreLocalThread(threadId: string) {
    const thread = await localAgentClient.getThread(threadId)
    const convId = createConversation(userId, null)
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
      {picking ? (
        <AgentPicker onSelect={handlePickAgent} onCancel={() => setPicking(false)} />
      ) : activeConv ? (
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
  const navigate = useNavigate()
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
            onClick={(e) => { e.stopPropagation(); navigate('/agents') }}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title={t('agents.chat.manageAgent')}
          >
            <Settings size={13} />
          </Button>
        )}
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
