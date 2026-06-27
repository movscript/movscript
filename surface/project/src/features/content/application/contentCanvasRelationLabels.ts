import type { ContentCanvasEdge, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'

export interface ContentCanvasClassifiedRelation {
  relatedNodeId: string
  direction: 'upstream' | 'downstream'
  label: string
}

export function classifyContentCanvasRelation(
  edge: ContentCanvasEdge,
  selectedNodeId: string,
): ContentCanvasClassifiedRelation {
  if (edge.kind === 'hierarchy') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '结构上级' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '结构子级' }
  }
  if (edge.kind === 'sequence') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '上一项' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '下一项' }
  }
  if (edge.relation === 'content_unit_candidate') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '候选来源' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '生成候选' }
  }
  if (edge.relation === 'asset_downstream') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '素材影响' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '下游影响' }
  }
  if (edge.relation === 'selection_candidate') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '当前采纳' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '采纳候选' }
  }
  if (edge.relation === 'candidate_resource') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '资源来源' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '产出资源' }
  }
  if (edge.relation === 'content_unit_scene') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '情节输入' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '情节创作片段' }
  }
  if (edge.relation === 'content_unit_asset') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '素材输入' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '依赖此素材' }
  }
  if (edge.relation === 'content_unit_resource') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '资源输入' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '依赖此资源' }
  }
  if (edge.relation === 'content_unit_keyframe') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '关键帧输入' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '依赖此关键帧' }
  }
  if (edge.relation === 'content_unit_storyboard') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '分镜输入' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '依赖此分镜' }
  }
  if (edge.relation === 'content_unit_audio_cue') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '声音输入' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '依赖此声音' }
  }
  if (edge.relation === 'audio_cue_storyboard') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '声音约束' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '作用分镜' }
  }
  if (edge.relation === 'audio_cue_asset') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '声音素材' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '声音使用' }
  }
  if (edge.relation === 'setting_state_reference') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '设定状态输入' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '依赖此状态' }
  }
  if (edge.relation === 'expression_unit_storyboard') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '表达约束' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '作用分镜' }
  }
  if (edge.relation === 'expression_unit_content_unit') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '表达输入' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '作用创作片段' }
  }
  if (edge.relation === 'work_item_target') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '待处理项' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '处理目标' }
  }
  if (edge.relation === 'actor_work_item') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '推荐处理者' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '推荐工作项' }
  }
  return edge.target === selectedNodeId
    ? { relatedNodeId: edge.source, direction: 'upstream', label: edge.label ?? '上游引用' }
    : { relatedNodeId: edge.target, direction: 'downstream', label: edge.label ?? '下游引用' }
}

export function contentCanvasEdgeInsightRelationLabel(edge: ContentCanvasEdge): string {
  if (edge.kind === 'hierarchy') return edge.label ?? '结构归属'
  if (edge.kind === 'sequence') return edge.label ?? '顺序关系'
  if (edge.relation === 'content_unit_candidate') return '生成候选'
  if (edge.relation === 'asset_downstream') return '下游影响'
  if (edge.relation === 'selection_candidate') return '当前采纳'
  if (edge.relation === 'candidate_resource') return '产出资源'
  if (edge.relation === 'content_unit_scene') return '情节创作片段'
  if (edge.relation === 'content_unit_asset') return '素材输入'
  if (edge.relation === 'content_unit_resource') return '资源输入'
  if (edge.relation === 'content_unit_keyframe') return '关键帧输入'
  if (edge.relation === 'content_unit_storyboard') return '分镜输入'
  if (edge.relation === 'content_unit_audio_cue') return '声音输入'
  if (edge.relation === 'audio_cue_storyboard') return '声音分镜'
  if (edge.relation === 'audio_cue_asset') return '声音素材'
  if (edge.relation === 'setting_state_reference') return '设定状态'
  if (edge.relation === 'expression_unit_storyboard') return '表达分镜'
  if (edge.relation === 'expression_unit_content_unit') return '表达创作片段'
  if (edge.relation === 'work_item_target') return '处理目标'
  if (edge.relation === 'actor_work_item') return '推荐处理'
  return edge.label ?? edge.relation ?? edge.kind
}

export function contentCanvasKindText(kind: ContentCanvasNodeKind): string {
  if (kind === 'project') return '项目'
  if (kind === 'production') return '制作'
  if (kind === 'segment') return '段落'
  if (kind === 'scene_moment') return '情节'
  if (kind === 'storyboard') return '分镜图'
  if (kind === 'expression_unit') return '表达单元'
  if (kind === 'content_unit') return '创作片段'
  if (kind === 'candidate') return '候选'
  if (kind === 'selection') return '选择'
  if (kind === 'resource') return '资源'
  if (kind === 'keyframe') return '关键帧'
  if (kind === 'asset') return '素材'
  if (kind === 'state') return '状态'
  if (kind === 'audio_cue') return '声音'
  if (kind === 'work_item') return '工作项'
  if (kind === 'actor') return '处理者'
  if (kind === 'group') return '分组'
  return '设定'
}

export function contentCanvasStatusText(status: ContentCanvasNode['status']): string {
  if (status === 'ready') return '稳定'
  if (status === 'active') return '推进中'
  if (status === 'missing') return '待补齐'
  return '记录'
}
