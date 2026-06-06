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
    assert.ok(entryNames.includes('.build'))
    assert.ok(entryNames.includes('.movscript'))
    assert.ok(entryNames.includes('edit'))
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('manages MovScript workspace files under the project workspace root', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-'))
  try {
    const written = await writeMovScriptWorkspaceFile({
      workspaceDir,
      path: 'edit/project.json',
      content: '{"title":"Project"}',
    })

    assert.equal(written.path, 'edit/project.json')
    assert.equal(written.content, '{"title":"Project"}')

    const read = await readMovScriptWorkspaceFile({ workspaceDir, path: 'edit/project.json' })
    assert.equal(read.content, '{"title":"Project"}')

    const listed = await listMovScriptWorkspaceFiles({ workspaceDir, path: 'edit' })
    assert.deepEqual(listed.entries.map((entry) => entry.path), ['edit/project.json'])

    await deleteMovScriptWorkspaceFile({ workspaceDir, path: 'edit/project.json' })
    const afterDelete = await listMovScriptWorkspaceFiles({ workspaceDir, path: 'edit' })
    assert.deepEqual(afterDelete.entries, [])
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('listing a missing MovScript workspace folder returns an empty directory view', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-missing-'))
  try {
    const listed = await listMovScriptWorkspaceFiles({
      workspaceDir,
      path: 'edit/setting',
    })

    assert.equal(listed.path, 'edit/setting')
    assert.deepEqual(listed.entries, [])
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('rejects workspace file paths outside the project workspace root', async () => {
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
