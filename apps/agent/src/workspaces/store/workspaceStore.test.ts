import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { FileAgentWorkspaceStore, InMemoryAgentWorkspaceStore, validateWorkspace } from './workspaceStore.js'
import { WORKSPACE_CONTENT_SCHEMA_IDS } from '@movscript/workspaces'
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
  assert.equal(workspace.metadata, undefined)
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
  assert.deepEqual(workspace.metadata, { ok: true })
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

  assert.deepEqual(updated.metadata, {
    existing: { value: 'stable' },
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
  })
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
  assert.deepEqual(updated.metadata, {
    existing: 'stable',
    next: true,
  })
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

test('validateWorkspace accepts canonical project standards workspace content', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'project_standards_workspace',
    title: 'project standards workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.projectStandardsWorkspace,
      scope: 'project_standards_workspace',
      mode: 'snapshot',
      summary: '定义项目级制作规范',
      workspace: {
        project_style: {
          aspect_ratio: '9:16',
          shot_size_system: ['wide', 'medium', 'close-up', 'insert'],
          visual_style: '竖屏短剧写实风格，关键道具和人物表情必须清晰可读。',
          negative_rules: ['不要随机改脸', '不要压暗证据道具'],
          custom_rules: [{
            key: 'character_consistency',
            label: '角色一致性',
            category: '人物',
            value: '主角发型、年龄感和服装气质必须保持一致。',
            prompt_role: 'constraint',
            enabled: true,
            required: false,
            order: 10,
          }],
        },
      },
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, true)
  assert.equal(validation.issues.filter((issue) => issue.severity === 'error').length, 0)
})

test('validateWorkspace rejects malformed project standards custom rules', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'project_standards_workspace',
    title: 'project standards workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.projectStandardsWorkspace,
      scope: 'project_standards_workspace',
      mode: 'snapshot',
      summary: '定义项目级制作规范',
      workspace: {
        project_style: {
          aspect_ratio: '9:16',
          custom_rules: [{
            key: '',
            label: '角色一致性',
            value: '',
            prompt_role: 'bad_role',
            enabled: 'yes',
          }],
        },
      },
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /custom_rules\.key/)
  assert.match(JSON.stringify(validation.issues), /custom_rules\.value/)
  assert.match(JSON.stringify(validation.issues), /prompt_role/)
  assert.match(JSON.stringify(validation.issues), /enabled/)
})

test('validateWorkspace rejects project standards workspace list fields', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'project_standards_workspace',
    title: 'project standards workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.projectStandardsWorkspace,
      scope: 'project_standards_workspace',
      mode: 'snapshot',
      summary: '定义项目级制作规范',
      workspace: {
        project_style: {
          aspect_ratio: '9:16',
        },
        creative_references: [],
      },
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /outside project_standards_workspace/)
})

test('validateWorkspace accepts canonical setting workspace content', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'setting_workspace',
    title: 'setting workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.settingWorkspace,
      scope: 'setting_workspace',
      mode: 'snapshot',
      summary: '整理项目设定',
      workspace: {
        creative_references: [{
          client_id: 'cr_heroine',
          name: '女主',
          kind: 'person',
        }],
      },
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, true)
  assert.equal(validation.issues.filter((issue) => issue.severity === 'error').length, 0)
})

test('validateWorkspace accepts canonical asset slot workspace content', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'asset_workspace',
    title: 'asset slot workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.assetWorkspace,
      scope: 'asset_workspace',
      mode: 'snapshot',
      summary: '整理素材需求',
      workspace: {
        creative_references: [],
        asset_slots: [{
          name: '女主参考图',
          kind: 'image',
          owner: { type: 'creative_reference', id: 12 },
        }],
      },
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, true)
  assert.equal(validation.issues.filter((issue) => issue.severity === 'error').length, 0)
})

test('validateWorkspace rejects mutation-shaped project standards workspace content', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'setting_workspace',
    title: 'project standards workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.settingWorkspace,
      scope: 'setting_workspace',
      mode: 'snapshot',
      summary: '整理项目设定与素材需求',
      workspace: {
        creative_references: [{
          action: 'merge',
          entity: 'creativeReferences',
          target_id: 0,
          source_ids: [0],
          payload: {},
        }],
      },
      legacy_mutations: [],
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /operation fields/)
  assert.match(JSON.stringify(validation.issues), /target_id/)
  assert.match(JSON.stringify(validation.issues), /source_ids/)
})

test('validateWorkspace rejects non-snake-case project standards workspace asset owner type', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'asset_workspace',
    title: 'project standards workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.assetWorkspace,
      scope: 'asset_workspace',
      mode: 'snapshot',
      summary: '整理项目设定与素材需求',
      workspace: {
        creative_references: [],
        asset_slots: [{
          id: 56,
          owner: { type: 'creativeReference', id: 35 },
          name: '女主主视图',
          kind: 'image',
        }],
      },
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /creative_reference/)
})

test('validateWorkspace accepts content units and keyframes in production workspace snapshot content', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'production_workspace',
    title: 'production workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace,
      scope: 'production_workspace',
      mode: 'snapshot',
      productionId: 12,
      workspaceScope: 'production',
      workspace: {
        segments: [{
          title: '情绪段一',
          scene_moments: [{
            title: '情节一',
            content_units: [{
              title: '内容分镜一',
              kind: 'shot',
              keyframes: [{ title: '关键帧一' }],
            }],
            creative_references: [{ id: 8, role: 'character' }],
          }],
        }],
      },
      impact_notes: [],
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, true)
  assert.doesNotMatch(JSON.stringify(validation.issues), /content_units/)
})

test('validateWorkspace rejects legacy action fields in production workspace snapshot content', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'production_workspace',
    title: 'production workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace,
      scope: 'production_workspace',
      mode: 'snapshot',
      productionId: 12,
      workspaceScope: 'production',
      workspace: {
        segments: [{
          action: 'create',
          title: '情绪段一',
          scene_moments: [],
        }],
      },
      impact_notes: [],
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /must not include action/)
})

test('validateWorkspace rejects production workspace creative references without existing ids', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'production_workspace',
    title: 'production workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace,
      scope: 'production_workspace',
      mode: 'snapshot',
      productionId: 12,
      workspaceScope: 'production',
      workspace: {
        segments: [{
          title: '情绪段一',
          scene_moments: [{
            title: '情节一',
            creative_references: [{ role: 'character' }],
          }],
        }],
      },
      impact_notes: [],
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /existing project-level id/)
})

test('validateWorkspace warns when production workspace scene moment lacks context bindings', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'production_workspace',
    title: 'production workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace,
      scope: 'production_workspace',
      mode: 'snapshot',
      productionId: 12,
      workspaceScope: 'production',
      workspace: {
        segments: [{
          title: '情绪段一',
          scene_moments: [{
            title: '情节一',
          }],
        }],
      },
      impact_notes: [],
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, true)
  assert.match(JSON.stringify(validation.issues), /creative_references or asset_slots/)
})

test('validateWorkspace accepts canonical asset workspace content', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'asset_workspace',
    title: 'asset workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.assetWorkspace,
      scope: 'asset_workspace',
      mode: 'snapshot',
      projectId: 42,
      assetSlotId: 56,
      summary: '为女主主视图准备两版图片候选。',
      slot: {
        id: 56,
        name: '女主主视图',
        kind: 'image',
      },
      context: {
        reference_resources: [{ resource_id: 12, role: 'candidate' }],
        notes: [],
      },
      workspace: {
        candidate_plans: [{
          output_kind: 'image',
          prompt: '半身正面角色设定图，年轻女性，蓝灰制服，柔和侧光，纯色背景。',
          model_capability: 'image_edit',
          input_resource_ids: [12],
          acceptance_criteria: ['脸部清晰', '服装细节稳定', '无字幕水印'],
        }],
      },
      next_actions: ['用户审阅后执行图片生成'],
      createdAt: '2026-05-11T00:00:00.000Z',
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, true)
  assert.equal(validation.issues.filter((issue) => issue.severity === 'error').length, 0)
})

test('validateWorkspace rejects asset workspace with mismatched slot id', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'asset_workspace',
    title: 'asset workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.assetWorkspace,
      scope: 'asset_workspace',
      mode: 'snapshot',
      assetSlotId: 56,
      slot: { id: 57, name: '女主主视图', kind: 'image' },
      workspace: { candidate_plans: [] },
    }),
  })

  const validation = validateWorkspace(workspace)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /must match assetSlotId/)
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

test('file workspace store ignores corrupt or non-object state files', () => {
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
