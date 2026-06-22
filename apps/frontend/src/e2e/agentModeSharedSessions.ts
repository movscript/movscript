import type { Page } from '@playwright/test'

import type { E2EBootstrapSeed } from '@/shared/infrastructure/e2eBootstrap'
import { agentConversationIdForRegistryInput } from '@movscript/core/agent'
import { installE2EBootstrapSeed } from './e2eBootstrapSeed'

export const AGENT_MODE_SHARED_PROJECT_ID = 123
export const AGENT_MODE_SHARED_USER_ID = 1001
export const AGENT_MODE_SHARED_PROJECT_THREAD_ID = 'thread-e2e-project-registry-only'
export const AGENT_MODE_SHARED_GLOBAL_THREAD_ID = 'thread-e2e-global-runtime-source'
export const AGENT_MODE_SHARED_PROJECT_TITLE = 'E2E 项目 registry 会话'
export const AGENT_MODE_SHARED_GLOBAL_TITLE = 'E2E 全局 runtime 会话'

const FIXED_NOW = '2026-05-12T12:00:00.000Z'
const PROJECT_PROVIDER_IDENTITY = {
  provider: 'mova',
  providerId: 'mova',
  providerInstanceId: 'mova-mova-app-server',
  providerProtocol: 'sdk',
}

export function buildAgentModeSharedSessionsBootstrap(apiBaseURL: string): E2EBootstrapSeed {
  const projectConversationId = agentConversationIdForRegistryInput({
    ...PROJECT_PROVIDER_IDENTITY,
    providerThreadId: AGENT_MODE_SHARED_PROJECT_THREAD_ID,
  })

  return {
    appSettings: {
      apiBaseURL,
      launchMode: 'cloud',
      onboardingCompleted: true,
    },
    user: {
      user: {
        ID: AGENT_MODE_SHARED_USER_ID,
        username: 'e2e-agent-mode',
        system_role: 'user',
      },
      token: 'e2e-token',
      expires_at: '2027-06-01T00:00:00.000Z',
      org_memberships: [{
        org_id: 1,
        org_name: 'E2E Org',
        org_slug: 'e2e-org',
        is_personal: true,
        taskGraph: 'team',
        status: 'active',
        role: 'owner',
      }],
    },
    project: {
      ID: AGENT_MODE_SHARED_PROJECT_ID,
      name: 'E2E Demo Project',
      description: 'Seeded project used to verify project and global agent session grouping.',
      owner_id: AGENT_MODE_SHARED_USER_ID,
      CreatedAt: '2026-05-09T11:00:00.000Z',
      UpdatedAt: FIXED_NOW,
    },
    agent: {
      userId: String(AGENT_MODE_SHARED_USER_ID),
      settings: {
        includeProjectContext: true,
        includeRecentResources: true,
      },
      conversations: [],
    },
    session: {
      conversationsById: {
        [projectConversationId]: {
          id: projectConversationId,
          userId: String(AGENT_MODE_SHARED_USER_ID),
          ...PROJECT_PROVIDER_IDENTITY,
          providerThreadId: AGENT_MODE_SHARED_PROJECT_THREAD_ID,
          providerThreadCwd: `/tmp/movscript-e2e/projects/shared-demo`,
          workspaceContext: { scope: 'project', projectId: AGENT_MODE_SHARED_PROJECT_ID },
          projectId: AGENT_MODE_SHARED_PROJECT_ID,
          title: AGENT_MODE_SHARED_PROJECT_TITLE,
          open: true,
          archived: false,
          createdAt: Date.parse('2026-05-12T11:30:00.000Z'),
          updatedAt: Date.parse(FIXED_NOW),
        },
      },
    },
  }
}

export async function installAgentModeSharedSessionsBootstrap(page: Page, apiBaseURL: string): Promise<void> {
  await installE2EBootstrapSeed(page, buildAgentModeSharedSessionsBootstrap(apiBaseURL))
}

export async function installAgentModeSharedSessionsRuntimeMock(page: Page): Promise<void> {
  await page.addInitScript((input) => {
    const createdAt = Date.parse('2026-05-12T11:45:00.000Z') / 1000
    const updatedAt = Date.parse('2026-05-12T12:10:00.000Z') / 1000
    const runtimeThread = {
      provider: 'codex',
      id: input.globalThreadId,
      providerThreadId: input.globalThreadId,
      preview: input.globalTitle,
      name: input.globalTitle,
      createdAt,
      updatedAt,
      status: 'idle',
      cwd: null,
      turns: [{
        id: `${input.globalThreadId}-turn`,
        itemsView: 'full',
        status: 'completed',
        error: null,
        startedAt: createdAt,
        completedAt: updatedAt,
        durationMs: 1000,
        items: [
          {
            type: 'userMessage',
            id: `${input.globalThreadId}-user`,
            clientId: null,
            content: [{ type: 'text', text: '全局会话', textElements: [] }],
          },
          {
            type: 'agentMessage',
            id: `${input.globalThreadId}-assistant`,
            text: '全局会话响应',
            phase: null,
            memoryCitation: null,
          },
        ],
      }],
    }
    const requests: Array<{ method: string; providerId?: string; threadId?: string }> = []
    const globalWindow = window as Window & {
      api?: Record<string, unknown>
      __movscriptE2ERuntimeRequests?: typeof requests
    }
    globalWindow.__movscriptE2ERuntimeRequests = requests
    globalWindow.api = {
      ...(globalWindow.api ?? {}),
      sdkRuntimeRequest: async (request: {
        method?: string
        params?: {
          provider?: { id?: string; kind?: string }
          threadId?: string
        }
      }) => {
        const method = request.method ?? ''
        const providerId = request.params?.provider?.id
        const threadId = request.params?.threadId
        requests.push({ method, providerId, threadId })
        if (method === 'thread/list') {
          return {
            threads: providerId === 'codex' ? [runtimeThread] : [],
            nextCursor: null,
          }
        }
        if (method === 'thread/read') {
          return runtimeThread
        }
        if (method === 'runtime/probe') {
          return { ok: true, runtime: request.params?.provider ?? {}, sdk: { packageName: 'e2e' }, contract: { requiredExports: [], requiredRpcMethods: [] }, checks: { packageLoad: { ok: true }, requiredExports: { ok: true, required: [], missing: [] }, requiredRpcMethods: { ok: true, required: [], missing: [] } } }
        }
        if (method === 'capabilities/get') {
          return { ok: true, runtime: {}, provider: request.params?.provider ?? {}, capabilities: { serverRequests: false, skillsList: false, defaultSkillBootstrap: false, mcpBridge: false, permissionProfiles: false }, support: {}, warnings: [], unsupported: {} }
        }
        return {}
      },
      sdkRuntimeNotify: async () => undefined,
      onSdkRuntimeNotification: () => () => undefined,
      onSdkRuntimeServerRequest: () => () => undefined,
    }
  }, {
    globalThreadId: AGENT_MODE_SHARED_GLOBAL_THREAD_ID,
    globalTitle: AGENT_MODE_SHARED_GLOBAL_TITLE,
  })
}
