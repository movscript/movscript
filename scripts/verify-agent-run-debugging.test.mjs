import { execFile } from 'node:child_process'
import { readFile, rm, writeFile, mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import assert from 'node:assert/strict'

const execFileAsync = promisify(execFile)
const scriptPath = path.resolve('scripts/verify-agent-run-debugging.mjs')
const schemaPath = path.resolve('docs/agent-run-debug-bundle-v1.schema.json')
const fixturePath = path.resolve('docs/agent-run-debug-bundle-v1.fixture.json')
const acceptanceSummaryFixturePath = path.resolve('docs/agent-run-debugging-acceptance-summary-v1.fixture.json')
const e2ePath = path.resolve('apps/frontend/src/e2e/agent-planner.spec.ts')
const e2eRunnerPath = path.resolve('scripts/run-agent-run-debugging-e2e.mjs')
const artifactVerifierPath = path.resolve('scripts/verify-agent-run-debugging-artifacts.mjs')
const artifactVerifierTestPath = path.resolve('scripts/verify-agent-run-debugging-artifacts.test.mjs')
const acceptanceSummaryContractPath = path.resolve('scripts/agent-run-debugging-acceptance-summary-contract.mjs')
const bundleContractPath = path.resolve('docs/agent-run-debug-bundle-v1.zh-CN.md')
const acceptancePath = path.resolve('docs/agent-run-debugging-acceptance.zh-CN.md')
const auditPath = path.resolve('docs/agent-run-debugging-product-audit.md')
const docsIndexPath = path.resolve('docs/README.zh-CN.md')
const docsIndexEnPath = path.resolve('docs/README.md')
const ciWorkflowPath = path.resolve('.github/workflows/ci.yml')
const pullRequestTemplatePath = path.resolve('.github/pull_request_template.md')
const releaseChecklistZhPath = path.resolve('docs/release-checklist.zh-CN.md')
const releaseChecklistEnPath = path.resolve('docs/release-checklist.md')
const makefilePath = path.resolve('Makefile')
const packageJsonPath = path.resolve('package.json')
const localAgentClientPath = path.resolve('apps/frontend/src/lib/localAgentClient.ts')
const agentStateTypesPath = path.resolve('apps/agent/src/state/types.ts')
const agentRunUiPath = path.resolve('apps/frontend/src/lib/agentRunUi.ts')
const agentRunUiViewTestPath = path.resolve('apps/frontend/src/lib/agentRunUiView.test.ts')
const agentRunPagePath = path.resolve('apps/frontend/src/pages/agent/AIAgentRunPage.tsx')

test('AgentRun debugging static verifier accepts fixture override for valid bundle fixture', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-valid-'))
  try {
    const fixture = await readFixture()
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    const { stdout } = await runVerifier(overridePath)
    assert.match(stdout, /AgentRun debugging verification passed/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects model context tool calls missing from top-level toolCalls', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-toolcall-'))
  try {
    const fixture = await readFixture()
    fixture.toolCalls = []
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /modelCallContexts\[model_call_1\]\.toolCalls item evt_tool_call must also exist in fixture\.toolCalls/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects model context message writes missing from top-level messageWrites', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-messagewrite-'))
  try {
    const fixture = await readFixture()
    fixture.messageWrites = []
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /modelCallContexts\[model_call_1\]\.messageWrites item evt_message_write must also exist in fixture\.messageWrites/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects run summary pending counts that diverge from pendingActions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-pending-'))
  try {
    const fixture = await readFixture()
    fixture.pendingActions = [{
      type: 'approval',
      id: 'approval_debug_fixture',
      createdAt: '2026-05-16T08:00:06.000Z',
    }]
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture\.runSummary\.pendingApprovals must equal pendingActions approval count \(1\)/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects pending action variant fixture drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-pending-variant-'))
  try {
    const fixture = await readFixture()
    fixture.runSummary.pendingApprovals = 1
    fixture.pendingActions = [{
      type: 'approval',
      id: 'approval_debug_fixture',
      createdAt: '2026-05-16T08:00:06.000Z',
    }]
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture\.pendingActions\[0\] must match exactly one schema in oneOf/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle fixture raw event kind drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-fixture-event-kind-'))
  try {
    const fixture = await readFixture()
    fixture.events[0].kind = 'unknown_kind'
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture\.events\[evt_prompt\]\.kind must be a known AgentTraceEvent kind/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle fixture raw event status drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-fixture-event-status-'))
  try {
    const fixture = await readFixture()
    fixture.events[0].status = 'running'
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture\.events\[evt_prompt\]\.status must be a known AgentTraceEvent status/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle fixture raw events without run id', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-fixture-event-run-id-'))
  try {
    const fixture = await readFixture()
    delete fixture.events[0].runId
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture\.events\[0\]\.runId is required by schema/)
        assert.match(String(error.stderr), /fixture\.events\[evt_prompt\]\.runId must match fixture\.runId/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle fixture coverage drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-fixture-coverage-'))
  try {
    const fixture = await readFixture()
    fixture.coverage.loadedLabel = '4 / 4'
    fixture.coverage.modelCallsLabel = '1 次'
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture\.coverage\.loadedLabel must equal loaded events over trace total \(5 \/ 5\)/)
        assert.match(String(error.stderr), /fixture\.coverage\.modelCallsLabel must equal modelCalls count \(1\)/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle fixture model call type drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-fixture-model-call-type-'))
  try {
    const fixture = await readFixture()
    fixture.modelCalls[0].httpStatus = 200
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture\.modelCalls\[0\]\.httpStatus must match schema type "string"/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle fixture prompt detail type drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-fixture-prompt-detail-type-'))
  try {
    const fixture = await readFixture()
    fixture.promptDetails[0].totalChars = 120
    fixture.promptDetails[0].layers = ['system', 'thread']
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture\.promptDetails\[0\]\.totalChars must match schema type "string"/)
        assert.match(String(error.stderr), /fixture\.promptDetails\[0\]\.layers\[0\] must match schema type "object"/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle fixture derived trace item drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-fixture-derived-trace-'))
  try {
    const fixture = await readFixture()
    fixture.toolCalls[0].status = 'started'
    fixture.messageWrites[0].eventId = 'evt_tool_call'
    fixture.attentionEvents = [{
      eventId: 'evt_tool_call',
      createdAt: '2026-05-16T08:00:05.000Z',
      kind: 'error',
      kindLabel: '错误',
      status: 'failed',
      statusLabel: '失败',
      title: 'Tool call completed',
    }]
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture\.messageWrites\[evt_tool_call\]\.eventId must reference an assistant event/)
        assert.match(String(error.stderr), /fixture\.toolCalls\[evt_tool_call\]\.status must match its source event status/)
        assert.match(String(error.stderr), /fixture\.attentionEvents\[evt_tool_call\]\.kind must match its source event kind/)
        assert.match(String(error.stderr), /fixture\.attentionEvents\[evt_tool_call\]\.status must match its source event status/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle fixture readiness drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-fixture-readiness-'))
  try {
    const fixture = await readFixture()
    fixture.readinessChecklist = fixture.readinessChecklist.filter((item) => item.id !== 'tool_detail')
    fixture.readinessChecklist[0].status = 'warning'
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture readiness checklist ids must exactly match/)
        assert.match(String(error.stderr), /tool_detail/)
        assert.match(String(error.stderr), /fixture readiness checklist statuses must all be ok for complete fixture coverage/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle fixture field guide drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-fixture-field-guide-'))
  try {
    const fixture = await readFixture()
    fixture.fieldGuide = fixture.fieldGuide.filter((item) => item.id !== 'model_response')
    const overridePath = path.join(root, 'fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(overridePath),
      (error) => {
        assert.match(String(error.stderr), /fixture field guide ids must exactly match/)
        assert.match(String(error.stderr), /model_response/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema field guide id drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-field-guide-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    schema.$defs.fieldGuideItem.properties.id.enum = schema.$defs.fieldGuideItem.properties.id.enum.filter((id) => id !== 'missing_data')
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle field guide item id enum must exactly match/)
        assert.match(String(error.stderr), /missing_data/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema readiness id drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-readiness-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    schema.$defs.readinessItem.properties.id.enum = schema.$defs.readinessItem.properties.id.enum.filter((id) => id !== 'tool_detail')
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle readiness item id enum must exactly match/)
        assert.match(String(error.stderr), /tool_detail/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema raw events without trace event definition', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-events-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    schema.properties.events.items = { type: 'object' }
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle schema events must use traceEvent definition/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema trace event status drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-event-status-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    schema.$defs.traceEvent.properties.status.enum.push('schema_only')
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle trace event status enum must exactly match/)
        assert.match(String(error.stderr), /schema_only/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema trace event round source drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-event-round-source-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    schema.$defs.traceEvent.properties.roundSource.enum.push('schema_only')
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle trace event roundSource enum must exactly match/)
        assert.match(String(error.stderr), /schema_only/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema trace event field definition drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-event-field-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    delete schema.$defs.traceEvent.properties.roundSource
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle trace event property definitions missing roundSource/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema model call field definition drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-model-call-field-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    delete schema.$defs.modelCall.properties.httpStatus
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle model call property definitions missing httpStatus/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema prompt detail field definition drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-prompt-detail-field-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    schema.properties.promptDetails.items = { type: 'object' }
    delete schema.$defs.promptDetail.properties.contextLayers
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle schema promptDetails must use promptDetail definition/)
        assert.match(String(error.stderr), /debug bundle prompt detail property definitions missing contextLayers/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema tool call status drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-tool-call-status-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    schema.$defs.toolCall.properties.status.enum.push('schema_only')
    schema.$defs.toolCallRef.properties.status.enum = schema.$defs.toolCallRef.properties.status.enum.filter((status) => status !== 'blocked')
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle tool call status enum must exactly match/)
        assert.match(String(error.stderr), /schema_only/)
        assert.match(String(error.stderr), /debug bundle tool call ref status enum must exactly match/)
        assert.match(String(error.stderr), /blocked/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema attention event enum drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-attention-event-enum-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    schema.$defs.attentionEvent.properties.kind.enum.push('schema_only')
    schema.$defs.attentionEvent.properties.status.enum = schema.$defs.attentionEvent.properties.status.enum.filter((status) => status !== 'info')
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle attention event kind enum must exactly match/)
        assert.match(String(error.stderr), /schema_only/)
        assert.match(String(error.stderr), /debug bundle attention event status enum must exactly match/)
        assert.match(String(error.stderr), /info/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects debug bundle schema pending action variant drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-schema-pending-action-'))
  try {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
    delete schema.$defs.pendingAction.properties.allowCustomAnswer
    schema.$defs.pendingAction.properties.inputType.enum.push('unknown')
    schema.$defs.pendingAction.oneOf = schema.$defs.pendingAction.oneOf.slice(0, 1)
    const overridePath = path.join(root, 'schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle pending action must define approval\/input variants: expected 2, got 1/)
        assert.match(String(error.stderr), /debug bundle pending action property definitions missing allowCustomAnswer/)
        assert.match(String(error.stderr), /debug bundle pending input type enum must exactly match/)
        assert.match(String(error.stderr), /unknown/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects pending action export field drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-pending-export-'))
  try {
    const source = await readFile(agentRunPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentRunPage.tsx')
    await writeFile(overridePath, source.replace('      reason: approval.reason,\n', ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_PAGE_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle pending action export includes reason: approval\.reason/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects pending action filter drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-pending-filter-'))
  try {
    const source = await readFile(agentRunPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentRunPage.tsx')
    await writeFile(overridePath, source.replace("    .filter((request) => request.status === 'pending')\n", ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_PAGE_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle pending inputs export only includes pending input requests/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects pending action contract documentation drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-pending-doc-'))
  try {
    const source = await readFile(bundleContractPath, 'utf8')
    const overridePath = path.join(root, 'agent-run-debug-bundle-v1.zh-CN.md')
    await writeFile(overridePath, source.replace('`inputType`: 固定为 `choice`、`text` 或 `confirmation`。\n', ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_BUNDLE_CONTRACT_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle contract documents pending input type enum/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects acceptance summary fixture schema drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-summary-fixture-'))
  try {
    const fixture = JSON.parse(await readFile(acceptanceSummaryFixturePath, 'utf8'))
    delete fixture.screenshotArtifacts
    const overridePath = path.join(root, 'acceptance-summary.fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_FIXTURE_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /acceptanceSummaryFixture\.screenshotArtifacts is required by schema/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects acceptance summary screenshot list drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-summary-screenshots-'))
  try {
    const fixture = JSON.parse(await readFile(acceptanceSummaryFixturePath, 'utf8'))
    fixture.requiredScreenshots = fixture.requiredScreenshots.filter((name) => name !== 'agent-run-missing-data.png')
    const overridePath = path.join(root, 'acceptance-summary.fixture.json')
    await writeJSON(overridePath, fixture)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_FIXTURE_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /acceptance summary fixture required screenshots must exactly match/)
        assert.match(String(error.stderr), /agent-run-missing-data\.png/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects acceptance summary loose object schemas', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-summary-loose-'))
  try {
    const schema = JSON.parse(await readFile(path.resolve('docs/agent-run-debugging-acceptance-summary-v1.schema.json'), 'utf8'))
    schema.additionalProperties = true
    schema.$defs.stepResult.additionalProperties = true
    const overridePath = path.join(root, 'acceptance-summary.schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_SCHEMA_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /acceptance summary schema must reject extra top-level fields/)
        assert.match(stderr, /acceptance summary step result schema must reject extra fields/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects acceptance summary screenshot list schema drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-summary-screenshot-schema-'))
  try {
    const schema = JSON.parse(await readFile(path.resolve('docs/agent-run-debugging-acceptance-summary-v1.schema.json'), 'utf8'))
    schema.properties.requiredScreenshots.minItems = 5
    schema.properties.requiredScreenshots.maxItems = 7
    const overridePath = path.join(root, 'acceptance-summary.schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /acceptance summary schema required screenshots minItems: expected 6, got 5/)
        assert.match(String(error.stderr), /acceptance summary schema required screenshots maxItems: expected 6, got 7/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects acceptance summary screenshot diagnostics schema drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-summary-screenshot-diagnostics-'))
  try {
    const schema = JSON.parse(await readFile(path.resolve('docs/agent-run-debugging-acceptance-summary-v1.schema.json'), 'utf8'))
    const fixture = JSON.parse(await readFile(acceptanceSummaryFixturePath, 'utf8'))
    schema.properties.screenshotDiagnostics = { type: 'object' }
    schema.$defs.screenshotDiagnostics.additionalProperties = true
    schema.$defs.screenshotDiagnostics.properties.presentScreenshots = { type: 'array' }
    schema.$defs.screenshotDiagnostics.properties.invalidScreenshots.items.properties.reasons.minItems = 0
    schema.$defs.screenshotList.items.enum = schema.$defs.screenshotList.items.enum.filter((name) => name !== 'agent-run-missing-data.png')
    fixture.screenshotDiagnostics.presentScreenshots = fixture.screenshotDiagnostics.presentScreenshots.filter((name) => name !== 'agent-run-missing-data.png')
    fixture.screenshotDiagnostics.missingScreenshots = ['agent-run-missing-data.png']
    const schemaOverridePath = path.join(root, 'acceptance-summary.schema.json')
    const fixtureOverridePath = path.join(root, 'acceptance-summary.fixture.json')
    await writeJSON(schemaOverridePath, schema)
    await writeJSON(fixtureOverridePath, fixture)

    await assert.rejects(
      runVerifier(undefined, {
        AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_SCHEMA_PATH: schemaOverridePath,
        AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_FIXTURE_PATH: fixtureOverridePath,
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /acceptance summary screenshot diagnostics must use a schema definition/)
        assert.match(stderr, /acceptance summary screenshot diagnostics must reject extra fields/)
        assert.match(stderr, /acceptance summary present screenshots must use shared list schema/)
        assert.match(stderr, /acceptance summary screenshot diagnostics enum/)
        assert.match(stderr, /acceptance summary invalid screenshot reasons must be non-empty/)
        assert.match(stderr, /acceptance summary fixture present screenshots/)
        assert.match(stderr, /acceptance summary fixture missing screenshots/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects acceptance summary artifact root schema drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-summary-artifact-root-'))
  try {
    const schema = JSON.parse(await readFile(path.resolve('docs/agent-run-debugging-acceptance-summary-v1.schema.json'), 'utf8'))
    schema.properties.artifactRoot = { const: 'apps/frontend/test-results' }
    const overridePath = path.join(root, 'acceptance-summary.schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_SCHEMA_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /acceptance summary artifactRoot must allow runner artifact root override/)
        assert.match(String(error.stderr), /acceptance summary artifactRoot must be non-empty/)
        assert.match(String(error.stderr), /acceptance summary artifactRoot must not be fixed to the default path/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects acceptance summary environment schema drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-summary-environment-'))
  try {
    const schema = JSON.parse(await readFile(path.resolve('docs/agent-run-debugging-acceptance-summary-v1.schema.json'), 'utf8'))
    const fixture = JSON.parse(await readFile(acceptanceSummaryFixturePath, 'utf8'))
    schema.properties.environment = { type: 'object' }
    schema.$defs.environment.additionalProperties = true
    schema.$defs.environment.properties.preflightPort.maximum = 70000
    delete fixture.environment.baseURLOrigin
    const schemaOverridePath = path.join(root, 'acceptance-summary.schema.json')
    const fixtureOverridePath = path.join(root, 'acceptance-summary.fixture.json')
    await writeJSON(schemaOverridePath, schema)
    await writeJSON(fixtureOverridePath, fixture)

    await assert.rejects(
      runVerifier(undefined, {
        AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_SCHEMA_PATH: schemaOverridePath,
        AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_FIXTURE_PATH: fixtureOverridePath,
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /acceptance summary fixture environment has no external base URL origin/)
        assert.match(stderr, /acceptance summary environment must use a schema definition/)
        assert.match(stderr, /acceptance summary environment must reject extra fields/)
        assert.match(stderr, /acceptance summary environment preflightPort maximum/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects E2E runner relative artifact root drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-relative-root-drift-'))
  try {
    const source = await readFile(e2eRunnerPath, 'utf8')
    const overridePath = path.join(root, 'run-agent-run-debugging-e2e.mjs')
    await writeFile(overridePath, source
      .replace('const resolvedArtifactRoot = artifactRootOverride ? path.resolve(root, artifactRootOverride) : defaultArtifactRoot', 'const resolvedArtifactRoot = artifactRoot')
      .replace(', env: browserEnvironment()', '')
      .replace('AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: resolvedArtifactRoot', 'AGENT_RUN_DEBUG_E2E_ARTIFACT_ROOT: artifactRoot'))
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_E2E_RUNNER_PATH: overridePath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /E2E runner resolves artifact root overrides from the repository root/)
        assert.match(String(error.stderr), /E2E runner passes the resolved artifact root to the browser process/)
        assert.match(String(error.stderr), /E2E runner browser environment uses the resolved artifact root/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects E2E runner acceptance summary validation drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-summary-validation-drift-'))
  try {
    const runnerSource = await readFile(e2eRunnerPath, 'utf8')
    const contractSource = await readFile(acceptanceSummaryContractPath, 'utf8')
    const runnerOverridePath = path.join(root, 'run-agent-run-debugging-e2e.mjs')
    const contractOverridePath = path.join(root, 'agent-run-debugging-acceptance-summary-contract.mjs')
    await writeFile(runnerOverridePath, runnerSource
      .replace('  assertValidAcceptanceSummary(summary)\n', '')
      .replace('    environment: acceptanceEnvironment(),\n', '')
      .replace('function acceptanceEnvironment()', 'function removedAcceptanceEnvironment()')
      .replace('baseURLOrigin: externalBaseURLOrigin()', 'baseURLOrigin: null')
      .replace('function externalBaseURLOrigin()', 'function removedExternalBaseURLOrigin()'))
    await writeFile(contractOverridePath, contractSource
      .replace('export function validateAcceptanceSummary(summary)', 'export function removedAcceptanceSummaryValidation(summary)')
      .replace('  validateEnvironment(summary.environment, errors)\n', '')
      .replace('environment.preflightPort must be an integer port or null', 'environment preflight validation removed')
      .replace('requiredScreenshots must match the runner screenshot list', 'requiredScreenshots validation removed')
      .replace('  validateScreenshotDiagnostics(summary.screenshotDiagnostics, errors)\n', '')
      .replace('screenshotDiagnostics must partition the runner screenshot list', 'screenshot diagnostics validation removed')
      .replace('screenshotDiagnostics.invalidScreenshots must not duplicate screenshot names', 'duplicate invalid diagnostics validation removed')
      .replace('screenshotDiagnostics.invalidScreenshots must not include missing screenshots', 'invalid missing diagnostics validation removed')
      .replace("validateSummaryStep(summary.cleanArtifacts, 'cleanArtifacts', errors)\n", '')
      .replace('passed must match cleanup, browser, and screenshot artifact step status', 'passed validation removed'))
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_E2E_RUNNER_PATH: runnerOverridePath,
          AGENT_RUN_DEBUG_ACCEPTANCE_SUMMARY_CONTRACT_PATH: contractOverridePath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /E2E runner validates acceptance summary before writing it/)
        assert.match(String(error.stderr), /acceptance summary contract defines summary validation/)
        assert.match(String(error.stderr), /E2E runner writes acceptance summary environment/)
        assert.match(String(error.stderr), /E2E runner defines acceptance summary environment/)
        assert.match(String(error.stderr), /E2E runner records redacted base URL origin/)
        assert.match(String(error.stderr), /E2E runner redacts external base URL details/)
        assert.match(String(error.stderr), /acceptance summary contract validates environment/)
        assert.match(String(error.stderr), /acceptance summary contract validates preflight port/)
        assert.match(String(error.stderr), /acceptance summary contract validates artifact cleanup summary step/)
        assert.match(String(error.stderr), /acceptance summary contract validates screenshot diagnostics/)
        assert.match(String(error.stderr), /acceptance summary contract validates screenshot diagnostics partition/)
        assert.match(String(error.stderr), /acceptance summary contract rejects duplicate invalid screenshot diagnostics/)
        assert.match(String(error.stderr), /acceptance summary contract rejects invalid diagnostics for missing screenshots/)
        assert.match(String(error.stderr), /acceptance summary contract validates screenshot list/)
        assert.match(String(error.stderr), /acceptance summary contract validates pass state/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects frontend/backend trace kind drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-trace-kind-'))
  try {
    const source = await readFile(localAgentClientPath, 'utf8')
    const overridePath = path.join(root, 'localAgentClient.ts')
    await writeFile(overridePath, source.replace("  'error',\n", "  'error',\n  'frontend_only',\n"))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_LOCAL_AGENT_CLIENT_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /frontend AGENT_TRACE_EVENT_KINDS must match backend AGENT_TRACE_EVENT_KINDS/)
        assert.match(String(error.stderr), /frontend_only/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects backend-only trace kinds', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-backend-trace-kind-'))
  try {
    const source = await readFile(agentStateTypesPath, 'utf8')
    const overridePath = path.join(root, 'types.ts')
    await writeFile(overridePath, source.replace("  'error',\n", "  'error',\n  'backend_only',\n"))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_STATE_TYPES_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /frontend AGENT_TRACE_EVENT_KINDS must match backend AGENT_TRACE_EVENT_KINDS/)
        assert.match(String(error.stderr), /backend_only/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects frontend/backend trace status drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-trace-status-'))
  try {
    const source = await readFile(localAgentClientPath, 'utf8')
    const overridePath = path.join(root, 'localAgentClient.ts')
    await writeFile(
      overridePath,
      source.replace(
        "  status: 'started' | 'completed' | 'blocked' | 'failed' | 'info'\n",
        "  status: 'started' | 'completed' | 'blocked' | 'failed' | 'info' | 'frontend_only'\n",
      ),
    )

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_LOCAL_AGENT_CLIENT_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /frontend AgentTraceEvent status union must match backend AgentTraceEvent status union/)
        assert.match(String(error.stderr), /frontend_only/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects backend-only trace statuses', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-backend-trace-status-'))
  try {
    const source = await readFile(agentStateTypesPath, 'utf8')
    const overridePath = path.join(root, 'types.ts')
    await writeFile(
      overridePath,
      source.replace(
        "  status: 'started' | 'completed' | 'blocked' | 'failed' | 'info'\n",
        "  status: 'started' | 'completed' | 'blocked' | 'failed' | 'info' | 'backend_only'\n",
      ),
    )

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_STATE_TYPES_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /frontend AgentTraceEvent status union must match backend AgentTraceEvent status union/)
        assert.match(String(error.stderr), /backend_only/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects backend-only trace round sources', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-backend-trace-round-source-'))
  try {
    const source = await readFile(agentStateTypesPath, 'utf8')
    const overridePath = path.join(root, 'types.ts')
    await writeFile(
      overridePath,
      source.replace(
        "  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'\n  agentId?: string\n",
        "  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final' | 'backend_only'\n  agentId?: string\n",
      ),
    )

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_STATE_TYPES_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /debug bundle trace event roundSource enum must exactly match/)
        assert.match(String(error.stderr), /frontend AgentTraceEvent roundSource union must match backend AgentTraceEvent roundSource union/)
        assert.match(String(error.stderr), /backend_only/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects backend-only trace fields', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-backend-trace-field-'))
  try {
    const source = await readFile(agentStateTypesPath, 'utf8')
    const overridePath = path.join(root, 'types.ts')
    await writeFile(
      overridePath,
      source.replace(
        "  completedAt?: string\n}\n\nexport interface AgentRun {\n",
        "  completedAt?: string\n  providerTraceId?: string\n}\n\nexport interface AgentRun {\n",
      ),
    )

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_STATE_TYPES_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /frontend AgentTraceEvent fields must match backend AgentTraceEvent fields/)
        assert.match(String(error.stderr), /providerTraceId/)
        assert.match(String(error.stderr), /debug bundle trace event property definitions missing providerTraceId/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects run page trace duration drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-page-duration-'))
  try {
    const pageSource = await readFile(agentRunPagePath, 'utf8')
    const uiSource = await readFile(agentRunUiPath, 'utf8')
    const overridePath = path.join(root, 'AIAgentRunPage.tsx')
    const uiOverridePath = path.join(root, 'agentRunUi.ts')
    await writeFile(
      overridePath,
      pageSource
        .replace('formatTraceEventDuration, ', '')
        .replace('              const eventDuration = formatTraceEventDuration(event)\n', '')
        .replace('                      {eventDuration && <span>耗时 {eventDuration}</span>}\n', "                      {formatAgentRunDuration(event.createdAt, event.completedAt) && <span>耗时 {formatAgentRunDuration(event.createdAt, event.completedAt)}</span>}\n")
    )
    await writeFile(uiOverridePath, uiSource.replace('export function formatTraceEventDuration', 'function formatTraceEventDuration'))

    await assert.rejects(
      runVerifier(undefined, {
        AGENT_RUN_DEBUG_PAGE_PATH: overridePath,
        AGENT_RUN_DEBUG_UI_PATH: uiOverridePath,
      }),
      (error) => {
        assert.match(String(error.stderr), /trace duration formatter must be shared between reports and page rows/)
        assert.match(String(error.stderr), /run page imports shared trace duration formatter/)
        assert.match(String(error.stderr), /run page trace event rows compute a duration label/)
        assert.match(String(error.stderr), /run page trace event rows render top-level durationMs fallback/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing shared trace duration tests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-duration-test-'))
  try {
    const source = await readFile(agentRunUiViewTestPath, 'utf8')
    const overridePath = path.join(root, 'agentRunUiView.test.ts')
    await writeFile(
      overridePath,
      source
        .replace("test('formatTraceEventDuration normalizes shared trace duration labels', () => {\n", "test('shared duration smoke test', () => {\n")
        .replace("  assert.equal(traceEventDurationMs(traceEvent({ durationMs: 42, data: { durationMs: 2500 } })), 2500)\n", '')
        .replace("  })), 4000)\n", "  }))\n")
        .replace("  assert.equal(formatTraceEventDuration(traceEvent({ durationMs: 1500 })), '2s')\n", '')
        .replace("  assert.equal(formatTraceEventDuration(traceEvent({ durationMs: 42, data: { durationMs: 2500 } })), '3s')\n", '')
        .replace("  })), '4s')\n", "  }))\n"),
    )

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_UI_VIEW_TEST_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /frontend tests cover shared trace duration formatter/)
        assert.match(String(error.stderr), /frontend tests cover top-level durationMs formatting/)
        assert.match(String(error.stderr), /frontend tests cover trace data duration priority/)
        assert.match(String(error.stderr), /frontend tests cover numeric timestamp duration fallback/)
        assert.match(String(error.stderr), /frontend tests cover formatted timestamp duration fallback/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing shared trace completeness tests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-completeness-test-'))
  try {
    const source = await readFile(agentRunUiViewTestPath, 'utf8')
    const overridePath = path.join(root, 'agentRunUiView.test.ts')
    await writeFile(
      overridePath,
      source
        .replace("test('hasUnloadedTraceEvents trusts pagination hasMore even when summary total is stale', () => {\n", "test('shared trace completeness smoke test', () => {\n")
        .replace('  assert.equal(hasUnloadedTraceEvents({ loaded: 25, total: 25, hasMore: true }), true)\n', ''),
    )

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_UI_VIEW_TEST_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /frontend tests cover stale summary trace completeness/)
        assert.match(String(error.stderr), /frontend tests cover hasMore priority over stale total/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing trace kind labels', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-trace-kind-label-'))
  try {
    const source = await readFile(agentRunUiPath, 'utf8')
    const overridePath = path.join(root, 'agentRunUi.ts')
    await writeFile(overridePath, source.replace("    case 'reasoning': return '推理'\n", ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_UI_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /traceKindLabel cases must cover all trace kinds/)
        assert.match(String(error.stderr), /reasoning/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing trace status labels', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-trace-status-label-'))
  try {
    const source = await readFile(agentRunUiPath, 'utf8')
    const overridePath = path.join(root, 'agentRunUi.ts')
    await writeFile(overridePath, source.replace("    case 'info': return '信息'\n", ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_UI_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /traceEventStatusLabel cases must cover all trace statuses/)
        assert.match(String(error.stderr), /info/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing trace category labels', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-trace-category-label-'))
  try {
    const source = await readFile(agentRunUiPath, 'utf8')
    const overridePath = path.join(root, 'agentRunUi.ts')
    await writeFile(overridePath, source.replace("    case 'decision': return '决策'\n", ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_UI_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /traceCategoryLabel cases must cover all trace categories/)
        assert.match(String(error.stderr), /decision/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects stale frontend audit commands', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-audit-command-'))
  try {
    const source = await readFile(auditPath, 'utf8')
    const overridePath = path.join(root, 'audit.md')
    await writeFile(overridePath, `${source}\n\npnpm --dir movscript/apps/frontend exec tsc --noEmit --pretty false\n`)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AUDIT_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /audit must not keep stale frontend workspace commands must not include pnpm --dir movscript\/apps\/frontend/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing release script regression evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-audit-release-scripts-'))
  try {
    const source = await readFile(auditPath, 'utf8')
    const overridePath = path.join(root, 'audit.md')
    await writeFile(overridePath, source
      .replace('Release 脚本回归验证（2026-05-17）', 'Release 脚本回归验证')
      .replace('pnpm run test:release-scripts', 'pnpm run test:release')
      .replace('结果：108 passed', '结果：passed'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AUDIT_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /audit records latest release script regression date/)
        assert.match(String(error.stderr), /audit records runnable release script regression command/)
        assert.match(String(error.stderr), /audit records release script regression test count/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing Makefile browser acceptance target', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-makefile-e2e-'))
  try {
    const source = await readFile(makefilePath, 'utf8')
    const overridePath = path.join(root, 'Makefile')
    await writeFile(overridePath, source
      .replace(' test-agent-run-debugging-e2e', '')
      .replace('\ntest-agent-run-debugging-e2e:\n\tpnpm run test:agent-run-debugging:e2e\n', '\n'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_MAKEFILE_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /Makefile includes AgentRun browser acceptance target/)
        assert.match(String(error.stderr), /Makefile AgentRun browser acceptance target runs E2E gate/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing Makefile browser dry-run evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-audit-makefile-dry-run-'))
  try {
    const source = await readFile(auditPath, 'utf8')
    const overridePath = path.join(root, 'audit.md')
    await writeFile(overridePath, source
      .replace('Makefile 浏览器验收入口 dry-run（2026-05-17）', 'Makefile 浏览器验收入口')
      .replace('make -n test-agent-run-debugging-e2e', 'make test-agent-run-debugging-e2e'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AUDIT_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /audit records Makefile browser acceptance dry-run date/)
        assert.match(String(error.stderr), /audit records Makefile browser acceptance dry-run command/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing Makefile failed-summary contract target', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-makefile-summary-contract-'))
  try {
    const source = await readFile(makefilePath, 'utf8')
    const overridePath = path.join(root, 'Makefile')
    await writeFile(overridePath, source
      .replace(' verify-agent-run-debugging-summary-contract', '')
      .replace('\nverify-agent-run-debugging-summary-contract:\n\tnode scripts/verify-agent-run-debugging-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY) --allow-failed\n', '\n'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_MAKEFILE_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /Makefile includes AgentRun failed-summary contract verifier target/)
        assert.match(String(error.stderr), /Makefile AgentRun failed-summary contract target allows failed summaries/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing root test gate wiring', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-root-test-script-'))
  try {
    const source = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    source.scripts.test = source.scripts.test.replace(' && pnpm run test:agent-run-debugging', '')
    const overridePath = path.join(root, 'package.json')
    await writeJSON(overridePath, source)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_PACKAGE_JSON_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /root test script runs AgentRun static debugging gate/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing CI acceptance summary printing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-ci-summary-'))
  try {
    const source = await readFile(ciWorkflowPath, 'utf8')
    const overridePath = path.join(root, 'ci.yml')
    await writeFile(overridePath, source
      .replaceAll('            cat apps/frontend/test-results/agent-run-debugging-acceptance-summary.json\n', ''))

    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_CI_WORKFLOW_PATH: overridePath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /CI prints AgentRun acceptance summary JSON/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing CI acceptance summary verifier', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-ci-summary-verifier-'))
  try {
    const source = await readFile(ciWorkflowPath, 'utf8')
    const overridePath = path.join(root, 'ci.yml')
    await writeFile(overridePath, source
      .replace('      - name: Verify AgentRun debugging acceptance summary\n        run: pnpm run verify:agent-run-debugging-summary\n\n', '')
      .replace('            node scripts/verify-agent-run-debugging-acceptance-summary.mjs apps/frontend/test-results/agent-run-debugging-acceptance-summary.json --allow-failed\n', ''))

    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_CI_WORKFLOW_PATH: overridePath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /CI verifies AgentRun acceptance summary after browser acceptance/)
        assert.match(String(error.stderr), /CI runs AgentRun acceptance summary verifier/)
        assert.match(String(error.stderr), /CI contract-checks AgentRun acceptance summary diagnostics before printing/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing CI job summary output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-ci-job-summary-'))
  try {
    const source = await readFile(ciWorkflowPath, 'utf8')
    const overridePath = path.join(root, 'ci.yml')
    await writeFile(overridePath, source
      .replaceAll(' >> "$GITHUB_STEP_SUMMARY"', '')
      .replaceAll('### AgentRun debugging acceptance summary', 'AgentRun debugging acceptance summary'))

    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_CI_WORKFLOW_PATH: overridePath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /CI writes AgentRun acceptance summary to the GitHub job summary/)
        assert.match(String(error.stderr), /CI labels the AgentRun acceptance job summary section/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing PR acceptance summary review', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-pr-summary-'))
  try {
    const source = await readFile(pullRequestTemplatePath, 'utf8')
    const overridePath = path.join(root, 'pull_request_template.md')
    await writeFile(overridePath, source
      .replace(' or CI `agent-run-debugging-playwright-results` artifact reviewed with `agent-run-debugging-acceptance-summary.json` showing `passed: true`', ' or CI `agent-run-debugging-playwright-results` artifact reviewed'))

    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_PULL_REQUEST_TEMPLATE_PATH: overridePath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /PR template asks reviewers to inspect AgentRun acceptance summary/)
        assert.match(String(error.stderr), /PR template requires passing AgentRun acceptance summary/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing release acceptance summary review', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-release-summary-'))
  try {
    const zhSource = await readFile(releaseChecklistZhPath, 'utf8')
    const enSource = await readFile(releaseChecklistEnPath, 'utf8')
    const zhOverridePath = path.join(root, 'release-checklist.zh-CN.md')
    const enOverridePath = path.join(root, 'release-checklist.md')
    await writeFile(zhOverridePath, zhSource.replace('；确认 `agent-run-debugging-acceptance-summary.json` 中 `passed` 为 `true`，且 `node scripts/verify-agent-run-debugging-acceptance-summary.mjs <summary-path>` 通过', ''))
    await writeFile(enOverridePath, enSource.replace(', `agent-run-debugging-acceptance-summary.json` shows `passed: true`, and `node scripts/verify-agent-run-debugging-acceptance-summary.mjs <summary-path>` passes', ''))

    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_RELEASE_CHECKLIST_ZH_PATH: zhOverridePath,
          AGENT_RUN_DEBUG_RELEASE_CHECKLIST_EN_PATH: enOverridePath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /Chinese release checklist includes AgentRun acceptance summary review/)
        assert.match(String(error.stderr), /English release checklist includes AgentRun acceptance summary review/)
        assert.match(String(error.stderr), /English release checklist requires passing AgentRun acceptance summary/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing acceptance summary schema docs index link', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-docs-index-'))
  try {
    const source = await readFile(docsIndexPath, 'utf8')
    const overridePath = path.join(root, 'README.zh-CN.md')
    await writeFile(overridePath, source.replace('- [AgentRun 调试验收摘要 v1 schema](agent-run-debugging-acceptance-summary-v1.schema.json)\n', ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_DOCS_INDEX_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /docs index links acceptance summary schema must include AgentRun 调试验收摘要 v1 schema/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing acceptance summary schema English docs index link', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-docs-index-en-'))
  try {
    const source = await readFile(docsIndexEnPath, 'utf8')
    const overridePath = path.join(root, 'README.md')
    await writeFile(overridePath, source.replace('- [AgentRun debugging acceptance summary v1 schema](agent-run-debugging-acceptance-summary-v1.schema.json)\n', ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_DOCS_INDEX_EN_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /English docs index links acceptance summary schema must include AgentRun debugging acceptance summary v1 schema/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing acceptance screenshot captures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-e2e-screenshot-'))
  try {
    const source = await readFile(e2ePath, 'utf8')
    const overridePath = path.join(root, 'agent-planner.spec.ts')
    await writeFile(overridePath, source.replace("  await captureAgentRunAcceptanceScreenshot(page, testInfo, 'agent-run-attention-events')\n", ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_E2E_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /E2E acceptance screenshot capture count: expected 6, got 5/)
        assert.match(String(error.stderr), /E2E captures agent-run-attention-events screenshot/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects extra acceptance screenshot captures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-e2e-extra-screenshot-'))
  try {
    const source = await readFile(e2ePath, 'utf8')
    const overridePath = path.join(root, 'agent-planner.spec.ts')
    await writeFile(
      overridePath,
      source.replace(
        "  await captureAgentRunAcceptanceScreenshot(page, testInfo, 'agent-run-missing-data')\n",
        "  await captureAgentRunAcceptanceScreenshot(page, testInfo, 'agent-run-missing-data')\n  await captureAgentRunAcceptanceScreenshot(page, testInfo, 'agent-run-extra-debug-state')\n",
      ),
    )

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_E2E_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /E2E acceptance screenshot capture count: expected 6, got 7/)
        assert.match(String(error.stderr), /E2E acceptance screenshot captures must exactly match/)
        assert.match(String(error.stderr), /agent-run-extra-debug-state/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects artifact verifier test screenshot drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-artifact-screenshot-'))
  try {
    const source = await readFile(artifactVerifierTestPath, 'utf8')
    const overridePath = path.join(root, 'verify-agent-run-debugging-artifacts.test.mjs')
    await writeFile(overridePath, source.replace("  'agent-run-missing-data.png',\n", ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_ARTIFACT_VERIFIER_TEST_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /artifact verifier tests cover agent-run-missing-data screenshot/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects acceptance document screenshot drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-acceptance-screenshot-'))
  try {
    const source = await readFile(acceptancePath, 'utf8')
    const overridePath = path.join(root, 'agent-run-debugging-acceptance.zh-CN.md')
    await writeFile(overridePath, source.replace('| `agent-run-http-response-detail` | HTTP 响应、响应头、原始响应正文、模型结果。 |\n', ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_ACCEPTANCE_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /acceptance doc lists agent-run-http-response-detail screenshot/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing artifact verifier screenshots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-artifact-missing-'))
  try {
    const source = await readFile(artifactVerifierPath, 'utf8')
    const overridePath = path.join(root, 'verify-agent-run-debugging-artifacts.mjs')
    await writeFile(overridePath, source.replace("  'agent-run-http-request-detail.png',\n", ''))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_ARTIFACT_VERIFIER_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /artifact verifier required screenshots must exactly match/)
        assert.match(String(error.stderr), /agent-run-http-request-detail/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects extra artifact verifier screenshots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-artifact-extra-'))
  try {
    const source = await readFile(artifactVerifierPath, 'utf8')
    const overridePath = path.join(root, 'verify-agent-run-debugging-artifacts.mjs')
    await writeFile(overridePath, source.replace("  'agent-run-missing-data.png',\n", "  'agent-run-missing-data.png',\n  'agent-run-extra-debug-state.png',\n"))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_ARTIFACT_VERIFIER_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /artifact verifier required screenshots must exactly match/)
        assert.match(String(error.stderr), /agent-run-extra-debug-state/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function readFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'))
}

async function writeJSON(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

function runVerifier(overridePath, envOverrides = {}) {
  return execFileAsync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      ...(overridePath ? { AGENT_RUN_DEBUG_FIXTURE_PATH: overridePath } : {}),
      ...envOverrides,
    },
  })
}
