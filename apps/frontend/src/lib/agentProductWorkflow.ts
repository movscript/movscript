import type { AgentRun } from '@/lib/localAgentClient'

export type AgentProductWorkflowStage =
  | 'empty'
  | 'drafting'
  | 'preparing'
  | 'executing'
  | 'waiting_for_user'
  | 'result_ready'
  | 'failed'
  | 'cancelled'

export interface AgentProductWorkflowInput {
  messageCount: number
  draftInput?: string
  loading?: boolean
  building?: boolean
  uploading?: boolean
  activeRun?: AgentRun | null
  runtimeOnline?: boolean
  modelConfigured?: boolean
  currentProjectName?: string | null
  contextLabels?: string[]
  hasCustomManifest?: boolean
}

export interface AgentProductWorkflowSummary {
  stage: AgentProductWorkflowStage
  title: string
  description: string
  contextItems: string[]
  primaryAction: string
  detailLevel: 'product' | 'technical'
  canShowResultActions: boolean
}

export function buildAgentProductWorkflow(input: AgentProductWorkflowInput): AgentProductWorkflowSummary {
  const run = input.activeRun ?? null
  const contextItems = buildContextItems(input)
  const base = {
    contextItems,
    detailLevel: 'product' as const,
    canShowResultActions: false,
  }

  if (run?.status === 'failed') {
    return {
      ...base,
      stage: 'failed',
      title: '任务失败',
      description: '这次 AI 任务没有完成。可以重试、缩小范围，或打开运行详情查看失败点。',
      primaryAction: '查看运行详情或重试',
    }
  }

  if (run?.status === 'cancelled') {
    return {
      ...base,
      stage: 'cancelled',
      title: '任务已停止',
      description: '当前任务已经取消，不会继续写入新的结果。',
      primaryAction: '重新发起任务',
    }
  }

  if (run?.status === 'requires_action') {
    const pendingInputs = run.pendingInputRequests?.filter((item) => item.status === 'pending').length ?? 0
    const pendingApprovals = run.pendingApprovals?.filter((item) => item.status === 'pending').length ?? 0
    return {
      ...base,
      stage: 'waiting_for_user',
      title: pendingInputs > 0 ? '需要补充信息' : '需要确认操作',
      description: pendingInputs > 0
        ? 'AI 需要你补充一个关键信息后才能继续。'
        : `AI 准备执行 ${pendingApprovals || 1} 个需要确认的操作。`,
      primaryAction: pendingInputs > 0 ? '回答请求' : '审核并确认',
    }
  }

  if (run?.status === 'completed' || run?.status === 'completed_with_warnings') {
    return {
      ...base,
      stage: 'result_ready',
      title: run.status === 'completed_with_warnings' ? '结果已生成，含提醒' : '结果已生成',
      description: '可以查看结果卡片、应用草稿，或继续要求 AI 修改。',
      primaryAction: '查看结果',
      canShowResultActions: true,
    }
  }

  if (input.loading || run?.status === 'queued' || run?.status === 'in_progress') {
    return {
      ...base,
      stage: input.building || input.uploading ? 'preparing' : 'executing',
      title: input.building || input.uploading ? '正在准备请求' : '正在执行任务',
      description: input.building || input.uploading
        ? '正在整理输入、附件、模型和上下文。'
        : 'AI 正在读取上下文、调用工具或生成结果。',
      primaryAction: '等待完成',
    }
  }

  if (input.building || input.uploading) {
    return {
      ...base,
      stage: 'preparing',
      title: '正在准备请求',
      description: '正在整理输入、附件、模型和上下文。',
      primaryAction: '等待完成',
    }
  }

  if (input.draftInput?.trim()) {
    return {
      ...base,
      stage: 'drafting',
      title: '准备发送',
      description: '输入会连同当前上下文一起发送给 AI。',
      primaryAction: '发送',
    }
  }

  return {
    ...base,
    stage: 'empty',
    title: input.messageCount > 0 ? '可以继续追问' : '选择一个任务开始',
    description: input.messageCount > 0
      ? '继续补充要求，AI 会沿用当前会话上下文。'
      : '可以让 AI 做项目规划、内容提案、素材审查或生成工作流。',
    primaryAction: input.messageCount > 0 ? '继续输入' : '选择任务',
  }
}

function buildContextItems(input: AgentProductWorkflowInput): string[] {
  const items: string[] = []
  if (input.currentProjectName) items.push(`项目：${input.currentProjectName}`)
  if (input.runtimeOnline === false) items.push('本地 Runtime：离线')
  else if (input.runtimeOnline === true) items.push('本地 Runtime：在线')
  if (input.modelConfigured === false) items.push('模型：未配置')
  else if (input.modelConfigured === true) items.push('模型：已配置')
  if (input.hasCustomManifest) items.push('能力：自定义')
  for (const label of input.contextLabels ?? []) {
    if (!label || items.includes(label)) continue
    items.push(label)
  }
  return items.slice(0, 5)
}
