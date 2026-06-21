import { app, clipboard, dialog, Menu, nativeImage, Tray } from 'electron'
import { openHomeWindow } from './appWindowRegistry'
import { codexPluginInstallCommand, installMovScriptCodexPlugin } from './codexPluginInstaller'
import { resolveAppIconPath, resolveTrayIconPath } from '../appWindow/paths'

let tray: Tray | null = null
let installing = false
let trayLanguage: 'zh-CN' | 'en-US' = 'en-US'

export function installAppTray(): void {
  if (tray) return
  if (process.platform === 'darwin') app.dock?.hide()

  tray = new Tray(createTrayImage())
  tray.setToolTip('MovScript')
  trayLanguage = detectSystemTrayLanguage()
  tray.on('click', () => {
    tray?.popUpContextMenu()
  })
  refreshTrayMenu()
}

export function refreshAppTrayMenu(): void {
  refreshTrayMenu()
}

function refreshTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: trayLabel('打开 MovScript', 'Open MovScript'),
      click: () => openHomeWindow(),
    },
    { type: 'separator' },
    {
      label: installing
        ? trayLabel('正在安装 Codex 的 MovScript 插件...', 'Installing MovScript plugin for Codex...')
        : trayLabel('安装 Codex 的 MovScript 插件', 'Install MovScript plugin for Codex'),
      enabled: !installing,
      click: () => {
        void installCodexPluginFromTray()
      },
    },
    {
      label: trayLabel('复制 Codex 安装命令', 'Copy Codex install command'),
      click: () => {
        clipboard.writeText(codexPluginInstallCommand())
      },
    },
    { type: 'separator' },
    {
      label: trayLabel('退出 MovScript', 'Quit MovScript'),
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
      title: trayLabel('MovScript 插件已安装', 'MovScript plugin installed'),
      message: trayLabel('已为 Codex 安装 MovScript 插件。', 'MovScript plugin installed for Codex.'),
      detail: `${trayLabel('安装来源', 'Installed from')} ${result.paths.marketplaceRoot}.\n${trayLabel('重启 Codex 或新建 Codex 线程后即可使用。', 'Restart Codex or start a new Codex thread to use it.')}`,
      buttons: [trayLabel('确定', 'OK')],
    })
  } catch (error) {
    const command = codexPluginInstallCommand()
    clipboard.writeText(command)
    dialog.showMessageBox({
      type: 'error',
      title: trayLabel('Codex 插件安装失败', 'Codex plugin install failed'),
      message: trayLabel('MovScript 无法自动安装 Codex 插件。', 'MovScript could not install the Codex plugin automatically.'),
      detail: `${errorMessage(error)}\n\n${trayLabel('安装命令已复制到剪贴板。', 'The install command has been copied to your clipboard.')}`,
      buttons: [trayLabel('确定', 'OK')],
    })
  } finally {
    installing = false
    refreshTrayMenu()
  }
}

function trayLabel(zhCN: string, enUS: string): string {
  return trayLanguage === 'zh-CN' ? zhCN : enUS
}

function detectSystemTrayLanguage(): 'zh-CN' | 'en-US' {
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
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
