import { app, clipboard, dialog, Menu, nativeImage, Tray } from 'electron'
import { openHomeWindow } from './appWindowRegistry'
import { codexPluginInstallCommand, installMovScriptCodexPlugin } from './codexPluginInstaller'
import { resolveAppIconPath, resolveTrayIconPath } from '../appWindow/paths'

let tray: Tray | null = null
let installing = false

export function installAppTray(): void {
  if (tray) return
  if (process.platform === 'darwin') app.dock?.hide()

  tray = new Tray(createTrayImage())
  tray.setToolTip('MovScript')
  tray.on('click', () => {
    openHomeWindow()
  })
  refreshTrayMenu()
}

function refreshTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open MovScript',
      click: () => openHomeWindow(),
    },
    { type: 'separator' },
    {
      label: installing ? 'Installing MovScript plugin for Codex...' : 'Install MovScript plugin for Codex',
      enabled: !installing,
      click: () => {
        void installCodexPluginFromTray()
      },
    },
    {
      label: 'Copy Codex install command',
      click: () => {
        clipboard.writeText(codexPluginInstallCommand())
      },
    },
    { type: 'separator' },
    {
      label: 'Quit MovScript',
      click: () => {
        app.quit()
      },
    },
  ]))
}

async function installCodexPluginFromTray(): Promise<void> {
  if (installing) return
  installing = true
  refreshTrayMenu()
  try {
    const result = await installMovScriptCodexPlugin()
    dialog.showMessageBox({
      type: 'info',
      title: 'MovScript plugin installed',
      message: 'MovScript plugin installed for Codex.',
      detail: `Installed from ${result.paths.marketplaceRoot}.\nRestart Codex or start a new Codex thread to use it.`,
      buttons: ['OK'],
    })
  } catch (error) {
    const command = codexPluginInstallCommand()
    clipboard.writeText(command)
    dialog.showMessageBox({
      type: 'error',
      title: 'Codex plugin install failed',
      message: 'MovScript could not install the Codex plugin automatically.',
      detail: `${errorMessage(error)}\n\nThe install command has been copied to your clipboard.`,
      buttons: ['OK'],
    })
  } finally {
    installing = false
    refreshTrayMenu()
  }
}

function createTrayImage(): Electron.NativeImage {
  if (process.platform === 'darwin') {
    const image = nativeImage.createFromPath(resolveTrayIconPath())
    image.setTemplateImage(true)
    return image
  }
  return nativeImage.createFromPath(resolveAppIconPath()).resize({ width: 16, height: 16 })
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
