import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ClipboardCheck, Copy, Loader2, Send, X } from 'lucide-react'
import { AgentDataBlock } from '@movscript/ui/business/agent'
import {
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
  AgentDebugWorkspaceDiffCodeBlock,
  AgentDebugWorkspaceDiffColumns,
  AgentDebugWorkspaceDiffHeader,
  AgentDebugWorkspaceDiffLine,
  AgentDebugWorkspaceDiffRows,
  AgentDebugWorkspaceDiffShell,
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
  AgentDebugWarningCallout
} from '@/features/agent/components/AgentDebugPreviewUi'
import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { runApprovalModeLabel, toolApprovalLabel, toolGrantModeLabel } from '@/features/agent/domain/agentRunUi'
import type { AgentSendWorkspace, DebugHttpRequest } from '@/features/agent/application/agentSendWorkspace'
import type { AgentRunPreview, ProviderToolDescriptor, WorkspaceArtifactApplyPreview } from '@/shared/infrastructure/providerSessionClient'
import {
  providerSessionApprovalImpactText,
  providerSessionApprovalRiskText,
  providerSessionApprovalStatusText,
} from '@/features/agent/components/providerSessionInteractions'
import { agentRunInteractionActionStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'

function emptyLabel(t: ReturnType<typeof useTranslation>['t']) {
  return t('agents.chat.panel.providerSession.empty')
}

function countCharsLabel(t: ReturnType<typeof useTranslation>['t'], count: number) {
  return t('agents.chat.panel.providerSession.chars', { count })
}

export function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function toolResolutionLabel(tool: ProviderToolDescriptor, t: ReturnType<typeof useTranslation>['t']) {
  const resolution = tool.resolution
  if (!resolution) return tool.unavailableReason ?? t('agents.chat.panel.providerSession.unknown')
  return [
    `${t('agents.chat.panel.providerSession.authorized')}: ${resolution.authorized ? t('agents.chat.panel.providerSession.yes') : t('agents.chat.panel.providerSession.no')}`,
    `${t('agents.chat.panel.providerSession.visible')}: ${resolution.visible ? t('agents.chat.panel.providerSession.yes') : t('agents.chat.panel.providerSession.no')}`,
    `${t('agents.chat.panel.providerSession.grant')}: ${resolution.grantSource}`,
    `${t('agents.chat.panel.providerSession.activeSkills')}: ${resolution.activeSkillIds.length}`,
    resolution.reason ? `${t('agents.chat.panel.providerSession.reason')}: ${resolution.reason}` : undefined,
  ].filter(Boolean).join(' · ')
}

function previewProviderSessionLimits(preview: AgentRunPreview | undefined) {
  return preview?.providerSessionLimits
}

export function AgentDebugPreviewDialog({
  workspace,
  sending,
  onCancel,
  onConfirm,
}: {
  workspace: AgentSendWorkspace | null
  sending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  if (!workspace) return null
  const raw = safeJSONStringify(workspace)
  const preview = workspace.providerSession?.preview
  const providerSessionLimits = previewProviderSessionLimits(preview)
  const pendingApprovals = preview?.pendingApprovals.filter((approval) => approval.status === 'pending') ?? []
  const primaryRequest = workspace.httpRequests[0]

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
              <AgentDebugPreviewBadge>{workspace.route}</AgentDebugPreviewBadge>
              {primaryRequest && <AgentDebugPreviewBadge variant="outline">{primaryRequest.method}</AgentDebugPreviewBadge>}
            </AgentDebugDialogTitleRow>
            <AgentDebugDialogDescription>
              {primaryRequest ? primaryRequest.url : workspace.id}
            </AgentDebugDialogDescription>
          </AgentDebugDialogHeaderCopy>
          <AgentDebugPreviewActionButton type="button" size="icon-sm" variant="ghost" onClick={onCancel} disabled={sending} aria-label={t('agents.chat.panel.debugPreview.close')}>
            <X size={14} />
          </AgentDebugPreviewActionButton>
        </AgentDebugDialogHeader>

        <AgentDebugDialogBody>
          <AgentDebugGrid columns="four">
            <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.model')} value={String(workspace.model.name ?? workspace.model.id ?? t('common.emptyTitle'))} />
            <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.agent')} value={workspace.agent.name ?? t('agents.chat.panel.debugPreview.agent')} />
            <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.approvalMode')} value={providerSessionLimits ? runApprovalModeLabel(providerSessionLimits.approvalMode) : t('agents.chat.panel.providerSession.unknown')} />
            <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.requests')} value={String(workspace.httpRequests.length)} />
          </AgentDebugGrid>

          {workspace.warnings.length > 0 && (
            <AgentDebugWarningCallout>
              <AgentDebugToneText as="div" tone="warning">{t('agents.chat.panel.debugPreview.warnings')}</AgentDebugToneText>
              <AgentDebugIssueList items={workspace.warnings} />
            </AgentDebugWarningCallout>
          )}

          <AgentDebugSection title={t('agents.chat.panel.prompt.finalHttpRequests')}>
            <AgentDebugStack density="compact">
              {workspace.httpRequests.map((request, index) => (
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
                <AgentDebugSubtleText>{t('agents.chat.panel.providerSession.noEnabledSkills')}</AgentDebugSubtleText>
              ) : (
                <AgentDebugStack density="compact">
                  {preview.skills.map((skill) => (
                    <AgentDebugCard key={skill.id}>
                      <AgentDebugCardHeader>
                        <AgentDebugCardTitle>{skill.name}</AgentDebugCardTitle>
                        <AgentDebugPreviewBadge variant="outline">p{skill.resolvedPriority}</AgentDebugPreviewBadge>
                      </AgentDebugCardHeader>
                      <AgentDebugCardDetail>{skill.description || skill.compiledInstruction || t('agents.chat.panel.providerSession.noInstruction')}</AgentDebugCardDetail>
                    </AgentDebugCard>
                  ))}
                </AgentDebugStack>
              )}
            </AgentDebugSection>
          )}

          {providerSessionLimits && (
            <AgentDebugSection title={t('agents.chat.panel.providerSession.limits')}>
              <AgentDebugGrid columns="four">
                <AgentDebugSummaryItem label={t('agents.chat.panel.providerSession.approvalMode')} value={runApprovalModeLabel(providerSessionLimits.approvalMode)} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.providerSession.maxToolCalls')} value={String(providerSessionLimits.maxToolCalls)} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.providerSession.maxIterations')} value={String(providerSessionLimits.maxIterations)} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.providerSession.fileBytes')} value={providerSessionLimits.allowFileBytes ? t('agents.chat.panel.capabilities.approval.always') : t('agents.chat.panel.capabilities.approval.never')} />
              </AgentDebugGrid>
              <AgentDebugGrid columns="two">
                <AgentDataBlock>
                  <AgentDebugItemTitle>{t('agents.chat.panel.providerSession.sessionBoundaries')}</AgentDebugItemTitle>
                  <AgentDebugMetaList
                    items={[
                      `${t('agents.chat.panel.providerSession.network')}: ${providerSessionLimits.allowNetwork ? t('agents.chat.panel.providerSession.allowed') : t('agents.chat.panel.providerSession.blocked')}`,
                      `${t('agents.chat.panel.providerSession.fileBytes')}: ${providerSessionLimits.allowFileBytes ? t('agents.chat.panel.providerSession.allowed') : t('agents.chat.panel.providerSession.blocked')}`,
                      `${t('agents.chat.panel.providerSession.costLimit')}: ${providerSessionLimits.costLimit ? `${providerSessionLimits.costLimit.amount} ${providerSessionLimits.costLimit.currency}` : t('agents.chat.panel.providerSession.none')}`,
                    ]}
                  />
                </AgentDataBlock>
                <AgentDataBlock>
                  <AgentDebugItemTitle>{t('agents.chat.panel.providerSession.manifestGrants')}</AgentDebugItemTitle>
                  <AgentDebugMetaList
                    empty={t('agents.chat.panel.providerSession.none')}
                    items={(preview?.providerManifest?.tools ?? []).slice(0, 8).map((grant) => `${grant.name} · ${toolGrantModeLabel(grant.mode)} · ${grant.approval ? toolApprovalLabel(grant.approval) : t('agents.chat.panel.debugPreview.default')}`)}
                  />
                </AgentDataBlock>
              </AgentDebugGrid>
            </AgentDebugSection>
          )}

          {preview?.tools && (
            <AgentDebugSection title={t('agents.chat.panel.capabilities.tools')}>
              <AgentDebugGrid columns="three">
                <AgentDebugSummaryItem label={t('agents.chat.panel.providerSession.available')} value={String(preview.tools.available.length)} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.providerSession.blocked')} value={String(preview.tools.blocked.length)} />
                <AgentDebugSummaryItem label={t('agents.chat.panel.providerSession.discovered')} value={String(preview.tools.discovered.length)} />
              </AgentDebugGrid>
              <AgentDebugGrid columns="two">
                <AgentDataBlock>
                  <AgentDebugItemTitle>{t('agents.chat.panel.providerSession.availableTools')}</AgentDebugItemTitle>
                  <AgentDebugMetaList
                    empty={t('agents.chat.panel.providerSession.none')}
                    items={preview.tools.available.slice(0, 8).map((tool) => (
                      `${agentToolNameLabel(tool.name, t)} · ${tool.risk ? providerSessionApprovalRiskText(tool.risk, t) : t('agents.chat.panel.providerSession.unknown')} · ${toolApprovalLabel(tool.approval)} · ${toolResolutionLabel(tool, t)}`
                    ))}
                  />
                </AgentDataBlock>
                <AgentDataBlock>
                  <AgentDebugItemTitle>{t('agents.chat.panel.providerSession.blockedTools')}</AgentDebugItemTitle>
                  <AgentDebugMetaList
                    empty={t('agents.chat.panel.providerSession.none')}
                    items={preview.tools.blocked.slice(0, 8).map((tool) => (
                      `${agentToolNameLabel(tool.name, t)} · ${tool.unavailableReason ?? t('agents.chat.panel.providerSession.blocked')} · ${toolResolutionLabel(tool, t)}`
                    ))}
                  />
                </AgentDataBlock>
              </AgentDebugGrid>
            </AgentDebugSection>
          )}

          {preview && (
            <AgentDebugSection title={t('agents.chat.panel.providerSession.agenticLoopPreview')}>
              <AgentDebugStack density="compact">
                <AgentDataBlock>
                  <AgentDebugSimpleText>{preview.message}</AgentDebugSimpleText>
                  <AgentDebugSubtleText>
                    {t('agents.chat.panel.providerSession.project')}: {preview.currentProjectId ?? t('common.emptyTitle')} · {t('agents.chat.panel.providerSession.memories')}: {preview.memoryCount} · {t('agents.chat.panel.providerSession.toolCalls')}: {preview.toolCalls.length} · {t('agents.chat.panel.providerSession.sandbox')}: {providerSessionLimits?.sandboxMode ? t('agents.chat.panel.providerSession.on') : t('agents.chat.panel.providerSession.off')}
                  </AgentDebugSubtleText>
                </AgentDataBlock>
                <AgentDebugStack density="compact">
                  {preview.toolCalls.length === 0 ? (
                    <AgentDebugCard>{t('agents.chat.panel.prompt.noImmediateToolCalls')}</AgentDebugCard>
                  ) : preview.toolCalls.map((call, index) => (
                    <AgentDebugCard key={`${call.name}-${index}`}>
                      <AgentDebugCardHeader>
                        <AgentDebugCardTitle>{index + 1}. {call.name}</AgentDebugCardTitle>
                        <AgentDebugPreviewBadge variant="outline">{t('agents.chat.panel.providerSession.tool')}</AgentDebugPreviewBadge>
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

          {(workspace.providerSession || pendingApprovals.length > 0) && (
            <AgentDebugSection title={t('agents.chat.panel.prompt.approvals')}>
              <AgentDebugStack density="compact">
                {workspace.providerSession && (
                  <AgentDebugGrid columns="three">
                    <AgentDebugSummaryItem label={t('agents.chat.panel.status.thread')} value={workspace.providerSession.threadId ?? t('agents.chat.panel.status.newThread')} />
                    <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.mode')} value={workspace.providerSession.diagnosticCommand ? t('agents.chat.panel.debugPreview.diagnostic') : t('agents.chat.panel.debugPreview.conversation')} />
                    <AgentDebugSummaryItem label={t('agents.chat.panel.debugPreview.agent')} value={t('agents.chat.panel.debugPreview.default')} />
                  </AgentDebugGrid>
                )}
                {workspace.providerSession?.previewError && (
                  <AgentDebugErrorCallout>
                    {workspace.providerSession.previewError}
                  </AgentDebugErrorCallout>
                )}
                {pendingApprovals.length > 0 ? (
                  <AgentDataBlock>
                    <AgentDebugItemTitle>{t('agents.chat.task.approvalRequired')}</AgentDebugItemTitle>
                    <AgentDebugStack density="compact">
                      {pendingApprovals.map((approval) => (
                        <AgentDebugCard key={approval.id} variant="card">
                          <AgentDebugCardHeader>
                            <AgentDebugCardTitle title={approval.toolName}>{agentToolNameLabel(approval.toolName, t)}</AgentDebugCardTitle>
                            <AgentDebugPreviewStatusBadge intent={agentRunInteractionActionStatusRecipe('pending').intent} emphasis={agentRunInteractionActionStatusRecipe('pending').emphasis}>{approval.risk ? providerSessionApprovalRiskText(approval.risk, t) : providerSessionApprovalStatusText(approval.status, t)}</AgentDebugPreviewStatusBadge>
                          </AgentDebugCardHeader>
                          <AgentDebugCardDetail>{approval.reason}</AgentDebugCardDetail>
                          <AgentDebugCard variant="subtle">
                            {t('agents.chat.task.approvalImpact.label')}: {providerSessionApprovalImpactText(approval, t)}
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
              {workspace.outbound.messages.map((message, index) => (
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
            <AgentDebugFieldCodePanel label={t('agents.chat.panel.providerSession.headers')} size="medium">
              {safeJSONStringify(request.headers)}
            </AgentDebugFieldCodePanel>
          )}
          {request.body !== undefined && (
            <AgentDebugFieldCodePanel label={t('agents.chat.panel.providerSession.body')} size="large" span={request.headers ? undefined : 'full'}>
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

export function WorkspaceDiff({ preview }: { preview: WorkspaceArtifactApplyPreview }) {
  const { t } = useTranslation()
  const rows = diffRows(preview.review.currentValue, preview.review.proposedValue)
  return (
    <AgentDebugWorkspaceDiffShell>
      <AgentDebugWorkspaceDiffHeader
        currentLabel={t('agents.chat.panel.workspaces.current')}
        proposedLabel={t('agents.chat.panel.workspaces.proposed')}
      />
      <AgentDebugWorkspaceDiffColumns>
        <AgentDebugWorkspaceDiffCodeBlock side="current">
          {asString(preview.review.currentValue) || t('common.emptyTitle')}
        </AgentDebugWorkspaceDiffCodeBlock>
        <AgentDebugWorkspaceDiffCodeBlock side="proposed">
          {asString(preview.review.proposedValue) || t('common.emptyTitle')}
        </AgentDebugWorkspaceDiffCodeBlock>
      </AgentDebugWorkspaceDiffColumns>
      <AgentDebugWorkspaceDiffRows>
        {rows.map((row, index) => (
          <AgentDebugWorkspaceDiffLine
            key={`${row.type}-${index}`}
            change={row.type}
          >
            {row.type === 'removed' ? '- ' : row.type === 'added' ? '+ ' : '  '}
            {row.text || emptyLabel(t)}
          </AgentDebugWorkspaceDiffLine>
        ))}
      </AgentDebugWorkspaceDiffRows>
    </AgentDebugWorkspaceDiffShell>
  )
}

export function isWorkspaceApplyPreview(value: unknown): value is WorkspaceArtifactApplyPreview {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<WorkspaceArtifactApplyPreview>
  return !!record.review
    && typeof record.review === 'object'
    && typeof record.review.workspaceId === 'string'
    && !!record.workspace
}
