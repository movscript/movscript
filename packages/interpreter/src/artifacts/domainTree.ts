import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import {
  classifyMovScriptEntityKind,
  projectMovScriptDomainNodeKind,
} from '@movscript/domain'
import type { MovScriptDomainNodeCategory } from '@movscript/domain'
import type { MovScriptDomainTreeArtifact, MovScriptDomainTreeNode } from './derivedArtifactTypes.js'
import {
  canonicalEntities,
  nearestParentPath,
  numberField,
  stringField,
} from './derivedArtifactHelpers.js'

export function deriveDomainTree(index: MovScriptWorkspaceDomainIndex): MovScriptDomainTreeArtifact {
  const nodes = new Map<string, MovScriptDomainTreeNode>()
  const roots: MovScriptDomainTreeNode[] = []
  for (const entity of canonicalEntities(index)) {
    if (!isTreeEntity(entity)) continue
    nodes.set(entity.path, treeNode(entity))
  }
  for (const node of nodes.values()) {
    const parent = nearestParentNode(node.path, nodes)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  sortTreeNodes(roots)
  return { schema: 'movscript.domain-tree.v1', roots }
}

function isTreeEntity(entity: MovScriptWorkspaceIndexedEntity): boolean {
  return true
}

function treeNode(entity: MovScriptWorkspaceIndexedEntity): MovScriptDomainTreeNode {
  const nodeCategory = classifyMovScriptEntityKind(entity.entityKind)
  return {
    entityKind: entity.entityKind,
    ...(nodeCategory ? { nodeCategory } : {}),
    nodeKind: domainNodeKind(entity, nodeCategory),
    ...(entity.id !== undefined ? { id: entity.id } : {}),
    path: entity.path,
    title: stringField(entity.record.title) ?? String(entity.id ?? entity.path),
    order: numberField(entity.record.order),
    children: [],
  }
}

function domainNodeKind(
  entity: MovScriptWorkspaceIndexedEntity,
  _nodeCategory: MovScriptDomainNodeCategory | undefined,
): string {
  return projectMovScriptDomainNodeKind(entity.entityKind, entity.record)
}

function nearestParentNode(path: string, nodes: Map<string, MovScriptDomainTreeNode>): MovScriptDomainTreeNode | undefined {
  const parent = nearestParentPath(path, new Set(nodes.keys()))
  return parent ? nodes.get(parent) : undefined
}

function sortTreeNodes(nodes: MovScriptDomainTreeNode[]): void {
  nodes.sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.path.localeCompare(right.path)
  })
  for (const node of nodes) sortTreeNodes(node.children)
}
