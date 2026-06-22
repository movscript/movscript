import { app } from 'electron'

export function enterTrayMode(): void {
  if (process.platform === 'darwin') app.dock?.hide()
}

export function leaveTrayMode(): void {
  if (process.platform === 'darwin') app.dock?.show()
}
