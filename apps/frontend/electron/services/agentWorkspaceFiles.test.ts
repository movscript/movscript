import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deleteAgentWorkspaceFile,
  listAgentWorkspaceFiles,
  readAgentWorkspaceFile,
  writeAgentWorkspaceFile,
} from './agentWorkspaceFiles'

test('manages frontend-owned agent workspace files under .movscript', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-'))
  try {
    const written = await writeAgentWorkspaceFile({
      workspaceDir,
      path: 'drafts/project.workspace.json',
      content: '{"title":"Project"}',
    })

    assert.equal(written.path, 'drafts/project.workspace.json')
    assert.equal(written.content, '{"title":"Project"}')

    const read = await readAgentWorkspaceFile({ workspaceDir, path: 'drafts/project.workspace.json' })
    assert.equal(read.content, '{"title":"Project"}')

    const listed = await listAgentWorkspaceFiles({ workspaceDir, path: 'drafts' })
    assert.deepEqual(listed.entries.map((entry) => entry.path), ['drafts/project.workspace.json'])

    await deleteAgentWorkspaceFile({ workspaceDir, path: 'drafts/project.workspace.json' })
    const afterDelete = await listAgentWorkspaceFiles({ workspaceDir, path: 'drafts' })
    assert.deepEqual(afterDelete.entries, [])
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('rejects workspace file paths outside .movscript root', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-workspace-files-'))
  try {
    await assert.rejects(
      writeAgentWorkspaceFile({
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
