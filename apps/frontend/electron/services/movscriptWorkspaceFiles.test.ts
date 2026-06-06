import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deleteMovScriptWorkspaceFile,
  listMovScriptWorkspaceFiles,
  readMovScriptWorkspaceFile,
  writeMovScriptWorkspaceFile,
} from './movscriptWorkspaceFiles'

test('listing the MovScript workspace root initializes core control directories', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-root-'))
  try {
    const listed = await listMovScriptWorkspaceFiles({ workspaceDir })
    const entryNames = listed.entries.map((entry) => entry.name).sort()
    assert.equal(listed.path, '')
    assert.ok(entryNames.includes('manifest.json'))
    assert.ok(entryNames.includes('data'))
    assert.ok(entryNames.includes('reviews'))
    assert.ok(entryNames.includes('sync'))
    assert.ok(entryNames.includes('providers'))
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('manages frontend-owned MovScript workspace files under .movscript', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-'))
  try {
    const written = await writeMovScriptWorkspaceFile({
      workspaceDir,
      path: 'drafts/project.workspace.json',
      content: '{"title":"Project"}',
    })

    assert.equal(written.path, 'drafts/project.workspace.json')
    assert.equal(written.content, '{"title":"Project"}')

    const read = await readMovScriptWorkspaceFile({ workspaceDir, path: 'drafts/project.workspace.json' })
    assert.equal(read.content, '{"title":"Project"}')

    const listed = await listMovScriptWorkspaceFiles({ workspaceDir, path: 'drafts' })
    assert.deepEqual(listed.entries.map((entry) => entry.path), ['drafts/project.workspace.json'])

    await deleteMovScriptWorkspaceFile({ workspaceDir, path: 'drafts/project.workspace.json' })
    const afterDelete = await listMovScriptWorkspaceFiles({ workspaceDir, path: 'drafts' })
    assert.deepEqual(afterDelete.entries, [])
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('rejects workspace file paths outside .movscript root', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-'))
  try {
    await assert.rejects(
      writeMovScriptWorkspaceFile({
        workspaceDir,
        path: '../outside.json',
        content: '{}',
      }),
      /workspace file path must stay inside/,
    )
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})
