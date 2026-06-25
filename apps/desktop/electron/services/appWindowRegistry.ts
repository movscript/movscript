import { BrowserWindow } from 'electron'
import type {
  ElectronAppWindowContext,
  ElectronOpenCanvasWindowInput,
  ElectronOpenEditingProjectWindowInput,
  ElectronOpenProjectWindowInput,
  ElectronOpenSettingsWindowInput,
  ElectronOpenToolWindowInput,
  ElectronUpdateAppWindowRouteContextInput,
} from '../../src/shared/contracts/electronApi'
import { createWindow } from '../appWindow'
import { loadRenderer } from '../appWindow/loadRenderer'
import { isAppTrayInstalled } from './appTray'

const HOME_ROUTE = '/'
const AGENT_ROUTE = '/project/agent'
const PROJECT_HOME_ROUTE = '/project/home'
const EDITING_ROUTE = '/editing'
const EDITING_PROJECT_ROUTE_PREFIX = '/editing'
const CANVAS_ROUTE = '/canvases'
const CANVAS_ROUTE_PREFIX = '/canvases'
const TOOL_ROUTE = '/tools/ref-image-gen'
const APP_SETTINGS_ROUTE = '/app/settings'

let homeWindow: BrowserWindow | null = null
let agentWindow: BrowserWindow | null = null
let editingWindow: BrowserWindow | null = null
let canvasHomeWindow: BrowserWindow | null = null
let toolWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

const projectWindows = new Map<number | string, BrowserWindow>()
const editingProjectWindows = new Map<string, BrowserWindow>()
const canvasWindows = new Map<number, BrowserWindow>()
const trackedWindows = new Set<BrowserWindow>()
const windowContexts = new WeakMap<BrowserWindow, ElectronAppWindowContext>()
const registryListeners = new Set<() => void>()
let suspendedAuthWindows: ElectronAppWindowContext[] = []

export function openHomeWindow(): ElectronAppWindowContext {
  const context: ElectronAppWindowContext = {
    kind: 'home',
    route: HOME_ROUTE,
  }

  if (homeWindow && !homeWindow.isDestroyed()) {
    windowContexts.set(homeWindow, context)
    loadRenderer(homeWindow, context)
    focusWindow(homeWindow)
    return context
  }

  homeWindow = createTrackedWindow(context)
  bindHomeWindowCloseToTray(homeWindow)
  homeWindow.once('closed', () => {
    homeWindow = null
  })
  return context
}

export function openHomeRouteWindow(input: { route: string; search?: string }): ElectronAppWindowContext {
  const context = inferWindowRouteContext({ kind: 'home', route: HOME_ROUTE }, input)

  if (homeWindow && !homeWindow.isDestroyed()) {
    windowContexts.set(homeWindow, context)
    loadRenderer(homeWindow, context)
    focusWindow(homeWindow)
    return context
  }

  homeWindow = createTrackedWindow(context)
  bindHomeWindowCloseToTray(homeWindow)
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
  const projectKey = projectWindowKey(input)
  const existing = projectWindows.get(projectKey)
  if (existing && !existing.isDestroyed()) {
    focusWindow(existing)
    return contextForWindow(existing)
  }

  const context: ElectronAppWindowContext = {
    kind: 'project',
    projectDir: input.projectDir,
    project: input.project ?? null,
    route: input.route || PROJECT_HOME_ROUTE,
    ...(input.search ? { search: input.search } : {}),
  }
  const win = createTrackedWindow(context)
  projectWindows.set(projectKey, win)
  win.once('closed', () => {
    if (projectWindows.get(projectKey) === win) projectWindows.delete(projectKey)
  })
  return context
}

export function openEditingWindow(): ElectronAppWindowContext {
  if (editingWindow && !editingWindow.isDestroyed()) {
    focusWindow(editingWindow)
    return contextForWindow(editingWindow)
  }

  const context: ElectronAppWindowContext = {
    kind: 'tool',
    route: EDITING_ROUTE,
  }
  editingWindow = createTrackedWindow(context)
  editingWindow.once('closed', () => {
    editingWindow = null
  })
  return context
}

export function isProjectWindowOpen(projectDir: string): boolean {
  const win = projectWindows.get(`path:${projectDir.trim()}`)
  return Boolean(win && !win.isDestroyed())
}

export function openEditingProjectWindow(input: ElectronOpenEditingProjectWindowInput): ElectronAppWindowContext {
  const editingProjectId = normalizeEditingProjectId(input.editingProjectId)
  const existing = editingProjectWindows.get(editingProjectId)
  if (existing && !existing.isDestroyed()) {
    focusWindow(existing)
    return contextForWindow(existing)
  }

  const context: ElectronAppWindowContext = {
    kind: 'editingProject',
    editingProjectId,
    editingProjectTitle: input.title,
    route: input.route || `${EDITING_PROJECT_ROUTE_PREFIX}/${encodeURIComponent(editingProjectId)}`,
    ...(input.search ? { search: input.search } : {}),
  }
  const win = createTrackedWindow(context)
  editingProjectWindows.set(editingProjectId, win)
  win.once('closed', () => {
    if (editingProjectWindows.get(editingProjectId) === win) editingProjectWindows.delete(editingProjectId)
  })
  return context
}

export function isEditingProjectWindowOpen(editingProjectId: string): boolean {
  const win = editingProjectWindows.get(editingProjectId)
  return Boolean(win && !win.isDestroyed())
}

export function openCanvasWindow(input: ElectronOpenCanvasWindowInput = {}): ElectronAppWindowContext {
  const target = normalizeRouteTarget(input.route || (input.canvasId ? `${CANVAS_ROUTE_PREFIX}/${encodeURIComponent(String(input.canvasId))}` : CANVAS_ROUTE), input.search)
  const route = target.route
  const search = target.search
  const canvasId = input.canvasId ?? canvasIdFromRoute(route)
  if (canvasId !== undefined) {
    const existing = canvasWindows.get(canvasId)
    if (existing && !existing.isDestroyed()) {
      focusWindow(existing)
      return contextForWindow(existing)
    }
    const context: ElectronAppWindowContext = {
      kind: 'canvas',
      canvasId,
      route,
      ...(search ? { search } : {}),
      ...(input.title ? { title: input.title } : {}),
    }
    const win = createTrackedWindow(context)
    canvasWindows.set(canvasId, win)
    win.once('closed', () => {
      if (canvasWindows.get(canvasId) === win) canvasWindows.delete(canvasId)
    })
    return context
  }

  if (canvasHomeWindow && !canvasHomeWindow.isDestroyed()) {
    focusWindow(canvasHomeWindow)
    return contextForWindow(canvasHomeWindow)
  }
  const context: ElectronAppWindowContext = {
    kind: 'canvas',
    route: CANVAS_ROUTE,
    ...(search ? { search } : {}),
    ...(input.title ? { title: input.title } : {}),
  }
  canvasHomeWindow = createTrackedWindow(context)
  canvasHomeWindow.once('closed', () => {
    canvasHomeWindow = null
  })
  return context
}

export function openToolWindow(input: ElectronOpenToolWindowInput = {}): ElectronAppWindowContext {
  const target = normalizeRouteTarget(input.route || TOOL_ROUTE, input.search)
  const context: ElectronAppWindowContext = {
    kind: 'tool',
    route: target.route.startsWith('/tools') ? target.route : TOOL_ROUTE,
    ...(target.search ? { search: target.search } : {}),
    ...(input.title ? { title: input.title } : {}),
  }

  if (toolWindow && !toolWindow.isDestroyed()) {
    windowContexts.set(toolWindow, context)
    loadRenderer(toolWindow, context)
    focusWindow(toolWindow)
    return context
  }

  toolWindow = createTrackedWindow(context)
  toolWindow.once('closed', () => {
    toolWindow = null
  })
  return context
}

export function openSettingsWindow(input: ElectronOpenSettingsWindowInput = {}): ElectronAppWindowContext {
  const target = normalizeRouteTarget(input.route || APP_SETTINGS_ROUTE, input.search)
  const context: ElectronAppWindowContext = {
    kind: 'settings',
    route: target.route === APP_SETTINGS_ROUTE ? target.route : APP_SETTINGS_ROUTE,
    ...(target.search ? { search: target.search } : {}),
    ...(input.title ? { title: input.title } : {}),
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    windowContexts.set(settingsWindow, context)
    loadRenderer(settingsWindow, context)
    focusWindow(settingsWindow)
    return context
  }

  settingsWindow = createTrackedWindow(context)
  settingsWindow.once('closed', () => {
    settingsWindow = null
  })
  return context
}

export function isRouteWindowOpen(route: string): boolean {
  return openWindowContexts().some((entry) => normalizeRoutePath(entry.context.route) === normalizeRoutePath(route))
}

export function isCanvasWindowOpen(canvasId: number): boolean {
  return openWindowContexts().some((entry) => entry.context.canvasId === canvasId || normalizeRoutePath(entry.context.route) === `/canvases/${encodeURIComponent(String(canvasId))}`)
}

export function openWindowContexts(): Array<{ context: ElectronAppWindowContext; focused: boolean }> {
  const contexts: Array<{ context: ElectronAppWindowContext; focused: boolean }> = []
  for (const win of trackedWindows) {
    if (win.isDestroyed()) continue
    contexts.push({ context: contextForWindow(win), focused: win.isFocused() })
  }
  return contexts
}

export function onAppWindowRegistryChanged(listener: () => void): () => void {
  registryListeners.add(listener)
  return () => {
    registryListeners.delete(listener)
  }
}

export function updateWindowRouteContext(
  webContents: Electron.WebContents,
  input: ElectronUpdateAppWindowRouteContextInput,
): ElectronAppWindowContext {
  const win = BrowserWindow.fromWebContents(webContents)
  if (!win) throw new Error('No browser window for route context update')
  const previous = contextForWindow(win)
  const context = inferWindowRouteContext(previous, input)
  windowContexts.set(win, context)
  emitWindowRegistryChanged()
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

  if (editingWindow && !editingWindow.isDestroyed()) {
    suspended.push(contextForWindow(editingWindow))
    editingWindow.close()
  }

  for (const win of editingProjectWindows.values()) {
    if (win.isDestroyed()) continue
    suspended.push(contextForWindow(win))
    win.close()
  }

  if (canvasHomeWindow && !canvasHomeWindow.isDestroyed()) {
    suspended.push(contextForWindow(canvasHomeWindow))
    canvasHomeWindow.close()
  }

  for (const win of canvasWindows.values()) {
    if (win.isDestroyed()) continue
    suspended.push(contextForWindow(win))
    win.close()
  }

  if (toolWindow && !toolWindow.isDestroyed()) {
    suspended.push(contextForWindow(toolWindow))
    toolWindow.close()
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    suspended.push(contextForWindow(settingsWindow))
    settingsWindow.close()
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
    } else if (context.kind === 'project' && context.projectDir) {
      restored.push(openProjectWindow({
        projectDir: context.projectDir,
        project: context.project ?? null,
        route: context.route,
        search: context.search,
      }))
    } else if (context.kind === 'editingProject' && context.editingProjectId) {
      restored.push(openEditingProjectWindow({
        editingProjectId: context.editingProjectId,
        title: context.editingProjectTitle,
        route: context.route,
        search: context.search,
      }))
    } else if (context.kind === 'canvas') {
      restored.push(openCanvasWindow({
        canvasId: context.canvasId,
        title: context.title,
        route: context.route,
        search: context.search,
      }))
    } else if (context.kind === 'tool' && normalizeRoutePath(context.route) === EDITING_ROUTE) {
      restored.push(openEditingWindow())
    } else if (context.kind === 'tool') {
      restored.push(openToolWindow({
        title: context.title,
        route: context.route,
        search: context.search,
      }))
    } else if (context.kind === 'settings') {
      restored.push(openSettingsWindow({
        title: context.title,
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
  trackedWindows.add(win)
  windowContexts.set(win, context)
  win.on('focus', emitWindowRegistryChanged)
  win.on('blur', emitWindowRegistryChanged)
  win.once('closed', () => {
    trackedWindows.delete(win)
    win.removeListener('focus', emitWindowRegistryChanged)
    win.removeListener('blur', emitWindowRegistryChanged)
    emitWindowRegistryChanged()
  })
  emitWindowRegistryChanged()
  return win
}

function focusWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  emitWindowRegistryChanged()
}

function bindHomeWindowCloseToTray(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (win.isDestroyed()) return
    event.preventDefault()
    if (!isAppTrayInstalled()) {
      win.minimize()
      return
    }
    hideHomeWindowInTrayMode(win)
  })
}

function hideHomeWindowInTrayMode(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.hide()
  win.setOpacity(1)
  emitWindowRegistryChanged()
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
  if (context.kind === 'project') return `project:path:${context.projectDir ?? context.route}`
  if (context.kind === 'editingProject') return `editingProject:${context.editingProjectId ?? context.route}`
  if (context.kind === 'canvas') return `canvas:${context.canvasId ?? context.route}`
  if (context.kind === 'tool') return `tool:${context.route}`
  if (context.kind === 'settings') return 'settings'
  return context.kind
}

function projectWindowKey(input: ElectronOpenProjectWindowInput): number | string {
  if (input.projectDir?.trim()) return `path:${input.projectDir.trim()}`
  throw new Error('Project window requires projectDir')
}

function normalizeEditingProjectId(value: unknown): string {
  const editingProjectId = String(value ?? '').trim()
  if (!editingProjectId) {
    throw new Error('editingProjectId is required')
  }
  return editingProjectId
}

function inferWindowRouteContext(
  previous: ElectronAppWindowContext,
  input: ElectronUpdateAppWindowRouteContextInput,
): ElectronAppWindowContext {
  const route = normalizeRoutePath(input.route)
  const search = input.search ? normalizeSearch(input.search) : undefined
  const title = input.title

  if (previous.kind === 'project' && previous.projectDir) {
    return { ...previous, route, ...(search ? { search } : {}), ...(title ? { title } : {}) }
  }

  const editingProjectId = editingProjectIdFromRoute(route)
  if ((previous.kind === 'editingProject' && previous.editingProjectId) || editingProjectId) {
    return {
      ...previous,
      kind: 'editingProject',
      route,
      ...(search ? { search } : {}),
      editingProjectId: previous.editingProjectId ?? editingProjectId,
      editingProjectTitle: previous.editingProjectTitle ?? title,
      ...(title ? { title } : {}),
    }
  }

  if (route === EDITING_ROUTE) {
    return { kind: 'tool', route, ...(search ? { search } : {}), ...(title ? { title } : {}) }
  }

  const canvasId = canvasIdFromRoute(route)
  if (canvasId !== undefined || route === CANVAS_ROUTE) {
    return {
      kind: 'canvas',
      route,
      ...(search ? { search } : {}),
      ...(canvasId !== undefined ? { canvasId } : {}),
      ...(title ? { title } : {}),
    }
  }

  if (route === AGENT_ROUTE || route.startsWith(`${AGENT_ROUTE}/`)) {
    return { kind: 'agent', route, ...(search ? { search } : {}), ...(title ? { title } : {}) }
  }

  if (route.startsWith('/tools')) {
    return { kind: 'tool', route, ...(search ? { search } : {}), ...(title ? { title } : {}) }
  }

  if (route === APP_SETTINGS_ROUTE) {
    return { kind: 'settings', route, ...(search ? { search } : {}), ...(title ? { title } : {}) }
  }

  return { ...previous, kind: 'home', route, ...(search ? { search } : {}), ...(title ? { title } : {}) }
}

function normalizeRoutePath(value: string): string {
  const path = value.split(/[?#]/, 1)[0] ?? ''
  if (!path.startsWith('/') || path.startsWith('//')) return HOME_ROUTE
  return path.replace(/\/+$/, '') || HOME_ROUTE
}

function normalizeSearch(value: string): string {
  return value.startsWith('?') ? value : `?${value}`
}

function normalizeRouteTarget(routeValue: string, searchValue?: string): { route: string; search?: string } {
  const route = normalizeRoutePath(routeValue)
  if (searchValue) return { route, search: normalizeSearch(searchValue) }
  const queryIndex = routeValue.indexOf('?')
  if (queryIndex >= 0) {
    const search = routeValue.slice(queryIndex)
    return search.length > 1 ? { route, search: normalizeSearch(search) } : { route }
  }
  return { route }
}

function editingProjectIdFromRoute(route: string): string | undefined {
  const match = /^\/editing\/([^/]+)$/.exec(route)
  return match ? decodeURIComponent(match[1]) : undefined
}

function canvasIdFromRoute(route: string): number | undefined {
  const match = /^\/canvases\/([^/]+)$/.exec(route)
  if (!match) return undefined
  const canvasId = Number(decodeURIComponent(match[1]))
  return Number.isInteger(canvasId) && canvasId > 0 ? canvasId : undefined
}

function emitWindowRegistryChanged(): void {
  for (const listener of registryListeners) {
    listener()
  }
}
