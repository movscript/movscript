#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const APP_SERVER_EXECUTABLE_PROFILES = {
  mova: {
    compatibilityBinEnvNames: ['MOVSCRIPT_MOVA_BIN'],
    compatibilityHomeEnvNames: ['CODEX_HOME'],
    candidateRootRelativePaths: [
      '../mova/codex-rs/target/debug',
      '../../mova/codex-rs/target/debug',
      '../../../mova/codex-rs/target/debug',
    ],
    candidateBinaryNames: [
      'app-server',
      'mova-app-server',
      ['codex', 'app-server'].join('-'),
      'codex',
    ],
  },
}
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const MOVSCRIPT_PLUGIN_NAME = 'movscript'
const MOVSCRIPT_MARKETPLACE_NAME = 'movscript-bundled'
const MOVSCRIPT_PLUGIN_KEY = `${MOVSCRIPT_PLUGIN_NAME}@${MOVSCRIPT_MARKETPLACE_NAME}`
const WORKSPACE_CONFIG_SCHEMA = 'movscript.workspace-config.v2'
const PROVIDER_CONFIGS_DIR_NAME = 'providers'
const APP_SERVER_PERSONAL_MARKETPLACE_MANIFEST_DIR = ['.agent', 's'].join('')
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function main() {
  const options = parseOptions(process.argv.slice(2).filter((arg) => arg !== '--'))
  const workspaceDir = mkdtempSync(join(tmpdir(), `movscript-${options.provider}-verify-workspace-`))
  const sourceConfigPath = join(workspaceDir, '.movscript', PROVIDER_CONFIGS_DIR_NAME, options.provider, 'config.json')
  const providerHome = join(workspaceDir, '.movscript', defaultManagedProviderHomeDir(options.provider))
  mkdirSync(providerHome, { recursive: true })

  const workspaceConfig = {
    schema: WORKSPACE_CONFIG_SCHEMA,
    updatedAt: new Date().toISOString(),
    modelConfig: {
      apiKind: 'openai_responses',
    },
    providers: {
      [options.provider]: {
        appServer: {
          compatibilityHomeEnvNames: appServerExecutableProfile(options.provider).compatibilityHomeEnvNames ?? [],
        },
        config: { mode: 'customApiKey' },
        auth: {
          mode: 'apiKey',
          apiKey: options.apiKey,
          baseURL: options.baseURL,
        },
      },
    },
  }
  writeJSONAtomic(sourceConfigPath, workspaceConfig)

  const distribution = distributeAppServerConfig({ workspaceDir, providerHome, sourceConfigPath, workspaceConfig, provider: options.provider })
  const bundledPlugin = installBundledAppServerPlugin({
    providerHome,
    pluginSourcePath: options.pluginSource,
  })
  const preflight = preflightDistribution(distribution)
  const profileId = `${options.provider}-movscript-verify`
  logStep('workspace', workspaceDir)
  logStep('provider', options.provider)
  logStep('source config', distribution.sourceConfigPath)
  logStep('provider home', distribution.providerHome)
  logStep('config.toml', distribution.configTomlPath)
  logStep('auth.json', distribution.authJsonPath)
  logStep('bundled plugin', `${bundledPlugin.pluginKey} ${bundledPlugin.version}`)
  logStep('bundled marketplace', bundledPlugin.marketplaceRoot)
  logStep('distribution hash', distribution.hash)
  logStep('preflight', `${preflight.ok ? 'ok' : 'fail'} - ${preflight.detail}`)
  logStep('app-server binary', options.appServerBin)
  if (!preflight.ok) throw new Error(`app-server provider config preflight failed: ${preflight.detail}`)

  const env = launchEnv({ profileId, distribution, inheritedEnv: process.env })
  if (options.skipCliChecks) {
    logStep('provider cli checks', 'skipped')
  } else if (executableKindFromPath(options.appServerBin) === 'cli') {
    const doctor = await runProviderDoctor(options.appServerBin, env)
    assertDoctorCheck(doctor, 'config.load')
    assertDoctorCheck(doctor, 'auth.credentials')
    logStep('provider doctor', 'config.load ok; auth.credentials ok')

    const pluginList = await runProviderPluginList(options.appServerBin, env)
    assertBundledPluginListed(pluginList)
    logStep('provider plugin list', `${MOVSCRIPT_PLUGIN_KEY} installed and enabled`)
  } else {
    logStep('provider cli checks', `skipped for app-server binary ${options.appServerBin}`)
  }

  if (options.skipLaunch) {
    logStep('app-server', 'skipped')
    return
  }

  if (options.transport === 'websocket') {
    const port = await reserveLocalPort()
    const endpoint = `ws://127.0.0.1:${port}`
    await verifyAppServerWebSocketReady(options.appServerBin, endpoint, env)
    logStep('app-server', `ready at ${endpoint}`)
    return
  }

  const smoke = await verifyAppServerStdioReady(options.appServerBin, env, { cwd: workspaceDir })
  logStep('app-server', `ready over stdio as ${smoke.initialize.userAgent ?? 'unknown app-server'}; thread/start created ${smoke.threadId}; thread/list returned ${smoke.threadCount} thread(s); plugin ${smoke.pluginId} exposes ${smoke.movScriptSkillCount} MovScript skill(s)`)
}

function parseOptions(args) {
  const provider = normalizeProvider(valueAfter(args, '--provider') ?? process.env.MOVSCRIPT_APP_SERVER_VERIFY_PROVIDER ?? 'mova')
  return {
    provider,
    skipLaunch: args.includes('--skip-launch'),
    skipCliChecks: args.includes('--skip-cli-checks'),
    transport: normalizeTransport(valueAfter(args, '--transport') ?? process.env.MOVSCRIPT_APP_SERVER_VERIFY_TRANSPORT ?? 'stdio'),
    appServerBin: valueAfter(args, '--app-server-bin') ?? providerDefaultBin(provider),
    apiKey: valueAfter(args, '--api-key') ?? process.env.MOVSCRIPT_APP_SERVER_VERIFY_API_KEY ?? process.env.OPENAI_API_KEY ?? 'sk-test-key',
    baseURL: normalizeBaseURL(valueAfter(args, '--base-url') ?? process.env.MOVSCRIPT_APP_SERVER_VERIFY_BASE_URL ?? DEFAULT_BASE_URL),
    pluginSource: resolve(valueAfter(args, '--plugin-source') ?? process.env.MOVSCRIPT_APP_SERVER_PLUGIN_SOURCE ?? join(repoRoot, 'plugins', MOVSCRIPT_PLUGIN_NAME)),
  }
}

function normalizeProvider(value) {
  const provider = value?.trim().toLowerCase()
  if (provider && /^[a-z0-9][a-z0-9_-]*$/.test(provider)) return provider
  throw new Error(`Unsupported app-server provider: ${value}`)
}

function defaultManagedProviderHomeDir(provider) {
  return `.${provider}`
}

function normalizeTransport(value) {
  const transport = value?.trim().toLowerCase()
  if (transport === 'stdio' || transport === 'websocket') return transport
  throw new Error(`Unsupported app-server transport: ${value}`)
}

function providerDefaultBin(provider) {
  const neutralBin = process.env.MOVSCRIPT_APP_SERVER_BIN?.trim()
  if (neutralBin) return neutralBin
  const providerEnvPrefix = provider.toUpperCase().replace(/-/g, '_')
  const providerBin = process.env[`MOVSCRIPT_${providerEnvPrefix}_APP_SERVER_BIN`]?.trim()
  if (providerBin) return providerBin
  for (const envName of appServerExecutableProfile(provider).compatibilityBinEnvNames ?? []) {
    const compatibilityBin = process.env[envName]?.trim()
    if (compatibilityBin) return compatibilityBin
  }
  return defaultAppServerBin(provider)
}

function defaultAppServerBin(provider) {
  return appServerExecutableCandidates(provider).find((candidate) => existsSync(candidate)) ?? provider
}

function appServerExecutableCandidates(provider) {
  const profile = appServerExecutableProfile(provider)
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const relativeRoots = profile.candidateRootRelativePaths ?? []
  const roots = [
    ...relativeRoots.map((root) => resolve(process.cwd(), root)),
    ...relativeRoots.map((root) => resolve(repoRoot, root)),
    ...relativeRoots.map((root) => resolve(scriptDir, '../../../../', root)),
  ]
  const binaryNames = profile.candidateBinaryNames ?? []
  return roots.flatMap((root) => binaryNames.map((binaryName) => resolve(root, binaryName)))
}

function appServerExecutableProfile(provider) {
  return APP_SERVER_EXECUTABLE_PROFILES[provider] ?? {}
}

function valueAfter(args, name) {
  const index = args.indexOf(name)
  const value = index >= 0 ? args[index + 1] : undefined
  return value?.trim() || undefined
}

function distributeAppServerConfig(input) {
  const auth = input.workspaceConfig.providers[input.provider].auth
  const baseURL = normalizeBaseURL(auth.baseURL || DEFAULT_BASE_URL)
  const distributedAt = new Date().toISOString()
  const configToml = [
    '# Generated by MovScript verify script.',
    `# Source: ${input.sourceConfigPath}`,
    `# Generated at: ${distributedAt}`,
    'model_provider = "movscript"',
    '',
    '[model_providers.movscript]',
    'name = "MovScript managed OpenAI-compatible provider"',
    `base_url = ${JSON.stringify(baseURL)}`,
    'env_key = "OPENAI_API_KEY"',
    'wire_api = "responses"',
    'requires_openai_auth = false',
    'supports_websockets = true',
    '',
  ].join('\n')
  const configTomlPath = join(input.providerHome, 'config.toml')
  const authJsonPath = join(input.providerHome, 'auth.json')
  writeTextAtomic(configTomlPath, configToml)
  writeTextAtomic(authJsonPath, `${JSON.stringify({
    auth_mode: 'apikey',
    OPENAI_API_KEY: auth.apiKey,
    tokens: null,
    last_refresh: null,
  }, null, 2)}\n`)
  const hash = createHash('sha256')
    .update(configToml)
    .update('\0')
    .update(`apiKey:${auth.apiKey}`)
    .digest('hex')
  return {
    ok: true,
    sourceConfigPath: input.sourceConfigPath,
    providerHome: input.providerHome,
    provider: input.provider,
    homeEnvNames: providerHomeEnvNames(input.provider, input.workspaceConfig),
    configTomlPath,
    authJsonPath,
    baseURL,
    apiKind: 'openai_responses',
    apiKeyConfigured: true,
    accountConfigured: true,
    accountSource: 'movscript-account',
    distributedAt,
    hash,
  }
}

function installBundledAppServerPlugin(input) {
  validatePluginSource(input.pluginSourcePath)
  const version = readPluginVersion(input.pluginSourcePath)
  const marketplaceRoot = join(input.providerHome, '.tmp', 'marketplaces', MOVSCRIPT_MARKETPLACE_NAME)
  const marketplacePluginRoot = join(marketplaceRoot, 'plugins', MOVSCRIPT_PLUGIN_NAME)
  const installedPluginRoot = join(input.providerHome, 'plugins', 'cache', MOVSCRIPT_MARKETPLACE_NAME, MOVSCRIPT_PLUGIN_NAME, version)

  replaceDirectory(input.pluginSourcePath, marketplacePluginRoot)
  writeJSONAtomic(join(marketplaceRoot, APP_SERVER_PERSONAL_MARKETPLACE_MANIFEST_DIR, 'plugins', 'marketplace.json'), {
    name: MOVSCRIPT_MARKETPLACE_NAME,
    interface: { displayName: 'MovScript Bundled' },
    plugins: [{
      name: MOVSCRIPT_PLUGIN_NAME,
      source: { source: 'local', path: `./plugins/${MOVSCRIPT_PLUGIN_NAME}` },
      policy: { installation: 'INSTALLED_BY_DEFAULT', authentication: 'ON_USE' },
      category: 'Productivity',
    }],
  })
  replaceDirectory(input.pluginSourcePath, installedPluginRoot)
  ensureBundledPluginConfig(input.providerHome, marketplaceRoot)

  return {
    pluginKey: MOVSCRIPT_PLUGIN_KEY,
    version,
    marketplaceRoot,
    installedPluginRoot,
  }
}

function validatePluginSource(pluginSourcePath) {
  const manifestPath = providerPluginManifestPath(pluginSourcePath)
  for (const path of [
    manifestPath,
    join(pluginSourcePath, '.mcp.json'),
    join(pluginSourcePath, 'skills'),
  ]) {
    if (!existsSync(path)) throw new Error(`MovScript app-server plugin source is missing ${path}`)
  }
}

function readPluginVersion(pluginSourcePath) {
  const manifest = JSON.parse(readFileSync(providerPluginManifestPath(pluginSourcePath), 'utf8'))
  if (manifest.name !== MOVSCRIPT_PLUGIN_NAME) throw new Error(`Expected MovScript plugin name, got ${manifest.name}`)
  return typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version.trim() : 'local'
}

function providerPluginManifestPath(pluginSourcePath) {
  return join(pluginSourcePath, '.provider-plugin', 'plugin.json')
}

function ensureBundledPluginConfig(providerHome, marketplaceRoot) {
  const configPath = join(providerHome, 'config.toml')
  let config = readFileSync(configPath, 'utf8')
  config = setTomlSectionValue(config, '[features]', /^plugins\s*=/, 'plugins = true')
  config = setTomlSectionValue(config, `[marketplaces.${MOVSCRIPT_MARKETPLACE_NAME}]`, /^source_type\s*=/, 'source_type = "local"')
  config = setTomlSectionValue(config, `[marketplaces.${MOVSCRIPT_MARKETPLACE_NAME}]`, /^source\s*=/, `source = ${JSON.stringify(marketplaceRoot)}`)
  config = setTomlSectionValue(config, `[plugins.${JSON.stringify(MOVSCRIPT_PLUGIN_KEY)}]`, /^enabled\s*=/, 'enabled = true')
  writeTextAtomic(configPath, config)
}

function setTomlSectionValue(input, sectionHeader, keyPattern, line) {
  const lines = input ? input.replace(/\s+$/g, '').split('\n') : []
  const sectionPattern = new RegExp(`^\\s*${escapeRegExp(sectionHeader)}\\s*$`)
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

function replaceDirectory(source, destination) {
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

function preflightDistribution(distribution) {
  const configTomlExists = fileExists(distribution.configTomlPath)
  const authJsonExists = fileExists(distribution.authJsonPath)
  const env = launchEnv({ profileId: `${distribution.provider}-movscript-verify`, distribution, inheritedEnv: {} })
  const homeEnvNames = distribution.homeEnvNames
  const spawnEnvReady = Boolean(env.MOVSCRIPT_APP_SERVER_HOME && homeEnvNames.every((name) => env[name]) && env.OPENAI_API_KEY)
  const ok = configTomlExists && authJsonExists && distribution.accountConfigured && spawnEnvReady
  return {
    ok,
    detail: !configTomlExists
      ? 'app-server config.toml has not been distributed.'
      : !distribution.accountConfigured
        ? 'app-server account is not configured in MovScript.'
        : !authJsonExists
          ? 'app-server auth.json has not been distributed.'
          : !spawnEnvReady
            ? 'app-server launch environment is missing provider home or OPENAI_API_KEY.'
            : 'app-server config preflight passed.',
  }
}

function launchEnv({ profileId, distribution, inheritedEnv }) {
  const auth = JSON.parse(readFileSync(distribution.authJsonPath, 'utf8'))
  const env = {
    ...inheritedEnv,
    MOVSCRIPT_APP_SERVER_PROVIDER: distribution.provider,
    MOVSCRIPT_APP_SERVER_HOME: distribution.providerHome,
    OPENAI_API_KEY: auth.OPENAI_API_KEY,
    MOVSCRIPT_APP_SERVER_CONFIG_SOURCE: distribution.sourceConfigPath,
    MOVSCRIPT_APP_SERVER_CONFIG_DISTRIBUTED_AT: distribution.distributedAt,
    MOVSCRIPT_APP_SERVER_PROFILE_ID: profileId,
  }
  for (const homeEnv of distribution.homeEnvNames) env[homeEnv] = distribution.providerHome
  return env
}

function providerHomeEnvNames(provider, workspaceConfig) {
  const providerHomeEnvName = providerHomeEnvNameFor(provider)
  const compatibilityNames = compatibilityHomeEnvNames(provider, workspaceConfig)
    .filter((name) => name !== providerHomeEnvName)
  return [providerHomeEnvName, ...compatibilityNames]
}

function providerHomeEnvNameFor(provider) {
  return `${String(provider || 'mova').trim().toUpperCase().replace(/-/g, '_')}_HOME`
}

function compatibilityHomeEnvNames(provider, workspaceConfig) {
  const providerRecord = workspaceConfig.providers?.[provider]
  const direct = stringList(providerRecord?.compatibilityHomeEnvNames)
  const nested = stringList(providerRecord?.appServer?.compatibilityHomeEnvNames)
  return uniqueEnvNames([...direct, ...nested])
}

function stringList(value) {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
    : []
}

function uniqueEnvNames(values) {
  const names = []
  for (const value of values) {
    const normalized = value.trim().toUpperCase()
    if (!/^[A-Z_][A-Z0-9_]*$/.test(normalized)) continue
    if (!names.includes(normalized)) names.push(normalized)
  }
  return names
}

async function runProviderDoctor(appServerBin, env) {
  const result = await runCommand(appServerBin, ['doctor', '--json'], { env, allowFailure: true })
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`Unable to parse provider doctor JSON: ${error instanceof Error ? error.message : String(error)}\n${result.stdout}`)
  }
}

async function runProviderPluginList(appServerBin, env) {
  const result = await runCommand(appServerBin, ['plugin', 'list', '--json', '--available'], { env, allowFailure: true })
  if (result.code !== 0 && /unexpected argument ['"]--json['"]/.test(result.stderr)) {
    const textResult = await runCommand(appServerBin, ['plugin', 'list'], { env, allowFailure: false })
    return { format: 'text', text: textResult.stdout }
  }
  if (result.code !== 0) {
    throw new Error(`provider plugin list --json --available exited code=${result.code ?? 'null'} signal=${result.signal ?? 'null'}\n${result.stderr || result.stdout}`)
  }
  try {
    return { format: 'json', data: JSON.parse(result.stdout) }
  } catch (error) {
    throw new Error(`Unable to parse provider plugin list JSON: ${error instanceof Error ? error.message : String(error)}\n${result.stdout}`)
  }
}

function assertDoctorCheck(doctor, checkID) {
  const check = recordField(recordField(doctor, 'checks'), checkID)
  if (check?.status !== 'ok') {
    throw new Error(`provider doctor ${checkID} failed: ${JSON.stringify(check ?? null)}`)
  }
}

function assertBundledPluginListed(pluginList) {
  if (pluginList?.format === 'text') {
    if (!pluginList.text.includes(MOVSCRIPT_PLUGIN_NAME) || !pluginList.text.includes(MOVSCRIPT_MARKETPLACE_NAME)) {
      throw new Error(`${MOVSCRIPT_PLUGIN_KEY} was not found in provider plugin list output:\n${pluginList.text}`)
    }
    if (!/installed,\s*enabled/.test(pluginList.text)) {
      throw new Error(`${MOVSCRIPT_PLUGIN_KEY} was listed but not as installed and enabled:\n${pluginList.text}`)
    }
    return
  }
  const pluginListData = pluginList?.data
  const installed = Array.isArray(pluginListData?.installed) ? pluginListData.installed : []
  const plugin = installed.find((item) => item?.pluginId === MOVSCRIPT_PLUGIN_KEY)
  if (!plugin) throw new Error(`${MOVSCRIPT_PLUGIN_KEY} was not listed as an installed app-server plugin`)
  if (plugin.enabled !== true) throw new Error(`${MOVSCRIPT_PLUGIN_KEY} is installed but not enabled`)
  if (plugin.marketplaceName !== MOVSCRIPT_MARKETPLACE_NAME) {
    throw new Error(`${MOVSCRIPT_PLUGIN_KEY} has unexpected marketplace ${plugin.marketplaceName}`)
  }
}

async function verifyAppServerWebSocketReady(appServerBin, endpoint, env) {
  const child = spawn(appServerBin, appServerLaunchArgs(appServerBin, endpoint), {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stderr = []
  const stdout = []
  child.stderr?.on('data', (chunk) => stderr.push(String(chunk)))
  child.stdout?.on('data', (chunk) => stdout.push(String(chunk)))
  try {
    await waitForReady(endpoint, () => child.exitCode !== null)
  } catch (error) {
    const output = [...stdout, ...stderr].join('').trim()
    throw new Error(appServerLaunchFailureMessage(error, output))
  } finally {
    if (child.exitCode === null && !child.killed) child.kill()
  }
}

async function verifyAppServerStdioReady(appServerBin, env, options = {}) {
  const child = spawn(appServerBin, appServerLaunchArgs(appServerBin, 'stdio://'), {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stderr = []
  const stdout = []
  child.stderr?.on('data', (chunk) => stderr.push(String(chunk)))
  try {
    const exchange = createStdioJsonRpcExchange(child, stdout, stderr)
    const initialize = exchange.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'movscript-verify',
          title: 'MovScript Verify',
          version: '0.1.0',
        },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
        },
      },
    })
    const initializeResult = await initialize
    exchange.notify({ jsonrpc: '2.0', method: 'initialized' })
    const initialThreadList = await exchange.request({
      jsonrpc: '2.0',
      id: 2,
      method: 'thread/list',
      params: {
        limit: 5,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        archived: false,
        sourceKinds: [],
      },
    })
    if (!Array.isArray(initialThreadList.data)) {
      throw new Error(`app-server thread/list returned an invalid response: ${JSON.stringify(initialThreadList)}`)
    }
    const threadStart = await exchange.request({
      jsonrpc: '2.0',
      id: 3,
      method: 'thread/start',
      params: {
        cwd: options.cwd,
        threadSource: 'user',
        modelProvider: 'movscript',
      },
    })
    const threadId = threadStart?.thread?.id
    if (typeof threadId !== 'string' || !threadId) {
      throw new Error(`app-server thread/start returned an invalid response: ${JSON.stringify(threadStart)}`)
    }
    const startedThreadList = await exchange.request({
      jsonrpc: '2.0',
      id: 4,
      method: 'thread/list',
      params: {
        limit: 10,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        archived: false,
        sourceKinds: [],
        ...(options.cwd ? { cwd: options.cwd } : {}),
      },
    })
    if (!Array.isArray(startedThreadList.data)) {
      throw new Error(`app-server thread/list after thread/start returned an invalid response: ${JSON.stringify(startedThreadList)}`)
    }
    const pluginList = await exchange.request({
      jsonrpc: '2.0',
      id: 5,
      method: 'plugin/list',
      params: {
        marketplaceKinds: ['local'],
      },
    })
    const plugin = bundledProtocolPlugin(pluginList)
    if (!plugin) {
      throw new Error(`app-server plugin/list did not include enabled ${MOVSCRIPT_PLUGIN_KEY}: ${JSON.stringify(pluginList)}`)
    }
    const skillsList = await exchange.request({
      jsonrpc: '2.0',
      id: 6,
      method: 'skills/list',
      params: {
        cwds: options.cwd ? [options.cwd] : [],
        forceReload: true,
      },
    })
    const movScriptSkills = movScriptSkillNames(skillsList)
    for (const expectedSkill of ['movscript:generation', 'movscript:project', 'movscript:workspace']) {
      if (!movScriptSkills.includes(expectedSkill)) {
        throw new Error(`app-server skills/list did not include ${expectedSkill}: ${JSON.stringify(skillsList)}`)
      }
    }
    return {
      initialize: initializeResult,
      threadId,
      threadCount: startedThreadList.data.length,
      pluginId: plugin.id,
      movScriptSkillCount: movScriptSkills.length,
    }
  } catch (error) {
    const output = [...stdout, ...stderr].join('').trim()
    throw new Error(appServerLaunchFailureMessage(error, output))
  } finally {
    if (child.exitCode === null && !child.killed) child.kill()
  }
}

function bundledProtocolPlugin(pluginList) {
  const marketplaces = Array.isArray(pluginList?.marketplaces) ? pluginList.marketplaces : []
  for (const marketplace of marketplaces) {
    if (marketplace?.name !== MOVSCRIPT_MARKETPLACE_NAME) continue
    const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : []
    const plugin = plugins.find((item) => item?.id === MOVSCRIPT_PLUGIN_KEY)
    if (plugin?.installed === true && plugin?.enabled === true) return plugin
  }
  return undefined
}

function movScriptSkillNames(skillsList) {
  const entries = Array.isArray(skillsList?.data) ? skillsList.data : []
  const names = []
  for (const entry of entries) {
    const skills = Array.isArray(entry?.skills) ? entry.skills : []
    for (const skill of skills) {
      if (typeof skill?.name === 'string' && skill.name.startsWith('movscript:')) names.push(skill.name)
    }
  }
  return Array.from(new Set(names)).sort()
}

function createStdioJsonRpcExchange(child, stdout, stderr) {
  const pending = new Map()
  let buffer = ''
  const cleanup = () => {
    for (const pendingRequest of pending.values()) {
      clearTimeout(pendingRequest.deadline)
    }
    pending.clear()
    child.stdout?.off('data', onStdout)
    child.off('error', onError)
    child.off('exit', onExit)
  }
  const rejectPending = (error) => {
    for (const [id, pendingRequest] of pending) {
      clearTimeout(pendingRequest.deadline)
      pending.delete(id)
      pendingRequest.reject(error)
    }
  }
  const onStdout = (chunk) => {
    const text = String(chunk)
    stdout.push(text)
    buffer += text
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const message = line.endsWith('\r') ? line.slice(0, -1) : line
      if (!message.trim()) continue
      let parsed
      try {
        parsed = JSON.parse(message)
      } catch {
        continue
      }
      if (parsed.id === undefined || parsed.id === null) continue
      const pendingRequest = pending.get(parsed.id)
      if (!pendingRequest) continue
      clearTimeout(pendingRequest.deadline)
      pending.delete(parsed.id)
      if (parsed.error) pendingRequest.reject(new Error(`app-server ${pendingRequest.method} failed: ${JSON.stringify(parsed.error)}`))
      else pendingRequest.resolve(parsed.result ?? {})
    }
  }
  const onError = (error) => {
    rejectPending(error)
    cleanup()
  }
  const onExit = (code, signal) => {
    rejectPending(new Error(`app-server exited before stdio response code=${code ?? 'null'} signal=${signal ?? 'null'}`))
    cleanup()
  }
  child.stdout?.on('data', onStdout)
  child.on('error', onError)
  child.on('exit', onExit)
  return {
    request: (message) => new Promise((resolveResponse, rejectResponse) => {
      const id = message.id
      if (id === undefined || id === null) throw new Error(`JSON-RPC request requires an id: ${JSON.stringify(message)}`)
      const deadline = setTimeout(() => {
        pending.delete(id)
        rejectResponse(new Error(`Timed out waiting for app-server ${message.method} response over stdio`))
      }, 10_000)
      pending.set(id, {
        method: message.method,
        deadline,
        resolve: resolveResponse,
        reject: rejectResponse,
      })
      child.stdin?.write(`${JSON.stringify(message)}\n`)
    }),
    notify: (message) => {
      child.stdin?.write(`${JSON.stringify(message)}\n`)
    },
  }
}

function appServerLaunchFailureMessage(error, output) {
  const message = error instanceof Error ? error.message : String(error)
  const detail = output ? `${message}\n${output}` : message
  if (/listen EPERM|operation not permitted\s+127\.0\.0\.1/i.test(detail)) {
    return `app-server local listen permission denied by this environment.\n${detail}`
  }
  return detail
}

async function waitForReady(endpoint, exited) {
  const readyURL = `${endpoint.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/+$/, '')}/readyz`
  const deadline = Date.now() + 10_000
  let lastError
  while (Date.now() < deadline) {
    if (exited()) throw new Error(`app-server exited before readiness at ${readyURL}`)
    try {
      const response = await fetch(readyURL)
      if (response.ok) return
      lastError = new Error(`readyz returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for app-server at ${readyURL}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

function appServerLaunchArgs(executablePath, endpoint) {
  return executableKindFromPath(executablePath) === 'app-server'
    ? ['--listen', endpoint]
    : ['app-server', '--listen', endpoint]
}

function executableKindFromPath(executablePath) {
  const name = executablePath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  if (name === 'app-server' || name === 'app-server.exe') return 'app-server'
  if (name.endsWith('-app-server') || name.endsWith('-app-server.exe')) return 'app-server'
  return 'cli'
}

async function reserveLocalPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : undefined
      server.close(() => {
        if (typeof port === 'number') resolvePort(port)
        else reject(new Error('Failed to reserve local port'))
      })
    })
  })
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    child.stdout?.on('data', (chunk) => stdout.push(String(chunk)))
    child.stderr?.on('data', (chunk) => stderr.push(String(chunk)))
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      const result = { stdout: stdout.join(''), stderr: stderr.join(''), code, signal }
      if (code === 0 || options.allowFailure) resolve(result)
      else reject(new Error(`${command} ${args.join(' ')} exited code=${code ?? 'null'} signal=${signal ?? 'null'}\n${result.stderr || result.stdout}`))
    })
  })
}

function writeJSONAtomic(filePath, value) {
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function writeTextAtomic(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, content, 'utf8')
  renameSync(tmpPath, filePath)
}

function fileExists(filePath) {
  try {
    readFileSync(filePath)
    return true
  } catch {
    return false
  }
}

function recordField(value, key) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const child = value[key]
  return typeof child === 'object' && child !== null && !Array.isArray(child) ? child : undefined
}

function normalizeBaseURL(value) {
  return value.replace(/\/+$/, '')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function logStep(label, value) {
  console.log(`[verify-app-server] ${label}: ${value}`)
}

main().catch((error) => {
  console.error(appServerLaunchFailureMessage(error, ''))
  process.exitCode = 1
})
