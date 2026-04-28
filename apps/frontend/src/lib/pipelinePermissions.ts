import type { Pipeline, PipelineEdge, PipelineNode, Project, ProjectMember } from '@/types'

export function projectRoleFor(
  project: Project | null | undefined,
  members: ProjectMember[],
  currentUserId: number | undefined,
) {
  if (!currentUserId) return 'viewer'
  if (project?.owner_id === currentUserId) return 'owner'
  return members.find((member) => member.user_id === currentUserId)?.role ?? 'viewer'
}

export function isProjectManager(role: string | undefined) {
  return role === 'owner' || role === 'director'
}

export function parentNodeFor(node: PipelineNode, pipeline?: Pipeline) {
  if (!pipeline) return undefined
  const parentEdge = pipeline.edges.find((edge) =>
    edge.to_node_id === node.ID && edgeRelationType(edge) === 'hierarchy')
  if (!parentEdge) return undefined
  return pipeline.nodes.find((item) => item.ID === parentEdge.from_node_id)
}

export function effectiveLeadId(
  node: PipelineNode,
  project: Project | null | undefined,
  pipeline?: Pipeline,
) {
  if (node.lead_id) return node.lead_id
  const visited = new Set<number>([node.ID])
  let parent = parentNodeFor(node, pipeline)
  while (parent && !visited.has(parent.ID)) {
    if (parent.lead_id) return parent.lead_id
    visited.add(parent.ID)
    parent = parentNodeFor(parent, pipeline)
  }
  return project?.owner_id
}

export function canManagePipelineNodeAssignment(options: {
  node: PipelineNode
  project?: Project | null
  members: ProjectMember[]
  currentUserId?: number
  pipeline?: Pipeline
}) {
  const role = projectRoleFor(options.project, options.members, options.currentUserId)
  if (isProjectManager(role)) return true
  return !!options.currentUserId && effectiveLeadId(options.node, options.project, options.pipeline) === options.currentUserId
}

export function canReviewPipelineNode(options: {
  node: PipelineNode
  project?: Project | null
  members: ProjectMember[]
  currentUserId?: number
  pipeline?: Pipeline
}) {
  const role = projectRoleFor(options.project, options.members, options.currentUserId)
  if (isProjectManager(role)) return true
  if (!options.currentUserId) return false
  if (options.node.assignee_id === options.currentUserId) return false
  return effectiveLeadId(options.node, options.project, options.pipeline) === options.currentUserId
}

export function canSubmitPipelineNode(options: {
  node: PipelineNode
  project?: Project | null
  members: ProjectMember[]
  currentUserId?: number
  pipeline?: Pipeline
}) {
  const role = projectRoleFor(options.project, options.members, options.currentUserId)
  if (isProjectManager(role)) return true
  if (!options.currentUserId) return false
  return options.node.assignee_id === options.currentUserId
    || effectiveLeadId(options.node, options.project, options.pipeline) === options.currentUserId
}

function edgeRelationType(edge: PipelineEdge) {
  return edge.relation_type || 'hierarchy'
}
