#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pluginName = 'movscript'
const defaultMcpEndpoint = 'http://127.0.0.1:18765/mcp'

const options = parseArgs(process.argv.slice(2))
const rawHomeDir = options.home ?? process.env.HOME ?? process.env.USERPROFILE
if (!rawHomeDir) fail('Could not resolve a home directory. Pass --home <dir>.')
const homeDir = resolve(rawHomeDir)
if (homeDir === '/') fail('Refusing to use / as the home directory. Pass --home <dir>.')

const codexHome = resolve(options.codexHome ?? process.env.CODEX_HOME ?? join(homeDir, '.codex'))
const pluginSource = resolve(options.pluginSource ?? join(repoRoot, 'plugins', pluginName))
const marketplacePath = resolve(options.marketplacePath ?? join(homeDir, '.agents', 'plugins', 'marketplace.json'))
const marketplaceRoot = marketplaceRootForPath(marketplacePath)
const pluginsRoot = resolve(options.pluginsRoot ?? join(marketplaceRoot, 'plugins'))
const pluginDest = join(pluginsRoot, pluginName)
const codexBin = options.codexBin ?? 'codex'

validatePluginSource(pluginSource)
installPluginSource(pluginSource, pluginDest, options)
const marketplaceName = upsertPersonalMarketplace(marketplacePath, pluginName)
ensureCodexPluginsFeature(codexHome)

if (!options.noAdd) {
  runCodexPluginAdd({
    codexBin,
    codexHome,
    homeDir,
    pluginSelector: `${pluginName}@${marketplaceName}`,
  })
}

console.info(`MovScript Codex plugin source: ${pluginDest}`)
console.info(`MovScript Codex marketplace: ${marketplacePath}`)
console.info(`MovScript Codex home: ${codexHome}`)
console.info(`MovScript MCP transport: ${readPluginMcpTransport(pluginDest) ?? `http ${defaultMcpEndpoint}`}`)
console.info(`MovScript Desktop MCP endpoint used by bridge: ${process.env.MOVSCRIPT_MCP_ENDPOINT || defaultMcpEndpoint}`)
console.info('Start MovScript Desktop before using workspace tools so the bridge can reach the frontend MCP server.')

function parseArgs(args) {
  const parsed = {
    copy: false,
    force: false,
    noAdd: false,
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
    if (arg === '--copy') {
      parsed.copy = true
      continue
    }
    if (arg === '--force') {
      parsed.force = true
      continue
    }
    if (arg === '--no-add') {
      parsed.noAdd = true
      continue
    }
    const valueFlags = new Set([
      '--home',
      '--codex-home',
      '--plugin-source',
      '--plugins-root',
      '--marketplace-path',
      '--codex-bin',
    ])
    if (valueFlags.has(arg)) {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) fail(`${arg} requires a value`)
      index += 1
      const key = arg.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
      parsed[key] = value
      continue
    }
    fail(`Unknown option: ${arg}`)
  }
  return parsed
}

function printHelp() {
  console.log(`Install the MovScript Codex plugin into a local Codex environment.

Usage:
  node scripts/install-codex-plugin.mjs [options]

Options:
  --home <dir>              User home for the personal marketplace. Defaults to HOME.
  --codex-home <dir>        Codex home. Defaults to CODEX_HOME or <home>/.codex.
  --plugin-source <dir>     Source plugin directory. Defaults to ./plugins/movscript.
  --plugins-root <dir>      Personal plugin root. Defaults to <home>/plugins.
  --marketplace-path <file> Personal marketplace file. Defaults to <home>/.agents/plugins/marketplace.json.
  --codex-bin <bin>         Codex executable. Defaults to codex.
  --copy                    Copy the plugin source instead of symlinking it.
  --force                   Replace an existing <plugins-root>/movscript entry.
  --no-add                  Only write plugin source, marketplace, and Codex config; skip codex plugin add.
`)
}

function validatePluginSource(source) {
  const manifestPath = join(source, '.codex-plugin', 'plugin.json')
  const mcpPath = join(source, '.mcp.json')
  const skillPath = join(source, 'skills', 'workspace', 'SKILL.md')
  for (const path of [manifestPath, mcpPath, skillPath]) {
    if (!existsSync(path)) fail(`Required plugin file is missing: ${path}`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== pluginName) {
    fail(`${manifestPath} must declare "name": "${pluginName}"`)
  }
  const mcpTransport = readPluginMcpTransport(source)
  if (!mcpTransport) fail(`${mcpPath} must declare mcpServers.movscript_workspace.command or .url`)
}

function readPluginMcpTransport(source) {
  const mcpPath = join(source, '.mcp.json')
  if (!existsSync(mcpPath)) return undefined
  const config = JSON.parse(readFileSync(mcpPath, 'utf8'))
  const server = config?.mcpServers?.movscript_workspace
  const command = server?.command
  if (typeof command === 'string' && command.trim()) {
    const args = Array.isArray(server.args) ? server.args.filter((arg) => typeof arg === 'string') : []
    return ['stdio', command.trim(), ...args].join(' ')
  }
  const endpoint = server?.url
  return typeof endpoint === 'string' && endpoint.trim() ? `http ${endpoint.trim()}` : undefined
}

function installPluginSource(source, destination, input) {
  mkdirSync(dirname(destination), { recursive: true })
  if (existsSync(destination)) {
    const stat = lstatSync(destination)
    if (samePath(destination, source)) return
    if (!input.force) {
      fail(`${destination} already exists and does not point at ${source}. Re-run with --force to replace it.`)
    }
    rmSync(destination, { recursive: true, force: true })
  }

  if (input.copy) {
    cpSync(source, destination, {
      recursive: true,
      filter: (path) => !path.includes(`${pluginName}/dist`),
    })
    return
  }

  try {
    symlinkSync(source, destination, 'dir')
  } catch (err) {
    console.warn(`Symlink failed (${err.message}); copying plugin source instead.`)
    cpSync(source, destination, { recursive: true })
  }
}

function upsertPersonalMarketplace(path, name) {
  mkdirSync(dirname(path), { recursive: true })
  const marketplace = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : {
        name: 'personal',
        interface: { displayName: 'Personal' },
        plugins: [],
      }
  if (!marketplace || typeof marketplace !== 'object' || Array.isArray(marketplace)) {
    fail(`${path} must contain a JSON object`)
  }
  if (typeof marketplace.name !== 'string' || !marketplace.name.trim()) {
    marketplace.name = 'personal'
  }
  if (!marketplace.interface || typeof marketplace.interface !== 'object' || Array.isArray(marketplace.interface)) {
    marketplace.interface = { displayName: titleCase(marketplace.name) }
  }
  if (!Array.isArray(marketplace.plugins)) marketplace.plugins = []

  const entry = {
    name,
    source: {
      source: 'local',
      path: `./plugins/${name}`,
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL',
    },
    category: 'Productivity',
  }
  const existingIndex = marketplace.plugins.findIndex((plugin) => plugin?.name === name)
  if (existingIndex >= 0) marketplace.plugins[existingIndex] = entry
  else marketplace.plugins.push(entry)

  writeFileSync(path, `${JSON.stringify(marketplace, null, 2)}\n`)
  return marketplace.name
}

function ensureCodexPluginsFeature(path) {
  mkdirSync(path, { recursive: true })
  const configPath = join(path, 'config.toml')
  const current = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  const next = setTomlFeaturePlugins(current)
  if (next !== current) writeFileSync(configPath, next)
}

function setTomlFeaturePlugins(input) {
  const lines = input ? input.replace(/\s+$/g, '').split('\n') : []
  let featuresStart = -1
  let featuresEnd = lines.length
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*\[features]\s*$/.test(lines[index])) {
      featuresStart = index
      continue
    }
    if (featuresStart >= 0 && index > featuresStart && /^\s*\[.*]\s*$/.test(lines[index])) {
      featuresEnd = index
      break
    }
  }
  if (featuresStart < 0) {
    const prefix = lines.length > 0 ? `${lines.join('\n')}\n\n` : ''
    return `${prefix}[features]\nplugins = true\n`
  }

  for (let index = featuresStart + 1; index < featuresEnd; index += 1) {
    if (/^\s*plugins\s*=/.test(lines[index])) {
      lines[index] = 'plugins = true'
      return `${lines.join('\n')}\n`
    }
  }
  lines.splice(featuresEnd, 0, 'plugins = true')
  return `${lines.join('\n')}\n`
}

function runCodexPluginAdd({ codexBin, codexHome, homeDir, pluginSelector }) {
  const result = spawnSync(codexBin, ['plugin', 'add', pluginSelector], {
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      HOME: homeDir,
    },
    encoding: 'utf8',
  })
  if (result.error) fail(`Failed to run ${codexBin}: ${result.error.message}`)
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    fail(`${codexBin} plugin add ${pluginSelector} failed with exit code ${result.status}`)
  }
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

function samePath(left, right) {
  try {
    return realpathSync(left) === realpathSync(right)
  } catch {
    return resolve(left) === resolve(right)
  }
}

function titleCase(value) {
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Personal'
}

function marketplaceRootForPath(path) {
  const pluginsDir = dirname(path)
  const agentsDir = dirname(pluginsDir)
  return dirname(agentsDir)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
