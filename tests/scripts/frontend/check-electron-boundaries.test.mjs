import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { checkElectronBoundaries } from '../../../apps/frontend/scripts/check-electron-boundaries.mjs'

test('check-electron-boundaries accepts the intended Electron and renderer MCP layout', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'electron/main.ts', "import { createWindow } from './appWindow'\n")
    await writeFixtureFile(root, 'electron/appWindow.ts', "export { createWindow } from './appWindow/create'\n")
    await writeFixtureFile(root, 'electron/managedServices.ts', "export { ensureMCPServerReady } from './managedServices/mcp'\n")
    await writeFixtureFile(root, 'electron/preload.ts', "import { createElectronAPI } from './preload/api'\n")
    await writeFixtureFile(root, 'electron/mcp/server.ts', "export function startMCPServer() {}\n")
    await writeFixtureFile(root, 'electron/services/backend.ts', "export const LOCAL_BACKEND_URL = 'http://localhost:8080'\n")
    await writeFixtureFile(root, 'src/electron/ElectronMCPContextBridge.tsx', 'export function ElectronMCPContextBridge() { return null }\n')
    await writeFixtureFile(root, 'src/features/agent/presentation/mcpStatus.ts', 'export function toastMCPStatus() {}\n')
    await writeFixtureFile(root, 'src/features/plugins/infrastructure/mcpTools.ts', 'export function createMcpTools() {}\n')
    await writeFixtureFile(root, 'src/shared/contracts/mcpContext.ts', 'export interface MCPContextUpdate {}\n')

    assert.deepEqual(checkElectronBoundaries(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('check-electron-boundaries reports Electron and renderer MCP boundary violations', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'electron/main.ts', "import { helper } from './mcp/backendClient/fetch'\n")
    await writeFixtureFile(root, 'electron/randomRuntime.ts', 'export const bad = true\n')
    await writeFixtureFile(root, 'src/mcp/server.ts', 'export const bad = true\n')
    await writeFixtureFile(root, 'src/shared/infrastructure/mcpTools.ts', 'export const bad = true\n')
    await writeFixtureFile(root, 'src/features/agent/presentation/otherMCPHelper.ts', 'export const bad = true\n')
    await writeFixtureFile(root, 'src/features/plugins/application/legacy.ts', "import { createMcpTools } from '@/shared/infrastructure/mcpTools'\n")

    const failures = checkElectronBoundaries(root)

    assert.ok(failures.some((item) => item.includes('Unexpected top-level electron TypeScript file: electron/randomRuntime.ts')))
    assert.ok(failures.some((item) => item.includes('Removed renderer MCP path still exists: src/mcp')))
    assert.ok(failures.some((item) => item.includes('Removed renderer MCP path still exists: src/shared/infrastructure/mcpTools.ts')))
    assert.ok(failures.some((item) => item.includes('Unexpected renderer MCP-named file: src/features/agent/presentation/otherMCPHelper.ts')))
    assert.ok(failures.some((item) => item.includes('renderer shared MCP helper import: src/features/plugins/application/legacy.ts')))
    assert.ok(failures.some((item) => item.includes('Electron deep import across MCP implementation directories: electron/main.ts')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function createFrontendFixture() {
  return mkdtemp(join(tmpdir(), 'movscript-electron-boundaries-'))
}

async function writeFixtureFile(root, path, contents) {
  const file = join(root, path)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, contents)
}
