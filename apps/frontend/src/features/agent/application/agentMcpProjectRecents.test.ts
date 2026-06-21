import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentChatThreadItem } from '@movscript/core/agent/chat'

import { localProjectTouchFromMcpToolCall, rememberMcpProjectToolRecent } from './agentMcpProjectRecents'
import { useLocalProjectRecentsStore } from '@/shared/infrastructure/session/localProjectRecentsStore'

test('extracts recent project touch from MovScript MCP project open result', () => {
  const touch = localProjectTouchFromMcpToolCall({
    type: 'mcpToolCall',
    id: 'mcp_1',
    server: 'movscript',
    tool: 'movscript_project_open',
    status: 'completed',
    result: {
      data: {
        projectDir: '/tmp/movscript-project',
        projectUid: 'project_uid_1',
        project: {
          name: 'Recent MCP Project',
          description: 'Opened from MCP',
        },
      },
    },
  } satisfies Extract<AgentChatThreadItem, { type: 'mcpToolCall' }>)

  assert.deepEqual(touch, {
    projectDir: '/tmp/movscript-project',
    name: 'Recent MCP Project',
    description: 'Opened from MCP',
    projectUid: 'project_uid_1',
    updatedAt: undefined,
  })
})

test('ignores non-project MCP tool results for recent projects', () => {
  const touch = localProjectTouchFromMcpToolCall({
    type: 'mcpToolCall',
    id: 'mcp_2',
    server: 'movscript',
    tool: 'domain_query_settings',
    status: 'completed',
    result: { data: { projectDir: '/tmp/movscript-project' } },
  })

  assert.equal(touch, null)
})

test('remembers each MCP project tool result once', () => {
  useLocalProjectRecentsStore.setState({ projects: [], dismissedKeys: [] })
  const item = {
    type: 'mcpToolCall',
    id: 'mcp_3',
    server: 'movscript',
    tool: 'movscript_project_fetch',
    status: 'completed',
    result: {
      data: {
        projectDir: '/tmp/movscript-project-once',
        project: { name: 'Once' },
      },
    },
  } satisfies Extract<AgentChatThreadItem, { type: 'mcpToolCall' }>

  assert.equal(rememberMcpProjectToolRecent(item), true)
  assert.equal(rememberMcpProjectToolRecent(item), false)
  assert.equal(useLocalProjectRecentsStore.getState().projects.length, 1)
})
