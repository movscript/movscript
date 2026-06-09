#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { chmodSync, rmSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

import {
  desktopAppServerBinaryName,
  desktopAppServerProviders,
  isDirectRun,
  parseDesktopArchArg,
  parseDesktopPlatformArg,
  resolveDesktopAppServerPath,
  verifyDesktopAppServerBinary,
} from './release-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')

if (isDirectRun(import.meta.url)) {
  try {
    stageDesktopAppServerBinaries(repoRoot, process.argv.slice(2), process.env)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

export function stageDesktopAppServerBinaries(root = repoRoot, args = [], env = process.env) {
  const platform = parseDesktopPlatformArg(args, env.MOVSCRIPT_APP_SERVER_PLATFORM || process.platform, 'app-server staging')
  const arch = parseDesktopArchArg(args, env.MOVSCRIPT_APP_SERVER_ARCH || process.arch, 'app-server staging')
  const staged = []
  for (const provider of desktopAppServerProviders) {
    const source = resolveAppServerSource(root, provider, platform, arch, env)
    const target = stageDesktopAppServerBinary({ root, provider, platform, arch, source })
    staged.push({ provider, source, target })
    console.log(`[stage-app-server] Staged ${provider} app-server for ${platform} ${arch}: ${target}`)
  }
  return staged
}

export function stageDesktopAppServerBinary({ root = repoRoot, provider, platform = process.platform, arch = process.arch, source }) {
  if (!provider) throw new Error('app-server staging requires provider')
  if (!source || !existsSync(source)) {
    throw new Error(`app-server source does not exist for ${provider}: ${source || '<empty>'}`)
  }
  if (!statSync(source).isFile()) {
    throw new Error(`app-server source is not a file for ${provider}: ${source}`)
  }
  const target = resolveDesktopAppServerPath(root, provider, platform, arch)
  rmSync(dirname(target), { recursive: true, force: true })
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  if (basename(target) !== 'app-server.exe') chmodSync(target, 0o755)
  const error = verifyDesktopAppServerBinary(target)
  if (error) throw new Error(error)
  return target
}

export function resolveAppServerSource(root = repoRoot, provider, platform = process.platform, arch = process.arch, env = process.env) {
  const providerEnv = `MOVSCRIPT_${provider.toUpperCase().replace(/-/g, '_')}_APP_SERVER_BIN`
  const explicit = env[providerEnv]?.trim() || env.MOVSCRIPT_APP_SERVER_BIN?.trim()
  if (explicit) return explicit

  const candidates = appServerSourceCandidates(root, provider, platform, arch)
  const source = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
  if (source) return source

  throw new Error([
    `Could not find ${provider} app-server binary for ${platform} ${arch}.`,
    `Set ${providerEnv}=/path/to/${desktopAppServerBinaryName(platform)} or build the sibling ${provider}/codex-rs checkout first.`,
    'Checked:',
    ...candidates.map((candidate) => `- ${candidate}`),
  ].join('\n'))
}

export function appServerSourceCandidates(root = repoRoot, provider, platform = process.platform, arch = process.arch) {
  const executableNames = platform === 'win32'
    ? ['app-server.exe', `${provider}-app-server.exe`, 'codex-app-server.exe', `${provider}.exe`, 'codex.exe']
    : ['app-server', `${provider}-app-server`, 'codex-app-server', provider, 'codex']
  const targetDirs = [
    resolve(root, '..', provider, 'codex-rs', 'target', desktopRustTargetTriple(platform, arch), 'debug'),
    resolve(root, '..', provider, 'codex-rs', 'target', 'debug'),
  ]
  return targetDirs.flatMap((dir) => executableNames.map((name) => resolve(dir, name)))
}

function desktopRustTargetTriple(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin'
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin'
  if (platform === 'linux' && arch === 'arm64') return 'aarch64-unknown-linux-gnu'
  if (platform === 'linux' && arch === 'x64') return 'x86_64-unknown-linux-gnu'
  if (platform === 'win32' && arch === 'arm64') return 'aarch64-pc-windows-msvc'
  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc'
  return `${arch}-${platform}`
}
