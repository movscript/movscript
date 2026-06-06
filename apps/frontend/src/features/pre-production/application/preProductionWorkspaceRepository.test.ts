import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deletePreProductionWorkspaceAssetSlot,
  loadPreProductionWorkspaceData,
  preProductionWorkspaceEditPath,
  savePreProductionWorkspaceAssetSlot,
  savePreProductionWorkspaceSetting,
} from './preProductionWorkspaceRepository'

test('pre-production workspace repository reads settings and asset slots from edit files', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>([
    ['edit/setting/setting_12.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      id: 12,
      project_id: 7,
      kind: 'person',
      name: 'Local Character',
    })],
    ['edit/assets/asset_slot_32.json', JSON.stringify({
      schema: 'movscript.asset_slot.v1',
      id: 32,
      project_id: 7,
      kind: 'image',
      name: 'Local Asset',
      setting_id: 12,
    })],
  ])

  setWorkspaceTestWindow(files)
  try {
    const data = await loadPreProductionWorkspaceData(7)
    assert.equal(data.projectPath, 'edit')
    assert.equal(data.settings[0].ID, 12)
    assert.equal(data.settings[0].name, 'Local Character')
    assert.equal(data.assetSlots[0].ID, 32)
    assert.equal(data.assetSlots[0].setting_id, 12)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace repository reads asset candidate files from candidate folders', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>([
    ['edit/assets/asset_slot_32.json', JSON.stringify({
      schema: 'movscript.asset_slot.v1',
      id: 32,
      project_id: 7,
      kind: 'image',
      name: 'Local Asset',
    })],
    ['edit/assets/asset_slot_32.candidates/candidate_local.json', JSON.stringify({
      schema: 'movscript.candidate.v1',
      client_id: 'candidate_local',
      project_id: 7,
      target: { type: 'asset_slot', id: 32 },
      resource_id: 99,
      status: 'candidate',
    })],
  ])

  setWorkspaceTestWindow(files)
  try {
    const data = await loadPreProductionWorkspaceData(7)
    assert.equal(data.candidates.length, 1)
    assert.equal(data.candidates[0].asset_slot_id, 32)
    assert.equal(data.candidates[0].resource_id, 99)
    assert.equal(data.candidates[0].__workspace_path, 'edit/assets/asset_slot_32.candidates/candidate_local.json')
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace repository writes new settings as editable files', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    const record = await savePreProductionWorkspaceSetting(8, null, {
      kind: 'place',
      name: 'Local Place',
      description: 'Draft only',
    })
    assert.equal(record.name, 'Local Place')
    const written = [...files.entries()].find(([path]) => path.startsWith('edit/setting/setting_local-'))
    assert.ok(written)
    const file = JSON.parse(written[1])
    assert.equal(file.schema, 'movscript.setting.v1')
    assert.equal(file.project_id, 8)
    assert.equal(file.name, 'Local Place')
    assert.equal(file.id, undefined)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace repository keeps local asset drafts on their client-id path', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>([
    ['edit/assets/asset_slot_local-existing.json', JSON.stringify({
      schema: 'movscript.asset_slot.v1',
      client_id: 'local-existing',
      project_id: 8,
      kind: 'image',
      name: 'Local Asset',
    })],
  ])
  setWorkspaceTestWindow(files)
  try {
    const data = await loadPreProductionWorkspaceData(8)
    const record = data.assetSlots[0]

    const saved = await savePreProductionWorkspaceAssetSlot(8, record, {
      name: 'Updated Local Asset',
      kind: 'image',
    })

    assert.equal(saved.client_id, 'local-existing')
    assert.equal(files.has('edit/assets/asset_slot_local-existing.json'), true)
    assert.equal(files.has(`edit/assets/asset_slot_${record.ID}.json`), false)
    assert.equal(JSON.parse(files.get('edit/assets/asset_slot_local-existing.json') ?? '{}').name, 'Updated Local Asset')
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace repository writes local asset candidates as owned asset slots', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    await savePreProductionWorkspaceAssetSlot(8, null, {
      kind: 'video',
      name: 'Candidate Clip',
      status: 'candidate',
      owner_type: 'asset_slot',
      owner_id: 30,
      resource_id: 99,
    })

    const written = [...files.entries()].find(([path]) => path.startsWith('edit/assets/asset_slot_local-'))
    assert.ok(written)
    const file = JSON.parse(written[1])
    assert.equal(file.schema, 'movscript.asset_slot.v1')
    assert.equal(file.kind, 'video')
    assert.equal(file.owner_type, 'asset_slot')
    assert.equal(file.owner_id, 30)
    assert.equal(file.resource_id, 99)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace repository deletes local asset drafts by client id', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>([
    ['edit/assets/asset_slot_local-delete.json', JSON.stringify({
      schema: 'movscript.asset_slot.v1',
      client_id: 'local-delete',
      project_id: 8,
      kind: 'image',
      name: 'Delete Me',
    })],
  ])
  setWorkspaceTestWindow(files)
  try {
    const data = await loadPreProductionWorkspaceData(8)
    await deletePreProductionWorkspaceAssetSlot(8, data.assetSlots[0])
    assert.equal(files.has('edit/assets/asset_slot_local-delete.json'), false)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace project path follows the current workspace layout', () => {
  assert.equal(preProductionWorkspaceEditPath(), 'edit')
})

function setWorkspaceTestWindow(files: Map<string, string>): void {
  const directories = directoriesForFiles(files)
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        getMovScriptWorkspaceRoot: async () => ({
          workspaceDir: '/tmp/movscript',
          rootDir: '/tmp/movscript',
          controlDir: '/tmp/movscript/.movscript',
          manifestPath: '/tmp/movscript/.movscript/manifest.json',
          editDir: '/tmp/movscript/edit',
          buildDir: '/tmp/movscript/.build',
          buildCurrentDir: '/tmp/movscript/.build/current',
          buildIndexesDir: '/tmp/movscript/.build/indexes',
          buildReviewsDir: '/tmp/movscript/.build/reviews',
          buildManifestsDir: '/tmp/movscript/.build/manifests',
          providersDir: '/tmp/movscript/.movscript/providers',
          backendDir: '/tmp/movscript/.movscript/backend',
          manifest: {
            schema: 'movscript.project-workspace.v1',
            workspaceId: 'test',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            layout: {
              editableRoot: 'edit',
              buildRoot: '.build',
              providerConfigRoot: 'providers',
            },
          },
        }),
        listMovScriptWorkspaceFiles: async ({ path }: { path?: string } = {}) => ({
          rootPath: '/tmp/movscript',
          path: path ?? '',
          entries: listWorkspaceTestEntries(files, directories, path ?? ''),
        }),
        readMovScriptWorkspaceFile: async ({ path }: { path: string }) => ({
          rootPath: '/tmp/movscript',
          path,
          content: files.get(path) ?? '',
          size: files.get(path)?.length ?? 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        writeMovScriptWorkspaceFile: async ({ path, content }: { path: string; content: string }) => {
          files.set(path, content)
          return {
            rootPath: '/tmp/movscript',
            path,
            content,
            size: content.length,
            updatedAt: '2026-01-01T00:00:00.000Z',
          }
        },
        deleteMovScriptWorkspaceFile: async ({ path }: { path: string }) => {
          files.delete(path)
          return { ok: true }
        },
      },
    },
  })
}

function directoriesForFiles(files: Map<string, string>): Set<string> {
  const directories = new Set<string>([''])
  for (const filePath of files.keys()) {
    const parts = filePath.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join('/'))
    }
  }
  return directories
}

function listWorkspaceTestEntries(files: Map<string, string>, directories: Set<string>, path: string): Array<{
  name: string
  path: string
  kind: 'file' | 'directory'
  size: number
  updatedAt: string
}> {
  const prefix = path ? `${path}/` : ''
  const entries = new Map<string, {
    name: string
    path: string
    kind: 'file' | 'directory'
    size: number
    updatedAt: string
  }>()

  for (const directory of directories) {
    if (!directory.startsWith(prefix)) continue
    const relative = directory.slice(prefix.length)
    if (!relative || relative.includes('/')) continue
    entries.set(directory, {
      name: relative,
      path: directory,
      kind: 'directory',
      size: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  }
  for (const filePath of files.keys()) {
    if (!filePath.startsWith(prefix)) continue
    const relative = filePath.slice(prefix.length)
    if (!relative || relative.includes('/')) continue
    entries.set(filePath, {
      name: relative,
      path: filePath,
      kind: 'file',
      size: files.get(filePath)?.length ?? 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  }
  return [...entries.values()]
}

function restoreWindow(previous: Window & typeof globalThis | undefined): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: previous,
  })
}
