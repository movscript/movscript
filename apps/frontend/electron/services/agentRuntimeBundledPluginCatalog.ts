import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronProjectSkillProviderTarget } from '../../src/shared/contracts/electronApi'
import {
  MOVSCRIPT_BUNDLED_PLUGIN_KEY,
} from './agentCapabilityResolver'
import {
  resolveMovScriptBundledPluginSource,
  validateMovScriptBundledPluginSource,
} from './movscriptBundledPluginSource'
import {
  getProjectPluginSnapshot,
  installProjectPlugin,
} from './projectPluginStore'

const BUNDLED_MARKETPLACE_NAME = 'movscript-bundled'
const BUNDLED_PROVIDER_TARGETS: ElectronProjectSkillProviderTarget[] = ['codex', 'mova', 'claude']

export function listAgentRuntimeBundledPlugins(input: {
  workspaceDir?: string
} = {}): {
  marketplaces: Array<{
    name: string
    path: string
    interface: { displayName: string }
    plugins: Array<Record<string, unknown>>
  }>
} {
  const source = resolveMovScriptBundledPluginSource()
  validateMovScriptBundledPluginSource(source)
  const manifest = readBundledProviderManifest(source)
  const pluginName = stringField(manifest.name) ?? 'movscript'
  const pluginInterface = isRecord(manifest.interface) ? manifest.interface : {}
  const rootSnapshot = input.workspaceDir?.trim() ? getProjectPluginSnapshot({ workspaceDir: input.workspaceDir }) : undefined
  const rootPlugin = rootSnapshot?.plugins.find((plugin) => plugin.pluginKey === MOVSCRIPT_BUNDLED_PLUGIN_KEY)
  return {
    marketplaces: [{
      name: BUNDLED_MARKETPLACE_NAME,
      path: source,
      interface: { displayName: 'MovScript Bundled' },
      plugins: [{
        id: pluginName,
        name: pluginName,
        localVersion: stringField(manifest.version) ?? '0.0.0',
        source: {
          type: 'local',
          path: source,
        },
        interface: pluginInterface,
        keywords: stringArray(manifest.keywords),
        providerTargets: BUNDLED_PROVIDER_TARGETS,
        installed: Boolean(rootPlugin?.prepared),
        prepared: Boolean(rootPlugin?.prepared),
        enabled: rootPlugin?.enabled !== false,
        rootProjectCwd: rootSnapshot?.projectCwd,
        preparedPaths: rootPlugin?.preparedPaths,
        sourceAvailable: existsSync(join(source, 'skills')),
      }],
    }],
  }
}

export function installAgentRuntimeBundledPlugin(input: {
  pluginName?: string
  workspaceDir?: string
} = {}): {
  installedPath: string
  pluginName: string
  marketplaceName: string
  projectCwd?: string
  manifestPath?: string
  lockPath?: string
  providerTargets?: ElectronProjectSkillProviderTarget[]
  preparedPaths?: unknown
} {
  const source = resolveMovScriptBundledPluginSource()
  validateMovScriptBundledPluginSource(source)
  if (input.workspaceDir?.trim()) {
    const snapshot = installProjectPlugin({
      workspaceDir: input.workspaceDir,
      id: 'movscript',
      name: 'movscript',
      marketplaceName: BUNDLED_MARKETPLACE_NAME,
      pluginKey: MOVSCRIPT_BUNDLED_PLUGIN_KEY,
      sourceType: 'local',
      sourcePath: source,
      providerTargets: BUNDLED_PROVIDER_TARGETS,
    })
    const plugin = snapshot.plugins.find((item) => item.pluginKey === MOVSCRIPT_BUNDLED_PLUGIN_KEY)
    return {
      installedPath: source,
      pluginName: input.pluginName?.trim() || 'movscript',
      marketplaceName: BUNDLED_MARKETPLACE_NAME,
      projectCwd: snapshot.projectCwd,
      manifestPath: snapshot.manifestPath,
      lockPath: snapshot.lockPath,
      providerTargets: plugin?.providerTargets ?? BUNDLED_PROVIDER_TARGETS,
      preparedPaths: plugin?.preparedPaths,
    }
  }
  return {
    installedPath: source,
    pluginName: input.pluginName?.trim() || 'movscript',
    marketplaceName: BUNDLED_MARKETPLACE_NAME,
  }
}

export function ensureAgentRuntimeRootBundledPlugin(input: {
  workspaceDir: string
  providerTarget?: ElectronProjectSkillProviderTarget
}): {
  installed: boolean
  prepared: boolean
  projectCwd: string
  preparedPaths?: unknown
} {
  const current = getProjectPluginSnapshot({ workspaceDir: input.workspaceDir })
  const existing = current.plugins.find((plugin) => plugin.pluginKey === MOVSCRIPT_BUNDLED_PLUGIN_KEY)
  if (existing?.prepared) {
    return {
      installed: false,
      prepared: true,
      projectCwd: current.projectCwd,
      preparedPaths: existing.preparedPaths,
    }
  }
  const installed = installAgentRuntimeBundledPlugin({ workspaceDir: input.workspaceDir })
  return {
    installed: true,
    prepared: true,
    projectCwd: installed.projectCwd ?? input.workspaceDir,
    preparedPaths: installed.preparedPaths,
  }
}

function readBundledProviderManifest(source: string): Record<string, unknown> {
  const path = join(source, '.provider-plugin', 'plugin.json')
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
    : []
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
