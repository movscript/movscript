import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { FileAgentDraftStore, InMemoryAgentDraftStore, validateDraft } from './draftStore.js'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/draft-schemas'

test('listDrafts filters by threadId and runId', () => {
  const store = new InMemoryAgentDraftStore()

  const threadDraft = store.createDraft({
    projectId: 1,
    kind: 'script_split_proposal',
    title: 'thread draft',
    content: '{}',
    createdByThreadId: 'thread-1',
  })
  const sourceThreadDraft = store.createDraft({
    projectId: 1,
    kind: 'production_proposal',
    title: 'source thread draft',
    content: '{}',
    source: { threadId: 'thread-2', runId: 'run-2' },
  })
  store.createDraft({
    projectId: 1,
    kind: 'note',
    title: 'other draft',
    content: '{}',
    createdByRunId: 'run-9',
  })

  assert.deepEqual(
    store.listDrafts({ threadId: 'thread-1' }).map((draft) => draft.id),
    [threadDraft.id],
  )
  assert.deepEqual(
    store.listDrafts({ threadId: 'thread-2' }).map((draft) => draft.id),
    [sourceThreadDraft.id],
  )
  assert.deepEqual(
    store.listDrafts({ runId: 'run-2' }).map((draft) => draft.id),
    [sourceThreadDraft.id],
  )
  assert.deepEqual(
    store.listDrafts({ runId: 'run-9' }).map((draft) => draft.kind),
    ['note'],
  )
})

test('listDrafts filters by multiple statuses', () => {
  const store = new InMemoryAgentDraftStore()
  const activeDraft = store.createDraft({ title: 'active', content: 'draft' })
  const appliedDraft = store.createDraft({ title: 'applied', content: 'done' })
  const rejectedDraft = store.createDraft({ title: 'rejected', content: 'no' })
  store.updateDraft(appliedDraft.id, { status: 'applied' })
  store.updateDraft(rejectedDraft.id, { status: 'rejected' })

  assert.deepEqual(
    store.listDrafts({ statuses: ['draft', 'applied'] }).map((draft) => draft.id).sort(),
    [activeDraft.id, appliedDraft.id].sort(),
  )
})

test('draft project scopes require positive safe integer ids', () => {
  const store = new InMemoryAgentDraftStore()
  const scopedDraft = store.createDraft({ projectId: 42, title: 'scoped', content: 'draft' })
  const zeroDraft = store.createDraft({ projectId: 0, title: 'zero', content: 'draft' })
  const fractionalDraft = store.createDraft({ projectId: 42.5, title: 'fractional', content: 'draft' })

  assert.equal(scopedDraft.projectId, 42)
  assert.equal(zeroDraft.projectId, undefined)
  assert.equal(fractionalDraft.projectId, undefined)
  assert.deepEqual(store.listDrafts({ projectId: 42 }).map((draft) => draft.id), [scopedDraft.id])
  assert.deepEqual(store.listDrafts({ projectId: 0 }), [])
  assert.deepEqual(store.listDrafts({ projectId: 42.5 }), [])
  assert.deepEqual(store.listDrafts({ projectId: Number.POSITIVE_INFINITY }), [])
})

test('createDraft stores DraftDomainModel seed metadata', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    projectId: 42,
    kind: 'project_proposal',
    title: 'seeded project proposal',
    content: '{}',
    seed: {
      mode: 'editable_snapshot',
      include: ['project', 'creative_references'],
      modelRef: 'frontend:DraftDomainModel:project_proposal:v1',
      sourceVersions: { project: { id: 42, updatedAt: '2026-05-13T00:00:00.000Z' } },
    },
    metadata: {
      proposal: true,
    },
  })

  assert.deepEqual(draft.metadata?.seed, {
    mode: 'editable_snapshot',
    include: ['project', 'creative_references'],
    modelRef: 'frontend:DraftDomainModel:project_proposal:v1',
    sourceVersions: { project: { id: 42, updatedAt: '2026-05-13T00:00:00.000Z' } },
  })
  assert.equal(draft.metadata?.proposal, true)
})

test('createDraft rejects non-finite seed values instead of coercing them', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    title: 'draft',
    content: '{}',
    seed: { score: Number.POSITIVE_INFINITY },
  })

  assert.equal(draft.metadata?.seed, undefined)
})

test('createDraft ignores non-plain source target and metadata records', () => {
  class DraftShape {
    entityType = 'project'
    entityId = 42
    proposal = true
  }

  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    title: 'draft',
    content: '{}',
    source: new DraftShape(),
    target: new DraftShape(),
    metadata: new DraftShape(),
  })

  assert.equal(draft.source, undefined)
  assert.equal(draft.target, undefined)
  assert.equal(draft.metadata, undefined)
})

test('createDraft drops non-json source target and metadata fields instead of coercing them', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    title: 'draft',
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

  assert.deepEqual(draft.source, {
    entityType: 'project',
    pageKey: 'project|42',
  })
  assert.deepEqual(draft.target, {
    entityType: 'project',
    field: 'name',
  })
  assert.deepEqual(draft.metadata, { ok: true })
})

test('updateDraft stores an independent metadata snapshot', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    title: 'draft',
    content: '{}',
    metadata: { existing: { value: 'stable' } },
  })
  const metadata = {
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
  }

  const updated = store.updateDraft(draft.id, { metadata })
  metadata.nested.value = 'changed'
  metadata.list[0]!.id = 'changed'

  assert.deepEqual(updated.metadata, {
    existing: { value: 'stable' },
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
  })
  assert.deepEqual(store.getDraft(draft.id)?.metadata, updated.metadata)
})

test('updateDraft stores an independent target snapshot', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    title: 'draft',
    content: '{}',
  })
  const target = {
    entityType: 'project',
    entityId: 42,
    nested: { value: 'original' },
  }

  const updated = store.updateDraft(draft.id, { target })
  target.nested.value = 'changed'

  assert.deepEqual(updated.target, {
    entityType: 'project',
    entityId: 42,
    nested: { value: 'original' },
  })
  assert.deepEqual(store.getDraft(draft.id)?.target, updated.target)
})

test('updateDraft drops non-json target metadata and user id fields instead of coercing them', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    title: 'draft',
    content: '{}',
    metadata: { existing: 'stable' },
  })

  const updated = store.updateDraft(draft.id, {
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

test('draft store drops invalid numeric reference ids at the storage boundary', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    title: 'draft',
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

  assert.deepEqual(draft.source, {
    entityType: 'scene_moment',
    pageEntityType: 'production',
  })
  assert.deepEqual(draft.target, {
    entityType: 'production',
  })

  const updated = store.updateDraft(draft.id, {
    appliedByUserId: 7.5,
  })
  assert.equal(updated.appliedByUserId, undefined)
})

test('read and edit draft files with unique text replacement', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    title: 'draft',
    content: 'alpha beta gamma',
  })

  const read = store.readDraftFile(draft.filePath ?? '')
  const edited = store.editDraftFile(read.filePath, {
    oldString: 'beta',
    newString: 'delta',
    replaceAll: false,
  })

  assert.equal(read.filePath, draft.filePath)
  assert.equal(read.content, 'alpha beta gamma')
  assert.equal(edited.draft.content, 'alpha delta gamma')
})

test('validateDraft accepts canonical project standards proposal content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'project_proposal',
    title: 'project standards proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.projectProposal,
      scope: 'project_proposal',
      mode: 'snapshot',
      summary: '定义项目级制作规范',
      proposal: {
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

  const validation = validateDraft(draft)
  assert.equal(validation.ok, true)
  assert.equal(validation.issues.filter((issue) => issue.severity === 'error').length, 0)
})

test('validateDraft rejects malformed project standards custom rules', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'project_proposal',
    title: 'project standards proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.projectProposal,
      scope: 'project_proposal',
      mode: 'snapshot',
      summary: '定义项目级制作规范',
      proposal: {
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

  const validation = validateDraft(draft)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /custom_rules\.key/)
  assert.match(JSON.stringify(validation.issues), /custom_rules\.value/)
  assert.match(JSON.stringify(validation.issues), /prompt_role/)
  assert.match(JSON.stringify(validation.issues), /enabled/)
})

test('validateDraft rejects project standards proposal list fields', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'project_proposal',
    title: 'project standards proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.projectProposal,
      scope: 'project_proposal',
      mode: 'snapshot',
      summary: '定义项目级制作规范',
      proposal: {
        project_style: {
          aspect_ratio: '9:16',
        },
        creative_references: [],
      },
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /outside project_proposal/)
})

test('validateDraft accepts canonical setting proposal content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'setting_proposal',
    title: 'setting proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.settingProposal,
      scope: 'setting_proposal',
      mode: 'snapshot',
      summary: '整理项目设定',
      proposal: {
        creative_references: [{
          client_id: 'cr_heroine',
          name: '女主',
          kind: 'person',
        }],
        asset_slots: [],
      },
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, true)
  assert.equal(validation.issues.filter((issue) => issue.severity === 'error').length, 0)
})

test('validateDraft accepts canonical asset slot proposal content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'asset_proposal',
    title: 'asset slot proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
      scope: 'asset_proposal',
      mode: 'snapshot',
      summary: '整理素材需求',
      proposal: {
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

  const validation = validateDraft(draft)
  assert.equal(validation.ok, true)
  assert.equal(validation.issues.filter((issue) => issue.severity === 'error').length, 0)
})

test('validateDraft rejects operation-shaped project proposal content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'setting_proposal',
    title: 'project proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.settingProposal,
      scope: 'setting_proposal',
      mode: 'snapshot',
      summary: '整理项目设定与素材需求',
      proposal: {
        creative_references: [{
          action: 'merge',
          entity: 'creativeReferences',
          target_id: 0,
          source_ids: [0],
          payload: {},
        }],
        asset_slots: [],
      },
      operations: [],
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /operations/)
  assert.match(JSON.stringify(validation.issues), /operation fields/)
  assert.match(JSON.stringify(validation.issues), /target_id/)
  assert.match(JSON.stringify(validation.issues), /source_ids/)
})

test('validateDraft rejects non-snake-case project proposal asset owner type', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'asset_proposal',
    title: 'project proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
      scope: 'asset_proposal',
      mode: 'snapshot',
      summary: '整理项目设定与素材需求',
      proposal: {
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

  const validation = validateDraft(draft)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /creative_reference/)
})

test('validateDraft accepts content units and keyframes in production proposal snapshot content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'production_proposal',
    title: 'production proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.productionProposal,
      mode: 'snapshot',
      productionId: 12,
      proposal: {
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
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, true)
  assert.doesNotMatch(JSON.stringify(validation.issues), /content_units/)
})

test('validateDraft rejects legacy action fields in production proposal snapshot content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'production_proposal',
    title: 'production proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.productionProposal,
      mode: 'snapshot',
      productionId: 12,
      proposal: {
        segments: [{
          action: 'create',
          title: '情绪段一',
          scene_moments: [],
        }],
      },
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /must not include action/)
})

test('validateDraft rejects production proposal creative references without existing ids', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'production_proposal',
    title: 'production proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.productionProposal,
      mode: 'snapshot',
      productionId: 12,
      proposal: {
        segments: [{
          title: '情绪段一',
          scene_moments: [{
            title: '情节一',
            creative_references: [{ role: 'character' }],
          }],
        }],
      },
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /existing project-level id/)
})

test('validateDraft warns when production proposal scene moment lacks context bindings', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'production_proposal',
    title: 'production proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.productionProposal,
      mode: 'snapshot',
      productionId: 12,
      proposal: {
        segments: [{
          title: '情绪段一',
          scene_moments: [{
            title: '情节一',
          }],
        }],
      },
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, true)
  assert.match(JSON.stringify(validation.issues), /creative_references or asset_slots/)
})

test('validateDraft accepts canonical asset proposal content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'asset_proposal',
    title: 'asset proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
      scope: 'asset_proposal',
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
      proposal: {
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

  const validation = validateDraft(draft)
  assert.equal(validation.ok, true)
  assert.equal(validation.issues.filter((issue) => issue.severity === 'error').length, 0)
})

test('validateDraft rejects asset proposal with mismatched slot id', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'asset_proposal',
    title: 'asset proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
      scope: 'asset_proposal',
      mode: 'snapshot',
      assetSlotId: 56,
      slot: { id: 57, name: '女主主视图', kind: 'image' },
      proposal: { candidate_plans: [] },
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /must match assetSlotId/)
})

test('file draft store persists draft content files across rebuilds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-drafts-'))
  try {
    const draftPath = join(dir, 'drafts.json')
    const store = new FileAgentDraftStore(draftPath)
    const draft = store.createDraft({
      projectId: 42,
      kind: 'note',
      title: 'Review note',
      content: 'Check storyboard-line gaps.',
      source: { entityType: 'scene_moment', entityId: 12 },
    })

    assert.equal(existsSync(draft.filePath ?? ''), true)

    const rebuilt = new FileAgentDraftStore(draftPath)
    const restored = rebuilt.getDraft(draft.id)
    const read = rebuilt.readDraftFile(draft.filePath ?? '')

    assert.equal(restored?.title, 'Review note')
    assert.equal(restored?.source?.entityType, 'scene_moment')
    assert.equal(read.content, 'Check storyboard-line gaps.')
    assert.equal(rebuilt.listDrafts({ projectId: 42 }).length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file draft store normalizes invalid persisted reference ids on load', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-drafts-'))
  try {
    const draftPath = join(dir, 'drafts.json')
    writeFileSync(draftPath, JSON.stringify({
      version: 2,
      drafts: [{
        id: 'draft_1',
        projectId: 42.5,
        kind: 'note',
        title: 'Persisted draft',
        content: 'Persisted content',
        status: 'draft',
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

    const store = new FileAgentDraftStore(draftPath)
    const draft = store.getDraft('draft_1')

    assert.equal(draft?.projectId, undefined)
    assert.deepEqual(draft?.source, {
      entityType: 'scene_moment',
      pageEntityType: 'production',
    })
    assert.deepEqual(draft?.target, {
      entityType: 'production',
    })
    assert.equal(draft?.appliedByUserId, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file draft store ignores corrupt or non-object state files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-drafts-'))
  try {
    const draftPath = join(dir, 'drafts.json')
    writeFileSync(draftPath, '{not-json', 'utf8')
    const corruptStore = new FileAgentDraftStore(draftPath)
    assert.deepEqual(corruptStore.listDrafts(), [])

    writeFileSync(draftPath, '["draft_1"]', 'utf8')
    const nonObjectStore = new FileAgentDraftStore(draftPath)
    assert.deepEqual(nonObjectStore.listDrafts(), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
