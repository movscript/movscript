import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronRight,
  Clapperboard,
  Copy,
  FilePlus2,
  FilePenLine,
  Frame,
  GitCompareArrows,
  Image,
  Layers3,
  Library,
  Link2,
  Search,
  Sparkles,
  Wand2,
  type LucideIcon,
} from 'lucide-react'

import {
  createContentSourceWorkspaceRuntime,
  type ContentSourceWorkspaceRuntimePort,
  type ContentSourceWorkspaceRuntimeState,
  type ContentSourceWorkspaceRuntimeStatus,
  type ContentSourceWorkspaceSnapshot,
} from '@movscript/core/content'
import {
  Badge,
  Button,
  Dialog,
  Input,
  ResourceDialogContent,
  ResourceDialogFooter,
  ResourceDialogText,
  ResourceDialogTitle,
} from '@movscript/ui'

import { api } from '@/shared/infrastructure/api'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/shared/ui/ResourceLibraryPicker'
import { toast } from '@/shared/ui/toastStore'
import type { PaginatedResponse, RawResource } from '@/types'

import {
  createContentSourceWorkspaceRuntimePort,
  fixtureContentSourceWorkspaceData,
  type ContentSourceWorkspaceData,
} from '../domain/contentSourceWorkspaceData'
import {
  addTargetForSelectedNode,
  appendChildNode,
  buildChildNodeId,
  buildChildNodePath,
  filterHierarchyTree,
  findHierarchyNode,
  getExpandableNodeIds,
  slugifyNodeTitle,
  type AddTarget,
} from '../domain/sourceWorkspaceTree'
import type {
  AudioCue,
  ChildStatus,
  EditableRef,
  ExpressionUnit,
  HierarchyTransition,
  HierarchyNode,
  HierarchyNodeType,
  PreviewAssetCandidate,
  PreviewAssetDownstream,
  PreviewAssetReferenceUnit,
  PreviewAssetUpstream,
  PreviewCandidate,
  PreviewContentUnit,
  PreviewMode,
  PreviewMoment,
  PreviewShot,
  RefStatus,
  SelectionState,
  SettingScopeAsset,
  SettingScopeDependency,
  SettingScopeDetails,
  ShotChildOption,
  ShotImpact,
  ShotWorkspaceDetails,
  StoryboardTimeline,
} from '../domain/sourceWorkspaceTypes'

import './ContentSourceWorkspacePage.css'

const stillSheetUrl = new URL('../assets/production-stills-sheet.png', import.meta.url).href
const candidateResourcePageSize = 12
const contentSourceWorkspaceDebugStorageKey = 'movscript.debug.contentWorkbench'

type ContentSourceWorkspaceDebugState = {
  projectId?: number
  runtimeState?: ContentSourceWorkspaceRuntimeState
  rawSnapshot?: ContentSourceWorkspaceSnapshot
  data?: ContentSourceWorkspaceData
  updatedAt: string
}

type ContentSourceWorkspaceDebugWindow = Window & {
  __MOVSCRIPT_CONTENT_WORKBENCH__?: ContentSourceWorkspaceDebugState
}

interface CandidateResourceSelection {
  resourceId: number
  resourceName: string
  resourceType: RawResource['type']
  resourceMimeType?: string
}

const emptyContentSourceWorkspaceData: ContentSourceWorkspaceData = {
  source: 'workspace',
  hierarchyTree: [],
  previewMoments: [],
  expressionUnitsByMoment: {},
  audioCuesByMoment: {},
  shotWorkspaceDetails: {},
  assetReferenceUnits: {},
  productionWorkPlan: undefined,
}
const emptyHierarchyNode: HierarchyNode = {
  id: 'empty',
  type: 'group',
  title: 'Empty workspace',
  path: '',
  children: [],
}

export default function ContentSourceWorkspacePage() {
  const projectId = useProjectStore((state) => state.current?.ID)
  const runtime = useMemo(() => createContentSourceWorkspaceRuntime({ port: createDebuggableContentSourceWorkspaceRuntimePort() }), [])
  const [runtimeState, setRuntimeState] = useState<ContentSourceWorkspaceRuntimeState>(() => runtime.getState())

  useEffect(() => runtime.subscribe(setRuntimeState), [runtime])

  useEffect(() => {
    if (!projectId) {
      runtime.showDemo(fixtureContentSourceWorkspaceData)
      return
    }
    runtime.loadProject(projectId).catch(() => undefined)
  }, [projectId, runtime])

  const workspaceData = runtimeState.data ?? emptyContentSourceWorkspaceData

  useEffect(() => {
    writeContentSourceWorkspaceDebug('normalized data', {
      projectId: runtimeState.projectId,
      runtimeState,
      data: workspaceData,
    })
  }, [runtimeState, workspaceData])

  const previewMoments = workspaceData.previewMoments
  const initialMoment = previewMoments[0]
  const initialShot = initialMoment?.shots[0]

  const [productionTree, setProductionTree] = useState<HierarchyNode[]>(workspaceData.hierarchyTree)
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [addTarget, setAddTarget] = useState<Pick<AddTarget, 'parentId' | 'type'> | null>(null)
  const [selectedMomentId, setSelectedMomentId] = useState(initialMoment?.id ?? '')
  const [selectedShotId, setSelectedShotId] = useState(initialShot?.id ?? '')
  const [selectedNodeId, setSelectedNodeId] = useState(initialShot?.id ?? workspaceData.hierarchyTree[0]?.id ?? '')
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set(getExpandableNodeIds(workspaceData.hierarchyTree)))
  const [mode, setMode] = useState<PreviewMode>('structure')
  const [query, setQuery] = useState('')
  const [selectionByShot, setSelectionByShot] = useState<Record<string, string>>(() => selectionByShotFromMoments(workspaceData.previewMoments))
  const [selectionByAsset, setSelectionByAsset] = useState<Record<string, string>>(() => selectionByAssetFromUnits(workspaceData.assetReferenceUnits))

  useEffect(() => {
    resetWorkspaceState(workspaceData)
  }, [workspaceData])

  const filteredMoments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return previewMoments.filter((moment) => {
      if (!normalizedQuery) return true
      return [
        moment.title,
        moment.path,
        moment.production,
        moment.segment,
        ...moment.settings,
        ...moment.shots.flatMap((shot) => [
          shot.title,
          shot.expression,
          shot.path,
          shot.contentUnit.id,
          shot.contentUnit.storyboardRef,
        ]),
      ].join(' ').toLowerCase().includes(normalizedQuery)
    })
  }, [previewMoments, query])
  const visibleTree = useMemo(() => filterHierarchyTree(productionTree, query), [productionTree, query])
  const selectedNode = findHierarchyNode(productionTree, selectedNodeId) ?? productionTree[0] ?? emptyHierarchyNode
  const selectedAddTarget = useMemo(
    () => addTargetForSelectedNode(selectedNode),
    [selectedNode],
  )

  const selectedMoment = filteredMoments.find((moment) => moment.id === selectedMomentId)
    ?? filteredMoments[0]
    ?? previewMoments[0]
  const selectedShot = selectedMoment?.shots.find((shot) => shot.id === selectedShotId) ?? selectedMoment?.shots[0]
  const selectedCandidateId = selectedShot ? selectionByShot[selectedShot.id] : ''

  function selectMoment(moment: PreviewMoment) {
    setSelectedMomentId(moment.id)
    setSelectedShotId(moment.shots[0]?.id ?? '')
    setSelectedNodeId(moment.id)
  }

  function selectCandidate(candidateId: string) {
    setSelectionByShot((current) => ({ ...current, [selectedShot.id]: candidateId }))
    selectContentUnitCandidate(selectedShot.contentUnit.id, candidateId)
  }

  function selectContentUnitCandidate(contentUnitId: string, candidateId: string) {
    setMode('select')
    runtime.selectCandidate({
      contentUnitId,
      candidateId,
    }).catch((error: unknown) => {
      console.error(error)
    })
  }

  function selectAssetCandidate(assetId: string, candidateId: string) {
    setSelectionByAsset((current) => ({ ...current, [assetId]: candidateId }))
    setMode('select')
    const unit = workspaceData.assetReferenceUnits[assetId]
    const candidate = unit?.candidates.find((item) => item.id === candidateId)
    if (!unit) return
    runtime.selectCandidate({
      contentUnitId: unit.contentUnitId,
      candidateId,
      resourceId: candidate?.resourceId,
    }).catch((error: unknown) => {
      console.error(error)
    })
  }

  function createCandidateForContentUnit(contentUnit: PreviewContentUnit, resource?: CandidateResourceSelection): Promise<void> {
    return runtime.createCandidate({
      contentUnitId: contentUnit.id,
      outputKind: contentUnit.outputKind,
      promptText: contentUnit.editPrompt,
      ...resource,
    })
      .then(() => undefined)
      .catch((error: unknown) => {
        throw error
      })
  }

  function createCandidateForAsset(assetId: string, resource?: CandidateResourceSelection): Promise<void> {
    const unit = workspaceData.assetReferenceUnits[assetId]
    if (!unit) return Promise.resolve()
    return runtime.createCandidate({
      contentUnitId: unit.contentUnitId,
      outputKind: unit.outputKind,
      promptText: unit.editPrompt,
      assetId,
      ...resource,
    })
      .then(() => undefined)
      .catch((error: unknown) => {
        throw error
      })
  }

  function updateAssetPrompt(assetId: string, text: string): Promise<void> {
    const unit = workspaceData.assetReferenceUnits[assetId]
    if (!unit) return Promise.resolve()
    return runtime.updateEditPrompt({
      contentUnitId: unit.contentUnitId,
      targetPath: unit.path,
      text,
      assetId,
    }).catch((error: unknown) => {
      throw error
    })
  }

  function updateContentUnitPrompt(contentUnitId: string, targetPath: string, text: string): Promise<void> {
    return runtime.updateEditPrompt({
      contentUnitId,
      targetPath,
      text,
    }).catch((error: unknown) => {
      throw error
    })
  }

  function updateExpressionUnit(unit: ExpressionUnit): Promise<void> {
    return runtime.updateExpressionUnit(unit).catch((error: unknown) => {
      throw error
    })
  }

  function updateAudioCue(cue: AudioCue): Promise<void> {
    return runtime.updateAudioCue(cue).catch((error: unknown) => {
      throw error
    })
  }

  function updateNodeTransition(nodeId: string, targetPath: string, transition: HierarchyTransition): Promise<void> {
    return runtime.updateTransition({
      nodeId,
      targetPath,
      transition,
    }).catch((error: unknown) => {
      throw error
    })
  }

  function updateStoryboardTimeline(nodeId: string, targetPath: string, timeline: StoryboardTimeline): Promise<void> {
    return runtime.updateStoryboardTimeline({
      nodeId,
      targetPath,
      timeline,
    }).catch((error: unknown) => {
      throw error
    })
  }

  function selectShot(momentId: string, shotId: string) {
    setSelectedMomentId(momentId)
    setSelectedShotId(shotId)
    setSelectedNodeId(shotId)
  }

  function jumpToNode(nodeId: string, momentId?: string, shotId?: string) {
    if (momentId) setSelectedMomentId(momentId)
    if (shotId) setSelectedShotId(shotId)
    setSelectedNodeId(nodeId)
  }

  function selectHierarchyNode(node: HierarchyNode) {
    setSelectedNodeId(node.id)
    if (node.momentId) setSelectedMomentId(node.momentId)
    if (node.shotId) setSelectedShotId(node.shotId)
  }

  function toggleHierarchyNode(nodeId: string) {
    setExpandedNodeIds((current) => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  function createChildNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = newNodeTitle.trim()
    if (!title || !addTarget) {
      cancelChildNodeCreation()
      return
    }
    const parentNode = findHierarchyNode(productionTree, addTarget.parentId)
    if (!parentNode) return
    const childType = addTarget.type
    const pathSlug = slugifyNodeTitle(title)
    const id = buildChildNodeId(parentNode, pathSlug, childType)
    const path = buildChildNodePath(parentNode, pathSlug, childType)
    const node: HierarchyNode = {
      id,
      type: childType,
      title,
      path,
      state: 'ready',
      children: [],
    }
    setProductionTree((current) => appendChildNode(current, parentNode.id, node))
    setExpandedNodeIds((current) => new Set([...current, parentNode.id]))
    setSelectedNodeId(id)
    setNewNodeTitle('')
    setAddTarget(null)
    setQuery('')
    runtime.createHierarchyNode({
      type: childType,
      id: pathSlug,
      title,
      targetPath: path,
      parentNode,
      node,
    }).catch((error: unknown) => {
      console.error(error)
    })
  }

  function cancelChildNodeCreation() {
    setNewNodeTitle('')
    setAddTarget(null)
  }

  function resetWorkspaceState(data: ContentSourceWorkspaceData) {
    const nextMoment = data.previewMoments[0]
    const nextShot = nextMoment?.shots[0]
    const nextTree = data.hierarchyTree
    const nextSelectedNodeId = data.previewMoments[0]?.shots[0]?.id ?? nextTree[0]?.id ?? ''
    setProductionTree(nextTree)
    setExpandedNodeIds(new Set(getExpandableNodeIds(nextTree)))
    setSelectedMomentId(nextMoment?.id ?? '')
    setSelectedShotId(nextShot?.id ?? '')
    setSelectedNodeId(nextSelectedNodeId)
    setSelectionByShot(selectionByShotFromMoments(data.previewMoments))
    setSelectionByAsset(selectionByAssetFromUnits(data.assetReferenceUnits))
    setNewNodeTitle('')
    setAddTarget(null)
    setQuery('')
  }

  function startAddForSelection() {
    if (!selectedAddTarget) return
    setAddTarget({ parentId: selectedAddTarget.parentId, type: selectedAddTarget.type })
    setExpandedNodeIds((current) => new Set([...current, selectedAddTarget.parentId]))
    setNewNodeTitle('')
    setQuery('')
  }

  if (!runtimeState.data || runtimeState.status === 'loading' || runtimeState.status === 'idle' || runtimeState.status === 'error' || runtimeState.status === 'empty' || !selectedMoment || !selectedShot) {
    return (
      <ContentSourceWorkspaceStatusShell
        status={runtimeState.status}
        error={runtimeState.error}
        projectId={projectId}
        onRetry={() => {
          if (projectId) runtime.loadProject(projectId).catch(() => undefined)
          else runtime.showDemo(fixtureContentSourceWorkspaceData)
        }}
      />
    )
  }

  const inspectorLinkedChild = findChildForNode(workspaceData, selectedNode, selectedShot)

  return (
    <main className="content-source-workspace content-source-workspace--source-workspace" data-testid="content-source-workspace-page">
      <aside className="content-source-workspace-nav">
        <div className="content-source-workspace-nav__search">
          <Search size={14} />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索层级节点或源文件" />
          <button
            type="button"
            className="content-source-workspace-nav__add"
            disabled={!selectedAddTarget}
            title={selectedAddTarget ? `在 ${selectedAddTarget.parentTitle} 中添加 ${nodeTypeLabel(selectedAddTarget.type)}` : '当前层级不可添加'}
            aria-label={selectedAddTarget ? `添加 ${nodeTypeLabel(selectedAddTarget.type)}` : '当前层级不可添加'}
            onClick={startAddForSelection}
          >
            <FilePlus2 size={14} />
          </button>
        </div>
        <div className="content-source-workspace-nav__tree">
          <HierarchyTree
            nodes={visibleTree}
            selectedNodeId={selectedNode.id}
            expandedNodeIds={expandedNodeIds}
            addTarget={addTarget}
            newNodeTitle={newNodeTitle}
            onSelect={selectHierarchyNode}
            onToggle={toggleHierarchyNode}
            onTitleChange={setNewNodeTitle}
            onCreateChild={createChildNode}
            onCancelAdd={cancelChildNodeCreation}
          />
        </div>
        <div className="content-source-workspace-nav__selection">
          <span>当前节点</span>
          <strong>{nodeTypeLabel(selectedNode.type)} · {selectedNode.title}</strong>
          {runtimeState.error ? <small>{runtimeState.error}</small> : null}
        </div>
      </aside>

      <section className="content-source-workspace__stage">
        <HierarchyContentView
          node={selectedNode}
          workspaceData={workspaceData}
          moments={filteredMoments}
          selectedMoment={selectedMoment}
          selectedShot={selectedShot}
          onSelectShot={selectShot}
          onJumpToNode={jumpToNode}
        />
      </section>

      <aside className="content-source-workspace-inspector" aria-label="内容单元控制台">
        <div className="content-source-workspace-inspector__header">
          <div>
            <span className="content-source-workspace__eyebrow">Inspector</span>
            <h2>编辑与选择</h2>
            <p>{nodeTypeLabel(selectedNode.type)} · {selectedNode.title}</p>
          </div>
          {selectedNode.state ? <Badge variant={selectedNode.state === 'current' || selectedNode.state === 'selected' ? 'outline' : 'soft'}>{stateLabel(selectedNode.state)}</Badge> : null}
        </div>
        <NodeFocusDeck
          node={selectedNode}
          workspaceData={workspaceData}
          currentMoment={selectedMoment}
          selectedShot={selectedShot}
          linkedContentUnit={inspectorLinkedChild?.contentUnit}
          selectedCandidateId={selectedCandidateId}
          selectedAssetCandidateId={selectionByAsset[selectedNode.id] ?? ''}
          onSelectCandidate={selectCandidate}
          onSelectContentUnitCandidate={selectContentUnitCandidate}
          onSelectAssetCandidate={selectAssetCandidate}
          onCreateContentUnitCandidate={createCandidateForContentUnit}
          onCreateAssetCandidate={createCandidateForAsset}
          onUpdateAssetPrompt={updateAssetPrompt}
          onUpdateContentUnitPrompt={updateContentUnitPrompt}
        />
      </aside>
    </main>
  )
}

function createDebuggableContentSourceWorkspaceRuntimePort(): ContentSourceWorkspaceRuntimePort {
  const port = createContentSourceWorkspaceRuntimePort()
  return {
    ...port,
    async loadSnapshot(projectId) {
      const snapshot = await port.loadSnapshot(projectId)
      writeContentSourceWorkspaceDebug('raw snapshot', {
        projectId,
        rawSnapshot: snapshot,
      })
      return snapshot
    },
  }
}

function writeContentSourceWorkspaceDebug(
  label: string,
  patch: Partial<Omit<ContentSourceWorkspaceDebugState, 'updatedAt'>>,
) {
  if (!isContentSourceWorkspaceDebugEnabled()) return
  const debugWindow = window as ContentSourceWorkspaceDebugWindow
  const nextState: ContentSourceWorkspaceDebugState = {
    ...debugWindow.__MOVSCRIPT_CONTENT_WORKBENCH__,
    ...cloneDebugValue(patch),
    updatedAt: new Date().toISOString(),
  }
  debugWindow.__MOVSCRIPT_CONTENT_WORKBENCH__ = nextState

  console.groupCollapsed(`[content-workbench] ${label}`)
  console.log(nextState)
  console.groupEnd()
}

function isContentSourceWorkspaceDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    const flag = window.localStorage.getItem(contentSourceWorkspaceDebugStorageKey)
    return params.has('debugContentWorkbench') || flag === '1' || flag === 'true'
  } catch {
    return false
  }
}

function cloneDebugValue<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value)) as T
    } catch {
      return value
    }
  }
}

function selectionByShotFromMoments(moments: PreviewMoment[]): Record<string, string> {
  return Object.fromEntries(
    moments.flatMap((moment) =>
      moment.shots.map((shot) => [
        shot.id,
        shot.contentUnit.candidates.find((candidate) => candidate.selected)?.id ?? '',
      ]),
    ),
  )
}

function selectionByAssetFromUnits(units: Record<string, PreviewAssetReferenceUnit>): Record<string, string> {
  return Object.fromEntries(
    Object.values(units).map((unit) => [
      unit.assetId,
      unit.candidates.find((candidate) => candidate.selected)?.id ?? '',
    ]),
  )
}

function ContentSourceWorkspaceStatusShell({
  status,
  error,
  projectId,
  onRetry,
}: {
  status: ContentSourceWorkspaceRuntimeStatus
  error?: string
  projectId?: number
  onRetry: () => void
}) {
  return (
    <main className="content-source-workspace content-source-workspace--source-workspace" data-testid="content-source-workspace-page">
      <aside className="content-source-workspace-nav">
        <div className="content-source-workspace-nav__header" />
      </aside>
      <section className="content-source-workspace__stage">
        <div className="content-source-workspace-board">
          <section className="content-source-workspace-entity-view">
            <div className="content-source-workspace-entity-view__header">
              <div>
                <span className="content-source-workspace__eyebrow">{projectId ? `Project ${projectId}` : 'Demo mode'}</span>
                <h3>{statusShellTitle(status)}</h3>
                <p>{error ?? statusShellCopy(status)}</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                <GitCompareArrows size={13} />
                {status === 'loading' ? '加载中' : '重试'}
              </Button>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

function statusShellTitle(status: ContentSourceWorkspaceRuntimeStatus): string {
  switch (status) {
    case 'loading':
      return '正在读取真实内容编排数据'
    case 'empty':
      return '当前项目还没有内容编排数据'
    case 'error':
      return '内容编排数据读取失败'
    case 'demo':
      return '演示内容'
    case 'ready':
      return '内容编排已加载'
    case 'idle':
      return '等待项目上下文'
  }
}

function statusShellCopy(status: ContentSourceWorkspaceRuntimeStatus): string {
  switch (status) {
    case 'loading':
      return '正在从 workspace index 和 interpreted artifacts 组装当前项目视图。'
    case 'empty':
      return '没有找到 production、scene moment、shot 或 content unit。'
    case 'error':
      return '读取失败后不会回退到演示数据，避免把假内容当作真实项目。'
    case 'demo':
      return '当前没有打开项目，显示显式演示内容。'
    case 'ready':
      return '当前页面绑定的是真实 workspace 数据。'
    case 'idle':
      return '请选择或打开一个项目。'
  }
}

function shotWorkspaceFor(data: ContentSourceWorkspaceData, shotId: string): ShotWorkspaceDetails {
  return data.shotWorkspaceDetails[shotId] ?? {
    settings: [],
    assets: [],
    keyframes: [],
    storyboards: [],
    impacts: [],
  }
}

function PreviewMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) {
  return (
    <div className="content-source-workspace-overview__metric">
      <Icon size={15} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function HierarchyTree({
  nodes,
  selectedNodeId,
  expandedNodeIds,
  addTarget,
  newNodeTitle,
  onSelect,
  onToggle,
  onTitleChange,
  onCreateChild,
  onCancelAdd,
  depth = 0,
}: {
  nodes: HierarchyNode[]
  selectedNodeId: string
  expandedNodeIds: Set<string>
  addTarget: { parentId: string; type: HierarchyNodeType } | null
  newNodeTitle: string
  onSelect: (node: HierarchyNode) => void
  onToggle: (nodeId: string) => void
  onTitleChange: (title: string) => void
  onCreateChild: (event: FormEvent<HTMLFormElement>) => void
  onCancelAdd: () => void
  depth?: number
}) {
  return (
    <div className="content-source-workspace-hierarchy" data-depth={depth}>
      {nodes.map((node) => {
        const hasChildren = Boolean(node.children?.length)
        const isExpanded = expandedNodeIds.has(node.id)
        const isAddingHere = addTarget?.parentId === node.id
        return (
          <div key={node.id} className="content-source-workspace-hierarchy__branch" data-depth={depth}>
            <div
              role="button"
              tabIndex={0}
              className="content-source-workspace-hierarchy-node"
              data-active={selectedNodeId === node.id}
              data-node-id={node.id}
              data-type={node.type}
              style={{ '--tree-depth': depth } as CSSProperties}
              onClick={() => onSelect(node)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(node)
              }}
            >
              <span
                className="content-source-workspace-hierarchy-node__toggle"
                data-visible={hasChildren}
                data-expanded={isExpanded}
                onClick={(event) => {
                  event.stopPropagation()
                  if (hasChildren) onToggle(node.id)
                }}
              >
                {hasChildren ? <ChevronRight size={12} /> : null}
              </span>
              <span className="content-source-workspace-hierarchy-node__kind">{nodeTypeBadge(node.type)}</span>
              <span className="content-source-workspace-hierarchy-node__copy">
                <strong>{node.title}</strong>
              </span>
              {shouldShowTreeState(node.state) ? <em data-status={node.state}>{stateLabel(node.state)}</em> : null}
            </div>
            {isAddingHere ? (
              <HierarchyAddForm
                childType={addTarget.type}
                title={newNodeTitle}
                onTitleChange={onTitleChange}
                onCreateChild={onCreateChild}
                onCancelAdd={onCancelAdd}
              />
            ) : null}
            {hasChildren && isExpanded ? (
              <div className="content-source-workspace-hierarchy__children">
                <HierarchyTree
                  nodes={node.children ?? []}
                  selectedNodeId={selectedNodeId}
                  expandedNodeIds={expandedNodeIds}
                  addTarget={addTarget}
                  newNodeTitle={newNodeTitle}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  onTitleChange={onTitleChange}
                  onCreateChild={onCreateChild}
                  onCancelAdd={onCancelAdd}
                  depth={depth + 1}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function HierarchyAddForm({
  childType,
  title,
  onTitleChange,
  onCreateChild,
  onCancelAdd,
}: {
  childType: HierarchyNodeType
  title: string
  onTitleChange: (title: string) => void
  onCreateChild: (event: FormEvent<HTMLFormElement>) => void
  onCancelAdd: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [])

  return (
    <form
      className="content-source-workspace-hierarchy-add"
      onSubmit={onCreateChild}
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        const nextFocusedNode = event.relatedTarget instanceof Node ? event.relatedTarget : null
        if (!nextFocusedNode || !event.currentTarget.contains(nextFocusedNode)) onCancelAdd()
      }}
    >
      <Input
        ref={inputRef}
        data-testid="content-source-workspace-inline-title-input"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancelAdd()
          }
        }}
        placeholder={`输入 ${nodeTypeLabel(childType)} 标题`}
      />
      <Button type="submit" size="sm" aria-label="确认添加">
        <Check size={13} />
      </Button>
    </form>
  )
}

function HierarchyContentView({
  node,
  workspaceData,
  moments,
  selectedMoment,
  selectedShot,
  onSelectShot,
  onJumpToNode,
}: {
  node: HierarchyNode
  workspaceData: ContentSourceWorkspaceData
  moments: PreviewMoment[]
  selectedMoment: PreviewMoment
  selectedShot: PreviewShot
  onSelectShot: (momentId: string, shotId: string) => void
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  const linkedChild = findChildForNode(workspaceData, node, selectedShot)
  const linkedContentUnit = linkedChild?.contentUnit
  const workspace = shotWorkspaceFor(workspaceData, selectedShot.id)
  const currentMoment = node.type === 'scene_moment' || node.type === 'group'
    ? moments.find((moment) => moment.id === (node.momentId ?? node.id)) ?? selectedMoment
    : selectedMoment
  const currentExpressionUnits = workspaceData.expressionUnitsByMoment[currentMoment.id] ?? []
  const currentAudioCues = workspaceData.audioCuesByMoment[currentMoment.id] ?? []
  const selectedExpressionUnit = currentExpressionUnits.find((unit) => unit.id === node.id)
  const selectedAudioCue = currentAudioCues.find((cue) => cue.id === node.id)

  return (
    <div className="content-source-workspace-board">
      <section className="content-source-workspace-entity-view">
        <div className="content-source-workspace-entity-view__header">
          <div>
            <span className="content-source-workspace__eyebrow">{nodeTypeLabel(node.type)} View</span>
            <h3>{node.title}</h3>
            {node.type !== 'asset' ? <p>{nodeDisplayMeta(node)}</p> : null}
          </div>
          <div className="content-source-workspace-entity-view__badges">
            {node.state ? <Badge variant={node.state === 'current' || node.state === 'selected' ? 'outline' : 'soft'}>{stateLabel(node.state)}</Badge> : null}
          </div>
        </div>

        <NodePreviewSelectionWorkspace node={node} workspaceData={workspaceData} selectedShot={selectedShot} linkedContentUnit={linkedContentUnit} linkedChild={linkedChild} />

        <section className="content-source-workspace-entity-section content-source-workspace-entity-section--supporting">
          <div className="content-source-workspace-entity-section__title">
            <span className="content-source-workspace__eyebrow">Supporting Detail</span>
            <strong>结构上下文</strong>
          </div>
          {node.type === 'production' || node.type === 'segment' ? (
            <PreviewPacket icon={Layers3} title="Scene Moments" meta={`${moments.length} moments`}>
              <PreviewList items={moments.map((moment) => `${selectionStateText(moment.selectionState)} · ${moment.title}`)} />
            </PreviewPacket>
          ) : null}
          {node.type === 'scene_moment' ? (
            <div className="content-source-workspace-entity-split">
              <PreviewPacket icon={Clapperboard} title="Shots" meta={`${currentMoment.shots.length} shots`}>
                <ShotCardRow workspaceData={workspaceData} moment={currentMoment} selectedShot={selectedShot} onSelectShot={onSelectShot} />
              </PreviewPacket>
              <PreviewPacket icon={Sparkles} title="Expression Units" meta={`${currentExpressionUnits.length} units`}>
                <ExpressionUnitList items={currentExpressionUnits} />
              </PreviewPacket>
              <PreviewPacket icon={Sparkles} title="Audio Cues" meta={`${currentAudioCues.length} cues`}>
                <AudioCueList items={currentAudioCues} />
              </PreviewPacket>
            </div>
          ) : null}
          {node.type === 'group' ? (
            <GroupRelationView
              node={node}
              workspaceData={workspaceData}
              currentMoment={currentMoment}
              selectedShot={selectedShot}
              onSelectShot={onSelectShot}
            />
          ) : null}
          {node.type === 'setting' || node.type === 'state' ? (
            <SettingScopeDetail node={node} workspaceData={workspaceData} onJumpToNode={onJumpToNode} />
          ) : null}
          {node.type === 'shot' ? (
            <div className="content-source-workspace-entity-split">
              <PreviewPacket icon={Frame} title="Keyframes" meta={`${workspace.keyframes.length} options`}>
                <ShotChildList items={workspace.keyframes} stillPosition={selectedShot.stillPosition} />
              </PreviewPacket>
              <PreviewPacket icon={Image} title="Storyboards" meta={`${workspace.storyboards.length} options`}>
                <ShotChildList items={workspace.storyboards} stillPosition={selectedShot.stillPosition} />
              </PreviewPacket>
            </div>
          ) : null}
          {node.type === 'keyframe' || node.type === 'storyboard' ? (
            <PreviewPacket icon={GitCompareArrows} title="Referenced By" meta={selectedShot.id}>
              <ImpactList impacts={workspace.impacts} />
            </PreviewPacket>
          ) : null}
          {node.type === 'expression_unit' ? (
            <PreviewPacket icon={Sparkles} title="Expression Unit" meta={nodeDisplayMeta(node)}>
              {selectedExpressionUnit ? <ExpressionUnitList items={[selectedExpressionUnit]} /> : <PreviewList items={['未在当前 scene_moment 中找到 expression_unit source。']} />}
            </PreviewPacket>
          ) : null}
          {node.type === 'audio_cue' ? (
            <PreviewPacket icon={Sparkles} title="Audio Cue" meta={nodeDisplayMeta(node)}>
              {selectedAudioCue ? <AudioCueList items={[selectedAudioCue]} /> : <PreviewList items={['未在当前 scene_moment 中找到 audio_cue source。']} />}
            </PreviewPacket>
          ) : null}
        </section>

      </section>
    </div>
  )
}

interface NodeFocusItem {
  id: string
  title: string
  meta: string
  description: string
  state?: string
  ownerNodeId?: string
  momentId?: string
  shotId?: string
}

function NodePreviewSelectionWorkspace({
  node,
  workspaceData,
  selectedShot,
  linkedContentUnit,
  linkedChild,
}: {
  node: HierarchyNode
  workspaceData: ContentSourceWorkspaceData
  selectedShot: PreviewShot
  linkedContentUnit?: PreviewContentUnit
  linkedChild?: ShotChildOption
}) {
  const assetUnit = node.type === 'asset' ? assetReferenceUnitForNode(workspaceData, node) : undefined
  const contentUnit = node.type === 'shot' ? selectedShot.contentUnit : linkedContentUnit
  const selectedId = assetUnit
    ? assetUnit.candidates.find((candidate) => candidate.selected)?.id || ''
    : contentUnit?.candidates.find((candidate) => candidate.selected)?.id ?? ''
  const selectedCandidate = assetUnit?.candidates.find((candidate) => candidate.id === selectedId)
    ?? contentUnit?.candidates.find((candidate) => candidate.id === selectedId)
    ?? assetUnit?.candidates.find((candidate) => candidate.selected)
    ?? contentUnit?.candidates.find((candidate) => candidate.selected)

  return (
    <section className="content-source-workspace-preview-selection">
      <NodePreviewPane
        node={node}
        selectedShot={selectedShot}
        linkedChild={linkedChild}
        assetUnit={assetUnit}
        contentUnit={contentUnit}
        selectedCandidate={selectedCandidate}
      />
    </section>
  )
}

function NodePreviewPane({
  node,
  selectedShot,
  linkedChild,
  assetUnit,
  contentUnit,
  selectedCandidate,
}: {
  node: HierarchyNode
  selectedShot: PreviewShot
  linkedChild?: ShotChildOption
  assetUnit?: PreviewAssetReferenceUnit
  contentUnit?: PreviewContentUnit
  selectedCandidate?: PreviewAssetCandidate | PreviewCandidate
}) {
  const candidateCount = assetUnit?.candidates.length ?? contentUnit?.candidates.length ?? 0
  const hasCandidateTarget = Boolean(assetUnit || contentUnit)
  const showEmptyPreview = hasCandidateTarget && candidateCount === 0
  const imagePosition = node.type === 'asset'
    ? node.shotId === 'shot_headlights_back'
      ? '100% 0%'
      : node.shotId === 'shot_elevator_gap'
        ? '0% 100%'
        : '0% 0%'
    : selectedShot.stillPosition
  const title = selectedCandidate?.title ?? previewTitleForNode(node, selectedShot, linkedChild)
  const copy = selectedCandidate
    ? `${'resourceId' in selectedCandidate ? selectedCandidate.resourceId : selectedCandidate.id} · ${selectedCandidate.inputHash}`
    : assetUnit
      ? '选择候选后，下游会记录这个参考图确认态。'
      : previewCopyForNode(node, selectedShot, linkedChild)

  return (
    <section className="content-source-workspace-entity-preview">
      <div className="content-source-workspace-entity-preview__visual" data-empty={showEmptyPreview}>
        {showEmptyPreview ? (
          <span className="content-source-workspace-entity-preview__empty">
            <Image size={22} />
            <em>暂无候选预览</em>
          </span>
        ) : (
          <img src={stillSheetUrl} alt="" style={stillSheetStyle(imagePosition)} />
        )}
        <Badge variant="outline">{previewKindLabel(node.type)}</Badge>
      </div>
      <div className="content-source-workspace-entity-preview__meta">
        <span className="content-source-workspace__eyebrow">Preview</span>
        <h4>{title}</h4>
        <p>{copy}</p>
        <div className="content-source-workspace-asset-impact-summary">
          <PreviewMetric icon={Sparkles} label="Candidates" value={candidateCount} />
          <PreviewMetric icon={Check} label="Selection" value={assetUnit || contentUnit ? selectionStateText(assetUnit?.selectionState ?? contentUnit?.selectionState ?? 'ready') : '不需要候选'} />
        </div>
      </div>
    </section>
  )
}

function NodeFocusDeck({
  node,
  workspaceData,
  currentMoment,
  selectedShot,
  linkedContentUnit,
  selectedCandidateId,
  selectedAssetCandidateId,
  onSelectCandidate,
  onSelectContentUnitCandidate,
  onSelectAssetCandidate,
  onCreateContentUnitCandidate,
  onCreateAssetCandidate,
  onUpdateAssetPrompt,
  onUpdateContentUnitPrompt,
}: {
  node: HierarchyNode
  workspaceData: ContentSourceWorkspaceData
  currentMoment: PreviewMoment
  selectedShot: PreviewShot
  linkedContentUnit?: PreviewContentUnit
  selectedCandidateId: string
  selectedAssetCandidateId: string
  onSelectCandidate: (candidateId: string) => void
  onSelectContentUnitCandidate: (contentUnitId: string, candidateId: string) => void
  onSelectAssetCandidate: (assetId: string, candidateId: string) => void
  onCreateContentUnitCandidate: (contentUnit: PreviewContentUnit, resource?: CandidateResourceSelection) => Promise<void>
  onCreateAssetCandidate: (assetId: string, resource?: CandidateResourceSelection) => Promise<void>
  onUpdateAssetPrompt: (assetId: string, text: string) => Promise<void>
  onUpdateContentUnitPrompt: (contentUnitId: string, targetPath: string, text: string) => Promise<void>
}) {
  const assetUnit = node.type === 'asset' ? assetReferenceUnitForNode(workspaceData, node) : undefined
  const contentUnit = node.type === 'shot' ? selectedShot.contentUnit : linkedContentUnit
  const candidateState = assetUnit?.selectionState ?? contentUnit?.selectionState
  const candidates = assetUnit?.candidates ?? contentUnit?.candidates ?? []
  const promptText = assetUnit?.editPrompt ?? contentUnit?.editPrompt ?? ''
  const hasCandidateTarget = Boolean(assetUnit || contentUnit)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>('all')
  const [resourcePage, setResourcePage] = useState(1)
  const [selectedResource, setSelectedResource] = useState<RawResource | null>(null)
  const [creatingResourceCandidate, setCreatingResourceCandidate] = useState(false)
  const selectedId = assetUnit
    ? selectedAssetCandidateId || assetUnit.candidates.find((candidate) => candidate.selected)?.id || ''
    : node.type === 'shot'
      ? selectedCandidateId
      : contentUnit?.candidates.find((candidate) => candidate.selected)?.id ?? ''
  const selectedLabel = candidates.find((candidate) => candidate.id === selectedId)?.title
  const emptyCandidateSummary = hasCandidateTarget
    ? '还没有候选，可从资源库选择已有资源，或拷贝提示词去外部生成。'
    : '该层级没有独立候选槽。'
  const resourceQuery = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['content-source-workspace-candidate-resources', resourceSearch, resourceType, resourcePage],
    queryFn: () => api.get('/resources', {
      params: {
        page: resourcePage,
        page_size: candidateResourcePageSize,
        q: resourceSearch || undefined,
        type: resourceType === 'all' ? undefined : resourceType,
      },
    }).then((response) => response.data),
    enabled: resourcePickerOpen,
  })
  const resourcePageData = resourceQuery.data
  const resourcePageCount = Math.max(1, Math.ceil((resourcePageData?.total ?? 0) / candidateResourcePageSize))

  function copyPrompt() {
    if (!promptText.trim()) {
      toast.error('暂无可拷贝的提示词')
      return
    }
    navigator.clipboard.writeText(promptText)
      .then(() => {
        setCopiedPrompt(true)
        toast.success('提示词已拷贝')
        window.setTimeout(() => setCopiedPrompt(false), 1400)
      })
      .catch(() => toast.error('拷贝提示词失败'))
  }

  function createCandidateFromSelectedResource() {
    if (!selectedResource || creatingResourceCandidate) return
    const resource: CandidateResourceSelection = {
      resourceId: selectedResource.ID,
      resourceName: selectedResource.name,
      resourceType: selectedResource.type,
      resourceMimeType: selectedResource.mime_type,
    }
    setCreatingResourceCandidate(true)
    const create = assetUnit
      ? onCreateAssetCandidate(assetUnit.assetId, resource)
      : contentUnit
        ? onCreateContentUnitCandidate(contentUnit, resource)
        : Promise.resolve()
    create
      .then(() => {
        toast.success('候选已加入', `${selectedResource.name} · 资源 #${selectedResource.ID}`)
        setResourcePickerOpen(false)
        setSelectedResource(null)
      })
      .catch(() => toast.error('加入候选失败'))
      .finally(() => setCreatingResourceCandidate(false))
  }

  return (
    <section className="content-source-workspace-focus">
      <FocusPanel
        icon={Sparkles}
        tone={candidateState === 'selected' ? 'good' : candidates.length ? 'warn' : 'quiet'}
        title="编辑与选择"
        value={candidates.length ? `${candidates.length} 个候选` : '无候选'}
        status={candidateState ? selectionStateText(candidateState) : '不需要候选'}
        summary={selectedLabel ? `当前选择：${selectedLabel}` : candidates.length ? '已有候选，尚未确认选择。' : emptyCandidateSummary}
      >
        {assetUnit || contentUnit ? (
          <DependencyPromptEditor
            node={node}
            workspaceData={workspaceData}
            currentMoment={currentMoment}
            selectedShot={selectedShot}
            assetUnit={assetUnit}
            contentUnit={contentUnit}
            onUpdateAssetPrompt={onUpdateAssetPrompt}
            onUpdateContentUnitPrompt={onUpdateContentUnitPrompt}
          />
        ) : null}
        {hasCandidateTarget && candidates.length === 0 ? (
          <div className="content-source-workspace-empty-candidate-actions">
            <Button type="button" size="sm" onClick={() => setResourcePickerOpen(true)}>
              <Library size={13} />
              选择资源候选
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={copyPrompt}>
              {copiedPrompt ? <Check size={13} /> : <Copy size={13} />}
              {copiedPrompt ? '已拷贝' : '拷贝提示词'}
            </Button>
          </div>
        ) : null}
        {assetUnit ? (
          <AssetReferenceCandidateList
            unit={assetUnit}
            selectedCandidateId={selectedId}
            onSelect={(candidateId) => onSelectAssetCandidate(assetUnit.assetId, candidateId)}
          />
        ) : contentUnit ? (
          <CandidateList
            candidates={contentUnit.candidates}
            selectedCandidateId={selectedId}
            stillPosition={selectedShot.stillPosition}
            onSelect={(candidateId) => {
              if (node.type === 'shot') onSelectCandidate(candidateId)
              else onSelectContentUnitCandidate(contentUnit.id, candidateId)
            }}
          />
        ) : (
          <FocusEmpty icon={Sparkles} text="结构层级本身不产出候选，候选通常挂在 asset、shot、keyframe 或 storyboard 对应的 content_unit 上。" />
        )}
        <Dialog open={resourcePickerOpen} onOpenChange={(open) => {
          setResourcePickerOpen(open)
          if (!open) setSelectedResource(null)
        }}>
          <ResourceDialogContent size="md">
            <ResourceDialogTitle>从资源库选择候选</ResourceDialogTitle>
            <ResourceDialogText>
              选择一个已有资源加入当前内容单元候选列表。
            </ResourceDialogText>
            <ResourceLibraryPicker
              resources={resourcePageData?.items ?? []}
              selectedResource={selectedResource}
              search={resourceSearch}
              type={resourceType}
              page={resourcePage}
              pageCount={resourcePageCount}
              total={resourcePageData?.total ?? 0}
              isLoading={resourceQuery.isLoading || resourceQuery.isFetching}
              onSearch={(value) => {
                setResourceSearch(value)
                setResourcePage(1)
              }}
              onType={(value) => {
                setResourceType(value)
                setResourcePage(1)
              }}
              onPage={setResourcePage}
              onSelect={setSelectedResource}
              onClear={() => setSelectedResource(null)}
              variant="prep-dialog"
            />
            <ResourceDialogFooter>
              <Button type="button" variant="outline" onClick={() => setResourcePickerOpen(false)}>
                取消
              </Button>
              <Button type="button" disabled={!selectedResource || creatingResourceCandidate} onClick={createCandidateFromSelectedResource}>
                {creatingResourceCandidate ? '加入中' : '加入候选'}
              </Button>
            </ResourceDialogFooter>
          </ResourceDialogContent>
        </Dialog>
      </FocusPanel>
    </section>
  )
}

function FocusPanel({
  icon: Icon,
  tone,
  title,
  value,
  status,
  summary,
  children,
}: {
  icon: LucideIcon
  tone: 'good' | 'info' | 'warn' | 'quiet'
  title: string
  value: string
  status: string
  summary: string
  children: ReactNode
}) {
  return (
    <article className="content-source-workspace-focus-card" data-tone={tone}>
      <header className="content-source-workspace-focus-card__header">
        <span className="content-source-workspace-focus-card__icon">
          <Icon size={17} />
        </span>
        <span className="content-source-workspace-focus-card__title">{title}</span>
        <Badge variant={tone === 'quiet' ? 'outline' : 'soft'}>{status}</Badge>
      </header>
      <strong>{value}</strong>
      <p>{summary}</p>
      <div className="content-source-workspace-focus-card__body">{children}</div>
    </article>
  )
}

function FocusEmpty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="content-source-workspace-focus-empty">
      <Icon size={15} />
      <span>{text}</span>
    </div>
  )
}

interface PromptDependencyRef {
  kind: string
  id: string
  title: string
  state?: string
}

function DependencyPromptEditor({
  node,
  workspaceData,
  currentMoment,
  selectedShot,
  assetUnit,
  contentUnit,
  onUpdateAssetPrompt,
  onUpdateContentUnitPrompt,
}: {
  node: HierarchyNode
  workspaceData: ContentSourceWorkspaceData
  currentMoment: PreviewMoment
  selectedShot: PreviewShot
  assetUnit?: PreviewAssetReferenceUnit
  contentUnit?: PreviewContentUnit
  onUpdateAssetPrompt: (assetId: string, text: string) => Promise<void>
  onUpdateContentUnitPrompt: (contentUnitId: string, targetPath: string, text: string) => Promise<void>
}) {
  const targetId = assetUnit?.contentUnitId ?? contentUnit?.id ?? ''
  const targetPath = assetUnit?.path ?? contentUnit?.path ?? ''
  const sourcePrompt = assetUnit?.editPrompt ?? contentUnit?.editPrompt ?? ''
  const [draftPrompt, setDraftPrompt] = useState(sourcePrompt)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const promptDirty = draftPrompt !== sourcePrompt
  const options = promptDependencyOptionsForNode(workspaceData, node, currentMoment, selectedShot, assetUnit, contentUnit)
  const refs = promptRefsFromText(draftPrompt)

  useEffect(() => {
    setDraftPrompt(sourcePrompt)
    setSavingPrompt(false)
  }, [targetId, sourcePrompt])

  function updateDraft(value: string) {
    setDraftPrompt(normalizePromptMentionSyntax(value))
  }

  function insertDependency(option: PromptDependencyRef) {
    setDraftPrompt((current) => {
      const separator = current.trim().length === 0 || /\s$/.test(current) ? '' : ' '
      return normalizePromptMentionSyntax(`${current}${separator}@${option.kind}/${option.id}`)
    })
  }

  function savePrompt() {
    if (!targetId || !promptDirty || savingPrompt) return
    setSavingPrompt(true)
    const request = assetUnit
      ? onUpdateAssetPrompt(assetUnit.assetId, draftPrompt)
      : onUpdateContentUnitPrompt(targetId, targetPath, draftPrompt)
    request.catch(() => undefined).finally(() => setSavingPrompt(false))
  }

  return (
    <div className="content-source-workspace-prompt-editor">
      <label className="content-source-workspace-prompt-editor__field">
        <span>content_unit edit_prompt</span>
        <textarea
          value={draftPrompt}
          rows={5}
          placeholder="输入提示词；例如 @asset/phone_screen 会自动转成 {{asset:phone_screen}}"
          onChange={(event) => updateDraft(event.target.value)}
        />
      </label>

      <div className="content-source-workspace-prompt-editor__refs">
        <span>当前上游依赖</span>
        <div>
          {refs.length ? refs.map((ref) => (
            <em key={`${ref.kind}:${ref.id}`}>{`{{${ref.kind}:${ref.id}}}`}</em>
          )) : <small>暂无依赖引用</small>}
        </div>
      </div>

      <div className="content-source-workspace-prompt-editor__refs">
        <span>@ 添加上游依赖</span>
        <div>
          {options.length ? options.map((option) => (
            <button key={`${option.kind}:${option.id}`} type="button" onClick={() => insertDependency(option)}>
              @{option.kind}/{option.id}
            </button>
          )) : <small>当前节点没有可推断的上游依赖</small>}
        </div>
      </div>

      <div className="content-source-workspace-prompt-editor__actions">
        <Button type="button" size="sm" disabled={!promptDirty || savingPrompt} onClick={savePrompt}>
          <FilePenLine size={13} />
          {savingPrompt ? '保存中' : '保存提示词'}
        </Button>
        <span>{targetId || 'no content_unit'}</span>
      </div>
    </div>
  )
}

function normalizePromptMentionSyntax(value: string): string {
  return value.replace(/(^|[\s([{"'，。；、])@([a-z_]+)[/:]([A-Za-z0-9_.-]+)/g, (_match, prefix: string, kind: string, id: string) => {
    return `${prefix}{{${kind}:${id}}}`
  })
}

function promptRefsFromText(value: string): Array<{ kind: string; id: string }> {
  const refs: Array<{ kind: string; id: string }> = []
  const pattern = /\{\{\s*([a-z_]+)\s*:\s*([^}\s]+)\s*\}\}/g
  let match = pattern.exec(value)
  while (match) {
    refs.push({ kind: match[1] ?? '', id: match[2] ?? '' })
    match = pattern.exec(value)
  }
  return Array.from(new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values())
}

function promptDependencyOptionsForNode(
  workspaceData: ContentSourceWorkspaceData,
  node: HierarchyNode,
  currentMoment: PreviewMoment,
  selectedShot: PreviewShot,
  assetUnit?: PreviewAssetReferenceUnit,
  contentUnit?: PreviewContentUnit,
): PromptDependencyRef[] {
  const options: PromptDependencyRef[] = []
  if (assetUnit) {
    options.push({ kind: 'asset', id: assetUnit.assetId.replace(/^asset\//, ''), title: assetUnit.title, state: assetUnit.selectionState })
    for (const upstream of assetUnit.upstream) {
      options.push({
        kind: upstream.kind,
        id: upstream.ownerNodeId.replace(/^(setting|state)\//, ''),
        title: upstream.title,
        state: upstream.state,
      })
    }
  }
  if (contentUnit) {
    options.push({ kind: 'scene_moment', id: contentUnit.sceneMomentRef.replace(/^scene_moment\//, ''), title: currentMoment.title, state: currentMoment.selectionState })
    options.push({ kind: 'shot', id: contentUnit.shotId, title: selectedShot.title, state: selectedShot.contentUnit.selectionState })
    if (contentUnit.storyboardRef) {
      options.push({ kind: 'storyboard', id: contentUnit.storyboardRef.replace(/^storyboard\//, ''), title: contentUnit.storyboardRef, state: contentUnit.selectionState })
    }
    for (const keyframe of contentUnit.keyframeRefs) {
      options.push({ kind: 'keyframe', id: keyframe, title: keyframe, state: contentUnit.selectionState })
    }
  }
  for (const asset of selectedShot.assets) {
    options.push({
      kind: asset.title.startsWith('setting/') ? 'setting' : 'asset',
      id: asset.title.replace(/^(asset|setting)\//, ''),
      title: asset.title,
      state: asset.status,
    })
  }
  for (const ref of findRefsForNode(workspaceData, node)) {
    const [kind = 'ref', id = ref.id] = ref.id.split('/')
    options.push({ kind, id, title: ref.title, state: ref.status })
  }
  return uniquePromptDependencyRefs(options.filter((option) => option.id.trim().length > 0))
}

function uniquePromptDependencyRefs(items: PromptDependencyRef[]): PromptDependencyRef[] {
  return Array.from(new Map(items.map((item) => [`${item.kind}:${item.id}`, item])).values())
}

function FocusItemList({
  items,
  emptyText,
  onJumpToNode,
}: {
  items: NodeFocusItem[]
  emptyText: string
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  if (items.length === 0) return <FocusEmpty icon={Link2} text={emptyText} />
  return (
    <div className="content-source-workspace-focus-list">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="content-source-workspace-focus-item"
          data-state={item.state}
          disabled={!item.ownerNodeId}
          onClick={() => {
            if (item.ownerNodeId) onJumpToNode(item.ownerNodeId, item.momentId, item.shotId)
          }}
        >
          <span>
            <strong>{item.title}</strong>
            <small>{item.meta}</small>
          </span>
          <em>{item.state ?? 'ready'}</em>
          <p>{item.description}</p>
        </button>
      ))}
    </div>
  )
}

function childFocusItemsForNode(workspaceData: ContentSourceWorkspaceData, node: HierarchyNode, currentMoment: PreviewMoment, selectedShot: PreviewShot): NodeFocusItem[] {
  if (node.type === 'scene_moment') {
    const expressions = workspaceData.expressionUnitsByMoment[currentMoment.id] ?? []
    const audioCues = workspaceData.audioCuesByMoment[currentMoment.id] ?? []
    return [
      ...currentMoment.shots.map((shot) => focusItemFromShot(shot, currentMoment.id)),
      ...expressions.map((unit) => ({
        id: `expression:${unit.id}`,
        title: unit.title,
        meta: `expression_unit · ${unit.kind}`,
        description: unit.summary,
        state: 'ready',
        ownerNodeId: unit.id,
        momentId: currentMoment.id,
      })),
      ...audioCues.map((cue) => ({
        id: `audio:${cue.id}`,
        title: cue.title,
        meta: `audio_cue · ${cue.cueKind}`,
        description: cue.promptHint || JSON.stringify(cue.timing),
        state: 'ready',
        ownerNodeId: cue.id,
        momentId: currentMoment.id,
      })),
    ]
  }
  if (node.type === 'shot') {
    const workspace = shotWorkspaceFor(workspaceData, selectedShot.id)
    return [
      ...workspace.storyboards.map((item) => focusItemFromShotChild(item, 'storyboard', selectedShot)),
      ...workspace.keyframes.map((item) => focusItemFromShotChild(item, 'keyframe', selectedShot)),
    ]
  }
  if (node.children?.length) {
    return node.children.map((child) => ({
      id: `child:${child.id}`,
      title: child.title,
      meta: nodeDisplayMeta(child),
      description: child.children?.length ? `${child.children.length} 个下级节点` : '叶子节点',
      state: child.state ?? 'ready',
      ownerNodeId: child.id,
      momentId: child.momentId,
      shotId: child.shotId,
    }))
  }
  return []
}

function referenceFocusItemsForNode(workspaceData: ContentSourceWorkspaceData, node: HierarchyNode, selectedShot: PreviewShot, linkedContentUnit?: PreviewContentUnit): NodeFocusItem[] {
  const assetUnit = node.type === 'asset' ? assetReferenceUnitForNode(workspaceData, node) : undefined
  const assetReferences = assetUnit?.downstream.map((item) => ({
    id: item.id,
    title: item.title,
    meta: `${item.kind} · ${item.dependencyHash}`,
    description: item.preview,
    state: item.state,
    ownerNodeId: item.ownerNodeId,
    momentId: item.momentId,
    shotId: item.shotId,
  })) ?? []
  const editableRefReferences = findRefsForNode(workspaceData, node).flatMap((ref) =>
    ref.downstream.map((target) => ({
      id: `ref:${node.id}:${ref.id}:${target}`,
      title: target,
      meta: `${refStatusText(ref.status)} · ${ref.id}`,
      description: ref.summary,
      state: ref.status,
    })),
  )
  const workspace = shotWorkspaceFor(workspaceData, selectedShot.id)
  const impactReferences = workspace.impacts
    .filter((impact) => hierarchyNodeMatchesRef(node, impact.source) || impact.affects.some((target) => hierarchyNodeMatchesRef(node, target)))
    .flatMap((impact) => impact.affects.map((target) => ({
      id: `impact:${node.id}:${impact.source}:${target}`,
      title: target,
      meta: `${impact.kind} · ${impact.source}`,
      description: impact.change,
      state: impact.state,
    })))
  const selfContentUnit = node.type === 'shot'
    ? [focusItemFromContentUnit(selectedShot.contentUnit, selectedShot)]
    : linkedContentUnit
      ? [focusItemFromContentUnit(linkedContentUnit, selectedShot)]
      : []
  return uniqueFocusItems([...assetReferences, ...editableRefReferences, ...impactReferences, ...selfContentUnit])
}

function focusItemFromShot(shot: PreviewShot, momentId: string): NodeFocusItem {
  return {
    id: `shot:${shot.id}`,
    title: shot.title,
    meta: `shot · ${selectionStateText(shot.contentUnit.selectionState)}`,
    description: `${shot.camera} · ${shot.duration}`,
    state: shot.contentUnit.selectionState,
    ownerNodeId: shot.id,
    momentId,
    shotId: shot.id,
  }
}

function focusItemFromShotChild(item: ShotChildOption, kind: 'storyboard' | 'keyframe', selectedShot: PreviewShot): NodeFocusItem {
  return {
    id: `${kind}:${item.id}`,
    title: item.title,
    meta: item.contentUnit ? `${item.contentUnit.id} · ${selectionStateText(item.contentUnit.selectionState)}` : `${kind} · source`,
    description: item.summary,
    state: item.contentUnit?.selectionState ?? item.status,
    ownerNodeId: kind === 'storyboard' ? `storyboard/${item.id.replace(/^storyboard\//, '')}` : item.id,
    shotId: selectedShot.id,
  }
}

function focusItemFromContentUnit(contentUnit: PreviewContentUnit, selectedShot: PreviewShot): NodeFocusItem {
  return {
    id: `content_unit:${contentUnit.id}`,
    title: contentUnit.id,
    meta: `${contentUnit.type} · ${contentUnit.outputKind}`,
    description: `${contentUnit.candidates.length} 个候选，${selectionStateText(contentUnit.selectionState)}。`,
    state: contentUnit.selectionState,
    ownerNodeId: contentUnit.storyboardRef || contentUnit.keyframeRefs[0] || selectedShot.id,
    shotId: selectedShot.id,
  }
}

function uniqueFocusItems(items: NodeFocusItem[]): NodeFocusItem[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
}

function nodeDisplayMeta(node: HierarchyNode): string {
  return [
    nodeTypeLabel(node.type),
    node.state ? stateLabel(node.state) : undefined,
    node.children?.length ? `${node.children.length} 个下级节点` : undefined,
  ].filter(Boolean).join(' · ')
}

function SettingScopeDetail({
  node,
  workspaceData,
  onJumpToNode,
}: {
  node: HierarchyNode
  workspaceData: ContentSourceWorkspaceData
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  const details = buildSettingScopeDetails(workspaceData, node)
  const staleCount = details.dependencies.filter((item) => item.state === 'stale' || item.state === 'needs_candidate' || item.state === 'missing').length

  return (
    <div className="content-source-workspace-setting-scope">
      <div className="content-source-workspace-asset-impact-summary">
        <PreviewMetric icon={Layers3} label="States" value={details.states.length} />
        <PreviewMetric icon={Boxes} label="Assets" value={details.assets.length} />
        <PreviewMetric icon={GitCompareArrows} label="Downstream" value={details.dependencies.length} />
        <PreviewMetric icon={AlertTriangle} label="Needs Review" value={staleCount} />
      </div>

      <PreviewPacket icon={Layers3} title="States / Assets" meta={`${details.states.length} states · ${details.assets.length} assets`}>
        <div className="content-source-workspace-setting-state-list">
          {details.states.map((state) => (
            <article key={state.node.id} className="content-source-workspace-setting-state-card">
              <div className="content-source-workspace-setting-state-card__header">
                <span>
                  <Layers3 size={14} />
                  <strong>{state.node.title}</strong>
                </span>
                {state.node.state ? <Badge variant={state.node.state === 'changed' || state.node.state === 'missing' ? 'soft' : 'outline'}>{stateLabel(state.node.state)}</Badge> : null}
              </div>
              <p>{nodeDisplayMeta(state.node)}</p>
              {state.refs.length ? <EditableRefList items={state.refs} /> : null}
              <div className="content-source-workspace-setting-asset-row">
                {state.assets.map((asset) => {
                  const unit = assetReferenceUnitForNode(workspaceData, asset)
                  const selectedCandidate = unit.candidates.find((candidate) => candidate.selected)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className="content-source-workspace-setting-asset-card"
                      data-state={asset.state ?? unit.selectionState}
                      onClick={() => onJumpToNode(asset.id, asset.momentId, asset.shotId)}
                    >
                      <span className="content-source-workspace-setting-asset-card__thumb">
                        <img src={stillSheetUrl} alt="" style={stillSheetStyle(asset.shotId === 'shot_headlights_back' ? '100% 0%' : asset.shotId === 'shot_elevator_gap' ? '0% 100%' : '0% 0%')} />
                      </span>
                      <span className="content-source-workspace-setting-asset-card__body">
                        <strong>{asset.title}</strong>
                        <small>{unit.contentUnitId}</small>
                        <span>{selectedCandidate ? `${selectedCandidate.title} · ${selectedCandidate.resourceId}` : '等待确认参考图候选'}</span>
                      </span>
                      <Badge variant={unit.selectionState === 'selected' || unit.selectionState === 'ready' ? 'outline' : 'soft'}>{selectionStateText(unit.selectionState)}</Badge>
                    </button>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
      </PreviewPacket>

      <PreviewPacket icon={Boxes} title="All Asset Refs" meta={`${details.assets.length} asset_ref units`}>
        <div className="content-source-workspace-setting-ref-grid">
          {details.assets.map((asset) => (
            <article key={asset.node.id} className="content-source-workspace-setting-ref-card">
              <div className="content-source-workspace-setting-ref-card__header">
                <strong>{asset.node.title}</strong>
                <Badge variant={asset.unit.selectionState === 'selected' || asset.unit.selectionState === 'ready' ? 'outline' : 'soft'}>{selectionStateText(asset.unit.selectionState)}</Badge>
              </div>
              <p>{asset.unit.usage}</p>
              <div className="content-source-workspace-setting-ref-card__meta">
                <span>{asset.unit.contentUnitId}</span>
                <span>{asset.unit.acceptedInputHash ?? 'no accepted hash'}</span>
                <span>{asset.unit.candidates.length} candidates</span>
                <span>{asset.unit.downstream.length} downstream</span>
              </div>
              {asset.refs.length ? <EditableRefList items={asset.refs} /> : null}
            </article>
          ))}
        </div>
      </PreviewPacket>

      <PreviewPacket icon={GitCompareArrows} title="Downstream Dependencies" meta={`${details.dependencies.length} links`}>
        <SettingDependencyList items={details.dependencies} onJumpToNode={onJumpToNode} />
      </PreviewPacket>
    </div>
  )
}

function SettingDependencyList({
  items,
  onJumpToNode,
}: {
  items: SettingScopeDependency[]
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="content-source-workspace-impact-empty">
        <Check size={15} />
        <span>当前 setting 暂无下游依赖。</span>
      </div>
    )
  }

  return (
    <div className="content-source-workspace-setting-dependency-list">
      {items.map((item) => (
        <article key={item.id} className="content-source-workspace-setting-dependency-card" data-state={item.state}>
          <div className="content-source-workspace-setting-dependency-card__header">
            <span>
              <GitCompareArrows size={14} />
              <strong>{item.title}</strong>
            </span>
            <Badge variant={item.state === 'selected' || item.state === 'ready' || item.state === 'current' ? 'outline' : 'soft'}>{dependencyStateLabel(item.state)}</Badge>
          </div>
          <p>{item.preview}</p>
          <div className="content-source-workspace-setting-dependency-card__chain">
            <span>{item.sourceTitle}</span>
            <em>{item.kind}</em>
            {item.dependencyHash ? <em>{item.dependencyHash}</em> : null}
          </div>
          <div className="content-source-workspace-asset-downstream__actions">
            {item.ownerNodeId ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onJumpToNode(item.ownerNodeId ?? '', item.momentId, item.shotId)}>
                <ChevronRight size={13} />
                跳转
              </Button>
            ) : null}
            <span>{item.action}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function AssetReferenceDetail({
  node,
  unit,
  selectedCandidateId,
  onSelectCandidate,
  onCreateCandidate,
  onUpdatePrompt,
  onJumpToNode,
}: {
  node: HierarchyNode
  unit: PreviewAssetReferenceUnit
  selectedCandidateId: string
  onSelectCandidate: (assetId: string, candidateId: string) => void
  onCreateCandidate: (assetId: string) => Promise<void>
  onUpdatePrompt: (assetId: string, text: string) => Promise<void>
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  const [draftPrompt, setDraftPrompt] = useState(unit.editPrompt)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [creatingCandidate, setCreatingCandidate] = useState(false)
  const selectedCandidate = unit.candidates.find((candidate) => candidate.id === selectedCandidateId) ?? unit.candidates.find((candidate) => candidate.selected)
  const staleDownstreamCount = unit.downstream.filter((item) => item.state === 'stale' || item.state === 'needs_candidate').length
  const promptDirty = draftPrompt !== unit.editPrompt

  useEffect(() => {
    setDraftPrompt(unit.editPrompt)
    setSavingPrompt(false)
  }, [unit.contentUnitId, unit.editPrompt])

  function savePrompt() {
    if (!promptDirty || savingPrompt) return
    setSavingPrompt(true)
    onUpdatePrompt(unit.assetId, draftPrompt)
      .catch(() => undefined)
      .finally(() => setSavingPrompt(false))
  }

  function createCandidate() {
    if (creatingCandidate) return
    setCreatingCandidate(true)
    onCreateCandidate(unit.assetId)
      .catch(() => undefined)
      .finally(() => setCreatingCandidate(false))
  }

  return (
    <>
      <section className="content-source-workspace-asset-unit">
        <div className="content-source-workspace-asset-unit__editor">
          <div className="content-source-workspace-entity-section__title">
            <span className="content-source-workspace__eyebrow">Content Unit Editor</span>
            <strong>内容单元编辑</strong>
          </div>
          <div className="content-source-workspace-asset-unit__copy">
            <span className="content-source-workspace__eyebrow">{unit.contentUnitType}</span>
            <h4>{unit.contentUnitId}</h4>
            <p>{unit.usage}</p>
          </div>
          <div className="content-source-workspace-asset-unit__facts">
            <PreviewFact label="output_kind" value={unit.outputKind} />
            <PreviewFact label="accepted_input_hash" value={unit.acceptedInputHash ?? '等待确认候选'} />
            <PreviewFact label="selection_state" value={selectionStateText(unit.selectionState)} />
          </div>
          <label className="content-source-workspace-asset-unit__field">
            <span>edit_prompt</span>
            <textarea value={draftPrompt} onChange={(event) => setDraftPrompt(event.target.value)} rows={4} />
          </label>
          <label className="content-source-workspace-asset-unit__field">
            <span>lock_policy</span>
            <textarea value={unit.lockPolicy} readOnly rows={3} />
          </label>
          <div className="content-source-workspace-view-jumps">
            <Button type="button" size="sm" disabled={!promptDirty || savingPrompt} onClick={savePrompt}>
              <FilePenLine size={13} />
              {savingPrompt ? '保存中' : '保存 edit_prompt'}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={creatingCandidate} onClick={createCandidate}>
              <Wand2 size={13} />
              {creatingCandidate ? '排队中' : '生成新候选'}
            </Button>
          </div>
        </div>

        <div className="content-source-workspace-asset-unit__preview">
          <div className="content-source-workspace-entity-section__title">
            <span className="content-source-workspace__eyebrow">Preview</span>
            <strong>预览</strong>
          </div>
          <div className="content-source-workspace-asset-selected">
            <span className="content-source-workspace__eyebrow">{selectedCandidate ? 'Candidate Preview' : 'Current Reference'}</span>
            <div className="content-source-workspace-asset-selected__thumb">
              <img src={stillSheetUrl} alt="" style={stillSheetStyle(node.shotId === 'shot_headlights_back' ? '100% 0%' : node.shotId === 'shot_elevator_gap' ? '0% 100%' : '0% 0%')} />
            </div>
            <strong>{selectedCandidate?.title ?? '尚未确认参考图'}</strong>
            <p>{selectedCandidate ? `${selectedCandidate.resourceId} · ${selectedCandidate.inputHash}` : '选择候选后，下游会记录这个参考图确认态。'}</p>
          </div>
          <div className="content-source-workspace-asset-candidate-panel">
            <div className="content-source-workspace-asset-candidate-panel__header">
              <span className="content-source-workspace__eyebrow">Candidate Cards</span>
              <strong>候选预览卡片</strong>
            </div>
            <AssetReferenceCandidateList
              unit={unit}
              selectedCandidateId={selectedCandidate?.id ?? ''}
              onSelect={(candidateId) => onSelectCandidate(unit.assetId, candidateId)}
            />
          </div>
        </div>
      </section>

      <section className="content-source-workspace-entity-section">
        <div className="content-source-workspace-entity-section__title">
          <span className="content-source-workspace__eyebrow">Upstream Dependencies</span>
          <strong>上游依赖列表 + 跳转</strong>
        </div>
        <AssetUpstreamList items={unit.upstream} onJumpToNode={onJumpToNode} />
      </section>

      <section className="content-source-workspace-entity-section">
        <div className="content-source-workspace-entity-section__title">
          <span className="content-source-workspace__eyebrow">Downstream Dependencies</span>
          <strong>下游依赖列表 + 跳转</strong>
        </div>
        <div className="content-source-workspace-asset-impact-summary">
          <PreviewMetric icon={Boxes} label="Asset Ref" value={1} />
          <PreviewMetric icon={Sparkles} label="Candidates" value={unit.candidates.length} />
          <PreviewMetric icon={GitCompareArrows} label="Stale" value={staleDownstreamCount} />
        </div>
        <AssetDownstreamList items={unit.downstream} onJumpToNode={onJumpToNode} />
      </section>
    </>
  )
}

function AssetUpstreamList({
  items,
  onJumpToNode,
}: {
  items: PreviewAssetUpstream[]
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="content-source-workspace-asset-dependency-empty">
        <Link2 size={15} />
        <span>暂无上游依赖记录。</span>
      </div>
    )
  }

  return (
    <div className="content-source-workspace-asset-downstream-list">
      {items.map((item) => (
        <article key={item.id} className="content-source-workspace-asset-downstream" data-state={item.state}>
          <div className="content-source-workspace-asset-downstream__header">
            <span>
              <Link2 size={14} />
              <strong>{item.title}</strong>
            </span>
            <Badge variant={item.state === 'current' || item.state === 'selected' || item.state === 'ready' ? 'outline' : 'soft'}>{dependencyStateText(item.state)}</Badge>
          </div>
          <p>{item.summary}</p>
          <div className="content-source-workspace-asset-downstream__chain">
            <span>{item.kind}</span>
            <em>{item.ownerNodeId}</em>
          </div>
          <div className="content-source-workspace-asset-downstream__actions">
            <Button type="button" size="sm" onClick={() => onJumpToNode(item.ownerNodeId)}>
              <ChevronRight size={13} />
              跳转
            </Button>
          </div>
        </article>
      ))}
    </div>
  )
}

function AssetReferenceCandidateList({
  unit,
  selectedCandidateId,
  onSelect,
}: {
  unit: PreviewAssetReferenceUnit
  selectedCandidateId: string
  onSelect: (candidateId: string) => void
}) {
  if (unit.candidates.length === 0) {
    return (
      <div className="content-source-workspace-asset-dependency-empty">
        <Sparkles size={15} />
        <span>暂无候选预览卡片。</span>
      </div>
    )
  }

  return (
    <div className="content-source-workspace-asset-candidates">
      {unit.candidates.map((candidate) => {
        const isSelected = selectedCandidateId === candidate.id
        return (
          <article
            key={candidate.id}
            className="content-source-workspace-asset-candidate"
            data-active={isSelected}
            data-confirmation={candidate.confirmation}
            tabIndex={0}
            onClick={() => onSelect(candidate.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(candidate.id)
            }}
          >
            <span className="content-source-workspace-asset-candidate__thumb">
              <img src={stillSheetUrl} alt="" style={stillSheetStyle(unit.assetId === 'asset/headlight_beam' ? '100% 0%' : unit.assetId === 'asset/evening_dress' ? '0% 100%' : '0% 0%')} />
            </span>
            <span className="content-source-workspace-asset-candidate__body">
              <strong>{candidate.title}</strong>
              <small>{candidate.model} · {candidate.resourceId}</small>
              <span>{candidate.note}</span>
            </span>
            <span className="content-source-workspace-asset-candidate__meta">
              <Badge variant={candidate.confirmation === 'confirmed' ? 'outline' : 'soft'}>{assetCandidateConfirmationLabel(candidate.confirmation)}</Badge>
              <em>{candidate.inputHash}</em>
            </span>
            <Button
              type="button"
              size="sm"
              variant={isSelected ? 'outline' : undefined}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(candidate.id)
              }}
            >
              {isSelected ? <Check size={13} /> : <ChevronRight size={13} />}
              {isSelected ? '已选中' : '一键选中'}
            </Button>
          </article>
        )
      })}
    </div>
  )
}

function AssetDownstreamList({
  items,
  onJumpToNode,
}: {
  items: PreviewAssetDownstream[]
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  return (
    <div className="content-source-workspace-asset-downstream-list">
      {items.map((item) => (
        <article key={item.id} className="content-source-workspace-asset-downstream" data-state={item.state}>
          <div className="content-source-workspace-asset-downstream__header">
            <span>
              <GitCompareArrows size={14} />
              <strong>{item.title}</strong>
            </span>
            <Badge variant={item.state === 'selected' || item.state === 'ready' ? 'outline' : 'soft'}>{selectionStateText(item.state)}</Badge>
          </div>
          <p>{item.preview}</p>
          <div className="content-source-workspace-asset-downstream__chain">
            <span>{item.kind}</span>
            <em>{item.dependencyHash}</em>
          </div>
          <div className="content-source-workspace-asset-downstream__actions">
            <Button type="button" size="sm" variant="outline" onClick={() => onJumpToNode(item.ownerNodeId, item.momentId, item.shotId)}>
              <Search size={13} />
              预览
            </Button>
            <Button type="button" size="sm" onClick={() => onJumpToNode(item.ownerNodeId, item.momentId, item.shotId)}>
              <ChevronRight size={13} />
              跳转
            </Button>
            <span>{item.action}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function GroupRelationView({
  node,
  workspaceData,
  currentMoment,
  selectedShot,
  onSelectShot,
}: {
  node: HierarchyNode
  workspaceData: ContentSourceWorkspaceData
  currentMoment: PreviewMoment
  selectedShot: PreviewShot
  onSelectShot: (momentId: string, shotId: string) => void
}) {
  const workspace = shotWorkspaceFor(workspaceData, selectedShot.id)

  if (node.title === 'Shots') {
    return (
      <PreviewPacket icon={Clapperboard} title="Shots" meta={`${currentMoment.shots.length} shots`}>
        <ShotCardRow workspaceData={workspaceData} moment={currentMoment} selectedShot={selectedShot} onSelectShot={onSelectShot} />
      </PreviewPacket>
    )
  }

  if (node.title === 'Expression Units') {
    const expressionUnits = workspaceData.expressionUnitsByMoment[currentMoment.id] ?? []
    return (
      <PreviewPacket icon={Sparkles} title="Expression Units" meta={`${expressionUnits.length} units`}>
        <ExpressionUnitList items={expressionUnits} />
      </PreviewPacket>
    )
  }

  if (node.title === 'Audio Cues') {
    const audioCues = workspaceData.audioCuesByMoment[currentMoment.id] ?? []
    return (
      <PreviewPacket icon={Sparkles} title="Audio Cues" meta={`${audioCues.length} cues`}>
        <AudioCueList items={audioCues} />
      </PreviewPacket>
    )
  }

  if (node.title === 'Keyframes') {
    return (
      <PreviewPacket icon={Frame} title="Keyframes" meta={`${workspace.keyframes.length} options`}>
        <ShotChildList items={workspace.keyframes} stillPosition={selectedShot.stillPosition} />
      </PreviewPacket>
    )
  }

  if (node.title === 'Storyboards') {
    return (
      <PreviewPacket icon={Image} title="Storyboards" meta={`${workspace.storyboards.length} options`}>
        <ShotChildList items={workspace.storyboards} stillPosition={selectedShot.stillPosition} />
      </PreviewPacket>
    )
  }

  return (
    <PreviewPacket icon={Layers3} title={node.title} meta={`${node.children?.length ?? 0} children`}>
      <PreviewList items={(node.children ?? []).map((child) => child.title)} />
    </PreviewPacket>
  )
}

function ShotCardRow({
  workspaceData,
  moment,
  selectedShot,
  onSelectShot,
}: {
  workspaceData: ContentSourceWorkspaceData
  moment: PreviewMoment
  selectedShot: PreviewShot
  onSelectShot: (momentId: string, shotId: string) => void
}) {
  return (
    <div className="content-source-workspace-shot-row">
      {moment.shots.map((shot, shotIndex) => {
        const shotWorkspace = shotWorkspaceFor(workspaceData, shot.id)
        const refIssueCount = [...shotWorkspace.settings, ...shotWorkspace.assets].filter((ref) => ref.status === 'changed' || ref.status === 'missing').length
        const shotImpactCount = shotWorkspace.impacts.length
        return (
          <button
            key={shot.id}
            type="button"
            className="content-source-workspace-shot-card"
            data-active={selectedShot.id === shot.id}
            onClick={(event) => {
              event.stopPropagation()
              onSelectShot(moment.id, shot.id)
            }}
          >
            <span className="content-source-workspace-shot-card__frame">
              <img src={stillSheetUrl} alt="" style={stillSheetStyle(shot.stillPosition)} />
              <small>{String(shotIndex + 1).padStart(2, '0')}</small>
            </span>
            <span className="content-source-workspace-shot-card__body">
              <span className="content-source-workspace-shot-card__kind">{shot.contentUnit.type} · {shot.contentUnit.outputKind}</span>
              <strong>{shot.title}</strong>
              <small>{shot.camera} · {shot.duration}</small>
            </span>
            <span className="content-source-workspace-shot-card__meta">
              <span>{shot.keyframes.length} keyframes</span>
              <span data-warning={shot.contentUnit.selectionState === 'stale'}>{selectionStateText(shot.contentUnit.selectionState)}</span>
              <span data-warning={refIssueCount > 0}>{refIssueCount} ref issues</span>
              <span data-warning={shotImpactCount > 0}>{shotImpactCount} impact</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function PreviewPacket({
  icon: Icon,
  title,
  meta,
  children,
}: {
  icon: LucideIcon
  title: string
  meta: string
  children: ReactNode
}) {
  return (
    <section className="content-source-workspace-packet">
      <div className="content-source-workspace-packet__header">
        <Icon size={15} />
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <div className="content-source-workspace-packet__body">{children}</div>
    </section>
  )
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="content-source-workspace-packet-fact">
      <span>{label}</span>
      <p>{value}</p>
    </div>
  )
}

function PlanningEditor({
  node,
  onUpdateTransition,
  onUpdateStoryboardTimeline,
}: {
  node: HierarchyNode
  onUpdateTransition: (nodeId: string, targetPath: string, transition: HierarchyTransition) => Promise<void>
  onUpdateStoryboardTimeline: (nodeId: string, targetPath: string, timeline: StoryboardTimeline) => Promise<void>
}) {
  return (
    <div className="content-source-workspace-entity-split">
      <TransitionEditor node={node} onUpdate={onUpdateTransition} />
      {node.type === 'storyboard' ? (
        <StoryboardTimelineEditor node={node} onUpdate={onUpdateStoryboardTimeline} />
      ) : null}
    </div>
  )
}

function TransitionEditor({
  node,
  onUpdate,
}: {
  node: HierarchyNode
  onUpdate: (nodeId: string, targetPath: string, transition: HierarchyTransition) => Promise<void>
}) {
  const [draft, setDraft] = useState<HierarchyTransition>(node.transition ?? {})
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(node.transition ?? {})

  useEffect(() => {
    setDraft(node.transition ?? {})
    setSaving(false)
  }, [node.id, node.transition])

  function updateDraft(patch: Partial<HierarchyTransition>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function save() {
    if (!dirty || saving) return
    setSaving(true)
    onUpdate(node.id, node.path, draft)
      .catch(() => undefined)
      .finally(() => setSaving(false))
  }

  return (
    <PreviewPacket icon={GitCompareArrows} title="Transition" meta={nodeDisplayMeta(node)}>
      <div className="content-source-workspace-expression-editor">
        <label className="content-source-workspace-asset-unit__field">
          <span>in</span>
          <Input value={draft.in ?? ''} onChange={(event) => updateDraft({ in: event.target.value })} />
        </label>
        <label className="content-source-workspace-asset-unit__field">
          <span>out</span>
          <Input value={draft.out ?? ''} onChange={(event) => updateDraft({ out: event.target.value })} />
        </label>
        <label className="content-source-workspace-asset-unit__field">
          <span>notes</span>
          <textarea value={draft.notes ?? ''} onChange={(event) => updateDraft({ notes: event.target.value })} rows={3} />
        </label>
        <div className="content-source-workspace-view-jumps">
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={save}>
            <FilePenLine size={13} />
            {saving ? '保存中' : '保存 transition'}
          </Button>
        </div>
      </div>
    </PreviewPacket>
  )
}

function StoryboardTimelineEditor({
  node,
  onUpdate,
}: {
  node: HierarchyNode
  onUpdate: (nodeId: string, targetPath: string, timeline: StoryboardTimeline) => Promise<void>
}) {
  const [draft, setDraft] = useState<StoryboardTimeline>(node.storyboardTimeline ?? {})
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(node.storyboardTimeline ?? {})

  useEffect(() => {
    setDraft(node.storyboardTimeline ?? {})
    setSaving(false)
  }, [node.id, node.storyboardTimeline])

  function updateDraft(patch: Partial<StoryboardTimeline>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function save() {
    if (!dirty || saving) return
    setSaving(true)
    onUpdate(node.id, node.path, draft)
      .catch(() => undefined)
      .finally(() => setSaving(false))
  }

  return (
    <PreviewPacket icon={Image} title="Storyboard Timeline" meta={node.id}>
      <div className="content-source-workspace-expression-editor">
        <label className="content-source-workspace-asset-unit__field">
          <span>caption</span>
          <textarea value={draft.caption ?? ''} onChange={(event) => updateDraft({ caption: event.target.value })} rows={3} />
        </label>
        <label className="content-source-workspace-asset-unit__field">
          <span>gap_after_sec</span>
          <Input value={numberInputValue(draft.gapAfterSec)} onChange={(event) => updateDraft({ gapAfterSec: numberInputValueToNumber(event.target.value) })} />
        </label>
        <label className="content-source-workspace-asset-unit__field">
          <span>duration_sec</span>
          <Input value={numberInputValue(draft.durationSec)} onChange={(event) => updateDraft({ durationSec: numberInputValueToNumber(event.target.value) })} />
        </label>
        <div className="content-source-workspace-view-jumps">
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={save}>
            <FilePenLine size={13} />
            {saving ? '保存中' : '保存 timeline'}
          </Button>
        </div>
      </div>
    </PreviewPacket>
  )
}

function ContentUnitPromptEditor({
  contentUnit,
  onUpdatePrompt,
  onCreateCandidate,
}: {
  contentUnit: PreviewContentUnit
  onUpdatePrompt: (contentUnitId: string, targetPath: string, text: string) => Promise<void>
  onCreateCandidate: (contentUnit: PreviewContentUnit) => Promise<void>
}) {
  const [draftPrompt, setDraftPrompt] = useState(contentUnit.editPrompt)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [creatingCandidate, setCreatingCandidate] = useState(false)
  const promptDirty = draftPrompt !== contentUnit.editPrompt

  useEffect(() => {
    setDraftPrompt(contentUnit.editPrompt)
    setSavingPrompt(false)
  }, [contentUnit.id, contentUnit.editPrompt])

  function savePrompt() {
    if (!promptDirty || savingPrompt) return
    setSavingPrompt(true)
    onUpdatePrompt(contentUnit.id, contentUnit.path, draftPrompt)
      .catch(() => undefined)
      .finally(() => setSavingPrompt(false))
  }

  function createCandidate() {
    if (creatingCandidate) return
    setCreatingCandidate(true)
    onCreateCandidate(contentUnit)
      .catch(() => undefined)
      .finally(() => setCreatingCandidate(false))
  }

  return (
    <>
      <label className="content-source-workspace-asset-unit__field">
        <span>edit_prompt</span>
        <textarea value={draftPrompt} onChange={(event) => setDraftPrompt(event.target.value)} rows={4} />
      </label>
      <div className="content-source-workspace-view-jumps">
        <Button type="button" size="sm" disabled={!promptDirty || savingPrompt} onClick={savePrompt}>
          <FilePenLine size={13} />
          {savingPrompt ? '保存中' : '保存 edit_prompt'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={creatingCandidate} onClick={createCandidate}>
          <Wand2 size={13} />
          {creatingCandidate ? '排队中' : '生成新候选'}
        </Button>
      </div>
    </>
  )
}

function PreviewList({ items }: { items: string[] }) {
  return (
    <ul className="content-source-workspace-packet-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function EditableRefList({ items }: { items: EditableRef[] }) {
  return (
    <div className="content-source-workspace-ref-list">
      {items.map((item) => (
        <article key={`${item.id}-${item.owner}-${item.summary}`} className="content-source-workspace-ref-card" data-status={item.status}>
          <div className="content-source-workspace-ref-card__header">
            <span>
              <Link2 size={13} />
              <strong>{item.id}</strong>
            </span>
            <Badge variant={item.status === 'current' || item.status === 'locked' ? 'outline' : 'soft'}>{refStatusText(item.status)}</Badge>
          </div>
          <h4>{item.title}</h4>
          <p>{item.summary}</p>
          <div className="content-source-workspace-ref-card__meta">
            <span>{item.owner}</span>
            {item.changedField ? <strong>{item.changedField}</strong> : null}
          </div>
          <div className="content-source-workspace-ref-card__downstream">
            <span>affects</span>
            <div>
              {item.downstream.map((ref) => (
                <em key={ref}>{ref}</em>
              ))}
            </div>
          </div>
          <Button type="button" size="sm" variant="outline">
            <FilePenLine size={13} />
            编辑对象
          </Button>
        </article>
      ))}
    </div>
  )
}

function ShotChildList({ items, stillPosition }: { items: ShotChildOption[]; stillPosition: string }) {
  return (
    <div className="content-source-workspace-child-list">
      {items.map((item, index) => (
        <button key={item.id} type="button" className="content-source-workspace-child-card" data-status={item.status}>
          <span className="content-source-workspace-child-card__thumb">
            <img src={stillSheetUrl} alt="" style={stillSheetStyle(stillPosition)} />
            <small>{String(index + 1).padStart(2, '0')}</small>
          </span>
          <span className="content-source-workspace-child-card__body">
            <strong>{item.title}</strong>
            <small>{item.id} · {item.inputHash}</small>
            <span>{item.summary}</span>
            {item.contentUnit ? (
              <small>{item.contentUnit.id} · {selectionStateText(item.contentUnit.selectionState)}</small>
            ) : null}
          </span>
          <Badge variant={item.status === 'selected' ? 'outline' : 'soft'}>{childStatusText(item.status)}</Badge>
        </button>
      ))}
    </div>
  )
}

function ExpressionUnitList({ items }: { items: ExpressionUnit[] }) {
  return (
    <div className="content-source-workspace-expression-list">
      {items.map((item) => (
        <article key={item.id} className="content-source-workspace-expression-card">
          <div>
            <strong>{item.title}</strong>
            <small>{item.id} · {item.kind}</small>
          </div>
          <p>{item.summary}</p>
        </article>
      ))}
    </div>
  )
}

function ExpressionUnitEditor({
  unit,
  onUpdate,
}: {
  unit: ExpressionUnit
  onUpdate: (unit: ExpressionUnit) => Promise<void>
}) {
  const [draft, setDraft] = useState(unit)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(unit)

  useEffect(() => {
    setDraft(unit)
    setSaving(false)
  }, [unit])

  function updateDraft(patch: Partial<ExpressionUnit>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function save() {
    if (!dirty || saving) return
    setSaving(true)
    onUpdate(draft)
      .catch(() => undefined)
      .finally(() => setSaving(false))
  }

  return (
    <div className="content-source-workspace-expression-editor">
      <label className="content-source-workspace-asset-unit__field">
        <span>title</span>
        <Input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>expression_kind</span>
        <Input value={draft.kind} onChange={(event) => updateDraft({ kind: event.target.value })} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>speaker</span>
        <Input value={draft.speaker ?? ''} onChange={(event) => updateDraft({ speaker: event.target.value })} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>text</span>
        <textarea value={draft.text} onChange={(event) => updateDraft({ text: event.target.value })} rows={3} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>intent</span>
        <textarea value={draft.summary} onChange={(event) => updateDraft({ summary: event.target.value })} rows={3} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>note</span>
        <textarea value={draft.note ?? ''} onChange={(event) => updateDraft({ note: event.target.value })} rows={2} />
      </label>
      <div className="content-source-workspace-view-jumps">
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={save}>
          <FilePenLine size={13} />
          {saving ? '保存中' : '保存 expression_unit'}
        </Button>
      </div>
    </div>
  )
}

function AudioCueList({ items }: { items: AudioCue[] }) {
  return (
    <div className="content-source-workspace-expression-list">
      {items.map((item) => (
        <article key={item.id} className="content-source-workspace-expression-card">
          <div>
            <strong>{item.title}</strong>
            <small>{item.id} · {item.cueKind}</small>
          </div>
          <p>{item.promptHint || JSON.stringify(item.timing)}</p>
        </article>
      ))}
    </div>
  )
}

function AudioCueEditor({
  cue,
  onUpdate,
}: {
  cue: AudioCue
  onUpdate: (cue: AudioCue) => Promise<void>
}) {
  const [draft, setDraft] = useState(cue)
  const [timingText, setTimingText] = useState(JSON.stringify(cue.timing, null, 2))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(cue) || timingText !== JSON.stringify(cue.timing, null, 2)

  useEffect(() => {
    setDraft(cue)
    setTimingText(JSON.stringify(cue.timing, null, 2))
    setSaving(false)
    setError(null)
  }, [cue])

  function updateDraft(patch: Partial<AudioCue>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function save() {
    if (!dirty || saving) return
    const parsedTiming = parseTimingJSON(timingText)
    if (!parsedTiming) {
      setError('timing 必须是 JSON object')
      return
    }
    setSaving(true)
    setError(null)
    onUpdate({ ...draft, timing: parsedTiming })
      .catch(() => undefined)
      .finally(() => setSaving(false))
  }

  return (
    <div className="content-source-workspace-expression-editor">
      <label className="content-source-workspace-asset-unit__field">
        <span>title</span>
        <Input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>cue_kind</span>
        <Input value={draft.cueKind} onChange={(event) => updateDraft({ cueKind: event.target.value })} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>shot_ref</span>
        <Input value={draft.shotRef ?? ''} onChange={(event) => updateDraft({ shotRef: event.target.value })} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>storyboard_ref</span>
        <Input value={draft.storyboardRef ?? ''} onChange={(event) => updateDraft({ storyboardRef: event.target.value })} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>prompt_hint</span>
        <textarea value={draft.promptHint} onChange={(event) => updateDraft({ promptHint: event.target.value })} rows={3} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>timing</span>
        <textarea value={timingText} onChange={(event) => setTimingText(event.target.value)} rows={4} />
      </label>
      <label className="content-source-workspace-asset-unit__field">
        <span>asset_refs</span>
        <Input value={draft.assetRefs.join(', ')} onChange={(event) => updateDraft({ assetRefs: splitCommaList(event.target.value) })} />
      </label>
      <div className="content-source-workspace-view-jumps">
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={save}>
          <FilePenLine size={13} />
          {saving ? '保存中' : '保存 audio_cue'}
        </Button>
        {error ? <span>{error}</span> : null}
      </div>
    </div>
  )
}

function parseTimingJSON(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function splitCommaList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function supportsTransitionEditor(node: HierarchyNode): boolean {
  return node.type === 'production'
    || node.type === 'segment'
    || node.type === 'scene_moment'
    || node.type === 'shot'
    || node.type === 'storyboard'
}

function numberInputValue(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

function numberInputValueToNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function CandidateList({
  candidates,
  selectedCandidateId,
  stillPosition,
  onSelect,
}: {
  candidates: PreviewCandidate[]
  selectedCandidateId: string
  stillPosition: string
  onSelect: (candidateId: string) => void
}) {
  return (
    <div className="content-source-workspace-candidates">
      {candidates.map((candidate) => {
        const isSelected = selectedCandidateId === candidate.id
        return (
          <button
            key={candidate.id}
            type="button"
            className="content-source-workspace-candidate"
            data-active={isSelected}
            onClick={() => onSelect(candidate.id)}
          >
            <span className="content-source-workspace-candidate__thumb">
              <img src={stillSheetUrl} alt="" style={stillSheetStyle(stillPosition)} />
            </span>
            <span className="content-source-workspace-candidate__body">
              <strong>{candidate.title}</strong>
              <small>{candidate.model} · {candidate.inputHash}</small>
              <span>{candidate.note}</span>
            </span>
            {isSelected ? <Check size={15} /> : null}
          </button>
        )
      })}
    </div>
  )
}

function ImpactList({ impacts }: { impacts: ShotImpact[] }) {
  if (impacts.length === 0) {
    return (
      <div className="content-source-workspace-impact-empty">
        <Check size={15} />
        <span>当前 shot 的 setting / asset / keyframe 输入没有未处理变更。</span>
      </div>
    )
  }

  return (
    <div className="content-source-workspace-impact-list">
      {impacts.map((impact) => (
        <article key={`${impact.source}-${impact.change}`} className="content-source-workspace-impact-card">
          <div className="content-source-workspace-impact-card__header">
            <span>
              <AlertTriangle size={14} />
              <strong>{impact.source}</strong>
            </span>
            <Badge variant="soft">{selectionStateText(impact.state)}</Badge>
          </div>
          <p>{impact.change}</p>
          <div className="content-source-workspace-impact-card__chain">
            <span>{impact.kind}</span>
            <div>
              {impact.affects.map((ref) => (
                <em key={ref}>{ref}</em>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function buildSettingScopeDetails(workspaceData: ContentSourceWorkspaceData, node: HierarchyNode): SettingScopeDetails {
  const descendants = collectHierarchyDescendants(node)
  const stateNodes = node.type === 'state'
    ? [node]
    : descendants.filter((child) => child.type === 'state')
  const assetNodes = uniqueHierarchyNodes(
    (node.type === 'asset' ? [node] : descendants.filter((child) => child.type === 'asset')) as HierarchyNode[],
  )
  const states = stateNodes.map((stateNode) => ({
    node: stateNode,
    assets: (stateNode.children ?? []).filter((child) => child.type === 'asset'),
    refs: findRefsForNode(workspaceData, stateNode),
  }))
  const assets = assetNodes.map((assetNode) => ({
    node: assetNode,
    unit: assetReferenceUnitForNode(workspaceData, assetNode),
    refs: findRefsForNode(workspaceData, assetNode),
  }))
  const dependencies = uniqueSettingDependencies([
    ...buildRefDependencies(workspaceData, [node, ...stateNodes]),
    ...assets.flatMap((asset) => buildAssetDependencies(asset)),
  ])

  return { states, assets, dependencies }
}

function collectHierarchyDescendants(node: HierarchyNode): HierarchyNode[] {
  return (node.children ?? []).flatMap((child) => [child, ...collectHierarchyDescendants(child)])
}

function uniqueHierarchyNodes(nodes: HierarchyNode[]): HierarchyNode[] {
  return Array.from(new Map(nodes.map((node) => [node.id, node])).values())
}

function buildRefDependencies(workspaceData: ContentSourceWorkspaceData, nodes: HierarchyNode[]): SettingScopeDependency[] {
  return nodes.flatMap((node) => {
    const refDependencies = findRefsForNode(workspaceData, node).flatMap((ref) =>
      ref.downstream.map((target) => ({
        id: `ref:${node.id}:${ref.id}:${target}`,
        title: target,
        sourceTitle: ref.title,
        kind: 'ref' as const,
        state: ref.status,
        preview: ref.summary,
        action: `${ref.id} affects ${target}`,
      })),
    )
    const impactDependencies = Object.values(workspaceData.shotWorkspaceDetails).flatMap((workspace) =>
      workspace.impacts
        .filter((impact) => hierarchyNodeMatchesRef(node, impact.source))
        .flatMap((impact) =>
          impact.affects.map((target) => ({
            id: `impact:${node.id}:${impact.source}:${target}`,
            title: target,
            sourceTitle: impact.source,
            kind: impact.kind,
            state: impact.state,
            preview: impact.change,
            action: '下游输入需要重新检查',
          })),
        ),
    )
    return [...refDependencies, ...impactDependencies]
  })
}

function buildAssetDependencies(asset: SettingScopeAsset): SettingScopeDependency[] {
  return asset.unit.downstream.map((item) => ({
    id: `asset:${asset.node.id}:${item.id}`,
    title: item.title,
    sourceTitle: asset.node.title,
    kind: item.kind,
    ownerNodeId: item.ownerNodeId,
    momentId: item.momentId,
    shotId: item.shotId,
    state: item.state,
    dependencyHash: item.dependencyHash,
    preview: item.preview,
    action: item.action,
  }))
}

function uniqueSettingDependencies(items: SettingScopeDependency[]): SettingScopeDependency[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
}

function findRefsForNode(workspaceData: ContentSourceWorkspaceData, node: HierarchyNode): EditableRef[] {
  return Object.values(workspaceData.shotWorkspaceDetails).flatMap((workspace) => {
    const refs = node.type === 'asset' ? workspace.assets : workspace.settings
    return refs.filter((ref) => hierarchyNodeMatchesRef(node, ref.id))
  })
}

function hierarchyNodeMatchesRef(node: HierarchyNode, refId: string): boolean {
  const tokens = hierarchyNodeRefTokens(node)
  return tokens.some((token) => refId === token || refId.endsWith(`/${token}`))
}

function hierarchyNodeRefTokens(node: HierarchyNode): string[] {
  const idParts = node.id.split('/')
  const lastIdPart = idParts[idParts.length - 1]
  return Array.from(new Set([
    node.id,
    node.id.replace(/^setting\//, '').replace(/^asset\//, ''),
    lastIdPart,
  ].filter(Boolean)))
}

function assetReferenceUnitForNode(workspaceData: ContentSourceWorkspaceData, node: HierarchyNode): PreviewAssetReferenceUnit {
  const existingUnit = workspaceData.assetReferenceUnits[node.id]
  if (existingUnit) return existingUnit
  return {
    assetId: node.id,
    title: node.title,
    path: `content_units/cu_${slugifyNodeTitle(node.id)}/content_unit.json`,
    contentUnitId: `cu_${slugifyNodeTitle(node.id)}`,
    contentUnitType: 'asset_ref',
    outputKind: 'image',
    editPrompt: `${node.title} 的参考图内容单元，确认后作为下游生成输入依赖。`,
    usage: `${node.title} 是一个可确认的参考图标识，下游内容单元通过 asset_ref 依赖它的确认态。`,
    lockPolicy: '当参考图候选选择发生变化时，依赖旧 input hash 的下游内容单元标记为 stale。',
    selectionState: node.state === 'missing' ? 'needs_candidate' : 'ready',
    upstream: [],
    candidates: [],
    downstream: [],
  }
}

function findChildForNode(workspaceData: ContentSourceWorkspaceData, node: HierarchyNode, shot: PreviewShot): ShotChildOption | undefined {
  const workspace = shotWorkspaceFor(workspaceData, shot.id)
  return [...workspace.keyframes, ...workspace.storyboards].find((item) => item.id === node.id)
}

function nodeTypeLabel(type: HierarchyNodeType) {
  switch (type) {
    case 'production':
      return 'production'
    case 'setting':
      return 'setting'
    case 'state':
      return 'state'
    case 'asset':
      return 'asset'
    case 'segment':
      return 'seg'
    case 'scene_moment':
      return 'scene_moment'
    case 'group':
      return 'group'
    case 'shot':
      return 'shot'
    case 'expression_unit':
      return 'expression_unit'
    case 'audio_cue':
      return 'audio_cue'
    case 'storyboard':
      return 'storyboard'
    case 'keyframe':
      return 'keyframe'
  }
}

function nodeTypeBadge(type: HierarchyNodeType) {
  switch (type) {
    case 'production':
      return 'Prod'
    case 'setting':
      return 'Setting'
    case 'state':
      return 'State'
    case 'asset':
      return 'Asset'
    case 'segment':
      return 'Segment'
    case 'scene_moment':
      return 'Scene'
    case 'group':
      return 'Group'
    case 'shot':
      return 'Shot'
    case 'expression_unit':
      return 'Expr'
    case 'storyboard':
      return 'Story'
    case 'keyframe':
      return 'Key'
  }
}

function previewKindLabel(type: HierarchyNodeType) {
  if (type === 'group') return '分组预览'
  if (type === 'keyframe') return '关键帧预览'
  if (type === 'storyboard') return '分镜预览'
  if (type === 'shot') return '镜头预览'
  if (type === 'expression_unit') return '表达单元预览'
  if (type === 'audio_cue') return '声音提示预览'
  if (type === 'asset') return '资产预览'
  if (type === 'setting' || type === 'state') return '设定预览'
  return '结构预览'
}

function previewTitleForNode(node: HierarchyNode, shot: PreviewShot, child?: ShotChildOption) {
  if (child) return child.title
  if (node.type === 'group') return `${node.title} 选择集合`
  if (node.type === 'shot') return shot.title
  if (node.type === 'expression_unit') return node.title
  if (node.type === 'audio_cue') return node.title
  if (node.type === 'asset' || node.type === 'setting' || node.type === 'state') return node.title
  return `${node.title} 的制作范围`
}

function previewCopyForNode(node: HierarchyNode, shot: PreviewShot, child?: ShotChildOption) {
  if (child) return child.summary
  if (node.type === 'group') return '分组只用于把同一层级的候选集合收纳起来，帮助在左侧保持清晰层级；真实编辑仍发生在下方的 shot、expression、keyframe 或 storyboard 节点。'
  if (node.type === 'shot') return `${shot.expression} ${shot.camera}，时长 ${shot.duration}。`
  if (node.type === 'expression_unit') return '表达单元定义 scene_moment 中的表演、情绪和潜台词约束，可同时影响多个 shot、keyframe 和 storyboard。'
  if (node.type === 'audio_cue') return 'Audio cue 是 scene_moment 下独立的声音、音乐、环境或对白规划对象，可绑定 shot、storyboard 和 timing。'
  if (node.type === 'asset') return '资产节点是可确认的参考图标识；下面先编辑它自己的 asset_ref 内容单元和候选确认，再预览依赖这个确认态的下游节点。'
  if (node.type === 'setting' || node.type === 'state') return '设定预览展示当前空间、状态或光线条件；下面编辑区维护结构化字段，子节点区展示受影响的下游制作单元。'
  return '结构节点的预览展示该层级覆盖的镜头范围；下面编辑区用于管理组织信息，子节点区展示下一层制作节点。'
}

function stateLabel(status: NonNullable<HierarchyNode['state']>) {
  if (status === 'current') return '当前'
  if (status === 'changed') return '已变更'
  if (status === 'missing') return '缺引用'
  if (status === 'locked') return '已锁定'
  if (status === 'candidate') return '候选'
  if (status === 'draft') return '草稿'
  return selectionStateText(status)
}

function shouldShowTreeState(status: HierarchyNode['state']) {
  return status === 'changed' || status === 'missing' || status === 'stale' || status === 'candidate' || status === 'draft' || status === 'needs_candidate'
}

function selectionStateText(status: SelectionState) {
  switch (status) {
    case 'selected':
      return '已选择'
    case 'stale':
      return '选择过期'
    case 'needs_candidate':
      return '待选候选'
    case 'ready':
      return '可生成'
  }
}

function refStatusText(status: RefStatus) {
  switch (status) {
    case 'current':
      return '当前'
    case 'changed':
      return '已变更'
    case 'missing':
      return '缺引用'
    case 'locked':
      return '已锁定'
  }
}

function dependencyStateText(status: RefStatus | SelectionState) {
  if (status === 'current' || status === 'changed' || status === 'missing' || status === 'locked') return refStatusText(status)
  return selectionStateText(status)
}

function childStatusText(status: ChildStatus) {
  switch (status) {
    case 'selected':
      return '已选择'
    case 'candidate':
      return '候选'
    case 'stale':
      return '已过期'
    case 'draft':
      return '草稿'
  }
}

function assetCandidateConfirmationLabel(status: PreviewAssetCandidate['confirmation']) {
  switch (status) {
    case 'confirmed':
      return '已确认'
    case 'review':
      return '待确认'
    case 'stale':
      return '旧输入'
  }
}

function dependencyStateLabel(status: SettingScopeDependency['state']) {
  if (status === 'current' || status === 'changed' || status === 'missing' || status === 'locked') return refStatusText(status)
  if (status === 'candidate' || status === 'draft') return childStatusText(status)
  return selectionStateText(status)
}

function stillSheetStyle(position: string): CSSProperties {
  const [x, y] = position.split(' ')
  return {
    width: '200%',
    height: '200%',
    maxWidth: 'none',
    objectFit: 'cover',
    transform: `translate(${x === '100%' ? '-50%' : '0'}, ${y === '100%' ? '-50%' : '0'})`,
    transformOrigin: 'top left',
  }
}
