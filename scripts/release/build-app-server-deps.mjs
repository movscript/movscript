#!/usr/bin/env node
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import {
  assertDesktopArch,
  assertDesktopPlatform,
  desktopAppServerBinaryName,
  goarchForDesktopArch,
  goosForDesktopPlatform,
  isDirectRun,
  parseDesktopArchArg,
  parseDesktopPlatformArg,
} from './release-common.mjs'
import {
  assertExecutable,
  providerEnvName,
  readBinaryDepsManifest,
  sha256File,
} from './binary-deps-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const defaultDepsDir = 'deps'
const defaultOutDir = 'release-binary-deps'

if (isDirectRun(import.meta.url)) {
  runBuildAppServerDepsCli(repoRoot, process.env, process.argv.slice(2))
}

export function runBuildAppServerDepsCli(root = repoRoot, env = process.env, args = [], options = {}) {
  const {
    build = buildAppServerDeps,
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options
  try {
    const parsed = parseArgs(args, env)
    const result = build(parsed.root, parsed, env)
    if (parsed.githubEnv) writeGithubEnv(parsed.githubEnv, result.env)
    log(`Built ${result.dependencies.length} app-server dependency binary/binaries for ${parsed.platform} ${parsed.arch}.`)
    for (const dependency of result.dependencies) {
      log(`- ${dependency.provider}: ${dependency.binaryPath} (${dependency.sha256})`)
    }
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function buildAppServerDeps(root = repoRoot, options = {}, baseEnv = process.env) {
  const platform = parseDesktopPlatformArg([`--platform=${options.platform ?? process.platform}`], process.platform, 'app-server dependency build')
  const arch = parseDesktopArchArg([`--arch=${options.arch ?? process.arch}`], process.arch, 'app-server dependency build')
  assertDesktopPlatform(platform, 'app-server dependency build')
  assertDesktopArch(arch, 'app-server dependency build')
  const manifest = readBinaryDepsManifest(root, options.manifest ?? 'binary-deps.manifest.json')
  const depsDir = resolve(root, options.depsDir ?? defaultDepsDir)
  const outDir = resolve(root, options.outDir ?? defaultOutDir, `${platform}-${arch}`)
  const target = rustTargetTriple(platform, arch)
  const profile = options.profile ?? 'release'
  const env = {}
  const dependencyResults = []
  mkdirSync(outDir, { recursive: true })

  for (const dependency of manifest.dependencies) {
    const repoDir = resolve(depsDir, dependency.provider)
    verifyDependencyCheckout(repoDir, dependency)
    const source = buildRustAppServer({
      arch,
      baseEnv,
      dependency,
      platform,
      profile,
      repoDir,
      root,
      target,
      spawn: options.spawn ?? spawnSync,
    })
    const stagedName = desktopAppServerBinaryName(platform)
    const staged = resolve(outDir, dependency.provider, stagedName)
    mkdirSync(dirname(staged), { recursive: true })
    copyBinary(source, staged, platform)
    assertExecutable(staged, `${dependency.provider} app-server`)
    const sha256 = sha256File(staged)
    env[providerEnvName(dependency.provider)] = staged
    dependencyResults.push({
      binaryPath: staged,
      provider: dependency.provider,
      ref: dependency.ref,
      repository: dependency.repository,
      sha256,
    })
  }

  writeBuildManifest(resolve(outDir, 'APP_SERVER_DEPS.json'), {
    arch,
    dependencies: dependencyResults,
    platform,
    schema: 'movscript.app-server-deps-build.v1',
  })
  return { dependencies: dependencyResults, env, outDir }
}

export function rustTargetTriple(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin'
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin'
  if (platform === 'linux' && arch === 'arm64') return 'aarch64-unknown-linux-gnu'
  if (platform === 'linux' && arch === 'x64') return 'x86_64-unknown-linux-gnu'
  if (platform === 'win32' && arch === 'arm64') return 'aarch64-pc-windows-msvc'
  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc'
  throw new Error(`Unsupported Rust app-server target: ${platform} ${arch}`)
}

function buildRustAppServer({ arch, baseEnv, dependency, platform, profile, repoDir, root, spawn, target }) {
  const workdir = resolve(repoDir, dependency.workdir)
  const cargoArgs = ['build', '-p', dependency.package, '--bin', dependency.binary, '--target', target]
  if (profile === 'release') cargoArgs.push('--release')
  const env = {
    ...baseEnv,
    GOARCH: goarchForDesktopArch(arch),
    GOOS: goosForDesktopPlatform(platform),
  }
  if (target === 'aarch64-unknown-linux-gnu') {
    env.CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER = env.CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER || 'aarch64-linux-gnu-gcc'
  }
  run(`Install Rust target for ${dependency.provider}`, 'rustup', ['target', 'add', target], { cwd: workdir, env, spawn })
  run(`Build ${dependency.provider} app-server`, 'cargo', cargoArgs, { cwd: workdir, env, spawn })
  const ext = platform === 'win32' ? '.exe' : ''
  const built = resolve(workdir, 'target', target, profile, `${dependency.binary}${ext}`)
  assertExecutable(built, `${dependency.provider} built app-server`)
  return built
}

function verifyDependencyCheckout(repoDir, dependency, spawn = spawnSync) {
  if (!existsSync(repoDir)) throw new Error(`Binary dependency checkout is missing for ${dependency.provider}: ${repoDir}`)
  const result = spawn('git', ['rev-parse', 'HEAD'], {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Unable to read ${dependency.provider} checkout ref: ${result.error?.message ?? result.stderr}`)
  }
  const actual = result.stdout.trim()
  if (actual !== dependency.ref) {
    throw new Error(`${dependency.provider} checkout ref ${actual} does not match manifest ref ${dependency.ref}`)
  }
}

function copyBinary(source, target, platform) {
  copyFileSync(source, target)
  if (platform !== 'win32' && !target.endsWith('.exe')) {
    chmodSync(target, 0o755)
  }
}

function writeGithubEnv(path, env) {
  const lines = []
  for (const [key, value] of Object.entries(env)) lines.push(`${key}=${value}`)
  appendFileSync(path, `${lines.join('\n')}\n`, 'utf8')
}

function writeBuildManifest(path, manifest) {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function run(label, command, args, options = {}) {
  const spawn = options.spawn ?? spawnSync
  console.log(`[app-server-deps] ${label}`)
  console.log(`[app-server-deps] Command: ${command} ${args.join(' ')}`)
  const result = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`)
  if (result.status !== 0 || result.signal) {
    throw new Error(`${label} failed with status ${result.status ?? 'none'} signal ${result.signal ?? 'none'}`)
  }
}

function parseArgs(args, env) {
  return {
    arch: parseDesktopArchArg(args, env.MOVSCRIPT_PACKAGE_ARCH || process.arch, 'app-server dependency build'),
    depsDir: argValue(args, '--deps-dir') ?? env.MOVSCRIPT_BINARY_DEPS_DIR ?? defaultDepsDir,
    githubEnv: argValue(args, '--github-env') ?? env.GITHUB_ENV,
    manifest: argValue(args, '--manifest') ?? env.MOVSCRIPT_BINARY_DEPS_MANIFEST ?? 'binary-deps.manifest.json',
    outDir: argValue(args, '--out-dir') ?? env.MOVSCRIPT_APP_SERVER_DEPS_OUT_DIR ?? defaultOutDir,
    platform: parseDesktopPlatformArg(args, env.MOVSCRIPT_PACKAGE_PLATFORM || process.platform, 'app-server dependency build'),
    profile: argValue(args, '--profile') ?? env.MOVSCRIPT_APP_SERVER_DEPS_PROFILE ?? 'release',
    root: resolve(argValue(args, '--root') ?? env.MOVSCRIPT_BINARY_DEPS_ROOT ?? process.cwd()),
  }
}

function argValue(args, name) {
  const equalPrefix = `${name}=`
  const equalValue = args.find((arg) => arg.startsWith(equalPrefix))
  if (equalValue) return equalValue.slice(equalPrefix.length)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
