import { dialog, ipcMain, shell } from 'electron'

export function registerDialogIpcHandlers(): void {
  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (_e, defaultPath?: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath })
    return canceled ? null : filePath
  })

  ipcMain.handle('dialog:revealFileInFolder', (_e, input?: { path?: string }) => {
    const filePath = input?.path?.trim()
    if (!filePath) throw new Error('File path is required')
    shell.showItemInFolder(filePath)
    return { ok: true }
  })
}
