import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  agentConversationRegistryRecordMatchesInput,
  agentThreadRegistryHydrationSignature,
  agentThreadSummaryHasContent,
  agentThreadSummaryRegistryOpenState,
  shouldHydrateAgentThreadSummary,
} from '@/features/agent/application/useAgentThreadRegistryHydration'
import type { AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentThreadSummary } from '@movscript/core/agent/protocol'

test('agent thread registry hydration ignores new empty threads', () => {
  const thread = threadSummary({ messageCount: 0, title: undefined })

  assert.equal(agentThreadSummaryHasContent(thread), false)
  assert.equal(shouldHydrateAgentThreadSummary(thread), false)
})

test('agent thread registry hydration opens new content threads', () => {
  const thread = threadSummary({ messageCount: 2 })

  assert.equal(agentThreadSummaryHasContent(thread), true)
  assert.equal(shouldHydrateAgentThreadSummary(thread), true)
  assert.equal(agentThreadSummaryRegistryOpenState(thread), true)
})

test('agent thread registry hydration preserves explicit closed records as history', () => {
  const existing = conversationRecord({ open: false })
  const thread = threadSummary({ messageCount: 3 })

  assert.equal(shouldHydrateAgentThreadSummary(thread, existing), true)
  assert.equal(agentThreadSummaryRegistryOpenState(thread, existing), false)
})

test('agent thread registry hydration writes source threads into the shared registry', () => {
  const source = readFileSync(resolve('src/features/agent/application/useAgentThreadRegistryHydration.ts'), 'utf8')
  const hydrationEffectSource = source.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[hydrationSignature, userId\]\)/)?.[0] ?? ''
  const hydrationHelperStart = source.indexOf('export function hydrateAgentThreadRegistryFromSummaries')
  const hydrationHelperEnd = source.indexOf('export function agentConversationRegistryInputFromThreadSummary', hydrationHelperStart)
  const hydrationHelperSource = source.slice(hydrationHelperStart, hydrationHelperEnd)

  assert.match(source, /const hydrationSignature = agentThreadRegistryHydrationSignature/)
  assert.match(hydrationEffectSource, /hydrateAgentThreadRegistryFromSummaries\(\{ providerIdentity, sourceThreads, userId \}\)/)
  assert.match(hydrationHelperSource, /let currentRecords = readAgentConversationRecordsById\(\)/)
  assert.match(hydrationHelperSource, /agentConversationRegistryRecordForThread\(currentRecords/)
  assert.match(hydrationHelperSource, /shouldHydrateAgentThreadSummary\(thread, existing\)/)
  assert.match(hydrationHelperSource, /const registryInput = agentConversationRegistryInputFromThreadSummary\(\{/)
  assert.match(hydrationHelperSource, /agentConversationRegistryRecordMatchesInput\(existing, registryInput\)/)
  assert.match(hydrationHelperSource, /registerAgentConversation\(registryInput\)/)
  assert.match(source, /export function useAgentThreadRegistryHydrations/)
  assert.match(source, /useQueries\(\{/)
  assert.doesNotMatch(source, /useAgentSessionStore/)
})

test('agent thread registry hydration treats omitted patch fields as unchanged', () => {
  const record = conversationRecord({
    id: 'provider:sdk:codex:codex:codex-sdk:thread:thread_1',
    provider: 'codex',
    providerId: 'codex',
    providerInstanceId: 'codex-sdk',
    providerProtocol: 'sdk',
    providerThreadCwd: '/project',
    title: 'Existing title',
    status: 'completed',
    createdAt: 1000,
    updatedAt: 2000,
  })

  assert.equal(agentConversationRegistryRecordMatchesInput(record, {
    userId: 'user_1',
    provider: 'codex',
    providerId: 'codex',
    providerInstanceId: 'codex-sdk',
    providerProtocol: 'sdk',
    providerThreadId: 'thread_1',
    open: true,
    archived: false,
  }), true)
})

test('agent thread registry hydration signature tracks provider and thread content', () => {
  const base = {
    providerIdentity: {
      provider: 'codex',
      providerId: 'codex',
      providerInstanceId: 'codex-sdk',
      providerProtocol: 'sdk',
    },
    sourceThreads: [threadSummary({ title: 'First' })],
  }

  assert.equal(agentThreadRegistryHydrationSignature([base]), agentThreadRegistryHydrationSignature([{
    ...base,
    sourceThreads: [threadSummary({ title: 'First' })],
  }]))
  assert.notEqual(agentThreadRegistryHydrationSignature([base]), agentThreadRegistryHydrationSignature([{
    ...base,
    sourceThreads: [threadSummary({ title: 'Changed' })],
  }]))
})

function threadSummary(input: Partial<AgentThreadSummary> = {}): AgentThreadSummary {
  return {
    id: input.id ?? 'thread_1',
    archived: input.archived ?? false,
    createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-01-01T00:00:00.000Z',
    messageCount: input.messageCount ?? 0,
    ...(input.title !== undefined ? { title: input.title } : {}),
  }
}

function conversationRecord(input: Partial<AgentConversationRegistryRecord> = {}): AgentConversationRegistryRecord {
  return {
    id: input.id ?? 'thread_1',
    userId: input.userId ?? 'user_1',
    providerThreadId: input.providerThreadId ?? 'thread_1',
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.providerInstanceId ? { providerInstanceId: input.providerInstanceId } : {}),
    ...(input.providerProtocol ? { providerProtocol: input.providerProtocol } : {}),
    ...(input.providerSessionId ? { providerSessionId: input.providerSessionId } : {}),
    ...(input.providerThreadCwd ? { providerThreadCwd: input.providerThreadCwd } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.status ? { status: input.status } : {}),
    open: input.open ?? true,
    archived: input.archived ?? false,
    createdAt: input.createdAt ?? 1000,
    updatedAt: input.updatedAt ?? 2000,
  }
}
