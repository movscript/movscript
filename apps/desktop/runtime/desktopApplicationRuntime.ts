import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createScenarioApplicationRunner,
  type ApplicationRunner,
  type ProgramAdapter,
} from '@movscript/app-runner'
import { ensureLocalRuntimeDaemon, type LocalRuntimeIdentity } from '@movscript/local-runtime'
import {
  resolveMovScriptHomeDir,
  type ApplicationManifest,
  type ProgramManifest,
  type ScenarioPolicyManifest,
} from '@movscript/runtime-contracts'
import { installMovScriptHomePluginBundle } from '@movscript/plugins/node'
import * as desktopApplicationManifestModule from '../application.manifest'
import * as desktopShellProgramManifestModule from '../programs/desktop-shell.program.manifest'
import * as desktopStartupManifestModule from '../startup.manifest'

const REPO_ROOT = resolveDesktopRuntimeRepoRoot()

export type DesktopLocalRuntimeDataPlane = 'local' | 'cloud' | 'external'

export interface DesktopLocalRuntimeOptions {
  enabled: boolean
  dataPlane: DesktopLocalRuntimeDataPlane
  entrypoint?: string
  dataServiceURL?: string
  forceRestart?: boolean
}

export function resolveDesktopRuntimeRepoRoot(input: {
  dirname?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
} = {}): string {
  const currentDir = input.dirname ?? import.meta.dirname
  const cwd = input.cwd ?? process.cwd()
  const env = input.env ?? process.env
  const explicitRoot = env.MOVSCRIPT_REPO_ROOT?.trim()
  const candidates = [
    explicitRoot,
    resolve(currentDir, '../../..'),
    resolve(currentDir, '../../../..'),
    resolve(cwd),
    resolve(cwd, '..'),
    resolve(cwd, '../..'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  const repoRoot = candidates.find(isMovScriptRepoRoot)
  return repoRoot ?? resolve(currentDir, '../../..')
}

function isMovScriptRepoRoot(candidate: string): boolean {
  return (
    existsSync(resolve(candidate, 'pnpm-workspace.yaml')) &&
    existsSync(resolve(candidate, 'apps/desktop/package.json')) &&
    existsSync(resolve(candidate, 'services/project-service/bin/movscript-project-service.mjs'))
  )
}

export const desktopRuntimeApplicationManifest = manifestExport<ApplicationManifest>(
  desktopApplicationManifestModule,
  'desktopApplicationManifest',
)
export const desktopRuntimeShellProgramManifest = manifestExport<ProgramManifest>(
  desktopShellProgramManifestModule,
  'desktopShellProgramManifest',
)
export const desktopRuntimeStartupPolicy = manifestExport<ScenarioPolicyManifest>(
  desktopStartupManifestModule,
  'desktopBootstrapStartupPolicy',
)
export const desktopRuntimeLocalStartupPolicy = manifestExport<ScenarioPolicyManifest>(
  desktopStartupManifestModule,
  'desktopLocalStartupPolicy',
)

let desktopRuntimeRunner: ApplicationRunner | null = null

export async function startDesktopApplicationRuntime(input: {
  homeDir?: string
  profile?: string
  scenario?: ScenarioPolicyManifest
  localRuntime?: DesktopLocalRuntimeOptions
} = {}): Promise<void> {
  if (desktopRuntimeRunner) return
  const homeDir = input.homeDir ?? resolveMovScriptHomeDir()
  const startupPolicy = input.scenario ?? desktopRuntimeStartupPolicy
  if (input.localRuntime?.enabled) {
    await ensureDesktopLocalRuntime({ homeDir, ...input.localRuntime })
  }
  const runner = createScenarioApplicationRunner({
    homeDir,
    application: desktopRuntimeApplicationManifest,
    scenario: startupPolicy,
    profile: input.profile,
    programs: [
      createDesktopShellProgramAdapter(),
    ],
  })
  await runner.start()
  desktopRuntimeRunner = runner
}

export async function ensureDesktopLocalRuntime(input: {
  homeDir?: string
  dataPlane: DesktopLocalRuntimeDataPlane
  entrypoint?: string
  dataServiceURL?: string
  forceRestart?: boolean
}): Promise<Record<string, unknown>> {
  const homeDir = input.homeDir ?? resolveMovScriptHomeDir()
  if (!input.entrypoint) seedDesktopHomePluginCurrent(homeDir)
  const homeCurrentEntrypoint = resolve(homeDir, 'plugins/movscript/current/bin/movscript.mjs')
  const entrypoint = input.entrypoint ?? (existsSync(homeCurrentEntrypoint) ? homeCurrentEntrypoint : resolveDesktopLocalRuntimeDaemonEntrypoint())
  return await ensureLocalRuntimeDaemon({
    homeDir,
    entrypoint,
    cwd: resolveDesktopLocalRuntimeDaemonCwd(entrypoint),
    env: {
      ...desktopLocalRuntimeNodeEnv(),
      MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: input.dataPlane,
      ...(input.dataServiceURL ? { MOVSCRIPT_DATA_SERVICE_URL: input.dataServiceURL } : {}),
    },
    identity: resolveDesktopLocalRuntimeIdentity(entrypoint),
    ...(input.forceRestart ? { forceRestart: true } : {}),
  })
}

export function resolveDesktopLocalRuntimeIdentity(entrypoint: string): LocalRuntimeIdentity {
  const pluginRoot = resolve(entrypoint, '..', '..')
  const runtimeManifest = readDesktopLocalRuntimeManifest(pluginRoot)
  return {
    pluginVersion: runtimeManifest?.version ?? readDesktopLocalRuntimePluginVersion(pluginRoot) ?? 'unknown',
    ...(runtimeManifest?.apiVersion ? { apiVersion: runtimeManifest.apiVersion } : {}),
    ...(runtimeManifest?.minDaemonApiVersion ? { minDaemonApiVersion: runtimeManifest.minDaemonApiVersion } : {}),
    ...(runtimeManifest?.bundleHash ? { bundleHash: runtimeManifest.bundleHash } : {}),
    pluginRoot,
  }
}

export function seedDesktopHomePluginCurrent(homeDir: string): void {
  const sourcePluginRoot = resolveDesktopBundledPluginRoot()
  if (!sourcePluginRoot) return
  installMovScriptHomePluginBundle({
    homeDir,
    sourcePluginRoot,
    mode: 'seed-or-upgrade',
    reason: 'desktop-runtime-start',
    provider: 'desktop',
  })
}

export function resolveDesktopBundledPluginRoot(): string | undefined {
  const resourcesPath = defaultElectronResourcesPath()
  const candidates = [
    resourcesPath ? resolve(resourcesPath, 'provider-plugins/movscript') : undefined,
    resolve(REPO_ROOT, 'plugins/movscript'),
    resolve(REPO_ROOT, 'apps/plugin'),
  ]
  return candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(resolve(candidate, '.codex-plugin/plugin.json')) && existsSync(resolve(candidate, '.mcp.json'))))
}

function readDesktopLocalRuntimeManifest(pluginRoot: string): {
  version?: string
  apiVersion?: string
  minDaemonApiVersion?: string
  bundleHash?: string
} | undefined {
  try {
    const manifest = JSON.parse(readFileSync(resolve(pluginRoot, 'manifest.runtime.json'), 'utf8')) as Record<string, unknown>
    return {
      ...(typeof manifest.version === 'string' && manifest.version.trim() ? { version: manifest.version.trim() } : {}),
      ...(typeof manifest.apiVersion === 'string' && manifest.apiVersion.trim() ? { apiVersion: manifest.apiVersion.trim() } : {}),
      ...(typeof manifest.minDaemonApiVersion === 'string' && manifest.minDaemonApiVersion.trim() ? { minDaemonApiVersion: manifest.minDaemonApiVersion.trim() } : {}),
      ...(typeof manifest.bundleHash === 'string' && manifest.bundleHash.trim() ? { bundleHash: manifest.bundleHash.trim() } : {}),
    }
  } catch {
    return undefined
  }
}

function readDesktopLocalRuntimePluginVersion(pluginRoot: string): string | undefined {
  return readManifestVersion(resolve(pluginRoot, 'manifest.runtime.json'))
    ?? readManifestVersion(resolve(pluginRoot, '.codex-plugin/plugin.json'))
    ?? readManifestVersion(resolve(pluginRoot, '.provider-plugin/plugin.json'))
}

function readManifestVersion(manifestPath: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    return typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version : undefined
  } catch {
    return undefined
  }
}

export function resolveDesktopLocalRuntimeDaemonEntrypoint(input: {
  env?: NodeJS.ProcessEnv
  repoRoot?: string
  resourcesPath?: string
} = {}): string {
  const env = input.env ?? process.env
  const explicit = env.MOVSCRIPT_LOCAL_DAEMON_ENTRYPOINT?.trim()
    || env.MOVSCRIPT_LOCAL_NODE_ENTRYPOINT?.trim()
  if (explicit) return resolve(explicit)
  const repoRoot = input.repoRoot ?? REPO_ROOT
  const resourcesPath = input.resourcesPath ?? defaultElectronResourcesPath()
  const candidates = [
    resolve(repoRoot, 'apps/plugin/bin/movscript.mjs'),
    resolve(repoRoot, 'plugins/movscript/bin/movscript.mjs'),
    resourcesPath ? resolve(resourcesPath, 'provider-plugins/movscript/bin/movscript.mjs') : undefined,
    resourcesPath ? resolve(resourcesPath, 'movscript-agent-plugin/bin/movscript.mjs') : undefined,
    resourcesPath ? resolve(resourcesPath, 'plugins/movscript/bin/movscript.mjs') : undefined,
    resolve(repoRoot, 'apps/plugin/bin/movscript-agent-mcp.mjs'),
    resolve(repoRoot, 'plugins/movscript/bin/movscript-agent-mcp.mjs'),
    resourcesPath ? resolve(resourcesPath, 'provider-plugins/movscript/bin/movscript-agent-mcp.mjs') : undefined,
    resourcesPath ? resolve(resourcesPath, 'movscript-agent-plugin/bin/movscript-agent-mcp.mjs') : undefined,
    resourcesPath ? resolve(resourcesPath, 'plugins/movscript/bin/movscript-agent-mcp.mjs') : undefined,
  ]
  return candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate))) ?? candidates[0]!
}

function resolveDesktopLocalRuntimeDaemonCwd(entrypoint: string | undefined): string {
  if (entrypoint) return resolve(entrypoint, '..', '..')
  return REPO_ROOT
}

function defaultElectronResourcesPath(): string | undefined {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  return typeof resourcesPath === 'string' && resourcesPath.trim() ? resourcesPath : undefined
}

function desktopLocalRuntimeNodeEnv(): NodeJS.ProcessEnv {
  return process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}
}

function createDesktopShellProgramAdapter(): ProgramAdapter {
  return {
    manifest: desktopRuntimeShellProgramManifest,
    instanceId: `desktop-${process.pid}`,
    start: () => ({
      pid: process.pid,
      endpoint: {
        protocol: 'ipc',
        url: 'desktop://movscript',
        applicationId: 'movscript.desktop',
      },
    }),
    health: (_context, runtime) => ({
      ready: true,
      endpoint: runtime.endpoint,
    }),
  }
}

function manifestExport<T>(module: Record<string, unknown>, exportName: string): T {
  const commonJSModule = module['module.exports']
  const commonJSRecord = commonJSModule && typeof commonJSModule === 'object'
    ? commonJSModule as Record<string, unknown>
    : undefined
  const value = module[exportName] ?? commonJSRecord?.[exportName] ?? module.default ?? commonJSRecord?.default
  if (!value) throw new Error(`Desktop runtime manifest export ${exportName} is missing`)
  return value as T
}

export async function shutdownDesktopApplicationRuntime(): Promise<void> {
  const runner = desktopRuntimeRunner
  if (!runner) return
  desktopRuntimeRunner = null
  await runner.shutdown()
}
