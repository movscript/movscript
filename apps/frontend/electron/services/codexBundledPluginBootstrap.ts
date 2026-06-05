import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CODEX_CONFIG_FILE_NAME = 'config.toml'
const MOVSCRIPT_PLUGIN_NAME = 'movscript'
const MOVSCRIPT_BUNDLED_MARKETPLACE_NAME = 'movscript-bundled'
const MOVSCRIPT_PLUGIN_KEY = `${MOVSCRIPT_PLUGIN_NAME}@${MOVSCRIPT_BUNDLED_MARKETPLACE_NAME}`

export type CodexBundledPluginBootstrap = {
  ok: boolean
  marketplaceName: string
  pluginName: string
  pluginKey: string
  pluginSourcePath: string
  marketplaceRoot: string
  installedPluginRoot: string
  version: string
  hash: string
  error?: string
}

export function ensureMovScriptBundledCodexPlugin(input: {
  codexHome: string
  pluginSourcePath?: string
}): CodexBundledPluginBootstrap {
  const codexHome = resolve(input.codexHome)
  const pluginSourcePath = resolveMovScriptCodexPluginSource(input.pluginSourcePath)
  const marketplaceRoot = join(codexHome, '.tmp', 'marketplaces', MOVSCRIPT_BUNDLED_MARKETPLACE_NAME)

  try {
    validateMovScriptCodexPluginSource(pluginSourcePath)
    const version = readMovScriptCodexPluginVersion(pluginSourcePath)
    const marketplacePluginRoot = join(marketplaceRoot, 'plugins', MOVSCRIPT_PLUGIN_NAME)
    const installedPluginRoot = join(
      codexHome,
      'plugins',
      'cache',
      MOVSCRIPT_BUNDLED_MARKETPLACE_NAME,
      MOVSCRIPT_PLUGIN_NAME,
      version,
    )

    replaceDirectory(pluginSourcePath, marketplacePluginRoot)
    writeBundledMarketplaceManifest(marketplaceRoot)
    replaceDirectory(pluginSourcePath, installedPluginRoot)
    ensureBundledPluginCodexConfig({
      codexHome,
      marketplaceRoot,
      pluginKey: MOVSCRIPT_PLUGIN_KEY,
    })

    const hash = hashBundledPluginBootstrap({
      configTomlPath: join(codexHome, CODEX_CONFIG_FILE_NAME),
      marketplaceRoot,
      installedPluginRoot,
      version,
    })
    return {
      ok: true,
      marketplaceName: MOVSCRIPT_BUNDLED_MARKETPLACE_NAME,
      pluginName: MOVSCRIPT_PLUGIN_NAME,
      pluginKey: MOVSCRIPT_PLUGIN_KEY,
      pluginSourcePath,
      marketplaceRoot,
      installedPluginRoot,
      version,
      hash,
    }
  } catch (error) {
    return {
      ok: false,
      marketplaceName: MOVSCRIPT_BUNDLED_MARKETPLACE_NAME,
      pluginName: MOVSCRIPT_PLUGIN_NAME,
      pluginKey: MOVSCRIPT_PLUGIN_KEY,
      pluginSourcePath,
      marketplaceRoot,
      installedPluginRoot: join(
        codexHome,
        'plugins',
        'cache',
        MOVSCRIPT_BUNDLED_MARKETPLACE_NAME,
        MOVSCRIPT_PLUGIN_NAME,
      ),
      version: 'unknown',
      hash: 'error',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function resolveMovScriptCodexPluginSource(explicitPath?: string): string {
  const candidates = [
    explicitPath,
    process.env.MOVSCRIPT_CODEX_PLUGIN_SOURCE,
    process.resourcesPath ? join(process.resourcesPath, 'codex-plugins', MOVSCRIPT_PLUGIN_NAME) : undefined,
    join(process.cwd(), 'plugins', MOVSCRIPT_PLUGIN_NAME),
    join(process.cwd(), '..', '..', 'plugins', MOVSCRIPT_PLUGIN_NAME),
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'plugins', MOVSCRIPT_PLUGIN_NAME),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  const found = candidates.map((candidate) => resolve(candidate)).find((candidate) => existsSync(candidate))
  if (found) return found
  return resolve(candidates[0] ?? join('plugins', MOVSCRIPT_PLUGIN_NAME))
}

function validateMovScriptCodexPluginSource(source: string): void {
  for (const path of [
    join(source, '.codex-plugin', 'plugin.json'),
    join(source, '.mcp.json'),
    join(source, 'skills'),
  ]) {
    if (!existsSync(path)) throw new Error(`MovScript Codex plugin source is missing ${path}`)
  }
  const manifest = JSON.parse(readFileSync(join(source, '.codex-plugin', 'plugin.json'), 'utf8'))
  if (manifest?.name !== MOVSCRIPT_PLUGIN_NAME) {
    throw new Error(`MovScript Codex plugin manifest must declare name "${MOVSCRIPT_PLUGIN_NAME}"`)
  }
}

function readMovScriptCodexPluginVersion(source: string): string {
  const manifest = JSON.parse(readFileSync(join(source, '.codex-plugin', 'plugin.json'), 'utf8'))
  const version = typeof manifest?.version === 'string' && manifest.version.trim()
    ? manifest.version.trim()
    : 'local'
  if (!/^[A-Za-z0-9._+-]+$/.test(version) || version === '.' || version === '..') {
    throw new Error(`MovScript Codex plugin version is not a valid cache segment: ${version}`)
  }
  return version
}

function writeBundledMarketplaceManifest(marketplaceRoot: string): void {
  const manifestPath = join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json')
  mkdirSync(dirname(manifestPath), { recursive: true })
  writeTextFileAtomic(manifestPath, `${JSON.stringify({
    name: MOVSCRIPT_BUNDLED_MARKETPLACE_NAME,
    interface: {
      displayName: 'MovScript Bundled',
    },
    plugins: [
      {
        name: MOVSCRIPT_PLUGIN_NAME,
        source: {
          source: 'local',
          path: `./plugins/${MOVSCRIPT_PLUGIN_NAME}`,
        },
        policy: {
          installation: 'INSTALLED_BY_DEFAULT',
          authentication: 'ON_USE',
        },
        category: 'Productivity',
      },
    ],
  }, null, 2)}\n`)
}

function ensureBundledPluginCodexConfig(input: {
  codexHome: string
  marketplaceRoot: string
  pluginKey: string
}): void {
  const configPath = join(input.codexHome, CODEX_CONFIG_FILE_NAME)
  const current = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  let next = current
  next = setTomlSectionValue(next, '[features]', /^plugins\s*=/, 'plugins = true')
  next = setTomlSectionValue(
    next,
    `[marketplaces.${MOVSCRIPT_BUNDLED_MARKETPLACE_NAME}]`,
    /^source_type\s*=/,
    'source_type = "local"',
  )
  next = setTomlSectionValue(
    next,
    `[marketplaces.${MOVSCRIPT_BUNDLED_MARKETPLACE_NAME}]`,
    /^source\s*=/,
    `source = ${tomlString(input.marketplaceRoot)}`,
  )
  next = setTomlSectionValue(
    next,
    `[plugins.${tomlString(input.pluginKey)}]`,
    /^enabled\s*=/,
    'enabled = true',
  )
  if (next !== current) writeTextFileAtomic(configPath, next)
}

function setTomlSectionValue(
  input: string,
  sectionHeader: string,
  keyPattern: RegExp,
  line: string,
): string {
  const lines = input ? input.replace(/\s+$/g, '').split('\n') : []
  const sectionPattern = sectionHeaderPattern(sectionHeader)
  let sectionStart = lines.findIndex((item) => sectionPattern.test(item))
  if (sectionStart < 0) {
    if (lines.length > 0) lines.push('')
    lines.push(sectionHeader, line)
    return `${lines.join('\n')}\n`
  }

  let sectionEnd = lines.length
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[.*]\s*$/.test(lines[index])) {
      sectionEnd = index
      break
    }
  }

  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    if (keyPattern.test(lines[index].trim())) {
      lines[index] = line
      return `${lines.join('\n')}\n`
    }
  }

  lines.splice(sectionEnd, 0, line)
  return `${lines.join('\n')}\n`
}

function sectionHeaderPattern(sectionHeader: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(sectionHeader)}\\s*$`)
}

function replaceDirectory(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true })
  const tmp = `${destination}.${process.pid}.${Date.now()}.tmp`
  rmSync(tmp, { recursive: true, force: true })
  cpSync(source, tmp, {
    recursive: true,
    dereference: true,
    filter: (path) => !/[/\\](node_modules|dist)([/\\]|$)/.test(path),
  })
  rmSync(destination, { recursive: true, force: true })
  renameSync(tmp, destination)
}

function hashBundledPluginBootstrap(input: {
  configTomlPath: string
  marketplaceRoot: string
  installedPluginRoot: string
  version: string
}): string {
  const hash = createHash('sha256')
  hash.update(input.version)
  hash.update('\0')
  hash.update(stableCodexConfigHashContent(readIfExists(input.configTomlPath)))
  hash.update('\0')
  hash.update(readIfExists(join(input.marketplaceRoot, '.agents', 'plugins', 'marketplace.json')))
  hash.update('\0')
  hash.update(readIfExists(join(input.installedPluginRoot, '.codex-plugin', 'plugin.json')))
  hash.update('\0')
  hash.update(readIfExists(join(input.installedPluginRoot, '.mcp.json')))
  return hash.digest('hex')
}

function stableCodexConfigHashContent(configToml: string): string {
  return configToml
    .split(/\r?\n/)
    .filter((line) => !/^# Generated at: /.test(line))
    .join('\n')
}

function readIfExists(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function writeTextFileAtomic(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, content, 'utf8')
  renameSync(tmpPath, filePath)
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
