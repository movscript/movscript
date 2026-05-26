import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ClipboardCheck, Copy, Loader2, Send, X } from 'lucide-react'
import {
  AgentDataBlock,
  AgentDebugCard,
  AgentDebugCardDetail,
  AgentDebugCardHeader,
  AgentDebugCardTitle,
  AgentDebugCodePanel,
  AgentDebugDialogBody,
  AgentDebugDialogDescription,
  AgentDebugDialogFooter,
  AgentDebugDialogFooterActions,
  AgentDebugDialogHeader,
  AgentDebugDialogHeaderCopy,
  AgentDebugDialogOverlay,
  AgentDebugDialogSurface,
  AgentDebugDialogTitle,
  AgentDebugDialogTitleRow,
  AgentDebugDraftDiffCodeBlock,
  AgentDebugDraftDiffColumns,
  AgentDebugDraftDiffHeader,
  AgentDebugDraftDiffLine,
  AgentDebugDraftDiffRows,
  AgentDebugDraftDiffShell,
  AgentDebugErrorCallout,
  AgentDebugFieldCodePanel,
  AgentDebugGrid,
  AgentDebugHttpRequestBody,
  AgentDebugHttpRequestHeader,
  AgentDebugHttpRequestShell,
  AgentDebugHttpRequestTitle,
  AgentDebugHttpRequestUrl,
  AgentDebugIcon,
  AgentDebugInlineMeta,
  AgentDebugItemTitle,
  AgentDebugIssueList,
  AgentDebugLabeledCodePanel,
  AgentDebugMetaList,
  AgentDebugPreviewActionButton,
  AgentDebugPreviewBadge,
  AgentDebugPreviewStatusBadge,
  AgentDebugSection,
  AgentDebugSimpleText,
  AgentDebugStack,
  AgentDebugSubtleText,
  AgentDebugSummaryItem,
  AgentDebugToneText,
  AgentDebugWarningCallout,
} from '@movscript/ui'
import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { agentPermissionModeLabel, runApprovalModeLabel, toolApprovalLabel, toolGrantModeLabel } from '@/features/agent/domain/agentRunUi'
import type { AgentSendDraft, DebugHttpRequest } from '@/features/agent/application/agentSendDraft'
import type { AgentDebugTool, AgentDraftApplyPreview } from '@/shared/infrastructure/localAgentClient'
import {
  localAgentApprovalImpactText,
  localAgentApprovalRiskText,
  localAgentApprovalStatusText,
} from '@/features/agent/components/localRuntime'
import { agentWorkflowActionStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'

function emptyLabel(t: ReturnType<typeof useTranslation>['t']) {
  return t('agents.chat.panel.runtime.empty')
}

function countCharsLabel(t: ReturnType<typeof useTranslation>['t'], count: number) {
  return t('agents.chat.panel.runtime.chars', { count })
}

export function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function toolResolutionLabel(tool: AgentDebugTool, t: ReturnType<typeof useTranslation>['t']) {
  const resolution = tool.resolution
  if (!resolution) return tool.unavailableReason ?? t('agents.chat.panel.runtime.unknown')
  return [
    `${t('agents.chat.panel.runtime.authorized')}: ${resolution.authorized ? t('agents.chat.panel.runtime.yes') : t('agents.chat.panel.runtime.no')}`,
    `${t('agents.chat.panel.runtime.visible')}: ${resolution.visible ? t('agents.chat.panel.runtime.yes') : t('agents.chat.panel.runtime.no')}`,
    `${t('agents.chat.panel.runtime.grant')}: ${resolution.grantSource}`,
    `${t('agents.chat.panel.runtime.activeSkills')}: ${resolution.activeSkillIds.length}`,
    resolution.reason ? `${t('agents.chat.panel.runtime.reason')}: ${resolution.reason}` : undefined,
  ].filter(Boolean).join(' · ')
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
    <AgentDebugDialogOverlay>
      <AgentDebugDialogSurface>
        <AgentDebugDialogHeader>
          <AgentDebugDialogHeaderCopy>
            <AgentDebugDialogTitleRow>
              <ClipboardCheck size={14} />
              <AgentDebugDialogTitle>{t('agents.chat.panel.debugPreview.title')}</AgentDebugDialogTitle>
              <AgentDebugPreviewBadge>{draft.route}</AgentDebugPreviewBadge>
              {primaryRequest && <AgentDebugPreviewBadge variant="outline">{primaryRequest.method}</AgentDebugPreviewBadge>}
            </AgentDebugDialogTitleRow>
            <AgentDebugDialogDescription>
              {primaryRequest ? primaryRequest.url : draft.id}
            </AgentDebugDialogDescription>
          </AgentDebugDialogHeaderCopy>
          <AgentDebugPreviewActionButton type="button" size="icon-sm" variant="ghost" onClick={onCancel} disabled={sending} aria-label={t('agents.chat.panel.debugPreview.close')}>
            <X size={14} />
          </AgentDebugPreviewActionButton>
        </AgentDebugDialogHeader>

        <AgentDebugDialogBody>
          <AgentDebugGrid columns="four">
            <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.model')} value={String(draft.model.name ?? draft.model.id ?? t('common.emptyTitle'))} />
            <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.agent')} value={draft.agent.name ?? t('agents.chat.panel.debugPreview.agent')} />
            <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.approvalMode')} value={agentPermissionModeLabel(draft.settings.permissionMode)} />
            <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.requests')} value={String(draft.httpRequests.length)} />
          </AgentDebugGrid>

          {draft.warnings.length > 0 && (
            <AgentDebugWarningCallout>
              <AgentDebugToneText as="div" tone="warning">{t('agents.chat.panel.debugPreview.warnings')}</AgentDebugToneText>
              <AgentDebugIssueList items={draft.warnings} />
            </AgentDebugWarningCallout>
          )}

          <AgentDebugSection title={t('agents.chat.panel.prompt.finalHttpRequests')}>
            <AgentDebugStack density="compact">
              {draft.httpRequests.map((request, index) => (
                <DebugHttpRequestCard key={request.id} request={request} index={index} />
              ))}
            </AgentDebugStack>
          </AgentDebugSection>

          {preview?.context && (
            <AgentDebugSection title={t('agents.chat.panel.debugPreview.context')}>
              <AgentDebugGrid columns="three">
                <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.route')} value={preview.context.route.pathname} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.project')} value={preview.context.project ? `#${preview.context.project.id} ${preview.context.project.name ?? ''}`.trim() : t('common.emptyTitle')} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.memories')} value={String(preview.context.memories.length)} />
              </AgentDebugGrid>
              {(preview.context.recentResources.length > 0 || preview.context.attachments.length > 0) && (
                <AgentDebugCodePanel>
                  {safeJSONStringify({
                    selection: preview.context.selection,
                    recentResources: preview.context.recentResources,
                    attachments: preview.context.attachments,
                  })}
                </AgentDebugCodePanel>
              )}
            </AgentDebugSection>
          )}

          {preview?.skills && (
            <AgentDebugSection title={t('agents.chat.panel.capabilities.skills')}>
              {preview.skills.length === 0 ? (
                <AgentDebugSubtleText>{t('agents.chat.panel.runtime.noEnabledSkills')}</AgentDebugSubtleText>
              ) : (
                <AgentDebugStack density="compact">
                  {preview.skills.map((skill) => (
                    <AgentDebugCard key={skill.id}>
                      <AgentDebugCardHeader>
                        <AgentDebugCardTitle>{skill.name}</AgentDebugCardTitle>
                        <AgentDebugPreviewBadge variant="outline">p{skill.resolvedPriority}</AgentDebugPreviewBadge>
                      </AgentDebugCardHeader>
                      <AgentDebugCardDetail>{skill.description || skill.compiledInstruction || t('agents.chat.panel.runtime.noInstruction')}</AgentDebugCardDetail>
                    </AgentDebugCard>
                  ))}
                </AgentDebugStack>
              )}
            </AgentDebugSection>
          )}

          {preview?.policy && (
            <AgentDebugSection title={t('agents.chat.panel.runtime.policy')}>
              <AgentDebugGrid columns="four">
                <AgentDebugSummaryItem label={t('agents.chat.panel.runtime.approvalMode')} value={runApprovalModeLabel(preview.policy.approvalMode)} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.runtime.maxToolCalls')} value={String(preview.policy.maxToolCalls)} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.runtime.maxIterations')} value={String(preview.policy.maxIterations)} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.runtime.fileBytes')} value={preview.policy.allowFileBytes ? t('agents.chat.panel.capabilities.approval.always') : t('agents.chat.panel.capabilities.approval.never')} />
              </AgentDebugGrid>
              <AgentDebugGrid columns="two">
                <AgentDataBlock>
                  <AgentDebugItemTitle>{t('agents.chat.panel.runtime.runtimeBoundaries')}</AgentDebugItemTitle>
                  <AgentDebugMetaList
                    items={[
                      `${t('agents.chat.panel.runtime.network')}: ${preview.policy.allowNetwork ? t('agents.chat.panel.runtime.allowed') : t('agents.chat.panel.runtime.blocked')}`,
                      `${t('agents.chat.panel.runtime.fileBytes')}: ${preview.policy.allowFileBytes ? t('agents.chat.panel.runtime.allowed') : t('agents.chat.panel.runtime.blocked')}`,
                      `${t('agents.chat.panel.runtime.costLimit')}: ${preview.policy.costLimit ? `${preview.policy.costLimit.amount} ${preview.policy.costLimit.currency}` : t('agents.chat.panel.runtime.none')}`,
                    ]}
                  />
                </AgentDataBlock>
                <AgentDataBlock>
                  <AgentDebugItemTitle>{t('agents.chat.panel.runtime.manifestGrants')}</AgentDebugItemTitle>
                  <AgentDebugMetaList
                    empty={t('agents.chat.panel.runtime.none')}
                    items={(preview.agentManifest?.tools ?? []).slice(0, 8).map((grant) => `${grant.name} · ${toolGrantModeLabel(grant.mode)} · ${grant.approval ? toolApprovalLabel(grant.approval) : t('agents.chat.panel.debugPreview.default')}`)}
                  />
                </AgentDataBlock>
              </AgentDebugGrid>
            </AgentDebugSection>
          )}

          {preview?.tools && (
            <AgentDebugSection title={t('agents.chat.panel.capabilities.tools')}>
              <AgentDebugGrid columns="three">
                <AgentDebugSummaryItem label={t('agents.chat.panel.runtime.available')} value={String(preview.tools.available.length)} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.runtime.blocked')} value={String(preview.tools.blocked.length)} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.runtime.discovered')} value={String(preview.tools.discovered.length)} />
              </AgentDebugGrid>
              <AgentDebugGrid columns="two">
                <AgentDataBlock>
                  <AgentDebugItemTitle>{t('agents.chat.panel.runtime.availableTools')}</AgentDebugItemTitle>
                  <AgentDebugMetaList
                    empty={t('agents.chat.panel.runtime.none')}
                    items={preview.tools.available.slice(0, 8).map((tool) => (
                      `${agentToolNameLabel(tool.name, t)} · ${tool.risk ? localAgentApprovalRiskText(tool.risk, t) : t('agents.chat.panel.runtime.unknown')} · ${toolApprovalLabel(tool.approval)} · ${toolResolutionLabel(tool, t)}`
                    ))}
                  />
                </AgentDataBlock>
                <AgentDataBlock>
                  <AgentDebugItemTitle>{t('agents.chat.panel.runtime.blockedTools')}</AgentDebugItemTitle>
                  <AgentDebugMetaList
                    empty={t('agents.chat.panel.runtime.none')}
                    items={preview.tools.blocked.slice(0, 8).map((tool) => (
                      `${agentToolNameLabel(tool.name, t)} · ${tool.unavailableReason ?? t('agents.chat.panel.runtime.blocked')} · ${toolResolutionLabel(tool, t)}`
                    ))}
                  />
                </AgentDataBlock>
              </AgentDebugGrid>
            </AgentDebugSection>
          )}

          {preview && (
            <AgentDebugSection title={t('agents.chat.panel.runtime.agenticLoopPreview')}>
              <AgentDebugStack density="compact">
                <AgentDataBlock>
                  <AgentDebugSimpleText>{preview.message}</AgentDebugSimpleText>
                  <AgentDebugSubtleText>
                    {t('agents.chat.panel.runtime.project')}: {preview.currentProjectId ?? t('common.emptyTitle')} · {t('agents.chat.panel.runtime.memories')}: {preview.memoryCount} · {t('agents.chat.panel.runtime.toolCalls')}: {preview.toolCalls.length} · {t('agents.chat.panel.runtime.sandbox')}: {preview.policy?.sandboxMode ? t('agents.chat.panel.runtime.on') : t('agents.chat.panel.runtime.off')}
                  </AgentDebugSubtleText>
                </AgentDataBlock>
                <AgentDebugStack density="compact">
                  {preview.toolCalls.length === 0 ? (
                    <AgentDebugCard>{t('agents.chat.panel.prompt.noImmediateToolCalls')}</AgentDebugCard>
                  ) : preview.toolCalls.map((call, index) => (
                    <AgentDebugCard key={`${call.name}-${index}`}>
                      <AgentDebugCardHeader>
                        <AgentDebugCardTitle>{index + 1}. {call.name}</AgentDebugCardTitle>
                        <AgentDebugPreviewBadge variant="outline">{t('agents.chat.panel.runtime.tool')}</AgentDebugPreviewBadge>
                      </AgentDebugCardHeader>
                      {call.args && (
                        <AgentDebugCodePanel size="small">{safeJSONStringify(call.args)}</AgentDebugCodePanel>
                      )}
                    </AgentDebugCard>
                  ))}
                </AgentDebugStack>
              </AgentDebugStack>
            </AgentDebugSection>
          )}

          {(draft.localRuntime || pendingApprovals.length > 0) && (
            <AgentDebugSection title={t('agents.chat.panel.prompt.approvals')}>
              <AgentDebugStack density="compact">
                {draft.localRuntime && (
                  <AgentDebugGrid columns="three">
                    <AgentDebugSummaryItem label={t('agents.chat.panel.status.thread')} value={draft.localRuntime.threadId ?? t('agents.chat.panel.status.newThread')} />
                    <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.mode')} value={draft.localRuntime.diagnosticCommand ? t('agents.chat.panel.debugPreview.diagnostic') : t('agents.chat.panel.debugPreview.conversation')} />
                    <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.agent')} value={t('agents.chat.panel.debugPreview.default')} />
                  </AgentDebugGrid>
                )}
                {draft.localRuntime?.previewError && (
                  <AgentDebugErrorCallout>
                    {draft.localRuntime.previewError}
                  </AgentDebugErrorCallout>
                )}
                {pendingApprovals.length > 0 ? (
                  <AgentDataBlock>
                    <AgentDebugItemTitle>{t('agents.chat.workflow.approvalRequired')}</AgentDebugItemTitle>
                    <AgentDebugStack density="compact">
                      {pendingApprovals.map((approval) => (
                        <AgentDebugCard key={approval.id} variant="card">
                          <AgentDebugCardHeader>
                            <AgentDebugCardTitle title={approval.toolName}>{agentToolNameLabel(approval.toolName, t)}</AgentDebugCardTitle>
                            <AgentDebugPreviewStatusBadge intent={agentWorkflowActionStatusRecipe('pending').intent} emphasis={agentWorkflowActionStatusRecipe('pending').emphasis}>{approval.risk ? localAgentApprovalRiskText(approval.risk, t) : localAgentApprovalStatusText(approval.status, t)}</AgentDebugPreviewStatusBadge>
                          </AgentDebugCardHeader>
                          <AgentDebugCardDetail>{approval.reason}</AgentDebugCardDetail>
                          <AgentDebugCard variant="subtle">
                            {t('agents.chat.workflow.approvalImpact.label')}: {localAgentApprovalImpactText(approval, t)}
                          </AgentDebugCard>
                          {approval.args && (
                            <AgentDebugCodePanel size="small">
                              {safeJSONStringify(approval.args)}
                            </AgentDebugCodePanel>
                          )}
                        </AgentDebugCard>
                      ))}
                    </AgentDebugStack>
                  </AgentDataBlock>
                ) : (
                  <AgentDataBlock>
                    {t('agents.chat.panel.prompt.noApprovalRequired')}
                  </AgentDataBlock>
                )}
              </AgentDebugStack>
            </AgentDebugSection>
          )}

          <AgentDebugSection title={t('agents.chat.panel.prompt.outboundMessages')}>
            <AgentDebugStack density="compact">
              {draft.outbound.messages.map((message, index) => (
                <AgentDebugLabeledCodePanel
                  key={`${message.role}-${index}`}
                  size="large"
                  leading={<AgentDebugPreviewBadge variant="outline">{message.role}</AgentDebugPreviewBadge>}
                  trailing={countCharsLabel(t, message.content.length)}
                >
                  {message.content || emptyLabel(t)}
                </AgentDebugLabeledCodePanel>
              ))}
            </AgentDebugStack>
          </AgentDebugSection>

          {preview?.promptPreview && (
            <AgentDebugSection title={t('agents.chat.panel.prompt.compiledPrompt')}>
              <AgentDebugStack density="compact">
                {preview.promptPreview.debugParts.map((part) => (
                  <AgentDebugLabeledCodePanel
                    key={part.id}
                    leading={(
                      <>
                        <AgentDebugPreviewBadge variant="outline">{part.kind}</AgentDebugPreviewBadge>
                        <AgentDebugItemTitle>{part.title}</AgentDebugItemTitle>
                      </>
                    )}
                  >
                    {part.content || emptyLabel(t)}
                  </AgentDebugLabeledCodePanel>
                ))}
              </AgentDebugStack>
            </AgentDebugSection>
          )}

          <AgentDebugSection title={t('agents.chat.panel.prompt.rawPayload')}>
            <AgentDebugCodePanel size="raw">{raw}</AgentDebugCodePanel>
          </AgentDebugSection>
        </AgentDebugDialogBody>

        <AgentDebugDialogFooter>
          <AgentDebugPreviewActionButton type="button" size="sm" variant="ghost" onClick={copyRaw}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? t('agents.chat.panel.debugPreview.copied') : t('agents.chat.panel.debugPreview.copyJson')}
          </AgentDebugPreviewActionButton>
          <AgentDebugDialogFooterActions>
            <AgentDebugPreviewActionButton type="button" size="sm" variant="outline" onClick={onCancel} disabled={sending}>
              {t('common.cancel')}
            </AgentDebugPreviewActionButton>
            <AgentDebugPreviewActionButton type="button" size="sm" onClick={onConfirm} disabled={sending}>
              {sending ? <AgentDebugIcon icon={Loader2} size={14} spinning /> : <Send size={14} />}
              {t('agents.chat.panel.debugPreview.send')}
            </AgentDebugPreviewActionButton>
          </AgentDebugDialogFooterActions>
        </AgentDebugDialogFooter>
      </AgentDebugDialogSurface>
    </AgentDebugDialogOverlay>
  )
}

function DebugHttpRequestCard({ request, index }: { request: DebugHttpRequest; index: number }) {
  const { t } = useTranslation()
  return (
    <AgentDebugHttpRequestShell>
      <AgentDebugHttpRequestHeader>
        <AgentDebugInlineMeta>
          {index + 1}
        </AgentDebugInlineMeta>
        <AgentDebugPreviewBadge variant={request.conditional ? 'soft' : 'outline'}>
          {request.conditional ? t('common.switch') : request.method}
        </AgentDebugPreviewBadge>
        {request.conditional && <AgentDebugPreviewBadge variant="outline">{request.method}</AgentDebugPreviewBadge>}
        <AgentDebugHttpRequestTitle>{request.label}</AgentDebugHttpRequestTitle>
      </AgentDebugHttpRequestHeader>
      <AgentDebugHttpRequestBody>
        <AgentDebugHttpRequestUrl method={request.method} url={request.url} />
        {request.note && (
          <AgentDebugSubtleText>{request.note}</AgentDebugSubtleText>
        )}
        <AgentDebugGrid columns="two">
          {request.headers && (
            <AgentDebugFieldCodePanel label={t('agents.chat.panel.runtime.headers')} size="medium">
              {safeJSONStringify(request.headers)}
            </AgentDebugFieldCodePanel>
          )}
          {request.body !== undefined && (
            <AgentDebugFieldCodePanel label={t('agents.chat.panel.runtime.body')} size="large" span={request.headers ? undefined : 'full'}>
              {safeJSONStringify(request.body)}
            </AgentDebugFieldCodePanel>
          )}
        </AgentDebugGrid>
      </AgentDebugHttpRequestBody>
    </AgentDebugHttpRequestShell>
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
    <AgentDebugDraftDiffShell>
      <AgentDebugDraftDiffHeader
        currentLabel={t('agents.chat.panel.drafts.current')}
        proposedLabel={t('agents.chat.panel.drafts.proposed')}
      />
      <AgentDebugDraftDiffColumns>
        <AgentDebugDraftDiffCodeBlock side="current">
          {asString(preview.review.currentValue) || t('common.emptyTitle')}
        </AgentDebugDraftDiffCodeBlock>
        <AgentDebugDraftDiffCodeBlock side="proposed">
          {asString(preview.review.proposedValue) || t('common.emptyTitle')}
        </AgentDebugDraftDiffCodeBlock>
      </AgentDebugDraftDiffColumns>
      <AgentDebugDraftDiffRows>
        {rows.map((row, index) => (
          <AgentDebugDraftDiffLine
            key={`${row.type}-${index}`}
            change={row.type}
          >
            {row.type === 'removed' ? '- ' : row.type === 'added' ? '+ ' : '  '}
            {row.text || emptyLabel(t)}
          </AgentDebugDraftDiffLine>
        ))}
      </AgentDebugDraftDiffRows>
    </AgentDebugDraftDiffShell>
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
