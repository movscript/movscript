import assert from 'node:assert/strict'
import test from 'node:test'

import {
  listWorkspaceScripts,
  saveWorkspaceScript,
  scriptWorkspaceProjectPath,
} from './scriptWorkspaceRepository'

test('script workspace repository reads scripts from edit workspace files', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>([
    ['edit/scripts/script_12/script.md', 'Scene one text'],
    ['edit/scripts/script_12/script.meta.json', JSON.stringify({
      ID: 12,
      project_id: 9,
      title: 'Opening Draft',
      script_type: 'episode',
      order: 3,
      summary: 'A local script.',
      CreatedAt: '2026-01-01T00:00:00.000Z',
      UpdatedAt: '2026-01-02T00:00:00.000Z',
    })],
  ])

  setWorkspaceTestWindow(files)
  try {
    const scripts = await listWorkspaceScripts(9)
    assert.equal(scripts.length, 1)
    assert.equal(scripts[0].ID, 12)
    assert.equal(scripts[0].title, 'Opening Draft')
    assert.equal(scripts[0].content, 'Scene one text')
    assert.equal(scripts[0].raw_source, 'Scene one text')
    assert.equal(scripts[0].script_type, 'episode')
  } finally {
    restoreWindow(previousWindow)
  }
})

test('script workspace repository saves script body and metadata into edit workspace files', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>([
    ['edit/scripts/script_12/script.md', 'Old text'],
    ['edit/scripts/script_12/script.meta.json', JSON.stringify({
      ID: 12,
      project_id: 9,
      title: 'Old Title',
      script_type: 'episode',
      CreatedAt: '2026-01-01T00:00:00.000Z',
      UpdatedAt: '2026-01-02T00:00:00.000Z',
    })],
  ])

  setWorkspaceTestWindow(files)
  try {
    const saved = await saveWorkspaceScript(9, 12, {
      title: 'New Title',
      content: 'New local text',
      script_type: 'finale',
    })
    assert.equal(saved.title, 'New Title')
    assert.equal(saved.content, 'New local text')
    assert.equal(files.get('edit/scripts/script_12/script.md'), 'New local text')
    const meta = JSON.parse(files.get('edit/scripts/script_12/script.meta.json') ?? '{}')
    assert.equal(meta.title, 'New Title')
    assert.equal(meta.script_type, 'finale')
    assert.equal(meta.content, undefined)
    assert.equal(meta.raw_source, undefined)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('script workspace project path follows the current workspace layout', () => {
  assert.equal(scriptWorkspaceProjectPath('local', 9), 'edit')
})

function setWorkspaceTestWindow(files: Map<string, string>): void {
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
          rootPath: '/tmp/movscript/.movscript',
          path: path ?? '',
          entries: listWorkspaceTestEntries(files, directoriesForFiles(files), path ?? ''),
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
