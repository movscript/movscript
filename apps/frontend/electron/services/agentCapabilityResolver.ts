import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ProviderConfig, ProviderRuntimeProfile } from '../../src/shared/infrastructure/providerConfigStore'
import type { ElectronProjectSkillProviderTarget } from '../../src/shared/contracts/electronApi'

export const MOVSCRIPT_BUNDLED_PLUGIN_KEY = 'movscript@movscript-bundled'
export const MOVSCRIPT_BUNDLED_PLUGIN_SEGMENT = 'movscript_movscript-bundled'

export const PROVIDER_SKILL_DIR_NAMES: Record<ElectronProjectSkillProviderTarget, string> = {
  codex: '.codex',
  mova: '.mova',
  claude: '.claude',
}

export type AgentCapabilityLayer = 'workspace-root' | 'project-cwd' | 'thread-override'

export interface AgentCapabilitySkillRoot {
  layer: AgentCapabilityLayer
  path: string
  inherited: boolean
  pluginKey?: string
}

export interface AgentEffectiveCapabilityPaths {
  workspaceDir: string
  cwd: string
  providerTarget?: ElectronProjectSkillProviderTarget
  defaultWorkspaceSkillDir?: string
  defaultCwdSkillDir?: string
  skillRoots: AgentCapabilitySkillRoot[]
}

export function sdkRuntimeProviderTarget(input: {
  provider: Pick<ProviderConfig, 'kind'>
  runtime: Pick<ProviderRuntimeProfile, 'api'>
}): ElectronProjectSkillProviderTarget | undefined {
  if (input.provider.kind === 'codex' || input.runtime.api === 'codex-sdk') return 'codex'
  if (input.provider.kind === 'mova' || input.runtime.api === 'mova-sdk') return 'mova'
  if (input.provider.kind === 'claude' || input.runtime.api === 'claude-sdk') return 'claude'
  return undefined
}

export function resolveAgentEffectiveCapabilityPaths(input: {
  workspaceDir: string
  cwd?: string
  providerTarget?: ElectronProjectSkillProviderTarget
  extraSkillRoots?: string[]
}): AgentEffectiveCapabilityPaths {
  const workspaceDir = resolve(input.workspaceDir)
  const cwd = resolve(input.cwd?.trim() || workspaceDir)
  const target = input.providerTarget
  const roots: AgentCapabilitySkillRoot[] = []
  const defaultWorkspaceSkillDir = target ? providerDefaultPluginSkillDir(workspaceDir, target) : undefined
  const defaultCwdSkillDir = target ? providerDefaultPluginSkillDir(cwd, target) : undefined

  if (defaultWorkspaceSkillDir && existsSync(defaultWorkspaceSkillDir)) {
    roots.push({
      layer: 'workspace-root',
      path: providerSkillRootDir(workspaceDir, target!),
      inherited: cwd !== workspaceDir,
      pluginKey: MOVSCRIPT_BUNDLED_PLUGIN_KEY,
    })
  }

  if (defaultCwdSkillDir && cwd !== workspaceDir && existsSync(defaultCwdSkillDir)) {
    roots.push({
      layer: 'project-cwd',
      path: providerSkillRootDir(cwd, target!),
      inherited: false,
      pluginKey: MOVSCRIPT_BUNDLED_PLUGIN_KEY,
    })
  }

  for (const root of normalizeRoots(input.extraSkillRoots)) {
    if (!existsSync(root)) continue
    roots.push({
      layer: 'thread-override',
      path: root,
      inherited: false,
    })
  }

  return {
    workspaceDir,
    cwd,
    ...(target ? { providerTarget: target } : {}),
    ...(defaultWorkspaceSkillDir ? { defaultWorkspaceSkillDir } : {}),
    ...(defaultCwdSkillDir ? { defaultCwdSkillDir } : {}),
    skillRoots: dedupeSkillRoots(roots),
  }
}

export function providerSkillRootDir(cwd: string, providerTarget: ElectronProjectSkillProviderTarget): string {
  return join(resolve(cwd), PROVIDER_SKILL_DIR_NAMES[providerTarget], 'skills')
}

export function providerDefaultPluginSkillDir(cwd: string, providerTarget: ElectronProjectSkillProviderTarget): string {
  return join(providerSkillRootDir(cwd, providerTarget), 'plugins', MOVSCRIPT_BUNDLED_PLUGIN_SEGMENT)
}

function normalizeRoots(value: unknown): string[] {
  const input = Array.isArray(value) ? value : []
  return Array.from(new Set(input.flatMap((item) => (
    typeof item === 'string' && item.trim() ? [resolve(item.trim())] : []
  ))))
}

function dedupeSkillRoots(roots: AgentCapabilitySkillRoot[]): AgentCapabilitySkillRoot[] {
  const byPath = new Map<string, AgentCapabilitySkillRoot>()
  for (const root of roots) byPath.set(root.path, root)
  return [...byPath.values()]
}
