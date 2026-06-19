import { accessSync, constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type {
  ProviderConfig,
  ProviderRuntimeProfile,
} from '../../src/shared/infrastructure/providerConfigStore'

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

export interface AppServerCommandResolverOptions {
  appServerCommandResolver?: (input: AppServerCommandResolverInput) => AppServerCommand | undefined
}

const require = createRequire(import.meta.url)
const MOVA_APP_SERVER_PACKAGE = '@movscript/mova'
const APP_SERVER_PLATFORM_PACKAGE_BY_TARGET: Record<string, Record<string, string>> = {
  [MOVA_APP_SERVER_PACKAGE]: {
    'x86_64-unknown-linux-musl': '@movscript/mova-linux-x64',
    'aarch64-unknown-linux-musl': '@movscript/mova-linux-arm64',
    'x86_64-apple-darwin': '@movscript/mova-darwin-x64',
    'aarch64-apple-darwin': '@movscript/mova-darwin-arm64',
    'x86_64-pc-windows-msvc': '@movscript/mova-win32-x64',
    'aarch64-pc-windows-msvc': '@movscript/mova-win32-arm64',
  },
}

export function resolveAppServerCommand(
  input: AppServerCommandResolverInput,
  options: AppServerCommandResolverOptions = {},
): AppServerCommand {
  const override = options.appServerCommandResolver?.(input)
  if (override) return override
  const configured = input.runtime.executableCommand?.trim()
    ?? (input.runtime.executableEnvVar ? process.env[input.runtime.executableEnvVar]?.trim() : undefined)
    ?? process.env[defaultExecutableEnvVar(input.kind)]?.trim()
  if (configured) return assertCommand(splitCommand(configured), configured)
  for (const candidate of appServerBinaryCandidates(input)) {
    try {
      accessSync(candidate, constants.X_OK)
      return { command: candidate, resolvedFrom: candidate }
    } catch {
      // Keep looking; probe will report the complete failure below.
    }
  }
  throw new Error(`${input.api} app-server binary was not found. Set ${defaultExecutableEnvVar(input.kind)} or runtime.executableCommand.`)
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
  return asarExecutablePathCandidates(resolve(packageDir, 'vendor', targetTriple, 'bin', executableName))
}

function npmPackageDir(packageName: string): string | undefined {
  try {
    return dirname(require.resolve(`${packageName}/package.json`))
  } catch {
    return undefined
  }
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

function assertCommand(command: AppServerCommand, source: string): AppServerCommand {
  if (command.command.includes('/')) accessSync(command.command, constants.X_OK)
  return {
    ...command,
    resolvedFrom: command.resolvedFrom ?? source,
  }
}

function splitCommand(value: string): AppServerCommand {
  const parts = shellWords(value)
  if (parts.length === 0) throw new Error('app-server executable command is empty.')
  return {
    command: parts[0],
    ...(parts.length > 1 ? { args: parts.slice(1) } : {}),
    resolvedFrom: value,
  }
}

function shellWords(value: string): string[] {
  const words: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false
  for (const char of value) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\' && quote !== "'") {
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
