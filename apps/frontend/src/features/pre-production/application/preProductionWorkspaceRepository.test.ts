import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deletePreProductionWorkspaceAssetSlot,
  loadPreProductionWorkspaceData,
  preProductionWorkspaceProjectPath,
  savePreProductionWorkspaceAssetSlot,
  savePreProductionWorkspaceSetting,
} from './preProductionWorkspaceRepository'

test('pre-production workspace repository reads settings and asset slots from local projection files', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>([
    ['data/users/local/projects/7/references/setting_12.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      id: 12,
      project_id: 7,
      kind: 'person',
      name: 'Local Character',
    })],
    ['data/users/local/projects/7/assets/asset_slot_32.json', JSON.stringify({
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
    assert.equal(data.projectPath, 'data/users/local/projects/7')
    assert.equal(data.settings[0].ID, 12)
    assert.equal(data.settings[0].name, 'Local Character')
    assert.equal(data.assetSlots[0].ID, 32)
    assert.equal(data.assetSlots[0].setting_id, 12)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace repository discovers existing user project paths when the manifest has no active user', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>([
    ['data/users/1/projects/1/settings/setting.workspace.json', JSON.stringify({
      schema: 'movscript.setting_workspace.v1',
      workspace: {
        settings: [
          {
            ID: 1,
            project_id: 1,
            kind: 'person',
            name: 'Snapshot Character',
          },
        ],
      },
    })],
    ['data/users/1/projects/1/assets/asset.workspace.json', JSON.stringify({
      schema: 'movscript.asset_workspace.v1',
      workspace: {
        asset_slots: [
          {
            ID: 2,
            project_id: 1,
            kind: 'image',
            name: 'Snapshot Asset',
            setting_id: 1,
          },
        ],
      },
    })],
  ])

  setWorkspaceTestWindow(files)
  try {
    const data = await loadPreProductionWorkspaceData(1)
    assert.equal(data.projectPath, 'data/users/1/projects/1')
    assert.equal(data.settings.length, 1)
    assert.equal(data.settings[0].name, 'Snapshot Character')
    assert.equal(data.assetSlots.length, 1)
    assert.equal(data.assetSlots[0].name, 'Snapshot Asset')
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace repository writes new settings as editable projections', async () => {
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
    const written = [...files.entries()].find(([path]) => path.startsWith('data/users/local/projects/8/references/setting_local-'))
    assert.ok(written)
    const projection = JSON.parse(written[1])
    assert.equal(projection.schema, 'movscript.setting.v1')
    assert.equal(projection.project_id, 8)
    assert.equal(projection.name, 'Local Place')
    assert.equal(projection.id, undefined)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace repository keeps local asset drafts on their client-id path', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>([
    ['data/users/local/projects/8/assets/asset_slot_local-existing.json', JSON.stringify({
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
    assert.equal(files.has('data/users/local/projects/8/assets/asset_slot_local-existing.json'), true)
    assert.equal(files.has(`data/users/local/projects/8/assets/asset_slot_${record.ID}.json`), false)
    assert.equal(JSON.parse(files.get('data/users/local/projects/8/assets/asset_slot_local-existing.json') ?? '{}').name, 'Updated Local Asset')
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

    const written = [...files.entries()].find(([path]) => path.startsWith('data/users/local/projects/8/assets/asset_slot_local-'))
    assert.ok(written)
    const projection = JSON.parse(written[1])
    assert.equal(projection.schema, 'movscript.asset_slot.v1')
    assert.equal(projection.kind, 'video')
    assert.equal(projection.owner_type, 'asset_slot')
    assert.equal(projection.owner_id, 30)
    assert.equal(projection.resource_id, 99)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace repository deletes local asset drafts by client id', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>([
    ['data/users/local/projects/8/assets/asset_slot_local-delete.json', JSON.stringify({
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
    assert.equal(files.has('data/users/local/projects/8/assets/asset_slot_local-delete.json'), false)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('pre-production workspace project path follows the current workspace layout', () => {
  assert.equal(preProductionWorkspaceProjectPath('local', 9), 'data/users/local/projects/9')
})

function setWorkspaceTestWindow(files: Map<string, string>): void {
  const directories = directoriesForFiles(files)
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        getMovScriptWorkspaceRoot: async () => ({
          workspaceDir: '/tmp/movscript',
          controlDir: '/tmp/movscript/.movscript',
          manifestPath: '/tmp/movscript/.movscript/manifest.json',
          projectionRootDir: '/tmp/movscript/.movscript/data',
          reviewsDir: '/tmp/movscript/.movscript/reviews',
          syncDir: '/tmp/movscript/.movscript/sync',
          providersDir: '/tmp/movscript/.movscript/providers',
          manifest: {
            schema: 'movscript.workspace-root.v1',
            workspaceId: 'test',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            layout: {
              projectionRoot: 'data',
              reviewsRoot: 'reviews',
              syncRoot: 'sync',
              providerConfigRoot: 'providers',
            },
          },
        }),
        listMovScriptWorkspaceFiles: async ({ path }: { path?: string } = {}) => ({
          rootPath: '/tmp/movscript/.movscript',
          path: path ?? '',
          entries: listWorkspaceTestEntries(files, directories, path ?? ''),
        }),
        readMovScriptWorkspaceFile: async ({ path }: { path: string }) => ({
          rootPath: '/tmp/movscript/.movscript',
          path,
          content: files.get(path) ?? '',
          size: files.get(path)?.length ?? 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        writeMovScriptWorkspaceFile: async ({ path, content }: { path: string; content: string }) => {
          files.set(path, content)
          return {
            rootPath: '/tmp/movscript/.movscript',
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
