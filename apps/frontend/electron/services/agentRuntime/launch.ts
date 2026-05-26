import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { DEFAULT_AGENT_USER_DATA_DIR } from './config'

export interface AgentRuntimeLaunch {
  command: string
  args: string[]
  cwd: string
  env?: Record<string, string>
}

export function resolveAgentRuntimeLaunch(): AgentRuntimeLaunch {
  const roots = [
    join(app.getAppPath(), '..', 'agent'),
    join(process.cwd(), '..', 'agent'),
    join(process.cwd(), 'apps', 'agent'),
    join(process.resourcesPath || '', 'movscript-agent'),
  ]

  for (const root of roots) {
    const bundledServer = join(root, 'dist', 'server.bundle.js')
    if (app.isPackaged && existsSync(bundledServer)) {
      return {
        command: process.execPath,
        args: [bundledServer],
        cwd: join(app.getPath('userData'), DEFAULT_AGENT_USER_DATA_DIR),
        env: { ELECTRON_RUN_AS_NODE: '1' },
      }
    }

    const distServer = join(root, 'dist', 'server.js')
    if (app.isPackaged && existsSync(distServer)) {
      return {
        command: process.execPath,
        args: [distServer],
        cwd: join(app.getPath('userData'), DEFAULT_AGENT_USER_DATA_DIR),
        env: { ELECTRON_RUN_AS_NODE: '1' },
      }
    }

    const packageJSON = join(root, 'package.json')
    if (!app.isPackaged && existsSync(packageJSON)) {
      const nodeCommand = resolveDevelopmentNodeCommand()
      const useDevBundle = process.env.MOVSCRIPT_AGENT_DEV_USE_BUNDLE !== '0'
      if (useDevBundle && process.env.MOVSCRIPT_AGENT_HOT_RELOAD !== '1' && existsSync(bundledServer) && developmentBundleIsFresh(root, bundledServer)) {
        return {
          command: nodeCommand,
          args: [bundledServer],
          cwd: root,
          env: {
            ...(nodeCommand === process.execPath ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
            MOVSCRIPT_AGENT_DEV_ENTRY: 'bundle',
          },
        }
      }
      if (useDevBundle && process.env.MOVSCRIPT_AGENT_HOT_RELOAD !== '1' && existsSync(bundledServer)) {
        console.info(`[agent] dev bundle is stale; falling back to tsx entry bundle=${bundledServer}`)
      }
      return {
        command: nodeCommand,
        args: ['scripts/dev-watch.mjs'],
        cwd: root,
        env: {
          ...(nodeCommand === process.execPath ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
          MOVSCRIPT_AGENT_DEV_NODE_COMMAND: nodeCommand,
        },
      }
    }

    if (existsSync(distServer)) {
      return {
        command: process.execPath,
        args: [distServer],
        cwd: root,
        env: { ELECTRON_RUN_AS_NODE: '1' },
      }
    }
  }

  throw new Error('movscript-agent not found. Expected apps/agent in development or resources/movscript-agent/dist/server.js in packaged builds.')
}

function resolveDevelopmentNodeCommand(): string {
  const candidates = [
    process.env.MOVSCRIPT_AGENT_NODE_COMMAND,
    process.env.npm_node_execpath,
    process.env.NODE,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return candidates.find((candidate) => existsSync(candidate)) ?? process.execPath
}

function developmentBundleIsFresh(root: string, bundledServer: string): boolean {
  if (process.env.MOVSCRIPT_AGENT_DEV_ALLOW_STALE_BUNDLE === '1') return true
  let bundleMtime = 0
  try {
    bundleMtime = statSync(bundledServer).mtimeMs
  } catch {
    return false
  }
  const sourceMtime = newestMtime([
    join(root, 'package.json'),
    join(root, 'tsconfig.json'),
    join(root, 'src'),
    join(root, 'catalog'),
  ])
  return sourceMtime <= bundleMtime
}

function newestMtime(paths: string[]): number {
  let newest = 0
  for (const path of paths) {
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue
    }
    newest = Math.max(newest, stat.mtimeMs)
    if (!stat.isDirectory()) continue
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      newest = Math.max(newest, newestMtime([join(path, entry.name)]))
    }
  }
  return newest
}
