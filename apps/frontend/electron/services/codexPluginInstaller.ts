import { execFile } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { resolveMovScriptBundledPluginSource, validateMovScriptBundledPluginSource } from './movscriptBundledPluginSource'

const execFileAsync = promisify(execFile)

export const MOVSCRIPT_CODEX_MARKETPLACE_NAME = 'movscript-local'
export const MOVSCRIPT_CODEX_PLUGIN_NAME = 'movscript'

export interface CodexPluginInstallPaths {
  marketplaceRoot: string
  marketplacePath: string
  pluginRoot: string
  sourcePluginRoot: string
}

export interface CodexPluginInstallResult {
  paths: CodexPluginInstallPaths
  installCommand: string
}

export interface InstallMovScriptCodexPluginOptions {
  sourcePluginRoot?: string
  marketplaceRoot?: string
  execCodex?: (args: string[]) => Promise<void>
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

export function prepareMovScriptCodexMarketplace(
  options: Pick<InstallMovScriptCodexPluginOptions, 'sourcePluginRoot' | 'marketplaceRoot'> = {},
): CodexPluginInstallPaths {
  const sourcePluginRoot = options.sourcePluginRoot ?? resolveMovScriptBundledPluginSource()
  validateMovScriptBundledPluginSource(sourcePluginRoot)

  const marketplaceRoot = options.marketplaceRoot ?? defaultCodexMarketplaceRoot()
  const pluginRoot = join(marketplaceRoot, 'plugins', MOVSCRIPT_CODEX_PLUGIN_NAME)
  const marketplacePath = join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json')
  mkdirSync(join(marketplaceRoot, 'plugins'), { recursive: true })
  mkdirSync(join(marketplaceRoot, '.agents', 'plugins'), { recursive: true })
  rmSync(pluginRoot, { recursive: true, force: true })
  cpSync(sourcePluginRoot, pluginRoot, { recursive: true })
  rmSync(join(marketplaceRoot, 'marketplace.json'), { force: true })
  writeFileSync(marketplacePath, `${JSON.stringify(codexMarketplaceManifest(), null, 2)}\n`, 'utf8')

  const codexManifestPath = join(pluginRoot, '.codex-plugin', 'plugin.json')
  const codexManifest = JSON.parse(readFileSync(codexManifestPath, 'utf8')) as Record<string, unknown>
  if (codexManifest.name !== MOVSCRIPT_CODEX_PLUGIN_NAME) {
    throw new Error(`MovScript Codex plugin manifest must declare name "${MOVSCRIPT_CODEX_PLUGIN_NAME}"`)
  }

  return {
    marketplaceRoot,
    marketplacePath,
    pluginRoot,
    sourcePluginRoot,
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

function defaultCodexMarketplaceRoot(): string {
  return join(homedir(), '.movscript', 'codex-marketplace')
}

async function runCodexCommand(args: string[]): Promise<void> {
  try {
    await execFileAsync('codex', args, { env: process.env })
  } catch (error) {
    throw new Error(`Failed to run "codex ${args.join(' ')}": ${errorMessage(error)}`)
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
