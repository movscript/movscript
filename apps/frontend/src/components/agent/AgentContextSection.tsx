import type { PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, GripHorizontal } from 'lucide-react'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { AgentProductWorkflowCard } from '@/components/agent/AgentProductWorkflowCard'
import { AgentMemoryPanel } from '@/components/agent/AgentMemoryPanel'
import {
  AgentRuntimeContextPanel,
  ConversationContextPanel,
  PageContextPanel,
  type ConversationAgentContextConfig,
  type PageContextSummary,
} from '@/components/agent/AgentContextPanels'
import { DebugSection, DebugSummaryItem } from '@/components/agent/AgentDebugPreviewDialog'
import type { AgentProductWorkflowSummary } from '@/lib/agentProductWorkflow'
import type { AgentCapabilitiesResponse, AgentHealth, AgentInspectResponse, AgentRunPreview } from '@/lib/localAgentClient'
import type { Project } from '@/types'

export interface AgentContextSectionProps {
  activeConversationManifest: boolean
  agentPageContext: PageContextSummary
  agentRuntimeContext?: AgentRunPreview['context']
  canAutoStartLocalAgent: boolean
  capabilities?: AgentCapabilitiesResponse
  checkingLocalAgent: boolean
  config: ConversationAgentContextConfig
  contextPaneHeight: number
  contextSubtitle: string
  contextThreadId?: string
  currentProject: Project | null
  fetchingCapabilities: boolean
  fetchingInspect: boolean
  inspect?: AgentInspectResponse
  localAgentErrorMessage?: string | null
  localAgentHealth?: AgentHealth
  localAgentOnline: boolean
  productWorkflow: AgentProductWorkflowSummary
  showContext: boolean
  startingLocalAgent: boolean
  onRefresh: () => void
  onStartLocalAgent: () => void
  onToggleContext: () => void
  onStartResize: (event: PointerEvent<HTMLDivElement>) => void
}

export function AgentContextSection({
  activeConversationManifest,
  agentPageContext,
  agentRuntimeContext,
  canAutoStartLocalAgent,
  capabilities,
  checkingLocalAgent,
  config,
  contextPaneHeight,
  contextSubtitle,
  contextThreadId,
  currentProject,
  fetchingCapabilities,
  fetchingInspect,
  inspect,
  localAgentErrorMessage,
  localAgentHealth,
  localAgentOnline,
  productWorkflow,
  showContext,
  startingLocalAgent,
  onRefresh,
  onStartLocalAgent,
  onToggleContext,
  onStartResize,
}: AgentContextSectionProps) {
  const { t } = useTranslation()

  return (
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
          onClick={onToggleContext}
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
          onPointerDown={onStartResize}
        >
          <GripHorizontal size={18} aria-hidden="true" />
        </div>
      )}
      <div
        className={cn('ai-agent-panel-context-body space-y-2', !showContext && 'hidden')}
        style={{ height: contextPaneHeight }}
      >
        <AgentProductWorkflowCard summary={productWorkflow} />
        <div className="rounded-md border border-border bg-background/60 p-2 space-y-1">
          <div className="flex min-w-0 items-center justify-between gap-2 text-[10px]">
            <span className={cn('min-w-0 truncate font-medium', localAgentOnline ? 'text-green-600' : 'text-amber-600')}>
              {localAgentOnline ? t('agents.chat.panel.status.localRuntimeOnline') : (checkingLocalAgent || startingLocalAgent ? (canAutoStartLocalAgent ? t('agents.chat.panel.status.startingLocalRuntime') : t('agents.chat.panel.status.checkingLocalRuntime')) : t('agents.chat.panel.status.localRuntimeOffline'))}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onStartLocalAgent}
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
                  <DebugSummaryItem label={t('agents.chat.panel.capabilities.skills')} value={String(localAgentHealth?.pluginCatalog?.skillCount ?? inspect?.pluginCatalog?.skillCount ?? inspect?.skills.length ?? 0)} />
                  <DebugSummaryItem label={t('agents.chat.panel.capabilities.tools')} value={String(localAgentHealth?.pluginCatalog?.toolCount ?? inspect?.pluginCatalog?.toolCount ?? inspect?.registeredTools.length ?? 0)} />
                </div>
                <div className="rounded-md border border-border bg-background/60 p-2 text-[10px]">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <DebugSummaryItem label="MCP" value={capabilities?.mcp.connected ? t('agents.chat.panel.status.online') : t('agents.chat.panel.status.offline')} />
                    <DebugSummaryItem label="Resources" value={String(capabilities?.mcp.resources.length ?? inspect?.resources.length ?? 0)} />
                    <DebugSummaryItem label="MCP Tools" value={String(capabilities?.mcp.tools.length ?? inspect?.tools.length ?? 0)} />
                    <DebugSummaryItem label="Warnings" value={String((capabilities?.warnings.length ?? 0) + (inspect?.pluginCatalog?.warnings?.length ?? 0))} />
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
            <AgentMemoryPanel
              project={currentProject}
              threadId={contextThreadId}
              online={localAgentOnline}
            />
            <ConversationContextPanel
              online={localAgentOnline}
              inspect={inspect}
              capabilities={capabilities}
              loading={fetchingInspect || fetchingCapabilities}
              config={config}
              onRefresh={onRefresh}
            />
          </div>
        )}
      </div>
    </section>
  )
}
