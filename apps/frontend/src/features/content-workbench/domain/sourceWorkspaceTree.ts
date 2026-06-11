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
  const parentPath = parentNode.path.replace(/\/[^/]*\.json$/, '')
  return `${parentPath}/${pathSlug}/${childType}.json`
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
