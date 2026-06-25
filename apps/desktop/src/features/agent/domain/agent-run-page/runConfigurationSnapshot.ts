import { runApprovalModeLabel } from '@/features/agent/domain/agentRunUi'
import { isRecord } from '@/shared/domain/jsonValue'
import type { AgentRun } from '@movscript/agent-protocol'

export interface AgentRunConfigurationSnapshotView {
  capturedAt: string
  catalogSnapshotLabel: string
  pluginCatalogLabel: string
  configFileId: string
  configFileName: string
  configFileVersion: string
  enabledPackCount: number
  configSkillCount: number
  grantedToolCount: number
  effectiveToolCount: number
  catalogSkillCount: number
  catalogToolCount: number
  modelLabel: string
  limitItems: string[]
  providerSessionLimitItems: string[]
  packNames: string[]
  skillIds: string[]
  toolNames: string[]
  approvalDefaultItems: string[]
  packDetails: string[]
  skillInstructionItems: string[]
  configFileToolGrantItems: string[]
  toolPermissionOverrideItems: string[]
  toolGrantItems: string[]
  actualSkillIds: string[]
  omittedSkillIds: string[]
  omittedConfigSkillItems: string[]
  visibleToolNames: string[]
}

export function buildRunConfigurationSnapshotView(run: AgentRun | undefined): AgentRunConfigurationSnapshotView | null {
  const snapshot = run?.metadata?.configurationSnapshot
  if (!isRecord(snapshot) || snapshot.schema !== 'movscript.agent.run-configuration-snapshot.v1') return null

  const manifest = activeProviderManifestFromRunConfigurationSnapshot(snapshot)
  const configFileId = stringValue(snapshot.activeConfigFileId)
  if (!configFileId) return null
  const configFiles = recordArray(snapshot.configFiles)
  const activeConfigFile = configFiles.find((configFile) => stringValue(configFile.id) === configFileId)
  const activeConfigFileId = configFileId
  const catalogSnapshot = isRecord(snapshot.catalogSnapshot) ? snapshot.catalogSnapshot : {}
  const packs = recordArray(snapshot.packs)
  const skills = recordArray(snapshot.skills)
  const tools = recordArray(snapshot.tools)
  const pluginCatalog = isRecord(snapshot.pluginCatalog) ? snapshot.pluginCatalog : null
  const manifestToolGrants = recordArray(manifest.tools)
  const enabledPackIds = stringArray(activeConfigFile?.enabledPackIds)
  const skillIds = stringArray(activeConfigFile?.skillIds)
  const toolGrants = recordArray(activeConfigFile?.toolGrants)
  const effectiveToolGrants = manifestToolGrants.length > 0 ? manifestToolGrants : toolGrants
  const limits = isRecord(activeConfigFile?.limits) ? activeConfigFile.limits : {}
  const approvalDefaults = isRecord(activeConfigFile?.approvalDefaults) ? activeConfigFile.approvalDefaults : {}
  const activeModel = isRecord(activeConfigFile?.model) ? activeConfigFile.model : isRecord(manifest.model) ? manifest.model : {}
  const toolPermissionOverridesByConfigFile = isRecord(snapshot.toolPermissionOverridesByConfigFile) ? snapshot.toolPermissionOverridesByConfigFile : {}
  const toolPermissionOverrides = recordArray(toolPermissionOverridesByConfigFile[activeConfigFileId])
  const skillsById = new Map(skills.map((skill) => [stringValue(skill.id) ?? '', skill]))
  const toolsByName = new Map(tools.map((tool) => [stringValue(tool.name) ?? '', tool]))
  const metadata = isRecord(run?.metadata) ? run.metadata : {}
  const providerSessionLimits = providerSessionLimitsFromRunConfigurationSnapshot(snapshot)
  const actualSkillIds = stringArray(metadata.activeSkillIds)
  const visibleToolNames = stringArray(metadata.visibleToolNames)
  const omittedSkillIds = skillIds.filter((skillId) => !actualSkillIds.includes(skillId))
  const modelLabel = [
    stringValue(activeModel.provider),
    stringValue(activeModel.modelId) ?? stringValue(activeModel.platformModelId),
  ].filter(Boolean).join(' / ') || '-'

  return {
    capturedAt: stringValue(snapshot.capturedAt) ?? '',
    catalogSnapshotLabel: [
      stringValue(catalogSnapshot.id) ?? '-',
      stringValue(catalogSnapshot.version),
    ].filter(Boolean).join(' @ '),
    pluginCatalogLabel: pluginCatalog ? pluginCatalogSnapshotLabel(pluginCatalog) : '未捕获插件目录信息',
    configFileId: activeConfigFileId,
    configFileName: (stringValue(activeConfigFile?.name) ?? stringValue(activeConfigFile?.id) ?? configFileId) || '-',
    configFileVersion: stringValue(activeConfigFile?.version) ?? '-',
    enabledPackCount: enabledPackIds.length,
    configSkillCount: skillIds.length,
    grantedToolCount: toolGrants.length,
    effectiveToolCount: effectiveToolGrants.length,
    catalogSkillCount: skills.length,
    catalogToolCount: tools.length,
    modelLabel,
    limitItems: configFileLimitItems(limits),
    providerSessionLimitItems: providerSessionLimitSummaryItems(providerSessionLimits),
    approvalDefaultItems: Object.entries(approvalDefaults)
      .flatMap(([key, value]) => stringValue(value) ? [`${key}: ${stringValue(value)}`] : []),
    packNames: packs
      .filter((pack) => enabledPackIds.includes(stringValue(pack.id) ?? ''))
      .map((pack) => stringValue(pack.name) ?? stringValue(pack.id) ?? '')
      .filter(Boolean),
    packDetails: packs
      .filter((pack) => enabledPackIds.includes(stringValue(pack.id) ?? ''))
      .map((pack) => {
        const name = stringValue(pack.name) ?? stringValue(pack.id)
        const source = stringValue(pack.source)
        return name ? `${name}${source ? `:${source}` : ''}` : ''
      })
      .filter(Boolean),
    skillIds,
    skillInstructionItems: skillIds.flatMap((id) => {
      const skill = skillsById.get(id)
      const instruction = stringValue(skill?.instructionTemplate)
      const label = stringValue(skill?.name) ?? id
      return instruction ? [`${label}:${instruction.length} chars`] : []
    }),
    toolNames: toolGrants
      .map((grant) => stringValue(grant.name))
      .filter((name): name is string => !!name),
    configFileToolGrantItems: toolGrantDisplayItems(toolGrants, toolsByName),
    toolPermissionOverrideItems: toolGrantDisplayItems(toolPermissionOverrides, toolsByName),
    toolGrantItems: toolGrantDisplayItems(effectiveToolGrants, toolsByName),
    actualSkillIds,
    omittedSkillIds,
    omittedConfigSkillItems: omittedSkillDisplayItems(omittedSkillIds, skillsById),
    visibleToolNames,
  }
}

function pluginCatalogSnapshotLabel(pluginCatalog: Record<string, unknown>): string {
  const metadata = isRecord(pluginCatalog.metadata) ? pluginCatalog.metadata : {}
  const skillCount = finiteNumberValue(pluginCatalog.skillCount)
  const toolCount = finiteNumberValue(pluginCatalog.toolCount)
  const catalogVersion = stringValue(metadata.catalogVersion)
  return [
    `Skills ${skillCount ?? '-'}`,
    `Tools ${toolCount ?? '-'}`,
    catalogVersion ? `版本 ${catalogVersion}` : undefined,
  ].filter(Boolean).join(' · ')
}

function omittedSkillDisplayItems(skillIds: string[], skillsById: Map<string, Record<string, unknown>>): string[] {
  return skillIds.map((skillId) => {
    const skill = skillsById.get(skillId)
    if (!skill) return `${skillId}: 快照中缺少 Skill 详情`
    const name = stringValue(skill.name) ?? skillId
    const loadMode = stringValue(skill.loadMode)
    const parts = [
      skillLoadModeRunLabel(loadMode),
      omittedSkillRunReason(loadMode),
      skillRunRelationSummary(skill),
    ].filter(Boolean)
    return `${name}: ${parts.join(' / ')}`
  })
}

function skillLoadModeRunLabel(loadMode: string | undefined): string {
  if (loadMode === 'core') return '核心加载'
  if (loadMode === 'on_demand') return '按需加载'
  if (loadMode === 'manual') return '手动加载'
  return '未声明加载方式'
}

function omittedSkillRunReason(loadMode: string | undefined): string {
  if (loadMode === 'on_demand') return '本次未被触发进入上下文'
  if (loadMode === 'manual') return '本次未手动激活'
  if (loadMode === 'core') return '本次上下文未保留，检查依赖、冲突或预算裁剪'
  return '本次运行未激活'
}

function skillRunRelationSummary(skill: Record<string, unknown>): string | undefined {
  const counts = [
    arrayLength(skill.triggers) > 0 ? `触发条件 ${arrayLength(skill.triggers)}` : undefined,
    stringArray(skill.dependencies).length > 0 ? `依赖 ${stringArray(skill.dependencies).length}` : undefined,
    stringArray(skill.conflicts).length > 0 ? `冲突 ${stringArray(skill.conflicts).length}` : undefined,
  ].filter(Boolean)
  return counts.length > 0 ? counts.join(', ') : undefined
}

function providerSessionLimitSummaryItems(limits: Record<string, unknown>): string[] {
  const execution = isRecord(limits.execution) ? limits.execution : {}
  return [
    stringValue(limits.approvalMode) ? `运行审批: ${runApprovalModeLabel(stringValue(limits.approvalMode))}` : undefined,
    finiteNumberValue(limits.maxToolCalls) === undefined ? undefined : `工具上限: ${finiteNumberValue(limits.maxToolCalls)}`,
    finiteNumberValue(limits.maxIterations) === undefined ? undefined : `迭代上限: ${finiteNumberValue(limits.maxIterations)}`,
    typeof limits.sandboxMode === 'boolean' ? `沙箱: ${limits.sandboxMode ? '开启' : '关闭'}` : undefined,
    stringValue(execution.mode) ? `执行模式: ${stringValue(execution.mode)}` : undefined,
    typeof execution.includeMemories === 'boolean' ? `记忆: ${execution.includeMemories ? '包含' : '不包含'}` : undefined,
    typeof execution.allowForcedToolCalls === 'boolean' ? `强制工具: ${execution.allowForcedToolCalls ? '允许' : '禁用'}` : undefined,
  ].filter((item): item is string => !!item)
}

function providerSessionLimitsFromRunConfigurationSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(snapshot.providerSessionLimits)) return snapshot.providerSessionLimits
  return {}
}

function activeProviderManifestFromRunConfigurationSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(snapshot.activeProviderManifest)) return snapshot.activeProviderManifest
  if (isRecord(snapshot.activeAgentManifest)) return snapshot.activeAgentManifest
  return {}
}

function configFileLimitItems(limits: Record<string, unknown>): string[] {
  return Object.entries(limits).flatMap(([key, value]) => {
    if (typeof value === 'number' && Number.isFinite(value)) return [`${key}: ${value}`]
    if (typeof value === 'boolean') return [`${key}: ${value ? 'true' : 'false'}`]
    const text = stringValue(value)
    return text ? [`${key}: ${text}`] : []
  })
}

function toolGrantDisplayItems(grants: Record<string, unknown>[], toolsByName: Map<string, Record<string, unknown>>): string[] {
  return grants.flatMap((grant) => {
    const name = stringValue(grant.name)
    if (!name) return []
    const catalogTool = toolsByName.get(name)
    const mode = stringValue(grant.mode) ?? '-'
    const defaults = isRecord(catalogTool?.defaults) ? catalogTool.defaults : {}
    const approval = stringValue(grant.approval) ?? stringValue(defaults.approval) ?? '-'
    return [`${name}:${mode}/${approval}`]
  })
}

export function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

export function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function finiteNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
