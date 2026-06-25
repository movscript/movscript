import { useTranslation } from 'react-i18next'
import { Activity, Clipboard, Loader2, RefreshCw } from 'lucide-react'
import {
  AgentSettingsActionButton,
  AgentSettingsActionItemsPanel,
  AgentSettingsIcon,
  AgentSettingsPanel,
  AgentSettingsReadinessPanel,
  AgentSettingsScopeBadge,
  AgentSettingsScopeRail,
  AgentSettingsStatusBadge,
  agentSettingsStatusRecipe,
} from '@/features/agent/components/AgentSettingsUi'
import { SettingsAuditTrailPanel } from '@/features/agent/components/AIAgentSettingsPageParts'
import type {
  SettingsActionItem,
  SettingsActionQuickFix,
  SettingsReadinessItem,
} from '@/features/agent/application/agentSettingsReadiness'
import type { AgentSettingsAuditEntry } from '@/features/agent/state/agentStore'
import { agentConfigStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'

type AgentSettingsOverviewStatus = {
  configured: boolean
  agentLabel: string
  agentDetail?: string
  providerProfileLabel: string
  providerProfileDescription?: string
  runtimeLabel: string
  capabilityLabel: string
  capabilityDetail: string
  copied: boolean
  refreshing: boolean
  canRefresh: boolean
  onCopy: () => void | Promise<void>
  onRefresh: () => void | Promise<void>
  models: {
    items: AgentSettingsOverviewModelItem[]
    total: number
    loading: boolean
    error: string | null
  }
}

type AgentSettingsOverviewModelItem = {
  id: string
  label: string
  detail: string
  current: boolean
  default: boolean
}

export function AIAgentSettingsOverviewPanels({
  status,
  showConfigurationDetails,
  readinessItems,
  actionItems,
  actionFeedback,
  actionItemsCopied,
  auditTrail,
  onCopyActionItems,
  onClearAuditTrail,
  onJumpToSection,
  onQuickFix,
}: {
  status: AgentSettingsOverviewStatus
  showConfigurationDetails: boolean
  readinessItems: SettingsReadinessItem[]
  actionItems: SettingsActionItem[]
  actionFeedback: string | null
  actionItemsCopied: boolean
  auditTrail: AgentSettingsAuditEntry[]
  onCopyActionItems: () => void | Promise<void>
  onClearAuditTrail: () => void
  onJumpToSection: (sectionId: SettingsActionItem['targetSection']) => void
  onQuickFix: (quickFix: SettingsActionQuickFix) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <AgentSettingsStatusOverviewCard status={status} />
      {showConfigurationDetails ? (
        <>
          <AgentSettingsPanel>
            <AgentSettingsActionItemsPanel
              items={actionItems.map((item) => ({
                id: item.id,
                label: t(item.labelKey),
                detail: t(item.detailKey, item.detailValues),
                statusProps: agentSettingsStatusRecipe(item.status),
                statusLabel: t(`agents.settings.actionStatuses.${item.status}`),
                reasons: item.reasons?.map((reason) => t(reason.labelKey, reason.values)),
                persistHint: item.persistHintKey ? t(item.persistHintKey) : undefined,
                jumpLabel: t('agents.settings.quickFixes.jumpToSection'),
                onJump: () => onJumpToSection(item.targetSection),
                quickFixLabel: item.quickFixLabelKey ? t(item.quickFixLabelKey) : undefined,
                onQuickFix: item.quickFix ? () => onQuickFix(item.quickFix!) : undefined,
              }))}
              feedback={actionFeedback}
              emptyLabel={t('agents.settings.actionItemsEmpty')}
              countLabel={t('agents.settings.actionItemsCountSummary', {
                actions: actionItems.filter((item) => item.status === 'action').length,
                warnings: actionItems.filter((item) => item.status === 'warning').length,
              })}
              copied={actionItemsCopied}
              copyLabel={t('agents.settings.copyActionItems')}
              copiedLabel={t('agents.settings.actionItemsCopied')}
              copyIcon={<Clipboard size={14} />}
              onCopy={onCopyActionItems}
            />
          </AgentSettingsPanel>
          <AgentSettingsPanel>
            <AgentSettingsReadinessPanel
              items={readinessItems.map((item) => ({
                id: item.id,
                label: t(item.labelKey),
                detail: t(item.detailKey, item.detailValues),
                statusProps: agentSettingsStatusRecipe(item.status),
                statusLabel: t(`agents.settings.readinessStatuses.${item.status}`),
              }))}
            />
          </AgentSettingsPanel>
          <AgentSettingsPanel>
            <SettingsAuditTrailPanel entries={auditTrail} onClear={onClearAuditTrail} />
          </AgentSettingsPanel>
        </>
      ) : null}
    </>
  )
}

function AgentSettingsStatusOverviewCard({ status }: { status: AgentSettingsOverviewStatus }) {
  const { t } = useTranslation()
  const configStatusRecipe = agentConfigStatusRecipe(status.configured)

  return (
    <AgentSettingsPanel
      data-testid="agent-settings-status-card"
      className="agent-settings-status-card"
      bodyClassName="agent-settings-status-card__body"
    >
      <div className="agent-settings-status-card__header">
        <span className="agent-settings-item-body">
          <span className="ms-action-row agent-settings-status-card__title-row">
            <Activity size={16} />
            <span className="ms-type-label agent-settings-card-title agent-settings-card-title--strong">
              {t('agents.settings.statusCardTitle')}
            </span>
            <AgentSettingsStatusBadge intent={configStatusRecipe.intent} emphasis={configStatusRecipe.emphasis}>
              {status.configured ? t('agents.settings.configured') : t('agents.settings.notConfigured')}
            </AgentSettingsStatusBadge>
          </span>
          <span className="ms-type-caption agent-settings-item-detail">
            {t('agents.settings.statusCardDescription')}
          </span>
        </span>
        <span className="ms-action-row agent-settings-status-card__actions">
          <AgentSettingsActionButton variant="outline" onClick={status.onCopy} data-testid="agent-settings-copy-status">
            <Clipboard size={14} />
            {status.copied ? t('agents.settings.settingsStatusCopied') : t('agents.settings.copySettingsStatus')}
          </AgentSettingsActionButton>
          {status.canRefresh ? (
            <AgentSettingsActionButton variant="outline" onClick={status.onRefresh} disabled={status.refreshing} data-testid="agent-settings-refresh">
              {status.refreshing ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <RefreshCw size={14} />}
              {t('agents.settings.refresh')}
            </AgentSettingsActionButton>
          ) : null}
        </span>
      </div>

      <div className="agent-settings-status-card__grid">
        <AgentSettingsStatusFact
          label={t('agents.settings.readiness.agent')}
          value={status.agentLabel}
          detail={status.agentDetail}
        />
        <AgentSettingsStatusFact
          label={t('agents.settings.providerProfileConfigLabel')}
          value={status.providerProfileLabel}
          detail={status.providerProfileDescription ?? t('agents.settings.providerProfileReadonly')}
          meta={t('common.readonly')}
        />
        <AgentSettingsStatusFact
          label={t('agents.settings.readiness.runtime')}
          value={status.runtimeLabel}
          detail={t('agents.settings.statusCardRuntimeDetail')}
        />
        <AgentSettingsStatusFact
          label={t('agents.settings.statusCardCapabilityLabel')}
          value={status.capabilityLabel}
          detail={status.capabilityDetail}
        />
      </div>

      <AgentSettingsStatusModels models={status.models} />

      <AgentSettingsScopeRail data-testid="agent-settings-scope-boundary" className="agent-settings-status-card__scope">
        <AgentSettingsScopeBadge>{t('agents.settings.scope.controlPlane')}</AgentSettingsScopeBadge>
        <AgentSettingsScopeBadge muted>{t('agents.settings.scope.futureRuns')}</AgentSettingsScopeBadge>
        <AgentSettingsScopeBadge muted>{t('agents.settings.scope.debugReadOnly')}</AgentSettingsScopeBadge>
      </AgentSettingsScopeRail>
    </AgentSettingsPanel>
  )
}

function AgentSettingsStatusModels({
  models,
}: {
  models: AgentSettingsOverviewStatus['models']
}) {
  const { t } = useTranslation()
  const hiddenCount = Math.max(0, models.total - models.items.length)

  return (
    <div className="agent-settings-status-card__models" data-testid="agent-settings-status-models">
      <div className="agent-settings-status-card__models-header">
        <span className="agent-settings-item-body">
          <span className="ms-type-label agent-settings-card-title agent-settings-card-title--strong">
            {t('agents.settings.statusCardModelsLabel')}
          </span>
          <span className="ms-type-caption agent-settings-item-detail">
            {t('agents.settings.statusCardModelsDetail')}
          </span>
        </span>
        {hiddenCount > 0 ? (
          <span className="ms-type-tiny agent-settings-status-card__models-count">
            {t('agents.settings.statusCardModelsMore', { count: hiddenCount })}
          </span>
        ) : null}
      </div>

      {models.loading ? (
        <span className="ms-type-caption agent-settings-status-card__models-message">
          {t('agents.settings.statusCardModelsLoading')}
        </span>
      ) : models.error ? (
        <span className="ms-type-caption agent-settings-status-card__models-message agent-settings-status-card__models-message--danger">
          {t('agents.settings.statusCardModelsError', { reason: models.error })}
        </span>
      ) : models.items.length === 0 ? (
        <span className="ms-type-caption agent-settings-status-card__models-message">
          {t('agents.settings.statusCardModelsEmpty')}
        </span>
      ) : (
        <div className="agent-settings-status-card__models-list">
          {models.items.map((model) => (
            <div key={model.id} className="agent-settings-status-card__model-row">
              <span className="agent-settings-item-body">
                <span className="ms-text-truncate ms-type-label agent-settings-status-card__model-name">
                  {model.label}
                </span>
                <span className="ms-type-tiny agent-settings-status-card__model-detail">
                  {t('agents.settings.statusCardModelCapabilities', { capabilities: model.detail })}
                </span>
              </span>
              <span className="ms-action-row agent-settings-status-card__model-badges">
                {model.current ? <span className="agent-settings-status-card__model-badge">{t('agents.settings.statusCardModelCurrent')}</span> : null}
                {model.default ? <span className="agent-settings-status-card__model-badge">{t('agents.settings.statusCardModelDefault')}</span> : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentSettingsStatusFact({
  label,
  value,
  detail,
  meta,
}: {
  label: string
  value: string
  detail?: string
  meta?: string
}) {
  return (
    <div className="agent-settings-status-card__fact">
      <span className="ms-type-tiny agent-settings-status-card__fact-label">{label}</span>
      <span className="ms-action-row agent-settings-status-card__fact-value-row">
        <span className="ms-text-truncate ms-type-label agent-settings-status-card__fact-value">{value}</span>
        {meta ? <span className="ms-type-tiny agent-settings-status-card__fact-meta">{meta}</span> : null}
      </span>
      {detail ? <span className="ms-type-caption agent-settings-status-card__fact-detail">{detail}</span> : null}
    </div>
  )
}
