import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { installMovScriptHomePluginBundle } from '@movscript/plugins/node'
import { resolveMovScriptBundledPluginSource, validateMovScriptBundledPluginSource } from './movscriptBundledPluginSource'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'

const execFileAsync = promisify(execFile)

export const MOVSCRIPT_CODEX_MARKETPLACE_NAME = 'movscript-local'
export const MOVSCRIPT_CODEX_PLUGIN_NAME = 'movscript'

export interface CodexPluginInstallPaths {
  homeDir: string
  marketplaceRoot: string
  marketplacePath: string
  pluginRoot: string
  sourcePluginRoot: string
  homeCurrentPluginRoot: string
  homeCurrentPluginVersion: string
  homeCurrentBundleHash?: string
}

export interface CodexPluginInstallResult {
  paths: CodexPluginInstallPaths
  installCommand: string
}

export interface InstallMovScriptCodexPluginOptions {
  sourcePluginRoot?: string
  homeDir?: string
  marketplaceRoot?: string
  execCodex?: (args: string[]) => Promise<void>
}

export interface ResolveCodexExecutableOptions {
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
  platform?: NodeJS.Platform
}

export async function installMovScriptCodexPlugin(
  options: InstallMovScriptCodexPluginOptions = {},
): Promise<CodexPluginInstallResult> {
  const paths = prepareMovScriptCodexMarketplace(options)
  const execCodex = options.execCodex ?? runCodexCommand
  await execCodex(['plugin', 'marketplace', 'add', paths.marketplaceRoot])
  await execCodex(['plugin', 'add', `${MOVSCRIPT_CODEX_PLUGIN_NAME}@${MOVSCRIPT_CODEX_MARKETPLACE_NAME}`])
  return {
    paths,
    installCommand: codexPluginInstallCommand(paths.marketplaceRoot),
  }
}

export async function openCodexApp(): Promise<void> {
  const codex = resolveCodexExecutable()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(codex, ['app'], {
      detached: true,
      env: codexCommandEnv(codex),
      shell: shouldRunCodexThroughShell(codex),
      stdio: 'ignore',
    })
    child.once('error', (error) => {
      reject(new Error(`Failed to open Codex: ${errorMessage(error)}`))
    })
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export function prepareMovScriptCodexMarketplace(
  options: Pick<InstallMovScriptCodexPluginOptions, 'sourcePluginRoot' | 'homeDir' | 'marketplaceRoot'> = {},
): CodexPluginInstallPaths {
  const sourcePluginRoot = options.sourcePluginRoot ?? resolveMovScriptBundledPluginSource()
  validateMovScriptBundledPluginSource(sourcePluginRoot)
  const homeDir = options.homeDir ?? resolveDesktopDefaultMovScriptWorkspaceDir()
  const installed = installMovScriptHomePluginBundle({
    homeDir,
    sourcePluginRoot,
    mode: 'seed-or-upgrade',
    reason: 'desktop-codex-install',
    provider: 'codex',
  })

  const marketplaceRoot = options.marketplaceRoot ?? defaultCodexMarketplaceRoot(homeDir)
  const pluginRoot = join(marketplaceRoot, 'plugins', MOVSCRIPT_CODEX_PLUGIN_NAME)
  const marketplacePath = join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json')
  mkdirSync(join(marketplaceRoot, 'plugins'), { recursive: true })
  mkdirSync(join(marketplaceRoot, '.agents', 'plugins'), { recursive: true })
  rmSync(pluginRoot, { recursive: true, force: true })
  symlinkSync(installed.paths.currentLink, pluginRoot, process.platform === 'win32' ? 'junction' : 'dir')
  rmSync(join(marketplaceRoot, 'marketplace.json'), { force: true })
  writeFileSync(marketplacePath, `${JSON.stringify(codexMarketplaceManifest(), null, 2)}\n`, 'utf8')

  const codexManifestPath = join(pluginRoot, '.codex-plugin', 'plugin.json')
  const codexManifest = JSON.parse(readFileSync(codexManifestPath, 'utf8')) as Record<string, unknown>
  if (codexManifest.name !== MOVSCRIPT_CODEX_PLUGIN_NAME) {
    throw new Error(`MovScript Codex plugin manifest must declare name "${MOVSCRIPT_CODEX_PLUGIN_NAME}"`)
  }

  return {
    homeDir,
    marketplaceRoot,
    marketplacePath,
    pluginRoot,
    sourcePluginRoot,
    homeCurrentPluginRoot: installed.targetPluginRoot,
    homeCurrentPluginVersion: installed.version,
    ...(installed.bundleHash ? { homeCurrentBundleHash: installed.bundleHash } : {}),
  }
}

export function codexPluginInstallCommand(marketplaceRoot = defaultCodexMarketplaceRoot()): string {
  return [
    `codex plugin marketplace add ${shellQuote(marketplaceRoot)}`,
    `codex plugin add ${MOVSCRIPT_CODEX_PLUGIN_NAME}@${MOVSCRIPT_CODEX_MARKETPLACE_NAME}`,
  ].join('\n')
}

function codexMarketplaceManifest(): Record<string, unknown> {
  return {
    name: MOVSCRIPT_CODEX_MARKETPLACE_NAME,
    interface: {
      displayName: 'MovScript',
    },
    plugins: [
      {
        name: MOVSCRIPT_CODEX_PLUGIN_NAME,
        source: {
          source: 'local',
          path: `./plugins/${MOVSCRIPT_CODEX_PLUGIN_NAME}`,
        },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_USE',
        },
        category: 'Productivity',
      },
    ],
  }
}

function defaultCodexMarketplaceRoot(homeDir = resolveDesktopDefaultMovScriptWorkspaceDir()): string {
  return join(homeDir || join(homedir(), '.movscript'), 'codex-marketplace')
}

async function runCodexCommand(args: string[]): Promise<void> {
  const codex = resolveCodexExecutable()
  try {
    await execFileAsync(codex, args, { env: codexCommandEnv(codex), shell: shouldRunCodexThroughShell(codex) })
  } catch (error) {
    throw new Error(`Failed to run "codex ${args.join(' ')}": ${errorMessage(error)}`)
  }
}

export function resolveCodexExecutable(options: ResolveCodexExecutableOptions = {}): string {
  const env = options.env ?? process.env
  const exists = options.exists ?? existsSync
  const explicit = env.MOVSCRIPT_CODEX_CLI?.trim() || env.CODEX_CLI?.trim()
  if (explicit) return explicit

  for (const dir of pathEntries(env.PATH)) {
    for (const binary of codexBinaryNames(options.platform ?? process.platform)) {
      const candidate = join(dir, binary)
      if (exists(candidate)) return candidate
    }
  }

  for (const candidate of commonCodexExecutableCandidates(env, options.platform ?? process.platform)) {
    if (exists(candidate)) return candidate
  }

  return codexBinaryName(options.platform ?? process.platform)
}

function pathEntries(pathValue: string | undefined): string[] {
  return (pathValue ?? '')
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && isAbsolute(entry))
}

function commonCodexExecutableCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const [binary] = codexBinaryNames(platform)
  const home = homedir()
  const candidates = [
    join(home, '.local', 'bin', binary),
    join(home, '.npm-global', 'bin', binary),
  ]
  if (platform === 'darwin') {
    candidates.push(
      join('/opt/homebrew/bin', binary),
      join('/usr/local/bin', binary),
    )
  }
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA?.trim()
    const appData = env.APPDATA?.trim()
    if (localAppData) candidates.push(join(localAppData, 'Programs', 'codex', binary))
    if (appData) candidates.push(join(appData, 'npm', binary))
  }
  return candidates
}

export function codexCommandEnv(
  codexExecutable: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const pathKey = platform === 'win32' ? pathEnvironmentKey(env) : 'PATH'
  const pathValue = env[pathKey]
  return {
    ...env,
    [pathKey]: prependPathEntries(pathValue, codexCommandPathEntries(codexExecutable, env, platform)),
  }
}

function codexCommandPathEntries(
  codexExecutable: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string[] {
  const entries = isAbsolute(codexExecutable) ? [dirname(codexExecutable)] : []
  if (platform === 'darwin') {
    entries.push(
      '/opt/homebrew/bin',
      '/opt/homebrew/opt/node/bin',
      '/opt/homebrew/opt/node@22/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    )
  }
  if (platform === 'win32') {
    const programFiles = env.ProgramFiles?.trim()
    if (programFiles) entries.push(join(programFiles, 'nodejs'))
  }
  return entries
}

function prependPathEntries(pathValue: string | undefined, entries: string[]): string {
  const seen = new Set<string>()
  const merged = [...entries, ...pathEntries(pathValue)]
  return merged
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false
      seen.add(entry)
      return true
    })
    .join(delimiter)
}

function pathEnvironmentKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path'
}

function codexBinaryNames(platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? ['codex.cmd', 'codex.exe', 'codex'] : ['codex']
}

function codexBinaryName(platform: NodeJS.Platform): string {
  return codexBinaryNames(platform)[0] ?? 'codex'
}

function shouldRunCodexThroughShell(command: string): boolean {
  return process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
