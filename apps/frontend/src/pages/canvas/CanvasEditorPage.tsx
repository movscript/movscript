import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  ReactFlowProvider,
  useReactFlow,
  SelectionMode,
  ConnectionMode,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { api } from '@/lib/api'
import { invalidateAssetCandidateConsumers } from '@/lib/assetCandidateQueryInvalidation'
import type { Canvas, CanvasNodeData, CanvasPortDef, CanvasPortValue, CanvasRun, CanvasTask, CanvasType, NodeType, PaginatedResponse, RawResource, ResourceBinding } from '@/types'
import {
	TextNode, ImageNode, VideoNode, ToolNode,
	InputNode, OutputNode, ResourceSinkNode, ApprovalNode, TextGenNode, AIGenNode, GroupNode, PluginCardNode,
} from './components/CanvasNodes'
import { ContextMenu } from './components/ContextMenu'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { NodePanel, deriveCanvasReferencePorts } from './components/NodePanel'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { compileClientPlugin, loadClientPlugins, runClientPlugin, type ClientPluginManifest } from '@/lib/clientPlugins'
import { toast } from '@/store/toastStore'
import { useCanvasHeaderStore } from '@/store/canvasHeaderStore'
import {
  CANVAS_NODE_CATALOG,
  CANVAS_NODE_CATEGORIES,
  CANVAS_NODE_META,
  NODE_LABELS,
} from './nodeCatalog'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Badge } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/projectRoutes'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Layers3,
  Loader2,
  MousePointer2,
  PanelRightClose,
  Play,
  Save,
  Search,
  Sparkles,
  Workflow,
  Zap,
  Lightbulb,
  HardDrive,
  File,
  Puzzle,
  History,
  ListFilter,
  Clock3,
  CheckCircle2,
  XCircle,
  Download,
  Trash2,
} from 'lucide-react'

const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  canvas: ToolNode,
  ref_image_gen: ToolNode,
  ref_video_gen: ToolNode,
  multi_angle: ToolNode,
  style_transfer: ToolNode,
  motion_imitation: ToolNode,
	input: InputNode,
	output: OutputNode,
	resource_sink: ResourceSinkNode,
	approval: ApprovalNode,
  text_gen: TextGenNode,
  ai_gen: AIGenNode,
  group: GroupNode,
  plugin_card: PluginCardNode,
}

const SIDEBAR_NODE_CATEGORIES = CANVAS_NODE_CATEGORIES.filter((category) => category.id !== 'media')
const SIDEBAR_HIDDEN_NODE_TYPES = new Set<NodeType>(['approval'])
const MEDIA_NODE_TYPES = new Set<string>(['text', 'image', 'video'])
const FINAL_OUTPUT_NODE_ID = 'final-output'

export interface CanvasPushTarget {
  kind: 'asset_slot'
  id: number
  label: string
}

interface CanvasWorkspaceProps {
  canvasId: number | string
  embedded?: boolean
  useAppHeader?: boolean
  onClose?: () => void
  pushTargets?: CanvasPushTarget[]
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

function createNodeData(type: NodeType, t: (key: string) => string): Partial<CanvasNodeData> & { label: string } {
  const meta = CANVAS_NODE_META[type]
  const data = { ...(meta?.defaultData ?? { source: 'upload', label: NODE_LABELS[type] }) }
  return { ...data, label: meta ? t(meta.defaultLabelKey) : t(`canvas.nodeLabels.${type}`) }
}

function createFinalOutputNode(t: (key: string, options?: any) => string): Node {
  return {
    id: FINAL_OUTPUT_NODE_ID,
    type: 'output',
    position: { x: 560, y: 120 },
    data: {
      ...createNodeData('output', t),
      label: t('canvas.editor.finalOutput', { defaultValue: '最终输出' }),
      paramName: 'final_output',
      paramType: 'resource',
      lockedFinalOutput: true,
    } as any,
    style: { width: 220 },
  }
}

function isFinalOutputNode(node: Node) {
  return node.id === FINAL_OUTPUT_NODE_ID || Boolean((node.data as any)?.lockedFinalOutput)
}

function ensureFinalOutputNode(nodes: Node[], t: (key: string, options?: any) => string) {
  if (nodes.some(isFinalOutputNode) || nodes.some((node) => node.type === 'output')) return nodes
  return [...nodes, createFinalOutputNode(t)]
}

function defaultHandleForType(type: string | undefined, side: 'source' | 'target') {
  if (!type) return undefined
  const meta = CANVAS_NODE_META[type as NodeType]
  const ports = side === 'source' ? meta?.outputs : meta?.inputs
  return ports?.[0]?.id ?? (!meta ? (side === 'source' ? 'result' : 'input') : undefined)
}

function semanticHandlePrefix(side: 'source' | 'target') {
  return side === 'source' ? 'out:' : 'in:'
}

function toUiHandleId(handle: string | null | undefined, side: 'source' | 'target') {
  if (!handle) return handle
  if (handle.startsWith('in:') || handle.startsWith('out:')) {
    const portId = fromUiHandleId(handle)
    return portId ? `${semanticHandlePrefix(side)}${portId}` : handle
  }
  return `${semanticHandlePrefix(side)}${handle.replace(/^:+/, '')}`
}

function fromUiHandleId(handle: string | null | undefined) {
  if (!handle) return handle
  if (handle.startsWith('in:')) return handle.slice(3).replace(/^:+/, '')
  if (handle.startsWith('out:')) return handle.slice(4).replace(/^:+/, '')
  return handle.replace(/^:+/, '')
}

function edgeConnectionKey(edge: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) {
  return [
    edge.source,
    fromUiHandleId(edge.sourceHandle) ?? '',
    edge.target,
    fromUiHandleId(edge.targetHandle) ?? '',
  ].join('::')
}

function makeEdgeId(edge: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) {
  return `${edgeConnectionKey(edge)}::${genId()}`
}

function uniqueEdgesByConnection(edgeList: Edge[]) {
  const seen = new Set<string>()
  return edgeList.filter((edge) => {
    const key = edgeConnectionKey(edge)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function defaultHandleForNode(node: Node | undefined, side: 'source' | 'target') {
  const data = node?.data as Partial<CanvasNodeData> | undefined
  const customPorts = side === 'source' ? data?.outputPorts : data?.inputPorts
  if (customPorts?.[0]) return customPorts[0].id
  return defaultHandleForType(node?.type, side)
}

function portsForNode(node: Node | undefined, side: 'source' | 'target'): CanvasPortDef[] {
  if (!node) return []
  const data = node.data as Partial<CanvasNodeData>
  if (side === 'target' && MEDIA_NODE_TYPES.has(String(node.type)) && data.source !== 'ai') {
    return []
  }
  if (node.type === 'input') {
    return side === 'source'
      ? [{ id: 'value', label: data.paramName || (data as any).label || node.id, type: data.paramType ?? 'text', required: true }]
      : []
  }
  if (node.type === 'output') {
    return side === 'target'
      ? [{ id: 'value', label: data.paramName || (data as any).label || node.id, type: data.paramType ?? 'resource', required: true }]
      : []
  }
  if (node.type === 'resource_sink') {
    return side === 'target'
      ? [{ id: 'input', label: 'resource', type: 'resource', required: true }]
      : []
  }
  const customPorts = side === 'source' ? data.outputPorts : data.inputPorts
  if (customPorts) return customPorts
  const meta = CANVAS_NODE_META[node.type as NodeType]
  const metaPorts = side === 'source' ? meta?.outputs : meta?.inputs
  if (metaPorts) return metaPorts
  return [{ id: side === 'source' ? 'result' : 'input', label: side === 'source' ? 'Result' : 'Input', type: 'resource' }]
}

function portForHandle(node: Node | undefined, side: 'source' | 'target', handle?: string | null) {
  const ports = portsForNode(node, side)
  if (ports.length === 0) return undefined
  const portId = fromUiHandleId(handle)
  return ports.find((port) => port.id === portId) ?? ports[0]
}

function arePortTypesCompatible(sourceType?: string, targetType?: string) {
  if (!sourceType || !targetType) return true
  if (sourceType === targetType) return true
  if (sourceType === 'resource' || targetType === 'resource') return true
  return false
}

function portLabel(port?: CanvasPortDef) {
  if (!port) return 'unknown'
  return `${port.label ?? port.id} (${port.type})`
}

function resourceIdFromTask(task: CanvasTask) {
  if (task.resource_id) return task.resource_id
  if (!task.output_values) return undefined
  try {
    const outputs = JSON.parse(task.output_values) as Record<string, { resource_id?: number }>
    return outputs.result?.resource_id
      ?? outputs.value?.resource_id
      ?? outputs['']?.resource_id
      ?? Object.values(outputs).find((value) => value?.resource_id)?.resource_id
  } catch {
    return undefined
  }
}

function parseTaskInputValues(raw?: string): Record<string, CanvasPortValue[]> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, CanvasPortValue | CanvasPortValue[] | string | number | boolean | null>
    return Object.fromEntries(Object.entries(parsed).map(([handle, value]) => {
      const values = Array.isArray(value) ? value : [value]
      return [handle, values.map(normalizeCanvasPortValue).filter(Boolean) as CanvasPortValue[]]
    }).filter(([, values]) => values.length > 0))
  } catch {
    return {}
  }
}

function parseTaskOutputValues(raw?: string): Record<string, CanvasPortValue> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, CanvasPortValue | string | number | boolean | null>
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([handle, value]) => [handle, normalizeCanvasPortValue(value)] as const)
        .filter(([, value]) => !!value)
    ) as Record<string, CanvasPortValue>
  } catch {
    return {}
  }
}

function normalizeCanvasPortValue(value: CanvasPortValue | string | number | boolean | null): CanvasPortValue | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return { type: 'text', text: value }
  if (typeof value === 'number') return { type: 'number', number: value }
  if (typeof value === 'boolean') return { type: 'boolean', boolean: value }
  return value
}

function portMatchesHandle(port: CanvasPortDef, handle: string) {
  return port.id === handle || (port.aliases ?? []).includes(handle)
}

function taskPortLabel(node: Node | undefined, side: 'source' | 'target', handle: string, t: (key: string, options?: any) => string) {
  const port = portsForNode(node, side).find((item) => portMatchesHandle(item, handle))
  if (!port) return handle || (side === 'source' ? 'result' : 'input')
  return port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)
}

function canvasPortValueSummary(value: CanvasPortValue) {
  if (value.resource_id) return `resource #${value.resource_id}`
  if (value.text !== undefined) return value.text
  if (value.json !== undefined) {
    try { return JSON.stringify(value.json) } catch { return String(value.json) }
  }
  if (value.number !== undefined) return String(value.number)
  if (value.boolean !== undefined) return value.boolean ? 'true' : 'false'
  return ''
}

function canvasPortValuePreviewText(value: CanvasPortValue) {
  if (value.text !== undefined) return value.text
  if (value.json !== undefined) {
    try { return JSON.stringify(value.json, null, 2) } catch { return String(value.json) }
  }
  if (value.number !== undefined) return String(value.number)
  if (value.boolean !== undefined) return value.boolean ? 'true' : 'false'
  if (value.resource_id) return `resource #${value.resource_id}`
  return ''
}

interface WorkflowRunOutputItem {
  key: string
  label: string
  value: CanvasPortValue
  resource?: RawResource
}

function resourceTypeForPortValue(value: CanvasPortValue): RawResource['type'] {
  if (value.type === 'image' || value.type === 'video') return value.type
  return 'text'
}

function resourceNameForOutput(label: string, value: CanvasPortValue) {
  const safeLabel = label.trim() || 'workflow-output'
  const ext = value.type === 'json' ? 'json' : value.type === 'image' ? 'png' : value.type === 'video' ? 'mp4' : 'txt'
  return `${safeLabel}.${ext}`
}

function resourceFromOutputValue(label: string, value: CanvasPortValue): RawResource | undefined {
  if (!value.resource_id) return undefined
  return {
    ID: value.resource_id,
    owner_id: 0,
    type: resourceTypeForPortValue(value),
    name: resourceNameForOutput(label, value),
    url: `/api/v1/resources/${value.resource_id}/file`,
    size: 0,
    mime_type: '',
  }
}

function workflowRunOutputItems(run: CanvasRun | undefined, nodes: Node[], t: (key: string, options?: any) => string): WorkflowRunOutputItem[] {
  const outputs = parseTaskOutputValues(run?.output_values)
  const usedKeys = new Set<string>()
  const seen = new Set<string>()
  const items: WorkflowRunOutputItem[] = []
  const addItem = (key: string, label: string, value: CanvasPortValue | undefined, dedupe = true) => {
    if (!value) return
    const identity = dedupe ? (value.resource_id ? `resource:${value.resource_id}` : `${value.type}:${canvasPortValueSummary(value)}`) : `key:${key}`
    if (seen.has(identity)) {
      usedKeys.add(key)
      return
    }
    seen.add(identity)
    usedKeys.add(key)
    items.push({ key, label, value, resource: resourceFromOutputValue(label, value) })
  }

  nodes.filter((node) => node.type === 'output').forEach((node) => {
    const data = node.data as Partial<CanvasNodeData>
    const label = data.paramName || (data as any).label || node.id
    const candidateKeys = [node.id, data.paramName, ...(data.outputPorts ?? []).map((port) => port.id)].filter(Boolean) as string[]
    const key = candidateKeys.find((candidate) => outputs[candidate])
    if (key) {
      candidateKeys.forEach((candidate) => usedKeys.add(candidate))
      addItem(key, label, outputs[key])
    }
  })

  Object.entries(outputs).forEach(([key, value]) => {
    if (!usedKeys.has(key)) {
      addItem(key, key || t('canvas.editor.runResults.output', { defaultValue: 'Output' }), value)
    }
  })
  return items
}

function hasValueForPort(values: CanvasPortValue[] | undefined) {
  return (values ?? []).some((value) => {
    if (!value) return false
    return value.resource_id !== undefined
      || value.text !== undefined
      || value.json !== undefined
      || value.number !== undefined
      || value.boolean !== undefined
  })
}

function newestCanvasTask(a?: CanvasTask, b?: CanvasTask) {
  if (!a) return b
  if (!b) return a
  const aTime = a.CreatedAt ? new Date(a.CreatedAt).getTime() : 0
  const bTime = b.CreatedAt ? new Date(b.CreatedAt).getTime() : 0
  if (aTime !== bTime) return bTime > aTime ? b : a
  return (b.ID ?? 0) > (a.ID ?? 0) ? b : a
}

function connectedInputPortIds(nodeId: string, edges: Edge[]) {
  const ids = new Set<string>()
  edges.forEach((edge) => {
    if (edge.target !== nodeId) return
    ids.add(fromUiHandleId(edge.targetHandle) || 'input')
  })
  return ids
}

function runtimeInputPortsForNode(node: Node | undefined, edges: Edge[]) {
  if (!node) return []
  const connected = connectedInputPortIds(node.id, edges)
  return portsForNode(node, 'target').filter((port) => port.required && !connected.has(port.id))
}

function defaultRuntimeValueForPort(port: CanvasPortDef) {
  switch (port.type) {
    case 'json':
      return '{}'
    case 'boolean':
      return 'false'
    default:
      return ''
  }
}

function encodeRuntimePortValue(port: CanvasPortDef, raw: string): CanvasPortValue | null {
  switch (port.type) {
    case 'number': {
      const value = Number(raw)
      return Number.isFinite(value) ? { type: 'number', number: value } : null
    }
    case 'boolean':
      return { type: 'boolean', boolean: raw === 'true' }
    case 'json': {
      try {
        return { type: 'json', json: raw.trim() ? JSON.parse(raw) : null }
      } catch {
        return null
      }
    }
    case 'image':
    case 'video':
    case 'resource': {
      const id = Number(raw)
      return Number.isInteger(id) && id > 0 ? { type: port.type, resource_id: id } : null
    }
    case 'text':
    default:
      return { type: 'text', text: raw }
  }
}

function portForWorkflowInputNode(node: Node): CanvasPortDef {
  const data = node.data as Partial<CanvasNodeData> & { label?: string }
  return {
    id: 'value',
    label: data.paramName || data.label || node.id,
    type: data.paramType ?? 'text',
    required: true,
  }
}

function readOnlyMediaPortPatch(source: CanvasNodeData['source']): Partial<CanvasNodeData> {
  return source === 'ai' ? { inputPorts: undefined } : { inputPorts: [] }
}

function resourceToNodeType(resource: RawResource): NodeType | undefined {
  if (resource.type === 'image' || resource.type === 'video' || resource.type === 'text') {
    return resource.type
  }
  return undefined
}

function ResourceThumb({ resource }: { resource: RawResource }) {
  const url = resource.direct_url ?? (resource.url ? `${API_BASE}${resource.url}` : '')
  if (resource.type === 'image') {
    return resource.direct_url
      ? <img src={resource.direct_url} alt="" className="h-full w-full object-cover" />
      : <AuthedImage src={url} alt="" className="h-full w-full object-cover" />
  }
  if (resource.type === 'video') {
    return resource.direct_url
      ? <video src={resource.direct_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      : <AuthedVideo src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
  }
  return <File size={14} className="text-muted-foreground" />
}

function CanvasResourceShelf({
  projectId,
  dependencyBindings = [],
  variant = 'floating',
}: {
  projectId?: number
  dependencyBindings?: ResourceBinding[]
  variant?: 'floating' | 'panel' | 'side'
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const isPanel = variant === 'panel'
  const isSide = variant === 'side'
  const { data: resourcePage } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['canvas-resource-shelf', 'resources'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 48, type: 'image,video,text' } }).then((r) => r.data),
  })
  const resources = (resourcePage?.items ?? []).filter((resource) => resourceToNodeType(resource))
  const resourceItems = resources.filter((resource) => resourceMatchesSearch(resource, search))
  const activeFilteredCount = resourceItems.length

  function dragResource(event: React.DragEvent, resource: RawResource) {
    event.dataTransfer.setData('application/canvas-resource', JSON.stringify(resource))
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className={cn(
      isPanel || isSide
        ? 'flex h-full flex-col overflow-hidden bg-background'
        : 'pointer-events-auto absolute bottom-4 left-4 right-24 z-10 overflow-hidden rounded-lg border border-border bg-background/95 shadow-lg backdrop-blur'
    )}>
      <div className={cn(
        isSide ? 'shrink-0 space-y-2 border-b border-border px-3 py-3' : 'flex h-11 shrink-0 items-center gap-2 border-b border-border px-3'
      )}>
        {!isPanel && !isSide && (
          <>
            <HardDrive size={14} className="text-muted-foreground" />
            <span className="shrink-0 type-label font-semibold text-foreground">{t('canvas.editor.resourceShelf.title')}</span>
          </>
        )}
        <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-primary bg-primary px-2.5 type-label text-primary-foreground">
            <span className="truncate">资源库</span>
            <span className="shrink-0 rounded bg-primary-foreground/20 px-1 tabular-nums type-tiny text-primary-foreground">{resources.length}</span>
          </span>
        </nav>
        <div className={cn('relative', isSide ? 'w-full' : 'min-w-[180px] max-w-[340px] flex-[0_1_340px]')}>
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-7 pl-7 type-label"
            placeholder="搜索资源：名称、类型、ID"
          />
        </div>
        <span className="shrink-0 type-caption text-muted-foreground">
          {search.trim() ? `${activeFilteredCount} 个结果` : t('canvas.editor.resourceShelf.dragHint')}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-w-0 flex-1 overflow-auto p-3">
          {resourceItems.length > 0 ? (
            <div className={cn(isSide ? 'grid grid-cols-1 gap-2' : 'grid auto-rows-[150px] grid-cols-[repeat(auto-fill,236px)] gap-3')}>
              {resourceItems.map((resource) => (
                <ResourceShelfCard
                  key={resource.ID}
                  resource={resource}
                  selected={dependencyBindings.some((binding) => binding.resource_id === resource.ID)}
                  compact={isSide}
                  onDragStart={(event) => dragResource(event, resource)}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center type-label text-muted-foreground">
              {t('shared.resourcePanel.noResources')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResourceShelfCard({
  resource,
  selected,
  compact = false,
  onDragStart,
}: {
  resource: RawResource
  selected?: boolean
  compact?: boolean
  onDragStart: (event: React.DragEvent) => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'group flex shrink-0 cursor-grab flex-col overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md active:cursor-grabbing',
        compact ? 'h-[132px] w-full' : 'h-[150px] w-[236px]',
        selected ? 'border-emerald-500/60 ring-1 ring-emerald-500/30' : 'border-border',
      )}
      title={resource.name}
    >
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground',
          compact ? 'h-16 w-16' : 'h-[82px] w-[82px]'
        )}>
          <div className="h-full w-full">
            <ResourceThumb resource={resource} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge variant="outline" className="shrink-0 type-tiny leading-none">{resource.type}</Badge>
            {selected ? <span className="truncate type-tiny leading-none text-emerald-600">已作为依赖</span> : null}
          </div>
          <p className="mt-2 line-clamp-2 min-h-9 type-body font-semibold leading-[18px] text-foreground">{resource.name}</p>
          <p className="mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground">
            {resource.mime_type || resource.type}
          </p>
        </div>
      </div>
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border bg-muted/25 px-3 type-tiny text-muted-foreground">
        <span className="truncate">#{resource.ID}</span>
        <span className="truncate">{selected ? '可直接拖入画布' : formatBytes(resource.size)}</span>
      </div>
    </div>
  )
}

function resourceMatchesSearch(resource: RawResource, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [resource.ID, resource.name, resource.type, resource.mime_type]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q)
}

function formatBytes(value: number | undefined) {
  if (!value) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatRunTime(value: string | undefined, language: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString(language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRunDuration(run: CanvasRun) {
  if (!run.started_at) return '-'
  const end = run.finished_at ? new Date(run.finished_at).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - new Date(run.started_at).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function RunStatusBadge({ status }: { status: CanvasRun['status'] }) {
  const { t } = useTranslation()
  if (status === 'running' || status === 'pending') {
    return (
      <Badge variant="secondary" className="gap-1 border-transparent">
        <Loader2 size={12} className="animate-spin" />
        {t(`canvas.runStatus.${status}`)}
      </Badge>
    )
  }
  if (status === 'done') {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600">
        <CheckCircle2 size={12} />
        {t('canvas.runStatus.done')}
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle size={12} />
      {t('canvas.runStatus.failed')}
    </Badge>
  )
}

function WorkflowRunHistory({
  runs,
  total,
  page,
  pageCount,
  statusFilter,
  activeRunId,
  isLoading,
  embedded = false,
  compact = false,
  onStatusFilterChange,
  onPageChange,
  onSelectRun,
}: {
  runs: CanvasRun[]
  total: number
  page: number
  pageCount: number
  statusFilter: 'all' | CanvasRun['status']
  activeRunId: number | null
  isLoading: boolean
  embedded?: boolean
  compact?: boolean
  onStatusFilterChange: (status: 'all' | CanvasRun['status']) => void
  onPageChange: (page: number) => void
  onSelectRun: (runId: number) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <section className={cn(
      embedded ? 'flex h-full flex-col bg-background' : 'h-52 shrink-0 border-t border-border bg-background'
    )}>
      {compact ? (
        <div className="shrink-0 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <History size={14} className="text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="type-label font-semibold text-foreground">{t('canvas.editor.history.title')}</p>
              <p className="type-tiny text-muted-foreground">{t('canvas.editor.history.runsCount', { count: total })}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as 'all' | CanvasRun['status'])}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 type-label text-foreground outline-none"
            >
              <option value="all">{t('canvas.editor.history.allStatuses')}</option>
              <option value="running">{t('canvas.runStatus.running')}</option>
              <option value="pending">{t('canvas.runStatus.pending')}</option>
              <option value="done">{t('canvas.runStatus.done')}</option>
              <option value="failed">{t('canvas.runStatus.failed')}</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
              <ChevronLeft size={12} />
            </Button>
            <span className="w-10 text-center type-caption text-muted-foreground">{page}/{pageCount}</span>
            <Button variant="outline" size="sm" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>
              <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex h-11 items-center gap-3 border-b border-border px-4">
          <History size={14} className="text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="type-label font-semibold text-foreground">{t('canvas.editor.history.title')}</p>
            <p className="type-tiny text-muted-foreground">{t('canvas.editor.history.description')}</p>
          </div>
          <div className="flex items-center gap-2">
            <ListFilter size={14} className="text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as 'all' | CanvasRun['status'])}
              className="h-7 rounded-md border border-border bg-background px-2 type-label text-foreground outline-none"
            >
              <option value="all">{t('canvas.editor.history.allStatuses')}</option>
              <option value="running">{t('canvas.runStatus.running')}</option>
              <option value="pending">{t('canvas.runStatus.pending')}</option>
              <option value="done">{t('canvas.runStatus.done')}</option>
              <option value="failed">{t('canvas.runStatus.failed')}</option>
            </select>
            <span className="hidden type-caption text-muted-foreground sm:inline">{t('canvas.editor.history.runsCount', { count: total })}</span>
            <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
              <ChevronLeft size={12} />
            </Button>
            <span className="w-12 text-center type-caption text-muted-foreground">{page}/{pageCount}</span>
            <Button variant="outline" size="sm" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>
              <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      )}

      <div className={cn(embedded ? 'min-h-0 flex-1 overflow-auto' : 'h-[calc(100%-2.75rem)] overflow-auto')}>
        {isLoading && (
          <div className="flex h-24 items-center justify-center type-label text-muted-foreground">
            <Loader2 size={14} className="mr-2 animate-spin" />
            {t('canvas.editor.history.loading')}
          </div>
        )}
        {!isLoading && runs.length === 0 && (
          <div className="flex h-24 items-center justify-center type-label text-muted-foreground">{t('canvas.editor.history.empty')}</div>
        )}
        {!isLoading && runs.length > 0 && (
          compact ? (
            <div className="space-y-2 p-3">
              {runs.map((run) => (
                <button
                  key={run.ID}
                  onClick={() => onSelectRun(run.ID)}
                  className={cn(
                    'w-full rounded-lg border border-border bg-card p-3 text-left type-label transition-colors hover:border-foreground/25 hover:bg-muted/20',
                    activeRunId === run.ID && 'border-primary/50 bg-primary/5'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">#{run.ID}</span>
                    <RunStatusBadge status={run.status} />
                    <span className="ml-auto type-tiny text-muted-foreground">{formatRunTime(run.started_at ?? run.CreatedAt, i18n.language)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 type-caption text-muted-foreground">
                    <Clock3 size={12} />
                    <span>{formatRunDuration(run)}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span>{t('canvas.editor.history.snapshotSummary', { nodes: run.snapshot_node_count ?? 0, edges: run.snapshot_edge_count ?? 0 })}</span>
                  </div>
                  {(run.snapshot_hash || run.error) && (
                    <p className={cn('mt-1 truncate type-tiny', run.error ? 'text-destructive' : 'font-mono text-muted-foreground/70')} title={run.error || undefined}>
                      {run.error || run.snapshot_hash?.slice(0, 12)}
                    </p>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[96px_104px_112px_1fr_120px] border-b border-border bg-muted/25 px-4 py-2 type-caption font-medium text-muted-foreground">
                <span>{t('canvas.editor.history.run')}</span>
                <span>{t('canvas.editor.history.status')}</span>
                <span>{t('canvas.editor.history.duration')}</span>
                <span>{t('canvas.editor.history.snapshot')}</span>
                <span className="text-right">{t('canvas.editor.history.startedAt')}</span>
              </div>
              {runs.map((run) => (
                <button
                  key={run.ID}
                  onClick={() => onSelectRun(run.ID)}
                  className={cn(
                    'grid w-full grid-cols-[96px_104px_112px_1fr_120px] items-center border-b border-border px-4 py-2 text-left type-label transition-colors hover:bg-muted/40',
                    activeRunId === run.ID && 'bg-primary/5'
                  )}
                >
                  <span className="font-medium text-foreground">#{run.ID}</span>
                  <RunStatusBadge status={run.status} />
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock3 size={12} />
                    {formatRunDuration(run)}
                  </span>
                  <span className="min-w-0 truncate text-muted-foreground" title={run.error || undefined}>
                    {t('canvas.editor.history.snapshotSummary', { nodes: run.snapshot_node_count ?? 0, edges: run.snapshot_edge_count ?? 0 })}
                    {run.snapshot_hash && <span className="ml-2 font-mono type-tiny text-muted-foreground/70">{run.snapshot_hash.slice(0, 8)}</span>}
                    {run.error && <span className="ml-2 text-destructive">{run.error}</span>}
                  </span>
                  <span className="text-right text-muted-foreground">{formatRunTime(run.started_at ?? run.CreatedAt, i18n.language)}</span>
                </button>
              ))}
            </>
          )
        )}
      </div>
    </section>
  )
}

function WorkflowSidePanel({
  projectId,
  canvasId,
  dependencyBindings,
  activeTab,
  runs,
  total,
  page,
  pageCount,
  statusFilter,
  activeRunId,
  isLoading,
  onTabChange,
  onStatusFilterChange,
  onPageChange,
  onSelectRun,
}: {
  projectId?: number
  canvasId?: number | string
  dependencyBindings: ResourceBinding[]
  activeTab: 'resources' | 'history'
  runs: CanvasRun[]
  total: number
  page: number
  pageCount: number
  statusFilter: 'all' | CanvasRun['status']
  activeRunId: number | null
  isLoading: boolean
  onTabChange: (tab: 'resources' | 'history') => void
  onStatusFilterChange: (status: 'all' | CanvasRun['status']) => void
  onPageChange: (page: number) => void
  onSelectRun: (runId: number) => void
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(360)
  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    function onMove(moveEvent: PointerEvent) {
      const next = Math.min(520, Math.max(300, startWidth + startX - moveEvent.clientX))
      setWidth(next)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-l border-border bg-background py-3">
        <Button
          variant="ghost"
          size="icon-sm"
         
          onClick={() => setCollapsed(false)}
          title={t('canvas.editor.resourceShelf.title')}
        >
          <HardDrive size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
         
          onClick={() => {
            onTabChange('history')
            setCollapsed(false)
          }}
          title={t('canvas.editor.history.title')}
        >
          <History size={14} />
        </Button>
      </aside>
    )
  }
  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-border bg-background" style={{ width }}>
      <button
        type="button"
        className="absolute inset-y-0 left-0 z-10 flex w-2 cursor-ew-resize items-center justify-center text-muted-foreground hover:bg-muted/50"
        onPointerDown={startResize}
        title={t('canvas.editor.resizePanel', { defaultValue: '调整面板宽度' })}
      >
        <span className="h-10 w-0.5 rounded-full bg-border" />
      </button>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-4 pr-3">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-md border border-border type-label">
          <button
            onClick={() => onTabChange('resources')}
            className={cn('flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-1.5 transition-colors', activeTab === 'resources' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
          >
            <HardDrive size={12} />
            <span className="truncate">{t('canvas.editor.resourceShelf.title')}</span>
          </button>
          <button
            onClick={() => onTabChange('history')}
            className={cn('flex min-w-0 flex-1 items-center justify-center gap-1.5 border-l border-border px-2 py-1.5 transition-colors', activeTab === 'history' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
          >
            <History size={12} />
            <span className="truncate">{t('canvas.editor.history.title')}</span>
          </button>
        </div>
        <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setCollapsed(true)}>
          <ChevronRight size={14} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'resources' ? (
          <CanvasResourceShelf projectId={projectId} dependencyBindings={dependencyBindings} variant="side" />
        ) : (
          <WorkflowRunHistory
            embedded
            compact
            runs={runs}
            total={total}
            page={page}
            pageCount={pageCount}
            statusFilter={statusFilter}
            activeRunId={activeRunId}
            isLoading={isLoading}
            onStatusFilterChange={onStatusFilterChange}
            onPageChange={onPageChange}
            onSelectRun={onSelectRun}
          />
        )}
      </div>
    </aside>
  )
}

function TaskIOInspector({
  node,
  task,
  activeRun,
}: {
  node?: Node
  task?: CanvasTask
  activeRun?: CanvasRun
}) {
  const { t, i18n } = useTranslation()
  const inputs = parseTaskInputValues(task?.input_values)
  const outputs = parseTaskOutputValues(task?.output_values)
  const inputEntries = Object.entries(inputs).filter(([handle]) => handle !== '')
  const outputEntries = Object.entries(outputs)
  return (
    <section className="shrink-0 border-t border-border bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate type-label font-semibold text-foreground">
            {t('canvas.editor.taskInspector.title', { defaultValue: 'Task I/O' })}
          </p>
          <p className="truncate type-tiny text-muted-foreground">
            {activeRun
              ? t('canvas.editor.taskInspector.runLabel', { id: activeRun.ID, defaultValue: `Run #${activeRun.ID}` })
              : task
                ? t('canvas.editor.taskInspector.latestNodeTask', { defaultValue: 'Latest node run' })
                : t('canvas.editor.taskInspector.noRun', { defaultValue: 'No run selected' })}
          </p>
        </div>
        {task && <RunStatusBadge status={task.status as CanvasRun['status']} />}
      </div>

      {!task ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 type-label text-muted-foreground">
          {t('canvas.editor.taskInspector.empty', { defaultValue: 'Run this node or select a workflow run to inspect inputs and outputs.' })}
        </p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2 type-tiny text-muted-foreground">
            <div className="rounded border border-border bg-background px-2 py-1.5">
              <span className="block font-medium text-foreground">#{task.ID}</span>
              {task.node_label || task.node_id || t('canvas.editor.taskInspector.task', { defaultValue: 'Task' })}
            </div>
            <div className="rounded border border-border bg-background px-2 py-1.5 text-right">
              <span className="block font-medium text-foreground">{formatRunTime(task.CreatedAt, i18n.language)}</span>
              {t('canvas.editor.history.startedAt', { defaultValue: 'Started' })}
            </div>
          </div>
          {task.error && <p className="rounded-md bg-destructive/10 px-2 py-1.5 type-label text-destructive">{task.error}</p>}
          <TaskValueGroup
            title={t('canvas.editor.taskInspector.inputs', { defaultValue: 'Inputs' })}
            empty={t('canvas.editor.taskInspector.noInputs', { defaultValue: 'No recorded inputs' })}
            entries={inputEntries.map(([handle, values]) => ({
              handle,
              label: taskPortLabel(node, 'target', handle, t),
              values,
            }))}
          />
          <TaskValueGroup
            title={t('canvas.editor.taskInspector.outputs', { defaultValue: 'Outputs' })}
            empty={t('canvas.editor.taskInspector.noOutputs', { defaultValue: 'No recorded outputs' })}
            entries={outputEntries.map(([handle, value]) => ({
              handle,
              label: taskPortLabel(node, 'source', handle, t),
              values: [value],
            }))}
          />
        </div>
      )}
    </section>
  )
}

function TaskValueGroup({
  title,
  empty,
  entries,
}: {
  title: string
  empty: string
  entries: Array<{ handle: string; label: string; values: CanvasPortValue[] }>
}) {
  return (
    <div>
      <p className="mb-1 type-tiny font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {entries.length === 0 ? (
        <p className="rounded border border-border bg-background px-2 py-1.5 type-label text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <div key={entry.handle} className="rounded-md border border-border bg-background px-2 py-1.5">
              <div className="mb-1 flex items-center justify-between gap-2 type-tiny">
                <span className="truncate font-medium text-foreground">{entry.label}</span>
                <span className="font-mono text-muted-foreground">{entry.handle}</span>
              </div>
              <div className="space-y-1">
                {entry.values.map((value, index) => (
                  <div key={`${entry.handle}-${index}`} className="min-w-0 rounded bg-muted/40 px-2 py-1 type-caption text-muted-foreground">
                    <span className="mr-1 rounded border border-border bg-background px-1 py-0.5 font-mono type-tiny">{value.type}</span>
                    <span className="break-words">{canvasPortValueSummary(value) || 'empty'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WorkflowRunResultsDialog({
  run,
  nodes,
  onClose,
  onRemoveResource,
  removingResourceId,
}: {
  run: CanvasRun
  nodes: Node[]
  onClose: () => void
  onRemoveResource: (resourceId: number) => Promise<void>
  removingResourceId?: number
}) {
  const { t } = useTranslation()
  const [removedResourceIds, setRemovedResourceIds] = useState<number[]>([])
  const items = useMemo(() => workflowRunOutputItems(run, nodes, t), [run, nodes, t])

  async function handleRemove(resourceId: number) {
    try {
      await onRemoveResource(resourceId)
      setRemovedResourceIds((prev) => prev.includes(resourceId) ? prev : [...prev, resourceId])
    } catch {
      // Error toast is handled by the mutation owner.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="type-body font-semibold text-foreground">
              {t('canvas.editor.runResults.title', { id: run.ID, defaultValue: `Run #${run.ID} results` })}
            </h2>
            <p className="mt-1 type-label text-muted-foreground">
              {t('canvas.editor.runResults.description', { defaultValue: 'Outputs have been saved to the resource library. Review, download, or remove the items you do not want to keep.' })}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.close', { defaultValue: 'Close' })}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 type-body text-muted-foreground">
              {t('canvas.editor.runResults.empty', { defaultValue: 'This run did not produce workflow outputs.' })}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((item) => {
                const resource = item.resource
                const removed = !!resource && removedResourceIds.includes(resource.ID)
                const resourceUrl = resource ? `${API_BASE}${resource.url}` : undefined
                return (
                  <div key={item.key} className={cn('overflow-hidden rounded-lg border border-border bg-card', removed && 'opacity-55')}>
                    <div className="flex h-44 items-center justify-center bg-muted/35">
                      {removed ? (
                        <div className="type-label text-muted-foreground">{t('canvas.editor.runResults.removed', { defaultValue: 'Removed from resource library' })}</div>
                      ) : resource && item.value.type === 'image' ? (
                        <AuthedImage src={resourceUrl!} alt={item.label} className="h-full w-full object-contain" />
                      ) : resource && item.value.type === 'video' ? (
                        <AuthedVideo src={resourceUrl!} controls className="h-full w-full object-contain" />
                      ) : (
                        <pre className="max-h-full w-full overflow-auto whitespace-pre-wrap break-words p-3 type-label text-muted-foreground">
                          {canvasPortValuePreviewText(item.value) || t('common.empty', { defaultValue: 'Empty' })}
                        </pre>
                      )}
                    </div>
                    <div className="space-y-3 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate type-body font-medium text-foreground">{item.label}</span>
                          <Badge variant="outline" className="shrink-0 type-tiny">{item.value.type}</Badge>
                        </div>
                        <p className="mt-0.5 truncate type-caption text-muted-foreground">
                          {resource ? `#${resource.ID} · ${resource.name}` : item.key}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {resource && !removed && (
                          <Button asChild variant="outline" size="sm" className="flex-1">
                            <a href={resourceUrl} download={resource.name}>
                              <Download size={12} />
                              {t('common.download', { defaultValue: 'Download' })}
                            </a>
                          </Button>
                        )}
                        {resource && !removed && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-destructive hover:text-destructive"
                            disabled={removingResourceId === resource.ID}
                            onClick={() => handleRemove(resource.ID)}
                          >
                            {removingResourceId === resource.ID ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            {t('canvas.editor.runResults.remove', { defaultValue: 'Remove' })}
                          </Button>
                        )}
                        {(!resource || removed) && (
                          <Button variant="outline" size="sm" className="flex-1" disabled>
                            <CheckCircle2 size={12} />
                            {removed ? t('canvas.editor.runResults.removedAction', { defaultValue: 'Removed' }) : t('canvas.editor.runResults.saved', { defaultValue: 'Saved' })}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CanvasWorkspace({ canvasId, embedded = false, useAppHeader = false, onClose, pushTargets = [] }: CanvasWorkspaceProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const id = String(canvasId)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [canvasName, setCanvasName] = useState('')
  const [canvasType, setCanvasType] = useState<CanvasType>('inspiration')
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [libraryCollapsed, setLibraryCollapsed] = useState(true)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)

  // Workflow input dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [nodeRunDialog, setNodeRunDialog] = useState<{ nodeId: string; ports: CanvasPortDef[] } | null>(null)
  const [nodeRunValues, setNodeRunValues] = useState<Record<string, string>>({})
  const [activeRunId, setActiveRunId] = useState<number | null>(null)
  const [runHistoryPage, setRunHistoryPage] = useState(1)
  const [runStatusFilter, setRunStatusFilter] = useState<'all' | CanvasRun['status']>('all')
  const [workflowPanelTab, setWorkflowPanelTab] = useState<'resources' | 'history'>('resources')
  const [runResultDialogRunId, setRunResultDialogRunId] = useState<number | null>(null)
  const [removingRunResultResourceId, setRemovingRunResultResourceId] = useState<number | undefined>()
  const [clientPlugins, setClientPlugins] = useState<ClientPluginManifest[]>([])

  const fitViewCalledRef = useRef(false)
  const finalizedRunInvalidatedRef = useRef<number | null>(null)
  const pendingResultRunIdsRef = useRef<Set<number>>(new Set())
  const canvasPaneRef = useRef<HTMLDivElement>(null)
  const runHistoryPageSize = 8
  const setCanvasHeader = useCanvasHeaderStore((s) => s.setHeader)
  const resetCanvasHeader = useCanvasHeaderStore((s) => s.reset)

  // Load canvas
  const { data: canvas } = useQuery<Canvas>({
    queryKey: ['canvas', id],
    queryFn: () => api.get(`/canvases/${id}`).then((r) => r.data),
    enabled: !!id
  })
  const { data: canvasDependencyBindings = [] } = useQuery<ResourceBinding[]>({
    queryKey: ['canvas-dependencies', canvas?.project_id, id],
    queryFn: () => api.get(`/projects/${canvas!.project_id}/resource-bindings`, {
      params: {
        owner_type: 'canvas',
        owner_id: id,
      },
    }).then((r) => r.data),
    enabled: !!canvas?.project_id && !!id,
  })
  const { data: canvasNodeResourcePage } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['canvas-node-resources'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 200, type: 'image,video,text' } }).then((r) => r.data),
  })
  const canvasNodeResources = canvasNodeResourcePage?.items ?? []
  const referencedWorkflowCanvasIds = useMemo(() => {
    const ids = new Set<number>()
    nodes.forEach((node) => {
      if (node.type !== 'canvas') return
      const data = node.data as Partial<CanvasNodeData>
      if (data.referencedCanvasId) ids.add(data.referencedCanvasId)
    })
    return [...ids].sort((a, b) => a - b)
  }, [nodes])
  const referencedWorkflowCanvasQueries = useQueries({
    queries: referencedWorkflowCanvasIds.map((canvasId) => ({
      queryKey: ['canvas', canvasId],
      queryFn: () => api.get(`/canvases/${canvasId}`).then((r) => r.data as Canvas),
      enabled: !!canvasId,
    })),
  })
  const referencedWorkflowCanvasById = useMemo(() => {
    const map = new Map<number, Canvas>()
    referencedWorkflowCanvasQueries.forEach((query) => {
      if (query.data?.ID) map.set(query.data.ID, query.data)
    })
    return map
  }, [referencedWorkflowCanvasQueries])

  const { data: workflowRunsPage, isLoading: workflowRunsLoading } = useQuery<PaginatedResponse<CanvasRun>>({
    queryKey: ['canvas-runs', id, runHistoryPage, runStatusFilter],
    queryFn: () => api.get(`/canvases/${id}/runs`, {
      params: {
        page: runHistoryPage,
        page_size: runHistoryPageSize,
        ...(runStatusFilter !== 'all' ? { status: runStatusFilter } : {}),
      },
    }).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as PaginatedResponse<CanvasRun> | undefined
      return pendingResultRunIdsRef.current.size > 0 || data?.items?.some((run) => run.status === 'running' || run.status === 'pending') ? 2000 : false
    },
  })
  const workflowRuns = workflowRunsPage?.items ?? []
  const workflowRunTotal = workflowRunsPage?.total ?? 0
  const workflowRunPageCount = Math.max(1, Math.ceil(workflowRunTotal / runHistoryPageSize))
  const activeRun = workflowRuns.find((run) => run.ID === activeRunId) ?? workflowRuns[0]

  useEffect(() => {
    loadClientPlugins()
      .then(setClientPlugins)
      .catch(() => setClientPlugins([]))
  }, [])

  const { data: activeRunTasks = [] } = useQuery<CanvasTask[]>({
    queryKey: ['canvas-run-tasks', id, activeRunId],
    queryFn: () => api.get(`/canvases/${id}/runs/${activeRunId}/tasks`).then((r) => r.data),
    enabled: !!id && !!activeRunId,
    refetchInterval: activeRunId && workflowRuns.find((run) => run.ID === activeRunId && (run.status === 'done' || run.status === 'failed')) ? false : activeRunId ? 2000 : false,
  })

  const resultDialogRun = runResultDialogRunId
    ? workflowRuns.find((run) => run.ID === runResultDialogRunId) ?? (activeRun?.ID === runResultDialogRunId ? activeRun : undefined)
    : undefined

  const removeRunResultResource = useMutation({
    mutationFn: (resourceId: number) => api.delete(`/resources/${resourceId}`).then(() => resourceId),
    onMutate: (resourceId) => {
      setRemovingRunResultResourceId(resourceId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      qc.invalidateQueries({ queryKey: ['canvas-resource-shelf', 'resources'] })
      qc.invalidateQueries({ queryKey: ['canvas-runs', id] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.runResults.removeFailed', { defaultValue: 'Failed to remove resource' }))
    },
    onSettled: () => {
      setRemovingRunResultResourceId(undefined)
    },
  })

  const selectedNodeId = selectedNodeIds.length > 0 ? selectedNodeIds[selectedNodeIds.length - 1] : undefined
  const { data: latestSelectedNodeTask } = useQuery<CanvasTask | undefined>({
    queryKey: ['canvas-node-task', id, selectedNodeId],
    queryFn: () => api.get(`/canvases/${id}/nodes/${selectedNodeId}/task`, {
      validateStatus: (status) => status === 200 || status === 404,
    }).then((r) => r.status === 404 ? undefined : r.data),
    enabled: !!id && !!selectedNodeId,
    refetchInterval: (query) => {
      const status = (query.state.data as CanvasTask | undefined)?.status
      return status === 'pending' || status === 'running' ? 2000 : false
    },
    retry: (failureCount, error: any) => error?.response?.status === 404 ? false : failureCount < 2,
  })

  useEffect(() => {
    setRunHistoryPage(1)
  }, [runStatusFilter])

  useEffect(() => {
    if (canvasType !== 'workflow' || !activeRun) return
    if (activeRun.status !== 'done' || !activeRun.output_values) return
    if (!pendingResultRunIdsRef.current.has(activeRun.ID)) return
    pendingResultRunIdsRef.current.delete(activeRun.ID)
    setRunResultDialogRunId(activeRun.ID)
  }, [activeRun?.ID, activeRun?.output_values, activeRun?.status, canvasType])

  useEffect(() => {
    if (!canvas || activeRunTasks.length === 0) return
    const nodeIdByDbId = new Map((canvas.nodes ?? []).map((n) => [n.ID, n.node_id]))
    setNodes((prev) => prev.map((node) => {
      const task = activeRunTasks.find((t) => (t.node_id && t.node_id === node.id) || nodeIdByDbId.get(t.canvas_node_id) === node.id)
      if (!task) return node
      const d = node.data as unknown as CanvasNodeData
      return {
        ...node,
        data: {
          ...d,
          status: task.status,
          resourceId: resourceIdFromTask(task) ?? d.resourceId,
          resource: task.resource ?? d.resource,
          error: task.error,
        },
      }
    }))
    const isTerminal = activeRunTasks.every((t) => t.status === 'done' || t.status === 'failed')
    if (isTerminal && activeRunId && finalizedRunInvalidatedRef.current !== activeRunId) {
      finalizedRunInvalidatedRef.current = activeRunId
      qc.invalidateQueries({ queryKey: ['canvas-runs', id] })
    } else if (!isTerminal && activeRunId) {
      finalizedRunInvalidatedRef.current = null
    }
  }, [activeRunId, activeRunTasks, canvas, id, qc, setNodes])

  useEffect(() => {
    if (!canvas) return
    setCanvasName(canvas.name)
    setCanvasType(canvas.canvas_type ?? 'inspiration')
    const loadedNodes: Node[] = (canvas.nodes ?? []).map((n) => {
      const data: CanvasNodeData = n.data ? JSON.parse(n.data) : { source: 'upload' }
      const { _parentId, _style, ...cleanData } = data as any
      const node: Node = {
        id: n.node_id,
        type: n.type,
        position: { x: n.pos_x, y: n.pos_y },
        data: { ...cleanData, label: n.label },
        ...(n.type === 'group'
          ? { zIndex: -1, style: _style ?? { width: 320, height: 240 } }
          : { style: { width: (_style?.width ?? 200) } }),
        ...(_parentId && { parentId: _parentId }),
      }
      return node
    })
    // Groups must appear before their children in the array
    const groupNodes = loadedNodes.filter(n => n.type === 'group')
    const childNodes = loadedNodes.filter(n => n.type !== 'group')
    const loadedNodeById = new Map(loadedNodes.map((node) => [node.id, node]))
    const loadedEdges: Edge[] = uniqueEdgesByConnection((canvas.edges ?? []).map((e) => ({
      id: e.edge_id,
      source: e.source,
      target: e.target,
      sourceHandle: toUiHandleId(e.source_handle ?? defaultHandleForNode(loadedNodeById.get(e.source), 'source'), 'source'),
      targetHandle: toUiHandleId(e.target_handle ?? defaultHandleForNode(loadedNodeById.get(e.target), 'target'), 'target'),
    })))
    const nextNodes = (canvas.canvas_type ?? 'inspiration') === 'workflow'
      ? ensureFinalOutputNode([...groupNodes, ...childNodes], t)
      : [...groupNodes, ...childNodes]
    setNodes(nextNodes)
    setEdges(loadedEdges)

    if (!fitViewCalledRef.current && nextNodes.length > 0) {
      fitViewCalledRef.current = true
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80)
    }
  }, [canvas, t])

  // Poll running nodes
  useEffect(() => {
    const runningNodes = nodes.filter((n) => {
      const d = n.data as unknown as CanvasNodeData
      return d.status === 'running' || d.status === 'pending'
    })
    if (runningNodes.length === 0) return
    const timer = setInterval(async () => {
      for (const n of runningNodes) {
        try {
          const task: CanvasTask = await api.get(`/canvases/${id}/nodes/${n.id}/task`).then((r) => r.data)
          if (task.status === 'done' || task.status === 'failed') {
            const resource = task.resource
            const resourceId = resourceIdFromTask(task)
            setNodes((prev) => prev.map((node) => {
              if (node.id !== n.id) return node
              const d = node.data as unknown as CanvasNodeData
              return { ...node, data: { ...d, status: task.status, resourceId, resource, error: task.error } }
            }))
          }
        } catch (err: any) {
          if (err?.response?.status === 404) {
            setNodes((prev) => prev.map((node) => {
              if (node.id !== n.id) return node
              const d = node.data as unknown as CanvasNodeData
              return { ...node, data: { ...d, status: 'failed', error: t('canvas.editor.errors.nodeNotFound') } }
            }))
          }
        }
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [nodes, id, t])

  // Save
  const save = useMutation({
    mutationFn: () => {
      const nodesToSave = canvasType === 'workflow' ? ensureFinalOutputNode(nodes, t) : nodes
      const payload = {
        name: canvasName,
        nodes: nodesToSave.map((n) => {
          const { label, cardMode: _cardMode, pluginInputProperties: _pluginInputProperties, availableResources: _availableResources, referenceResources: _referenceResources, onRun, onUpdateContent, onUpdatePrompt, onUpdateOutputType, onUpdateModelId, onUpdateAttachments, onUpdateParams, onApprove, onReject, onPush, canvasId: _canvasId, rfNodeId: _rfNodeId, pendingRuntimeInputs: _pendingRuntimeInputs, ...rest } = n.data as any
          return {
            node_id: n.id,
            type: n.type,
            label: label ?? '',
            pos_x: n.position.x,
            pos_y: n.position.y,
            // embed parentId and style into data so they survive save/load
            data: JSON.stringify({
              ...rest,
              _parentId: n.parentId ?? undefined,
              _style: n.style,
            }),
          }
        }),
        edges: uniqueEdgesByConnection(edges).map((e) => ({
          edge_id: e.id,
          source: e.source,
          target: e.target,
          source_handle: fromUiHandleId(e.sourceHandle),
          target_handle: fromUiHandleId(e.targetHandle),
        })),
      }
      return api.put(`/canvases/${id}`, payload)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas', id] })
  })

  // Run all
  const runAll = useMutation({
    mutationFn: (values?: Record<string, CanvasPortValue>) => api.post(`/canvases/${id}/run`, { input_values: values ?? {} }).then((r) => r.data),
    onSuccess: (data) => {
      const runId = data?.run?.ID
      if (runId) {
        pendingResultRunIdsRef.current.add(runId)
        setActiveRunId(runId)
      }
      setRunStatusFilter('all')
      setRunHistoryPage(1)
      setWorkflowPanelTab('history')
      qc.invalidateQueries({ queryKey: ['canvas-runs', id] })
      setNodes((prev) => prev.map((n) => {
        const d = n.data as unknown as CanvasNodeData
        if (d.source === 'ai' || n.type === 'output' || n.type === 'resource_sink') return { ...n, data: { ...d, status: 'pending', error: undefined } }
        return n
      }))
    }
  })

  // Run single node
  const submitRunNode = useCallback(async (nodeId: string, values?: Record<string, CanvasPortValue>) => {
    try {
      await save.mutateAsync()
      const response = await api.post(`/canvases/${id}/nodes/${nodeId}/run`, { input_values: values ?? {} })
      qc.setQueryData(['canvas-node-task', id, nodeId], response.data)
      qc.invalidateQueries({ queryKey: ['canvas-node-task', id, nodeId] })
      qc.invalidateQueries({ queryKey: ['canvas-runs', id] })
      setNodes((prev) => prev.map((n) => {
        if (n.id !== nodeId) return n
        return { ...n, data: { ...n.data, status: 'pending', error: undefined } }
      }))
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || t('canvas.editor.errors.runFailed', { defaultValue: 'Failed to run node' })
      toast.error(message)
      setNodes((prev) => prev.map((n) => {
        if (n.id !== nodeId) return n
        return { ...n, data: { ...n.data, status: 'failed', error: message } }
      }))
    }
  }, [id, qc, save, t])

  const runNode = useCallback(async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (node?.type === 'input') {
      const port = portForWorkflowInputNode(node)
      const data = node.data as Partial<CanvasNodeData>
      setNodeRunValues({ [port.id]: data.inputValue ?? defaultRuntimeValueForPort(port) })
      setNodeRunDialog({ nodeId, ports: [port] })
      return
    }
    const ports = runtimeInputPortsForNode(node, edges)
    if (ports.length > 0) {
      setNodeRunValues(Object.fromEntries(ports.map((port) => [port.id, defaultRuntimeValueForPort(port)])))
      setNodeRunDialog({ nodeId, ports })
      return
    }
    await submitRunNode(nodeId)
  }, [edges, nodes, submitRunNode])

  const handleConfirmNodeRun = useCallback(async () => {
    if (!nodeRunDialog) return
    const encoded: Record<string, CanvasPortValue> = {}
    const runtimeInputText = nodeRunValues[nodeRunDialog.ports[0]?.id ?? ''] ?? ''
    for (const port of nodeRunDialog.ports) {
      const value = encodeRuntimePortValue(port, nodeRunValues[port.id] ?? '')
      if (!value) {
        toast.error(t('canvas.editor.errors.invalidRuntimeInput', { port: port.label ?? port.id, defaultValue: `Invalid input for ${port.label ?? port.id}` }))
        return
      }
      if (!hasValueForPort([value]) && port.required) {
        toast.error(t('canvas.editor.errors.requiredRuntimeInput', { port: port.label ?? port.id, defaultValue: `${port.label ?? port.id} is required` }))
        return
      }
      if (hasValueForPort([value])) encoded[port.id] = value
    }
    setNodeRunDialog(null)
    setNodeRunValues({})
    setNodes((prev) => prev.map((n) => {
      if (n.id === nodeRunDialog.nodeId && n.type === 'input') {
        return { ...n, data: { ...n.data, inputValue: runtimeInputText } }
      }
      return n
    }))
    await submitRunNode(nodeRunDialog.nodeId, encoded)
  }, [nodeRunDialog, nodeRunValues, setNodes, submitRunNode, t])

  const runLocalPluginNode = useCallback(async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    const data = node?.data as unknown as CanvasNodeData | undefined
    if (!node || !data?.pluginId) return

    setNodes((prev) => prev.map((n) => n.id === nodeId
      ? { ...n, data: { ...n.data, status: 'running', error: undefined } }
      : n
    ))

    try {
      let plugin = clientPlugins.find((p) => p.id === data.pluginId)
      if (!plugin) {
        const plugins = await loadClientPlugins()
        setClientPlugins(plugins)
        plugin = plugins.find((p) => p.id === data.pluginId)
      }
      if (!plugin) throw new Error(t('plugins.notFound'))

      const defaultArgs = Object.fromEntries(
        Object.entries(plugin.inputSchema?.properties ?? {})
          .filter(([, prop]) => prop.default !== undefined)
          .map(([key, prop]) => [key, prop.default])
      )
      const pluginArgs = {
        ...defaultArgs,
        ...((data.pluginArgs ?? {}) as Record<string, unknown>),
      }
      const executableSpec = await compileClientPlugin(plugin, pluginArgs)
      const result = await runClientPlugin(plugin, pluginArgs)
      const resultText = result.content?.map((item) => item.text ?? '').filter(Boolean).join('\n')
        || JSON.stringify(result.data ?? '')
      setNodes((prev) => prev.map((n) => n.id === nodeId
        ? {
            ...n,
            data: {
              ...n.data,
              status: result.isError ? 'failed' : 'done',
              error: result.isError ? resultText : undefined,
              pluginResultText: resultText,
              pluginResultData: result.data,
              pluginLastRunAt: new Date().toISOString(),
              executableSpec,
            },
          }
        : n
      ))
    } catch (err: any) {
      setNodes((prev) => prev.map((n) => n.id === nodeId
        ? { ...n, data: { ...n.data, status: 'failed', error: err?.message ?? String(err) } }
        : n
      ))
    }
  }, [clientPlugins, nodes, setNodes, t])

  // Handle workflow run: save first to ensure all nodes are persisted, then show input dialog if needed
  async function handleRunWorkflow() {
    try {
      await save.mutateAsync()
    } catch {
      return
    }
    const inputNodes = nodes.filter((n) => n.type === 'input')
    if (inputNodes.length > 0) {
      const initial: Record<string, string> = {}
      inputNodes.forEach((n) => {
        const data = n.data as Partial<CanvasNodeData>
        initial[n.id] = data.inputValue ?? defaultRuntimeValueForPort(portForWorkflowInputNode(n))
      })
      setInputValues(initial)
      setRunDialogOpen(true)
    } else {
      runAll.mutate({})
    }
  }

  function handleConfirmRun() {
    const encoded: Record<string, CanvasPortValue> = {}
    for (const node of inputNodes) {
      const port = portForWorkflowInputNode(node)
      const value = encodeRuntimePortValue(port, inputValues[node.id] ?? '')
      if (!value) {
        toast.error(t('canvas.editor.errors.invalidRuntimeInput', { port: port.label ?? node.id, defaultValue: `Invalid input for ${port.label ?? node.id}` }))
        return
      }
      if (!hasValueForPort([value]) && port.required) {
        toast.error(t('canvas.editor.errors.requiredRuntimeInput', { port: port.label ?? node.id, defaultValue: `${port.label ?? node.id} is required` }))
        return
      }
      if (hasValueForPort([value])) encoded[node.id] = value
    }
    setNodes((prev) => prev.map((n) => {
      if (n.type === 'input' && inputValues[n.id] !== undefined) {
        return { ...n, data: { ...n.data, inputValue: inputValues[n.id] } }
      }
      return n
    }))
    setRunDialogOpen(false)
    runAll.mutate(encoded)
  }

  // Approval
  function handleApprove(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'approved' })
  }
  function handleReject(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'rejected' })
  }

  async function handlePushResource(target: CanvasPushTarget, resourceId: number) {
    if (!canvas?.project_id) return
    try {
      if (target.kind === 'asset_slot') {
        await api.post(`/projects/${canvas.project_id}/entities/asset-slot-candidates`, {
          asset_slot_id: target.id,
          resource_id: resourceId,
          source_type: 'canvas',
          source_id: Number(canvas.ID),
          status: 'candidate',
          note: `由 Canvas 推送加入候选：${target.label}`,
        })
        invalidateAssetCandidateConsumers(qc, canvas.project_id)
        qc.invalidateQueries({ queryKey: ['canvas-resource-shelf', 'asset-slots', canvas.project_id] })
        toast.success('已加入素材候选')
      }
    } catch (err: any) {
      // Keep node execution state intact; users can retry pushing from the node.
      toast.error(err?.response?.data?.error || err?.message || '加入素材候选失败')
    }
  }

  const addNodeAt = useCallback((type: NodeType, clientPosition?: { x: number; y: number }) => {
    const fallbackRect = canvasPaneRef.current?.getBoundingClientRect()
    const screenPosition = clientPosition ?? (
      fallbackRect
        ? { x: fallbackRect.left + fallbackRect.width / 2, y: fallbackRect.top + fallbackRect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    )
    const position = screenToFlowPosition(screenPosition)
    const baseData = createNodeData(type, t)
    const newNode: Node = {
      id: genId(),
      type,
      position,
      data: { ...baseData },
      ...(type === 'group'
        ? { style: { width: 320, height: 240 }, zIndex: -1 }
        : { style: { width: 200 } }),
    }
    setNodes((prev) => [...prev, newNode])
  }, [screenToFlowPosition, t])

  const addResourceNodeAt = useCallback((resource: RawResource, clientPosition: { x: number; y: number }) => {
    const type = resourceToNodeType(resource)
    if (!type) {
      toast.error('暂不支持将该素材加入画布')
      return
    }
    const position = screenToFlowPosition(clientPosition)
    const baseData = createNodeData(type, t)
    const newNode: Node = {
      id: genId(),
      type,
      position,
      data: {
        ...baseData,
        label: resource.name,
        ...readOnlyMediaPortPatch('upload'),
        source: 'upload',
        resourceId: resource.ID,
        resource,
        status: 'done',
      },
      style: { width: type === 'text' ? 220 : 200 },
    }
    setNodes((prev) => [...prev, newNode])
  }, [screenToFlowPosition, setNodes, t])

  const addWorkflowReferenceNodeAt = useCallback(async (workflowCanvas: Canvas, clientPosition: { x: number; y: number }) => {
    if (String(workflowCanvas.ID) === id) {
      toast.error(t('canvas.editor.errors.selfReferenceWorkflow', { defaultValue: 'A canvas cannot reference itself.' }))
      return
    }
    try {
      const referencedCanvas = workflowCanvas.nodes
        ? workflowCanvas
        : await api.get(`/canvases/${workflowCanvas.ID}`).then((r) => r.data as Canvas)
      if ((referencedCanvas.canvas_type ?? 'inspiration') !== 'workflow') return
      const ports = deriveCanvasReferencePorts(referencedCanvas)
      const position = screenToFlowPosition(clientPosition)
      const baseData = createNodeData('canvas', t)
      const newNode: Node = {
        id: genId(),
        type: 'canvas',
        position,
        data: {
          ...baseData,
          label: referencedCanvas.name,
          source: 'ai',
          referencedCanvasId: referencedCanvas.ID,
          inputPorts: ports.inputs,
          outputPorts: ports.outputs,
        },
        style: { width: 220 },
      }
      setNodes((prev) => [...prev, newNode])
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.errors.workflowReferenceFailed', { defaultValue: 'Failed to add workflow reference.' }))
    }
  }, [id, screenToFlowPosition, setNodes, t])

  const addPluginNodeAt = useCallback((plugin: ClientPluginManifest, clientPosition?: { x: number; y: number }) => {
    const contribution = plugin.contributes?.canvasNodes?.[0]
    const fallbackRect = canvasPaneRef.current?.getBoundingClientRect()
    const screenPosition = clientPosition ?? (
      fallbackRect
        ? { x: fallbackRect.left + fallbackRect.width / 2, y: fallbackRect.top + fallbackRect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    )
    const position = screenToFlowPosition(screenPosition)
    const newNode: Node = {
      id: genId(),
      type: 'plugin_card',
      position,
      data: {
        source: 'manual',
        ...(contribution?.defaultData ?? {}),
        label: contribution?.title ?? plugin.name,
        pluginId: plugin.id,
        pluginName: plugin.name,
        pluginVersion: plugin.version,
        pluginRuntime: 'trusted_local',
        pluginArgs: {},
        inputPorts: contribution?.inputs,
        outputPorts: contribution?.outputs,
      },
      style: { width: 240 },
    }
    setNodes((prev) => [...prev, newNode])
  }, [screenToFlowPosition, setNodes])

  // Add node from context menu
  const addNode = useCallback((type: NodeType) => {
    if (!menu) return
    addNodeAt(type, { x: menu.x, y: menu.y })
  }, [addNodeAt, menu])

  // Delete selected nodes and their connected edges (also removes children of deleted groups)
  const deleteSelectedNodes = useCallback(() => {
    const directSelected = new Set(nodes.filter(n => n.selected && !isFinalOutputNode(n)).map(n => n.id))
    if (directSelected.size === 0) return
    // Also collect children of any selected group nodes
    const toDelete = new Set(directSelected)
    nodes.forEach(n => { if (n.parentId && toDelete.has(n.parentId)) toDelete.add(n.id) })
    setNodes(prev => prev.filter(n => !toDelete.has(n.id)))
    setEdges(prev => prev.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target)))
    setSelectedNodeIds([])
  }, [nodes, setNodes, setEdges])

  // Group selected nodes into a new group node
  const createGroupFromSelection = useCallback(() => {
    const selected = nodes.filter((n) => n.selected && n.type !== 'group')
    if (selected.length < 2) return
    const PAD = 40
    const minX = Math.min(...selected.map((n) => n.position.x)) - PAD
    const minY = Math.min(...selected.map((n) => n.position.y)) - PAD
    const maxX = Math.max(...selected.map((n) => n.position.x + (n.measured?.width ?? 208))) + PAD
    const maxY = Math.max(...selected.map((n) => n.position.y + (n.measured?.height ?? 80))) + PAD
    const groupId = genId()
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: minX, y: minY },
      style: { width: maxX - minX, height: maxY - minY },
      zIndex: -1,
      data: { source: 'manual', label: t('canvas.nodeLabels.group'), isGroup: true },
    }
    setNodes((prev) => [
      groupNode, // parent must come before children
      ...prev.map((n) => {
        if (!n.selected || n.type === 'group') return n
        // Convert to relative position, no extent:'parent' so nodes can be dragged out
        return {
          ...n,
          parentId: groupId,
          position: { x: n.position.x - minX, y: n.position.y - minY },
        }
      }),
    ])
  }, [nodes, t])

  // Drag node out of group → detach it
  const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    if (!draggedNode.parentId) return
    const parent = nodes.find(n => n.id === draggedNode.parentId)
    if (!parent) return
    const gw = (parent.style as any)?.width ?? 320
    const gh = (parent.style as any)?.height ?? 240
    const { x: nx, y: ny } = draggedNode.position
    const nw = draggedNode.measured?.width ?? 208
    const nh = draggedNode.measured?.height ?? 80
    // If the node's center is outside the group bounds, detach it
    const cx = nx + nw / 2
    const cy = ny + nh / 2
    if (cx < 0 || cy < 0 || cx > gw || cy > gh) {
      setNodes(prev => prev.map(n => {
        if (n.id !== draggedNode.id) return n
        return {
          ...n,
          parentId: undefined,
          position: {
            x: parent.position.x + draggedNode.position.x,
            y: parent.position.y + draggedNode.position.y,
          },
        }
      }))
    }
  }, [nodes])

  // Cmd+S to save
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save.mutate()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  // Track multi-selection
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const protectedIds = new Set(nodes.filter(isFinalOutputNode).map((node) => node.id))
    const filteredChanges = changes.filter((change) => change.type !== 'remove' || !protectedIds.has(change.id))
    onNodesChange(filteredChanges)
    setSelectedNodeIds((prev) => {
      const next = new Set(prev)
      filteredChanges.forEach((c) => {
        if (c.type === 'select') {
          if (c.selected) next.add(c.id)
          else next.delete(c.id)
        }
      })
      return [...next]
    })
  }, [nodes, onNodesChange])

  // Update node data
  const updateNodeData = useCallback((nodeId: string, patch: Partial<CanvasNodeData & { label: string }>) => {
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, ...patch } }
    }))
  }, [])

  useEffect(() => {
    if (referencedWorkflowCanvasById.size === 0) return
    setNodes((prev) => {
      let changed = false
      const next = prev.map((node) => {
        if (node.type !== 'canvas') return node
        const data = node.data as unknown as CanvasNodeData
        if (!data.referencedCanvasId) return node
        const referencedCanvas = referencedWorkflowCanvasById.get(data.referencedCanvasId)
        if (!referencedCanvas) return node
        const nextPorts = deriveCanvasReferencePorts(referencedCanvas)
        const currentSig = JSON.stringify({ inputs: data.inputPorts ?? [], outputs: data.outputPorts ?? [] })
        const nextSig = JSON.stringify(nextPorts)
        if (currentSig === nextSig) return node
        changed = true
        return {
          ...node,
          data: {
            ...data,
            inputPorts: nextPorts.inputs,
            outputPorts: nextPorts.outputs,
          },
        }
      })
      return changed ? next : prev
    })
  }, [referencedWorkflowCanvasById, setNodes])

  const onConnect = useCallback((params: Connection) => {
    const sourceNode = nodes.find((node) => node.id === params.source)
    const targetNode = nodes.find((node) => node.id === params.target)
    const sourceHandle = params.sourceHandle ?? toUiHandleId(defaultHandleForNode(sourceNode, 'source'), 'source') ?? null
    const targetHandle = params.targetHandle ?? toUiHandleId(defaultHandleForNode(targetNode, 'target'), 'target') ?? null
    const sourcePort = portForHandle(sourceNode, 'source', sourceHandle)
    const targetPort = portForHandle(targetNode, 'target', targetHandle)

    if (!sourcePort || !targetPort) {
      toast.error(
        t('canvas.editor.invalidConnection', { defaultValue: 'Invalid connection' }),
        t('canvas.editor.missingPortConnection', { defaultValue: 'This node does not accept that connection.' })
      )
      return
    }

    if (!arePortTypesCompatible(sourcePort.type, targetPort.type)) {
      toast.error(
        t('canvas.editor.invalidConnection', { defaultValue: 'Invalid connection' }),
        `${portLabel(sourcePort)} -> ${portLabel(targetPort)}`
      )
      return
    }

    if (targetPort?.maxCount && targetNode) {
      const targetPortId = fromUiHandleId(targetHandle)
      const existingCount = edges.filter((edge) => (
        edge.target === targetNode.id
        && (fromUiHandleId(edge.targetHandle) ?? defaultHandleForNode(targetNode, 'target') ?? null) === targetPortId
      )).length
      if (existingCount >= targetPort.maxCount) {
        toast.error(
          t('canvas.editor.portLimitReached', { defaultValue: 'Input port limit reached' }),
          `${targetPort.label ?? targetPort.id}: ${targetPort.maxCount}`
        )
        return
      }
    }

    const nextEdge: Edge = {
      ...params,
      id: makeEdgeId({ source: params.source, target: params.target, sourceHandle, targetHandle }),
      sourceHandle,
      targetHandle,
    }
    setEdges((eds) => eds.some((edge) => edgeConnectionKey(edge) === edgeConnectionKey(nextEdge))
      ? eds
      : addEdge(nextEdge, eds))
  }, [edges, nodes, setEdges, t])

  const onNodeClick = useCallback((_: React.MouseEvent, _node: Node) => {
    // Selection is handled by ReactFlow.
  }, [])

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  // Right-click on a selection (multi-select) → show context menu
  const onSelectionContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  // Right-click on a single node → show context menu
  const onNodeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropActive(false)
    const resourcePayload = e.dataTransfer.getData('application/canvas-resource')
    if (resourcePayload) {
      try {
        const resource = JSON.parse(resourcePayload) as RawResource
        addResourceNodeAt(resource, { x: e.clientX, y: e.clientY })
      } catch {
        // Ignore malformed drag data from outside the app.
      }
      return
    }
    const pluginPayload = e.dataTransfer.getData('application/canvas-plugin')
    if (pluginPayload) {
      try {
        const plugin = JSON.parse(pluginPayload) as ClientPluginManifest
        addPluginNodeAt(plugin, { x: e.clientX, y: e.clientY })
      } catch {
        // Ignore malformed drag data from outside the app.
      }
      return
    }
    const workflowCanvasPayload = e.dataTransfer.getData('application/canvas-workflow')
    if (workflowCanvasPayload) {
      const clientPosition = { x: e.clientX, y: e.clientY }
      try {
        const workflowCanvas = JSON.parse(workflowCanvasPayload) as Canvas
        void addWorkflowReferenceNodeAt(workflowCanvas, clientPosition)
      } catch {
        // Ignore malformed drag data from outside the app.
      }
      return
    }
    const type = e.dataTransfer.getData('application/canvas-node-type') as NodeType
    if (!type || !CANVAS_NODE_META[type]) return
    addNodeAt(type, { x: e.clientX, y: e.clientY })
  }, [addNodeAt, addPluginNodeAt, addResourceNodeAt, addWorkflowReferenceNodeAt])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/canvas-node-type') || e.dataTransfer.types.includes('application/canvas-resource') || e.dataTransfer.types.includes('application/canvas-plugin') || e.dataTransfer.types.includes('application/canvas-workflow')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropActive(true)
    }
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDropActive(false)
  }, [])

  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    setDraggingNodeId(node.id)
  }, [])

  const handleNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
    setDraggingNodeId(null)
    onNodeDragStop(event, node)
  }, [onNodeDragStop])

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const resourceById = new Map(canvasNodeResources.map((resource) => [resource.ID, resource]))
  const nodesWithHandlers = nodes.map((n) => {
    const data = n.data as unknown as CanvasNodeData
    const referenceResources: RawResource[] = []
    const seenReferenceResourceIds = new Set<number>()
    edges.forEach((edge) => {
      if (edge.target !== n.id) return
      const targetPort = portForHandle(n, 'target', edge.targetHandle)
      if (!targetPort || !['resource', 'image', 'video'].includes(targetPort.type)) return
      const sourceNode = nodeById.get(edge.source)
      const sourceData = sourceNode?.data as Partial<CanvasNodeData> | undefined
      const resource = sourceData?.resource ?? (sourceData?.resourceId ? resourceById.get(sourceData.resourceId) : undefined)
      if (!resource || seenReferenceResourceIds.has(resource.ID)) return
      seenReferenceResourceIds.add(resource.ID)
      referenceResources.push(resource)
    })
    const plugin = n.type === 'plugin_card' && data.pluginId
      ? clientPlugins.find((item) => item.id === data.pluginId)
      : undefined
    const hasPushableOutput = pushTargets.length > 0
      && (n.type === 'image' || n.type === 'video' || n.type === 'resource_sink')
      && data.status === 'done'
      && !!data.resourceId
    return {
      ...n,
      data: {
        ...n.data,
        canvasId: id,
        rfNodeId: n.id,
        availableResources: canvasNodeResources,
        referenceResources,
        ...(plugin?.inputSchema?.properties && { pluginInputProperties: plugin.inputSchema.properties }),
        onRun: n.type === 'plugin_card' ? () => runLocalPluginNode(n.id) : n.type !== 'group' ? () => runNode(n.id) : undefined,
        onUpdateContent: (content: string) => updateNodeData(n.id, { textContent: content }),
        onUpdatePrompt: (prompt: string) => updateNodeData(n.id, { prompt }),
        onUpdateOutputType: (outputType: string) => updateNodeData(n.id, { outputType } as any),
        onUpdateModelId: (modelId: string, modelDbId?: number) => updateNodeData(n.id, { modelId, modelDbId }),
        onUpdateAttachments: (ids: number[]) => updateNodeData(n.id, { inputResourceIds: ids }),
        onUpdateParams: (params: Record<string, unknown>) => updateNodeData(n.id, { params }),
        onApprove: () => handleApprove(n.id),
        onReject: () => handleReject(n.id),
        ...(hasPushableOutput && {
          onPush: () => handlePushResource(pushTargets[0], data.resourceId!),
        }),
      }
    }
  })

  const inputNodes = nodes.filter((n) => n.type === 'input')
  const selectedNode = selectedNodeIds.length > 0
    ? nodes.find((n) => n.id === selectedNodeIds[selectedNodeIds.length - 1])
    : undefined
  const selectedNodeData = selectedNode?.data as (CanvasNodeData & { label?: string }) | undefined
  const runningCount = nodes.filter((n) => {
    const d = n.data as unknown as CanvasNodeData
    return d.status === 'running' || d.status === 'pending'
  }).length
  const doneCount = nodes.filter((n) => (n.data as unknown as CanvasNodeData).status === 'done').length
  const workflowStats = {
    inputs: nodes.filter((n) => n.type === 'input').length,
    processors: nodes.filter((n) => (n.data as unknown as CanvasNodeData).source === 'ai').length,
    outputs: nodes.filter((n) => n.type === 'output').length,
  }
  const activeRunStatusLabel = activeRun ? t(`canvas.runStatus.${activeRun.status}`) : undefined
  const workflowRunningCount = workflowRuns.filter((run) => run.status === 'running' || run.status === 'pending').length
  const selectedNodeMeta = selectedNode?.type ? CANVAS_NODE_META[selectedNode.type as NodeType] : undefined
  const activeRunSelectedNodeTask = selectedNode
    ? activeRunTasks.find((task) => task.node_id === selectedNode.id)
    : undefined
  const selectedNodeTask = newestCanvasTask(activeRunSelectedNodeTask, latestSelectedNodeTask)
  const selectedNodeTaskRun = selectedNodeTask?.canvas_run_id && selectedNodeTask.canvas_run_id === activeRun?.ID
    ? activeRun
    : undefined

  useEffect(() => {
    if (!useAppHeader) return
    setCanvasHeader({
      active: true,
      canvasName,
      canvasType,
      nodeCount: nodes.length,
      runningCount,
      doneCount,
      inputCount: workflowStats.inputs,
      processorCount: workflowStats.processors,
      outputCount: workflowStats.outputs,
      activeRunLabel: canvasType === 'workflow' && activeRun && activeRunStatusLabel
        ? t('canvas.editor.activeRun', { id: activeRun.ID, status: activeRunStatusLabel })
        : undefined,
      workflowRunningCount,
      saving: save.isPending,
      startingRun: runAll.isPending,
      onNameChange: setCanvasName,
      onRun: handleRunWorkflow,
      onSave: () => save.mutate(),
    })
  }, [activeRun?.ID, activeRunStatusLabel, canvasName, canvasType, doneCount, nodes.length, resetCanvasHeader, runAll.isPending, runningCount, save, setCanvasHeader, t, useAppHeader, workflowRunningCount, workflowStats.inputs, workflowStats.outputs, workflowStats.processors])

  useEffect(() => {
    if (!useAppHeader) return
    return () => resetCanvasHeader()
  }, [resetCanvasHeader, useAppHeader])

  return (
    <div className={cn('flex flex-col bg-background text-foreground', embedded ? 'h-full' : 'h-screen')}>
      {!useAppHeader && <div className={cn('shrink-0 border-b border-border bg-card/95 px-3', embedded ? 'h-11' : 'h-14')}>
        <div className="flex h-full items-center gap-3">
          {embedded ? (
            <Badge variant="outline" className="h-7 shrink-0 gap-1.5 px-2 type-caption font-medium">
              {canvasType === 'workflow' ? <Zap size={12} /> : <Lightbulb size={12} />}
              {t(`canvas.editor.canvasType.${canvasType}`)}
            </Badge>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(ROUTES.canvases)} className="shrink-0">
              <ArrowLeft size={16} />
            </Button>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 border-none bg-transparent type-body font-semibold text-foreground outline-none"
                value={canvasName}
                onChange={(e) => setCanvasName(e.target.value)}
                placeholder={t('canvas.editor.untitled')}
              />
              <Badge variant="outline" className="hidden h-7 shrink-0 items-center gap-1 border-border font-medium leading-none text-muted-foreground sm:flex">
                <Workflow size={12} />
                {t('canvas.editor.nodesCount', { count: nodes.length })}
              </Badge>
              {runningCount > 0 && (
                <Badge variant="secondary" className="shrink-0 gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  {t('canvas.editor.runningCount', { count: runningCount })}
                </Badge>
              )}
              {canvasType === 'workflow' && activeRun && activeRunStatusLabel && (
                <Badge variant={activeRun.status === 'failed' ? 'destructive' : 'outline'} className="hidden shrink-0 gap-1 sm:flex">
                  {(activeRun.status === 'running' || activeRun.status === 'pending') && <Loader2 size={12} className="animate-spin" />}
                  {t('canvas.editor.activeRun', { id: activeRun.ID, status: activeRunStatusLabel })}
                </Badge>
              )}
              {canvasType === 'workflow' && workflowRunningCount > 1 && (
                <Badge variant="secondary" className="hidden shrink-0 sm:flex">
                  {t('canvas.editor.parallelRuns', { count: workflowRunningCount })}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 hidden items-center gap-2 type-caption text-muted-foreground md:flex">
              <span>{t('canvas.editor.stats.inputs', { count: workflowStats.inputs })}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{t('canvas.editor.stats.processors', { count: workflowStats.processors })}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{t('canvas.editor.stats.outputs', { count: workflowStats.outputs })}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{t('canvas.editor.stats.done', { count: doneCount })}</span>
            </div>
          </div>

          {!embedded && (
            <Badge variant="outline" className="h-8 shrink-0 gap-1.5 px-3 type-label font-medium">
              {canvasType === 'workflow' ? <Zap size={12} /> : <Lightbulb size={12} />}
              {t(`canvas.editor.canvasType.${canvasType}`)}
            </Badge>
          )}

          <Button onClick={handleRunWorkflow} disabled={runAll.isPending} size="sm" className="shrink-0">
            <Play size={12} /> {runAll.isPending ? t('canvas.editor.starting') : t('canvas.editor.startRun')}
          </Button>

          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm" variant="outline" className="shrink-0">
            {save.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>

          {embedded && onClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} className="shrink-0">
              <PanelRightClose size={14} />
            </Button>
          )}
        </div>
      </div>}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className={cn(
          'shrink-0 border-r border-border bg-sidebar transition-all duration-200',
          libraryCollapsed ? 'w-12' : 'w-72'
        )}>
          <div className="flex h-full flex-col">
            <div className={cn(
              'flex h-12 items-center border-b border-sidebar-border',
              libraryCollapsed ? 'justify-center px-0' : 'gap-2 px-3'
            )}>
              {!libraryCollapsed && <Layers3 size={14} className="shrink-0 text-muted-foreground" />}
              {!libraryCollapsed && <span className="flex-1 type-label font-semibold text-foreground">{t('canvas.editor.nodeLibrary')}</span>}
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={() => setLibraryCollapsed((v) => !v)}
              >
                {libraryCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </Button>
            </div>

            {libraryCollapsed ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
                <div className="space-y-2">
                  {SIDEBAR_NODE_CATEGORIES.map((category, index) => {
                    const items = CANVAS_NODE_CATALOG.filter((item) => item.category === category.id && !SIDEBAR_HIDDEN_NODE_TYPES.has(item.type))
                    return (
                      <div key={category.id} className={cn(index > 0 && 'border-t border-sidebar-border pt-2')}>
                        <div className="grid gap-1">
                          {items.map((item) => {
                            const Icon = item.icon
                            return (
                              <button
                                key={item.type}
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('application/canvas-node-type', item.type)
                                  e.dataTransfer.effectAllowed = 'copy'
                                }}
                                onClick={() => addNodeAt(item.type)}
                                className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
                                title={t(item.labelKey)}
                                aria-label={t(item.labelKey)}
                              >
                                <Icon size={14} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  {clientPlugins.length > 0 && (
                    <div className="border-t border-sidebar-border pt-2">
                      <div className="grid gap-1">
                        {clientPlugins.map((plugin) => (
                          <button
                            key={plugin.id}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/canvas-plugin', JSON.stringify(plugin))
                              e.dataTransfer.effectAllowed = 'copy'
                            }}
                            onClick={() => addPluginNodeAt(plugin)}
                            className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
                            title={plugin.name}
                            aria-label={plugin.name}
                          >
                            <Puzzle size={14} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 type-label text-muted-foreground">
                  <Search size={12} />
                  <span>{t('canvas.editor.nodeLibraryHint')}</span>
                </div>
                <div className="space-y-4">
                  {SIDEBAR_NODE_CATEGORIES.map((category) => {
                    const items = CANVAS_NODE_CATALOG.filter((item) => item.category === category.id && !SIDEBAR_HIDDEN_NODE_TYPES.has(item.type))
                    return (
                      <section key={category.id}>
                        <div className="mb-2">
                          <p className="type-caption font-semibold text-foreground">{t(category.titleKey)}</p>
                          <p className="type-tiny leading-relaxed text-muted-foreground">{t(category.descriptionKey)}</p>
                        </div>
                        <div className="grid gap-1.5">
                          {items.map((item) => {
                            const Icon = item.icon
                            return (
                              <button
                                key={item.type}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('application/canvas-node-type', item.type)
                                  e.dataTransfer.effectAllowed = 'copy'
                                }}
                                onClick={() => addNodeAt(item.type)}
                                className="group flex min-h-[54px] items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-foreground/25 hover:bg-background"
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                                  <Icon size={14} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate type-label font-medium text-foreground">{t(item.labelKey)}</span>
                                  <span className="block truncate type-tiny text-muted-foreground">{t(item.descriptionKey)}</span>
                                </span>
                                <GripVertical size={14} className="shrink-0 text-muted-foreground/45" />
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })}
                  <section>
                    <div className="mb-2">
                      <p className="type-caption font-semibold text-foreground">{t('canvas.catalog.categories.plugins.title')}</p>
                      <p className="type-tiny leading-relaxed text-muted-foreground">{t('canvas.catalog.categories.plugins.description')}</p>
                    </div>
                    <div className="grid gap-1.5">
                      {clientPlugins.length === 0 && (
                        <div className="rounded-md border border-dashed border-border bg-muted/25 px-3 py-3 type-caption leading-relaxed text-muted-foreground">
                          {t('canvas.pluginCard.noPlugins')}
                        </div>
                      )}
                      {clientPlugins.map((plugin) => (
                        <button
                          key={plugin.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/canvas-plugin', JSON.stringify(plugin))
                            e.dataTransfer.effectAllowed = 'copy'
                          }}
                          onClick={() => addPluginNodeAt(plugin)}
                          className="group flex min-h-[54px] items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-foreground/25 hover:bg-background"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                            <Puzzle size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate type-label font-medium text-foreground">{plugin.name}</span>
                            <span className="block truncate type-tiny text-muted-foreground">{plugin.description || t('canvas.pluginCard.localRuntime')}</span>
                          </span>
                          <GripVertical size={14} className="shrink-0 text-muted-foreground/45" />
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 overflow-hidden">
          <div
            ref={canvasPaneRef}
            className={cn(
              'relative min-h-0 flex-1 bg-background',
              dropActive && 'ring-2 ring-inset ring-primary/35'
            )}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <ReactFlow
              className="canvas-flow"
              nodes={nodesWithHandlers}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onNodeContextMenu={onNodeContextMenu}
              onSelectionContextMenu={onSelectionContextMenu}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={handleNodeDragStop}
              onPaneClick={() => setMenu(null)}
              onPaneContextMenu={onPaneContextMenu}
              nodeTypes={nodeTypes}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              minZoom={0.1}
              maxZoom={4}
              deleteKeyCode={['Delete', 'Backspace']}
              selectionOnDrag={true}
              panOnDrag={[1, 2]}
              selectionMode={SelectionMode.Partial}
              connectionMode={ConnectionMode.Loose}
              connectionRadius={40}
              defaultEdgeOptions={{
                type: 'default',
                markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
                style: { strokeWidth: 1.6 },
              }}
            >
              <Background gap={18} size={1} color="hsl(var(--border))" />
              <Controls position="bottom-left" />
              <MiniMap zoomable pannable position="bottom-right" nodeStrokeWidth={3} />
            </ReactFlow>

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
              <div className="max-w-sm rounded-lg border border-dashed border-border bg-background/80 p-5 text-center shadow-sm backdrop-blur">
                <Sparkles size={18} className="mx-auto mb-3 text-muted-foreground" />
                <p className="type-body font-medium text-foreground">{t('canvas.editor.emptyTitle')}</p>
                <p className="mt-1 type-label leading-relaxed text-muted-foreground">{t('canvas.editor.emptyDescription')}</p>
              </div>
            </div>
          )}

          {dropActive && (
            <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-primary/50 bg-primary/5 type-body font-medium text-primary">
              {t('canvas.editor.dropToPlace')}
            </div>
          )}

          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-2 type-label text-muted-foreground shadow-sm backdrop-blur">
            <MousePointer2 size={14} />
            {draggingNodeId
              ? t('canvas.editor.status.dragging')
              : selectedNode
                ? t('canvas.editor.status.selected', { label: selectedNodeData?.label || (selectedNodeMeta ? t(selectedNodeMeta.labelKey) : selectedNode.type) })
                : t('canvas.editor.status.idle')}
          </div>

          </div>

          <WorkflowSidePanel
            projectId={canvas?.project_id}
            canvasId={id}
            dependencyBindings={canvasDependencyBindings}
            activeTab={workflowPanelTab}
            runs={workflowRuns}
            total={workflowRunTotal}
            page={runHistoryPage}
            pageCount={workflowRunPageCount}
            statusFilter={runStatusFilter}
            activeRunId={activeRunId}
            isLoading={workflowRunsLoading}
            onTabChange={setWorkflowPanelTab}
            onStatusFilterChange={setRunStatusFilter}
            onPageChange={setRunHistoryPage}
            onSelectRun={setActiveRunId}
          />
        </div>

        <aside className={cn(
          'shrink-0 border-l border-border bg-background transition-all duration-200',
          inspectorCollapsed ? 'w-12' : 'w-80'
        )}>
          <div className="flex h-full flex-col">
            <div className={cn(
              'flex h-12 items-center border-b border-border',
              inspectorCollapsed ? 'justify-center px-0' : 'gap-2 px-3'
            )}>
              {!inspectorCollapsed && <PanelRightClose size={14} className="shrink-0 text-muted-foreground" />}
              {!inspectorCollapsed && <span className="flex-1 type-label font-semibold text-foreground">{t('canvas.editor.inspector')}</span>}
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={() => setInspectorCollapsed((v) => !v)}
              >
                {inspectorCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </Button>
            </div>

            {!inspectorCollapsed && (
              selectedNode ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <NodePanel
                      nodeId={selectedNode.id}
                      canvasId={Number(id)}
                      nodeType={selectedNode.type as NodeType}
                      data={selectedNode.data as unknown as CanvasNodeData}
                      label={(selectedNode.data as any).label || (selectedNodeMeta ? t(selectedNodeMeta.defaultLabelKey) : NODE_LABELS[selectedNode.type as NodeType])}
                      allNodes={nodes}
                      edges={edges}
                      onUpdate={updateNodeData}
                      onRun={selectedNode.type === 'plugin_card' ? runLocalPluginNode : runNode}
                      allowRun={selectedNode.type !== 'group'}
                    />
                  </div>
                  {canvasType === 'workflow' && (
                    <TaskIOInspector
                      node={selectedNode}
                      task={selectedNodeTask}
                      activeRun={selectedNodeTaskRun}
                    />
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col p-4 type-body">
                  <div className="rounded-lg border border-dashed border-border bg-muted/25 p-4">
                    <p className="type-body font-medium text-foreground">{t('canvas.editor.noSelectionTitle')}</p>
                    <p className="mt-1 type-label leading-relaxed text-muted-foreground">{t('canvas.editor.noSelectionDescription')}</p>
                  </div>
                  <div className="mt-4 space-y-2 type-label text-muted-foreground">
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span>{t('canvas.editor.currentSelection')}</span>
                      <span>{selectedNodeIds.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span>{t('canvas.editor.edgesCount')}</span>
                      <span>{edges.length}</span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </aside>
      </div>

      {resultDialogRun && (
        <WorkflowRunResultsDialog
          run={resultDialogRun}
          nodes={nodes}
          removingResourceId={removingRunResultResourceId}
          onRemoveResource={(resourceId) => removeRunResultResource.mutateAsync(resourceId).then(() => undefined)}
          onClose={() => setRunResultDialogRunId(null)}
        />
      )}

      {/* Context menu */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onAdd={addNode}
          onClose={() => setMenu(null)}
          selectedCount={nodes.filter((n) => n.selected && n.type !== 'group').length}
          onGroupSelected={createGroupFromSelection}
          onDeleteSelected={deleteSelectedNodes}
          hasSelection={nodes.some(n => n.selected)}
        />
      )}

      {/* Workflow input dialog */}
      {runDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl p-6 w-[420px] shadow-2xl space-y-4 border border-border">
            <div>
              <h2 className="type-body font-semibold text-foreground">{t('canvas.workflowInputTitle')}</h2>
              <p className="type-label text-muted-foreground mt-0.5">{t('canvas.editor.workflowInputDescription')}</p>
            </div>
            {inputNodes.map((n, index) => {
              const port = portForWorkflowInputNode(n)
              const label = port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)
              const value = inputValues[n.id] ?? ''
              return (
                <div key={n.id}>
                  <Label className="mb-1 flex items-center gap-1 type-label font-medium text-muted-foreground">
                    <span>{label}</span>
                    <span className="font-normal text-muted-foreground/70">({port.type})</span>
                  </Label>
                  {port.type === 'boolean' ? (
                    <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 type-label text-foreground">
                      <input
                        type="checkbox"
                        checked={value === 'true'}
                        onChange={(event) => setInputValues((prev) => ({ ...prev, [n.id]: event.target.checked ? 'true' : 'false' }))}
                        className="rounded"
                        autoFocus={index === 0}
                      />
                      {t('canvas.editor.booleanEnabled', { defaultValue: 'Enabled' })}
                    </label>
                  ) : port.type === 'number' ? (
                    <Input
                      type="number"
                      value={value}
                      onChange={(event) => setInputValues((prev) => ({ ...prev, [n.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  ) : port.type === 'json' ? (
                    <Textarea
                      rows={5}
                      className="font-mono type-label"
                      value={value}
                      onChange={(event) => setInputValues((prev) => ({ ...prev, [n.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  ) : port.type === 'image' || port.type === 'video' || port.type === 'resource' ? (
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      placeholder={t('canvas.editor.resourceIdPlaceholder', { defaultValue: 'Resource ID' })}
                      value={value}
                      onChange={(event) => setInputValues((prev) => ({ ...prev, [n.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  ) : (
                    <Textarea
                      rows={3}
                      placeholder={t('canvas.inputContentPlaceholder')}
                      value={value}
                      onChange={(event) => setInputValues((prev) => ({ ...prev, [n.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  )}
                </div>
              )
            })}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleConfirmRun} className="flex-1">
                {t('canvas.startRun')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setRunDialogOpen(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Single-node runtime input dialog */}
      {nodeRunDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex max-h-[80vh] w-[460px] flex-col rounded-xl border border-border bg-background p-6 shadow-2xl">
            <div className="shrink-0">
              <h2 className="type-body font-semibold text-foreground">{t('canvas.editor.nodeRuntimeInputTitle', { defaultValue: 'Runtime inputs' })}</h2>
              <p className="mt-0.5 type-label text-muted-foreground">
                {t('canvas.editor.nodeRuntimeInputDescription', { defaultValue: 'Provide values for unconnected input ports before running this node.' })}
              </p>
            </div>
            <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {nodeRunDialog.ports.map((port, index) => {
                const label = port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)
                const value = nodeRunValues[port.id] ?? ''
                return (
                  <div key={port.id}>
                    <Label className="mb-1 flex items-center gap-1 type-label font-medium text-muted-foreground">
                      <span>{label}</span>
                      <span className="font-normal text-muted-foreground/70">({port.type})</span>
                      {port.required && <span className="text-destructive">*</span>}
                    </Label>
                    {port.type === 'boolean' ? (
                      <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 type-label text-foreground">
                        <input
                          type="checkbox"
                          checked={value === 'true'}
                          onChange={(event) => setNodeRunValues((prev) => ({ ...prev, [port.id]: event.target.checked ? 'true' : 'false' }))}
                          className="rounded"
                          autoFocus={index === 0}
                        />
                        {t('canvas.editor.booleanEnabled', { defaultValue: 'Enabled' })}
                      </label>
                    ) : port.type === 'number' ? (
                      <Input
                        type="number"
                        value={value}
                        onChange={(event) => setNodeRunValues((prev) => ({ ...prev, [port.id]: event.target.value }))}
                        autoFocus={index === 0}
                      />
                    ) : port.type === 'json' ? (
                      <Textarea
                        rows={5}
                        className="font-mono type-label"
                        value={value}
                        onChange={(event) => setNodeRunValues((prev) => ({ ...prev, [port.id]: event.target.value }))}
                        autoFocus={index === 0}
                      />
                    ) : port.type === 'image' || port.type === 'video' || port.type === 'resource' ? (
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        placeholder={t('canvas.editor.resourceIdPlaceholder', { defaultValue: 'Resource ID' })}
                        value={value}
                        onChange={(event) => setNodeRunValues((prev) => ({ ...prev, [port.id]: event.target.value }))}
                        autoFocus={index === 0}
                      />
                    ) : (
                      <Textarea
                        rows={3}
                        value={value}
                        onChange={(event) => setNodeRunValues((prev) => ({ ...prev, [port.id]: event.target.value }))}
                        autoFocus={index === 0}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-5 flex shrink-0 gap-2">
              <Button onClick={handleConfirmNodeRun} className="flex-1">
                {t('shared.generation.runNode')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setNodeRunDialog(null)
                  setNodeRunValues({})
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CanvasEditorPage({ embeddedInShell = false }: { embeddedInShell?: boolean }) {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return (
    <ReactFlowProvider>
      <CanvasWorkspace canvasId={id} embedded={embeddedInShell} useAppHeader={embeddedInShell} />
    </ReactFlowProvider>
  )
}
