import type { HierarchyNode, HierarchyNodeType } from './sourceWorkspaceTypes'

export interface AddTarget {
  parentId: string
  parentTitle: string
  type: HierarchyNodeType
}

export function getExpandableNodeIds(nodes: HierarchyNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.children?.length ? [node.id] : []),
    ...getExpandableNodeIds(node.children ?? []),
  ])
}

export function appendChildNode(nodes: HierarchyNode[], parentId: string, childNode: HierarchyNode): HierarchyNode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      return {
        ...node,
        children: [...(node.children ?? []), childNode],
      }
    }
    return {
      ...node,
      children: node.children ? appendChildNode(node.children, parentId, childNode) : undefined,
    }
  })
}

export function addTargetForSelectedNode(selectedNode: HierarchyNode): AddTarget | null {
  const childType = addableChildTypeForNode(selectedNode)
  if (!childType) return null
  return {
    parentId: selectedNode.id,
    parentTitle: selectedNode.title,
    type: childType,
  }
}

export function buildChildNodePath(parentNode: HierarchyNode, pathSlug: string, childType: HierarchyNodeType) {
  if (parentNode.id === 'settings_root') return `settings/${pathSlug}/setting.json`
  if (parentNode.id === 'productions_group') return `productions/${pathSlug}/production.json`
  const parentPath = parentNode.path.replace(/\/[^/]*\.json$/, '')
  const childFolder = childFolderName(childType)
  const childFile = childFileName(childType)
  if (parentNode.type === 'group' && parentPath.split('/').at(-1) === childFolder) {
    return `${parentPath}/${pathSlug}/${childFile}.json`
  }
  return `${parentPath}/${childFolder}/${pathSlug}/${childFile}.json`
}

export function buildChildNodeId(parentNode: HierarchyNode, pathSlug: string, childType: HierarchyNodeType): string {
  if (childType === 'setting') return `setting/${pathSlug}`
  if (childType === 'state') return `state/${pathSegmentAfter(parentNode.path, 'settings') ?? ''}/${pathSlug}`
  if (childType === 'asset') return `asset/${pathSlug}`
  if (childType === 'storyboard') return `storyboard/${pathSlug}`
  return pathSlug
}

export function slugifyNodeTitle(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || 'untitled_node'
}

export function findHierarchyNode(nodes: HierarchyNode[], id: string): HierarchyNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = node.children ? findHierarchyNode(node.children, id) : undefined
    if (child) return child
  }
  return undefined
}

export function filterHierarchyTree(nodes: HierarchyNode[], query: string): HierarchyNode[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return nodes
  return nodes.flatMap((node) => {
    const children = node.children ? filterHierarchyTree(node.children, query) : []
    const matches = [node.id, node.title, node.path, node.type].join(' ').toLowerCase().includes(normalizedQuery)
    if (!matches && children.length === 0) return []
    return [{ ...node, children }]
  })
}

export function countHierarchyNodes(nodes: HierarchyNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countHierarchyNodes(node.children ?? []), 0)
}

function addableChildTypeForNode(node: HierarchyNode): HierarchyNodeType | null {
  if (node.id === 'project_definitions_group') return 'setting'
  if (node.id === 'settings_root') return 'setting'
  if (node.id === 'productions_group') return 'production'

  if (node.type === 'group') {
    const normalizedTitle = node.title.toLowerCase()
    if (normalizedTitle.includes('shot')) return 'shot'
    if (normalizedTitle.includes('storyboard')) return 'storyboard'
    if (normalizedTitle.includes('keyframe')) return 'keyframe'
    if (normalizedTitle.includes('expression')) return 'expression_unit'
    if (normalizedTitle.includes('audio')) return 'audio_cue'
    return null
  }

  switch (node.type) {
    case 'production':
      return 'segment'
    case 'setting':
      return 'state'
    case 'state':
      return 'asset'
    case 'segment':
      return 'scene_moment'
    default:
      return null
  }
}

function childFolderName(type: HierarchyNodeType): string {
  switch (type) {
    case 'state':
      return 'states'
    case 'asset':
      return 'assets'
    case 'segment':
      return 'segments'
    case 'scene_moment':
      return 'scene_moments'
    case 'shot':
      return 'shots'
    case 'storyboard':
      return 'storyboards'
    case 'keyframe':
      return 'keyframes'
    case 'expression_unit':
      return 'expression_units'
    case 'audio_cue':
      return 'audio_cues'
    case 'production':
      return 'productions'
    case 'setting':
      return 'settings'
    case 'group':
      return 'groups'
  }
}

function childFileName(type: HierarchyNodeType): string {
  return type === 'state' ? 'setting_state' : type
}

function pathSegmentAfter(path: string, marker: string): string | undefined {
  const parts = path.split('/')
  const index = parts.indexOf(marker)
  return index >= 0 ? parts[index + 1] : undefined
}
