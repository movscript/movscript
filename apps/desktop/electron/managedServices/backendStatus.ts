import { BrowserWindow } from 'electron'
import type { BackendStatus } from '../services/backend'

export function broadcastBackendStatus(status: BackendStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('backend:status', status)
  }
}
