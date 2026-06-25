import type { BrowserWindow } from 'electron'

export function bindDevtoolsShortcut(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools()
    }
  })
}
