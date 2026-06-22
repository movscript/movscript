import { app } from 'electron'

export function enterTrayMode(): void {
  if (process.platform === 'darwin') app.dock?.hide()
}
