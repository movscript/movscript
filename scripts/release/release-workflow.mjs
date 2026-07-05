#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import {
  assertDesktopArch,
  assertDesktopPlatform,
  desktopFFmpegBinaryName,
  goarchForDesktopArch,
  goosForDesktopPlatform,
  hasDesktopArchArg,
  hasDesktopPlatformArg,
  isDirectRun,
  parseDesktopArchArg,
  parseDesktopPlatformArg,
  resolveDesktopFFmpegPath,
  sha256File,
  verifyDesktopFFmpeg,
  verifyDesktopPackage,
} from './release-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const releaseCommands = new Map([
  ['audit-ffmpeg', ['scripts/release/audit-ffmpeg.mjs']],
  ['build', ['builtin:build']],
  ['bump-version', ['scripts/release/bump-version.mjs']],
  ['collect', ['builtin:collect']],
  ['download-ffmpeg-static', ['scripts/release/download-ffmpeg-static.mjs']],
  ['package', ['builtin:package']],
  ['prepare', ['builtin:prepare']],
  ['sign-macos-app', ['scripts/release/sign-macos-app.mjs']],
  ['smoke-desktop-package', ['scripts/release/smoke-desktop-package.mjs']],
  ['smoke-plugin-package', ['scripts/release/smoke-plugin-package.mjs']],
  ['stage-ffmpeg', ['scripts/release/stage-ffmpeg.mjs']],
  ['typecheck', ['builtin:typecheck']],
  ['verify', ['builtin:verify']],
  ['verify-package-resources', ['scripts/release/verify-package-resources.mjs']],
  ['verify-release-readiness', ['scripts/release/verify-release-readiness.mjs']],
])
const isWindows = process.platform === 'win32'
const pnpmCommand = 'pnpm'
const signingModes = new Set(['signed', 'unsigned'])
const appTargets = new Set(['desktop', 'plugin'])
const collectAppTargets = new Set(['desktop', 'plugin', 'all'])
const prepareDesktopSteps = [
  ['Build workspace packages', pnpmCommand, ['--workspace-concurrency=1', '--filter', './packages/*', 'build']],
  ['Build movscript CLI', pnpmCommand, ['--filter', '@movscript/cli', 'build']],
  ['Build admin surface', pnpmCommand, ['--filter', '@movscript/admin-surface', 'build']],
  ['Build agent plugin app', pnpmCommand, ['--filter', '@movscript/plugin-movscript', 'build']],
  ['Build local surface host', pnpmCommand, ['--filter', '@movscript/local-surface-host', 'build']],
]
const releaseAssetExtensions = new Set([
  '.dmg',
  '.zip',
  '.exe',
  '.msi',
  '.AppImage',
  '.deb',
  '.rpm',
  '.movpkg',
])
const updateMetadataExtensions = new Set(['.yml', '.yaml'])

export function releaseWorkflowSteps(mode, args = []) {
  if (mode === 'check') {
    return [
      ['Verify release readiness', 'node', ['scripts/release/release-workflow.mjs', 'verify-release-readiness']],
      ['Verify generated path contract', pnpmCommand, ['run', 'check:generated-paths']],
      ['Verify workspace package contract', pnpmCommand, ['run', 'check:workspace-packages']],
      ['Verify plugin distribution contract', pnpmCommand, ['run', 'check:plugin-distribution']],
      ['Validate runtime registry', pnpmCommand, ['run', 'runtime:registry']],
      ['Run script and architecture boundary tests', pnpmCommand, ['run', 'test:scripts']],
      ['Build workspace packages', pnpmCommand, ['--workspace-concurrency=1', '--filter', './packages/*', 'build']],
      ['Build movscript CLI', pnpmCommand, ['--filter', '@movscript/cli', 'build']],
      ['Run workspace typecheck', pnpmCommand, ['run', 'typecheck']],
      ['Run workspace package tests', pnpmCommand, ['run', 'test:packages']],
      ['Run desktop tests', pnpmCommand, ['--filter', '@movscript/desktop', 'test']],
      ['Run backend tests', pnpmCommand, ['run', 'check:backend']],
      ['Run UI package quality gate', pnpmCommand, ['run', 'quality:ui']],
      ['Run frontend quality gate', pnpmCommand, ['run', 'quality:frontend']],
      ['Verify package resource contract', 'node', ['scripts/release/release-workflow.mjs', 'verify-package-resources']],
    ]
  }
  if (mode === 'full' || mode === 'dry-run') {
    const { packageArgs, targetArgs } = releaseDesktopTargetArgs(args)
    return [
      ['Run release checks', 'node', ['scripts/release/release-workflow.mjs', 'check']],
      ['Download ffmpeg-static release binary', 'node', ['scripts/release/release-workflow.mjs', 'download-ffmpeg-static', ...targetArgs]],
      ['Build desktop package', 'node', ['scripts/release/release-workflow.mjs', 'package', '--app', 'desktop', ...packageArgs]],
      ['Smoke test desktop package', 'node', ['scripts/release/release-workflow.mjs', 'smoke-desktop-package', ...targetArgs]],
      ['Build agent plugin package', 'node', ['scripts/release/release-workflow.mjs', 'package', '--app', 'plugin']],
      ['Smoke test agent plugin package', 'node', ['scripts/release/release-workflow.mjs', 'smoke-plugin-package']],
      ['Collect desktop and plugin release artifacts', 'node', ['scripts/release/release-workflow.mjs', 'collect', '--app', 'all']],
    ]
  }
  throw new Error(usage())
}

export function releaseSubcommands() {
  return [...releaseCommands.keys()]
}

export function runReleaseWorkflowCli(args = [], options = {}) {
  args = normalizePnpmArgs(args)
  const mode = args[0] ?? 'full'
  const spawn = options.spawn ?? spawnSync
  const log = options.log ?? console.log
  const logError = options.logError ?? console.error
  const exit = options.exit ?? process.exit
  const releaseCommand = releaseCommands.get(mode)
  if (releaseCommand) {
    const [scriptPath, ...defaultArgs] = releaseCommand
    if (scriptPath === 'builtin:prepare') {
      runPrepareAppCli([...defaultArgs, ...args.slice(1)], {
        exit,
        log,
        logError,
        defaults: options.defaults,
        env: options.env,
        preparePackage: options.preparePackage,
        root: options.root,
      })
      return
    }
    if (scriptPath === 'builtin:build') {
      runBuildAppCli([...defaultArgs, ...args.slice(1)], {
        exit,
        log,
        logError,
        defaults: options.defaults,
        env: options.env,
        patchMacOSDMGBuilder: options.patchMacOSDMGBuilder,
        pnpm: options.pnpm,
        root: options.root,
        spawn,
      })
      return
    }
    if (scriptPath === 'builtin:typecheck') {
      runTypecheckAppCli([...defaultArgs, ...args.slice(1)], {
        exit,
        log,
        logError,
        env: options.env,
        pnpm: options.pnpm,
        spawn,
      })
      return
    }
    if (scriptPath === 'builtin:package') {
      runPackageAppCli([...defaultArgs, ...args.slice(1)], {
        spawn,
        log,
        logError,
        exit,
        defaults: options.defaults,
        env: options.env,
        node: options.node,
        packagePlugin: options.packagePlugin,
        patchMacOSDMGBuilder: options.patchMacOSDMGBuilder,
        pnpm: options.pnpm,
        preparePackage: options.preparePackage,
        root: options.root,
        verifyMacOSDMG: options.verifyMacOSDMG,
        verifyPackage: options.verifyPackage,
      })
      return
    }
    if (scriptPath === 'builtin:verify') {
      runVerifyAppCli([...defaultArgs, ...args.slice(1)], {
        exit,
        log,
        logError,
        defaults: options.defaults,
        env: options.env,
        root: options.root,
        spawn,
        verifyMacOSDMG: options.verifyMacOSDMG,
        verifyPackage: options.verifyPackage,
      })
      return
    }
    if (scriptPath === 'builtin:collect') {
      runCollectArtifactsCli(options.root ?? repoRoot, options.env ?? process.env, {
        args: args.slice(1),
        collect: options.collectArtifacts,
        exit,
        log,
        logError,
      })
      return
    }
    runStep(`Run release command ${mode}`, 'node', [scriptPath, ...defaultArgs, ...args.slice(1)], { spawn, log, logError, exit })
    return
  }

  let steps
  try {
    steps = releaseWorkflowSteps(mode, args.slice(1))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(2)
    return
  }

  for (const [label, command, commandArgs] of steps) {
    if (!runStep(label, command, commandArgs, { spawn, log, logError, exit })) return
  }
}

function normalizePnpmArgs(args) {
  return args[0] === '--' ? args.slice(1) : args
}

function parseAppArg(args = [], defaultApp = '') {
  const equalValue = args.find((arg) => arg.startsWith('--app='))
  const app = equalValue ? equalValue.slice('--app='.length) : argValue(args, '--app') ?? defaultApp
  if (!appTargets.has(app)) {
    throw new Error(`Unsupported release app target: ${app || '<missing>'}. Expected one of: ${[...appTargets].join(', ')}`)
  }
  return app
}

function stripAppArgs(args = []) {
  const stripped = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--app') {
      index += 1
      continue
    }
    if (arg.startsWith('--app=')) continue
    stripped.push(arg)
  }
  return stripped
}

function parseCollectAppArg(args = [], defaultApp = 'desktop') {
  const equalValue = args.find((arg) => arg.startsWith('--app='))
  const app = equalValue ? equalValue.slice('--app='.length) : argValue(args, '--app') ?? defaultApp
  if (!collectAppTargets.has(app)) {
    throw new Error(`Unsupported release artifact collection target: ${app || '<missing>'}. Expected one of: ${[...collectAppTargets].join(', ')}`)
  }
  return app
}

function argValue(args, name) {
  const equalPrefix = `${name}=`
  const equalValue = args.find((arg) => arg.startsWith(equalPrefix))
  if (equalValue) return equalValue.slice(equalPrefix.length)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function parseBuildStageArg(args = [], defaultStage = 'all') {
  const stage = args.find((arg) => arg.startsWith('--stage='))?.slice('--stage='.length) ?? argValue(args, '--stage') ?? defaultStage
  const stages = new Set(['all', 'bundle', 'artifact'])
  if (!stages.has(stage)) {
    throw new Error(`Unsupported build stage: ${stage}. Expected one of: ${[...stages].join(', ')}`)
  }
  return stage
}

function stripBuildStageArgs(args = []) {
  const stripped = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--stage') {
      index += 1
      continue
    }
    if (arg.startsWith('--stage=')) continue
    stripped.push(arg)
  }
  return stripped
}

export function desktopBuilderArgsForTarget(platform, arch, explicitArch = true) {
  const publishArgs = electronUpdaterPublishArgs(platform, arch)
  if (platform === 'darwin') {
    return explicitArch ? ['--mac', 'dmg', 'zip', `--${arch}`, '--publish', 'never', ...publishArgs] : ['--mac', 'dmg', 'zip', '--publish', 'never', ...publishArgs]
  }
  if (platform === 'linux') return ['--linux', `--${arch}`, '--publish', 'never', ...publishArgs]
  if (platform === 'win32') {
    const targetArch = explicitArch && arch === 'arm64' ? '--arm64' : '--x64'
    return ['--win', targetArch, '--publish', 'never', ...publishArgs]
  }
  throw new Error(`Unsupported desktop package platform: ${platform}`)
}

export function electronUpdaterChannel(platform, arch, baseChannel = process.env.MOVSCRIPT_APP_UPDATE_CHANNEL || 'latest') {
  assertDesktopPlatform(platform, 'electron updater')
  assertDesktopArch(arch, 'electron updater')
  const normalizedBase = String(baseChannel || 'latest').trim() || 'latest'
  if (normalizedBase.includes(platform) && normalizedBase.includes(arch)) return normalizedBase
  return `${normalizedBase}-${platform}-${arch}`
}

function electronUpdaterPublishArgs(platform, arch) {
  return [`-c.publish.channel=${electronUpdaterChannel(platform, arch)}`]
}

export function desktopPackagePlan(args = [], defaults = {}) {
  const hasPlatformArg = hasDesktopPlatformArg(args)
  const hasArchArg = hasDesktopArchArg(args)
  const signingMode = parseDesktopSigningModeArg(args, defaults.signingMode)
  if (!hasPlatformArg && !hasArchArg) {
    const platform = defaults.platform ?? process.platform
    return {
      builderArgs: ['--publish', 'never', ...signingBuilderArgsForTarget(platform, signingMode)],
      signingMode,
      targetArgs: [],
    }
  }

  const platform = parseDesktopPlatformArg(args, defaults.platform ?? process.platform, 'desktop package')
  const arch = parseDesktopArchArg(args, defaults.arch ?? process.arch, 'desktop package')
  const targetArgs = [`--platform=${platform}`]
  if (hasArchArg) targetArgs.push(`--arch=${arch}`)
  return {
    builderArgs: [...desktopBuilderArgsForTarget(platform, arch, hasArchArg), ...signingBuilderArgsForTarget(platform, signingMode)],
    signingMode,
    targetArgs,
  }
}

export function parseDesktopSigningModeArg(args = [], defaultMode = process.env.MOVSCRIPT_RELEASE_SIGNING_MODE || 'unsigned') {
  const explicitMode = args.find((arg) => arg.startsWith('--signing-mode='))?.slice('--signing-mode='.length)
  const wantsUnsigned = args.includes('--unsigned')
  const wantsSigned = args.includes('--signed')
  if ([explicitMode, wantsUnsigned ? 'unsigned' : '', wantsSigned ? 'signed' : ''].filter(Boolean).length > 1) {
    throw new Error('Desktop package signing mode must be specified only once')
  }
  const mode = explicitMode || (wantsUnsigned ? 'unsigned' : '') || (wantsSigned ? 'signed' : '') || defaultMode || 'unsigned'
  if (!signingModes.has(mode)) {
    throw new Error(`Unsupported desktop package signing mode: ${mode}`)
  }
  return mode
}

function releaseDesktopTargetArgs(args = []) {
  const plan = desktopPackagePlan(args)
  return {
    packageArgs: [...plan.targetArgs, `--${plan.signingMode}`],
    targetArgs: plan.targetArgs,
  }
}

const unsignedMacOSBuilderArgs = Object.freeze(['-c.mac.identity=null', '-c.mac.notarize=false'])

function signingBuilderArgsForTarget(platform, signingMode) {
  return platform === 'darwin' && signingMode === 'unsigned' ? [...unsignedMacOSBuilderArgs] : []
}

export function runDesktopPackageCli(args = [], options = {}) {
  const pnpm = options.pnpm ?? 'pnpm'
  const spawn = options.spawn ?? spawnSync
  const log = options.log ?? console.log
  const logError = options.logError ?? console.error
  const exit = options.exit ?? process.exit
  let plan
  try {
    plan = desktopPackagePlan(args, options.defaults)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
    return
  }

  const preparePackage = options.preparePackage ?? prepareDesktopPackage
  const verifyPackage = options.verifyPackage ?? verifyDesktopPackage
  const root = options.root ?? repoRoot
  const target = {
    platform: parseDesktopPlatformArg(plan.targetArgs, options.defaults?.platform ?? process.platform, 'desktop package'),
    currentPlatform: options.defaults?.platform ?? process.platform,
    currentArch: options.defaults?.arch ?? process.arch,
    arch: parseDesktopArchArg(plan.targetArgs, options.defaults?.arch ?? process.arch, 'desktop package'),
    exit,
    signingMode: plan.signingMode,
  }
  log('[package-desktop] Prepare desktop package prerequisites')
  const prepared = preparePackage(root, target)
  if (prepared === false) return

  if (target.platform === 'darwin') {
    try {
      const patchMacOSDMGBuilder = options.patchMacOSDMGBuilder ?? patchDmgBuilderAPFSAliasCompatibility
      patchMacOSDMGBuilder(root, log)
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error))
      exit(1)
      return
    }
  }

  const packageEnv = desktopPackageEnv(options.env ?? process.env, plan.signingMode)
  log('[package-desktop] Build desktop bundle')
  const bundleResult = spawn(pnpm, desktopBundleBuildArgs(options.env ?? process.env), releaseSpawnOptions(options.env ?? process.env))
  if (bundleResult.error) {
    logError(bundleResult.error.message)
    exit(1)
    return
  }
  if (bundleResult.status !== 0) {
    exit(bundleResult.status ?? 1)
    return
  }

  try {
    stageDesktopPackageProject(root, { env: packageEnv, log, pnpm, spawn })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
    return
  }

  const artifactSteps = desktopArtifactStepsForTarget(root, target, plan, pnpm)
  for (const [label, command, commandArgs, stepOptions = {}] of artifactSteps) {
    log(`[package-desktop] ${label}`)
    const result = spawn(command, commandArgs, releaseSpawnOptions(stepOptions.env ?? packageEnv))
    if (result.error) {
      logError(result.error.message)
      exit(1)
      return
    }
    if (result.status !== 0) {
      exit(result.status ?? 1)
      return
    }
  }

  log('[package-desktop] Verify desktop package')
  const verified = verifyPackage(root, {
    ...target,
    log,
    logError,
  })
  if (verified === false) return

  if (target.platform === 'darwin') {
    try {
      const verifyMacOSDMG = options.verifyMacOSDMG ?? verifyMacOSDMGArtifacts
      verifyMacOSDMG(root, { arch: target.arch, env: packageEnv, log, spawn })
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error))
      exit(1)
    }
  }
}

export function runPackageAppCli(args = [], options = {}) {
  const {
    exit = process.exit,
    logError = console.error,
  } = options
  let app
  try {
    app = parseAppArg(args)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(2)
    return
  }
  const appArgs = stripAppArgs(args)
  if (app === 'desktop') {
    runDesktopPackageCli(appArgs, options)
    return
  }
  runPluginPackageCli(appArgs, options)
}

export function runPrepareAppCli(args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options
  let app
  try {
    app = parseAppArg(args)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(2)
    return
  }
  const appArgs = stripAppArgs(args)
  if (app === 'desktop') {
    runPrepareDesktopPackageCli(appArgs, options)
    return
  }
  log('[prepare-plugin] No plugin package prerequisites are required')
}

export function runBuildAppCli(args = [], options = {}) {
  const {
    exit = process.exit,
    logError = console.error,
  } = options
  let app
  let stage
  try {
    app = parseAppArg(args)
    stage = parseBuildStageArg(args)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(2)
    return
  }
  const appArgs = stripBuildStageArgs(stripAppArgs(args))
  if (app === 'plugin') {
    runBuildPluginArtifactCli(appArgs, options)
    return
  }
  if (stage === 'all' || stage === 'bundle') {
    runBuildDesktopBundleCli(appArgs, options)
    if (stage === 'bundle') return
  }
  runBuildDesktopArtifactCli(appArgs, options)
}

export function runTypecheckAppCli(args = [], options = {}) {
  const {
    exit = process.exit,
    logError = console.error,
    pnpm = 'pnpm',
    spawn = spawnSync,
  } = options
  let app
  try {
    app = parseAppArg(args)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(2)
    return
  }
  if (app === 'desktop') {
    runTypecheckDesktopBundleCli(stripAppArgs(args), options)
    return
  }
  runSpawnStep(pnpm, ['--filter', '@movscript/plugin-movscript', 'typecheck'], {
    env: options.env ?? process.env,
    exit,
    logError,
    spawn,
  })
}

export function runVerifyAppCli(args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options
  let app
  try {
    app = parseAppArg(args)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(2)
    return
  }
  const appArgs = stripAppArgs(args)
  if (app === 'desktop') {
    runVerifyDesktopPackageCli(appArgs, options)
    return
  }
  try {
    validatePluginArtifactInputs(resolve(options.root ?? repoRoot, 'plugins/movscript'))
    log('[verify-plugin] Plugin artifact inputs are present')
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function runPluginPackageCli(args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
    packagePlugin = packagePluginArtifact,
  } = options
  try {
    const result = packagePlugin(options.root ?? repoRoot, {
      log,
      logError,
      pnpm: options.pnpm ?? 'pnpm',
      spawn: options.spawn ?? spawnSync,
    })
    log(`[package-plugin] Created ${result.artifactPath}`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function runBuildPluginArtifactCli(args = [], options = {}) {
  runPluginPackageCli(args, options)
}

export function packagePluginArtifact(root = repoRoot, options = {}) {
  const {
    log = console.log,
    logError = console.error,
    pnpm = 'pnpm',
    spawn = spawnSync,
  } = options
  const sourceDir = resolve(root, 'apps/plugin')
  const pluginDir = resolve(root, 'plugins/movscript')
  const releaseDir = resolve(pluginDir, 'release')
  const rootPackage = readJSONFile(resolve(root, 'package.json'))
  const pluginPackage = readJSONFile(resolve(sourceDir, 'package.json'))
  const version = String(rootPackage.version || pluginPackage.version || '0.0.0')
  const artifactName = `movscript-agent-plugin-${version}.zip`
  const artifactPath = resolve(releaseDir, artifactName)

  log('[package-plugin] Build local full-node runtime prerequisites')
  const workspaceBuildResult = spawn(pnpm, ['--workspace-concurrency=1', '--filter', './packages/*', 'build'], releaseSpawnOptions(process.env))
  if (workspaceBuildResult.error) throw workspaceBuildResult.error
  if (workspaceBuildResult.status !== 0) throw new Error(`Plugin workspace package build failed with status ${workspaceBuildResult.status ?? 1}`)
  for (const [filter, script] of [
    ['@movscript/runtime-contracts', 'build'],
    ['@movscript/app-runner', 'build'],
    ['@movscript/local-runtime', 'build'],
    ['@movscript/local-daemon', 'build'],
    ['@movscript/cli', 'build'],
    ['@movscript/mcp-host', 'build'],
    ['@movscript/data-service', 'build'],
    ['@movscript/canvas-service', 'build'],
    ['@movscript/local-surface-host', 'build'],
  ]) {
    const result = spawn(pnpm, ['--filter', filter, script], releaseSpawnOptions(process.env))
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Plugin runtime prerequisite ${filter} ${script} failed with status ${result.status ?? 1}`)
  }

  log('[package-plugin] Build plugin bundle')
  const buildResult = spawn(pnpm, ['--filter', '@movscript/plugin-movscript', 'build'], releaseSpawnOptions(process.env))
  if (buildResult.error) throw buildResult.error
  if (buildResult.status !== 0) throw new Error(`Plugin build failed with status ${buildResult.status ?? 1}`)

  prepareProviderPluginResources(root, { log: (message) => log(`[package-plugin] ${message}`) })
  rmSync(releaseDir, { recursive: true, force: true })
  mkdirSync(releaseDir, { recursive: true })
  validatePluginArtifactInputs(pluginDir)

  const files = [
    '.agent-package',
    '.codex-plugin',
    '.provider-plugin',
    '.mcp.json',
    'assets',
    'bin/movscript',
    'bin/movscript.mjs',
    'bin/movscript-agent-mcp',
    'bin/movscript-agent-mcp.mjs',
    'runtime',
    'skills',
    'manifest.runtime.json',
    'README.md',
  ]
  log(`[package-plugin] Create ${artifactName}`)
  const zipResult = spawn('zip', ['-qry', artifactPath, ...files], {
    cwd: pluginDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (zipResult.error) throw zipResult.error
  if (zipResult.status !== 0) throw new Error(`Plugin artifact zip failed with status ${zipResult.status ?? 1}`)
  return { artifactPath, releaseDir, version }
}

export function prepareProviderPluginResources(root = repoRoot, options = {}) {
  const {
    log = () => undefined,
  } = options
  const sourceDir = resolve(root, 'apps/plugin')
  const pluginDir = resolve(root, 'plugins/movscript')
  const rootPackage = readJSONFile(resolve(root, 'package.json'))
  const pluginPackage = readJSONFile(resolve(sourceDir, 'package.json'))
  const version = String(rootPackage.version || pluginPackage.version || '0.0.0')

  log('Sync provider plugin distribution resources')
  syncPluginDistribution(sourceDir, pluginDir)
  syncPluginMetadataVersions(pluginDir, version)
  syncPluginRuntime(root, pluginDir)
  writePluginRuntimeManifest(pluginDir, {
    version,
    packageName: pluginPackage.name,
  })
  validatePluginArtifactInputs(pluginDir)
  return { pluginDir, version }
}

function writePluginRuntimeManifest(pluginDir, input) {
  writeFileSync(resolve(pluginDir, 'manifest.runtime.json'), `${JSON.stringify({
    schema: 'movscript.runtime-bundle.v1',
    appId: 'plugin',
    applicationId: 'movscript.agent-plugin',
    artifact: 'movscript-agent-plugin',
    version: input.version,
    packageName: input.packageName,
    generatedAt: new Date().toISOString(),
    apiVersion: '1.0',
    minDaemonApiVersion: '1.0',
    bundleHash: pluginBundleHash(pluginDir),
    bundleHashAlgorithm: 'sha256',
    capabilities: {
      cli: true,
      mcp: true,
      daemon: true,
      project: true,
      timeline: true,
      canvas: true,
      resources: true,
      editing: true,
      media: true,
    },
    mcpServer: 'movscript',
    entrypoint: './bin/movscript',
    mcpArgs: ['mcp', 'stdio'],
    daemonArgs: ['daemon', 'run'],
    cliEntrypoint: './bin/movscript',
    legacyMcpEntrypoint: './bin/movscript-agent-mcp',
  }, null, 2)}\n`, 'utf8')
}

function pluginBundleHash(pluginDir) {
  const hash = createHash('sha256')
  for (const file of pluginBundleFiles(pluginDir)) {
    hash.update(file)
    hash.update('\0')
    hash.update(readFileSync(resolve(pluginDir, file)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function pluginBundleFiles(pluginDir) {
  const roots = [
    '.agent-package',
    '.codex-plugin',
    '.provider-plugin',
    '.mcp.json',
    'assets',
    'bin',
    'runtime',
    'skills',
    'README.md',
  ]
  const files = []
  for (const rootPath of roots) {
    const absolute = resolve(pluginDir, rootPath)
    if (!existsSync(absolute)) continue
    collectPluginBundleFiles(pluginDir, rootPath, files)
  }
  return files.sort()
}

function collectPluginBundleFiles(pluginDir, relativePath, files) {
  const absolute = resolve(pluginDir, relativePath)
  const stat = statSync(absolute)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(absolute).filter((name) => name !== '.DS_Store').sort()) {
      collectPluginBundleFiles(pluginDir, `${relativePath}/${entry}`, files)
    }
    return
  }
  files.push(relativePath)
}

function syncPluginDistribution(sourceDir, pluginDir) {
  const paths = [
    '.agent-package',
    '.codex-plugin',
    '.provider-plugin',
    '.mcp.json',
    'assets',
    'bin',
    'runtime',
    'skills',
    'manifest.runtime.json',
    'README.md',
  ]
  for (const path of paths) {
    rmSync(resolve(pluginDir, path), { recursive: true, force: true })
  }
  mkdirSync(pluginDir, { recursive: true })
  for (const path of paths.filter((path) => path !== 'manifest.runtime.json' && path !== 'runtime')) {
    cpSync(resolve(sourceDir, path), resolve(pluginDir, path), { recursive: true })
  }
}

function syncPluginMetadataVersions(pluginDir, version) {
  for (const relativePath of ['.agent-package/package.json', '.codex-plugin/plugin.json', '.provider-plugin/plugin.json']) {
    const manifestPath = resolve(pluginDir, relativePath)
    const manifest = readJSONFile(manifestPath)
    if (manifest.version === version) continue
    manifest.version = version
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }
}

function syncPluginRuntime(root, pluginDir) {
  const runtimeRoot = resolve(pluginDir, 'runtime/services')
  rmSync(resolve(pluginDir, 'runtime'), { recursive: true, force: true })
  mkdirSync(runtimeRoot, { recursive: true })

  const dataServiceBinary = resolve(root, 'services/data-service/bin', dataServiceBinaryName())
  if (!existsSync(dataServiceBinary)) {
    throw new Error(`Data Service binary is missing: ${dataServiceBinary}`)
  }
  const dataServiceTarget = resolve(runtimeRoot, 'data-service/bin', dataServiceBinaryName())
  mkdirSync(dirname(dataServiceTarget), { recursive: true })
  cpSync(dataServiceBinary, dataServiceTarget)

  const localSurfaceHostDist = resolve(root, 'services/local-surface-host/dist')
  if (!existsSync(resolve(localSurfaceHostDist, 'index.html'))) {
    throw new Error(`Local Surface Host build output is missing: ${localSurfaceHostDist}`)
  }
  cpSync(localSurfaceHostDist, resolve(runtimeRoot, 'local-surface-host/dist'), { recursive: true })
}

function dataServiceBinaryName() {
  return process.platform === 'win32' ? 'movscript-server.exe' : 'movscript-server'
}

function validatePluginArtifactInputs(pluginDir) {
  const required = [
    '.agent-package/package.json',
    '.codex-plugin/plugin.json',
    '.provider-plugin/plugin.json',
    '.mcp.json',
    'bin/movscript',
    'bin/movscript.mjs',
    'bin/movscript-agent-mcp',
    'bin/movscript-agent-mcp.mjs',
    `runtime/services/data-service/bin/${dataServiceBinaryName()}`,
    'runtime/services/local-surface-host/dist/index.html',
    'skills',
    'assets',
    'manifest.runtime.json',
    'README.md',
  ]
  const missing = required.filter((path) => !existsSync(resolve(pluginDir, path)))
  if (missing.length > 0) {
    throw new Error(`Plugin artifact is missing required files:\n${missing.map((path) => `- ${path}`).join('\n')}`)
  }
  const runtimeManifest = readJSONFile(resolve(pluginDir, 'manifest.runtime.json'))
  if (runtimeManifest.schema !== 'movscript.runtime-bundle.v1') {
    throw new Error(`Plugin runtime manifest schema is invalid: ${runtimeManifest.schema}`)
  }
  if (runtimeManifest.apiVersion !== '1.0' || runtimeManifest.minDaemonApiVersion !== '1.0') {
    throw new Error(`Plugin runtime manifest API versions are invalid: ${JSON.stringify({
      apiVersion: runtimeManifest.apiVersion,
      minDaemonApiVersion: runtimeManifest.minDaemonApiVersion,
    })}`)
  }
  if (runtimeManifest.bundleHashAlgorithm !== 'sha256') {
    throw new Error(`Plugin runtime manifest hash algorithm is invalid: ${runtimeManifest.bundleHashAlgorithm}`)
  }
  const expectedBundleHash = pluginBundleHash(pluginDir)
  if (runtimeManifest.bundleHash !== expectedBundleHash) {
    throw new Error(`Plugin runtime manifest bundleHash is ${runtimeManifest.bundleHash}, expected ${expectedBundleHash}`)
  }
  for (const capability of ['cli', 'mcp', 'daemon', 'project', 'timeline', 'canvas', 'resources', 'editing', 'media']) {
    if (runtimeManifest.capabilities?.[capability] !== true) {
      throw new Error(`Plugin runtime manifest capability ${capability} must be true`)
    }
  }
}

function readJSONFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function runPrepareDesktopPackageCli(args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options
  const resolved = desktopPackageTargetOrExit(args, options, { exit, logError })
  if (!resolved) return
  const preparePackage = options.preparePackage ?? prepareDesktopPackage
  const root = options.root ?? repoRoot
  log('[package-desktop] Prepare desktop package prerequisites')
  preparePackage(root, {
    ...resolved.target,
    exit,
  })
}

export function runBuildDesktopBundleCli(args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
    pnpm = 'pnpm',
    spawn = spawnSync,
  } = options
  log('[package-desktop] Build desktop bundle')
  runSpawnStep(pnpm, desktopBundleBuildArgs(options.env ?? process.env), {
    env: options.env ?? process.env,
    exit,
    logError,
    spawn,
  })
}

export function runTypecheckDesktopBundleCli(args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
    pnpm = 'pnpm',
    spawn = spawnSync,
  } = options
  log('[package-desktop] Typecheck desktop bundle')
  runSpawnStep(pnpm, ['--filter', '@movscript/desktop', 'typecheck'], {
    env: options.env ?? process.env,
    exit,
    logError,
    spawn,
  })
}

export function runBuildDesktopArtifactCli(args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
    pnpm = 'pnpm',
    spawn = spawnSync,
  } = options
  const resolved = desktopPackageTargetOrExit(args, options, { exit, logError })
  if (!resolved) return
  const root = options.root ?? repoRoot
  if (resolved.target.platform === 'darwin') {
    try {
      const patchMacOSDMGBuilder = options.patchMacOSDMGBuilder ?? patchDmgBuilderAPFSAliasCompatibility
      patchMacOSDMGBuilder(root, log)
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error))
      exit(1)
      return
    }
  }
  const packageEnv = desktopPackageEnv(options.env ?? process.env, resolved.plan.signingMode)
  try {
    stageDesktopPackageProject(root, { env: packageEnv, log, pnpm, spawn })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
    return
  }
  const artifactSteps = desktopArtifactStepsForTarget(root, resolved.target, resolved.plan, pnpm)
  for (const [label, command, commandArgs, stepOptions = {}] of artifactSteps) {
    log(`[package-desktop] ${label}`)
    const ok = runSpawnStep(command, commandArgs, {
      env: packageEnv,
      exit,
      logError,
      spawn,
      ...stepOptions,
    })
    if (!ok) return
  }
}

export function runVerifyDesktopPackageCli(args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
    spawn = spawnSync,
  } = options
  const resolved = desktopPackageTargetOrExit(args, options, { exit, logError })
  if (!resolved) return
  const root = options.root ?? repoRoot
  const verifyPackage = options.verifyPackage ?? verifyDesktopPackage
  log('[package-desktop] Verify desktop package')
  const verified = verifyPackage(root, {
    ...resolved.target,
    exit,
    log,
    logError,
  })
  if (verified === false) return
  if (resolved.target.platform === 'darwin') {
    try {
      const packageEnv = desktopPackageEnv(options.env ?? process.env, resolved.plan.signingMode)
      const verifyMacOSDMG = options.verifyMacOSDMG ?? verifyMacOSDMGArtifacts
      verifyMacOSDMG(root, { arch: resolved.target.arch, env: packageEnv, log, spawn })
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error))
      exit(1)
    }
  }
}

function desktopPackageTargetOrExit(args, options, handlers) {
  const { exit, logError } = handlers
  let plan
  try {
    plan = desktopPackagePlan(args, options.defaults)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
    return undefined
  }
  const defaults = options.defaults ?? {}
  return {
    plan,
    target: {
      platform: parseDesktopPlatformArg(plan.targetArgs, defaults.platform ?? process.platform, 'desktop package'),
      currentPlatform: defaults.platform ?? process.platform,
      currentArch: defaults.arch ?? process.arch,
      arch: parseDesktopArchArg(plan.targetArgs, defaults.arch ?? process.arch, 'desktop package'),
      signingMode: plan.signingMode,
    },
  }
}

export function desktopBundleBuildArgs(env = process.env) {
  const args = ['--filter', '@movscript/desktop', 'exec', 'electron-vite', 'build', '--logLevel', 'info', '--clearScreen=false']
  if (env.MOVSCRIPT_ELECTRON_VITE_DEBUG === '1') args.push('--debug')
  return args
}

function runSpawnStep(command, args, options) {
  const {
    env = process.env,
    exit = process.exit,
    logError = console.error,
    spawn = spawnSync,
  } = options
  const result = spawn(command, args, releaseSpawnOptions(env))
  if (result.error) {
    logError(result.error.message)
    exit(1)
    return false
  }
  if (result.status !== 0) {
    exit(result.status ?? 1)
    return false
  }
  return true
}

export function releaseSpawnOptions(env = process.env, platform = process.platform) {
  return {
    stdio: 'inherit',
    env,
    ...(platform === 'win32' ? { shell: true } : {}),
  }
}

export function prepareDesktopPackage(root = repoRoot, options = {}) {
  const {
    platform = process.platform,
    currentPlatform = process.platform,
    currentArch = process.arch,
    arch = process.arch,
    nodeVersion = process.version,
    verifyFFmpeg = verifyDesktopFFmpeg,
    resolveFFmpeg = resolveDesktopFFmpegPath,
    runStep = runPrepareStep,
    exit = process.exit,
  } = options
  console.log('[prepare-desktop] Preparing desktop package prerequisites')
  console.log(`[prepare-desktop] Platform: ${platform} ${arch}`)
  console.log(`[prepare-desktop] Node: ${nodeVersion}`)
  console.log(`[prepare-desktop] Repository root: ${root}`)

  const ffmpegPath = resolveFFmpeg(root, platform, arch)
  const runnableOnCurrentMachine = platform === currentPlatform && arch === currentArch
  const ffmpegError = verifyFFmpeg(ffmpegPath, root, undefined, undefined, { arch, runCheck: runnableOnCurrentMachine })
  if (ffmpegError) {
    const crossTarget = !runnableOnCurrentMachine
    const ffmpegBinary = desktopFFmpegBinaryName(platform)
    console.error('[prepare-desktop] Missing desktop ffmpeg prerequisite.')
    console.error(ffmpegError)
    console.error('[prepare-desktop] Stage a redistributable binary with:')
    console.error(`[prepare-desktop]   MOVSCRIPT_FFMPEG_BIN=/path/to/${ffmpegBinary} \\`)
    console.error('[prepare-desktop]   MOVSCRIPT_FFMPEG_SOURCE_URL=$ACTUAL_FFMPEG_RELEASE_URL \\')
    console.error('[prepare-desktop]   MOVSCRIPT_FFMPEG_LICENSE=LGPL-2.1-or-later \\')
    if (crossTarget) {
      console.error("[prepare-desktop]   MOVSCRIPT_FFMPEG_VERSION='ffmpeg version ...' \\")
    }
    console.error(`[prepare-desktop]   pnpm run release -- stage-ffmpeg --platform=${platform} --arch=${arch}`)
    exit(1)
    return false
  }

  const buildEnv = {
    ...process.env,
    GOOS: goosForDesktopPlatform(platform),
    GOARCH: goarchForDesktopArch(arch),
  }
  const targetSteps = [
    ...prepareDesktopSteps.slice(0, 4),
    ['Build data-service binary', pnpmCommand, ['--filter', '@movscript/data-service', 'build'], { env: buildEnv }],
    ...(platform === 'darwin'
      ? [
          ['Prepare native macOS tray helper directory', 'mkdir', ['-p', 'apps/desktop/build/native']],
          ['Build native macOS tray helper', 'swiftc', [
            '-target',
            swiftTargetForDesktopArch(arch),
            'apps/desktop/native/macTrayStatusItem.swift',
            '-o',
            'apps/desktop/build/native/movscript-native-tray',
          ]],
        ]
      : []),
    ...prepareDesktopSteps.slice(4),
  ]

  for (const [stepName, command, commandArgs, stepOptions = {}] of targetSteps) {
    runStep(stepName, command, commandArgs, { cwd: root, ...stepOptions })
  }

  prepareProviderPluginResources(root, { log: (message) => console.log(`[prepare-desktop] ${message}`) })
  console.log('[prepare-desktop] Desktop package prerequisites are ready')
  return true
}

function swiftTargetForDesktopArch(arch) {
  if (arch === 'arm64') return 'arm64-apple-macosx11.0'
  if (arch === 'x64') return 'x86_64-apple-macosx11.0'
  throw new Error(`Unsupported macOS Swift helper arch: ${arch}`)
}

export function runPrepareStep(stepName, command, args, options = {}) {
  const startedAt = Date.now()
  console.log(`[prepare-desktop] Starting: ${stepName}`)
  console.log(`[prepare-desktop] Command: ${command} ${args.join(' ')}`)

  const { cwd = repoRoot, ...spawnOptions } = options
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: isWindows,
    ...spawnOptions,
  })

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)

  if (result.error) {
    console.error(`[prepare-desktop] Failed to start: ${stepName}`)
    console.error(`[prepare-desktop] Error: ${result.error.message}`)
    console.error(`[prepare-desktop] Code: ${result.error.code ?? 'unknown'}`)
    process.exit(1)
  }

  if (result.status !== 0 || result.signal) {
    console.error(`[prepare-desktop] Failed: ${stepName}`)
    console.error(`[prepare-desktop] Exit status: ${result.status ?? 'none'}`)
    console.error(`[prepare-desktop] Signal: ${result.signal ?? 'none'}`)
    console.error(`[prepare-desktop] Elapsed: ${elapsedSeconds}s`)
    process.exit(result.status ?? 1)
  }

  console.log(`[prepare-desktop] Finished: ${stepName} (${elapsedSeconds}s)`)
}

export function runCollectArtifactsCli(root = repoRoot, env = process.env, options = {}) {
  const {
    collect = collectArtifacts,
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options
  try {
    const app = parseCollectAppArg(options.args ?? [], 'desktop')
    const result = collect(root, { app, env })
    log(`Collected ${result.copied.length} release artifact(s) in ${result.outputDir}`)
    for (const path of result.copied) log(`- ${path}`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function collectArtifacts(root = repoRoot, options = {}) {
  const {
    app = 'desktop',
    env = process.env,
    outputDir = resolve(root, 'release-artifacts'),
    sources = defaultArtifactSources(root, env, app),
    artifactPrefix = normalizeArtifactPrefix(env.MOVSCRIPT_ARTIFACT_PREFIX?.trim() || ''),
  } = options

  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })

  const seen = new Map()
  const copied = []
  for (const source of sources) {
    if (!existsSync(source)) continue
    for (const name of readdirSync(source)) {
      if (!isReleaseAsset(name)) continue
      const from = resolve(source, name)
      if (!statSync(from).isFile()) continue
      const targetName = artifactPrefix && !isUpdateMetadata(name) ? `${artifactPrefix}-${basename(name)}` : basename(name)
      const previous = seen.get(targetName)
      if (previous) {
        throw new Error([
          `Duplicate release artifact name: ${targetName}`,
          `First: ${previous}`,
          `Second: ${from}`,
        ].join('\n'))
      }
      seen.set(targetName, from)
      const to = resolve(outputDir, targetName)
      if (artifactPrefix && isUpdateMetadata(name)) {
        const rewritten = rewriteUpdateMetadataArtifactNames(readFileSync(from, 'utf8'), artifactPrefix)
        writeFileSync(to, appendUpdateMetadataPolicy(rewritten, env), 'utf8')
      } else {
        copyFileSync(from, to)
      }
      copied.push(to)
    }
  }

  if (copied.length === 0) {
    throw new Error('No release artifacts were collected.')
  }

  const lines = copied
    .sort()
    .map((path) => `${sha256(path)}  ${basename(path)}`)
  const checksumPath = resolve(outputDir, artifactPrefix ? `${artifactPrefix}-SHA256SUMS.txt` : 'SHA256SUMS.txt')
  writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8')

  return { copied, checksumPath, outputDir }
}

export function defaultArtifactSources(root = repoRoot, env = process.env, app = 'desktop') {
  if (app === 'all') return [
    resolve(root, 'apps/desktop/release'),
    resolve(root, 'plugins/movscript/release'),
  ]
  if (app === 'plugin') return [resolve(root, 'plugins/movscript/release')]
  return [resolve(root, 'apps/desktop/release')]
}

export function isReleaseAsset(name) {
  if (name.endsWith('.blockmap')) return true
  if ((name.endsWith('.yml') || name.endsWith('.yaml')) && name.startsWith('latest')) return true
  for (const ext of releaseAssetExtensions) {
    if (name.endsWith(ext)) return true
  }
  return false
}

function isUpdateMetadata(name) {
  return [...updateMetadataExtensions].some((extension) => name.endsWith(extension))
}

export function rewriteUpdateMetadataArtifactNames(content, artifactPrefix) {
  const prefix = normalizeArtifactPrefix(artifactPrefix)
  if (!prefix) return content
  return content.replace(/^(\s*(?:-\s*)?(?:url|path):\s*)(["']?)([^"'\r\n]+)(\2)(\s*)$/gm, (match, before, quote, value, afterQuote, trailing) => {
    const artifactName = String(value).trim()
    if (!artifactName || artifactName.includes('/') || artifactName.startsWith(`${prefix}-`)) return match
    if (!isReleaseAsset(artifactName) && !artifactName.endsWith('.blockmap')) return match
    return `${before}${quote}${prefix}-${artifactName}${afterQuote}${trailing}`
  })
}

export function appendUpdateMetadataPolicy(content, env = process.env) {
  const fields = [
    ['policy', updateMetadataPolicyValue(env.MOVSCRIPT_APP_UPDATE_POLICY)],
    ['severity', updateMetadataSeverityValue(env.MOVSCRIPT_APP_UPDATE_SEVERITY)],
    ['minSupportedVersion', cleanUpdateMetadataScalar(env.MOVSCRIPT_APP_UPDATE_MIN_SUPPORTED_VERSION)],
    ['deadlineAt', cleanUpdateMetadataScalar(env.MOVSCRIPT_APP_UPDATE_DEADLINE_AT)],
    ['policyTitle', cleanUpdateMetadataScalar(env.MOVSCRIPT_APP_UPDATE_POLICY_TITLE)],
    ['policyMessage', cleanUpdateMetadataScalar(env.MOVSCRIPT_APP_UPDATE_POLICY_MESSAGE)],
  ].filter((entry) => entry[1])

  if (fields.length === 0) return content
  const existing = new Set(content.split(/\r?\n/).map((line) => line.match(/^([A-Za-z][A-Za-z0-9]*):/)?.[1]).filter(Boolean))
  const additions = fields
    .filter(([key]) => !existing.has(key))
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  if (additions.length === 0) return content
  return `${content.replace(/\s*$/, '\n')}${additions.join('\n')}\n`
}

function updateMetadataPolicyValue(value) {
  const normalized = cleanUpdateMetadataScalar(value)
  if (!normalized) return ''
  if (normalized !== 'optional' && normalized !== 'required') {
    throw new Error('MOVSCRIPT_APP_UPDATE_POLICY must be optional or required')
  }
  return normalized
}

function updateMetadataSeverityValue(value) {
  const normalized = cleanUpdateMetadataScalar(value)
  if (!normalized) return ''
  if (!['normal', 'security', 'data-loss', 'startup-blocker'].includes(normalized)) {
    throw new Error('MOVSCRIPT_APP_UPDATE_SEVERITY must be normal, security, data-loss, or startup-blocker')
  }
  return normalized
}

function cleanUpdateMetadataScalar(value) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/[\r\n]+/g, ' ')
}

export function normalizeArtifactPrefix(value) {
  if (!value) return ''
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error('MOVSCRIPT_ARTIFACT_PREFIX may only contain letters, numbers, dot, underscore, and dash')
  }
  if (value === '.' || value === '..' || value.includes('..')) {
    throw new Error('MOVSCRIPT_ARTIFACT_PREFIX must not contain path traversal segments')
  }
  return value
}

export function sha256(path) {
  return sha256File(path)
}

export function dmgBuilderEnv(env) {
  const nextEnv = { ...env }
  normalizeOptionalBuilderEnv(nextEnv, 'PYTHON_PATH')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_LINK')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_NAME')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_KEY_PASSWORD')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_INSTALLER_LINK')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_INSTALLER_KEY_PASSWORD')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_KEYCHAIN')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_ID')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_APP_SPECIFIC_PASSWORD')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_TEAM_ID')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_API_KEY')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_API_KEY_ID')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_API_ISSUER')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_KEYCHAIN')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_KEYCHAIN_PROFILE')
  return nextEnv
}

export function desktopPackageEnv(env = process.env, signingMode = parseDesktopSigningModeArg([])) {
  const nextEnv = dmgBuilderEnv(env)
  nextEnv.MOVSCRIPT_RELEASE_SIGNING_MODE = signingMode
  if (signingMode === 'unsigned') {
    for (const name of [
      'CSC_LINK',
      'CSC_NAME',
      'CSC_KEY_PASSWORD',
      'CSC_INSTALLER_LINK',
      'CSC_INSTALLER_KEY_PASSWORD',
      'CSC_KEYCHAIN',
      'APPLE_ID',
      'APPLE_APP_SPECIFIC_PASSWORD',
      'APPLE_TEAM_ID',
      'APPLE_API_KEY',
      'APPLE_API_KEY_ID',
      'APPLE_API_ISSUER',
      'APPLE_KEYCHAIN',
      'APPLE_KEYCHAIN_PROFILE',
    ]) {
      delete nextEnv[name]
    }
    nextEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  }
  return nextEnv
}

function desktopArtifactStepsForTarget(root, target, plan, pnpm = 'pnpm') {
  const stageDir = desktopPackageStageDir(root)
  const electronBuilder = electronBuilderBin(root)
  const stagedBuilderArgs = desktopStagedBuilderArgs(root)
  if (target.platform === 'darwin' && plan.signingMode === 'unsigned') {
    return unsignedMacOSArtifactSteps(root, target.arch, electronBuilder, stageDir, stagedBuilderArgs)
  }
  return [
    ['Build desktop artifact', electronBuilder, ['--projectDir', stageDir, ...plan.builderArgs, ...stagedBuilderArgs]],
  ]
}

function unsignedMacOSArtifactSteps(root, arch, electronBuilder, stageDir, stagedBuilderArgs) {
  const appDir = macAppDirForArch(root, arch)
  const unsignedBuilderArgs = signingBuilderArgsForTarget('darwin', 'unsigned')
  const dirArgs = ['--mac', '--dir', `--${arch}`, '--publish', 'never', ...unsignedBuilderArgs]
  const dmgArgs = [...desktopBuilderArgsForTarget('darwin', arch), '--prepackaged', appDir, ...unsignedBuilderArgs]
  return [
    ['Build unsigned macOS app directory', electronBuilder, ['--projectDir', stageDir, ...dirArgs, ...stagedBuilderArgs]],
    ['Clear unsigned macOS app extended attributes before signing', 'xattr', ['-cr', appDir]],
    ['Ad-hoc sign unsigned macOS app', 'node', ['scripts/release/sign-macos-app.mjs', appDir]],
    ['Clear unsigned macOS app extended attributes after signing', 'xattr', ['-cr', appDir]],
    ['Verify unsigned macOS app ad-hoc signature', 'codesign', ['--verify', '--deep', '--strict', '--verbose=2', appDir]],
    ['Build unsigned macOS DMG from signed app', electronBuilder, ['--projectDir', stageDir, ...dmgArgs, ...stagedBuilderArgs]],
  ]
}

function macAppDirForArch(root, arch) {
  return resolve(root, 'apps/desktop/release', arch === 'arm64' ? 'mac-arm64/Movscript.app' : 'mac/Movscript.app')
}

export function stageDesktopPackageProject(root = repoRoot, options = {}) {
  const {
    env = process.env,
    log = console.log,
    pnpm = 'pnpm',
    spawn = spawnSync,
  } = options
  const stageDir = desktopPackageStageDir(root)
  const releaseDir = resolve(root, 'apps/desktop/release')
  rmSync(stageDir, { recursive: true, force: true })
  rmSync(releaseDir, { recursive: true, force: true })
  prepareProviderPluginResources(root, { log: (message) => log(`[package-desktop] ${message}`) })
  log(`[package-desktop] Stage desktop package project: ${stageDir}`)
  const deployResult = spawn(pnpm, ['--config.inject-workspace-packages=true', '--filter', '@movscript/desktop', 'deploy', '--prod', stageDir], releaseSpawnOptions(env))
  if (deployResult.error) throw deployResult.error
  if (deployResult.status !== 0 || deployResult.signal) {
    throw new Error(`Desktop package staging failed with status ${deployResult.status ?? 'none'} signal=${deployResult.signal ?? 'none'}`)
  }
  const desktopBuildDir = resolve(root, 'apps/desktop/build')
  const stagedBuildDir = resolve(stageDir, 'build')
  if (existsSync(desktopBuildDir)) {
    cpSync(desktopBuildDir, stagedBuildDir, { recursive: true })
  } else {
    mkdirSync(stagedBuildDir, { recursive: true })
  }
  writeStagedElectronBuilderConfig(root, stageDir)
  return { stageDir, releaseDir }
}

function desktopPackageStageDir(root) {
  return resolve(root, 'apps/desktop/.package-stage')
}

export function desktopStagedBuilderArgs(root) {
  return [
    `-c.electronVersion=${resolveDesktopElectronVersion(root)}`,
    '-c.npmRebuild=false',
  ]
}

function electronBuilderBin(root) {
  return resolve(root, 'apps/desktop/node_modules/.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
}

function resolveDesktopElectronVersion(root) {
  const electronPackagePath = resolve(root, 'apps/desktop/node_modules/electron/package.json')
  if (existsSync(electronPackagePath)) {
    const version = readJSONFile(electronPackagePath).version
    if (version) return String(version)
  }
  const packageVersion = readJSONFile(resolve(root, 'apps/desktop/package.json')).devDependencies?.electron
  const fixed = typeof packageVersion === 'string' ? packageVersion.match(/^\d+\.\d+\.\d+$/)?.[0] : undefined
  if (fixed) return fixed
  throw new Error('Unable to resolve fixed Electron version for staged desktop package')
}

function writeStagedElectronBuilderConfig(root, stageDir) {
  const configPath = resolve(stageDir, 'electron-builder.yml')
  let config = readFileSync(configPath, 'utf8')
  const replacements = new Map([
    ['../../assets/logo.png', resolve(root, 'assets/logo.png')],
    ['../../assets/trayTemplate.png', resolve(root, 'assets/trayTemplate.png')],
    ['../../assets/trayTemplate@2x.png', resolve(root, 'assets/trayTemplate@2x.png')],
    ['../../surface/admin/dist', resolve(root, 'surface/admin/dist')],
    ['../../plugins/movscript', resolve(root, 'plugins/movscript')],
    ['vendor/ffmpeg', resolve(root, 'apps/desktop/vendor/ffmpeg')],
    ['build/entitlements.mac.plist', resolve(stageDir, 'build/entitlements.mac.plist')],
    ['build/entitlements.mac.inherit.plist', resolve(stageDir, 'build/entitlements.mac.inherit.plist')],
  ])
  for (const [from, to] of replacements) config = config.replaceAll(from, to)
  config = config.replace(/(\n\s*output:\s*)release(\s*\n)/, `$1${JSON.stringify(resolve(root, 'apps/desktop/release'))}$2`)
  writeFileSync(configPath, config, 'utf8')
}

function normalizeOptionalBuilderEnv(env, name) {
  const value = typeof env[name] === 'string' ? env[name].trim() : ''
  if (value) {
    env[name] = value
  } else {
    delete env[name]
  }
}

export function patchDmgBuilderAPFSAliasCompatibility(root = repoRoot, log = console.log) {
  const corePath = resolveDmgBuilderCorePath(root)
  const source = readFileSync(corePath, 'utf8')
  const original = [
    '    elif background_file:',
    '      alias = Alias.for_file(background_file)',
    '      background_bmk = Bookmark.for_file(background_file)',
    '',
    "      icvp['backgroundType'] = 2",
    "      icvp['backgroundImageAlias'] = biplist.Data(alias.to_bytes())",
  ].join('\n')
  const patched = [
    '    elif background_file:',
    '      background_bmk = Bookmark.for_file(background_file)',
    '',
    "      icvp['backgroundType'] = 2",
    '      try:',
    '        alias = Alias.for_file(background_file)',
    "        icvp['backgroundImageAlias'] = biplist.Data(alias.to_bytes())",
    '      except Exception:',
    '        pass',
  ].join('\n')
  if (source.includes(patched)) return
  if (!source.includes(original)) {
    throw new Error(`Unable to patch dmg-builder APFS alias compatibility: unexpected core.py at ${corePath}`)
  }
  writeFileSync(corePath, source.replace(original, patched), 'utf8')
  log(`[package-desktop] Patched dmg-builder APFS background alias compatibility: ${corePath}`)
}

export function verifyMacOSDMGArtifacts(root = repoRoot, options = {}) {
  const {
    arch = process.arch,
    env = process.env,
    log = console.log,
    spawn = spawnSync,
  } = options
  const releaseDir = resolve(root, 'apps/desktop/release')
  const appDir = macAppDirForArch(root, arch)
  const dmgPath = latestDMG(releaseDir)
  if (env.MOVSCRIPT_RELEASE_SIGNING_MODE === 'signed') {
    verifyMacOSDeveloperIDAppSignature(root, appDir, { env, log, spawn })
    verifyMacOSSignedDMGIfPresent(root, dmgPath, { log, spawn })
  } else {
    verifyMacOSAppCodeSignature(root, appDir, { log, spawn })
  }
  runCheckedTool('Verify DMG checksum', 'hdiutil', ['verify', dmgPath], { cwd: root, log, spawn })
  verifyMountedDMG(root, dmgPath, { log, spawn })
}

function verifyMacOSSignedDMGIfPresent(root, dmgPath, options = {}) {
  const {
    log = console.log,
    spawn = spawnSync,
  } = options
  const signatureResult = runCheckedTool('Check signed DMG code signature', 'codesign', [
    '--verify',
    '--verbose=2',
    dmgPath,
  ], { cwd: root, log, spawn, allowFailure: true })
  if (signatureResult.status !== 0 || signatureResult.signal || signatureResult.error) {
    log('[package-desktop] DMG has no standalone code signature; skipping DMG Gatekeeper assessment')
    return
  }
  runCheckedTool('Verify signed DMG Gatekeeper acceptance', 'spctl', [
    '-a',
    '-vv',
    '--type',
    'open',
    '--context',
    'context:primary-signature',
    dmgPath,
  ], { cwd: root, log, spawn })
  runCheckedTool('Validate signed DMG notarization ticket', 'xcrun', ['stapler', 'validate', dmgPath], { cwd: root, log, spawn })
}

function verifyMacOSDeveloperIDAppSignature(root, appDir, options = {}) {
  const {
    env = process.env,
    log = console.log,
    spawn = spawnSync,
  } = options
  runCheckedTool('Verify packaged app Developer ID code signature', 'codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    appDir,
  ], { cwd: root, log, spawn })
  log('[package-desktop] Inspect packaged app Developer ID signature')
  const result = spawn('codesign', ['-dvvv', appDir], {
    cwd: root,
    encoding: 'utf8',
    shell: isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0 || result.signal) {
    throw new Error(`Inspect packaged app Developer ID signature failed: status=${result.status ?? 'none'} signal=${result.signal ?? 'none'}`)
  }
  const details = `${result.stdout || ''}\n${result.stderr || ''}`
  const expectedTeam = typeof env.APPLE_TEAM_ID === 'string' ? env.APPLE_TEAM_ID.trim() : ''
  if (details.includes('Signature=adhoc') || details.includes('TeamIdentifier=not set')) {
    throw new Error('Packaged macOS app is ad-hoc signed; expected Developer ID Application signing')
  }
  if (!details.includes('Authority=Developer ID Application')) {
    throw new Error('Packaged macOS app is not signed with a Developer ID Application certificate')
  }
  if (expectedTeam && !details.includes(`TeamIdentifier=${expectedTeam}`)) {
    throw new Error(`Packaged macOS app TeamIdentifier does not match APPLE_TEAM_ID (${expectedTeam})`)
  }
}

function verifyMacOSAppCodeSignature(root, appDir, options = {}) {
  const {
    log = console.log,
    spawn = spawnSync,
  } = options
  runCheckedTool('Verify packaged app code signature', 'codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    appDir,
  ], { cwd: root, log, spawn })
}

function resolveDmgBuilderCorePath(root) {
  const desktopRequire = createRequire(resolve(root, 'apps/desktop/package.json'))
  const electronBuilderPackagePath = desktopRequire.resolve('electron-builder/package.json')
  const electronBuilderRequire = createRequire(electronBuilderPackagePath)
  const dmgBuilderPackagePath = electronBuilderRequire.resolve('dmg-builder/package.json')
  return resolve(dirname(dmgBuilderPackagePath), 'vendor/dmgbuild/core.py')
}

function latestDMG(directory) {
  const dmgs = readdirSync(directory)
    .filter((name) => name.endsWith('.dmg'))
    .map((name) => resolve(directory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
  if (dmgs.length === 0) throw new Error(`No DMG was created in ${directory}`)
  return dmgs[0]
}

function verifyMountedDMG(root, dmgPath, options = {}) {
  const {
    log = console.log,
    spawn = spawnSync,
  } = options
  const iconPath = resolve(root, 'apps/desktop/build/icon.icns')
  const mountPoint = mkdtempSync(join(tmpdir(), 'movscript-dmg.'))
  let attached = false
  try {
    runCheckedTool('Attach DMG for mounted app verification', 'hdiutil', [
      'attach',
      '-nobrowse',
      '-readonly',
      '-mountpoint',
      mountPoint,
      dmgPath,
    ], { cwd: root, log, spawn })
    attached = true
    const mountedApp = resolve(mountPoint, 'Movscript.app')
    const mountedIcon = resolve(mountedApp, 'Contents/Resources/icon.icns')
    if (existsSync(iconPath)) {
      const expectedIconHash = sha256File(iconPath)
      const mountedIconHash = sha256File(mountedIcon)
      if (expectedIconHash !== mountedIconHash) {
        throw new Error(`Mounted app icon hash mismatch: expected ${expectedIconHash}, got ${mountedIconHash}`)
      }
      log(`[package-desktop] Mounted app icon OK: ${basename(mountedIcon)}`)
    } else {
      log(`[package-desktop] Skip mounted app icon hash verification; source icon is missing: ${iconPath}`)
    }
  } finally {
    if (attached) spawn('hdiutil', ['detach', mountPoint], { stdio: 'ignore' })
    rmSync(mountPoint, { recursive: true, force: true })
  }
}

function runCheckedTool(label, command, args, options = {}) {
  const {
    allowFailure = false,
    cwd = repoRoot,
    log = console.log,
    spawn = spawnSync,
  } = options
  log(`[package-desktop] ${label}`)
  const result = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    shell: isWindows,
  })
  if (result.error && !allowFailure) throw result.error
  if (!allowFailure && (result.status !== 0 || result.signal)) {
    throw new Error(`${label} failed: status=${result.status ?? 'none'} signal=${result.signal ?? 'none'}`)
  }
  return result
}

function runStep(label, command, commandArgs, { spawn, log, logError, exit }) {
  log(`[release-workflow] ${label}`)
  const result = spawn(command, commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) {
    logError(result.error.message)
    exit(1)
    return false
  }
  if (result.status !== 0) {
    exit(result.status ?? 1)
    return false
  }
  return true
}

function usage() {
  return `usage: node scripts/release/release-workflow.mjs [check|full|dry-run|package --app <desktop|plugin>|collect --app <desktop|plugin>|${releaseSubcommands().join('|')}]`
}

if (isDirectRun(import.meta.url, process.argv)) {
  runReleaseWorkflowCli(process.argv.slice(2))
}
