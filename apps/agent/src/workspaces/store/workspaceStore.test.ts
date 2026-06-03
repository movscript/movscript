import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { FileAgentWorkspaceStore, InMemoryAgentWorkspaceStore, validateWorkspace } from './workspaceStore.js'
import { RuntimeTelemetryRegistry } from '../../telemetry/runtime/runtimeTelemetry.js'

test('listWorkspaces filters by threadId and runId', () => {
  const store = new InMemoryAgentWorkspaceStore()

  const threadWorkspace = store.createWorkspace({
    projectId: 1,
    kind: 'production_workspace',
    title: 'thread workspace',
    content: '{}',
    createdByThreadId: 'thread-1',
  })
  const sourceThreadWorkspace = store.createWorkspace({
    projectId: 1,
    kind: 'production_workspace',
    title: 'source thread workspace',
    content: '{}',
    source: { threadId: 'thread-2', runId: 'run-2' },
  })
  store.createWorkspace({
    projectId: 1,
    kind: 'project_standards_workspace',
    title: 'other workspace',
    content: '{}',
    createdByRunId: 'run-9',
  })

  assert.deepEqual(
    store.listWorkspaces({ threadId: 'thread-1' }).map((workspace) => workspace.id),
    [threadWorkspace.id],
  )
  assert.deepEqual(
    store.listWorkspaces({ threadId: 'thread-2' }).map((workspace) => workspace.id),
    [sourceThreadWorkspace.id],
  )
  assert.deepEqual(
    store.listWorkspaces({ runId: 'run-2' }).map((workspace) => workspace.id),
    [sourceThreadWorkspace.id],
  )
  assert.deepEqual(
    store.listWorkspaces({ runId: 'run-9' }).map((workspace) => workspace.kind),
    ['project_standards_workspace'],
  )
})

test('workspace status remains workspace for compatibility and is not a lifecycle gate', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const activeWorkspace = store.createWorkspace({ title: 'active', content: 'workspace' })
  const appliedWorkspace = store.createWorkspace({ title: 'applied', content: 'done' })
  const rejectedWorkspace = store.createWorkspace({ title: 'rejected', content: 'no' })
  store.updateWorkspace(appliedWorkspace.id, { status: 'applied' })
  store.updateWorkspace(rejectedWorkspace.id, { status: 'rejected' })

  assert.equal(store.getWorkspace(appliedWorkspace.id)?.status, 'workspace')
  assert.equal(store.getWorkspace(rejectedWorkspace.id)?.status, 'workspace')
  assert.deepEqual(
    store.listWorkspaces({ statuses: ['workspace', 'applied'] }).map((workspace) => workspace.id).sort(),
    [activeWorkspace.id, appliedWorkspace.id, rejectedWorkspace.id].sort(),
  )
})

test('createWorkspace keeps one current workspace per thread', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const first = store.createWorkspace({ title: 'first', content: '{}', createdByThreadId: 'thread-1' })
  const otherThread = store.createWorkspace({ title: 'other thread', content: '{}', createdByThreadId: 'thread-2' })
  const second = store.createWorkspace({ title: 'second', content: '{}', createdByThreadId: 'thread-1' })

  assert.equal(store.getWorkspace(first.id)?.metadata?.currentWorkspace, false)
  assert.equal(store.getWorkspace(first.id)?.metadata?.supersededByWorkspaceId, second.id)
  assert.equal(store.getWorkspace(second.id)?.metadata?.currentWorkspace, true)
  assert.equal(store.getWorkspace(otherThread.id)?.metadata?.currentWorkspace, true)
  assert.deepEqual(
    store.listWorkspaces({ threadId: 'thread-1', current: true }).map((workspace) => workspace.id),
    [second.id],
  )
})

test('workspace project scopes require positive safe integer ids', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const scopedWorkspace = store.createWorkspace({ projectId: 42, title: 'scoped', content: 'workspace' })
  const zeroWorkspace = store.createWorkspace({ projectId: 0, title: 'zero', content: 'workspace' })
  const fractionalWorkspace = store.createWorkspace({ projectId: 42.5, title: 'fractional', content: 'workspace' })

  assert.equal(scopedWorkspace.projectId, 42)
  assert.equal(zeroWorkspace.projectId, undefined)
  assert.equal(fractionalWorkspace.projectId, undefined)
  assert.deepEqual(store.listWorkspaces({ projectId: 42 }).map((workspace) => workspace.id), [scopedWorkspace.id])
  assert.deepEqual(store.listWorkspaces({ projectId: 0 }), [])
  assert.deepEqual(store.listWorkspaces({ projectId: 42.5 }), [])
  assert.deepEqual(store.listWorkspaces({ projectId: Number.POSITIVE_INFINITY }), [])
})

test('createWorkspace stores WorkspaceDomainModel seed metadata', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    projectId: 42,
    kind: 'project_standards_workspace',
    title: 'seeded project standards workspace',
    content: '{}',
    seed: {
      mode: 'editable_snapshot',
      include: ['project', 'creative_references'],
      modelRef: 'frontend:WorkspaceDomainModel:project_standards_workspace:v1',
      sourceVersions: { project: { id: 42, updatedAt: '2026-05-13T00:00:00.000Z' } },
    },
    metadata: {
      workspace: true,
    },
  })

  assert.deepEqual(workspace.metadata?.seed, {
    mode: 'editable_snapshot',
    include: ['project', 'creative_references'],
    modelRef: 'frontend:WorkspaceDomainModel:project_standards_workspace:v1',
    sourceVersions: { project: { id: 42, updatedAt: '2026-05-13T00:00:00.000Z' } },
  })
  assert.equal(workspace.metadata?.workspace, true)
})

test('createWorkspace rejects non-finite seed values instead of coercing them', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    title: 'workspace',
    content: '{}',
    seed: { score: Number.POSITIVE_INFINITY },
  })

  assert.equal(workspace.metadata?.seed, undefined)
})

test('createWorkspace ignores non-plain source target and metadata records', () => {
  class WorkspaceShape {
    entityType = 'project'
    entityId = 42
    workspace = true
  }

  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    title: 'workspace',
    content: '{}',
    source: new WorkspaceShape(),
    target: new WorkspaceShape(),
    metadata: new WorkspaceShape(),
  })

  assert.equal(workspace.source, undefined)
  assert.equal(workspace.target, undefined)
  assert.equal(workspace.metadata?.currentWorkspace, true)
  assert.equal(workspace.metadata?.workspace, undefined)
})

test('createWorkspace drops non-json source target and metadata fields instead of coercing them', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    title: 'workspace',
    content: '{}',
    source: {
      entityType: 'project',
      entityId: Number.POSITIVE_INFINITY,
      pageEntityId: 42.5,
      pipelineNodeId: 0,
      userId: '',
      pageKey: 'project|42',
    },
    target: {
      entityType: 'project',
      entityId: Number.NaN,
      projectId: 42.5,
      field: 'name',
    },
    metadata: {
      ok: true,
      score: Number.NEGATIVE_INFINITY,
      nested: { value: Number.NaN },
    },
  })

  assert.deepEqual(workspace.source, {
    entityType: 'project',
    pageKey: 'project|42',
  })
  assert.deepEqual(workspace.target, {
    entityType: 'project',
    field: 'name',
  })
  assert.equal(workspace.metadata?.ok, true)
  assert.equal(workspace.metadata?.score, undefined)
  assert.equal(workspace.metadata?.nested, undefined)
})

test('updateWorkspace stores an independent metadata snapshot', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    title: 'workspace',
    content: '{}',
    metadata: { existing: { value: 'stable' } },
  })
  const metadata = {
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
  }

  const updated = store.updateWorkspace(workspace.id, { metadata })
  metadata.nested.value = 'changed'
  metadata.list[0]!.id = 'changed'

  assert.deepEqual(updated.metadata?.existing, { value: 'stable' })
  assert.deepEqual(updated.metadata?.nested, { value: 'original' })
  assert.deepEqual(updated.metadata?.list, [{ id: 'item_1' }])
  assert.deepEqual(store.getWorkspace(workspace.id)?.metadata, updated.metadata)
})

test('updateWorkspace stores an independent target snapshot', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    title: 'workspace',
    content: '{}',
  })
  const target = {
    entityType: 'project',
    entityId: 42,
    nested: { value: 'original' },
  }

  const updated = store.updateWorkspace(workspace.id, { target })
  target.nested.value = 'changed'

  assert.deepEqual(updated.target, {
    entityType: 'project',
    entityId: 42,
    nested: { value: 'original' },
  })
  assert.deepEqual(store.getWorkspace(workspace.id)?.target, updated.target)
})

test('updateWorkspace drops non-json target metadata and user id fields instead of coercing them', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    title: 'workspace',
    content: '{}',
    metadata: { existing: 'stable' },
  })

  const updated = store.updateWorkspace(workspace.id, {
    target: {
      entityType: 'project',
      entityId: Number.NaN,
      field: 'name',
    },
    appliedByUserId: Number.POSITIVE_INFINITY,
    metadata: {
      next: true,
      score: Number.NEGATIVE_INFINITY,
      nested: { value: Number.NaN },
    },
  })

  assert.deepEqual(updated.target, {
    entityType: 'project',
    field: 'name',
  })
  assert.equal(updated.appliedByUserId, undefined)
  assert.equal(updated.metadata?.existing, 'stable')
  assert.equal(updated.metadata?.next, true)
  assert.equal(updated.metadata?.score, undefined)
  assert.equal(updated.metadata?.nested, undefined)
})

test('workspace store drops invalid numeric reference ids at the storage boundary', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    title: 'workspace',
    content: '{}',
    source: {
      entityType: 'scene_moment',
      entityId: 0,
      pageEntityType: 'production',
      pageEntityId: 7.5,
      userId: 42.5,
    },
    target: {
      entityType: 'production',
      entityId: 0,
      projectId: 1.5,
    },
  })

  assert.deepEqual(workspace.source, {
    entityType: 'scene_moment',
    pageEntityType: 'production',
  })
  assert.deepEqual(workspace.target, {
    entityType: 'production',
  })

  const updated = store.updateWorkspace(workspace.id, {
    appliedByUserId: 7.5,
  })
  assert.equal(updated.appliedByUserId, undefined)
})

test('read and edit workspace files with unique text replacement', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    title: 'workspace',
    content: 'alpha beta gamma',
  })

  const read = store.readWorkspaceFile(workspace.filePath ?? '')
  const edited = store.editWorkspaceFile(read.filePath, {
    oldString: 'beta',
    newString: 'delta',
    replaceAll: false,
  })

  assert.equal(read.filePath, workspace.filePath)
  assert.equal(read.content, 'alpha beta gamma')
  assert.equal(edited.workspace.content, 'alpha delta gamma')
})

test('validateWorkspace accepts any non-empty workspace kind and content', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'custom_workspace',
    title: 'custom workspace',
    content: JSON.stringify({ workspace: { value: true } }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, true)
  assert.equal(validation.issues.filter((issue) => issue.severity === 'error').length, 0)
})

test('validateWorkspace rejects missing generic workspace fields', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = {
    ...store.createWorkspace({ title: 'workspace', content: 'content' }),
    kind: '',
    title: '',
    content: '',
  }

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /Workspace title is required/)
  assert.match(JSON.stringify(validation.issues), /Workspace kind is required/)
  assert.match(JSON.stringify(validation.issues), /Workspace content is required/)
})

test('file workspace store persists workspace content files across rebuilds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-workspaces-'))
  try {
    const workspacePath = join(dir, 'workspaces.json')
    const store = new FileAgentWorkspaceStore(workspacePath)
    const workspace = store.createWorkspace({
      projectId: 42,
      kind: 'project_standards_workspace',
      title: 'Review note',
      content: 'Check storyboard-line gaps.',
      source: { entityType: 'scene_moment', entityId: 12 },
    })

    assert.equal(existsSync(workspace.filePath ?? ''), true)

    const rebuilt = new FileAgentWorkspaceStore(workspacePath)
    const restored = rebuilt.getWorkspace(workspace.id)
    const read = rebuilt.readWorkspaceFile(workspace.filePath ?? '')

    assert.equal(restored?.title, 'Review note')
    assert.equal(restored?.source?.entityType, 'scene_moment')
    assert.equal(read.content, 'Check storyboard-line gaps.')
    assert.equal(rebuilt.listWorkspaces({ projectId: 42 }).length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file workspace store records storage telemetry on persist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-workspaces-'))
  try {
    const workspacePath = join(dir, 'workspaces.json')
    const telemetry = new RuntimeTelemetryRegistry()
    const store = new FileAgentWorkspaceStore(workspacePath, telemetry)

    store.createWorkspace({
      projectId: 42,
      kind: 'project_standards_workspace',
      title: 'Review note',
      content: 'Check storyboard-line gaps.',
    })

    const metrics = telemetry.snapshot().metrics
    assert.equal(metrics.some((sample) => sample.name === 'movscript_agent_storage_flush_duration_ms' && sample.labels?.component === 'workspace_store'), true)
    assert.equal(metrics.some((sample) => sample.name === 'movscript_agent_storage_file_bytes' && sample.labels?.kind === 'workspace_index_file' && sample.value > 0), true)
    assert.equal(metrics.some((sample) => sample.name === 'movscript_agent_storage_file_bytes' && sample.labels?.kind === 'workspace_content_files' && sample.value > 0), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file workspace store treats workspace content files as authoritative', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-workspaces-'))
  try {
    const workspacePath = join(dir, 'workspaces.json')
    const store = new FileAgentWorkspaceStore(workspacePath)
    const workspace = store.createWorkspace({
      projectId: 42,
      kind: 'project_standards_workspace',
      title: 'Review note',
      content: 'before',
    })

    writeFileSync(workspace.filePath ?? '', 'after external file edit', 'utf8')

    assert.equal(store.getWorkspace(workspace.id)?.content, 'after external file edit')
    assert.equal(store.listWorkspaces({ projectId: 42 })[0]?.content, 'after external file edit')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file workspace store normalizes invalid persisted reference ids on load', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-workspaces-'))
  try {
    const workspacePath = join(dir, 'workspaces.json')
    writeFileSync(workspacePath, JSON.stringify({
      version: 2,
      workspaces: [{
        id: 'workspace_1',
        projectId: 42.5,
        kind: 'project_standards_workspace',
        title: 'Persisted workspace',
        content: 'Persisted content',
        status: 'workspace',
        source: {
          entityType: 'scene_moment',
          entityId: 0,
          pageEntityType: 'production',
          pageEntityId: 7.5,
          userId: '',
        },
        target: {
          entityType: 'production',
          entityId: 0,
          projectId: 7.5,
        },
        appliedByUserId: 7.5,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }), 'utf8')

    const store = new FileAgentWorkspaceStore(workspacePath)
    const workspace = store.getWorkspace('workspace_1')

    assert.equal(workspace?.projectId, undefined)
    assert.deepEqual(workspace?.source, {
      entityType: 'scene_moment',
      pageEntityType: 'production',
    })
    assert.deepEqual(workspace?.target, {
      entityType: 'production',
    })
    assert.equal(workspace?.appliedByUserId, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file workspace store ignores corrupt or non-object data files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-workspaces-'))
  try {
    const workspacePath = join(dir, 'workspaces.json')
    writeFileSync(workspacePath, '{not-json', 'utf8')
    const corruptStore = new FileAgentWorkspaceStore(workspacePath)
    assert.deepEqual(corruptStore.listWorkspaces(), [])

    writeFileSync(workspacePath, '["workspace_1"]', 'utf8')
    const nonObjectStore = new FileAgentWorkspaceStore(workspacePath)
    assert.deepEqual(nonObjectStore.listWorkspaces(), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
