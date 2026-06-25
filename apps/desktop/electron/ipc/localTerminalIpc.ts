import { BrowserWindow, ipcMain } from 'electron'
import { localTerminalManager } from '../services/localTerminal'
import type {
  ElectronLocalTerminalCreateInput,
  ElectronLocalTerminalKillInput,
  ElectronLocalTerminalResizeInput,
  ElectronLocalTerminalWriteInput,
} from '../../src/shared/contracts/electronApi'

let terminalEventForwarderRegistered = false

export function registerLocalTerminalIpcHandlers(): void {
  ipcMain.handle('terminal:create', (_event, input?: ElectronLocalTerminalCreateInput) => {
    return localTerminalManager.create(input)
  })
  ipcMain.handle('terminal:write', (_event, input: ElectronLocalTerminalWriteInput) => {
    return localTerminalManager.write(input)
  })
  ipcMain.handle('terminal:resize', (_event, input: ElectronLocalTerminalResizeInput) => {
    return localTerminalManager.resize(input)
  })
  ipcMain.handle('terminal:kill', (_event, input: ElectronLocalTerminalKillInput) => {
    return localTerminalManager.kill(input)
  })
  registerTerminalEventForwarder()
}

function registerTerminalEventForwarder(): void {
  if (terminalEventForwarderRegistered) return
  terminalEventForwarderRegistered = true
  localTerminalManager.onEvent((event) => {
    for (const contents of ipcMainEventWebContents()) {
      if (!contents.isDestroyed()) contents.send('terminal:event', event)
    }
  })
}

function ipcMainEventWebContents() {
  return BrowserWindow.getAllWindows().map((window) => window.webContents)
}
