import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const TRACE_SOURCE_FILES = [
  '../../application/runtimeLocalDiagnosticCommand.ts',
  '../../application/runtimeLocalGenerationCommand.ts',
  '../../application/runtimeRunCompletion.ts',
  '../../application/runtimeRunInteraction.ts',
  '../../application/runtimePostRunRecords.ts',
  '../../orchestration/agentGraphModelCall.ts',
  '../../orchestration/agentGraphPolicyTrace.ts',
  '../../orchestration/agentGraphToolExecutionTrace.ts',
] as const

const FORBIDDEN_TRACE_PAYLOAD_PATTERNS: Array<[RegExp, string]> = [
  [/data:\s*\{[\s\S]{0,240}(?:call|command|inputRequests|approvals|rollbackRecords):\s*(?:input|execution|answer|pending|records|forcedCall|input\.run)\b/, 'raw structured payload written directly to trace data'],
  [/summary:\s*[^,\n]*\.slice\(\s*0\s*,\s*(?:120|180|240|500)\s*\)/, 'trace summary slices payload text instead of using ids/hash/chars'],
  [/repairCalls:\s*[^;\n]*\(\s*call\s*\)\s*=>\s*\(\s*\{[^}\n]*args:\s*call\.args/, 'repair trace exposes raw tool args'],
  [/data:\s*\{[^}\n]*text:\s*[^}\n]*/, 'trace data exposes free-form text'],
]

test('trace construction code keeps payload bodies behind domain summaries', () => {
  for (const relativePath of TRACE_SOURCE_FILES) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    for (const [pattern, reason] of FORBIDDEN_TRACE_PAYLOAD_PATTERNS) {
      assert.equal(
        pattern.test(source),
        false,
        `${relativePath} violates trace payload hygiene: ${reason}`,
      )
    }
  }
})
