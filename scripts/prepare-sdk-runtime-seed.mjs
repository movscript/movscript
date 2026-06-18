#!/usr/bin/env node

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = parseArgs(process.argv.slice(2), process.env)
const runtimeDir = resolve(args.output)

rmSync(runtimeDir, { recursive: true, force: true })
mkdirSync(runtimeDir, { recursive: true })
writeFileSync(resolve(runtimeDir, 'package.json'), `${JSON.stringify({
  private: true,
  name: 'movscript-bundled-sdk-runtimes',
  description: 'Bundled MovScript agent SDK runtimes.',
}, null, 2)}\n`)

installPackage(args.codexPackage, args.codexVersion)
installPackage(args.claudePackage, args.claudeVersion)

function installPackage(packageName, packageVersion) {
  const spec = packageVersion ? `${packageName}@${packageVersion}` : packageName
  console.info(`[sdk-runtime-seed] installing ${spec}`)
  const result = spawnSync('npm', ['install', '--prefix', runtimeDir, '--save-exact', spec], {
    cwd: runtimeDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status === 0 && !result.error) return
  const detail = result.error?.message || result.stderr?.trim() || result.stdout?.trim() || `exit status ${result.status ?? 'unknown'}`
  console.error(`[sdk-runtime-seed] failed to install ${spec}\n${detail}`)
  process.exit(result.status ?? 1)
}

function parseArgs(rawArgs, env) {
  const parsed = {
    output: env.MOVSCRIPT_SDK_RUNTIME_SEED_DIR || 'apps/frontend/vendor/sdk-runtimes',
    codexPackage: env.MOVSCRIPT_CODEX_SDK_PACKAGE || '@openai/codex-sdk',
    codexVersion: env.MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION || '0.141.0',
    claudePackage: env.MOVSCRIPT_CLAUDE_SDK_PACKAGE || '@anthropic-ai/claude-agent-sdk',
    claudeVersion: env.MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION || '0.3.181',
  }
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]
    const next = rawArgs[index + 1]
    if (arg === '--output') {
      parsed.output = requiredValue(arg, next)
      index += 1
    } else if (arg === '--codex-package') {
      parsed.codexPackage = requiredValue(arg, next)
      index += 1
    } else if (arg === '--codex-version') {
      parsed.codexVersion = requiredValue(arg, next)
      index += 1
    } else if (arg === '--claude-package') {
      parsed.claudePackage = requiredValue(arg, next)
      index += 1
    } else if (arg === '--claude-version') {
      parsed.claudeVersion = requiredValue(arg, next)
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return parsed
}

function requiredValue(arg, value) {
  if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
  return value
}

function printUsage() {
  console.log(`Usage: node scripts/prepare-sdk-runtime-seed.mjs [options]

Options:
  --output <dir>            Seed output directory. Defaults to apps/frontend/vendor/sdk-runtimes.
  --codex-package <name>    Codex SDK package. Defaults to @openai/codex-sdk.
  --codex-version <ver>     Codex SDK version. Defaults to 0.141.0.
  --claude-package <name>   Claude SDK package. Defaults to @anthropic-ai/claude-agent-sdk.
  --claude-version <ver>    Claude SDK version. Defaults to 0.3.181.
`)
}
