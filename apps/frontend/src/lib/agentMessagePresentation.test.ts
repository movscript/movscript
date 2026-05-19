import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentMessagePresentation } from './agentMessagePresentation'
import type { AgentAttachment, ChatMessage } from '@/store/agentStore'

test('buildAgentMessagePresentation keeps user attachments compact and avoids assistant sections', () => {
  const result = buildAgentMessagePresentation(message({
    role: 'user',
    attachments: [attachment({ id: 'img_1', type: 'image' })],
  }))

  assert.equal(result.isUser, true)
  assert.equal(result.showLargeMedia, false)
  assert.equal(result.hasResultSection, false)
  assert.equal(result.compactAttachments.length, 1)
  assert.equal(result.displayContent, 'Message')
})

test('buildAgentMessagePresentation promotes generated assistant media and hides technical summary', () => {
  const result = buildAgentMessagePresentation(message({
    content: '成片已生成。\nOutput resources: #42\n技术细节：done',
    attachments: [attachment({
      id: 'generated-1',
      type: 'image',
      resourceId: 42,
      generated: { status: 'completed' },
    })],
  }))

  assert.equal(result.showLargeMedia, true)
  assert.equal(result.hasUsableGeneratedResource, true)
  assert.equal(result.generatedMediaAttachments.length, 1)
  assert.equal(result.compactAttachments.length, 0)
  assert.equal(result.hasResultSection, true)
  assert.equal(result.displayContent.includes('Output resources'), false)
  assert.equal(result.displayContent.includes('技术细节'), true)
})

test('buildAgentMessagePresentation reports missing generated resource ids for hydration', () => {
  const result = buildAgentMessagePresentation(message({
    content: 'Output resources: #7, #8',
    attachments: [attachment({ id: 'existing_7', resourceId: 7 })],
  }))

  assert.deepEqual(result.missingTextOutputResourceIds, [8])
})

test('buildAgentMessagePresentation hides content behind context diagnostics and opens diagnostics section', () => {
  const result = buildAgentMessagePresentation(message({
    meta: {
      contextDiagnostic: {
        schema: 'movscript.local_context_diagnostic.v1',
        modelGatewayCalled: false,
        messages: [],
        debugParts: [],
        tools: {
          available: [],
          blocked: [],
          discoveredCount: 0,
          modelTools: [],
        },
        skills: [],
        warnings: [],
      },
    },
  }))

  assert.equal(result.displayContent, '')
  assert.equal(result.contextDiagnostic?.schema, 'movscript.local_context_diagnostic.v1')
  assert.equal(result.hasDiagnosticSection, true)
})

test('buildAgentMessagePresentation exposes assistant meta as view model fields', () => {
  const result = buildAgentMessagePresentation(message({
    meta: {
      contextLabels: ['Project'],
      localRunActivity: {
        runId: 'run_1',
        threadId: 'thread_1',
        status: 'completed',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        steps: [],
        events: [],
      },
      generationJobs: [{
        jobId: 42,
        status: 'running',
        terminal: false,
      }],
      generationParamAudits: [{
        stepId: 'step_1',
        jobId: 42,
        modelConfigId: 7,
        modelContractLoaded: true,
        paramsSchemaLoaded: true,
        paramsSchemaRuleCount: 1,
        inputRequirements: {
          image: { min: 0, max: 1 },
          video: { min: 0, max: 0 },
        },
        submittedInputs: {
          image: 0,
          video: 0,
        },
        supportedParams: [],
        providedExtraParams: [],
        submittedExtraParams: [],
        droppedExtraParams: [],
        droppedTopLevelParams: [],
        dropReasons: {},
        renamedExtraParams: {},
        preflightErrors: [],
        inputPreflightErrors: [],
      }],
      generationValidationErrors: [{
        stepId: 'step_1',
        code: 'INVALID_INPUT_COUNT',
        field: 'image',
        message: 'too many images',
      }],
      draftArtifacts: [{
        type: 'draft',
        draftId: 'draft_1',
        draftKind: 'content_unit',
      }],
    },
  }))

  assert.deepEqual(result.contextLabels, ['Project'])
  assert.equal(result.localRunActivity?.runId, 'run_1')
  assert.equal(result.generationJobs[0]?.jobId, 42)
  assert.equal(result.generationParamAudits[0]?.modelConfigId, 7)
  assert.equal(result.generationValidationErrors[0]?.code, 'INVALID_INPUT_COUNT')
  assert.equal(result.draftArtifacts[0]?.draftId, 'draft_1')
  assert.equal(result.hasResultSection, true)
  assert.equal(result.hasProcessSection, true)
  assert.equal(result.hasDiagnosticSection, true)
})

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}

function attachment(overrides: Partial<AgentAttachment> = {}): AgentAttachment {
  return {
    id: 'att_1',
    name: 'asset.png',
    type: 'image',
    mimeType: 'image/png',
    size: 10,
    ...overrides,
  }
}
