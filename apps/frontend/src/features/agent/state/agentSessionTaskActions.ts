import {
  agentActivityStatusFromPageTask,
  agentActivityStatusFromStandaloneStatus,
  agentActivityTopicForStatus,
  agentTaskActivityPayload,
  publishAgentRunInteractionRequests,
  publishAgentRunStepActivity,
  publishAgentTaskActivity,
} from '@/features/agent/state/agentSessionActivityPublisher'
import {
  attachAgentPageTaskConversation,
  claimNextQueuedAgentPageTask,
  enqueueAgentPageTask,
  setAgentPageTaskRunning,
  settleAgentStandaloneTask,
  startAgentStandaloneTask,
  updateAgentPageTaskFromProviderSession,
  updateAgentStandaloneTask,
} from '@/features/agent/state/agentSessionTaskState'
import type { AgentSessionStore } from '@/features/agent/state/agentSessionStoreTypes'

type AgentSessionStoreSet = (
  partial: Partial<AgentSessionStore> | AgentSessionStore | ((state: AgentSessionStore) => Partial<AgentSessionStore> | AgentSessionStore),
) => void

export function createAgentSessionTaskActions(set: AgentSessionStoreSet, get: () => AgentSessionStore): Pick<
AgentSessionStore,
| 'enqueuePageTask'
| 'claimNextQueuedPageTask'
| 'attachPageTaskConversation'
| 'setPageTaskRunning'
| 'updatePageTaskFromProviderSession'
| 'startStandaloneTask'
| 'updateStandaloneTask'
| 'settleStandaloneTask'
> {
  return {
    enqueuePageTask: (payload) => {
      const now = Date.now()
      let normalized: ReturnType<AgentSessionStore['enqueuePageTask']>
      set((state) => {
        const result = enqueueAgentPageTask({
          now,
          pageTasks: state.pageTasks,
          payload,
        })
        normalized = result.normalized
        return {
          pageTasks: result.pageTasks,
        }
      })
      publishAgentTaskActivity('agent.activity.started', {
        activityId: normalized!.requestId,
        kind: 'task',
        title: normalized!.title || normalized!.displayMessage || normalized!.taskType,
        summary: normalized!.displayMessage || normalized!.message,
        status: 'pending',
        origin: 'user',
        projectId: normalized!.projectId,
        rawRef: { type: 'agent_page_task', id: normalized!.requestId },
      }, `page-task:${normalized!.requestId}:queued`)
      return normalized!
    },

    claimNextQueuedPageTask: () => {
      const now = Date.now()
      const result = claimNextQueuedAgentPageTask({
        now,
        pageTasks: get().pageTasks,
      })
      if (!result) return null
      set({ pageTasks: result.pageTasks })
      publishAgentTaskActivity('agent.activity.updated', {
        activityId: result.payload.requestId,
        kind: 'task',
        title: result.payload.title || result.payload.displayMessage || result.payload.taskType,
        summary: result.payload.displayMessage || result.payload.message,
        status: 'running',
        origin: 'system',
        projectId: result.payload.projectId,
        rawRef: { type: 'agent_page_task', id: result.payload.requestId },
      }, `page-task:${result.payload.requestId}:claimed`)
      return result.payload
    },

    attachPageTaskConversation: (requestId, conversationId) => {
      set((state) => {
        const pageTasks = attachAgentPageTaskConversation({
          conversationId,
          now: Date.now(),
          pageTasks: state.pageTasks,
          requestId,
        })
        if (!pageTasks) return {}
        return {
          pageTasks,
        }
      })
      const task = get().pageTasks[requestId]
      if (task) {
        publishAgentTaskActivity('agent.activity.updated', agentTaskActivityPayload(task, 'running'), `page-task:${requestId}:conversation:${conversationId}`)
      }
    },

    setPageTaskRunning: (requestId, patch) => {
      if (!requestId) return
      set((state) => {
        const pageTasks = setAgentPageTaskRunning({
          now: Date.now(),
          pageTasks: state.pageTasks,
          patch,
          requestId,
        })
        if (!pageTasks) return {}
        return {
          pageTasks,
        }
      })
      const task = get().pageTasks[requestId]
      if (task) {
        publishAgentTaskActivity('agent.activity.updated', agentTaskActivityPayload(task, 'running'), `page-task:${requestId}:running:${task.runId ?? task.threadId ?? ''}`)
        publishAgentRunStepActivity(task.conversationId, task.payload.projectId, task.run)
        publishAgentRunInteractionRequests(task.conversationId, task.payload.projectId, task.run)
      }
    },

    updatePageTaskFromProviderSession: (payload) => {
      if (!payload.requestId) return
      set((state) => {
        const pageTasks = updateAgentPageTaskFromProviderSession({
          now: Date.now(),
          pageTasks: state.pageTasks,
          payload,
        })
        if (!pageTasks) return {}
        return {
          pageTasks,
        }
      })
      const task = get().pageTasks[payload.requestId]
      if (task) {
        const status = agentActivityStatusFromPageTask(task.status)
        publishAgentTaskActivity(agentActivityTopicForStatus(status), agentTaskActivityPayload(task, status), `page-task:${task.requestId}:${status}:${task.runId ?? task.threadId ?? ''}`)
        publishAgentRunStepActivity(task.conversationId, task.payload.projectId, task.run)
        publishAgentRunInteractionRequests(task.conversationId, task.payload.projectId, task.run)
        if (task.artifacts?.length) {
          publishAgentTaskActivity('agent.output.created', {
            ...agentTaskActivityPayload(task, 'completed'),
            kind: 'output',
            title: task.payload.title || 'Agent output created',
            origin: 'agent',
            targetIds: task.artifacts.map((artifact) => artifact.workspaceId).filter(Boolean),
            rawRef: { type: 'agent_page_task_artifacts', id: task.requestId },
          }, `page-task:${task.requestId}:output:${task.artifacts.map((artifact) => artifact.workspaceId).join(',')}`)
        }
      }
    },

    startStandaloneTask: ({ taskId, taskType, title, prompt }) => {
      set((state) => ({
        standaloneTasks: startAgentStandaloneTask({
          now: Date.now(),
          standaloneTasks: state.standaloneTasks,
          taskId,
          taskType,
          title,
          prompt,
        }),
      }))
      publishAgentTaskActivity('agent.activity.started', {
        activityId: taskId,
        kind: 'task',
        title: title || taskType,
        summary: prompt,
        status: 'running',
        origin: 'user',
        rawRef: { type: 'agent_standalone_task', id: taskId },
      }, `standalone:${taskId}:started`)
    },

    updateStandaloneTask: (taskId, patch) => set((state) => {
      const standaloneTasks = updateAgentStandaloneTask({
        now: Date.now(),
        patch,
        standaloneTasks: state.standaloneTasks,
        taskId,
      })
      if (!standaloneTasks) return {}
      return {
        standaloneTasks,
      }
    }),

    settleStandaloneTask: (payload) => {
      set((state) => {
        const standaloneTasks = settleAgentStandaloneTask({
          now: Date.now(),
          payload,
          standaloneTasks: state.standaloneTasks,
        })
        if (!standaloneTasks) return {}
        return {
          standaloneTasks,
        }
      })
      const task = get().standaloneTasks[payload.taskId]
      if (task) {
        const status = agentActivityStatusFromStandaloneStatus(task.status)
        publishAgentTaskActivity(agentActivityTopicForStatus(status), {
          activityId: task.taskId,
          kind: 'task',
          title: task.title || task.taskType,
          summary: task.error || task.result,
          status,
          origin: 'system',
          threadId: task.threadId,
          runId: task.runId,
          rawRef: { type: 'agent_standalone_task', id: task.taskId },
        }, `standalone:${task.taskId}:${status}`)
        publishAgentRunStepActivity(undefined, undefined, task.run)
        publishAgentRunInteractionRequests(undefined, undefined, task.run)
      }
    },
  }
}
