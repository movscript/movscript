import { compactCanvasLayoutRect } from '../domain/layout'

export interface CanvasRenderDiagnosticResource {
  ID: number | string
  type?: string
  size?: number
  name?: string
}

export interface CanvasRenderDiagnosticNode {
  id: string
  type?: string
  data?: unknown
}

export interface CanvasRenderDiagnosticInput {
  id: string
  canvasType: string
  root: HTMLElement | null
  viewport: {
    width: number
    height: number
    dpr: number
  }
  nodes: CanvasRenderDiagnosticNode[]
  edgesCount: number
  renderedNodesCount: number
  renderedEdgesCount: number
  resourcesCount: number
  selectedCount: number
  runningCount: number
  libraryCollapsed: boolean
  workflowPanelCollapsed: boolean
  zoom: number
  grid: boolean
  minimap: boolean
  mediaLightweight: boolean
  debugOptions: string
  origin: string
}

function canvasDiagnosticResourceFromNode(node: CanvasRenderDiagnosticNode) {
  const data = node.data && typeof node.data === 'object' ? node.data as { resource?: CanvasRenderDiagnosticResource } : undefined
  return data?.resource
}

export function compactCanvasRenderDiagnosticResource(resource: CanvasRenderDiagnosticResource | undefined) {
  if (!resource) return 'none'
  return `#${resource.ID}:${resource.type ?? 'unknown'}:${resource.size ?? 0}:${resource.name ?? ''}`
}

export function compactCanvasRenderDiagnosticMediaSrc(src: string | undefined, origin: string) {
  if (!src) return 'empty'
  try {
    const url = new URL(src, origin)
    return `${url.pathname}${url.search}`
  } catch {
    return src.length > 80 ? `${src.slice(0, 80)}...` : src
  }
}

export function compactCanvasRenderDiagnosticMediaElement(
  element: HTMLImageElement | HTMLVideoElement,
  origin: string,
) {
  const rect = element.getBoundingClientRect()
  const flowNode = element.closest<HTMLElement>('.react-flow__node')
  const owner = flowNode?.dataset.id ? `node:${flowNode.dataset.id}` : element.closest('.canvas-resource-shelf-card') ? 'shelf' : 'other'
  const natural = element instanceof HTMLVideoElement
    ? `${element.videoWidth}x${element.videoHeight}`
    : `${element.naturalWidth}x${element.naturalHeight}`
  return `${owner}:${compactCanvasLayoutRect(rect)}:natural=${natural}:${compactCanvasRenderDiagnosticMediaSrc(element.currentSrc || element.src, origin)}`
}

export function canvasRenderDiagnosticMediaNodeCounts(nodes: CanvasRenderDiagnosticNode[]) {
  let images = 0
  let videos = 0
  for (const node of nodes) {
    const resourceType = canvasDiagnosticResourceFromNode(node)?.type
    if (node.type === 'image' || resourceType === 'image') images += 1
    if (node.type === 'video' || resourceType === 'video') videos += 1
  }
  return { images, videos }
}

export function canvasRenderDiagnosticFirstMediaSummary(nodes: CanvasRenderDiagnosticNode[]) {
  return nodes
    .map((node) => ({ node, resource: canvasDiagnosticResourceFromNode(node) }))
    .filter((item) => item.resource?.type === 'image' || item.resource?.type === 'video')
    .slice(0, 8)
    .map((item) => `${item.node.id}:${compactCanvasRenderDiagnosticResource(item.resource)}`)
    .join('|') || 'none'
}

export function collectCanvasRenderDomDiagnostics(root: HTMLElement | null, origin: string) {
  const flow = root?.querySelector<HTMLElement>('.react-flow') ?? null
  const viewport = root?.querySelector<HTMLElement>('.react-flow__viewport') ?? null
  return {
    rootRect: root?.getBoundingClientRect() ?? null,
    flowRect: flow?.getBoundingClientRect() ?? null,
    viewportTransform: viewport ? window.getComputedStyle(viewport).transform : 'none',
    domNodes: root?.querySelectorAll('.react-flow__node').length ?? 0,
    domEdges: root?.querySelectorAll('.react-flow__edge').length ?? 0,
    domVideos: root?.querySelectorAll('video').length ?? 0,
    domImages: root?.querySelectorAll('img').length ?? 0,
    domImageSample: Array.from(root?.querySelectorAll('img') ?? [])
      .slice(0, 12)
      .map((element) => compactCanvasRenderDiagnosticMediaElement(element, origin))
      .join('|') || 'none',
    domVideoSample: Array.from(root?.querySelectorAll('video') ?? [])
      .slice(0, 6)
      .map((element) => compactCanvasRenderDiagnosticMediaElement(element, origin))
      .join('|') || 'none',
  }
}

export function logCanvasRenderDiagnostics(input: CanvasRenderDiagnosticInput) {
  const dom = collectCanvasRenderDomDiagnostics(input.root, input.origin)
  const mediaCounts = canvasRenderDiagnosticMediaNodeCounts(input.nodes)
  const firstMedia = canvasRenderDiagnosticFirstMediaSummary(input.nodes)

  console.info(
    [
      `[canvas:render] id=${input.id}`,
      `canvasType=${input.canvasType}`,
      `viewport=${input.viewport.width}x${input.viewport.height}`,
      `dpr=${input.viewport.dpr.toFixed(2)}`,
      `pane=${compactCanvasLayoutRect(dom.rootRect)}`,
      `flow=${compactCanvasLayoutRect(dom.flowRect)}`,
      `nodes=${input.nodes.length}`,
      `edges=${input.edgesCount}`,
      `renderedNodes=${input.renderedNodesCount}`,
      `renderedEdges=${input.renderedEdgesCount}`,
      `domNodes=${dom.domNodes}`,
      `domEdges=${dom.domEdges}`,
      `images=${mediaCounts.images}/${dom.domImages}`,
      `videos=${mediaCounts.videos}/${dom.domVideos}`,
      `resources=${input.resourcesCount}`,
      `selected=${input.selectedCount}`,
      `running=${input.runningCount}`,
      `libraryCollapsed=${input.libraryCollapsed}`,
      `workflowCollapsed=${input.workflowPanelCollapsed}`,
      `zoom=${input.zoom.toFixed(3)}`,
      `grid=${input.grid ? 'on' : 'off'}`,
      `minimap=${input.minimap ? 'on' : 'off'}`,
      `mediaLightweight=${input.mediaLightweight ? 'on' : 'off'}`,
      `debug=${input.debugOptions}`,
      `transform=${dom.viewportTransform}`,
    ].join(' '),
  )
  console.info(`[canvas:render] media-sample id=${input.id} items=${firstMedia}`)
  console.info(`[canvas:render] image-dom-sample id=${input.id} items=${dom.domImageSample}`)
  console.info(`[canvas:render] video-dom-sample id=${input.id} items=${dom.domVideoSample}`)
}
