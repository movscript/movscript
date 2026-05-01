import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'
import { ProductionRuntime } from './runtime.js'
import { FileProductionStore } from './store.js'
import type { ProductionV2FallbackClient } from './v2FallbackClient.js'
import type { ProductionAction, ProductionRun } from './types.js'

test('production runtime executes AnalyzeScriptToSections into candidates', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    sourceObject: { objectType: 'script', objectId: 12, versionId: 'v1' },
    inputContext: {
      source_text: '第一场。主角进入房间。\n\n第二场。灯光熄灭，门外传来脚步声。',
    },
    requestedBy: 'test',
  })

  assert.equal(run.actionType, 'AnalyzeScriptToSections')
  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 2)
  assert.equal(run.candidates[0].type, 'script_section')
  assert.equal(run.candidates[0].status, 'candidate')
  assert.equal(run.candidates[0].payload.order, 1)
  assert.equal(runtime.getRun(run.id)?.id, run.id)
  assert.equal(runtime.getCandidate(run.candidates[0].id)?.id, run.candidates[0].id)
  assert.equal(run.warnings.includes('V2 fallback disabled'), true)
})

test('production runtime executes GenerateKeyframeCandidates from storyboard rows', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'GenerateKeyframeCandidates',
    projectId: 2,
    inputContext: {
      storyboard_rows: [
        { title: '走廊追逐', visual_prompt: 'Long hallway chase with hard rim light' },
      ],
    },
  })

  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 1)
  assert.equal(run.candidates[0].type, 'keyframe')
  assert.equal(run.candidates[0].payload.title, '走廊追逐')
  assert.equal(run.warnings.includes('V2 fallback disabled'), true)
})

test('production runtime executes ExtractSituations from script sections', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'ExtractSituations',
    projectId: 3,
    sourceObject: { objectType: 'script_version', objectId: 18, versionId: 'v2' },
    inputContext: {
      script_sections: [
        {
          client_id: 'section-1',
          order: 1,
          title: '夜晚仓库对峙',
          summary: '主角在仓库里发现交易线索，并与对手短暂对峙。',
          location: '仓库',
          time_of_day: '夜晚',
          characters: ['主角', '对手'],
        },
      ],
    },
  })

  assert.equal(run.actionType, 'ExtractSituations')
  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 1)
  assert.equal(run.candidates[0].type, 'situation')
  assert.equal(run.candidates[0].status, 'candidate')
  assert.equal(run.candidates[0].payload.client_id, 'situation-1')
  assert.equal(run.candidates[0].payload.order, 1)
  assert.equal(run.candidates[0].payload.title, '夜晚仓库对峙')
  assert.equal(run.candidates[0].payload.summary, '主角在仓库里发现交易线索，并与对手短暂对峙。')
  assert.equal(run.candidates[0].payload.location, '仓库')
  assert.equal(run.candidates[0].payload.time_of_day, '夜晚')
  assert.deepEqual(run.candidates[0].payload.characters, ['主角', '对手'])
  assert.equal(run.candidates[0].payload.confirm_question, '是否采用这个情境候选？')
  assert.equal(runtime.getCandidate(run.candidates[0].id)?.id, run.candidates[0].id)
})

test('production runtime extracts situations from storyboard rows or source text fallback', async () => {
  const runtime = new ProductionRuntime()

  const storyboardRun = await runtime.createAction({
    actionType: 'ExtractSituations',
    projectId: 3,
    inputContext: {
      storyboardRows: [
        {
          client_id: 'row-1',
          title: '雨中告别',
          body: '两人在车站外告别，雨水打湿海报。',
          locationText: '车站外',
          timeText: '清晨',
          character_names: '主角，对手',
        },
      ],
    },
  })
  const sourceTextRun = await runtime.createAction({
    actionType: 'ExtractSituations',
    projectId: 3,
    inputContext: {
      sourceText: '第一场。主角进入车站寻找线索。\n\n第二场。对手提前离开，留下车票。',
    },
  })

  assert.equal(storyboardRun.status, 'waiting_approval')
  assert.equal(storyboardRun.candidates.length, 1)
  assert.equal(storyboardRun.candidates[0].type, 'situation')
  assert.equal(storyboardRun.candidates[0].payload.title, '雨中告别')
  assert.equal(storyboardRun.candidates[0].payload.location, '车站外')
  assert.equal(storyboardRun.candidates[0].payload.time_of_day, '清晨')
  assert.deepEqual(storyboardRun.candidates[0].payload.characters, ['主角', '对手'])
  assert.equal(sourceTextRun.status, 'waiting_approval')
  assert.equal(sourceTextRun.candidates.length, 2)
  assert.equal(sourceTextRun.candidates[0].type, 'situation')
  assert.equal(sourceTextRun.candidates[0].payload.title, '第一场')
  assert.equal(sourceTextRun.candidates[0].payload.confirm_question, '是否采用这个情境候选？')
})

test('production runtime fails ExtractSituations without usable input', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'ExtractSituations',
    projectId: 3,
    inputContext: {},
  })

  assert.equal(run.status, 'failed')
  assert.match(run.error ?? '', /script_sections/)
  assert.equal(run.candidates.length, 0)
})

test('production runtime situation apply preview maps to V2 data operation but remains gated', async () => {
  const runtime = new ProductionRuntime()
  const run = await runtime.createAction({
    actionType: 'ExtractSituations',
    projectId: 3,
    inputContext: {
      script_sections: [
        {
          client_id: 'section-1',
          title: '夜晚仓库对峙',
          summary: '主角在仓库里发现交易线索，并与对手短暂对峙。',
        },
      ],
    },
  })

  const candidatePreview = runtime.previewCandidateApply(run.candidates[0].id)
  const accepted = runtime.acceptCandidate({ candidateId: run.candidates[0].id })
  const acceptedPreview = runtime.previewCandidateApply(accepted.id)

  assert.equal(candidatePreview.status, 'not_applicable')
  assert.equal(candidatePreview.canApply, false)
  assert.equal(candidatePreview.approval.requiredAction, 'accept_candidate')
  assert.equal(candidatePreview.v2DataOperation, 'UpsertSituationCandidates')
  assert.equal(acceptedPreview.status, 'blocked')
  assert.equal(acceptedPreview.canApply, false)
  assert.equal(acceptedPreview.approval.requiredAction, 'call_v2_data_action')
  assert.equal(acceptedPreview.v2DataOperation, 'UpsertSituationCandidates')
  assert.equal(acceptedPreview.requiredContext.includes('targetObject'), true)
})

test('production runtime executes GenerateStoryboardScript from script sections and situations', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'GenerateStoryboardScript',
    projectId: 4,
    sourceObject: { objectType: 'script_version', objectId: 18, versionId: 'v2' },
    inputContext: {
      duration_target: 20,
      script_sections: [
        {
          client_id: 'section-1',
          order: 1,
          title: '夜晚仓库对峙',
          summary: '主角在仓库里发现交易线索，并与对手短暂对峙。',
        },
        {
          client_id: 'section-2',
          order: 2,
          title: '天台追问',
          summary: '主角追上对手，逼问真正的交货地点。',
        },
      ],
      situations: [
        {
          client_id: 'situation-1',
          source_section_id: 'section-1',
          order: 1,
          title: '仓库交易',
          summary: '仓库里藏着关键证据。',
          location: '仓库',
          time_of_day: '夜晚',
        },
        {
          client_id: 'situation-2',
          source_section_id: 'section-2',
          order: 2,
          title: '天台逼问',
          summary: '主角在天台逼问对手。',
          location: '天台',
          time_of_day: '清晨',
        },
      ],
    },
  })

  assert.equal(run.actionType, 'GenerateStoryboardScript')
  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 2)
  assert.equal(run.candidates[0].type, 'storyboard_script')
  assert.equal(run.candidates[0].status, 'candidate')
  assert.equal(run.candidates[0].payload.client_id, 'storyboard-script-1')
  assert.equal(run.candidates[0].payload.source_section_id, 'section-1')
  assert.equal(run.candidates[0].payload.situation_id, 'situation-1')
  assert.equal(run.candidates[0].payload.duration_seconds, 10)
  assert.equal(run.candidates[0].payload.status, '待确认')
  assert.equal(run.candidates[0].payload.adoption_intent, 'append_storyboard_row')
  assert.match(String(run.candidates[0].payload.body), /场景：仓库 \/ 夜晚/)
  assert.equal(run.candidates[0].payload.confirm_question, '是否采用这个分镜脚本候选？')
})

test('production runtime executes GenerateStoryboardScript from script sections only', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'GenerateStoryboardScript',
    projectId: 4,
    inputContext: {
      scriptSections: [
        {
          id: 'section-a',
          order: 1,
          title: '开场',
          summary: '主角进入车站大厅寻找线索。',
          duration_seconds: 7,
        },
      ],
    },
  })

  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 1)
  assert.equal(run.candidates[0].type, 'storyboard_script')
  assert.equal(run.candidates[0].payload.source_section_id, 'section-a')
  assert.equal(run.candidates[0].payload.title, '开场')
  assert.equal(run.candidates[0].payload.body, '主角进入车站大厅寻找线索。')
  assert.equal(run.candidates[0].payload.duration_seconds, 7)
  assert.equal(run.candidates[0].payload.adoption_intent, 'append_storyboard_row')
})

test('production runtime uses existing storyboard rows as source context without overwriting them', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'GenerateStoryboardScript',
    projectId: 4,
    inputContext: {
      script_sections: [
        {
          client_id: 'section-1',
          order: 1,
          title: '雨中告别',
          summary: '两人在车站外告别，雨水打湿海报。',
        },
      ],
      storyboard_rows: [
        {
          client_id: 'row-existing-1',
          order: 1,
          source_section_id: 'section-1',
          title: '旧分镜行',
          body: '旧版本分镜内容。',
          status: '已确认',
        },
      ],
    },
  })

  const sourceRef = run.candidates[0].payload.source_ref

  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 1)
  assert.equal(run.candidates[0].type, 'storyboard_script')
  assert.equal(run.candidates[0].status, 'candidate')
  assert.equal(run.candidates[0].payload.adoption_intent, 'revise_existing_storyboard_row')
  assert.equal(typeof sourceRef, 'object')
  assert.equal(Array.isArray(sourceRef), false)
  assert.equal((sourceRef as Record<string, unknown>).existing_storyboard_row instanceof Object, true)
  assert.equal(runtime.listCandidates().some((candidate) => candidate.payload.client_id === 'row-existing-1'), false)
})

test('production runtime fails GenerateStoryboardScript without usable input', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'GenerateStoryboardScript',
    projectId: 4,
    inputContext: {},
  })

  assert.equal(run.status, 'failed')
  assert.match(run.error ?? '', /script_sections/)
  assert.equal(run.candidates.length, 0)
})

test('production runtime storyboard script apply preview maps to V2 data operation but remains gated', async () => {
  const runtime = new ProductionRuntime()
  const run = await runtime.createAction({
    actionType: 'GenerateStoryboardScript',
    projectId: 4,
    inputContext: {
      script_sections: [
        {
          client_id: 'section-1',
          title: '夜晚仓库对峙',
          summary: '主角在仓库里发现交易线索，并与对手短暂对峙。',
        },
      ],
    },
  })

  const candidatePreview = runtime.previewCandidateApply(run.candidates[0].id)
  const accepted = runtime.acceptCandidate({ candidateId: run.candidates[0].id })
  const acceptedPreview = runtime.previewCandidateApply(accepted.id)

  assert.equal(candidatePreview.status, 'not_applicable')
  assert.equal(candidatePreview.canApply, false)
  assert.equal(candidatePreview.approval.requiredAction, 'accept_candidate')
  assert.equal(candidatePreview.v2DataOperation, 'UpsertStoryboardSuggestions')
  assert.equal(acceptedPreview.status, 'blocked')
  assert.equal(acceptedPreview.canApply, false)
  assert.equal(acceptedPreview.approval.requiredAction, 'call_v2_data_action')
  assert.equal(acceptedPreview.v2DataOperation, 'UpsertStoryboardSuggestions')
})

test('production runtime fails unsupported deterministic input before candidate write', async () => {
  const runtime = new ProductionRuntime()

  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {},
  })

  assert.equal(run.status, 'failed')
  assert.match(run.error ?? '', /source_text/)
  assert.equal(run.candidates.length, 0)
})

test('file production store persists runs and candidates across runtime rebuilds', async () => {
  const filePath = join(mkdtempSync(join(tmpdir(), 'movscript-production-store-')), 'production-state.json')
  const runtime = new ProductionRuntime({ store: new FileProductionStore(filePath) })
  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  const rebuilt = new ProductionRuntime({ store: new FileProductionStore(filePath) })

  assert.equal(rebuilt.getRun(run.id)?.id, run.id)
  assert.equal(rebuilt.getCandidate(run.candidates[0].id)?.id, run.candidates[0].id)
})

test('production runtime persists rejected candidate lifecycle across runtime rebuilds', async () => {
  const filePath = join(mkdtempSync(join(tmpdir(), 'movscript-production-store-')), 'production-state.json')
  const runtime = new ProductionRuntime({ store: new FileProductionStore(filePath) })
  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  const rejected = runtime.rejectCandidate({
    candidateId: run.candidates[0].id,
    reason: 'section split is too coarse',
    actor: 'reviewer',
  })
  const rebuilt = new ProductionRuntime({ store: new FileProductionStore(filePath) })
  const restoredCandidate = rebuilt.getCandidate(rejected.id)
  const restoredRun = rebuilt.getRun(run.id)

  assert.equal(restoredCandidate?.status, 'rejected')
  assert.equal(restoredCandidate?.statusReason, 'section split is too coarse')
  assert.equal(restoredCandidate?.lifecycle?.at(-1)?.type, 'rejected')
  assert.equal(restoredRun?.candidates[0].status, 'rejected')
})

test('production runtime revises candidate into a new candidate and updates the original', async () => {
  const runtime = new ProductionRuntime()
  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  const result = runtime.reviseCandidate({
    candidateId: run.candidates[0].id,
    reason: 'tighten title',
    payload: {
      ...run.candidates[0].payload,
      title: '第一场：进入房间',
    },
  })
  const updatedRun = runtime.getRun(run.id)

  assert.equal(result.original.status, 'revised')
  assert.equal(result.original.revisedByCandidateId, result.revision.id)
  assert.equal(result.revision.status, 'candidate')
  assert.equal(result.revision.revisedFromCandidateId, result.original.id)
  assert.equal(result.revision.payload.title, '第一场：进入房间')
  assert.equal(updatedRun?.candidates.length, 2)
  assert.equal(updatedRun?.candidates.find((candidate) => candidate.id === result.original.id)?.status, 'revised')
  assert.equal(updatedRun?.candidates.find((candidate) => candidate.id === result.revision.id)?.status, 'candidate')
})

test('production runtime lifecycle updates do not call V2 fallback', async () => {
  const fallback = new RecordingFallbackClient()
  const runtime = new ProductionRuntime({ v2FallbackClient: fallback })
  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  assert.equal(fallback.calls, 1)
  runtime.rejectCandidate({
    candidateId: run.candidates[0].id,
    reason: 'not useful',
  })

  assert.equal(fallback.calls, 1)
})

test('production runtime apply preview blocks accepted candidates before V2 apply', async () => {
  const fallback = new RecordingFallbackClient()
  const runtime = new ProductionRuntime({ v2FallbackClient: fallback })
  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    sourceObject: { objectType: 'script', objectId: 12, versionId: 'v1' },
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  const accepted = runtime.acceptCandidate({
    candidateId: run.candidates[0].id,
    reason: 'section looks correct',
  })
  const preview = runtime.previewCandidateApply(accepted.id)

  assert.equal(preview.status, 'blocked')
  assert.equal(preview.canApply, false)
  assert.equal(preview.candidateStatus, 'accepted')
  assert.equal(preview.approval.approvalPolicy, 'explicit_accept_required')
  assert.equal(preview.approval.requiredAction, 'call_v2_data_action')
  assert.equal(preview.approval.status, 'blocked')
  assert.equal(preview.v2DataOperation, 'UpsertScriptSectionCandidates')
  assert.deepEqual(preview.targetObject, { objectType: 'script', objectId: 12, versionId: 'v1' })
  assert.equal(preview.warnings.some((warning) => warning.includes('no V2 data action was called')), true)
  assert.equal(fallback.calls, 1)
})

test('production runtime apply preview marks rejected revised and superseded candidates not applicable', async () => {
  const runtime = new ProductionRuntime()
  const rejectedRun = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })
  const revisedRun = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第二场。主角离开房间。',
    },
  })
  const supersededRun = await runtime.createAction({
    actionType: 'GenerateKeyframeCandidates',
    projectId: 1,
    inputContext: {
      storyboard_rows: [
        { title: '走廊追逐', visual_prompt: 'Long hallway chase with hard rim light' },
      ],
    },
  })

  const rejected = runtime.rejectCandidate({ candidateId: rejectedRun.candidates[0].id })
  const revised = runtime.reviseCandidate({ candidateId: revisedRun.candidates[0].id }).original
  const superseded = runtime.supersedeCandidate({ candidateId: supersededRun.candidates[0].id })

  for (const candidate of [rejected, revised, superseded]) {
    const preview = runtime.previewCandidateApply(candidate.id)
    assert.equal(preview.status, 'not_applicable')
    assert.equal(preview.canApply, false)
    assert.equal(preview.approval.requiredAction, 'none')
    assert.match(preview.approval.reason, new RegExp(`status ${candidate.status} cannot be applied`))
  }
})

test('production runtime apply preview requires candidate acceptance before apply gate', async () => {
  const fallback = new RecordingFallbackClient()
  const runtime = new ProductionRuntime({ v2FallbackClient: fallback })
  const run = await runtime.createAction({
    actionType: 'GenerateKeyframeCandidates',
    projectId: 2,
    inputContext: {
      storyboard_rows: [
        { title: '走廊追逐', visual_prompt: 'Long hallway chase with hard rim light' },
      ],
    },
  })

  const preview = runtime.previewCandidateApply(run.candidates[0].id)

  assert.equal(preview.status, 'not_applicable')
  assert.equal(preview.canApply, false)
  assert.equal(preview.candidateStatus, 'candidate')
  assert.equal(preview.approval.requiredAction, 'accept_candidate')
  assert.equal(preview.v2DataOperation, 'UpsertKeyframeCandidates')
  assert.equal(preview.requiredContext.includes('targetObject'), true)
  assert.equal(fallback.generateKeyframeCalls, 1)
})

test('production runtime keeps runtime candidates when V2 fallback fails', async () => {
  const runtime = new ProductionRuntime({
    v2FallbackClient: new FailingFallbackClient(),
  })

  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 1)
  assert.equal(run.warnings.some((warning) => warning.includes('simulated V2 fallback failure')), true)
})

test('production runtime keeps keyframe candidates when V2 fallback fails', async () => {
  const runtime = new ProductionRuntime({
    v2FallbackClient: new FailingFallbackClient(),
  })

  const run = await runtime.createAction({
    actionType: 'GenerateKeyframeCandidates',
    projectId: 1,
    inputContext: {
      storyboard_rows: [
        { client_id: 'row-1', order: 1, title: '走廊追逐', body: '主角冲过走廊', duration_seconds: 6, status: '待确认' },
      ],
    },
  })

  assert.equal(run.status, 'waiting_approval')
  assert.equal(run.candidates.length, 1)
  assert.equal(run.candidates[0].status, 'candidate')
  assert.equal(run.warnings.some((warning) => warning.includes('simulated V2 keyframe fallback failure')), true)
})

test('production runtime records enabled V2 fallback without changing candidate status', async () => {
  const fallback = new RecordingFallbackClient()
  const runtime = new ProductionRuntime({ v2FallbackClient: fallback })

  const run = await runtime.createAction({
    actionType: 'AnalyzeScriptToSections',
    projectId: 1,
    inputContext: {
      source_text: '第一场。主角进入房间。',
    },
  })

  assert.equal(fallback.calls, 1)
  assert.equal(run.candidates[0].status, 'candidate')
  assert.equal(run.warnings.some((warning) => warning.includes('V2 fallback wrote')), true)
})

test('production runtime records enabled keyframe V2 fallback without changing candidate status', async () => {
  const fallback = new RecordingFallbackClient()
  const runtime = new ProductionRuntime({ v2FallbackClient: fallback })

  const run = await runtime.createAction({
    actionType: 'GenerateKeyframeCandidates',
    projectId: 1,
    inputContext: {
      draft_id: 'draft-1',
      storyboard_rows: [
        { client_id: 'row-1', order: 1, title: '走廊追逐', body: '主角冲过走廊', duration_seconds: 6, status: '待确认' },
      ],
    },
  })

  assert.equal(fallback.generateKeyframeCalls, 1)
  assert.equal(run.candidates[0].status, 'candidate')
  assert.equal(run.warnings.some((warning) => warning.includes('script-preview/generate-preview')), true)
})

test('production runtime keyframe lifecycle and apply preview do not call V2 fallback again', async () => {
  const fallback = new RecordingFallbackClient()
  const runtime = new ProductionRuntime({ v2FallbackClient: fallback })
  const run = await runtime.createAction({
    actionType: 'GenerateKeyframeCandidates',
    projectId: 1,
    inputContext: {
      storyboard_rows: [
        { client_id: 'row-1', order: 1, title: '走廊追逐', body: '主角冲过走廊', duration_seconds: 6, status: '待确认' },
      ],
    },
  })

  assert.equal(fallback.generateKeyframeCalls, 1)
  const accepted = runtime.acceptCandidate({ candidateId: run.candidates[0].id })
  runtime.previewCandidateApply(accepted.id)

  assert.equal(fallback.generateKeyframeCalls, 1)
})

class FailingFallbackClient implements ProductionV2FallbackClient {
  isEnabled(): boolean {
    return true
  }

  async writeAnalyzeScriptToSections(): Promise<never> {
    throw new Error('simulated V2 fallback failure')
  }

  async writeGenerateKeyframeCandidates(): Promise<never> {
    throw new Error('simulated V2 keyframe fallback failure')
  }
}

class RecordingFallbackClient implements ProductionV2FallbackClient {
  calls = 0
  generateKeyframeCalls = 0

  isEnabled(): boolean {
    return true
  }

  async writeAnalyzeScriptToSections(_action: ProductionAction, _run: ProductionRun) {
    this.calls += 1
    return { performed: true, url: 'http://127.0.0.1/api/v1/projects/1/script-preview/analyze' }
  }

  async writeGenerateKeyframeCandidates(_action: ProductionAction, _run: ProductionRun) {
    this.generateKeyframeCalls += 1
    return { performed: true, url: 'http://127.0.0.1/api/v1/projects/1/script-preview/generate-preview' }
  }
}
