import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { openCanvasWindow, openSettingsWindow, openToolWindow } from './services/appWindowRegistry'

interface NavigationMenuItem {
  label: string
  route: string
  accelerator?: string
}

interface NavigationMenuGroup {
  label: string
  items: NavigationMenuItem[]
}

const navigationGroups: NavigationMenuGroup[] = [
  {
    label: 'Project',
    items: [
      { label: 'Projects', route: '/projects', accelerator: 'CmdOrCtrl+1' },
      { label: 'Home', route: '/project/overview' },
      { label: 'Script Workbench', route: '/project/scripts/workbench' },
      { label: 'Production Overview', route: '/project/production' },
    ],
  },
  {
    label: 'Workbench',
    items: [
      { label: 'Project Standards', route: '/project/standards', accelerator: 'CmdOrCtrl+2' },
      { label: 'Pre-production', route: '/project/pre-production' },
      { label: 'Orchestration', route: '/project/production/orchestration' },
      { label: 'Shot Editor', route: '/project/content-units/editor' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Canvas', route: '/canvases', accelerator: 'CmdOrCtrl+3' },
      { label: 'Reference Image', route: '/tools/ref-image-gen' },
      { label: 'Reference Video', route: '/tools/ref-video-gen' },
      { label: 'Motion Imitation', route: '/tools/motion-imitation' },
      { label: 'Style Transfer', route: '/tools/style-transfer' },
      { label: 'Multi-angle', route: '/tools/multi-angle' },
    ],
  },
  {
    label: 'Files',
    items: [
      { label: 'Resources', route: '/resources', accelerator: 'CmdOrCtrl+4' },
      { label: 'Generation Jobs', route: '/jobs' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Workspace', route: '/org/select' },
      { label: 'Agent Console', route: '/agent', accelerator: 'CmdOrCtrl+5' },
      { label: 'Model Providers', route: '/model-providers' },
      { label: 'Agents', route: '/agents/movscript' },
      { label: 'MovScript Workspace', route: '/workspace/config' },
      { label: 'Plugins', route: '/plugins' },
      { label: 'App Settings', route: '/app/settings' },
      { label: 'User Profile', route: '/user' },
    ],
  },
]

function openRendererRoute(route: string): void {
  if (route === '/app/settings') {
    openSettingsWindow()
    return
  }
  if (route === '/canvases' || route.startsWith('/canvases/')) {
    openCanvasWindow({ route })
    return
  }
  if (route.startsWith('/tools/')) {
    openToolWindow({ route })
    return
  }
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send('mcp:open-route', route)
}

function navigationMenuTemplate(): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = []

  navigationGroups.forEach((group, groupIndex) => {
    if (groupIndex > 0) submenu.push({ type: 'separator' })
    submenu.push({ label: group.label, enabled: false })
    group.items.forEach((item) => {
      submenu.push({
        label: item.label,
        accelerator: item.accelerator,
        click: () => openRendererRoute(item.route),
      })
    })
  })

  return {
    label: 'Navigate',
    submenu,
  }
}

export function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
          ],
        } satisfies MenuItemConstructorOptions]
      : []),
    {
      label: 'File',
      submenu: [
        { role: 'close' },
      ],
    },
    navigationMenuTemplate(),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(process.platform === 'darwin'
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              {
                label: 'Speech',
                submenu: [
                  { role: 'startSpeaking' },
                  { role: 'stopSpeaking' },
                ],
              },
            ] satisfies MenuItemConstructorOptions[]
          : [
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' },
            ] satisfies MenuItemConstructorOptions[]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin'
          ? [
              { type: 'separator' },
              { role: 'front' },
            ] satisfies MenuItemConstructorOptions[]
          : [
              { role: 'close' },
            ] satisfies MenuItemConstructorOptions[]),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
