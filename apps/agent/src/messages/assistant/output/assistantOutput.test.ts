import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRun } from '../../../state/shared/types.js'
import { runtimeModelContentText } from '../../model/modelMessage.js'
import {
  buildAssistantContent,
  buildAssistantMessages,
  combineAssistantTurnContents,
} from './assistantOutput.js'

test('combineAssistantTurnContents trims empty turns and dedupes normalized content', () => {
  assert.equal(combineAssistantTurnContents([' first ', 'first', '', 'second'], 'second'), 'first\n\nsecond')
  assert.equal(combineAssistantTurnContents(['Final answer', 'Tool preface', 'Final answer'], 'Final   answer'), 'Final answer\n\nTool preface')
})

test('buildAssistantContent renders user-visible tool outcome summaries', () => {
  const content = buildAssistantContent('启动生成', [
    {
      call: { name: 'core_work_start', args: { kind: 'generation' } },
      result: {
        work: {
          id: 'work_1',
          kind: 'generation',
          status: 'started',
          outputResourceIds: [42],
        },
      },
    },
  ])

  assert.match(content, /generation work work_1已提交/)
  assert.match(content, /输出资源 #42/)
})

test('buildAssistantMessages uses resolved skill instructions as model output contract', () => {
  const run = makeRun()
  run.metadata = {
    ...(run.metadata ?? {}),
    skills: [{
      id: 'core.rules.runtime',
      name: 'Agent Core Runtime Rules',
      instruction: 'Core skill instruction from catalog.',
    }],
  }

  const messages = buildAssistantMessages('总结结果', [], [], [], run)
  const systemText = messages
    .filter((message) => message.role === 'system')
    .map((message) => runtimeModelContentText(message.content))
    .join('\n')

  assert.match(systemText, /Agent Core Runtime Rules/)
  assert.match(systemText, /Core skill instruction from catalog/)
  assert.doesNotMatch(systemText, /Use the runtime JSON sections below/)
})

function makeRun(): AgentRun {
  return {
    id: 'run_test',
    threadId: 'thread_test',
    status: 'completed',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
    metadata: {
      context: {
        route: { pathname: '/agent/debug' },
        project: { id: 42, name: 'Demo' },
      },
    },
    steps: [],
  }
}
