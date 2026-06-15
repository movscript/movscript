import { useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Clipboard, Download, Loader2, Save, Upload } from 'lucide-react'
import {
  AgentSettingsActionButton,
  AgentSettingsActionRow,
  AgentSettingsCallout,
  AgentSettingsFieldHelp,
  AgentSettingsFieldLabel,
  AgentSettingsIcon,
  AgentSettingsInlineNote,
  AgentSettingsInput,
  AgentSettingsIssueList,
  AgentSettingsPanel,
  AgentSettingsSnapshotImpactPanel,
  AgentSettingsSnapshotImportScopePanel,
  AgentSettingsSnapshotSummaryPanel,
  AgentSettingsStack,
  AgentSettingsTextarea,
  agentSettingsRecipe,
} from '@movscript/ui/business/agent'
import {
  redactAgentTraceDebugText,
  type AgentSettingsSnapshot,
  type AgentSettingsSnapshotReferenceIssue,
} from '@movscript/core/agent'
import { AppInlineError } from '@movscript/ui/business/app'
import {
  SETTINGS_SNAPSHOT_IMPORT_PRESETS,
  SETTINGS_SNAPSHOT_IMPORT_SCOPES,
  SETTINGS_SNAPSHOT_IMPORT_SCOPE_LABEL_KEYS,
  buildSettingsSnapshotImpactItems,
  settingsSnapshotImportScopeAvailable,
  settingsSnapshotToolPermissionOverrideGrantCount,
  snapshotProviderSessionLimits,
  type SettingsSnapshotImportPresetId,
  type SettingsSnapshotImportScope,
} from '@/features/agent/application/agentSettingsConfigFile'
import type { AgentSettingsImportBackup } from '@/features/agent/state/agentStore'
import { copyTextToClipboard, scheduleUiReset } from '@/shared/ui/browserActions'

export function SettingsSnapshotPanel({
  fileInputRef,
  settingsSnapshotText,
  settingsSnapshotValidation,
  settingsSnapshotError,
  settingsSnapshotMessage,
  settingsSnapshotFileName,
  selectedScopes,
  referenceIssues,
  selectedSnapshotForImport,
  settingsImportBackup,
  canImport,
  importing,
  importPreflightError,
  onLoadFile,
  onExport,
  onCopy,
  onDownload,
  onPreviewImport,
  onImport,
  onTextChange,
  onScopeChange,
  onPresetChange,
  onLoadImportBackup,
  onCopyImportBackup,
  onRestoreImportBackup,
  onClearImportBackup,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>
  settingsSnapshotText: string
  settingsSnapshotValidation: { snapshot: AgentSettingsSnapshot | null; error: string | null }
  settingsSnapshotError: string | null
  settingsSnapshotMessage: string | null
  settingsSnapshotFileName: string | null
  selectedScopes: SettingsSnapshotImportScope[]
  referenceIssues: AgentSettingsSnapshotReferenceIssue[]
  selectedSnapshotForImport: AgentSettingsSnapshot | null
  settingsImportBackup: AgentSettingsImportBackup | null
  canImport: boolean
  importing: boolean
  importPreflightError: string | null
  onLoadFile: (file?: File | null) => void
  onExport: () => void
  onCopy: () => void
  onDownload: () => void
  onPreviewImport: () => void
  onImport: () => void
  onTextChange: (text: string) => void
  onScopeChange: (scope: SettingsSnapshotImportScope, enabled: boolean) => void
  onPresetChange: (presetId: SettingsSnapshotImportPresetId) => void
  onLoadImportBackup: () => void
  onCopyImportBackup: () => void
  onRestoreImportBackup: () => void
  onClearImportBackup: () => void
}) {
  const { t } = useTranslation()
  const parsedSnapshot = settingsSnapshotValidation.snapshot
  return (
    <AgentSettingsPanel icon={Download} id="agent-settings-snapshot" title={t('agents.settings.settingsSnapshotPanel')}>
      <AgentSettingsStack>
        <AgentSettingsFieldHelp>{t('agents.settings.settingsSnapshotHelp')}</AgentSettingsFieldHelp>
        <AgentSettingsInput
          ref={fileInputRef as RefObject<HTMLInputElement>}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => onLoadFile(event.target.files?.[0])}
        />
        <AgentSettingsActionRow>
          <AgentSettingsActionButton type="button" variant="outline" onClick={onExport}>
            <Download size={14} />
            {t('agents.settings.exportSettings')}
          </AgentSettingsActionButton>
          <AgentSettingsActionButton type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} />
            {t('agents.settings.loadSettingsSnapshotFile')}
          </AgentSettingsActionButton>
          <AgentSettingsActionButton type="button" variant="outline" onClick={onCopy}>
            <Clipboard size={14} />
            {t('agents.settings.copySettings')}
          </AgentSettingsActionButton>
          <AgentSettingsActionButton type="button" variant="outline" onClick={onDownload}>
            <Save size={14} />
            {t('agents.settings.downloadSettings')}
          </AgentSettingsActionButton>
          <AgentSettingsActionButton
            type="button"
            variant="outline"
            onClick={onPreviewImport}
            disabled={!parsedSnapshot || Boolean(importPreflightError)}
          >
            {t('agents.settings.previewSettingsImportDryRun')}
          </AgentSettingsActionButton>
          <AgentSettingsActionButton
            type="button"
            onClick={onImport}
            disabled={!canImport || Boolean(importPreflightError) || importing}
          >
            {importing ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Upload size={14} />}
            {t('agents.settings.importSettings')}
          </AgentSettingsActionButton>
        </AgentSettingsActionRow>
        {settingsSnapshotFileName && (
          <AgentSettingsInlineNote>{t('agents.settings.settingsSnapshotFileLoaded', { fileName: settingsSnapshotFileName })}</AgentSettingsInlineNote>
        )}
        <AgentSettingsTextarea
          value={settingsSnapshotText}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={t('agents.settings.settingsSnapshotPlaceholder')}
          rows={12}
        />
        {settingsSnapshotValidation.error && <AppInlineError>{settingsSnapshotValidation.error}</AppInlineError>}
        {settingsSnapshotError && <AppInlineError>{settingsSnapshotError}</AppInlineError>}
        {settingsSnapshotMessage && (
          <AgentSettingsCallout tone="success" compact>
            {settingsSnapshotMessage}
          </AgentSettingsCallout>
        )}
        {parsedSnapshot && <SettingsSnapshotSummary snapshot={parsedSnapshot} />}
        {parsedSnapshot && (
          <SettingsSnapshotImportScopeSelector
            snapshot={parsedSnapshot}
            selectedScopes={selectedScopes}
            onScopeChange={onScopeChange}
            onPresetChange={onPresetChange}
          />
        )}
        {referenceIssues.length > 0 && (
          <AgentSettingsCallout tone="warning" compact>
            <AgentSettingsIssueList
              items={referenceIssues.map((issue) => `${issue.path}: ${issue.message}`)}
            />
          </AgentSettingsCallout>
        )}
        {selectedSnapshotForImport && <SettingsSnapshotImpactPreview snapshot={selectedSnapshotForImport} />}
        {settingsImportBackup && (
          <AgentSettingsCallout tone="warning" compact>
            <AgentSettingsStack>
              <AgentSettingsFieldLabel>{t('agents.settings.settingsImportBackup')}</AgentSettingsFieldLabel>
              <AgentSettingsFieldHelp>
                {t('agents.settings.settingsImportBackupHelp', { time: new Date(settingsImportBackup.createdAt).toLocaleString() })}
              </AgentSettingsFieldHelp>
              <AgentSettingsActionRow>
                <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={onLoadImportBackup}>
                  {t('agents.settings.loadImportBackup')}
                </AgentSettingsActionButton>
                <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={onCopyImportBackup}>
                  {t('agents.settings.copyImportBackup')}
                </AgentSettingsActionButton>
                <AgentSettingsActionButton type="button" size="sm" variant="outline" onClick={onRestoreImportBackup} disabled={importing}>
                  {t('agents.settings.restoreImportBackup')}
                </AgentSettingsActionButton>
                <AgentSettingsActionButton type="button" size="sm" variant="outline" intent="danger" onClick={onClearImportBackup}>
                  {t('agents.settings.clearImportBackup')}
                </AgentSettingsActionButton>
              </AgentSettingsActionRow>
            </AgentSettingsStack>
          </AgentSettingsCallout>
        )}
      </AgentSettingsStack>
    </AgentSettingsPanel>
  )
}

export function SettingsSnapshotImportScopeSelector({
  snapshot,
  selectedScopes,
  onScopeChange,
  onPresetChange,
}: {
  snapshot: AgentSettingsSnapshot
  selectedScopes: SettingsSnapshotImportScope[]
  onScopeChange: (scope: SettingsSnapshotImportScope, enabled: boolean) => void
  onPresetChange: (presetId: SettingsSnapshotImportPresetId) => void
}) {
  const { t } = useTranslation()
  return (
    <AgentSettingsSnapshotImportScopePanel
      title={t('agents.settings.settingsSnapshotImportScopes')}
      description={t('agents.settings.settingsSnapshotImportScopesHelp')}
      presetsLabel={t('agents.settings.settingsSnapshotImportPresets')}
      presetsHelp={t('agents.settings.settingsSnapshotImportPresetsHelp')}
      presets={SETTINGS_SNAPSHOT_IMPORT_PRESETS.map((preset) => ({
        id: preset.id,
        label: t(`agents.settings.settingsSnapshotImportPresetNames.${preset.id}`),
        enabled: preset.scopes.some((scope) => settingsSnapshotImportScopeAvailable(snapshot, scope)),
        onSelect: () => onPresetChange(preset.id),
      }))}
      scopes={SETTINGS_SNAPSHOT_IMPORT_SCOPES.map((scope) => {
        const available = settingsSnapshotImportScopeAvailable(snapshot, scope)
        return {
          id: scope,
          scope,
          label: t(SETTINGS_SNAPSHOT_IMPORT_SCOPE_LABEL_KEYS[scope]),
          detail: t(`agents.settings.settingsSnapshotImportScopeDetails.${scope}`),
          checked: available && selectedScopes.includes(scope),
          available,
          onChange: (nextChecked) => onScopeChange(scope, nextChecked),
        }
      })}
    />
  )
}

export function SettingsSnapshotSummary({ snapshot }: { snapshot: AgentSettingsSnapshot }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsSnapshotSummaryPanel
      title={t('agents.settings.settingsSnapshotSummary')}
      items={[
        { id: 'exportedAt', label: t('agents.settings.settingsSnapshotFields.exportedAt'), value: new Date(snapshot.exportedAt).toLocaleString() },
        { id: 'model', label: t('agents.settings.settingsSnapshotFields.model'), value: snapshot.model?.model ? redactAgentTraceDebugText(snapshot.model.model) : '-' },
        { id: 'configFile', label: t('agents.settings.settingsSnapshotFields.configFile'), value: snapshot.activeConfigFileId ?? '-' },
        { id: 'configFiles', label: t('agents.settings.settingsSnapshotFields.configFiles'), value: snapshot.configFiles?.length ?? 0 },
        { id: 'providerSessionLimits', label: t('agents.settings.settingsSnapshotFields.providerSessionLimits'), value: snapshotProviderSessionLimits(snapshot) ? Object.keys(snapshotProviderSessionLimits(snapshot)!).length : 0 },
        { id: 'skills', label: t('agents.settings.settingsSnapshotFields.skills'), value: snapshot.skillConfig?.length ?? 0 },
        { id: 'tools', label: t('agents.settings.settingsSnapshotFields.tools'), value: settingsSnapshotToolPermissionOverrideGrantCount(snapshot.toolPermissionOverrides) },
      ]}
    />
  )
}

export function SettingsSnapshotImpactPreview({ snapshot }: { snapshot: AgentSettingsSnapshot }) {
  const { t } = useTranslation()
  const items = buildSettingsSnapshotImpactItems(snapshot)
  const [copied, setCopied] = useState(false)
  async function copySnapshotImpactSummary() {
    const lines = [
      t('agents.settings.settingsSnapshotImpactSummaryTitle'),
      ...items.map((item, index) => (
        `${index + 1}. [${t(`agents.settings.settingsSnapshotImpactScopes.${item.scope}`)}] ${t(item.labelKey)}\n   ${t(item.detailKey, item.detailValues)}`
      )),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    scheduleUiReset(() => setCopied(false), 1500)
  }

  return (
    <AgentSettingsSnapshotImpactPanel
      title={t('agents.settings.settingsSnapshotImpactPreview')}
      copyLabel={t('agents.settings.copySettingsSnapshotImpact')}
      copiedLabel={t('agents.settings.settingsSnapshotImpactCopied')}
      copied={copied}
      copyIcon={<Clipboard size={14} />}
      onCopy={() => void copySnapshotImpactSummary()}
      items={items.map((item) => ({
        id: item.id,
        label: t(item.labelKey),
        detail: t(item.detailKey, item.detailValues),
        scopeLabel: t(`agents.settings.settingsSnapshotImpactScopes.${item.scope}`),
        statusProps: agentSettingsRecipe(item.scope === 'config' || item.scope === 'local' ? 'warning' : 'neutral'),
      }))}
    />
  )
}

async function copyRedactedSettingsLines(lines: string[]) {
  await copyTextToClipboard(lines.map(redactAgentTraceDebugText).join('\n'))
}
