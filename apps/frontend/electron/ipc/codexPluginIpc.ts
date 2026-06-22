import { BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import type { ElectronAPI } from '../../src/shared/contracts/electronApi'
import {
  codexPluginInstallCommand,
  installMovScriptCodexPlugin,
  openCodexApp,
} from '../services/codexPluginInstaller'
import { enterTrayMode } from '../services/desktopPresence'

export function registerCodexPluginIpcHandlers(): void {
  ipcMain.handle('codex-plugin:install-movscript', async (event): Promise<Awaited<ReturnType<NonNullable<ElectronAPI['installMovScriptCodexPlugin']>>>> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    let installed = false
    try {
      const result = await installMovScriptCodexPlugin()
      installed = true
      const { response } = await showMessageBox(win, {
        type: 'info',
        title: 'MovScript 插件已安装',
        message: '已为 Codex 安装 MovScript 插件。',
        detail: `安装来源 ${result.paths.marketplaceRoot}.\n是否现在打开 Codex？`,
        buttons: ['打开 Codex', '稍后'],
        defaultId: 0,
        cancelId: 1,
      })
      const openedCodex = response === 0
      if (openedCodex) {
        try {
          await openCodexApp()
        } catch (error) {
          await showMessageBox(win, {
            type: 'error',
            title: 'Codex 打开失败',
            message: 'MovScript 插件已安装，但无法自动打开 Codex。',
            detail: errorMessage(error),
            buttons: ['确定'],
          })
          throw error
        }
        win?.hide()
        enterTrayMode()
      }
      return {
        ok: true,
        openedCodex,
        marketplaceRoot: result.paths.marketplaceRoot,
        installCommand: result.installCommand,
      }
    } catch (error) {
      if (installed) throw error
      const command = codexPluginInstallCommand()
      clipboard.writeText(command)
      await showMessageBox(win, {
        type: 'error',
        title: 'Codex 插件安装失败',
        message: 'MovScript 无法自动安装 Codex 插件。',
        detail: `${errorMessage(error)}\n\n安装命令已复制到剪贴板。`,
        buttons: ['确定'],
      })
      throw error
    }
  })
}

function showMessageBox(
  win: BrowserWindow | null,
  options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
