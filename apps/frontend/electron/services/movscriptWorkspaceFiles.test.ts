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
    assert.ok(entryNames.includes('.build'), `entries: ${entryNames.join(', ')}`)
    assert.ok(entryNames.includes('.movscript'), `entries: ${entryNames.join(', ')}`)
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('manages MovScript workspace files under the project workspace root', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-'))
  try {
    const written = await writeMovScriptWorkspaceFile({
      workspaceDir,
      userId: 1,
      projectId: 6,
      path: 'edit/project.json',
      content: '{"title":"Project"}',
    })

    assert.equal(written.path, 'edit/project.json')
    assert.equal(written.content, '{"title":"Project"}')
    assert.equal(written.rootPath, join(workspaceDir, '.movscript', 'user', '1', 'projects', 'project_6'))

    const read = await readMovScriptWorkspaceFile({ workspaceDir, userId: 1, projectId: 6, path: 'edit/project.json' })
    assert.equal(read.content, '{"title":"Project"}')

    const listed = await listMovScriptWorkspaceFiles({ workspaceDir, userId: 1, projectId: 6, path: 'edit' })
    assert.deepEqual(listed.entries.map((entry) => entry.path), ['edit/project.json'])

    await deleteMovScriptWorkspaceFile({ workspaceDir, userId: 1, projectId: 6, path: 'edit/project.json' })
    const afterDelete = await listMovScriptWorkspaceFiles({ workspaceDir, userId: 1, projectId: 6, path: 'edit' })
    assert.deepEqual(afterDelete.entries, [])
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('manages organization MovScript workspace files under org project root', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-org-'))
  try {
    const written = await writeMovScriptWorkspaceFile({
      workspaceDir,
      userId: 1,
      orgId: 3,
      projectId: 6,
      path: 'scripts/script_1/script.md',
      content: 'Org script',
    })

    assert.equal(written.path, 'scripts/script_1/script.md')
    assert.equal(written.content, 'Org script')
    assert.equal(written.rootPath, join(workspaceDir, '.movscript', 'org', '3', 'projects', 'project_6'))
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('manages anonymous MovScript workspace files under local project root', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-local-'))
  try {
    const written = await writeMovScriptWorkspaceFile({
      workspaceDir,
      projectId: 6,
      path: 'scripts/script_1/script.md',
      content: 'Local script',
    })

    assert.equal(written.rootPath, join(workspaceDir, '.movscript', 'local', 'projects', 'project_6'))
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
