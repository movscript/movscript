import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ClipboardCheck, Copy, Loader2, Send, X } from 'lucide-react'
import { Badge, Button } from '@movscript/ui'
import { agentToolNameLabel } from '@/lib/agentToolDisplay'
import { agentPermissionModeLabel, runApprovalModeLabel, toolApprovalLabel, toolGrantModeLabel } from '@/lib/agentRunUi'
import type { AgentSendDraft, DebugHttpRequest } from '@/lib/agentSendDraft'
import type { AgentDraftApplyPreview } from '@/lib/localAgentClient'
import {
  localAgentApprovalImpactText,
  localAgentApprovalRiskText,
  localAgentApprovalStatusText,
} from '@/components/agent/localRuntime'
import { cn } from '@/lib/utils'

function emptyLabel(t: ReturnType<typeof useTranslation>['t']) {
  return t('agents.chat.panel.runtime.empty')
}

function countCharsLabel(t: ReturnType<typeof useTranslation>['t'], count: number) {
  return t('agents.chat.panel.runtime.chars', { count })
}

export function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export function AgentDebugPreviewDialog({
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
              <ClipboardCheck size={14} />
              <h2 className="type-body font-semibold text-foreground">{t('agents.chat.panel.debugPreview.title')}</h2>
              <Badge variant="secondary" className="type-tiny">{draft.route}</Badge>
              {primaryRequest && <Badge variant="outline" className="type-tiny">{primaryRequest.method}</Badge>}
            </div>
            <p className="mt-1 truncate type-caption text-muted-foreground">
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
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 type-label">
              <div className="mb-1 font-medium text-amber-800 dark:text-amber-300">{t('agents.chat.panel.debugPreview.warnings')}</div>
              <ul className="space-y-1 type-caption text-muted-foreground">
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
              <div className="grid gap-2 type-caption md:grid-cols-3">
                <DebugSummaryItem label={t('agents.chat.panel.debugPreview.route')} value={preview.context.route.pathname} />
                <DebugSummaryItem label={t('agents.chat.panel.debugPreview.project')} value={preview.context.project ? `#${preview.context.project.id} ${preview.context.project.name ?? ''}`.trim() : t('common.emptyTitle')} />
                <DebugSummaryItem label={t('agents.chat.panel.debugPreview.memories')} value={String(preview.context.memories.length)} />
              </div>
              {(preview.context.recentResources.length > 0 || preview.context.attachments.length > 0) && (
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 type-tiny">
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
                <div className="type-caption text-muted-foreground">{t('agents.chat.panel.runtime.noEnabledSkills')}</div>
              ) : (
                <div className="space-y-1.5">
                  {preview.skills.map((skill) => (
                    <div key={skill.id} className="rounded-md border border-border bg-muted/20 p-2 type-caption">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{skill.name}</span>
                        <Badge variant="outline" className="type-micro">p{skill.resolvedPriority}</Badge>
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
              <div className="grid gap-2 type-caption md:grid-cols-4">
                <DebugSummaryItem label={t('agents.chat.panel.runtime.approvalMode')} value={runApprovalModeLabel(preview.policy.approvalMode)} />
                <DebugSummaryItem label={t('agents.chat.panel.runtime.maxToolCalls')} value={String(preview.policy.maxToolCalls)} />
                <DebugSummaryItem label={t('agents.chat.panel.runtime.maxIterations')} value={String(preview.policy.maxIterations)} />
                <DebugSummaryItem label={t('agents.chat.panel.runtime.fileBytes')} value={preview.policy.allowFileBytes ? t('agents.chat.panel.capabilities.approval.always') : t('agents.chat.panel.capabilities.approval.never')} />
              </div>
              <div className="mt-2 grid gap-2 type-caption md:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 type-tiny font-medium text-foreground">{t('agents.chat.panel.runtime.runtimeBoundaries')}</div>
                  <div className="space-y-0.5 type-tiny text-muted-foreground">
                    <div>{t('agents.chat.panel.runtime.network')}: {preview.policy.allowNetwork ? t('agents.chat.panel.runtime.allowed') : t('agents.chat.panel.runtime.blocked')}</div>
                    <div>{t('agents.chat.panel.runtime.fileBytes')}: {preview.policy.allowFileBytes ? t('agents.chat.panel.runtime.allowed') : t('agents.chat.panel.runtime.blocked')}</div>
                    <div>{t('agents.chat.panel.runtime.costLimit')}: {preview.policy.costLimit ? `${preview.policy.costLimit.amount} ${preview.policy.costLimit.currency}` : t('agents.chat.panel.runtime.none')}</div>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 type-tiny font-medium text-foreground">{t('agents.chat.panel.runtime.manifestGrants')}</div>
                  <div className="space-y-0.5 type-tiny text-muted-foreground">
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
                  <div className="mb-1 type-tiny font-medium text-foreground">{t('agents.chat.panel.runtime.availableTools')}</div>
                  <div className="space-y-1 type-tiny text-muted-foreground">
                    {preview.tools.available.slice(0, 8).map((tool) => (
                      <div key={tool.name}>{agentToolNameLabel(tool.name, t)} · {tool.risk ? localAgentApprovalRiskText(tool.risk, t) : t('agents.chat.panel.runtime.unknown')} · {toolApprovalLabel(tool.approval)}</div>
                    ))}
                    {preview.tools.available.length === 0 && <div>{t('agents.chat.panel.runtime.none')}</div>}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 type-tiny font-medium text-foreground">{t('agents.chat.panel.runtime.blockedTools')}</div>
                  <div className="space-y-1 type-tiny text-muted-foreground">
                    {preview.tools.blocked.slice(0, 8).map((tool) => (
                      <div key={tool.name}>{agentToolNameLabel(tool.name, t)} · {tool.unavailableReason ?? t('agents.chat.panel.runtime.blocked')}</div>
                    ))}
                    {preview.tools.blocked.length === 0 && <div>{t('agents.chat.panel.runtime.none')}</div>}
                  </div>
                </div>
              </div>
            </DebugSection>
          )}

          {preview && (
            <DebugSection title={t('agents.chat.panel.runtime.agenticLoopPreview')}>
              <div className="space-y-2 type-caption">
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
                        <Badge variant="outline" className="type-micro">{t('agents.chat.panel.runtime.tool')}</Badge>
                      </div>
                      {call.args && (
                        <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 type-tiny">
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
              <div className="space-y-2 type-caption">
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
                  <div className="rounded-md border border-border bg-muted/20 p-2">
                    <div className="mb-1 font-medium text-foreground">{t('agents.chat.workflow.approvalRequired')}</div>
                    <div className="space-y-1">
                      {pendingApprovals.map((approval) => (
                        <div key={approval.id} className="rounded border border-border/70 bg-background/70 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground" title={approval.toolName}>{agentToolNameLabel(approval.toolName, t)}</span>
                            <Badge variant="warning" className="type-micro">{approval.risk ? localAgentApprovalRiskText(approval.risk, t) : localAgentApprovalStatusText(approval.status, t)}</Badge>
                          </div>
                          <p className="mt-0.5 text-muted-foreground">{approval.reason}</p>
                          <div className="mt-1 rounded border border-border/70 bg-muted/20 px-1.5 py-1 type-tiny leading-relaxed text-muted-foreground">
                            <span className="font-medium">{t('agents.chat.workflow.approvalImpact.label')}: </span>
                            {localAgentApprovalImpactText(approval, t)}
                          </div>
                          {approval.args && (
                            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 type-tiny">
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
                    <Badge variant="outline" className="type-micro">{message.role}</Badge>
                    <span className="type-micro text-muted-foreground">{countCharsLabel(t, message.content.length)}</span>
                  </div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 type-tiny leading-relaxed text-foreground">
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
                      <Badge variant="outline" className="type-micro">{part.kind}</Badge>
                      <span className="type-tiny font-medium text-foreground">{part.title}</span>
                    </div>
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 type-tiny text-muted-foreground">
                      {part.content || emptyLabel(t)}
                    </pre>
                  </div>
                ))}
              </div>
            </DebugSection>
          )}

          <DebugSection title={t('agents.chat.panel.prompt.rawPayload')}>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 type-tiny leading-relaxed">
              {raw}
            </pre>
          </DebugSection>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button type="button" size="sm" variant="ghost" onClick={copyRaw} className="type-label">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? t('agents.chat.panel.debugPreview.copied') : t('agents.chat.panel.debugPreview.copyJson')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={sending}>
              {t('common.cancel')}
            </Button>
            <Button type="button" size="sm" onClick={onConfirm} disabled={sending}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {t('agents.chat.panel.debugPreview.send')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DebugSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1.5 type-caption font-semibold uppercase tracking-normal text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function DebugHttpRequestCard({ request, index }: { request: DebugHttpRequest; index: number }) {
  const { t } = useTranslation()
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-2.5 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-background type-tiny font-medium text-muted-foreground">
          {index + 1}
        </span>
        <Badge variant={request.conditional ? 'secondary' : 'outline'} className="type-micro">
          {request.conditional ? t('common.switch') : request.method}
        </Badge>
        {request.conditional && <Badge variant="outline" className="type-micro">{request.method}</Badge>}
        <span className="min-w-0 flex-1 truncate type-caption font-medium text-foreground">{request.label}</span>
      </div>
      <div className="space-y-2 p-2.5">
        <div className="min-w-0 rounded border border-border/70 bg-muted/20 px-2 py-1.5 font-mono type-tiny text-foreground">
          <span className="font-semibold">{request.method}</span> <span className="break-all">{request.url}</span>
        </div>
        {request.note && (
          <p className="type-tiny leading-relaxed text-muted-foreground">{request.note}</p>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          {request.headers && (
            <div>
              <div className="mb-1 type-micro font-medium uppercase tracking-normal text-muted-foreground">{t('agents.chat.panel.runtime.headers')}</div>
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded border border-border/70 bg-muted/20 p-2 type-tiny">
                {safeJSONStringify(request.headers)}
              </pre>
            </div>
          )}
          {request.body !== undefined && (
            <div className={request.headers ? '' : 'md:col-span-2'}>
              <div className="mb-1 type-micro font-medium uppercase tracking-normal text-muted-foreground">{t('agents.chat.panel.runtime.body')}</div>
              <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded border border-border/70 bg-muted/20 p-2 type-tiny">
                {safeJSONStringify(request.body)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function DebugSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/20 px-2 py-1.5">
      <div className="type-micro uppercase tracking-normal text-muted-foreground">{label}</div>
      <div className="truncate type-caption font-medium text-foreground" title={value}>{value}</div>
    </div>
  )
}

function asString(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
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

export function DraftDiff({ preview }: { preview: AgentDraftApplyPreview }) {
  const { t } = useTranslation()
  const rows = diffRows(preview.review.currentValue, preview.review.proposedValue)
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="grid border-b border-border bg-muted/30 type-tiny font-medium text-muted-foreground md:grid-cols-2">
        <div className="border-b border-border px-2 py-1.5 md:border-b-0 md:border-r">{t('agents.chat.panel.drafts.current')}</div>
        <div className="px-2 py-1.5">{t('agents.chat.panel.drafts.proposed')}</div>
      </div>
      <div className="grid md:grid-cols-2">
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-b border-border bg-red-500/5 p-2 type-tiny leading-relaxed text-red-700 md:border-b-0 md:border-r">
          {asString(preview.review.currentValue) || t('common.emptyTitle')}
        </pre>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words bg-green-500/5 p-2 type-tiny leading-relaxed text-green-700">
          {asString(preview.review.proposedValue) || t('common.emptyTitle')}
        </pre>
      </div>
      <div className="border-t border-border bg-muted/20 p-2">
        <div className="max-h-36 overflow-auto rounded border border-border bg-background font-mono type-tiny">
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

export function isDraftApplyPreview(value: unknown): value is AgentDraftApplyPreview {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<AgentDraftApplyPreview>
  return !!record.review
    && typeof record.review === 'object'
    && typeof record.review.draftId === 'string'
    && !!record.draft
}
