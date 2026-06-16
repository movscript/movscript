import { BrowserWindow } from 'electron'

export function broadcastCrossPageNotification(notification: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('cross-page-notification', notification)
  }
}
