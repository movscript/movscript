import type { AgentInputEnvelope, CompiledPromptPreview } from './types.js'

export function compilePromptPreview(envelope: AgentInputEnvelope): CompiledPromptPreview {
  const debugParts: CompiledPromptPreview['debugParts'] = []

  debugParts.push({
    id: 'policy.base',
    kind: 'policy',
    title: 'Runtime policy',
    content: [
      '不得绕过 tool policy、manifest permissions 或用户审批。',
      '写入正式项目数据前必须先使用 draft/apply 审批链路。',
      `maxToolCalls=${envelope.policy.maxToolCalls}; maxIterations=${envelope.policy.maxIterations}`,
    ].join('\n'),
  })

  debugParts.push({
    id: 'workflow.production-chain',
    kind: 'policy',
    title: 'MovScript production workflow',
    content: [
      '项目结构按 Project -> Script/Setting -> Segment/SceneMoment -> StoryboardLine -> ContentUnit/Keyframe -> AssetSlot -> Preview/Delivery 理解；Pipeline Node 表示流程状态、负责人和交付节点。',
      '项目进度/缺口/下一步请求：先读取项目结构，再按需要读取具体语义实体；按 剧本 -> 片段/情节 -> 分镜行 -> 内容单元/关键帧 -> 素材位 -> 预演/交付 的顺序盘点。',
      '视觉计划审查：定位 segment/scene_moment/storyboard_line/content_unit/asset_slot，检查目标、场景信息、角色、视觉节拍、素材位、prompt、状态和审批。',
      '输出复杂项目请求时使用：已确认事实 -> 缺口/风险 -> 下一步 -> 是否需要草稿/确认。',
      '不要编造不存在的实体、状态或 ID；结构信息不足时说明缺口并继续用工具查询。',
    ].join('\n'),
  })

  if (envelope.manifest.soul) {
    debugParts.push({
      id: 'agent.soul',
      kind: 'soul',
      title: 'Agent soul',
      content: envelope.manifest.soul,
    })
  }

  for (const skill of envelope.skills) {
    debugParts.push({
      id: `skill.${skill.id}`,
      kind: 'skill',
      title: skill.name,
      content: skill.compiledInstruction || skill.description,
    })
  }

  debugParts.push({
    id: 'context.summary',
    kind: 'context',
    title: 'Context summary',
    content: [
      `route: ${envelope.context.route.pathname}`,
      envelope.context.project ? `project: ${envelope.context.project.id}${envelope.context.project.name ? ` ${envelope.context.project.name}` : ''}` : 'project: none',
      envelope.context.selection ? `selection: ${envelope.context.selection.entityType}#${envelope.context.selection.entityId}` : 'selection: none',
      `memories: ${envelope.memories.length}`,
      `attachments: ${envelope.context.attachments.length}`,
    ].join('\n'),
  })

  debugParts.push({
    id: 'tools.available',
    kind: 'tool',
    title: 'Available tools',
    content: envelope.tools.available.map((tool) => `- ${tool.name} (${tool.risk ?? 'unknown'})`).join('\n') || '(none)',
  })

  const system = debugParts
    .filter((part) => part.kind !== 'context')
    .map((part) => `[${part.title}]\n${part.content}`)
    .join('\n\n')

  return {
    system,
    messages: [
      ...envelope.history.map((message) => ({ role: message.role, content: message.content })),
      { role: envelope.message.role, content: envelope.message.content },
    ],
    debugParts,
  }
}
