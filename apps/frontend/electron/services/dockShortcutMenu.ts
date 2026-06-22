import { app, Menu, nativeImage } from 'electron'
import type {
  ElectronDockShortcutCanvas,
  ElectronDockShortcutEditingProject,
  ElectronDockShortcutProject,
  ElectronDockShortcutSnapshot,
} from '../../src/shared/contracts/electronApi'
import {
  isEditingProjectWindowOpen,
  isCanvasWindowOpen,
  isProjectWindowOpen,
  isRouteWindowOpen,
  onAppWindowRegistryChanged,
  openCanvasWindow,
  openEditingWindow,
  openEditingProjectWindow,
  openHomeRouteWindow,
  openProjectWindow,
  openToolWindow,
} from './appWindowRegistry'

const MAX_RECENT_SHORTCUTS = 5
type DockShortcutIcon = 'home' | 'tool' | 'project' | 'editingProject' | 'canvas'

let dockShortcutSnapshot: ElectronDockShortcutSnapshot = {}
let removeWindowRegistryListener: (() => void) | null = null
const dockShortcutIconCache = new Map<DockShortcutIcon, Electron.NativeImage>()

export function installDockShortcutMenu(): void {
  if (!removeWindowRegistryListener) {
    removeWindowRegistryListener = onAppWindowRegistryChanged(refreshDockShortcutMenu)
  }
  refreshDockShortcutMenu()
}

export function updateDockShortcutMenu(snapshot: ElectronDockShortcutSnapshot): void {
  dockShortcutSnapshot = normalizeDockShortcutSnapshot(snapshot)
  refreshDockShortcutMenu()
}

function refreshDockShortcutMenu(): void {
  if (process.platform !== 'darwin' || !app.dock) return

  const snapshot = dockShortcutSnapshot
  const labels = snapshot.labels ?? {}
  const template: Electron.MenuItemConstructorOptions[] = [
    dockHomeItem(labels.appHome ?? 'Home', '/', 'home', isRouteWindowOpen('/')),
    dockHomeItem(labels.toolHome ?? 'Tools', '/tools/ref-image-gen', 'tool', isRouteWindowOpen('/tools/ref-image-gen'), () => openToolWindow()),
    dockHomeItem(labels.editHome ?? 'Editing', '/editing', 'editingProject', isRouteWindowOpen('/editing'), () => openEditingWindow()),
    dockHomeItem(labels.canvasHome ?? 'Canvas', '/canvases', 'canvas', isRouteWindowOpen('/canvases'), () => openCanvasWindow()),
    { type: 'separator' },
    dockRecentSubmenu(labels.recentProjects ?? 'Recent Projects', labels.emptyRecent ?? 'No recent items', 'project', snapshot.projects ?? [], projectLabel, (project) => isProjectWindowOpen(project.projectDir), openProjectShortcut),
    dockRecentSubmenu(labels.recentEditingProjects ?? 'Recent Editing Projects', labels.emptyRecent ?? 'No recent items', 'editingProject', snapshot.editingProjects ?? [], editingProjectLabel, (project) => isEditingProjectWindowOpen(project.id), openEditingProjectShortcut),
    dockRecentSubmenu(labels.recentCanvases ?? 'Recent Canvases', labels.emptyRecent ?? 'No recent items', 'canvas', snapshot.canvases ?? [], canvasLabel, (canvas) => isCanvasWindowOpen(canvas.id), openCanvasShortcut),
  ]

  app.dock.setMenu(Menu.buildFromTemplate(template))
}

function dockHomeItem(label: string, route: string, icon: DockShortcutIcon, active: boolean, open?: () => void): Electron.MenuItemConstructorOptions {
  return {
    type: 'checkbox',
    checked: active,
    icon: dockShortcutIcon(icon),
    label,
    click: () => {
      if (open) open()
      else openHomeRouteWindow({ route })
    },
  }
}

function dockRecentSubmenu<T>(
  label: string,
  emptyLabel: string,
  icon: DockShortcutIcon,
  items: T[],
  getLabel: (item: T) => string,
  isOpen: (item: T) => boolean,
  onOpen: (item: T) => void,
): Electron.MenuItemConstructorOptions {
  const submenu = items.slice(0, MAX_RECENT_SHORTCUTS).map((item) => ({
    type: 'checkbox' as const,
    checked: isOpen(item),
    icon: dockShortcutIcon(icon),
    label: getLabel(item),
    click: () => onOpen(item),
  }))
  return {
    label,
    submenu: submenu.length > 0 ? submenu : [{ label: emptyLabel, enabled: false }],
  }
}

function openProjectShortcut(project: ElectronDockShortcutProject): void {
  openProjectWindow({
    projectDir: project.projectDir,
    project: project.project ?? {
      ID: project.id,
      name: project.name,
      workspace_path: project.projectDir,
      project_path: project.projectDir,
      UpdatedAt: project.updatedAt,
    },
    route: '/project/home',
  })
}

function openEditingProjectShortcut(project: ElectronDockShortcutEditingProject): void {
  openEditingProjectWindow({
    editingProjectId: project.id,
    title: project.title,
    route: `/editing/${encodeURIComponent(project.id)}`,
  })
}

function openCanvasShortcut(canvas: ElectronDockShortcutCanvas): void {
  openCanvasWindow({ canvasId: canvas.id, route: `/canvases/${encodeURIComponent(String(canvas.id))}` })
}

function normalizeDockShortcutSnapshot(snapshot: ElectronDockShortcutSnapshot): ElectronDockShortcutSnapshot {
  return {
    projects: (snapshot.projects ?? []).filter(isValidProjectShortcut).slice(0, MAX_RECENT_SHORTCUTS),
    editingProjects: (snapshot.editingProjects ?? []).filter(isValidEditingProjectShortcut).slice(0, MAX_RECENT_SHORTCUTS),
    canvases: (snapshot.canvases ?? []).filter(isValidCanvasShortcut).slice(0, MAX_RECENT_SHORTCUTS),
  }
}

function isValidProjectShortcut(value: ElectronDockShortcutProject): boolean {
  return Number.isInteger(value.id) && value.id !== 0 && typeof value.name === 'string' && value.name.trim().length > 0 && typeof value.projectDir === 'string' && value.projectDir.trim().length > 0
}

function isValidEditingProjectShortcut(value: ElectronDockShortcutEditingProject): boolean {
  return typeof value.id === 'string' && value.id.trim().length > 0 && typeof value.title === 'string' && value.title.trim().length > 0
}

function isValidCanvasShortcut(value: ElectronDockShortcutCanvas): boolean {
  return Number.isInteger(value.id) && value.id > 0 && typeof value.name === 'string' && value.name.trim().length > 0
}

function projectLabel(project: ElectronDockShortcutProject): string {
  return project.name
}

function editingProjectLabel(project: ElectronDockShortcutEditingProject): string {
  return project.title
}

function canvasLabel(canvas: ElectronDockShortcutCanvas): string {
  return canvas.name
}

function dockShortcutIcon(icon: DockShortcutIcon): Electron.NativeImage {
  const cached = dockShortcutIconCache.get(icon)
  if (cached) return cached
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(dockShortcutIconSvg(icon)).toString('base64')}`)
  image.setTemplateImage(true)
  dockShortcutIconCache.set(icon, image)
  return image
}

function dockShortcutIconSvg(icon: DockShortcutIcon): string {
  const paths: Record<DockShortcutIcon, string> = {
    home: '<path d="M3 8.5 12 3l9 5.5"/><path d="M5 9v10h14V9"/><path d="M10 19v-5h4v5"/>',
    tool: '<path d="M4 5h16v10H4z"/><path d="M8 19h8"/><path d="M12 15v4"/>',
    project: '<path d="M3 6.5h6l2 2h10v9H3z"/><path d="M3 8.5h18"/>',
    editingProject: '<path d="M5 5l14 14"/><path d="M19 5 5 19"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/>',
    canvas: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8v8H8z"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/>',
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[icon]}</svg>`
}
