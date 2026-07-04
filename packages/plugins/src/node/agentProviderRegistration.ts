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
    writeJSON(resolve(providerRoot, 'marketplace.json'), codexMarketplaceManifest(pluginName))
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
      'codex plugin marketplace add "$MOVSCRIPT_HOME/provider/codex"',
      `codex plugin add ${pluginName}@movscript`,
    ]
  }
  if (target === 'claude-code') {
    return [`claude mcp add --transport stdio ${pluginName} -- ${fullCommand}`]
  }
  if (target === 'openclaw') {
    return [`openclaw mcp add ${pluginName} -- ${fullCommand}`]
  }
  if (target === 'harness') {
    return ['Import provider/harness/worker-agent.json as a Harness Worker Agent MCP server configuration.']
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
