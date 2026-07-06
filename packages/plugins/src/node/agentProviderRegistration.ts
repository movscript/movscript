import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  normalizeAgentProviderTargets,
  type AgentPackageManifest,
  type AgentProviderTargetId,
} from '../agentPackage.js'

export const MOVSCRIPT_AGENT_PROVIDER_REGISTRATION_SCHEMA = 'movscript.agent-provider-registration.v1'

export interface AgentProviderRegistrationOptions {
  homeDir: string
  targets?: string | string[]
  pluginName?: string
  currentLink?: string
  packageManifest?: AgentPackageManifest
  now?: Date
}

export interface AgentProviderRegistrationResult {
  target: AgentProviderTargetId
  providerRoot: string
  pluginLink: string
  registrationPath: string
  nativeCommands: string[]
}

export function registerMovScriptAgentProviderTargets(options: AgentProviderRegistrationOptions): AgentProviderRegistrationResult[] {
  const targets = normalizeAgentProviderTargets(options.targets)
  return targets.map((target) => registerMovScriptAgentProviderTarget({ ...options, target }))
}

export function registerMovScriptAgentProviderTarget(
  options: AgentProviderRegistrationOptions & { target: AgentProviderTargetId },
): AgentProviderRegistrationResult {
  const pluginName = options.pluginName ?? options.packageManifest?.id ?? 'movscript'
  const providerRoot = resolve(options.homeDir, 'provider', options.target)
  const pluginLink = resolve(providerRoot, 'plugins', pluginName)
  const currentLink = options.currentLink ?? resolve(options.homeDir, 'plugins', pluginName, 'current')
  const installedAt = (options.now ?? new Date()).toISOString()
  const mcpServer = movScriptMcpServer(options.homeDir)

  mkdirSync(dirname(pluginLink), { recursive: true })
  switchProviderPluginLink(pluginLink, currentLink)

  const registration = {
    schema: MOVSCRIPT_AGENT_PROVIDER_REGISTRATION_SCHEMA,
    target: options.target,
    plugin: {
      id: pluginName,
      name: options.packageManifest?.name ?? pluginName,
      ...(options.packageManifest?.version ? { version: options.packageManifest.version } : {}),
      currentLink,
      pluginLink,
    },
    installedAt,
    mcpServers: {
      [pluginName]: mcpServer,
    },
    nativeCommands: nativeRegistrationCommands(options.target, pluginName, mcpServer.command, mcpServer.args),
  }
  const registrationPath = resolve(providerRoot, 'registration.json')
  writeJSON(registrationPath, registration)

  if (options.target === 'codex') {
    const marketplaceManifest = codexMarketplaceManifest(pluginName)
    writeJSON(resolve(providerRoot, 'marketplace.json'), marketplaceManifest)
    writeJSON(resolve(providerRoot, '.agents', 'plugins', 'marketplace.json'), marketplaceManifest)
  } else if (options.target === 'claude-code') {
    writeJSON(resolve(providerRoot, '.mcp.json'), {
      mcpServers: {
        [pluginName]: {
          type: 'stdio',
          command: mcpServer.command,
          args: mcpServer.args,
        },
      },
    })
  } else if (options.target === 'openclaw') {
    writeJSON(resolve(providerRoot, 'mcp.json'), {
      mcpServers: {
        [pluginName]: {
          transport: 'stdio',
          command: mcpServer.command,
          args: mcpServer.args,
        },
      },
    })
    writeOpenClawPluginPackage({
      providerRoot,
      pluginName,
      command: mcpServer.command,
      homeDir: options.homeDir,
      name: options.packageManifest?.displayName ?? options.packageManifest?.name ?? pluginName,
      version: options.packageManifest?.version,
      description: options.packageManifest?.description ?? 'Run MovScript project, generation, and editing workflows from OpenClaw.',
    })
  } else if (options.target === 'harness') {
    writeJSON(resolve(providerRoot, 'worker-agent.json'), {
      schema: 'movscript.harness-worker-agent-export.v1',
      name: options.packageManifest?.displayName ?? options.packageManifest?.name ?? pluginName,
      instructions: options.packageManifest?.providerPlugin?.interface?.defaultPrompt
        ?? 'Use the MovScript MCP server for project, generation, and editing workflows.',
      mcpServers: [{
        name: pluginName,
        transport: 'stdio',
        command: mcpServer.command,
        args: mcpServer.args,
      }],
    })
  } else if (options.target === 'workbuddy') {
    writeMcpServersJson(resolve(providerRoot, 'mcp.json'), pluginName, mcpServer)
  } else if (options.target === 'trae') {
    writeMcpServersJson(resolve(providerRoot, 'mcp.json'), pluginName, mcpServer)
    writeMcpServersJson(resolve(providerRoot, 'project', '.trae', 'mcp.json'), pluginName, mcpServer)
  }

  return {
    target: options.target,
    providerRoot,
    pluginLink,
    registrationPath,
    nativeCommands: registration.nativeCommands,
  }
}

function movScriptMcpServer(homeDir: string): { transport: 'stdio'; command: string; args: string[] } {
  return {
    transport: 'stdio',
    command: resolve(homeDir, 'bin', process.platform === 'win32' ? 'movscript.cmd' : 'movscript'),
    args: ['mcp', 'stdio'],
  }
}

interface OpenClawPluginPackageOptions {
  providerRoot: string
  pluginName: string
  command: string
  homeDir: string
  name: string
  version?: string
  description: string
}

function writeOpenClawPluginPackage(options: OpenClawPluginPackageOptions): void {
  const pluginRoot = resolve(options.providerRoot, 'plugin')
  mkdirSync(pluginRoot, { recursive: true })
  writeJSON(resolve(pluginRoot, 'package.json'), {
    name: 'movscript',
    version: options.version ?? '0.0.0',
    private: true,
    type: 'module',
    openclaw: {
      extensions: ['./index.ts'],
    },
  })
  writeJSON(resolve(pluginRoot, 'openclaw.plugin.json'), {
    id: options.pluginName,
    name: options.name,
    description: options.description,
    ...(options.version ? { version: options.version } : {}),
    configSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  })
  writeFileSync(resolve(pluginRoot, 'index.ts'), openClawPluginEntrypoint(options), 'utf8')
}

function openClawPluginEntrypoint(options: OpenClawPluginPackageOptions): string {
  return `import { spawn } from 'node:child_process'

const MOVSCRIPT_COMMAND = process.env.MOVSCRIPT_COMMAND || ${JSON.stringify(options.command)}
const MOVSCRIPT_HOME_DIR = process.env.MOVSCRIPT_HOME || ${JSON.stringify(options.homeDir)}
const DEFAULT_TIMEOUT_MS = 120000
const MAX_OUTPUT_CHARS = 1000000

function textResult(payload) {
  const text = typeof payload.stdout === 'string' && payload.stdout.trim()
    ? payload.stdout.trim()
    : JSON.stringify(payload, null, 2)
  return {
    content: [{ type: 'text', text }],
    details: payload,
  }
}

function normalizeArgs(value) {
  if (!Array.isArray(value)) throw new Error('args must be a non-empty string array')
  const args = value.map((item) => {
    if (typeof item !== 'string') throw new Error('args must contain only strings')
    return item
  })
  if (args.length === 0) throw new Error('args must be a non-empty string array')
  return args
}

function normalizedTimeout(value) {
  if (value === undefined || value === null) return DEFAULT_TIMEOUT_MS
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(Math.trunc(parsed), 1000), 600000)
}

function clampOutput(value) {
  if (value.length <= MAX_OUTPUT_CHARS) return value
  return value.slice(value.length - MAX_OUTPUT_CHARS)
}

function runMovScript(args, options) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let aborted = false
    const child = spawn(MOVSCRIPT_COMMAND, args, {
      cwd: options.cwd || undefined,
      env: {
        ...process.env,
        MOVSCRIPT_HOME: MOVSCRIPT_HOME_DIR,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, options.timeoutMs)
    const abortHandler = () => {
      aborted = true
      child.kill('SIGTERM')
    }
    if (options.signal) options.signal.addEventListener('abort', abortHandler, { once: true })
    child.stdout?.on('data', (chunk) => {
      stdout = clampOutput(stdout + String(chunk))
    })
    child.stderr?.on('data', (chunk) => {
      stderr = clampOutput(stderr + String(chunk))
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      if (options.signal) options.signal.removeEventListener('abort', abortHandler)
      resolve({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        args,
        stdout,
        stderr,
      })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (options.signal) options.signal.removeEventListener('abort', abortHandler)
      resolve({
        ok: code === 0 && !timedOut && !aborted,
        code,
        signal,
        timedOut,
        aborted,
        args,
        stdout,
        stderr,
      })
    })
  })
}

const plugin = {
  id: ${JSON.stringify(options.pluginName)},
  name: ${JSON.stringify(options.name)},
  description: ${JSON.stringify(options.description)},
  ${options.version ? `version: ${JSON.stringify(options.version)},` : ''}
  configSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  register(api) {
    api.registerTool({
      name: ${JSON.stringify(options.pluginName)},
      label: ${JSON.stringify(options.name)},
      description: 'Run MovScript CLI actions. Pass args as an array, for example ["overview", "--json"] or ["project", "list", "--json"].',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          args: {
            type: 'array',
            minItems: 1,
            maxItems: 64,
            items: { type: 'string' },
            description: 'MovScript CLI arguments without the executable name.',
          },
          cwd: {
            type: 'string',
            description: 'Optional working directory for the MovScript command.',
          },
          json: {
            type: 'boolean',
            description: 'Prepend --json when the args do not already include it.',
          },
          timeoutMs: {
            type: 'integer',
            minimum: 1000,
            maximum: 600000,
            description: 'Command timeout in milliseconds.',
          },
        },
        required: ['args'],
      },
      async execute(_toolCallId, params, signal) {
        try {
          const rawArgs = normalizeArgs(params?.args)
          const args = params?.json && !rawArgs.includes('--json') ? ['--json', ...rawArgs] : rawArgs
          const result = await runMovScript(args, {
            cwd: typeof params?.cwd === 'string' && params.cwd.trim() ? params.cwd.trim() : undefined,
            timeoutMs: normalizedTimeout(params?.timeoutMs),
            signal,
          })
          return textResult(result)
        } catch (error) {
          return textResult({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    })
  },
}

export default plugin
`
}

function codexMarketplaceManifest(pluginName: string): Record<string, unknown> {
  return {
    name: 'movscript',
    interface: {
      displayName: 'MovScript',
    },
    plugins: [
      {
        name: pluginName,
        source: {
          source: 'local',
          path: `./plugins/${pluginName}`,
        },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_INSTALL',
        },
        category: 'Productivity',
      },
    ],
  }
}

function nativeRegistrationCommands(target: AgentProviderTargetId, pluginName: string, command: string, args: string[]): string[] {
  const fullCommand = [shellQuote(command), ...args.map(shellQuote)].join(' ')
  if (target === 'codex') {
    return [
      `codex plugin remove ${pluginName}@movscript-local || true`,
      'codex plugin marketplace remove movscript-local || true',
      `codex plugin remove ${pluginName}@movscript || true`,
      'codex plugin marketplace add "$MOVSCRIPT_HOME/provider/codex"',
      `codex plugin add ${pluginName}@movscript`,
    ]
  }
  if (target === 'claude-code') {
    return [`claude mcp add --transport stdio ${pluginName} -- ${fullCommand}`]
  }
  if (target === 'openclaw') {
    return [`openclaw plugins install --link "$MOVSCRIPT_HOME/provider/openclaw/plugin"`]
  }
  if (target === 'harness') {
    return ['Import provider/harness/worker-agent.json as a Harness Worker Agent MCP server configuration.']
  }
  if (target === 'workbuddy') {
    return [`Merge "$MOVSCRIPT_HOME/provider/workbuddy/mcp.json" into "$HOME/.workbuddy/mcp.json" or paste it in WorkBuddy MCP settings.`]
  }
  if (target === 'trae') {
    return [`Merge "$MOVSCRIPT_HOME/provider/trae/mcp.json" into "$HOME/Library/Application Support/Trae/User/mcp.json" or paste it in Trae MCP settings.`]
  }
  return []
}

function switchProviderPluginLink(linkPath: string, targetPath: string): void {
  mkdirSync(dirname(linkPath), { recursive: true })
  if (existsSync(linkPath) || isSymlink(linkPath)) rmSync(linkPath, { recursive: true, force: true })
  symlinkSync(targetPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
}

function writeJSON(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeMcpServersJson(
  path: string,
  pluginName: string,
  mcpServer: { command: string; args: string[] },
): void {
  writeJSON(path, {
    mcpServers: {
      [pluginName]: {
        command: mcpServer.command,
        args: mcpServer.args,
      },
    },
  })
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
