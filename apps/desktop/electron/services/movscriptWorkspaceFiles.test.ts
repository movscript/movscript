import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deleteMovScriptWorkspaceFile,
  listMovScriptWorkspaceFiles,
  readMovScriptWorkspaceFile,
  readMovScriptWorkspaceMediaFile,
  writeMovScriptWorkspaceFile,
} from './movscriptWorkspaceFiles'

test('listing the MovScript workspace root initializes core control directories', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-root-'))
  try {
    const listed = await listMovScriptWorkspaceFiles({ workspaceDir })
    const entryNames = listed.entries.map((entry) => entry.name).sort()
    assert.equal(listed.path, '')
    assert.deepEqual(entryNames, ['backend', 'bin', 'manifest.json', 'realms'])
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('manages MovScript workspace files under the project workspace root', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-'))
  const projectDir = join(workspaceDir, 'projects', 'project_6')
  try {
    const written = await writeMovScriptWorkspaceFile({
      workspaceDir,
      projectDir,
      userId: 1,
      projectId: 6,
      path: 'edit/project.json',
      content: '{"title":"Project"}',
      expectedVersion: null,
    })

    assert.equal(written.path, 'edit/project.json')
    assert.equal(written.content, '{"title":"Project"}')
    assert.equal(written.rootPath, projectDir)

    const read = await readMovScriptWorkspaceFile({ workspaceDir, projectDir, userId: 1, projectId: 6, path: 'edit/project.json' })
    assert.equal(read.content, '{"title":"Project"}')

    const listed = await listMovScriptWorkspaceFiles({ workspaceDir, projectDir, userId: 1, projectId: 6, path: 'edit' })
    assert.deepEqual(listed.entries.map((entry) => entry.path), ['edit/project.json'])

    await deleteMovScriptWorkspaceFile({ workspaceDir, projectDir, userId: 1, projectId: 6, path: 'edit/project.json' })
    const afterDelete = await listMovScriptWorkspaceFiles({ workspaceDir, projectDir, userId: 1, projectId: 6, path: 'edit' })
    assert.deepEqual(afterDelete.entries, [])
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('rejects stale workspace file writes when expected version no longer matches', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-lock-'))
  const projectDir = join(workspaceDir, 'projects', 'project_6')
  try {
    const written = await writeMovScriptWorkspaceFile({
      workspaceDir,
      projectDir,
      userId: 1,
      projectId: 6,
      path: 'edit/project.json',
      content: '{"title":"Project"}',
      expectedVersion: null,
    })
    await writeFile(join(written.rootPath, 'edit', 'project.json'), '{"title":"External"}', 'utf8')

    await assert.rejects(
      writeMovScriptWorkspaceFile({
        workspaceDir,
        projectDir,
        userId: 1,
        projectId: 6,
        path: 'edit/project.json',
        content: '{"title":"Saved"}',
        expectedVersion: written.version,
      }),
      /workspace file changed/,
    )
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('rejects workspace file writes without an expected version', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-lock-required-'))
  const projectDir = join(workspaceDir, 'projects', 'project_6')
  try {
    await assert.rejects(
      writeMovScriptWorkspaceFile({
        workspaceDir,
        projectDir,
        userId: 1,
        projectId: 6,
        path: 'edit/project.json',
        content: '{"title":"Project"}',
      }),
      /expectedVersion is required/,
    )
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('manages organization MovScript workspace files under org project root', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-org-'))
  const projectDir = join(workspaceDir, 'org-projects', 'project_6')
  try {
    const written = await writeMovScriptWorkspaceFile({
      workspaceDir,
      projectDir,
      userId: 1,
      orgId: 3,
      projectId: 6,
      path: 'scripts/script_1/script.md',
      content: 'Org script',
      expectedVersion: null,
    })

    assert.equal(written.path, 'scripts/script_1/script.md')
    assert.equal(written.content, 'Org script')
    assert.equal(written.rootPath, projectDir)
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('manages local admin MovScript workspace files under local user project root', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-local-'))
  const projectDir = join(workspaceDir, 'local-projects', 'project_6')
  try {
    const written = await writeMovScriptWorkspaceFile({
      workspaceDir,
      projectDir,
      userId: 1,
      projectId: 6,
      path: 'scripts/script_1/script.md',
      content: 'Local script',
      expectedVersion: null,
    })

    assert.equal(written.rootPath, projectDir)
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('rejects legacy projectId workspace file access without projectDir', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-project-dir-required-'))
  try {
    await assert.rejects(
      writeMovScriptWorkspaceFile({
        workspaceDir,
        projectId: 6,
        path: 'scripts/script_1/script.md',
        content: 'Local script',
        expectedVersion: null,
      }),
      /requires projectDir/,
    )
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
        expectedVersion: null,
      }),
      /workspace file path must stay inside/,
    )
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('previews large workspace images without using the text editor read limit', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-media-'))
  const projectDir = join(workspaceDir, 'projects', 'project_6')
  try {
    const setup = await writeMovScriptWorkspaceFile({
      workspaceDir,
      projectDir,
      userId: 1,
      projectId: 6,
      path: 'artifacts/.keep',
      content: '',
      expectedVersion: null,
    })
    const imagePath = join(setup.rootPath, 'artifacts', 'large.png')
    await writeFile(imagePath, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.alloc(2 * 1024 * 1024 + 1),
    ]))

    await assert.rejects(
      readMovScriptWorkspaceFile({ workspaceDir, projectDir, userId: 1, projectId: 6, path: 'artifacts/large.png' }),
      /workspace file is too large to edit/,
    )
    const preview = await readMovScriptWorkspaceMediaFile({ workspaceDir, projectDir, userId: 1, projectId: 6, path: 'artifacts/large.png' })
    assert.equal(preview.mimeType, 'image/png')
    assert.match(preview.dataUrl, /^data:image\/png;base64,/)
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})
