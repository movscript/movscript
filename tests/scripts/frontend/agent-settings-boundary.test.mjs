import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
const configFilesPanelSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsConfigFilesPanel.tsx')
const settingsSurfaceSource = [
  pageSource,
  configFilesPanelSource,
].join('\n')
const readinessSource = readSource('apps/frontend/src/features/agent/application/agentSettingsReadiness.ts')
const configFileSource = [
  readSource('apps/frontend/src/features/agent/application/agentSettingsConfigFile.ts'),
  readSource('apps/frontend/src/features/agent/application/agentSettingsConfigFileManagement.ts'),
  readSource('apps/frontend/src/features/agent/application/agentSettingsConfigFileExport.ts'),
  readSource('apps/frontend/src/features/agent/application/agentSettingsConfigFileWorkspaces.ts'),
  readSource('apps/frontend/src/features/agent/application/agentSettingsConfigFileTypes.ts'),
].join('\n')
const providerModelSource = readSource('apps/frontend/src/features/agent/application/agentSettingsProviderModel.ts')
const pageModelSource = readSource('apps/frontend/src/features/agent/presentation/agentSettingsPageModel.ts')
const skillModelSource = readSource('apps/frontend/src/features/agent/presentation/agentSettingsSkillModel.ts')
const toolPermissionsModelSource = readSource('apps/frontend/src/features/agent/presentation/agentSettingsToolPermissionsModel.ts')
const summaryModelSource = readSource('apps/frontend/src/features/agent/presentation/agentSettingsSummaryModel.ts')
const summaryCopySource = readSource('apps/frontend/src/features/agent/application/useAgentSettingsSummaryCopy.ts')
const configFileControllerSource = readSource('apps/frontend/src/features/agent/application/useAgentSettingsConfigFileController.ts')
const modelControllerSource = readSource('apps/frontend/src/features/agent/application/useAgentSettingsModelController.ts')
const snapshotControllerSource = readSource('apps/frontend/src/features/agent/application/useAgentSettingsSnapshotController.ts')
const workspaceConfigControllerSource = readSource('apps/frontend/src/features/agent/application/useAgentSettingsWorkspaceConfigController.ts')
const pagePartsSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsPageParts.tsx')
const snapshotPanelSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsSnapshotPanel.tsx')
const browserActionsSource = readSource('apps/frontend/src/shared/ui/browserActions.ts')
const headerSectionSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsHeaderSection.tsx')
const overviewPanelsSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsOverviewPanels.tsx')
const modelPanelSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsModelPanel.tsx')
const configFileEditorShellSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsConfigFileEditorShell.tsx')
const configFileBrowserSectionSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsConfigFileBrowserSection.tsx')
const configFileEditorHeaderSectionSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsConfigFileEditorHeaderSection.tsx')
const configFileRollbackBackupPanelSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsConfigFileRollbackBackupPanel.tsx')
const configFileDetailsSectionSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsConfigFileDetailsSection.tsx')
const skillSectionSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsSkillSection.tsx')
const toolPermissionsSectionSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsToolPermissionsSection.tsx')

test('agent settings page delegates readiness and action item derivation', () => {
  assert.match(pageSource, /from '@\/features\/agent\/application\/agentSettingsReadiness'/)
  assert.doesNotMatch(pageSource, /function buildModelCompatibilityProbes\(/)
  assert.doesNotMatch(pageSource, /function buildApiModeSwitchTaskGraph\(/)
  assert.doesNotMatch(pageSource, /function buildSettingsReadinessItems\(/)
  assert.doesNotMatch(pageSource, /function buildSettingsActionItems\(/)

  assert.match(readinessSource, /export function buildModelCompatibilityProbes\(/)
  assert.match(readinessSource, /export function buildApiModeSwitchTaskGraph\(/)
  assert.match(readinessSource, /export function buildSettingsReadinessItems\(/)
  assert.match(readinessSource, /export function buildSettingsActionItems\(/)
})

test('agent settings page delegates config file and snapshot data transforms', () => {
  assert.match(workspaceConfigControllerSource, /from '@\/features\/agent\/application\/agentSettingsConfigFile'/)
  assert.doesNotMatch(pageSource, /function buildConfigFileDiff\(/)
  assert.doesNotMatch(pageSource, /function duplicateConfigFileForManagement\(/)
  assert.doesNotMatch(pageSource, /function selectSettingsSnapshotForImport\(/)
  assert.doesNotMatch(pageSource, /function buildSettingsSnapshotImpactItems\(/)
  assert.doesNotMatch(pageSource, /function buildCurrentSettingsSnapshotText\(/)
  assert.doesNotMatch(pageSource, /function settingsSnapshotImportPreflightErrorForSnapshot\(/)
  assert.doesNotMatch(pageSource, /settingsSnapshotImportPreflightErrorForSnapshot\(/)
  assert.doesNotMatch(pageSource, /buildSettingsSnapshotConfigFileWritePlan\(/)
  assert.doesNotMatch(pageSource, /validateSettingsSnapshotReferences/)
  assert.doesNotMatch(pageSource, /configFiles\.find\(\(configFile\) => configFile\.id === currentConfigFileId\)/)
  assert.doesNotMatch(pageSource, /configFiles\.find\(\(configFile\) => configFile\.id === selectedConfigFileId\)/)
  assert.doesNotMatch(pageSource, /configFileLimitSignature\(normalizedConfigFileLimitWorkspaces\)/)
  assert.doesNotMatch(pageSource, /selectedSettingsSnapshotForImport\?\.model\?\.model\.startsWith/)
  assert.doesNotMatch(pageSource, /\.\.\.new Set\(\[\.\.\.current, scope\]\)/)
  assert.doesNotMatch(pageSource, /preset\.scopes\.filter\(\(scope\) => settingsSnapshotImportScopeAvailable/)
  assert.doesNotMatch(pageSource, /const rollbackConfigFile = .*duplicateSnapshotConfigFile/)
  assert.doesNotMatch(pageSource, /toolGrants: toolGrantWorkspaces\.map/)
  assert.doesNotMatch(pageSource, /const nextConfigFile: ProviderCatalogConfigFile = \{/)
  assert.doesNotMatch(pageSource, /const configFileWrites = new Map/)
  assert.doesNotMatch(pageSource, /function queueConfigFileWrite/)
  assert.doesNotMatch(pageSource, /function targetConfigFileForSnapshot/)
  assert.doesNotMatch(pageSource, /function buildToolPermissionsDiffItems\(/)
  assert.doesNotMatch(pageSource, /parseConfigFileExport/)
  assert.doesNotMatch(pageSource, /buildConfigFileExportText/)
  assert.doesNotMatch(pageSource, /safeConfigFileExportName/)
  assert.doesNotMatch(pageSource, /duplicateConfigFileForManagement\(/)
  assert.doesNotMatch(pageSource, /createBlankConfigFileForManagement\(/)
  assert.doesNotMatch(pageSource, /buildConfigFileWithDetails\(/)
  assert.doesNotMatch(pageSource, /buildConfigFileWithSkillIds\(/)
  assert.doesNotMatch(pageSource, /buildConfigFileWithToolGrants\(/)
  assert.doesNotMatch(pageSource, /configFiles \?\? \[\]\)\.find\(\(configFile\) => configFile\.id === configFileRollbackBackup\.configFile\.id/)
  assert.doesNotMatch(pageSource, /saveProviderConfigFile\(\{ configFile: savePlan\.configFile, activate: savePlan\.activate \}\)/)
  assert.doesNotMatch(pageSource, /settingsProviderSessionClient\.saveProviderConfigFile/)
  assert.doesNotMatch(pageSource, /saveActiveProviderConfigFile\(\{ configFileId: selectedConfigFileId \}\)/)
  assert.doesNotMatch(pageSource, /settingsProviderSessionClient\.saveActiveProviderConfigFile/)
  assert.doesNotMatch(pageSource, /deleteProviderConfigFile\(\{ configFileId: deletePlan\.configFileId \}\)/)
  assert.doesNotMatch(pageSource, /settingsProviderSessionClient\.deleteProviderConfigFile/)
  assert.doesNotMatch(pageSource, /Promise\.all\(\[catalogQuery\.refetch\(\), capabilitiesQuery\.refetch\(\)\]\)/)
  assert.doesNotMatch(pageSource, /Promise\.all\(\[providerModelConfigQuery\.refetch\(\), catalogQuery\.refetch\(\), capabilitiesQuery\.refetch\(\)\]\)/)

  assert.match(configFileSource, /export function buildConfigFileDiff\(/)
  assert.match(configFileSource, /export function buildActivateConfigFilePlan\(/)
  assert.match(configFileSource, /export function buildDuplicateConfigFileSavePlan\(/)
  assert.match(configFileSource, /export function buildBlankConfigFileSavePlan\(/)
  assert.match(configFileSource, /export function buildImportedConfigFileSavePlan\(/)
  assert.match(configFileSource, /export function buildConfigFileDetailsSavePlan\(/)
  assert.match(configFileSource, /export function buildDeleteConfigFilePlan\(/)
  assert.match(configFileSource, /export function buildSkillConfigFileSavePlan\(/)
  assert.match(configFileSource, /export function buildToolPermissionsConfigFileSavePlan\(/)
  assert.match(configFileSource, /export function configFileExportFilename\(/)
  assert.match(configFileSource, /export function configFileExportText\(/)
  assert.match(configFileSource, /export function configFileFileSizeError\(/)
  assert.match(configFileSource, /export function parseManagedConfigFileExportText\(/)
  assert.match(configFileSource, /export function buildSettingsSnapshotConfigFileWritePlan\(/)
  assert.match(configFileSource, /export function buildSettingsSnapshotWritePlan\(/)
  assert.match(configFileSource, /export function buildConfigFileRollbackBackupFromConfigFile\(/)
  assert.match(configFileSource, /export function buildConfigFileRollbackRestorePlan\(/)
  assert.match(configFileSource, /export function buildConfigFileWithSkillIds\(/)
  assert.match(configFileSource, /export function buildConfigFileWithDetails\(/)
  assert.match(configFileSource, /export function buildConfigFileWithToolGrants\(/)
  assert.match(configFileSource, /export function duplicateConfigFileForManagement\(/)
  assert.match(configFileSource, /export async function commitProviderConfigFilePlan\(/)
  assert.match(configFileSource, /export async function commitSettingsSnapshotWritePlan\(/)
  assert.match(configFileSource, /export function selectSettingsSnapshotForImport\(/)
  assert.match(configFileSource, /export function buildSettingsSnapshotImpactItems\(/)
  assert.match(configFileSource, /export function buildCurrentSettingsSnapshotText\(/)
  assert.match(configFileSource, /export function currentProviderConfigFileId\(/)
  assert.match(configFileSource, /export function currentProviderConfigFile\(/)
  assert.match(configFileSource, /export function selectedProviderConfigFile\(/)
  assert.match(configFileSource, /export function hasConfigFileDetailsChanged\(/)
  assert.match(configFileSource, /export function settingsSnapshotImportRequirementsForSnapshot\(/)
  assert.match(configFileSource, /export function toggleSettingsSnapshotImportScopes\(/)
  assert.match(configFileSource, /export function settingsSnapshotImportPresetScopes\(/)
  assert.match(configFileSource, /export function settingsSnapshotImportPreflightErrorForSnapshot\(/)
  assert.match(configFileSource, /export function settingsSnapshotImportPreflightError\(/)
  assert.match(configFileSource, /export function settingsSnapshotReferenceIssuesForImport\(/)
  assert.match(configFileSource, /validateSettingsSnapshotReferences/)
  assert.match(configFileSource, /export function buildToolPermissionsDiffItems\(/)
})

test('agent settings page delegates snapshot state and commands to an application controller', () => {
  assert.match(pageSource, /from '@\/features\/agent\/application\/useAgentSettingsSnapshotController'/)
  assert.match(pageSource, /const settingsSnapshot = useAgentSettingsSnapshotController\(\{[\s\S]*settingsImportBackup: agentSettings\.lastImportBackup,[\s\S]*\}\)/)
  assert.match(pageSource, /<SettingsSnapshotPanel[\s\S]*settingsSnapshotText=\{settingsSnapshot\.text\}/)
  assert.doesNotMatch(pageSource, /const \[settingsSnapshotText, setSettingsSnapshotText\]/)
  assert.doesNotMatch(pageSource, /function currentSettingsSnapshotImportPreflightError\(/)
  assert.doesNotMatch(pageSource, /async function importSettingsSnapshot\(/)
  assert.doesNotMatch(pageSource, /async function restoreSettingsImportBackup\(/)
  assert.doesNotMatch(pageSource, /commitSettingsSnapshotWritePlan/)
  assert.match(snapshotControllerSource, /export function useAgentSettingsSnapshotController\(/)
  assert.match(snapshotControllerSource, /const \[text, setText\] = useState\(''\)/)
  assert.match(snapshotControllerSource, /function importPreflightError\(\): string \| null/)
  assert.match(snapshotControllerSource, /async function importSnapshot\(\)/)
  assert.match(snapshotControllerSource, /async function restoreImportBackup\(\)/)
  assert.match(snapshotControllerSource, /commitSettingsSnapshotWritePlan\(/)
})

test('agent settings page delegates config file state and commands to an application controller', () => {
  assert.match(pageSource, /from '@\/features\/agent\/application\/useAgentSettingsConfigFileController'/)
  assert.match(pageSource, /const configFile = useAgentSettingsConfigFileController\(\{[\s\S]*backup: agentSettings\.lastConfigFileBackup,[\s\S]*\}\)/)
  assert.match(pageSource, /from '@\/features\/agent\/components\/AIAgentSettingsConfigFilesPanel'/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsConfigFileEditorShell[\s\S]*inputRef=\{configFile\.inputRef\}[\s\S]*onCreateConfigFile=\{configFile\.createBlank\}/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsConfigFileEditorHeaderSection[\s\S]*onSave=\{configFile\.saveActive\}[\s\S]*onDuplicate=\{configFile\.duplicateSelected\}/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsConfigFileDetailsSection[\s\S]*onSaveDetails=\{configFile\.saveDetails\}[\s\S]*onDelete=\{configFile\.deleteSelected\}/)
  assert.doesNotMatch(pageSource, /const \[selectedConfigFileId, setSelectedConfigFileId\]/)
  assert.doesNotMatch(pageSource, /const \[configFileNameWorkspace, setConfigFileNameWorkspace\]/)
  assert.doesNotMatch(pageSource, /async function saveActiveConfigFile\(/)
  assert.doesNotMatch(pageSource, /async function duplicateSelectedConfigFile\(/)
  assert.doesNotMatch(pageSource, /async function loadConfigFileFile\(/)
  assert.doesNotMatch(pageSource, /async function saveSelectedConfigFileDetails\(/)
  assert.doesNotMatch(pageSource, /async function deleteSelectedConfigFile\(/)
  assert.match(configFileControllerSource, /export function useAgentSettingsConfigFileController\(/)
  assert.match(configFileControllerSource, /const \[selectedConfigFileId, setSelectedConfigFileId\] = useState\(''\)/)
  assert.match(configFileControllerSource, /async function commitCatalogPlan\(/)
  assert.match(configFileControllerSource, /async function saveActive\(\)/)
  assert.match(configFileControllerSource, /async function duplicateSelected\(\)/)
  assert.match(configFileControllerSource, /async function loadFile\(/)
  assert.match(configFileControllerSource, /async function saveDetails\(\)/)
  assert.match(configFileControllerSource, /async function deleteSelected\(\)/)
})

test('agent settings page delegates model config state and commands to an application controller', () => {
  assert.match(pageSource, /from '@\/features\/agent\/application\/useAgentSettingsModelController'/)
  assert.match(pageSource, /const model = useAgentSettingsModelController\(\{[\s\S]*storedModelId: agentSettings\.modelId,[\s\S]*\}\)/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsModelPanel[\s\S]*selectedApiKind=\{model\.selectedApiKind\}[\s\S]*onSave=\{model\.saveSettings\}[\s\S]*onClearModelConfig=\{model\.clearModelConfig\}/)
  assert.doesNotMatch(pageSource, /const \[selectedModelId, setSelectedModelId\]/)
  assert.doesNotMatch(pageSource, /const \[modelApiKey, setModelApiKey\]/)
  assert.doesNotMatch(pageSource, /async function saveSettings\(/)
  assert.doesNotMatch(pageSource, /async function testSettings\(/)
  assert.doesNotMatch(pageSource, /async function clearModelConfig\(/)
  assert.doesNotMatch(pageSource, /providerModelSettingsHasUnsavedChanges\(/)
  assert.match(modelControllerSource, /export function useAgentSettingsModelController\(/)
  assert.match(modelControllerSource, /const \[selectedModelId, setSelectedModelId\] = useState<string>\(NO_MODEL_VALUE\)/)
  assert.match(modelControllerSource, /useQuery\(\{[\s\S]*agentSettingsKeys\.providerModelConfig/)
  assert.match(modelControllerSource, /function resetWorkspaceFromEffectiveConfig\(\)/)
  assert.match(modelControllerSource, /async function saveSettings\(\)/)
  assert.match(modelControllerSource, /async function testSettings\(\)/)
  assert.match(modelControllerSource, /async function clearModelConfig\(\)/)
})

test('agent settings page delegates skill catalog view model rules', () => {
  assert.match(pageSource, /from '@\/features\/agent\/application\/useAgentSettingsWorkspaceConfigController'/)
  assert.match(workspaceConfigControllerSource, /from '@\/features\/agent\/presentation\/agentSettingsSkillModel'/)
  for (const helperName of [
    'buildSkillStats',
    'filterSkills',
    'buildSkillConfigWorkspaces',
    'buildSkillConfigChanges',
    'buildConfigFileSkillIds',
    'buildSkillConfigIssues',
    'stringListSignature',
    'skillSourceKind',
    'skillSourceLabel',
  ]) {
    assert.match(skillModelSource, new RegExp(`export function ${helperName}\\b`))
    assert.doesNotMatch(pageSource, new RegExp(`function ${helperName}\\b`))
  }
  assert.match(skillModelSource, /export const SKILL_SOURCE_FILTERS/)
  assert.doesNotMatch(pageSource, /\.\.\.\(skill\.toolGrants \?\? \[\]\),\s*\n\s*\.\.\.\(skill\.toolGrants \?\? \[\]\),/)
})

test('agent settings page delegates tool permissions view model rules', () => {
  assert.match(pageSource, /from '@\/features\/agent\/application\/useAgentSettingsWorkspaceConfigController'/)
  assert.match(workspaceConfigControllerSource, /from '@\/features\/agent\/presentation\/agentSettingsToolPermissionsModel'/)
  for (const helperName of [
    'buildToolStats',
    'buildToolGrantWorkspaces',
    'currentToolGrantNames',
    'toolGrantWorkspaceMap',
    'toolPermissionsRank',
    'toolPermissionsFilterMatches',
    'filterToolPermissions',
    'repairToolGrantWorkspaces',
    'applyToolPermissionsBulkAction',
    'buildToolPermissionsFilterPresetUpdate',
    'uniqueToolPermissionsFilterPresetId',
    'toolPermissionsFilterPresetName',
  ]) {
    assert.match(toolPermissionsModelSource, new RegExp(`export function ${helperName}\\b`))
    assert.doesNotMatch(pageSource, new RegExp(`function ${helperName}\\b`))
  }
  assert.match(toolPermissionsModelSource, /export const TOOL_PERMISSIONS_FILTER_OPTIONS/)
  assert.match(toolPermissionsModelSource, /export type ToolPermissionsBulkAction/)
  assert.doesNotMatch(pageSource, /const issueByTool = new Map/)
  assert.doesNotMatch(pageSource, /const visibleToolByName = new Map/)
  assert.doesNotMatch(pageSource, /toolPermissionsSearch\.trim\(\)\.toLowerCase\(\)/)
  assert.doesNotMatch(pageSource, /toolPermissionsRank\(a\) - toolPermissionsRank\(b\)/)
  assert.doesNotMatch(pageSource, /tool\.unavailableReason,\s*\n\s*\]\.some/)
  assert.doesNotMatch(pageSource, /uniqueToolPermissionsFilterPresetId\(/)
  assert.doesNotMatch(pageSource, /toolPermissionsFilterPresetName\(/)
  assert.doesNotMatch(pageSource, /\.slice\(0, 12\)/)
  assert.doesNotMatch(pageSource, /matchingPreset\?\.id/)
})

test('agent settings page delegates provider model and profile rules', () => {
  assert.match(pageSource, /from '@\/features\/agent\/application\/agentSettingsProviderModel'/)
  for (const helperName of [
    'buildProviderProfileConfigOptions',
    'normalizeProviderProfileConfigId',
    'selectedProviderModel',
    'providerModelBaseURLState',
    'providerModelDraftState',
    'providerModelSettingsHasUnsavedChanges',
    'providerModelSecretValidationIssue',
    'buildProviderModelConfigRequest',
    'buildProviderModelOperationPlan',
    'buildProviderModelTestRequest',
    'providerModelValue',
    'modelDisplayName',
    'providerConfigModelHasSecret',
    'providerConfigUsesModelCatalog',
    'providerModelWorkspaceDraftFromConfig',
    'clearedProviderModelWorkspaceDraft',
    'storedProviderModelWorkspaceId',
    'buildProviderModelConfigFromSnapshotModel',
    'apiKindBaseURLPlaceholder',
    'isBackendCompatibleBaseURL',
    'toCompatibleGatewayBaseURL',
  ]) {
    assert.match(providerModelSource, new RegExp(`export function ${helperName}\\b`))
    assert.doesNotMatch(pageSource, new RegExp(`function ${helperName}\\b`))
  }
  assert.match(providerModelSource, /BUILT_IN_PROVIDER_PROFILE_CONFIG_FALLBACKS/)
  assert.doesNotMatch(pageSource, /const usesModelCatalog = !baseURLValue \|\| usesBackendCompatibleBaseURL/)
  assert.doesNotMatch(pageSource, /const directModelIdHasSecret = usesManualModelId && hasSensitiveTextSecret/)
  assert.doesNotMatch(pageSource, /const providerModelConfigValue = usesModelCatalog \?/)
  assert.doesNotMatch(pageSource, /providerModelConfigValue !== effectiveModelValue \|\|/)
  assert.doesNotMatch(pageSource, /if \(directModelIdHasSecret\)/)
  assert.doesNotMatch(pageSource, /if \(modelBaseURLHasSecret\)/)
  assert.doesNotMatch(pageSource, /modelConfigId: selectedModel\.id/)
  assert.doesNotMatch(pageSource, /buildProviderModelConfigRequest\(/)
  assert.doesNotMatch(pageSource, /providerConfigUsesModelCatalog\(providerModelConfigQuery\.data\)/)
  assert.doesNotMatch(pageSource, /providerConfigUsesModelCatalog\(effectiveConfig\)/)
  assert.doesNotMatch(pageSource, /const storedModel = textModels\.find/)
  assert.doesNotMatch(pageSource, /publicModelId\(storedModel\)/)
  assert.doesNotMatch(pageSource, /setSelectedModelId\(NO_MODEL_VALUE\)/)
  assert.doesNotMatch(pageSource, /setSelectedApiKind\(DEFAULT_API_KIND\)/)
  assert.doesNotMatch(pageSource, /BUILT_IN_PROVIDER_PROFILE_CONFIG_FALLBACKS/)
  assert.doesNotMatch(pageSource, /type ProviderProfileConfigOption =/)
})

test('agent settings page delegates status and action summary text', () => {
  assert.match(pageSource, /from '@\/features\/agent\/application\/useAgentSettingsSummaryCopy'/)
  assert.match(summaryCopySource, /from '@\/features\/agent\/presentation\/agentSettingsSummaryModel'/)
  assert.match(summaryModelSource, /export const SETTINGS_NAV_SECTIONS/)
  assert.match(summaryModelSource, /export function buildSettingsStatusSummaryLines/)
  assert.match(summaryModelSource, /export function buildSettingsActionSummaryLines/)
  assert.match(summaryModelSource, /function buildSettingsActionSummaryBodyLines/)
  assert.match(summaryCopySource, /buildSettingsStatusSummaryLines\(\{/)
  assert.match(summaryCopySource, /buildSettingsActionSummaryLines\(\{/)
  assert.match(pageSource, /useAgentSettingsSummaryCopy\(\{/)
  assert.doesNotMatch(pageSource, /function settingsSectionLabelKey/)
  assert.doesNotMatch(pageSource, /settingsActionItems\.flatMap/)
  assert.doesNotMatch(pageSource, /readinessItems\.map\(\(item, index\) => \(/)
})

test('agent settings page delegates page constants and small utilities', () => {
  assert.match(pageSource, /from '@\/features\/agent\/presentation\/agentSettingsPageModel'/)
  for (const exportName of [
    'NO_MODEL_VALUE',
    'DEFAULT_API_KIND',
    'MAX_SETTINGS_SNAPSHOT_BYTES',
    'MAX_CONFIG_FILE_BYTES',
    'API_KIND_OPTIONS',
  ]) {
    assert.match(pageModelSource, new RegExp(`export const ${exportName}\\b`))
  }
  for (const helperName of [
    'byteLength',
    'formatBytes',
    'isRecord',
    'modelAuditSummaryValues',
    'settingsErrorMessage',
    'settingsSnapshotExportFilename',
    'settingsSnapshotFileSizeError',
    'settingsQuickFixAuditAction',
    'settingsQuickFixDescriptor',
    'toolPermissionsAuditSummaryValues',
    'validateSettingsSnapshotText',
  ]) {
    assert.match(pageModelSource, new RegExp(`export function ${helperName}\\b`))
    assert.doesNotMatch(pageSource, new RegExp(`function ${helperName}\\b`))
  }
  assert.doesNotMatch(pageSource, /parseSettingsSnapshot/)
  assert.doesNotMatch(pageSource, /byteLength\(settingsSnapshotText\)/)
  for (const quickFix of [
    'reset-model-workspace',
    'confirm-clear-model-config',
    'enable-chat-route',
    'switch-openai-responses',
    'strip-sensitive-base-url-query',
    'reset-config-file-workspace',
    'reset-skill-config-workspace',
    'fix-tool-permissions-workspace-issues',
    'reset-tool-permissions-workspace',
  ]) {
    assert.match(pageModelSource, new RegExp(`'${quickFix}'`))
  }
  assert.match(pageSource, /settingsQuickFixDescriptor\(quickFix\)/)
  assert.match(pageModelSource, /export type SettingsQuickFixAuditKind/)
  assert.match(pageModelSource, /export type SettingsQuickFixDescriptor/)
  assert.doesNotMatch(pageSource, /const NO_MODEL_VALUE/)
  assert.doesNotMatch(pageSource, /const DEFAULT_API_KIND/)
  assert.doesNotMatch(pageSource, /const API_KIND_OPTIONS/)
  assert.doesNotMatch(pageSource, /type ToolPermissionsBulkAction =/)
  assert.doesNotMatch(pageSource, /type SettingsQuickFixAuditKind =/)
})

test('agent settings browser side effects are centralized in shared UI helpers', () => {
  assert.match(pageSource, /from '@\/shared\/ui\/browserActions'/)
  assert.match(pagePartsSource, /from '@\/shared\/ui\/browserActions'/)
  for (const source of [pageSource, pagePartsSource, summaryCopySource]) {
    assert.doesNotMatch(source, /navigator\.clipboard/)
    assert.doesNotMatch(source, /document\.createElement/)
    assert.doesNotMatch(source, /document\.body/)
    assert.doesNotMatch(source, /document\.getElementById/)
    assert.doesNotMatch(source, /scrollIntoView/)
    assert.doesNotMatch(source, /window\.setTimeout/)
    assert.doesNotMatch(source, /createObjectUrl/)
    assert.doesNotMatch(source, /revokeObjectUrl/)
  }

  assert.match(browserActionsSource, /export async function copyTextToClipboard/)
  assert.match(browserActionsSource, /export function scheduleUiReset/)
  assert.match(browserActionsSource, /export function scrollElementIntoViewById/)
  assert.match(browserActionsSource, /export function downloadTextFile/)
  assert.match(browserActionsSource, /navigator\.clipboard\.writeText/)
  assert.match(browserActionsSource, /window\.setTimeout/)
  assert.match(browserActionsSource, /document\.getElementById/)
  assert.match(browserActionsSource, /scrollIntoView/)
  assert.match(browserActionsSource, /document\.createElement/)
})

test('agent settings page delegates row and diff view sections', () => {
  assert.match(settingsSurfaceSource, /from '@\/features\/agent\/components\/AIAgentSettingsPageParts'/)
  for (const componentName of [
    'SkillRow',
    'ConfigFileDiffPanel',
    'ToolPermissionsDiffPreview',
    'ToolPermissionsRow',
  ]) {
    assert.match(pagePartsSource, new RegExp(`export function ${componentName}\\b`))
    assert.doesNotMatch(pageSource, new RegExp(`function ${componentName}\\b`))
  }

  assert.match(pagePartsSource, /export function configFileListSummary/)
  assert.doesNotMatch(pageSource, /function configFileListSummary\b/)
  assert.doesNotMatch(pageSource, /function ConfigFileRow\b/)
  assert.doesNotMatch(pageSource, /function configFileSummaryItems\b/)
  assert.doesNotMatch(pageSource, /AgentSettingsToolPermissionsRow/)
  assert.doesNotMatch(pageSource, /AgentSettingsSkillCard/)
})

test('agent settings page delegates snapshot and API mode panels', () => {
  assert.match(pageSource, /from '@\/features\/agent\/components\/AIAgentSettingsSnapshotPanel'/)
  assert.match(snapshotPanelSource, /export function SettingsSnapshotPanel\b/)
  assert.match(pageSource, /<SettingsSnapshotPanel\b/)
  assert.doesNotMatch(pageSource, /function SettingsSnapshotPanel\b/)
  assert.match(pagePartsSource, /export function SettingsAuditTrailPanel\b/)
  assert.doesNotMatch(pageSource, /<SettingsAuditTrailPanel\b/)

  for (const componentName of [
    'SettingsSnapshotImportScopeSelector',
    'SettingsSnapshotSummary',
    'SettingsSnapshotImpactPreview',
  ]) {
    assert.match(snapshotPanelSource, new RegExp(`export function ${componentName}\\b`))
    assert.match(snapshotPanelSource, new RegExp(`<${componentName}\\b`))
    assert.doesNotMatch(pageSource, new RegExp(`function ${componentName}\\b`))
  }

  assert.match(pagePartsSource, /const API_MODE_CAPABILITY_MATRIX/)
  assert.match(pagePartsSource, /const API_MODE_MIGRATION_STEPS/)
  assert.doesNotMatch(pageSource, /const API_MODE_CAPABILITY_MATRIX/)
  assert.doesNotMatch(pageSource, /const API_MODE_MIGRATION_STEPS/)
  assert.doesNotMatch(pageSource, /function formatSettingsAuditAction/)
})

test('agent settings page delegates overview panels', () => {
  assert.match(pageSource, /from '@\/features\/agent\/components\/AIAgentSettingsOverviewPanels'/)
  assert.match(pageSource, /<AIAgentSettingsOverviewPanels\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsReadinessPanel\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsActionItemsPanel\b/)
  assert.doesNotMatch(pageSource, /readinessItems\.map\(\(item\) => \(\{/)
  assert.doesNotMatch(pageSource, /settingsActionItems\.map\(\(item\) => \(\{/)
  assert.doesNotMatch(pageSource, /settingsActionItems\.filter\(\(item\) => item\.status === 'action'\)/)

  assert.match(overviewPanelsSource, /export function AIAgentSettingsOverviewPanels/)
  assert.match(overviewPanelsSource, /import type \{[\s\S]*SettingsActionItem[\s\S]*SettingsReadinessItem[\s\S]*\}/)
  assert.match(overviewPanelsSource, /import type \{ AgentSettingsAuditEntry \}/)
  assert.match(overviewPanelsSource, /<AgentSettingsReadinessPanel\b/)
  assert.match(overviewPanelsSource, /<AgentSettingsActionItemsPanel\b/)
  assert.match(overviewPanelsSource, /<SettingsAuditTrailPanel\b/)
  assert.match(overviewPanelsSource, /agentSettingsStatusRecipe\(item\.status\)/)
})

test('agent settings page delegates header section', () => {
  assert.match(pageSource, /from '@\/features\/agent\/components\/AIAgentSettingsHeaderSection'/)
  assert.match(pageSource, /<AIAgentSettingsHeaderSection\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsHeaderContent\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsHeaderActions\b/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-workspace-profile"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-copy-status"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-refresh"/)
  assert.doesNotMatch(pageSource, /agentConfigStatusRecipe/)

  assert.match(headerSectionSource, /export function AIAgentSettingsHeaderSection/)
  assert.match(headerSectionSource, /import type \{ ProviderProfileConfigOption \}/)
  assert.match(headerSectionSource, /<AgentSettingsHeaderContent\b/)
  assert.match(headerSectionSource, /<AgentSettingsHeaderActions\b/)
  assert.match(headerSectionSource, /data-testid="agent-settings-workspace-profile"/)
  assert.match(headerSectionSource, /data-testid="agent-settings-copy-status"/)
  assert.match(headerSectionSource, /data-testid="agent-settings-refresh"/)
  assert.match(headerSectionSource, /agentConfigStatusRecipe\(configured\)/)
})

test('agent settings page delegates model configuration panel', () => {
  assert.match(configFilesPanelSource, /from '@\/features\/agent\/components\/AIAgentSettingsModelPanel'/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsModelPanel\b/)
  assert.doesNotMatch(pageSource, /id="agent-settings-model"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-provider-model-id"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-clear-model-config"/)
  assert.doesNotMatch(pageSource, /<ModelCompatibilityProbePanel\b/)
  assert.doesNotMatch(pageSource, /<ApiModeMigrationGuide\b/)
  assert.doesNotMatch(pageSource, /<ApiModeSwitchPlanPanel\b/)

  assert.match(modelPanelSource, /export function AIAgentSettingsModelPanel/)
  for (const componentName of [
    'ApiModeCapabilityMatrix',
    'ModelCompatibilityProbePanel',
    'ApiModeMigrationGuide',
    'ApiModeSwitchPlanPanel',
  ]) {
    assert.match(pagePartsSource, new RegExp(`export function ${componentName}\\b`))
    assert.match(modelPanelSource, new RegExp(`<${componentName}\\b`))
  }
  assert.match(modelPanelSource, /id="agent-settings-model"/)
  assert.match(modelPanelSource, /data-testid="agent-settings-provider-model-id"/)
  assert.match(modelPanelSource, /data-testid="agent-settings-clear-model-config"/)
})

test('agent settings page delegates config file browser section', () => {
  assert.doesNotMatch(pageSource, /from '@\/features\/agent\/components\/AIAgentSettingsConfigFileBrowserSection'/)
  assert.doesNotMatch(pageSource, /<AIAgentSettingsConfigFileBrowserSection\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsConfigFileBrowser\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsConfigFileList\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsConfigFileListButton\b/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-create-config-file"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-import-config-file"/)
  assert.doesNotMatch(pageSource, /configFileListSummary\(configFile, t\)/)

  assert.match(configFileBrowserSectionSource, /export function AIAgentSettingsConfigFileBrowserSection/)
  assert.match(configFileBrowserSectionSource, /<AgentSettingsConfigFileBrowser\b/)
  assert.match(configFileBrowserSectionSource, /<AgentSettingsConfigFileList\b/)
  assert.match(configFileBrowserSectionSource, /<AgentSettingsConfigFileListButton\b/)
  assert.match(configFileBrowserSectionSource, /data-testid="agent-settings-create-config-file"/)
  assert.match(configFileBrowserSectionSource, /data-testid="agent-settings-import-config-file"/)
  assert.match(configFileBrowserSectionSource, /configFileListSummary\(configFile, t\)/)
})

test('agent settings page delegates config file editor shell', () => {
  assert.match(configFilesPanelSource, /from '@\/features\/agent\/components\/AIAgentSettingsConfigFileEditorShell'/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsConfigFileEditorShell\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsConfigFileEditor\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsConfigFileEditorPane\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsFormGrid\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsKeyValue\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsInput\b/)
  assert.doesNotMatch(pageSource, /configFileScopeHelp/)
  assert.doesNotMatch(pageSource, /configFileFields\.total/)

  assert.match(configFileEditorShellSource, /export function AIAgentSettingsConfigFileEditorShell/)
  assert.match(configFileEditorShellSource, /import type \{ ReactNode, RefObject \}/)
  assert.match(configFileEditorShellSource, /<AgentSettingsConfigFileEditor\b/)
  assert.match(configFileEditorShellSource, /<AgentSettingsConfigFileEditorPane\b/)
  assert.match(configFileEditorShellSource, /<AgentSettingsFormGrid\b/)
  assert.match(configFileEditorShellSource, /<AgentSettingsKeyValue\b/)
  assert.match(configFileEditorShellSource, /<AgentSettingsInput\b/)
  assert.match(configFileEditorShellSource, /<AIAgentSettingsConfigFileBrowserSection\b/)
  assert.match(configFileEditorShellSource, /configFileScopeHelp/)
  assert.match(configFileEditorShellSource, /configFileFields\.total/)
})

test('agent settings page delegates config file editor header section', () => {
  assert.match(configFilesPanelSource, /from '@\/features\/agent\/components\/AIAgentSettingsConfigFileEditorHeaderSection'/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsConfigFileEditorHeaderSection\b/)
  assert.doesNotMatch(pageSource, /<AgentSettingsConfigFileEditorHeader\b/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-copy-config-file"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-download-config-file"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-config-file-message"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-config-file-readonly"/)

  assert.match(configFileEditorHeaderSectionSource, /export function AIAgentSettingsConfigFileEditorHeaderSection/)
  assert.match(configFileEditorHeaderSectionSource, /<AgentSettingsConfigFileEditorHeader\b/)
  assert.match(configFileEditorHeaderSectionSource, /data-testid="agent-settings-copy-config-file"/)
  assert.match(configFileEditorHeaderSectionSource, /data-testid="agent-settings-download-config-file"/)
  assert.match(configFileEditorHeaderSectionSource, /data-testid="agent-settings-config-file-message"/)
  assert.match(configFileEditorHeaderSectionSource, /data-testid="agent-settings-config-file-readonly"/)
  assert.match(configFileEditorHeaderSectionSource, /<AppInlineError>/)
})

test('agent settings page delegates config file rollback backup panel', () => {
  assert.match(configFilesPanelSource, /from '@\/features\/agent\/components\/AIAgentSettingsConfigFileRollbackBackupPanel'/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsConfigFileRollbackBackupPanel\b/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-config-file-backup"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-restore-config-file-backup"/)
  assert.doesNotMatch(pageSource, /configFileBackupHelp/)

  assert.match(configFileRollbackBackupPanelSource, /export function AIAgentSettingsConfigFileRollbackBackupPanel/)
  assert.match(configFileRollbackBackupPanelSource, /import type \{ AgentSettingsConfigFileBackup \}/)
  assert.match(configFileRollbackBackupPanelSource, /data-testid="agent-settings-config-file-backup"/)
  assert.match(configFileRollbackBackupPanelSource, /data-testid="agent-settings-restore-config-file-backup"/)
  assert.match(configFileRollbackBackupPanelSource, /configFileBackupHelp/)
})

test('agent settings page delegates config file details sections', () => {
  assert.match(configFilesPanelSource, /from '@\/features\/agent\/components\/AIAgentSettingsConfigFileDetailsSection'/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsConfigFileDetailsSection\b/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-config-file-name"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-config-file-limits"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-config-file-approval-defaults"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-save-config-file-details"/)
  assert.doesNotMatch(pageSource, /CONFIG_FILE_LIMIT_KEYS\.map/)
  assert.doesNotMatch(pageSource, /CONFIG_FILE_APPROVAL_DEFAULT_KEYS\.map/)

  assert.match(configFileDetailsSectionSource, /export function AIAgentSettingsConfigFileDetailsSection/)
  assert.match(configFileDetailsSectionSource, /data-testid="agent-settings-config-file-name"/)
  assert.match(configFileDetailsSectionSource, /data-testid="agent-settings-config-file-limits"/)
  assert.match(configFileDetailsSectionSource, /data-testid="agent-settings-config-file-approval-defaults"/)
  assert.match(configFileDetailsSectionSource, /data-testid="agent-settings-save-config-file-details"/)
  assert.match(configFileDetailsSectionSource, /CONFIG_FILE_LIMIT_KEYS\.map/)
  assert.match(configFileDetailsSectionSource, /CONFIG_FILE_APPROVAL_DEFAULT_KEYS\.map/)
})

test('agent settings page delegates skill configuration section', () => {
  assert.match(configFilesPanelSource, /from '@\/features\/agent\/components\/AIAgentSettingsSkillSection'/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsSkillSection\b/)
  assert.doesNotMatch(pageSource, /id="agent-settings-skills"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-skill-filters"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-save-skill-config"/)
  assert.doesNotMatch(pageSource, /<SkillRow\b/)
  assert.doesNotMatch(pageSource, /SKILL_SOURCE_FILTERS\.map/)

  assert.match(skillSectionSource, /export function AIAgentSettingsSkillSection/)
  assert.match(skillSectionSource, /id="agent-settings-skills"/)
  assert.match(skillSectionSource, /data-testid="agent-settings-skill-filters"/)
  assert.match(skillSectionSource, /data-testid="agent-settings-save-skill-config"/)
  assert.match(skillSectionSource, /<SkillRow\b/)
  assert.match(skillSectionSource, /SKILL_SOURCE_FILTERS\.map/)
})

test('agent settings page delegates tool permissions section', () => {
  assert.match(configFilesPanelSource, /from '@\/features\/agent\/components\/AIAgentSettingsToolPermissionsSection'/)
  assert.match(configFilesPanelSource, /<AIAgentSettingsToolPermissionsSection\b/)
  assert.doesNotMatch(pageSource, /id="agent-settings-tools"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-save-tool-permissions"/)
  assert.doesNotMatch(pageSource, /data-testid="agent-settings-config-file-tool-permissions"/)
  assert.doesNotMatch(pageSource, /<ToolPermissionsRow\b/)
  assert.doesNotMatch(pageSource, /<ToolPermissionsDiffPreview\b/)
  assert.doesNotMatch(pageSource, /TOOL_PERMISSIONS_FILTER_OPTIONS\.map/)

  assert.match(toolPermissionsSectionSource, /export function AIAgentSettingsToolPermissionsSection/)
  assert.match(toolPermissionsSectionSource, /id="agent-settings-tools"/)
  assert.match(toolPermissionsSectionSource, /data-testid="agent-settings-save-tool-permissions"/)
  assert.match(toolPermissionsSectionSource, /data-testid="agent-settings-config-file-tool-permissions"/)
  assert.match(toolPermissionsSectionSource, /<ToolPermissionsRow\b/)
  assert.match(toolPermissionsSectionSource, /<ToolPermissionsDiffPreview\b/)
  assert.match(toolPermissionsSectionSource, /TOOL_PERMISSIONS_FILTER_OPTIONS\.map/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
