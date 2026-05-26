import { dialog, ipcMain } from 'electron'

export function registerDialogIpcHandlers(): void {
  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (_e, defaultPath?: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath })
    return canceled ? null : filePath
  })
}
