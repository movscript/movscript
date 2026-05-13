import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
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

test('validateDraft accepts canonical project proposal content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'project_proposal',
    title: 'project proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.projectProposal,
      scope: 'project_proposal',
      summary: '整理项目设定与素材需求',
      proposal: {
        creative_references: [{
          client_id: 'cr_heroine',
          fields: { name: '女主', kind: 'person' },
        }],
        asset_slots: [{
          fields: { name: '女主参考图', kind: 'image' },
          owner: { type: 'creative_reference', client_id: 'cr_heroine' },
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
    kind: 'project_proposal',
    title: 'project proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.projectProposal,
      scope: 'project_proposal',
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
    kind: 'project_proposal',
    title: 'project proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.projectProposal,
      scope: 'project_proposal',
      summary: '整理项目设定与素材需求',
      proposal: {
        creative_references: [],
        asset_slots: [{
          id: 56,
          owner: { type: 'creativeReference', id: 35 },
          fields: { name: '女主主视图' },
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

test('validateDraft rejects downstream content units and keyframes in production proposal content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'production_proposal',
    title: 'production proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.productionProposal,
      productionId: 12,
      proposal: {
        segments: [{
          action: 'create',
          title: '情绪段一',
          scene_moments: [{
            action: 'create',
            title: '情节一',
            content_units: [{
              action: 'create',
              title: '内容分镜一',
              keyframes: [{ action: 'create', title: '关键帧一' }],
            }],
          }],
        }],
      },
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /content_units/)
})

test('validateDraft accepts canonical asset proposal content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'asset_proposal',
    title: 'asset proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
      scope: 'asset_proposal',
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
