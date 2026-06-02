import assert from 'node:assert/strict'
import test from 'node:test'
import { WORKSPACE_CONTENT_SCHEMA_IDS } from '@movscript/workspaces'
import { InMemoryAgentWorkspaceStore } from '../../../workspaces/store/workspaceStore.js'
import { AgentFileSystem } from './agentFileSystem.js'
import { WorkspaceFileProvider, workspaceContentFileRef } from '../../providers/workspaceFileProvider.js'

test('AgentFileSystem reads, searches, and edits workspace content through canonical refs', () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({
    kind: 'asset_workspace',
    title: 'Assets',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.assetWorkspace,
      scope: 'asset_workspace',
      workspace: { creative_references: [], asset_slots: [], candidate_plans: [] },
    }, null, 2),
  })
  const fileSystem = new AgentFileSystem([new WorkspaceFileProvider(workspaceStore)])
  const ref = workspaceContentFileRef(workspace.id)

  const read = fileSystem.read({ ref })
  assert.equal(read.file.ref, ref)
  assert.match(read.revision, /^sha256:/)
  assert.equal((read.validation as any).ok, true)

  const search = fileSystem.search({ ref, query: 'candidate_plans' })
  assert.equal(search.matchCount, 1)
  assert.equal(search.matches[0]?.line > 0, true)

  const edited = fileSystem.edit({
    ref,
    precondition: { baseRevision: read.revision },
    edits: [{
      type: 'replace_text',
      oldText: '"candidate_plans": []',
      newText: '"candidate_plans": [{"name":"TaskGraph A"}]',
    }],
    createdByRunId: 'run_1',
  })

  assert.equal(edited.changeSet.fileRef, ref)
  assert.equal(edited.changeSet.baseRevision, read.revision)
  assert.match(edited.changeSet.nextRevision, /^sha256:/)
  assert.equal(edited.changeSet.createdByRunId, 'run_1')
  assert.deepEqual(JSON.parse(workspaceStore.getWorkspace(workspace.id)?.content ?? '{}').workspace.candidate_plans, [{ name: 'TaskGraph A' }])
})

test('AgentFileSystem applies constrained context text patches to workspace content', () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({
    kind: 'project_standards_workspace',
    title: 'Patchable note',
    content: [
      'line one',
      'line two',
      'line three',
    ].join('\n'),
  })
  const fileSystem = new AgentFileSystem([new WorkspaceFileProvider(workspaceStore)])
  const ref = workspaceContentFileRef(workspace.id)
  const read = fileSystem.read({ ref })

  const edited = fileSystem.edit({
    ref,
    precondition: { baseRevision: read.revision },
    edits: [{
      type: 'apply_patch',
      patch: [
        '*** Begin Patch',
        '*** Update File: content',
        '@@',
        ' line one',
        '-line two',
        '+line 2',
        ' line three',
        '*** End Patch',
      ].join('\n'),
    }],
  })

  assert.equal(edited.changeSet.replacementCount, 1)
  assert.equal(workspaceStore.getWorkspace(workspace.id)?.content, 'line one\nline 2\nline three')
})

test('AgentFileSystem reads and edits persisted workspace content through workspace refs', () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({ kind: 'setting_workspace', title: 'Setting workspace', content: '{"a":1}' })
  const fileSystem = new AgentFileSystem([
    new WorkspaceFileProvider(workspaceStore),
  ])
  const ref = workspaceContentFileRef(workspace.id)

  const read = fileSystem.read({ ref })
  assert.equal(read.file.provider, 'workspace')
  assert.equal(read.file.ref, ref)

  fileSystem.edit({
    ref,
    edits: [{ type: 'set_content', content: '{"a":2}' }],
  })

  assert.equal(workspaceStore.getWorkspace(workspace.id)?.content, '{"a":2}')
})

test('AgentFileSystem rejects stale workspace edit revisions', () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({ kind: 'project_standards_workspace', title: 'Standards', content: '{"a":1}' })
  const fileSystem = new AgentFileSystem([new WorkspaceFileProvider(workspaceStore)])
  const ref = workspaceContentFileRef(workspace.id)

  assert.throws(
    () => fileSystem.edit({
      ref,
      precondition: { baseRevision: 'sha256:stale' },
      edits: [{ type: 'set_content', content: '{"a":2}' }],
    }),
    /baseRevision mismatch/,
  )
})
