import { accessSync, constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute as pathIsAbsolute, join, resolve, win32 as pathWin32 } from 'node:path'
import type {
  ProviderConfig,
  ProviderRuntimeProfile,
} from '../../src/shared/infrastructure/providerConfigStore'
import {
  ensureSdkRuntimePackageInstalled,
  installSdkRuntimePackageOnce,
  resolveSdkRuntimePackageStorePaths,
  seedSdkRuntimePackageStore,
  type SdkRuntimePackageInstallOptions,
  type SdkRuntimePackageInstallResult,
  type SdkRuntimePackageStoreOptions,
} from './sdkRuntimePackageStore'

export type AppServerRuntimeApi = 'codex-app-server' | 'mova-app-server'
export type AppServerKind = 'codex' | 'mova'

export interface AppServerCommand {
  command: string
  args?: string[]
  resolvedFrom?: string
}

export interface AppServerCommandResolverInput {
  api: AppServerRuntimeApi
  kind: AppServerKind
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
}

export interface AppServerCommandResolverOptions extends SdkRuntimePackageStoreOptions {
  appServerCommandResolver?: (input: AppServerCommandResolverInput) => AppServerCommand | undefined
  packageManager?: string
  platform?: NodeJS.Platform
  spawn?: SdkRuntimePackageInstallOptions['spawn']
}

const require = createRequire(import.meta.url)
const MOVA_APP_SERVER_PACKAGE = '@movscript/mova-app-server'
const DEFAULT_MOVA_APP_SERVER_PACKAGE_VERSION = '0.0.1-alpha.13'
const APP_SERVER_PLATFORM_PACKAGE_BY_TARGET: Record<string, Record<string, string>> = {
  [MOVA_APP_SERVER_PACKAGE]: {
    'x86_64-unknown-linux-musl': '@movscript/mova-app-server-linux-x64',
    'aarch64-unknown-linux-musl': '@movscript/mova-app-server-linux-arm64',
    'x86_64-apple-darwin': '@movscript/mova-app-server-darwin-x64',
    'aarch64-apple-darwin': '@movscript/mova-app-server-darwin-arm64',
    'x86_64-pc-windows-msvc': '@movscript/mova-app-server-win32-x64',
    'aarch64-pc-windows-msvc': '@movscript/mova-app-server-win32-arm64',
  },
}

export function resolveAppServerCommand(
  input: AppServerCommandResolverInput,
  options: AppServerCommandResolverOptions = {},
): AppServerCommand {
  const platform = options.platform ?? process.platform
  const override = options.appServerCommandResolver?.(input)
  if (override) return override
  const configured = configuredAppServerCommand(input)
  if (configured) return assertCommand(parseAppServerExecutableCommand(configured, platform), configured, platform)
  for (const candidate of appServerBinaryCandidates(input)) {
    const command = executableCommand(candidate)
    if (command) return command
  }
  for (const candidate of appServerRuntimeStoreBinaryCandidates(input, options)) {
    const command = executableCommand(candidate)
    if (command) return command
  }
  throw new Error(`${input.api} app-server binary was not found. Set ${defaultExecutableEnvVar(input.kind)} or runtime.executableCommand.`)
}

export async function ensureDefaultAppServerRuntimePackageInstalled(
  options: AppServerCommandResolverOptions = {},
): Promise<SdkRuntimePackageInstallResult | undefined> {
  return ensureAppServerRuntimePackageInstalled({
    api: 'codex-app-server',
    kind: 'codex',
    provider: {
      id: 'codex',
      kind: 'codex',
    } as ProviderConfig,
    runtime: {
      id: 'codex-codex-app-server',
      api: 'codex-app-server',
      label: 'Codex app-server',
      binaryPackageName: MOVA_APP_SERVER_PACKAGE,
      packageVersion: DEFAULT_MOVA_APP_SERVER_PACKAGE_VERSION,
    } as ProviderRuntimeProfile,
  }, options)
}

export async function ensureAppServerRuntimePackageInstalled(
  input: AppServerCommandResolverInput,
  options: AppServerCommandResolverOptions = {},
): Promise<SdkRuntimePackageInstallResult | undefined> {
  for (const candidate of appServerRuntimeStoreBinaryCandidates(input, options)) {
    if (executableCommand(candidate)) return undefined
  }
  seedSdkRuntimePackageStore(options)
  for (const candidate of appServerRuntimeStoreBinaryCandidates(input, options)) {
    if (executableCommand(candidate)) return undefined
  }

  const packageName = appServerRuntimeInstallPackageName(input)
  const installOptions: SdkRuntimePackageInstallOptions = {
    baseDir: options.baseDir,
    env: options.env,
    packageManager: options.packageManager,
    spawn: options.spawn,
    packageName,
    packageVersion: input.runtime.packageVersion,
  }
  const result = input.runtime.packageVersion
    ? await ensureSdkRuntimePackageInstalled(installOptions)
    : await installSdkRuntimePackageOnce(installOptions)
  if (result && !result.ok) throw new Error(result.error || `Failed to install app-server runtime package ${packageName}.`)
  return result
}

export function resolveAppServerRuntimePlatformPackageName(
  packageName: string = MOVA_APP_SERVER_PACKAGE,
): string | undefined {
  const targetTriple = currentTargetTriple()
  if (!targetTriple) return undefined
  return APP_SERVER_PLATFORM_PACKAGE_BY_TARGET[packageName]?.[targetTriple]
}

function appServerBinaryCandidates(input: {
  kind: AppServerKind
  runtime: ProviderRuntimeProfile
}): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  return uniqueStrings([
    ...npmAppServerBinaryCandidates(input),
    resolve(process.cwd(), 'app-server-bin', input.kind, 'app-server'),
    resolve(process.cwd(), '..', 'app-server-bin', input.kind, 'app-server'),
    resolve(process.cwd(), '..', '..', 'app-server-bin', input.kind, 'app-server'),
    resolve(process.cwd(), '..', '..', '..', 'app-server-bin', input.kind, 'app-server'),
    resolve(process.cwd(), '..', '..', '..', '..', 'app-server-bin', input.kind, 'app-server'),
    ...(resourcesPath ? [
      resolve(resourcesPath, 'app-server-bin', input.kind, 'app-server'),
      resolve(resourcesPath, 'app-server', input.kind, 'app-server'),
    ] : []),
  ])
}

function npmAppServerBinaryCandidates(input: {
  kind: AppServerKind
  runtime: ProviderRuntimeProfile
}): string[] {
  const targetTriple = currentTargetTriple()
  if (!targetTriple) return []
  const executableName = appServerExecutableName()
  return npmAppServerPackageNames(input)
    .flatMap((packageName) => npmPlatformPackageNames(packageName, targetTriple))
    .flatMap((packageName) => npmPackageVendorBinaryCandidates(packageName, targetTriple, executableName))
}

function appServerRuntimeStoreBinaryCandidates(
  input: {
    kind: AppServerKind
    runtime: ProviderRuntimeProfile
  },
  options: SdkRuntimePackageStoreOptions,
): string[] {
  const targetTriple = currentTargetTriple()
  if (!targetTriple) return []
  const paths = resolveSdkRuntimePackageStorePaths(options)
  const executableName = appServerExecutableName()
  return npmAppServerPackageNames(input)
    .flatMap((packageName) => npmPlatformPackageNames(packageName, targetTriple))
    .flatMap((packageName) => appServerPackageVendorBinaryCandidates(
      nodeModulePackageDir(paths.nodeModulesDir, packageName),
      targetTriple,
      executableName,
    ))
}

function npmAppServerPackageNames(input: {
  kind: AppServerKind
  runtime: ProviderRuntimeProfile
}): string[] {
  return uniqueStrings([
    input.runtime.binaryPackageName,
    input.runtime.packageName,
    input.kind === 'codex' ? MOVA_APP_SERVER_PACKAGE : undefined,
    input.kind === 'mova' ? MOVA_APP_SERVER_PACKAGE : undefined,
  ].filter(Boolean) as string[])
}

function npmPlatformPackageNames(packageName: string, targetTriple: string): string[] {
  const platformPackage = APP_SERVER_PLATFORM_PACKAGE_BY_TARGET[packageName]?.[targetTriple]
  return uniqueStrings([
    platformPackage,
    packageName,
  ].filter(Boolean) as string[])
}

function npmPackageVendorBinaryCandidates(
  packageName: string,
  targetTriple: string,
  executableName: string,
): string[] {
  const packageDir = npmPackageDir(packageName)
  if (!packageDir) return []
  return appServerPackageVendorBinaryCandidates(packageDir, targetTriple, executableName)
}

function appServerPackageVendorBinaryCandidates(
  packageDir: string | undefined,
  targetTriple: string,
  executableName: string,
): string[] {
  if (!packageDir) return []
  return asarExecutablePathCandidates(resolve(packageDir, 'vendor', targetTriple, 'bin', executableName))
}

function npmPackageDir(packageName: string): string | undefined {
  try {
    return dirname(require.resolve(`${packageName}/package.json`))
  } catch {
    return undefined
  }
}

function nodeModulePackageDir(nodeModulesDir: string, packageName: string): string {
  const parts = packageName.split('/')
  return packageName.startsWith('@') && parts.length >= 2
    ? join(nodeModulesDir, parts[0], parts[1])
    : join(nodeModulesDir, packageName)
}

function asarExecutablePathCandidates(path: string): string[] {
  const unpackedPath = path.replace(/\.asar(?=\/|\\|$)/, '.asar.unpacked')
  return unpackedPath === path ? [path] : [unpackedPath, path]
}

function currentTargetTriple(): string | undefined {
  if (process.platform === 'linux' || process.platform === 'android') {
    if (process.arch === 'x64') return 'x86_64-unknown-linux-musl'
    if (process.arch === 'arm64') return 'aarch64-unknown-linux-musl'
  }
  if (process.platform === 'darwin') {
    if (process.arch === 'x64') return 'x86_64-apple-darwin'
    if (process.arch === 'arm64') return 'aarch64-apple-darwin'
  }
  if (process.platform === 'win32') {
    if (process.arch === 'x64') return 'x86_64-pc-windows-msvc'
    if (process.arch === 'arm64') return 'aarch64-pc-windows-msvc'
  }
  return undefined
}

function appServerExecutableName(): string {
  return process.platform === 'win32' ? 'codex-app-server.exe' : 'codex-app-server'
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function assertCommand(command: AppServerCommand, source: string, platform: NodeJS.Platform): AppServerCommand {
  if (commandLooksLikePath(command.command, platform)) accessSync(command.command, constants.X_OK)
  return {
    ...command,
    resolvedFrom: command.resolvedFrom ?? source,
  }
}

function commandLooksLikePath(command: string, platform: NodeJS.Platform): boolean {
  if (command.includes('/') || command.includes('\\')) return true
  if (pathIsAbsolute(command)) return true
  return platform === 'win32' && pathWin32.isAbsolute(command)
}

function executableCommand(candidate: string): AppServerCommand | undefined {
  try {
    accessSync(candidate, constants.X_OK)
    return { command: candidate, resolvedFrom: candidate }
  } catch {
    return undefined
  }
}

function configuredAppServerCommand(input: AppServerCommandResolverInput): string | undefined {
  return input.runtime.executableCommand?.trim()
    ?? (input.runtime.executableEnvVar ? process.env[input.runtime.executableEnvVar]?.trim() : undefined)
    ?? process.env[defaultExecutableEnvVar(input.kind)]?.trim()
}

function appServerRuntimeInstallPackageName(input: AppServerCommandResolverInput): string {
  return input.runtime.binaryPackageName?.trim()
    || (input.runtime.api === 'codex-app-server' || input.runtime.api === 'mova-app-server' ? MOVA_APP_SERVER_PACKAGE : '')
    || input.runtime.packageName?.trim()
    || MOVA_APP_SERVER_PACKAGE
}

export function parseAppServerExecutableCommand(
  value: string,
  platform: NodeJS.Platform = process.platform,
): AppServerCommand {
  const parts = shellWords(value, platform)
  if (parts.length === 0) throw new Error('app-server executable command is empty.')
  return {
    command: parts[0],
    ...(parts.length > 1 ? { args: parts.slice(1) } : {}),
    resolvedFrom: value,
  }
}

function shellWords(value: string, platform: NodeJS.Platform): string[] {
  const words: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false
  const backslashEscapes = platform !== 'win32'
  for (const char of value) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (backslashEscapes && char === '\\' && quote !== "'") {
      escaping = true
      continue
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char
      continue
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        words.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) words.push(current)
  return words
}

function defaultExecutableEnvVar(kind: AppServerKind): string {
  return kind === 'mova' ? 'MOVSCRIPT_MOVA_APP_SERVER' : 'MOVSCRIPT_CODEX_APP_SERVER'
}
