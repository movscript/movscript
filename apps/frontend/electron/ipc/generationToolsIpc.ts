import { ipcMain } from 'electron'
import { setMCPGenerationToolsSettings, testMCPGenerationToolServer } from '../mcp/server'
import type { GenerationToolServer, GenerationToolsSettings } from '../../src/shared/contracts/generationTools'

export function registerGenerationToolsIpcHandlers(): void {
  ipcMain.handle('generation-tools:set-settings', (_e, settings?: GenerationToolsSettings) => {
    setMCPGenerationToolsSettings(settings)
  })

  ipcMain.handle('generation-tools:test-server', (_e, server?: Partial<GenerationToolServer>) => {
    return testMCPGenerationToolServer(server ?? {})
  })
}
