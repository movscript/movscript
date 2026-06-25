import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import { normalizedSdkRuntimeEnv } from './sdkRuntimeConfigInjector'
import type { SdkRuntimeModuleLoader } from './sdkRuntimePackageLoader'

export interface SdkRuntimePackageStorePaths {
  root: string
  packageJsonPath: string
  nodeModulesDir: string
  seedRoot?: string
}

export interface SdkRuntimePackageStoreOptions {
  baseDir?: string
  env?: NodeJS.ProcessEnv
}

export interface SdkRuntimePackageInstallOptions extends SdkRuntimePackageStoreOptions {
  packageName: string
  packageVersion?: string
  packageManager?: string
  spawn?: typeof spawnSync
}

export interface InstallingSdkRuntimePackageStoreLoaderOptions extends SdkRuntimePackageStoreOptions {
  packageManager?: string
  packageVersions?: Record<string, string | undefined>
  spawn?: typeof spawnSync
}

export interface SdkRuntimePackageInstallResult {
  ok: boolean
  packageName: string
  packageVersion?: string
  root: string
  command: string
  args: string[]
  status?: number | null
  error?: string
}

export interface SdkRuntimePackageUninstallResult {
  ok: boolean
  packageName: string
  root: string
  command: string
  args: string[]
  status?: number | null
  error?: string
}

const sdkRuntimePackageInstalls = new Map<string, Promise<SdkRuntimePackageInstallResult>>()
const sdkRuntimePackageInstallControllers = new Map<string, AbortController>()

export function resolveSdkRuntimePackageStorePaths(options: SdkRuntimePackageStoreOptions = {}): SdkRuntimePackageStorePaths {
  const env = options.env ?? process.env
  const root = resolve(
    env.MOVSCRIPT_SDK_RUNTIME_DIR?.trim()
      || join(resolveSdkRuntimeBaseDir(options, env), 'sdk-runtimes'),
  )
  return {
    root,
    packageJsonPath: join(root, 'package.json'),
    nodeModulesDir: join(root, 'node_modules'),
    seedRoot: resolveSdkRuntimePackageSeedRoot(env),
  }
}

function resolveSdkRuntimeBaseDir(options: SdkRuntimePackageStoreOptions, env: NodeJS.ProcessEnv): string {
  const explicitBaseDir = options.baseDir?.trim()
    || env.MOVSCRIPT_HOME?.trim()
    || env.MOVSCRIPT_WORKSPACE_DIR?.trim()
  if (explicitBaseDir) return explicitBaseDir
  if (options.env) return process.cwd()
  return resolveDesktopDefaultMovScriptWorkspaceDir()
}

export function ensureSdkRuntimePackageStore(options: SdkRuntimePackageStoreOptions = {}): SdkRuntimePackageStorePaths {
  const paths = resolveSdkRuntimePackageStorePaths(options)
  mkdirSync(paths.root, { recursive: true })
  if (!existsSync(paths.packageJsonPath)) {
    writeFileSync(paths.packageJsonPath, `${JSON.stringify({
      private: true,
      name: 'movscript-sdk-runtimes',
      description: 'MovScript downloaded agent SDK runtimes.',
    }, null, 2)}\n`)
  }
  return paths
}

export function createSdkRuntimePackageStoreLoader(options: SdkRuntimePackageStoreOptions = {}): SdkRuntimeModuleLoader {
  return async (specifier) => {
    const paths = ensureSdkRuntimePackageStore(options)
    const resolved = resolveInstalledSdkRuntimePackageEntry(specifier, paths)
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (value: string) => Promise<unknown>
    return dynamicImport(pathToFileURL(resolved).href)
  }
}

export function createInstallingSdkRuntimePackageStoreLoader(options: InstallingSdkRuntimePackageStoreLoaderOptions = {}): SdkRuntimeModuleLoader {
  const baseLoader = createSdkRuntimePackageStoreLoader(options)
  return async (specifier) => {
    if (isLocalSdkRuntimeSpecifier(specifier)) return loadLocalSdkRuntimeSpecifier(specifier)
    await ensureSdkRuntimePackageInstalled({
      ...options,
      packageName: specifier,
      packageVersion: options.packageVersions?.[specifier],
    })
    try {
      return await baseLoader(specifier)
    } catch (error) {
      if (!isModuleNotFoundError(error)) throw error
      seedSdkRuntimePackageStore(options)
      try {
        return await baseLoader(specifier)
      } catch (seedError) {
        if (!isModuleNotFoundError(seedError)) throw seedError
      }
      const result = await installSdkRuntimePackageOnce({
        ...options,
        packageName: specifier,
        packageVersion: options.packageVersions?.[specifier],
      })
      if (!result.ok) throw new Error(result.error || `Failed to install SDK runtime package ${specifier}.`)
      return baseLoader(specifier)
    }
  }
}

function isLocalSdkRuntimeSpecifier(specifier: string): boolean {
  const value = specifier.trim()
  return value.startsWith('file://') || isAbsolute(value) || value.startsWith('./') || value.startsWith('../')
}

async function loadLocalSdkRuntimeSpecifier(specifier: string): Promise<unknown> {
  const value = specifier.trim()
  const importURL = value.startsWith('file://') ? value : pathToFileURL(resolve(value)).href
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (next: string) => Promise<unknown>
  return dynamicImport(importURL)
}

export async function ensureSdkRuntimePackageInstalled(options: SdkRuntimePackageInstallOptions): Promise<SdkRuntimePackageInstallResult | undefined> {
  const requiredVersion = options.packageVersion?.trim()
  if (!requiredVersion) return undefined
  const installedVersion = installedSdkRuntimePackageVersion(options.packageName, options)
  if (installedVersion === requiredVersion) return undefined
  if (seedSdkRuntimePackageStore(options)) {
    const seededVersion = installedSdkRuntimePackageVersion(options.packageName, options)
    if (seededVersion === requiredVersion) return undefined
  }
  const result = await installSdkRuntimePackageOnce({
    ...options,
    packageVersion: requiredVersion,
  })
  if (!result.ok) throw new Error(result.error || `Failed to install SDK runtime package ${options.packageName}.`)
  return result
}

export function installSdkRuntimePackageOnce(options: SdkRuntimePackageInstallOptions): Promise<SdkRuntimePackageInstallResult> {
  const key = sdkRuntimePackageInstallKey(options)
  const existing = sdkRuntimePackageInstalls.get(key)
  if (existing) return existing
  const install = Promise.resolve().then(() => (
    options.spawn ? installSdkRuntimePackage(options) : installSdkRuntimePackageAsync(options)
  )).finally(() => {
    sdkRuntimePackageInstalls.delete(key)
    sdkRuntimePackageInstallControllers.delete(key)
  })
  sdkRuntimePackageInstalls.set(key, install)
  return install
}

export function cancelSdkRuntimePackageInstall(options: Pick<SdkRuntimePackageInstallOptions, 'packageName' | 'packageVersion' | 'packageManager' | 'baseDir' | 'env'>): boolean {
  const controller = sdkRuntimePackageInstallControllers.get(sdkRuntimePackageInstallKey(options))
  if (!controller) return false
  controller.abort()
  return true
}

export function installSdkRuntimePackage(options: SdkRuntimePackageInstallOptions): SdkRuntimePackageInstallResult {
  const paths = ensureSdkRuntimePackageStore(options)
  const command = options.packageManager?.trim()
    || options.env?.MOVSCRIPT_SDK_RUNTIME_PACKAGE_MANAGER?.trim()
    || process.env.MOVSCRIPT_SDK_RUNTIME_PACKAGE_MANAGER?.trim()
    || 'npm'
  const packageSpec = options.packageVersion?.trim()
    ? `${options.packageName}@${options.packageVersion.trim()}`
    : options.packageName
  const args = ['install', '--prefix', paths.root, '--save-exact', packageSpec]
  const spawn = options.spawn ?? spawnSync
  const result = spawn(command, args, {
    cwd: paths.root,
    encoding: 'utf8',
    env: normalizedSdkRuntimeEnv({
      ...process.env,
      ...(options.env ?? {}),
    }),
  })
  if (result.status === 0 && !result.error) {
    return {
      ok: true,
      packageName: options.packageName,
      ...(options.packageVersion ? { packageVersion: options.packageVersion } : {}),
      root: paths.root,
      command,
      args,
      status: result.status,
    }
  }
  return {
    ok: false,
    packageName: options.packageName,
    ...(options.packageVersion ? { packageVersion: options.packageVersion } : {}),
    root: paths.root,
    command,
    args,
    status: result.status,
    error: sdkRuntimeInstallError(command, args, result),
  }
}

export function uninstallSdkRuntimePackage(options: Omit<SdkRuntimePackageInstallOptions, 'packageVersion'>): SdkRuntimePackageUninstallResult {
  const paths = ensureSdkRuntimePackageStore(options)
  const command = options.packageManager?.trim()
    || options.env?.MOVSCRIPT_SDK_RUNTIME_PACKAGE_MANAGER?.trim()
    || process.env.MOVSCRIPT_SDK_RUNTIME_PACKAGE_MANAGER?.trim()
    || 'npm'
  const args = ['uninstall', '--prefix', paths.root, options.packageName]
  const spawn = options.spawn ?? spawnSync
  const result = spawn(command, args, {
    cwd: paths.root,
    encoding: 'utf8',
    env: normalizedSdkRuntimeEnv({
      ...process.env,
      ...(options.env ?? {}),
    }),
  })
  if (result.status === 0 && !result.error) {
    return {
      ok: true,
      packageName: options.packageName,
      root: paths.root,
      command,
      args,
      status: result.status,
    }
  }
  return {
    ok: false,
    packageName: options.packageName,
    root: paths.root,
    command,
    args,
    status: result.status,
    error: sdkRuntimeInstallError(command, args, result),
  }
}

async function installSdkRuntimePackageAsync(options: SdkRuntimePackageInstallOptions): Promise<SdkRuntimePackageInstallResult> {
  const paths = ensureSdkRuntimePackageStore(options)
  const command = sdkRuntimePackageManager(options)
  const packageSpec = sdkRuntimePackageSpec(options)
  const args = ['install', '--prefix', paths.root, '--save-exact', packageSpec]
  const controller = new AbortController()
  sdkRuntimePackageInstallControllers.set(sdkRuntimePackageInstallKey(options), controller)
  return new Promise((resolveResult) => {
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const child = spawn(command, args, {
      cwd: paths.root,
      env: normalizedSdkRuntimeEnv({
        ...process.env,
        ...(options.env ?? {}),
      }),
      signal: controller.signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.once('error', (error) => {
      resolveResult({
        ok: false,
        packageName: options.packageName,
        ...(options.packageVersion ? { packageVersion: options.packageVersion } : {}),
        root: paths.root,
        command,
        args,
        error: sdkRuntimeInstallError(command, args, {
          status: null,
          signal: null,
          output: [],
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          pid: child.pid ?? 0,
          error,
        } as SpawnSyncReturns<string>),
      })
    })
    child.once('close', (status, signal) => {
      const result = {
        status,
        signal,
        output: [],
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        pid: child.pid ?? 0,
      } as SpawnSyncReturns<string>
      if (status === 0 && !signal) {
        resolveResult({
          ok: true,
          packageName: options.packageName,
          ...(options.packageVersion ? { packageVersion: options.packageVersion } : {}),
          root: paths.root,
          command,
          args,
          status,
        })
        return
      }
      resolveResult({
        ok: false,
        packageName: options.packageName,
        ...(options.packageVersion ? { packageVersion: options.packageVersion } : {}),
        root: paths.root,
        command,
        args,
        status,
        error: controller.signal.aborted
          ? `SDK runtime install was cancelled: ${options.packageName}`
          : sdkRuntimeInstallError(command, args, result),
      })
    })
  })
}

export function installedSdkRuntimePackageVersion(packageName: string, options: SdkRuntimePackageStoreOptions = {}): string | undefined {
  const paths = resolveSdkRuntimePackageStorePaths(options)
  const packageJsonPath = join(paths.nodeModulesDir, packageName, 'package.json')
  if (!existsSync(packageJsonPath)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : undefined
  } catch {
    return undefined
  }
}

export function seedSdkRuntimePackageStore(options: SdkRuntimePackageStoreOptions = {}): boolean {
  const paths = ensureSdkRuntimePackageStore(options)
  const seedRoot = paths.seedRoot
  if (!seedRoot || !existsSync(seedRoot)) return false
  const seedPackageJson = join(seedRoot, 'package.json')
  const seedNodeModules = join(seedRoot, 'node_modules')
  if (!existsSync(seedPackageJson) || !existsSync(seedNodeModules)) return false
  cpSync(seedPackageJson, paths.packageJsonPath, { force: true })
  cpSync(seedNodeModules, paths.nodeModulesDir, { recursive: true, force: true })
  return true
}

function resolveInstalledSdkRuntimePackageEntry(packageName: string, paths: SdkRuntimePackageStorePaths): string {
  const runtimeRequire = createRequire(join(paths.root, 'package.json'))
  try {
    return runtimeRequire.resolve(packageName)
  } catch (error) {
    if (!isPackagePathNotExportedError(error)) throw error
    return resolveInstalledSdkRuntimePackageEsmEntry(packageName, paths)
  }
}

function sdkRuntimePackageInstallKey(options: Pick<SdkRuntimePackageInstallOptions, 'packageName' | 'packageVersion' | 'packageManager' | 'baseDir' | 'env'>): string {
  const paths = resolveSdkRuntimePackageStorePaths(options)
  return [
    paths.root,
    options.packageName,
    options.packageVersion?.trim() || '',
    options.packageManager?.trim()
      || options.env?.MOVSCRIPT_SDK_RUNTIME_PACKAGE_MANAGER?.trim()
      || process.env.MOVSCRIPT_SDK_RUNTIME_PACKAGE_MANAGER?.trim()
      || 'npm',
  ].join('\0')
}

function sdkRuntimePackageManager(options: Pick<SdkRuntimePackageInstallOptions, 'packageManager' | 'env'>): string {
  return options.packageManager?.trim()
    || options.env?.MOVSCRIPT_SDK_RUNTIME_PACKAGE_MANAGER?.trim()
    || process.env.MOVSCRIPT_SDK_RUNTIME_PACKAGE_MANAGER?.trim()
    || 'npm'
}

function sdkRuntimePackageSpec(options: Pick<SdkRuntimePackageInstallOptions, 'packageName' | 'packageVersion'>): string {
  return options.packageVersion?.trim()
    ? `${options.packageName}@${options.packageVersion.trim()}`
    : options.packageName
}

function resolveSdkRuntimePackageSeedRoot(env: NodeJS.ProcessEnv): string | undefined {
  const explicit = env.MOVSCRIPT_SDK_RUNTIME_SEED_DIR?.trim()
  if (explicit) return resolve(explicit)
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (!resourcesPath) return undefined
  return join(resourcesPath, 'sdk-runtimes')
}

function isModuleNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return candidate.code === 'MODULE_NOT_FOUND' || String(candidate.message ?? '').includes('Cannot find module')
}

function isPackagePathNotExportedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return (error as { code?: unknown }).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
}

function resolveInstalledSdkRuntimePackageEsmEntry(packageName: string, paths: SdkRuntimePackageStorePaths): string {
  const packageDir = join(paths.nodeModulesDir, packageName)
  const packageJsonPath = join(packageDir, 'package.json')
  const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    exports?: unknown
    module?: unknown
    main?: unknown
  }
  const entry = packageManifestImportEntry(manifest)
  if (!entry) throw new Error(`SDK package ${packageName} does not expose an importable entrypoint.`)
  return join(packageDir, entry)
}

function packageManifestImportEntry(manifest: { exports?: unknown; module?: unknown; main?: unknown }): string | undefined {
  const exportRoot = typeof manifest.exports === 'string'
    ? manifest.exports
    : manifest.exports && typeof manifest.exports === 'object'
      ? (manifest.exports as Record<string, unknown>)['.']
      : undefined
  const exportEntry = exportEntryPath(exportRoot)
  if (exportEntry) return exportEntry
  if (typeof manifest.module === 'string' && manifest.module.trim()) return manifest.module
  if (typeof manifest.main === 'string' && manifest.main.trim()) return manifest.main
  return undefined
}

function exportEntryPath(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const key of ['import', 'default', 'module', 'node']) {
    const next = exportEntryPath(record[key])
    if (next) return next
  }
  return undefined
}

function sdkRuntimeInstallError(command: string, args: string[], result: SpawnSyncReturns<string>): string {
  const stderr = result.stderr?.trim()
  const stdout = result.stdout?.trim()
  const error = result.error instanceof Error ? result.error.message : ''
  const detail = stderr || stdout || error || `exit status ${result.status ?? 'unknown'}`
  return `SDK runtime install failed: ${command} ${args.join(' ')}\n${detail}`
}
