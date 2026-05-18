import { execFile } from 'node:child_process'
import { readFile, rm, writeFile, mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import assert from 'node:assert/strict'

const execFileAsync = promisify(execFile)
const scriptPath = path.resolve('tests/scripts/agent/verify-run-debugging.mjs')
const schemaPath = path.resolve('contracts/agent-run-debugging/agent-run-debug-bundle-v1.schema.json')
const fixturePath = path.resolve('contracts/agent-run-debugging/agent-run-debug-bundle-v1.fixture.json')
const acceptanceSummaryFixturePath = path.resolve('contracts/agent-run-debugging/agent-run-debugging-acceptance-summary-v1.fixture.json')
const e2ePath = path.resolve('apps/frontend/src/e2e/agent-planner.spec.ts')
const e2eRunnerPath = path.resolve('tests/agent-run-debugging/run-e2e.mjs')
const artifactVerifierPath = path.resolve('tests/agent-run-debugging/verify-artifacts.mjs')
const artifactVerifierTestPath = path.resolve('tests/scripts/agent/verify-run-debugging-artifacts.test.mjs')
const acceptanceSummaryContractPath = path.resolve('tests/agent-run-debugging/acceptance-summary-contract.mjs')
const ciWorkflowPath = path.resolve('.github/workflows/ci.yml')
const pullRequestTemplatePath = path.resolve('.github/pull_request_template.md')
const makefilePath = path.resolve('Makefile')
const packageJsonPath = path.resolve('package.json')
const frontendPackageJsonPath = path.resolve('apps/frontend/package.json')
const localAgentClientPath = path.resolve('apps/frontend/src/lib/localAgentClient.ts')
const agentStateTypesPath = path.resolve('apps/agent/src/state/types.ts')
const agentRunUiPath = path.resolve('apps/frontend/src/lib/agentRunUi.ts')
const agentRunUiViewTestPath = path.resolve('apps/frontend/src/lib/agentRunUiView.test.ts')
const agentRunPagePath = path.resolve('apps/frontend/src/pages/agent/AIAgentRunPage.tsx')
const agentDebugPagePath = path.resolve('apps/frontend/src/pages/agent/AIAgentDebugPage.tsx')
const agentSettingsPagePath = path.resolve('apps/frontend/src/pages/agent/AIAgentSettingsPage.tsx')
const agentStorePath = path.resolve('apps/frontend/src/store/agentStore.ts')
const agentStoreTestPath = path.resolve('apps/frontend/src/store/agentStore.test.ts')
const agentDebugBundleSchemaPath = path.resolve('contracts/agent/agent-debug-bundle-v1.schema.json')
const agentSettingsSnapshotSchemaPath = path.resolve('contracts/agent/agent-settings-snapshot-v1.schema.json')
const agentSettingsSnapshotSourcePath = path.resolve('apps/frontend/src/lib/agentSettingsSnapshot.ts')
const docsReadmePath = path.resolve('docs/README.md')
const docsReadmeZhPath = path.resolve('docs/README.zh-CN.md')
const settingsDebugDocPath = path.resolve('docs/agent-settings-debug.md')
const settingsDebugDocZhPath = path.resolve('docs/agent-settings-debug.zh-CN.md')
const agentSchemaReferenceDocPath = path.resolve('docs/agent-schema-reference.md')
const agentSchemaReferenceDocZhPath = path.resolve('docs/agent-schema-reference.zh-CN.md')

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

test('AgentRun debugging static verifier rejects Agent Debug bundle schema drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-debug-bundle-schema-drift-'))
  try {
    const schema = JSON.parse(await readFile(agentDebugBundleSchemaPath, 'utf8'))
    schema.properties.remediationPlan.items.$ref = '#/$defs/legacyItem'
    delete schema.$defs.remediationItem
    const overridePath = path.join(root, 'agent-debug-bundle.schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_DEBUG_BUNDLE_SCHEMA_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Debug bundle schema must define remediation items/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings snapshot schema drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-snapshot-schema-drift-'))
  try {
    const schema = JSON.parse(await readFile(agentSettingsSnapshotSchemaPath, 'utf8'))
    schema.required = schema.required.filter((field) => field !== 'schemaUrl')
    schema.properties.modelConfig.properties.apiKind.enum = schema.properties.modelConfig.properties.apiKind.enum.filter((kind) => kind !== 'openai_responses')
    const overridePath = path.join(root, 'agent-settings-snapshot.schema.json')
    await writeJSON(overridePath, schema)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_SETTINGS_SNAPSHOT_SCHEMA_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings snapshot required fields missing schemaUrl/)
        assert.match(stderr, /Agent Settings snapshot model apiKind enum must exactly match/)
        assert.match(stderr, /openai_responses/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings snapshot redaction drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-snapshot-redaction-drift-'))
  try {
    const source = await readFile(agentSettingsSnapshotSourcePath, 'utf8')
    const overridePath = path.join(root, 'agentSettingsSnapshot.ts')
    await writeFile(overridePath, source
      .replace('...(config.baseURL ? { baseURL: stripSensitiveURLSecrets(config.baseURL) } : {}),', '...(config.baseURL ? { baseURL: config.baseURL } : {}),')
      .replace('if (apiKind !== \'backend_chat_completions\' && hasSensitiveTextSecret(config.model)) return undefined', 'if (apiKind !== \'backend_chat_completions\' && false) return undefined'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_SETTINGS_SNAPSHOT_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings snapshot export must strip URL secrets/)
        assert.match(stderr, /Agent Settings snapshot export must avoid secret-looking direct model ids/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings snapshot dry-run drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-snapshot-dry-run-drift-'))
  try {
    const source = await readFile(agentSettingsPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    await writeFile(overridePath, source
      .replace('function previewSettingsSnapshotImport()', 'function removedPreviewSettingsSnapshotImport()')
      .replaceAll('settingsSnapshotImportPreflightError()', 'removedSettingsSnapshotPreflight()')
      .replace('data-testid="agent-settings-preview-import-dry-run"', 'data-testid="agent-settings-preview-import-removed"')
      .replace('agents.settings.settingsSnapshotDryRunReady', 'agents.settings.settingsSnapshotDryRunRemoved'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings page must expose snapshot dry-run preview/)
        assert.match(stderr, /Agent Settings snapshot dry-run must reuse import preflight validation/)
        assert.match(stderr, /Agent Settings page must expose dry-run button/)
        assert.match(stderr, /Agent Settings page must report dry-run success without writes/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings snapshot selective import drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-snapshot-selective-import-drift-'))
  try {
    const source = await readFile(agentSettingsPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    await writeFile(overridePath, source
      .replace('type SettingsSnapshotImportScope', 'type RemovedSnapshotImportScope')
      .replace('type SettingsSnapshotImportPresetId', 'type RemovedSnapshotImportPresetId')
      .replaceAll('SETTINGS_SNAPSHOT_IMPORT_SCOPES', 'REMOVED_SNAPSHOT_IMPORT_SCOPES')
      .replaceAll('SETTINGS_SNAPSHOT_IMPORT_PRESETS', 'REMOVED_SNAPSHOT_IMPORT_PRESETS')
      .replaceAll('settingsSnapshotImportScopes', 'removedSnapshotImportScopes')
      .replaceAll('applySettingsSnapshotImportPreset', 'removedApplySettingsSnapshotImportPreset')
      .replaceAll('selectSettingsSnapshotForImport', 'removedSelectSettingsSnapshotForImport')
      .replaceAll('settingsSnapshotHasSelectedImportScope', 'removedSnapshotHasSelectedImportScope')
      .replace('data-testid="agent-settings-snapshot-import-scopes"', 'data-testid="agent-settings-snapshot-import-scopes-removed"')
      .replace('data-testid="agent-settings-snapshot-import-presets"', 'data-testid="agent-settings-snapshot-import-presets-removed"')
      .replace('data-testid="agent-settings-snapshot-import-scope"', 'data-testid="agent-settings-snapshot-import-scope-removed"')
      .replace('const snapshot = selectedSettingsSnapshotForImport', 'const snapshot = parsedSettingsSnapshot')
      .replace('const writesRuntime = Boolean(snapshot.modelConfig || snapshot.defaultProfileId || snapshot.skillPolicy || snapshot.toolPolicy)', 'const writesRuntime = true')
      .replace("filter((item) => item.scope !== 'skipped').length", 'length')
      .replace('agents.settings.settingsSnapshotImportScopeEmpty', 'agents.settings.settingsSnapshotImportScopeEmptyRemoved'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings snapshot import must have typed selectable import sections/)
        assert.match(stderr, /Agent Settings snapshot import must type named import presets/)
        assert.match(stderr, /Agent Settings snapshot import must define named import presets/)
        assert.match(stderr, /Agent Settings snapshot import must apply named import presets/)
        assert.match(stderr, /Agent Settings snapshot import must filter snapshots to selected sections/)
        assert.match(stderr, /Agent Settings page must expose snapshot import section selector/)
        assert.match(stderr, /Agent Settings page must expose snapshot import presets/)
        assert.match(stderr, /Agent Settings snapshot import must write selected sections only/)
        assert.match(stderr, /Agent Settings snapshot import must not require Runtime for local-only run preset imports/)
        assert.match(stderr, /Agent Settings dry-run message must summarize selected write impact count/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings API mode migration drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-api-mode-migration-drift-'))
  try {
    const source = await readFile(agentSettingsPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    await writeFile(overridePath, source
      .replaceAll('API_MODE_MIGRATION_STEPS', 'REMOVED_MODE_GUIDE_STEPS')
      .replaceAll('ApiModeMigrationGuide', 'RemovedModeGuide')
      .replace('type ModelCompatibilityProbe', 'type RemovedModelCompatibilityProbe')
      .replaceAll('buildModelCompatibilityProbes', 'removedBuildModelCompatibilityProbes')
      .replaceAll('ModelCompatibilityProbePanel', 'RemovedProviderProbePanel')
      .replace('data-testid="agent-settings-api-mode-migration-guide"', 'data-testid="agent-settings-api-mode-migration-guide-removed"')
      .replace('data-testid="agent-settings-switch-responses-from-migration"', 'data-testid="agent-settings-switch-responses-from-migration-removed"')
      .replace('data-testid="agent-settings-model-compatibility-probes"', 'data-testid="agent-settings-model-compatibility-probes-removed"'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings page must define call mode migration guidance/)
        assert.match(stderr, /Agent Settings page must show call mode migration guidance/)
        assert.match(stderr, /Agent Settings page must expose call mode migration guide/)
        assert.match(stderr, /Agent Settings page must offer Chat Completions to Responses migration action/)
        assert.match(stderr, /Agent Settings page must type provider model compatibility probes/)
        assert.match(stderr, /Agent Settings page must build provider model compatibility probes/)
        assert.match(stderr, /Agent Settings page must show provider model compatibility probes/)
        assert.match(stderr, /Agent Settings page must expose provider model compatibility probes/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings Skill governance drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-skill-governance-drift-'))
  try {
    const source = await readFile(agentSettingsPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    await writeFile(overridePath, source
      .replaceAll('buildSkillGovernanceStats', 'removedSkillGovernanceStats')
      .replaceAll('skillSourceKind', 'removedSkillSourceKind')
      .replaceAll('skillTrustLevel', 'removedSkillTrustLevel')
      .replace('data-testid="agent-settings-skill-governance"', 'data-testid="agent-settings-skill-governance-removed"'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings page must summarize Skill governance posture/)
        assert.match(stderr, /Agent Settings page must classify Skill source/)
        assert.match(stderr, /Agent Settings page must classify Skill trust level/)
        assert.match(stderr, /Agent Settings page must expose Skill governance summary/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings tool policy diff drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-tool-policy-diff-drift-'))
  try {
    const source = await readFile(agentSettingsPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    await writeFile(overridePath, source
      .replaceAll('buildToolPolicyDiffItems', 'removedBuildToolPolicyDiffItems')
      .replaceAll('ToolPolicyDiffPreview', 'RemovedPolicyPreview')
      .replace('data-testid="agent-settings-tool-policy-diff"', 'data-testid="agent-settings-tool-policy-diff-removed"')
      .replace('data-testid="agent-settings-copy-tool-policy-diff"', 'data-testid="agent-settings-copy-tool-policy-diff-removed"'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings page must compute tool policy diffs before saving/)
        assert.match(stderr, /Agent Settings page must preview tool policy diffs before saving/)
        assert.match(stderr, /Agent Settings page must expose tool policy diff preview/)
        assert.match(stderr, /Agent Settings page must allow copying tool policy diff summaries/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings tool policy filter drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-tool-policy-filter-drift-'))
  try {
    const source = await readFile(agentSettingsPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    await writeFile(overridePath, source
      .replaceAll('TOOL_POLICY_FILTER_OPTIONS', 'REMOVED_TOOL_FILTERS')
      .replaceAll('toolPolicySearch', 'removedToolPolicySearch')
      .replaceAll('toolPolicyFilterMatches', 'removedToolPolicyFilterMatches')
      .replace('data-testid="agent-settings-tool-policy-filters"', 'data-testid="agent-settings-tool-policy-filters-removed"')
      .replace('data-testid="agent-settings-tool-policy-search"', 'data-testid="agent-settings-tool-policy-search-removed"'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings page must define tool policy filters for large catalogs/)
        assert.match(stderr, /Agent Settings page must support searching large tool catalogs/)
        assert.match(stderr, /Agent Settings page must filter tool policy rows/)
        assert.match(stderr, /Agent Settings page must expose tool policy filter controls/)
        assert.match(stderr, /Agent Settings page must expose tool policy search input/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings tool policy filter preset drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-tool-policy-filter-preset-drift-'))
  try {
    const settingsSource = await readFile(agentSettingsPagePath, 'utf8')
    const storeSource = await readFile(agentStorePath, 'utf8')
    const storeTestSource = await readFile(agentStoreTestPath, 'utf8')
    const settingsOverridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    const storeOverridePath = path.join(root, 'agentStore.ts')
    const storeTestOverridePath = path.join(root, 'agentStore.test.ts')
    await writeFile(settingsOverridePath, settingsSource
      .replaceAll('saveToolPolicyFilterPreset', 'removedSaveToolPolicyFilterPreset')
      .replaceAll('applyToolPolicyFilterPreset', 'removedApplyToolPolicyFilterPreset')
      .replaceAll('deleteToolPolicyFilterPreset', 'removedDeleteToolPolicyFilterPreset')
      .replace('data-testid="agent-settings-tool-policy-filter-presets"', 'data-testid="agent-settings-tool-policy-filter-presets-removed"'))
    await writeFile(storeOverridePath, storeSource
      .replaceAll('toolPolicyFilterPresets', 'removedToolPolicyFilterPresets')
      .replaceAll('normalizeToolPolicyFilterPresets', 'removedNormalizeToolPolicyFilterPresets'))
    await writeFile(storeTestOverridePath, storeTestSource
      .replace('normalizes persisted tool policy filter presets', 'normalizes removed tool policy filters'))

    await assert.rejects(
      runVerifier(undefined, {
        AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: settingsOverridePath,
        AGENT_RUN_DEBUG_AGENT_STORE_PATH: storeOverridePath,
        AGENT_RUN_DEBUG_AGENT_STORE_TEST_PATH: storeTestOverridePath,
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings store must persist tool policy filter presets/)
        assert.match(stderr, /Agent Settings store must normalize tool policy filter presets/)
        assert.match(stderr, /Agent Settings store tests must cover tool policy filter preset normalization/)
        assert.match(stderr, /Agent Settings page must save recurring tool policy filters/)
        assert.match(stderr, /Agent Settings page must apply saved tool policy filters/)
        assert.match(stderr, /Agent Settings page must delete saved tool policy filters/)
        assert.match(stderr, /Agent Settings page must expose saved tool policy filter presets/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings tool policy bulk edit drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-tool-policy-bulk-drift-'))
  try {
    const source = await readFile(agentSettingsPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    await writeFile(overridePath, source
      .replace('type ToolPolicyBulkAction', 'type RemovedBulkAction')
      .replaceAll('applyToolPolicyBulkEdit', 'removedApplyToolPolicyBulkEdit')
      .replace('data-testid="agent-settings-tool-policy-bulk-actions"', 'data-testid="agent-settings-tool-policy-bulk-actions-removed"'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings page must type tool policy bulk actions/)
        assert.match(stderr, /Agent Settings page must apply bulk edits to filtered tool policy rows/)
        assert.match(stderr, /Agent Settings page must expose tool policy bulk edit controls/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings run preset lifecycle drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-run-preset-lifecycle-drift-'))
  try {
    const source = await readFile(agentSettingsPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    await writeFile(overridePath, source
      .replace('data-testid="agent-run-preset-create"', 'data-testid="agent-run-preset-create-removed"')
      .replace('data-testid="agent-run-preset-duplicate"', 'data-testid="agent-run-preset-duplicate-removed"')
      .replace('data-testid="agent-run-preset-delete"', 'data-testid="agent-run-preset-delete-removed"')
      .replaceAll('uniqueRunPresetId', 'removedUniqueRunPresetId')
      .replaceAll('DEFAULT_RUN_PRESET_IDS.has(activeRunPreset.id)', 'false')
      .replace('run_preset_created', 'run_preset_created_removed')
      .replace('run_preset_duplicated', 'run_preset_duplicated_removed')
      .replace('run_preset_deleted', 'run_preset_deleted_removed'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings page must support creating run presets/)
        assert.match(stderr, /Agent Settings page must support duplicating run presets/)
        assert.match(stderr, /Agent Settings page must support deleting custom run presets/)
        assert.match(stderr, /Agent Settings page must avoid run preset id collisions/)
        assert.match(stderr, /Agent Settings page must protect built-in run presets from deletion/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings quick fix audit category drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-quick-fix-audit-drift-'))
  try {
    const source = await readFile(agentSettingsPagePath, 'utf8')
    const overridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    await writeFile(overridePath, source
      .replace('type SettingsQuickFixAuditKind', 'type RemovedQuickFixAuditKind')
      .replaceAll('settings_quick_fix_draft_repair', 'settings_quick_fix_applied')
      .replaceAll('settings_quick_fix_sensitive_cleanup', 'settings_quick_fix_applied')
      .replaceAll('settings_quick_fix_risk_downgrade', 'settings_quick_fix_applied')
      .replaceAll('settings_quick_fix_mode_migration', 'settings_quick_fix_applied'))

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: overridePath }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Settings page must type quick fix audit categories/)
        assert.match(stderr, /Agent Settings page must audit draft repair quick fixes distinctly/)
        assert.match(stderr, /Agent Settings page must audit sensitive cleanup quick fixes distinctly/)
        assert.match(stderr, /Agent Settings page must audit risk downgrade quick fixes distinctly/)
        assert.match(stderr, /Agent Settings page must audit call mode migration quick fixes distinctly/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings and Debug page boundary drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-debug-boundary-drift-'))
  try {
    const debugSource = await readFile(agentDebugPagePath, 'utf8')
    const settingsSource = await readFile(agentSettingsPagePath, 'utf8')
    const debugOverridePath = path.join(root, 'AIAgentDebugPage.tsx')
    const settingsOverridePath = path.join(root, 'AIAgentSettingsPage.tsx')
    await writeFile(debugOverridePath, debugSource
      .replace('agents.debug.scope.noPersistentWrites', 'agents.debug.scope.persistentWrites')
      .replaceAll('buildDebugRemediationPlan', 'buildDebugLegacyPlan')
      .replaceAll('data-testid="agent-debug-remediation-plan"', 'data-testid="agent-debug-legacy-remediation-plan"')
      .replace('localAgentClient.getModelConfig()', 'localAgentClient.getModelConfig()\n        localAgentClient.saveModelConfig({ model: \'bad\' })')
      .replace('              <TabsTrigger value="manifest">{t(\'agents.debug.tabs.manifest\')}</TabsTrigger>', '              <TabsTrigger value="manifest">{t(\'agents.debug.tabs.manifest\')}</TabsTrigger>\n              <TabsTrigger value="skills">{t(\'agents.debug.tabs.skills\')}</TabsTrigger>'))
    await writeFile(settingsOverridePath, `${settingsSource}\nbuildDebugBundle\n`)

    await assert.rejects(
      runVerifier(undefined, {
        AGENT_RUN_DEBUG_AGENT_DEBUG_PAGE_PATH: debugOverridePath,
        AGENT_RUN_DEBUG_AGENT_SETTINGS_PAGE_PATH: settingsOverridePath,
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /Agent Debug page states it has no persistent writes must include agents\.debug\.scope\.noPersistentWrites/)
        assert.match(stderr, /Agent Debug page owns read-only remediation routing/)
        assert.match(stderr, /Agent Debug page exposes read-only remediation routing/)
        assert.match(stderr, /Agent Debug page must not save model config must not include localAgentClient\.saveModelConfig/)
        assert.match(stderr, /Agent Debug page must not reintroduce a skills management tab must not include <TabsTrigger value="skills"/)
        assert.match(stderr, /Agent Settings page must not build Agent Debug bundles must not include buildDebugBundle/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects Agent Settings and Debug boundary documentation drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-settings-debug-doc-drift-'))
  try {
    const readme = await readFile(docsReadmePath, 'utf8')
    const enDoc = await readFile(settingsDebugDocPath, 'utf8')
    const zhDoc = await readFile(settingsDebugDocZhPath, 'utf8')
    const schemaDoc = await readFile(agentSchemaReferenceDocPath, 'utf8')
    const schemaDocZh = await readFile(agentSchemaReferenceDocZhPath, 'utf8')
    const readmeOverridePath = path.join(root, 'README.md')
    const readmeZhOverridePath = path.join(root, 'README.zh-CN.md')
    const enOverridePath = path.join(root, 'agent-settings-debug.md')
    const zhOverridePath = path.join(root, 'agent-settings-debug.zh-CN.md')
    const schemaOverridePath = path.join(root, 'agent-schema-reference.md')
    const schemaZhOverridePath = path.join(root, 'agent-schema-reference.zh-CN.md')
    await writeFile(readmeOverridePath, readme
      .replace('./agent-settings-debug.md', './agent-debug.md')
      .replace('./agent-schema-reference.md', './agent-schema-old.md'))
    await writeFile(readmeZhOverridePath, (await readFile(docsReadmeZhPath, 'utf8'))
      .replace('./agent-settings-debug.zh-CN.md', './agent-debug.zh-CN.md')
      .replace('./agent-schema-reference.zh-CN.md', './agent-schema-old.zh-CN.md'))
    await writeFile(enOverridePath, enDoc
      .replace('## Machine-Readable Contracts', '## Notes')
      .replace('call-mode migration guidance', 'call-mode notes')
      .replace('per-provider model compatibility probes', 'generic connectivity test')
      .replace('version coverage, source, and trust', 'basic Skill list')
      .replace('Tool permission policy: allow, deny, approval mode, save-before diff preview', 'Tool permission policy: save blindly')
      .replace('search/filter for large catalogs', 'small catalogs only')
      .replace('saved filter presets', 'temporary filters only')
      .replace('bulk edits on filtered tools', 'manual edits only')
      .replace('Run presets: create, duplicate, delete custom presets', 'Run presets: edit built-in presets only')
      .replace('contracts/agent/agent-settings-snapshot-v1.schema.json', 'contracts/agent/old-settings.json')
      .replace('Publish the existing schema reference pages', 'Publish missing schema docs. Publish Debug Bundle and Settings Snapshot schema URLs, then include them in')
      .replace('named import presets', 'manual import scopes only')
      .replace('granular quick-fix audit categories', 'generic quick-fix audit')
      .replace('Read-only remediation plan', 'Configuration remediation controls')
      .replace('Debug must not save models, edit Skills, edit Profiles, edit tool policy, or', 'Debug may save models and edit Skills, Profiles, tool policy, or')
      .concat('\nPublish Debug Bundle and Settings Snapshot schema URLs, then include them in CI compatibility tests.\n'))
    await writeFile(zhOverridePath, zhDoc
      .replace('## 机器可读合同', '## 备注')
      .replace('调用模式迁移指南', '调用模式备注')
      .replace('按 Provider 区分的模型兼容性探测', '通用连通性测试')
      .replace('版本覆盖、来源和信任状态', '基础 Skill 列表')
      .replace('工具权限策略：允许、拒绝、审批策略、保存前 diff 预览', '工具权限策略：直接保存')
      .replace('大目录搜索/筛选', '小目录列表')
      .replace('已保存筛选预设', '临时筛选')
      .replace('筛选结果批量编辑', '只能逐项编辑')
      .replace('运行模板：新建、复制、删除自定义模板', '运行模板：只编辑内置模板')
      .replace('contracts/agent/agent-debug-bundle-v1.schema.json', 'contracts/agent/old-debug.json')
      .replace('发布现有 schema reference 页面', '发布缺失 schema 文档。发布 Debug Bundle 和 Settings Snapshot schema URL，并纳入 CI 兼容性测试')
      .replace('命名导入预设', '手动选择配置段')
      .replace('细分的 quick fix 审计分类', '通用 quick fix 审计')
      .replace('只读修复建议', '配置修复控件')
      .replace('调试页不应该保存模型、修改 Skills、修改 Profile、修改工具策略或写入运行模板', '调试页可以保存模型、修改 Skills、修改 Profile、修改工具策略或写入运行模板')
      .concat('\n发布 Debug Bundle 和 Settings Snapshot schema URL，并纳入 CI 兼容性测试。\n'))
    await writeFile(schemaOverridePath, schemaDoc
      .replace('Agent Debug Bundle v1', 'Agent Debug Bundle old')
      .replace('remediationPlan', 'legacyPlan')
      .replace('contracts/agent/agent-debug-bundle-v1.fixture.json', 'contracts/agent/old-debug.fixture.json')
      .replace('Bundles are always redacted', 'Bundles may include secrets')
      .replace('Import must run preflight validation', 'Import may write immediately'))
    await writeFile(schemaZhOverridePath, schemaDocZh
      .replace('Agent Settings Snapshot v1', 'Agent Settings Snapshot old')
      .replace('remediationPlan', 'legacyPlan')
      .replace('contracts/agent/agent-settings-snapshot-v1.fixture.json', 'contracts/agent/old-settings.fixture.json')
      .replace('复制或下载前必须脱敏', '可以包含密钥')
      .replace('导入必须先通过 preflight 校验', '导入可以直接写入'))

    await assert.rejects(
      runVerifier(undefined, {
        AGENT_RUN_DEBUG_DOCS_README_PATH: readmeOverridePath,
        AGENT_RUN_DEBUG_DOCS_README_ZH_PATH: readmeZhOverridePath,
        AGENT_RUN_DEBUG_SETTINGS_DEBUG_DOC_PATH: enOverridePath,
        AGENT_RUN_DEBUG_SETTINGS_DEBUG_DOC_ZH_PATH: zhOverridePath,
        AGENT_RUN_DEBUG_AGENT_SCHEMA_REFERENCE_DOC_PATH: schemaOverridePath,
        AGENT_RUN_DEBUG_AGENT_SCHEMA_REFERENCE_DOC_ZH_PATH: schemaZhOverridePath,
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /English docs README links Agent Settings\/Debug boundary doc/)
        assert.match(stderr, /Chinese docs README links Agent Settings\/Debug boundary doc/)
        assert.match(stderr, /English docs README links Agent schema reference/)
        assert.match(stderr, /Chinese docs README links Agent schema reference/)
        assert.match(stderr, /English boundary doc documents machine-readable contracts/)
        assert.match(stderr, /English boundary doc includes call mode migration guidance ownership/)
        assert.match(stderr, /English boundary doc includes provider compatibility probe ownership/)
        assert.match(stderr, /English boundary doc includes Skill governance ownership/)
        assert.match(stderr, /English boundary doc includes tool policy diff ownership/)
        assert.match(stderr, /English boundary doc includes tool policy large-catalog filter ownership/)
        assert.match(stderr, /English boundary doc includes tool policy filter preset ownership/)
        assert.match(stderr, /English boundary doc includes tool policy filtered bulk edit ownership/)
        assert.match(stderr, /English boundary doc includes run preset lifecycle ownership/)
        assert.match(stderr, /English boundary doc links Settings Snapshot schema/)
        assert.match(stderr, /English boundary doc includes Settings snapshot import preset ownership/)
        assert.match(stderr, /English boundary doc includes granular quick-fix audit ownership/)
        assert.match(stderr, /English boundary doc includes Debug remediation ownership/)
        assert.match(stderr, /English boundary doc prohibits Debug persistent writes/)
        assert.match(stderr, /English boundary doc must not claim schema CI coverage is still missing/)
        assert.match(stderr, /English boundary doc points hosting gap to schema reference pages/)
        assert.match(stderr, /English schema reference documents Debug Bundle/)
        assert.match(stderr, /English schema reference links Debug Bundle fixture/)
        assert.match(stderr, /English schema reference documents Debug Bundle redaction/)
        assert.match(stderr, /English schema reference documents Settings Snapshot preflight import/)
        assert.match(stderr, /English schema reference documents Debug Bundle remediation plan/)
        assert.match(stderr, /Chinese boundary doc documents machine-readable contracts/)
        assert.match(stderr, /Chinese boundary doc includes call mode migration guidance ownership/)
        assert.match(stderr, /Chinese boundary doc includes provider compatibility probe ownership/)
        assert.match(stderr, /Chinese boundary doc includes Skill governance ownership/)
        assert.match(stderr, /Chinese boundary doc includes tool policy diff ownership/)
        assert.match(stderr, /Chinese boundary doc includes tool policy large-catalog filter ownership/)
        assert.match(stderr, /Chinese boundary doc includes tool policy filter preset ownership/)
        assert.match(stderr, /Chinese boundary doc includes tool policy filtered bulk edit ownership/)
        assert.match(stderr, /Chinese boundary doc includes run preset lifecycle ownership/)
        assert.match(stderr, /Chinese boundary doc links Debug Bundle schema/)
        assert.match(stderr, /Chinese boundary doc includes Settings snapshot import preset ownership/)
        assert.match(stderr, /Chinese boundary doc includes granular quick-fix audit ownership/)
        assert.match(stderr, /Chinese boundary doc includes Debug remediation ownership/)
        assert.match(stderr, /Chinese boundary doc prohibits Debug persistent writes/)
        assert.match(stderr, /Chinese boundary doc must not claim schema CI coverage is still missing/)
        assert.match(stderr, /Chinese boundary doc points hosting gap to schema reference pages/)
        assert.match(stderr, /Chinese schema reference documents Settings Snapshot/)
        assert.match(stderr, /Chinese schema reference links Settings Snapshot fixture/)
        assert.match(stderr, /Chinese schema reference documents Debug Bundle redaction/)
        assert.match(stderr, /Chinese schema reference documents Settings Snapshot preflight import/)
        assert.match(stderr, /Chinese schema reference documents Debug Bundle remediation plan/)
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
    const schema = JSON.parse(await readFile(path.resolve('contracts/agent-run-debugging/agent-run-debugging-acceptance-summary-v1.schema.json'), 'utf8'))
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
    const schema = JSON.parse(await readFile(path.resolve('contracts/agent-run-debugging/agent-run-debugging-acceptance-summary-v1.schema.json'), 'utf8'))
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
    const schema = JSON.parse(await readFile(path.resolve('contracts/agent-run-debugging/agent-run-debugging-acceptance-summary-v1.schema.json'), 'utf8'))
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
    const schema = JSON.parse(await readFile(path.resolve('contracts/agent-run-debugging/agent-run-debugging-acceptance-summary-v1.schema.json'), 'utf8'))
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
    const schema = JSON.parse(await readFile(path.resolve('contracts/agent-run-debugging/agent-run-debugging-acceptance-summary-v1.schema.json'), 'utf8'))
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

test('AgentRun debugging static verifier rejects E2E runner acceptance summary validation drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-summary-validation-drift-'))
  try {
    const runnerSource = await readFile(e2eRunnerPath, 'utf8')
    const contractSource = await readFile(acceptanceSummaryContractPath, 'utf8')
    const runnerOverridePath = path.join(root, 'run-e2e.mjs')
    const contractOverridePath = path.join(root, 'acceptance-summary-contract.mjs')
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

test('AgentRun debugging static verifier rejects missing Makefile browser acceptance target', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-makefile-e2e-'))
  try {
    const source = await readFile(makefilePath, 'utf8')
    const overridePath = path.join(root, 'Makefile')
    await writeFile(overridePath, source
      .replace(' test-agent-run-debugging-e2e', '')
      .replace('\ntest-agent-run-debugging-e2e:\n\tnode tests/agent-run-debugging/run-e2e.mjs\n', '\n'))

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

test('AgentRun debugging static verifier rejects missing Makefile failed-summary contract target', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-makefile-summary-contract-'))
  try {
    const source = await readFile(makefilePath, 'utf8')
    const overridePath = path.join(root, 'Makefile')
    await writeFile(overridePath, source
      .replace(' verify-agent-run-debugging-summary-contract', '')
      .replace('\nverify-agent-run-debugging-summary-contract:\n\tnode tests/agent-run-debugging/verify-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY) --allow-failed\n', '\n'))

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
    source.scripts.test = source.scripts.test.replace('pnpm run test:contracts && ', '')
    const overridePath = path.join(root, 'package.json')
    await writeJSON(overridePath, source)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_PACKAGE_JSON_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /root test script runs contract gates/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing frontend AgentRun test coverage wiring', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-frontend-test-script-'))
  try {
    const source = JSON.parse(await readFile(frontendPackageJsonPath, 'utf8'))
    source.testSuites['agent-run-debugging'] = source.testSuites['agent-run-debugging'].filter((entry) => entry !== 'src/lib/agent*.test.ts')
    const overridePath = path.join(root, 'frontend-package.json')
    await writeJSON(overridePath, source)

    await assert.rejects(
      runVerifier(undefined, { AGENT_RUN_DEBUG_FRONTEND_PACKAGE_JSON_PATH: overridePath }),
      (error) => {
        assert.match(String(error.stderr), /frontend AgentRun debugging suite runs AgentRun activity, UI view, redaction, plan UI, and artifact tests/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing CI static gate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-ci-static-'))
  try {
    const source = await readFile(ciWorkflowPath, 'utf8')
    const overridePath = path.join(root, 'ci.yml')
    await writeFile(overridePath, source
      .replace('      - name: Contract gates\n        run: pnpm run test:contracts\n\n', ''))

    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_CI_WORKFLOW_PATH: overridePath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /CI runs contract gates/)
        assert.match(String(error.stderr), /CI labels the contract gates/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging static verifier rejects missing PR static gate note', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-verifier-pr-static-'))
  try {
    const source = await readFile(pullRequestTemplatePath, 'utf8')
    const overridePath = path.join(root, 'pull_request_template.md')
    await writeFile(overridePath, source
      .replace('`pnpm run test:contracts` passed', ''))

    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_PULL_REQUEST_TEMPLATE_PATH: overridePath,
        },
      }),
      (error) => {
        assert.match(String(error.stderr), /PR template asks for contract gate/)
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
