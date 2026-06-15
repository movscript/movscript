import { BrowserWindow } from 'electron'
import type {
  ElectronAppWindowContext,
  ElectronOpenProjectWindowInput,
} from '../../src/shared/contracts/electronApi'
import { createWindow } from '../appWindow'

const HOME_ROUTE = '/'
const AGENT_ROUTE = '/project/agent'
const PROJECT_HOME_ROUTE = '/project/home'

let homeWindow: BrowserWindow | null = null
let agentWindow: BrowserWindow | null = null

const projectWindows = new Map<number, BrowserWindow>()
const windowContexts = new WeakMap<BrowserWindow, ElectronAppWindowContext>()
let suspendedAuthWindows: ElectronAppWindowContext[] = []

export function openHomeWindow(): ElectronAppWindowContext {
  if (homeWindow && !homeWindow.isDestroyed()) {
    focusWindow(homeWindow)
    return contextForWindow(homeWindow)
  }

  const context: ElectronAppWindowContext = {
    kind: 'home',
    route: HOME_ROUTE,
  }
  homeWindow = createTrackedWindow(context)
  homeWindow.once('closed', () => {
    homeWindow = null
  })
  return context
}

export function openAgentWindow(): ElectronAppWindowContext {
  if (agentWindow && !agentWindow.isDestroyed()) {
    focusWindow(agentWindow)
    return contextForWindow(agentWindow)
  }

  const context: ElectronAppWindowContext = {
    kind: 'agent',
    route: AGENT_ROUTE,
  }
  agentWindow = createTrackedWindow(context)
  agentWindow.once('closed', () => {
    agentWindow = null
  })
  return context
}

export function openProjectWindow(input: ElectronOpenProjectWindowInput): ElectronAppWindowContext {
  const projectId = normalizeProjectId(input.projectId)
  const existing = projectWindows.get(projectId)
  if (existing && !existing.isDestroyed()) {
    focusWindow(existing)
    return contextForWindow(existing)
  }

  const context: ElectronAppWindowContext = {
    kind: 'project',
    projectId,
    project: input.project ?? null,
    route: input.route || PROJECT_HOME_ROUTE,
    ...(input.search ? { search: input.search } : {}),
  }
  const win = createTrackedWindow(context)
  projectWindows.set(projectId, win)
  win.once('closed', () => {
    if (projectWindows.get(projectId) === win) projectWindows.delete(projectId)
  })
  return context
}

export function suspendNonHomeWindowsForAuthExpired(): ElectronAppWindowContext[] {
  const suspended: ElectronAppWindowContext[] = []

  if (agentWindow && !agentWindow.isDestroyed()) {
    suspended.push(contextForWindow(agentWindow))
    agentWindow.close()
  }

  for (const win of projectWindows.values()) {
    if (win.isDestroyed()) continue
    suspended.push(contextForWindow(win))
    win.close()
  }

  if (suspended.length > 0) {
    suspendedAuthWindows = mergeWindowContexts(suspendedAuthWindows, suspended)
  }
  openHomeWindow()
  if (homeWindow && !homeWindow.isDestroyed()) {
    homeWindow.webContents.send('backend-auth:session-expired')
  }
  return suspended
}

export function restoreSuspendedAuthWindows(): ElectronAppWindowContext[] {
  const pending = suspendedAuthWindows
  suspendedAuthWindows = []

  const restored: ElectronAppWindowContext[] = []
  for (const context of pending) {
    if (context.kind === 'agent') {
      restored.push(openAgentWindow())
    } else if (context.kind === 'project' && context.projectId) {
      restored.push(openProjectWindow({
        projectId: context.projectId,
        project: context.project ?? null,
        route: context.route,
        search: context.search,
      }))
    }
  }
  return restored
}

export function contextForWebContents(webContents: Electron.WebContents): ElectronAppWindowContext {
  const win = BrowserWindow.fromWebContents(webContents)
  return win ? contextForWindow(win) : { kind: 'home', route: HOME_ROUTE }
}

export function contextForWindow(win: BrowserWindow): ElectronAppWindowContext {
  return windowContexts.get(win) ?? { kind: 'home', route: HOME_ROUTE }
}

function createTrackedWindow(context: ElectronAppWindowContext): BrowserWindow {
  const win = createWindow({ context })
  windowContexts.set(win, context)
  return win
}

function focusWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function mergeWindowContexts(
  current: ElectronAppWindowContext[],
  next: ElectronAppWindowContext[],
): ElectronAppWindowContext[] {
  const contexts = new Map<string, ElectronAppWindowContext>()
  for (const context of [...current, ...next]) {
    contexts.set(windowContextKey(context), context)
  }
  return [...contexts.values()]
}

function windowContextKey(context: ElectronAppWindowContext): string {
  if (context.kind === 'project') return `project:${context.projectId ?? context.route}`
  return context.kind
}

function normalizeProjectId(value: unknown): number {
  const projectId = Number(value)
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error('projectId must be a positive integer')
  }
  return projectId
}
