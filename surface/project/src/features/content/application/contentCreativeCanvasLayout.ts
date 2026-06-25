import type { CreativeCanvasEdge, CreativeCanvasGraph, CreativeCanvasNode } from './contentCreativeCanvasModel'

export interface CreativeCanvasNodeSize {
  width: number
  height: number
}

export interface CreativeCanvasLayoutInput {
  graph: CreativeCanvasGraph
  measuredNodeSizes?: Record<string, CreativeCanvasNodeSize>
  pinnedPositions?: Record<string, { x: number; y: number }>
}

export interface CreativeCanvasLayoutResult {
  positions: Record<string, { x: number; y: number }>
}

const DEFAULT_NODE_SIZES: Record<CreativeCanvasNode['weight'], CreativeCanvasNodeSize> = {
  primary: { width: 360, height: 300 },
  normal: { width: 340, height: 280 },
  compact: { width: 260, height: 240 },
}

const COLUMN_GAP = 420
const ROW_GAP = 120
const SCENE_BAND_GAP = 360

export function layoutCreativeCanvas(input: CreativeCanvasLayoutInput): CreativeCanvasLayoutResult {
  const nodes = input.graph.nodes
  const scopedIds = new Set(nodes.map((node) => node.id))
  const edges = input.graph.edges.filter((edge) => scopedIds.has(edge.source) && scopedIds.has(edge.target))
  const sceneBands = creativeCanvasSceneBands(nodes, edges)
  const ranks = creativeCanvasNodeRanks(nodes, edges)
  alignSceneMomentRanks(nodes, ranks)
  const lanesByRank = new Map<number, CreativeCanvasNode[]>()
  for (const node of nodes) {
    const rank = ranks.get(node.id) ?? 0
    const laneNodes = lanesByRank.get(rank)
    if (laneNodes) laneNodes.push(node)
    else lanesByRank.set(rank, [node])
  }

  const orderedRanks = [...lanesByRank.keys()].sort((left, right) => left - right)
  const columnXByRank = creativeCanvasColumnXByRank(lanesByRank, orderedRanks, input.measuredNodeSizes)
  const sceneBandCenters = creativeCanvasSceneBandCenters(
    orderedRanks.map((rank) => lanesByRank.get(rank) ?? []),
    sceneBands,
    input.measuredNodeSizes,
  )
  const outgoing = outgoingCreativeCanvasEdges(edges)
  const positions: Record<string, { x: number; y: number }> = {}
  const positionedCenterY = new Map<string, number>()
  for (const rank of [...orderedRanks].sort((left, right) => right - left)) {
    const laneNodes = (lanesByRank.get(rank) ?? []).sort((left, right) => (
      creativeCanvasCompareNodes(left, right, sceneBands)
    ))
    const x = columnXByRank.get(rank) ?? 0
    const lanePositions = creativeCanvasLanePositions({
      nodes: laneNodes,
      outgoing,
      sceneBands,
      sceneBandCenters,
      positionedCenterY,
      measuredNodeSizes: input.measuredNodeSizes,
      pinnedPositions: input.pinnedPositions,
      x,
    })
    Object.assign(positions, lanePositions)
    for (const node of laneNodes) {
      const position = lanePositions[node.id]
      const size = input.measuredNodeSizes?.[node.id] ?? DEFAULT_NODE_SIZES[node.weight]
      if (position) positionedCenterY.set(node.id, position.y + size.height / 2)
    }
  }

  for (const node of input.graph.nodes) {
    if (positions[node.id]) continue
    const pinned = input.pinnedPositions?.[node.id]
    positions[node.id] = pinned ?? node.position
  }
  return { positions }
}

function creativeCanvasLanePositions(input: {
  nodes: CreativeCanvasNode[]
  outgoing: Map<string, CreativeCanvasEdge[]>
  sceneBands: Map<string, number>
  sceneBandCenters: Map<number, number>
  positionedCenterY: Map<string, number>
  measuredNodeSizes?: Record<string, CreativeCanvasNodeSize>
  pinnedPositions?: Record<string, { x: number; y: number }>
  x: number
}): Record<string, { x: number; y: number }> {
  const placements: CreativeCanvasLanePlacement[] = []
  for (const node of input.nodes) {
    placements.push(creativeCanvasLanePlacement({
      node,
      outgoing: input.outgoing,
      sceneBands: input.sceneBands,
      sceneBandCenters: input.sceneBandCenters,
      positionedCenterY: input.positionedCenterY,
      measuredNodeSizes: input.measuredNodeSizes,
    }))
  }
  return creativeCanvasResolveLanePositions({
    placements: creativeCanvasScatterLanePlacements(placements),
    pinnedPositions: input.pinnedPositions,
    x: input.x,
  })
}

interface CreativeCanvasLanePlacement {
  node: CreativeCanvasNode
  anchorKey: string
  desiredCenterY: number
  height: number
}

function creativeCanvasLanePlacement(input: {
  node: CreativeCanvasNode
  outgoing: Map<string, CreativeCanvasEdge[]>
  sceneBands: Map<string, number>
  sceneBandCenters: Map<number, number>
  positionedCenterY: Map<string, number>
  measuredNodeSizes?: Record<string, CreativeCanvasNodeSize>
}): CreativeCanvasLanePlacement {
  const downstreamCenters = (input.outgoing.get(input.node.id) ?? [])
    .map((edge) => input.positionedCenterY.get(edge.target))
    .filter((center): center is number => typeof center === 'number')
  const band = input.sceneBands.get(input.node.id)
  const fallbackCenter = band !== undefined
    ? input.sceneBandCenters.get(band) ?? band * SCENE_BAND_GAP
    : Math.max(0, ...input.sceneBandCenters.values()) + SCENE_BAND_GAP
  return {
    node: input.node,
    anchorKey: downstreamCenters.length
      ? `downstream:${(input.outgoing.get(input.node.id) ?? []).map((edge) => edge.target).sort().join('|')}`
      : `band:${band ?? 'none'}`,
    desiredCenterY: downstreamCenters.length
      ? downstreamCenters.reduce((sum, center) => sum + center, 0) / downstreamCenters.length
      : fallbackCenter,
    height: (input.measuredNodeSizes?.[input.node.id] ?? DEFAULT_NODE_SIZES[input.node.weight]).height,
  }
}

function creativeCanvasScatterLanePlacements(placements: CreativeCanvasLanePlacement[]): CreativeCanvasLanePlacement[] {
  const grouped = new Map<string, CreativeCanvasLanePlacement[]>()
  for (const placement of placements) {
    const group = grouped.get(placement.anchorKey)
    if (group) group.push(placement)
    else grouped.set(placement.anchorKey, [placement])
  }
  return [...grouped.values()].flatMap((group) => {
    if (group.length === 1) return group
    const centerY = group.reduce((sum, placement) => sum + placement.desiredCenterY, 0) / group.length
    const totalHeight = group.reduce((sum, placement, index) => (
      sum + placement.height + (index > 0 ? ROW_GAP : 0)
    ), 0)
    let y = centerY - totalHeight / 2
    return group.map((placement) => {
      const desiredCenterY = y + placement.height / 2
      y += placement.height + ROW_GAP
      return { ...placement, desiredCenterY }
    })
  })
}

function creativeCanvasResolveLanePositions(input: {
  placements: CreativeCanvasLanePlacement[]
  pinnedPositions?: Record<string, { x: number; y: number }>
  x: number
}): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  let cursorY = -Number.MAX_SAFE_INTEGER
  const ordered = [...input.placements].sort((left, right) => (
    left.desiredCenterY - right.desiredCenterY
    || creativeCanvasCompareNodes(left.node, right.node)
  ))
  for (const placement of ordered) {
    const pinned = input.pinnedPositions?.[placement.node.id]
    if (pinned) {
      positions[placement.node.id] = pinned
      continue
    }
    const desiredY = placement.desiredCenterY - placement.height / 2
    const y = Math.max(desiredY, cursorY)
    positions[placement.node.id] = { x: input.x, y }
    cursorY = y + placement.height + ROW_GAP
  }
  return positions
}

function creativeCanvasSceneBandCenters(
  lanes: CreativeCanvasNode[][],
  sceneBands: Map<string, number>,
  measuredNodeSizes: Record<string, CreativeCanvasNodeSize> | undefined,
): Map<number, number> {
  const spanByBand = new Map<number, number>()
  for (const lane of lanes) {
    const grouped = new Map<number, CreativeCanvasNode[]>()
    for (const node of lane) {
      const band = sceneBands.get(node.id)
      if (band === undefined) continue
      const group = grouped.get(band)
      if (group) group.push(node)
      else grouped.set(band, [node])
    }
    for (const [band, nodes] of grouped) {
      const span = nodes.reduce((sum, node, index) => (
        sum + (measuredNodeSizes?.[node.id] ?? DEFAULT_NODE_SIZES[node.weight]).height + (index > 0 ? ROW_GAP : 0)
      ), 0)
      spanByBand.set(band, Math.max(spanByBand.get(band) ?? 0, span))
    }
  }

  const centers = new Map<number, number>()
  let previousBottom = 0
  for (const band of [...spanByBand.keys()].sort((left, right) => left - right)) {
    const span = spanByBand.get(band) ?? 0
    const center = band === 0 ? 0 : previousBottom + SCENE_BAND_GAP + span / 2
    centers.set(band, center)
    previousBottom = center + span / 2
  }
  return centers
}

function creativeCanvasColumnXByRank(
  lanesByRank: Map<number, CreativeCanvasNode[]>,
  orderedRanks: number[],
  measuredNodeSizes: Record<string, CreativeCanvasNodeSize> | undefined,
): Map<number, number> {
  const output = new Map<number, number>()
  let nextX = 0
  for (const rank of orderedRanks) {
    output.set(rank, nextX)
    const laneWidth = Math.max(
      0,
      ...(lanesByRank.get(rank) ?? []).map((node) => (measuredNodeSizes?.[node.id] ?? DEFAULT_NODE_SIZES[node.weight]).width),
    )
    nextX += laneWidth + COLUMN_GAP
  }
  return output
}

function creativeCanvasNodeRanks(nodes: CreativeCanvasNode[], edges: CreativeCanvasEdge[]): Map<string, number> {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map<string, CreativeCanvasEdge[]>()
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1)
    const outgoingEdges = outgoing.get(edge.source)
    if (outgoingEdges) outgoingEdges.push(edge)
    else outgoing.set(edge.source, [edge])
  }
  const queue = nodes
    .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
    .sort((left, right) => creativeCanvasCompareNodes(left, right))
    .map((node) => node.id)
  const ranks = new Map(nodes.map((node) => [node.id, 0]))
  while (queue.length) {
    const nodeId = queue.shift()!
    const sourceRank = ranks.get(nodeId) ?? 0
    for (const edge of outgoing.get(nodeId) ?? []) {
      ranks.set(edge.target, Math.max(ranks.get(edge.target) ?? 0, sourceRank + edgeRankStep(edge)))
      incomingCount.set(edge.target, Math.max(0, (incomingCount.get(edge.target) ?? 1) - 1))
      if ((incomingCount.get(edge.target) ?? 0) === 0) {
        queue.push(edge.target)
        queue.sort((left, right) => creativeCanvasCompareNodeIds(left, right, nodesById))
      }
    }
  }
  return ranks
}

function alignSceneMomentRanks(nodes: CreativeCanvasNode[], ranks: Map<string, number>): void {
  const sceneRanks = nodes
    .filter((node) => node.kind === 'scene_moment')
    .map((node) => ranks.get(node.id) ?? 0)
  if (!sceneRanks.length) return
  const sceneRank = Math.max(...sceneRanks)
  for (const node of nodes) {
    if (node.kind === 'scene_moment') ranks.set(node.id, sceneRank)
  }
}

function outgoingCreativeCanvasEdges(edges: CreativeCanvasEdge[]): Map<string, CreativeCanvasEdge[]> {
  const outgoing = new Map<string, CreativeCanvasEdge[]>()
  for (const edge of edges) {
    const outgoingEdges = outgoing.get(edge.source)
    if (outgoingEdges) outgoingEdges.push(edge)
    else outgoing.set(edge.source, [edge])
  }
  return outgoing
}

function edgeRankStep(edge: CreativeCanvasEdge): number {
  if (edge.sourceEdge.kind === 'sequence' || edge.sourceEdge.type === 'sequence') return 0
  return 1
}

function creativeCanvasSceneBands(nodes: CreativeCanvasNode[], edges: CreativeCanvasEdge[]): Map<string, number> {
  const bands = new Map<string, number>()
  nodes
    .filter((node) => node.kind === 'scene_moment')
    .sort(compareSceneMomentOrder)
    .forEach((node, index) => bands.set(node.id, index))
  if (!bands.size) return bands

  let changed = true
  while (changed) {
    changed = false
    for (const edge of edges) {
      const targetBand = bands.get(edge.target)
      if (targetBand === undefined) continue
      const current = bands.get(edge.source)
      if (current === undefined || targetBand < current) {
        bands.set(edge.source, targetBand)
        changed = true
      }
    }
  }
  return bands
}

function compareSceneMomentOrder(left: CreativeCanvasNode, right: CreativeCanvasNode): number {
  return numericRecordField(left.source.record.order) - numericRecordField(right.source.record.order)
    || left.position.y - right.position.y
    || left.position.x - right.position.x
    || left.source.title.localeCompare(right.source.title)
    || left.id.localeCompare(right.id)
}

function creativeCanvasCompareNodes(
  left: CreativeCanvasNode,
  right: CreativeCanvasNode,
  sceneBands?: Map<string, number>,
): number {
  const leftSceneBand = sceneBands?.get(left.id)
  const rightSceneBand = sceneBands?.get(right.id)
  if (leftSceneBand !== undefined || rightSceneBand !== undefined) {
    const bandDelta = (leftSceneBand ?? Number.MAX_SAFE_INTEGER) - (rightSceneBand ?? Number.MAX_SAFE_INTEGER)
    if (bandDelta !== 0) return bandDelta
  }
  return creativeCanvasLayoutOrder(left) - creativeCanvasLayoutOrder(right)
    || numericRecordField(left.source.record.order) - numericRecordField(right.source.record.order)
    || left.position.y - right.position.y
    || left.source.title.localeCompare(right.source.title)
    || left.id.localeCompare(right.id)
}

function creativeCanvasCompareNodeIds(leftId: string, rightId: string, nodesById: Map<string, CreativeCanvasNode>): number {
  const left = nodesById.get(leftId)
  const right = nodesById.get(rightId)
  if (!left || !right) return leftId.localeCompare(rightId)
  return creativeCanvasCompareNodes(left, right)
}

function creativeCanvasLayoutOrder(node: CreativeCanvasNode): number {
  if (node.selected) return 0
  if (node.role === 'structure') return 10
  if (node.role === 'creative') return 20
  if (node.role === 'generation') return 30
  if (node.role === 'candidate') return 40
  if (node.role === 'resource') return 50
  return 60
}

function numericRecordField(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return Number.MAX_SAFE_INTEGER
}
