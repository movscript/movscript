import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronRight,
  Clapperboard,
  FilePlus2,
  FilePenLine,
  Frame,
  GitCompareArrows,
  Image,
  Layers3,
  Link2,
  Search,
  Sparkles,
  Wand2,
  type LucideIcon,
} from 'lucide-react'

import {
  Badge,
  Button,
  Input,
} from '@movscript/ui'

import { useProjectStore } from '@/shared/infrastructure/session/projectStore'

import {
  createContentSourceWorkspaceHierarchyNode,
  createContentSourceWorkspaceCandidate,
  fixtureContentSourceWorkspaceData,
  loadContentSourceWorkspaceData,
  selectContentSourceWorkspaceCandidate,
  syncContentSourceWorkspace,
  type CreatedContentSourceCandidate,
  updateContentSourceWorkspaceAudioCue,
  updateContentSourceWorkspaceExpressionUnit,
  updateContentSourceWorkspaceEditPrompt,
  updateContentSourceWorkspaceStoryboardTimeline,
  updateContentSourceWorkspaceTransition,
  type ContentSourceWorkspaceData,
} from '../domain/contentSourceWorkspaceData'
import {
  addTargetForSelectedNode,
  appendChildNode,
  buildChildNodeId,
  buildChildNodePath,
  countHierarchyNodes,
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
let activeWorkspaceData: ContentSourceWorkspaceData = fixtureContentSourceWorkspaceData
type WorkspaceDataStatus = 'fixture' | 'loading' | 'workspace' | 'fallback'
type SourceSyncStatus = 'clean' | 'dirty' | 'syncing' | 'synced' | 'error'

export default function ContentSourceWorkspacePage() {
  const projectId = useProjectStore((state) => state.current?.ID)
  const [workspaceData, setWorkspaceData] = useState<ContentSourceWorkspaceData>(fixtureContentSourceWorkspaceData)
  const [workspaceDataStatus, setWorkspaceDataStatus] = useState<WorkspaceDataStatus>('fixture')
  const [workspaceDataError, setWorkspaceDataError] = useState<string | null>(null)
  const [sourceSyncStatus, setSourceSyncStatus] = useState<SourceSyncStatus>('clean')
  activeWorkspaceData = workspaceData
  const previewMoments = workspaceData.previewMoments
  const initialMoment = previewMoments[0] ?? fixtureContentSourceWorkspaceData.previewMoments[0]
  const initialShot = initialMoment.shots[0] ?? fixtureContentSourceWorkspaceData.previewMoments[0].shots[0]

  const [productionTree, setProductionTree] = useState<HierarchyNode[]>(workspaceData.hierarchyTree)
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [addTarget, setAddTarget] = useState<Pick<AddTarget, 'parentId' | 'type'> | null>(null)
  const [selectedMomentId, setSelectedMomentId] = useState(initialMoment.id)
  const [selectedShotId, setSelectedShotId] = useState(initialShot.id)
  const [selectedNodeId, setSelectedNodeId] = useState(initialShot.id)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set(getExpandableNodeIds(workspaceData.hierarchyTree)))
  const [mode, setMode] = useState<PreviewMode>('structure')
  const [query, setQuery] = useState('')
  const [selectionByShot, setSelectionByShot] = useState<Record<string, string>>(() => selectionByShotFromMoments(workspaceData.previewMoments))
  const [selectionByAsset, setSelectionByAsset] = useState<Record<string, string>>(() => selectionByAssetFromUnits(workspaceData.assetReferenceUnits))

  useEffect(() => {
    if (!projectId) {
      setWorkspaceData(fixtureContentSourceWorkspaceData)
      resetWorkspaceState(fixtureContentSourceWorkspaceData)
      setWorkspaceDataStatus('fixture')
      setWorkspaceDataError(null)
      setSourceSyncStatus('clean')
      return
    }
    let cancelled = false
    setWorkspaceDataStatus('loading')
    setWorkspaceDataError(null)
    loadContentSourceWorkspaceData(projectId)
      .then((data) => {
        if (cancelled) return
        setWorkspaceData(data)
        resetWorkspaceState(data)
        setWorkspaceDataStatus('workspace')
        setSourceSyncStatus('clean')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setWorkspaceData(fixtureContentSourceWorkspaceData)
        resetWorkspaceState(fixtureContentSourceWorkspaceData)
        setWorkspaceDataStatus('fallback')
        setWorkspaceDataError(error instanceof Error ? error.message : 'workspace_data_load_failed')
        setSourceSyncStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

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
  const selectedNode = findHierarchyNode(productionTree, selectedNodeId) ?? productionTree[0]
  const selectedAddTarget = useMemo(
    () => addTargetForSelectedNode(selectedNode),
    [selectedNode],
  )

  const selectedMoment = filteredMoments.find((moment) => moment.id === selectedMomentId) ?? filteredMoments[0] ?? previewMoments[0]
  const selectedShot = selectedMoment.shots.find((shot) => shot.id === selectedShotId) ?? selectedMoment.shots[0] ?? fixtureContentSourceWorkspaceData.previewMoments[0].shots[0]
  const selectedCandidateId = selectionByShot[selectedShot.id]

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
    setWorkspaceData((current) => updateWorkspaceContentUnitSelection(current, contentUnitId, candidateId))
    setMode('select')
    if (!projectId || workspaceData.source !== 'workspace') return
    markSourceDirty()
    selectContentSourceWorkspaceCandidate({
      projectId,
      contentUnitId,
      candidateId,
    }).catch((error: unknown) => {
      setWorkspaceDataStatus('fallback')
      setWorkspaceDataError(error instanceof Error ? error.message : 'content_unit_selection_failed')
    })
  }

  function selectAssetCandidate(assetId: string, candidateId: string) {
    setSelectionByAsset((current) => ({ ...current, [assetId]: candidateId }))
    setMode('select')
    if (!projectId || workspaceData.source !== 'workspace') return
    markSourceDirty()
    const unit = workspaceData.assetReferenceUnits[assetId]
    const candidate = unit?.candidates.find((item) => item.id === candidateId)
    if (!unit) return
    selectContentSourceWorkspaceCandidate({
      projectId,
      contentUnitId: unit.contentUnitId,
      candidateId,
      resourceId: candidate?.resourceId,
    }).catch((error: unknown) => {
      setWorkspaceDataStatus('fallback')
      setWorkspaceDataError(error instanceof Error ? error.message : 'content_unit_selection_failed')
    })
  }

  function createCandidateForContentUnit(contentUnit: PreviewContentUnit): Promise<void> {
    if (!projectId || workspaceData.source !== 'workspace') return Promise.resolve()
    markSourceDirty()
    return createContentSourceWorkspaceCandidate({
      projectId,
      contentUnitId: contentUnit.id,
      outputKind: contentUnit.outputKind,
      promptText: contentUnit.editPrompt,
    })
      .then((candidate) => {
        setWorkspaceData((current) => updateWorkspaceContentUnitCandidate(current, contentUnit.id, candidate))
      })
      .catch((error: unknown) => {
        setWorkspaceDataStatus('fallback')
        setWorkspaceDataError(error instanceof Error ? error.message : 'content_candidate_create_failed')
        throw error
      })
  }

  function createCandidateForAsset(assetId: string): Promise<void> {
    const unit = workspaceData.assetReferenceUnits[assetId]
    if (!unit || !projectId || workspaceData.source !== 'workspace') return Promise.resolve()
    markSourceDirty()
    return createContentSourceWorkspaceCandidate({
      projectId,
      contentUnitId: unit.contentUnitId,
      outputKind: unit.outputKind,
      promptText: unit.editPrompt,
    })
      .then((candidate) => {
        setWorkspaceData((current) => updateWorkspaceAssetCandidate(current, assetId, candidate))
      })
      .catch((error: unknown) => {
        setWorkspaceDataStatus('fallback')
        setWorkspaceDataError(error instanceof Error ? error.message : 'asset_candidate_create_failed')
        throw error
      })
  }

  function updateAssetPrompt(assetId: string, text: string): Promise<void> {
    const unit = workspaceData.assetReferenceUnits[assetId]
    if (!unit) return Promise.resolve()
    setWorkspaceData((current) => {
      const currentUnit = current.assetReferenceUnits[assetId] ?? unit
      return {
        ...current,
        assetReferenceUnits: {
          ...current.assetReferenceUnits,
          [assetId]: {
            ...currentUnit,
            editPrompt: text,
          },
        },
      }
    })
    if (!projectId || workspaceData.source !== 'workspace') return Promise.resolve()
    markSourceDirty()
    return updateContentSourceWorkspaceEditPrompt({
      projectId,
      targetPath: unit.path,
      text,
    }).catch((error: unknown) => {
      setWorkspaceDataStatus('fallback')
      setWorkspaceDataError(error instanceof Error ? error.message : 'content_unit_prompt_update_failed')
      throw error
    })
  }

  function updateContentUnitPrompt(contentUnitId: string, targetPath: string, text: string): Promise<void> {
    setWorkspaceData((current) => updateWorkspaceContentUnitPrompt(current, contentUnitId, text))
    if (!projectId || workspaceData.source !== 'workspace') return Promise.resolve()
    markSourceDirty()
    return updateContentSourceWorkspaceEditPrompt({
      projectId,
      targetPath,
      text,
    }).catch((error: unknown) => {
      setWorkspaceDataStatus('fallback')
      setWorkspaceDataError(error instanceof Error ? error.message : 'content_unit_prompt_update_failed')
      throw error
    })
  }

  function updateExpressionUnit(unit: ExpressionUnit): Promise<void> {
    setWorkspaceData((current) => updateWorkspaceExpressionUnit(current, unit))
    if (!projectId || workspaceData.source !== 'workspace') return Promise.resolve()
    markSourceDirty()
    return updateContentSourceWorkspaceExpressionUnit({
      projectId,
      targetPath: unit.path,
      title: unit.title,
      kind: unit.kind,
      text: unit.text,
      summary: unit.summary,
      speaker: unit.speaker,
      note: unit.note,
    }).catch((error: unknown) => {
      setWorkspaceDataStatus('fallback')
      setWorkspaceDataError(error instanceof Error ? error.message : 'expression_unit_update_failed')
      throw error
    })
  }

  function updateAudioCue(cue: AudioCue): Promise<void> {
    setWorkspaceData((current) => updateWorkspaceAudioCue(current, cue))
    if (!projectId || workspaceData.source !== 'workspace') return Promise.resolve()
    markSourceDirty()
    return updateContentSourceWorkspaceAudioCue({
      projectId,
      targetPath: cue.path,
      title: cue.title,
      cueKind: cue.cueKind,
      promptHint: cue.promptHint,
      shotRef: cue.shotRef,
      storyboardRef: cue.storyboardRef,
      timing: cue.timing,
      assetRefs: cue.assetRefs,
    }).catch((error: unknown) => {
      setWorkspaceDataStatus('fallback')
      setWorkspaceDataError(error instanceof Error ? error.message : 'audio_cue_update_failed')
      throw error
    })
  }

  function updateNodeTransition(nodeId: string, targetPath: string, transition: HierarchyTransition): Promise<void> {
    setWorkspaceData((current) => updateWorkspaceHierarchyNodePlanning(current, nodeId, { transition }))
    if (!projectId || workspaceData.source !== 'workspace') return Promise.resolve()
    markSourceDirty()
    return updateContentSourceWorkspaceTransition({
      projectId,
      targetPath,
      transition,
    }).catch((error: unknown) => {
      setWorkspaceDataStatus('fallback')
      setWorkspaceDataError(error instanceof Error ? error.message : 'entity_transition_update_failed')
      throw error
    })
  }

  function updateStoryboardTimeline(nodeId: string, targetPath: string, timeline: StoryboardTimeline): Promise<void> {
    setWorkspaceData((current) => updateWorkspaceHierarchyNodePlanning(current, nodeId, { storyboardTimeline: timeline }))
    if (!projectId || workspaceData.source !== 'workspace') return Promise.resolve()
    markSourceDirty()
    return updateContentSourceWorkspaceStoryboardTimeline({
      projectId,
      targetPath,
      timeline,
    }).catch((error: unknown) => {
      setWorkspaceDataStatus('fallback')
      setWorkspaceDataError(error instanceof Error ? error.message : 'storyboard_timeline_update_failed')
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
    if (!projectId || workspaceData.source !== 'workspace') return
    markSourceDirty()
    createContentSourceWorkspaceHierarchyNode({
      projectId,
      type: childType,
      id: pathSlug,
      title,
      targetPath: path,
      parentNode,
    }).catch((error: unknown) => {
      setWorkspaceDataStatus('fallback')
      setWorkspaceDataError(error instanceof Error ? error.message : 'hierarchy_node_create_failed')
    })
  }

  function markSourceDirty() {
    setSourceSyncStatus((current) => current === 'syncing' ? current : 'dirty')
  }

  function syncWorkspaceSource() {
    if (!projectId || workspaceData.source !== 'workspace' || sourceSyncStatus === 'syncing') return
    setSourceSyncStatus('syncing')
    setWorkspaceDataError(null)
    syncContentSourceWorkspace({ projectId })
      .then(() => loadContentSourceWorkspaceData(projectId))
      .then((data) => {
        setWorkspaceData(data)
        resetWorkspaceState(data)
        setWorkspaceDataStatus('workspace')
        setSourceSyncStatus('synced')
      })
      .catch((error: unknown) => {
        setSourceSyncStatus('error')
        setWorkspaceDataError(error instanceof Error ? error.message : 'workspace_sync_failed')
      })
  }

  function cancelChildNodeCreation() {
    setNewNodeTitle('')
    setAddTarget(null)
  }

  function resetWorkspaceState(data: ContentSourceWorkspaceData) {
    const nextMoment = data.previewMoments[0] ?? fixtureContentSourceWorkspaceData.previewMoments[0]
    const nextShot = nextMoment.shots[0] ?? fixtureContentSourceWorkspaceData.previewMoments[0].shots[0]
    const nextTree = data.hierarchyTree.length > 0 ? data.hierarchyTree : fixtureContentSourceWorkspaceData.hierarchyTree
    setProductionTree(nextTree)
    setExpandedNodeIds(new Set(getExpandableNodeIds(nextTree)))
    setSelectedMomentId(nextMoment.id)
    setSelectedShotId(nextShot.id)
    setSelectedNodeId(nextShot.id)
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

  return (
    <main className="content-source-workspace content-source-workspace--source-workspace" data-testid="content-source-workspace-page">
      <aside className="content-source-workspace-nav">
        <div className="content-source-workspace-nav__header">
          <div>
            <span className="content-source-workspace__eyebrow">Source Workspace</span>
            <h2>Ontology Tree</h2>
          </div>
          <div className="content-source-workspace-nav__header-actions">
            <Badge variant={workspaceDataStatus === 'workspace' ? 'outline' : 'soft'}>{workspaceDataStatusLabel(workspaceDataStatus)}</Badge>
            <Badge variant={sourceSyncStatus === 'dirty' || sourceSyncStatus === 'error' ? 'soft' : 'outline'}>{sourceSyncStatusLabel(sourceSyncStatus)}</Badge>
            <Badge variant="outline">{countHierarchyNodes(productionTree)} nodes</Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!projectId || workspaceData.source !== 'workspace' || sourceSyncStatus === 'syncing'}
              onClick={syncWorkspaceSource}
            >
              <GitCompareArrows size={13} />
              {sourceSyncStatus === 'syncing' ? '同步中' : 'Interpret'}
            </Button>
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
        </div>
        <div className="content-source-workspace-nav__search">
          <Search size={14} />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索层级节点或源文件" />
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
          {workspaceDataError ? <small>{workspaceDataError}</small> : null}
        </div>
      </aside>

      <section className="content-source-workspace__stage">
        <HierarchyContentView
          node={selectedNode}
          moments={filteredMoments}
          selectedMoment={selectedMoment}
          selectedShot={selectedShot}
          onSelectMoment={selectMoment}
          onSelectShot={selectShot}
          selectedCandidateId={selectedCandidateId}
          selectedAssetCandidateId={selectionByAsset[selectedNode.id] ?? ''}
          onSelectCandidate={selectCandidate}
          onSelectContentUnitCandidate={selectContentUnitCandidate}
          onSelectAssetCandidate={selectAssetCandidate}
          onCreateContentUnitCandidate={createCandidateForContentUnit}
          onCreateAssetCandidate={createCandidateForAsset}
          onUpdateAssetPrompt={updateAssetPrompt}
          onUpdateContentUnitPrompt={updateContentUnitPrompt}
          onUpdateExpressionUnit={updateExpressionUnit}
          onUpdateAudioCue={updateAudioCue}
          onUpdateTransition={updateNodeTransition}
          onUpdateStoryboardTimeline={updateStoryboardTimeline}
          onJumpToNode={jumpToNode}
        />
      </section>
    </main>
  )
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

function shotWorkspaceFor(shotId: string): ShotWorkspaceDetails {
  return activeWorkspaceData.shotWorkspaceDetails[shotId] ?? {
    settings: [],
    assets: [],
    keyframes: [],
    storyboards: [],
    impacts: [],
  }
}

function workspaceDataStatusLabel(status: WorkspaceDataStatus): string {
  switch (status) {
    case 'workspace':
      return 'Live source'
    case 'loading':
      return 'Loading'
    case 'fallback':
      return 'Fixture fallback'
    case 'fixture':
      return 'Fixture'
  }
}

function sourceSyncStatusLabel(status: SourceSyncStatus): string {
  switch (status) {
    case 'clean':
      return 'Interpreted'
    case 'dirty':
      return 'Needs interpret'
    case 'syncing':
      return 'Interpreting'
    case 'synced':
      return 'Synced'
    case 'error':
      return 'Sync failed'
  }
}

function updateWorkspaceContentUnitPrompt(
  data: ContentSourceWorkspaceData,
  contentUnitId: string,
  text: string,
): ContentSourceWorkspaceData {
  return {
    ...data,
    previewMoments: data.previewMoments.map((moment) => ({
      ...moment,
      shots: moment.shots.map((shot) => (
        shot.contentUnit.id === contentUnitId
          ? {
            ...shot,
            contentUnit: {
              ...shot.contentUnit,
              editPrompt: text,
            },
          }
          : shot
      )),
    })),
    shotWorkspaceDetails: Object.fromEntries(
      Object.entries(data.shotWorkspaceDetails).map(([shotId, workspace]) => [
        shotId,
        {
          ...workspace,
          keyframes: updateShotChildContentUnitPrompt(workspace.keyframes, contentUnitId, text),
          storyboards: updateShotChildContentUnitPrompt(workspace.storyboards, contentUnitId, text),
        },
      ]),
    ),
  }
}

function updateShotChildContentUnitPrompt(
  items: ShotChildOption[],
  contentUnitId: string,
  text: string,
): ShotChildOption[] {
  return items.map((item) => item.contentUnit?.id === contentUnitId
    ? {
      ...item,
      contentUnit: {
        ...item.contentUnit,
        editPrompt: text,
      },
    }
    : item)
}

function updateWorkspaceContentUnitSelection(
  data: ContentSourceWorkspaceData,
  contentUnitId: string,
  candidateId: string,
): ContentSourceWorkspaceData {
  return {
    ...data,
    previewMoments: data.previewMoments.map((moment) => ({
      ...moment,
      shots: moment.shots.map((shot) => (
        shot.contentUnit.id === contentUnitId
          ? {
            ...shot,
            contentUnit: selectPreviewContentUnitCandidate(shot.contentUnit, candidateId),
          }
          : shot
      )),
    })),
    shotWorkspaceDetails: Object.fromEntries(
      Object.entries(data.shotWorkspaceDetails).map(([shotId, workspace]) => [
        shotId,
        {
          ...workspace,
          keyframes: updateShotChildContentUnitSelection(workspace.keyframes, contentUnitId, candidateId),
          storyboards: updateShotChildContentUnitSelection(workspace.storyboards, contentUnitId, candidateId),
        },
      ]),
    ),
  }
}

function updateWorkspaceContentUnitCandidate(
  data: ContentSourceWorkspaceData,
  contentUnitId: string,
  candidate: CreatedContentSourceCandidate,
): ContentSourceWorkspaceData {
  return {
    ...data,
    previewMoments: data.previewMoments.map((moment) => ({
      ...moment,
      shots: moment.shots.map((shot) => (
        shot.contentUnit.id === contentUnitId
          ? {
            ...shot,
            contentUnit: appendPreviewCandidate(shot.contentUnit, candidate),
          }
          : shot
      )),
    })),
    shotWorkspaceDetails: Object.fromEntries(
      Object.entries(data.shotWorkspaceDetails).map(([shotId, workspace]) => [
        shotId,
        {
          ...workspace,
          keyframes: updateShotChildContentUnitCandidate(workspace.keyframes, contentUnitId, candidate),
          storyboards: updateShotChildContentUnitCandidate(workspace.storyboards, contentUnitId, candidate),
        },
      ]),
    ),
  }
}

function updateWorkspaceAssetCandidate(
  data: ContentSourceWorkspaceData,
  assetId: string,
  candidate: CreatedContentSourceCandidate,
): ContentSourceWorkspaceData {
  const unit = data.assetReferenceUnits[assetId]
  if (!unit) return data
  return {
    ...data,
    assetReferenceUnits: {
      ...data.assetReferenceUnits,
      [assetId]: {
        ...unit,
        candidates: [
          ...unit.candidates,
          {
            ...candidate,
            resourceId: candidate.resourceId,
            confirmation: 'review',
          },
        ],
      },
    },
  }
}

function updateShotChildContentUnitSelection(
  items: ShotChildOption[],
  contentUnitId: string,
  candidateId: string,
): ShotChildOption[] {
  return items.map((item) => item.contentUnit?.id === contentUnitId
    ? {
      ...item,
      contentUnit: selectPreviewContentUnitCandidate(item.contentUnit, candidateId),
    }
    : item)
}

function updateShotChildContentUnitCandidate(
  items: ShotChildOption[],
  contentUnitId: string,
  candidate: CreatedContentSourceCandidate,
): ShotChildOption[] {
  return items.map((item) => item.contentUnit?.id === contentUnitId
    ? {
      ...item,
      contentUnit: appendPreviewCandidate(item.contentUnit, candidate),
    }
    : item)
}

function selectPreviewContentUnitCandidate(contentUnit: PreviewContentUnit, candidateId: string): PreviewContentUnit {
  return {
    ...contentUnit,
    selectionState: 'selected',
    candidates: contentUnit.candidates.map((candidate) => ({
      ...candidate,
      selected: candidate.id === candidateId,
    })),
  }
}

function appendPreviewCandidate(contentUnit: PreviewContentUnit, candidate: CreatedContentSourceCandidate): PreviewContentUnit {
  return {
    ...contentUnit,
    selectionState: contentUnit.selectionState === 'selected' ? 'selected' : 'needs_candidate',
    candidates: [
      ...contentUnit.candidates,
      {
        id: candidate.id,
        title: candidate.title,
        model: candidate.model,
        inputHash: candidate.inputHash,
        note: candidate.note,
      },
    ],
  }
}

function updateWorkspaceExpressionUnit(
  data: ContentSourceWorkspaceData,
  unit: ExpressionUnit,
): ContentSourceWorkspaceData {
  return {
    ...data,
    expressionUnitsByMoment: Object.fromEntries(
      Object.entries(data.expressionUnitsByMoment).map(([momentId, units]) => [
        momentId,
        units.map((item) => item.id === unit.id ? unit : item),
      ]),
    ),
    hierarchyTree: updateHierarchyNodeTitle(data.hierarchyTree, unit.id, unit.title),
  }
}

function updateWorkspaceAudioCue(
  data: ContentSourceWorkspaceData,
  cue: AudioCue,
): ContentSourceWorkspaceData {
  return {
    ...data,
    audioCuesByMoment: Object.fromEntries(
      Object.entries(data.audioCuesByMoment).map(([momentId, cues]) => [
        momentId,
        cues.map((item) => item.id === cue.id ? cue : item),
      ]),
    ),
    hierarchyTree: updateHierarchyNodeTitle(data.hierarchyTree, cue.id, cue.title),
  }
}

function updateWorkspaceHierarchyNodePlanning(
  data: ContentSourceWorkspaceData,
  nodeId: string,
  patch: Pick<Partial<HierarchyNode>, 'transition' | 'storyboardTimeline'>,
): ContentSourceWorkspaceData {
  return {
    ...data,
    hierarchyTree: updateHierarchyNodePlanning(data.hierarchyTree, nodeId, patch),
  }
}

function updateHierarchyNodePlanning(
  nodes: HierarchyNode[],
  nodeId: string,
  patch: Pick<Partial<HierarchyNode>, 'transition' | 'storyboardTimeline'>,
): HierarchyNode[] {
  return nodes.map((node) => ({
    ...node,
    ...(node.id === nodeId ? patch : {}),
    children: node.children ? updateHierarchyNodePlanning(node.children, nodeId, patch) : node.children,
  }))
}

function updateHierarchyNodeTitle(nodes: HierarchyNode[], nodeId: string, title: string): HierarchyNode[] {
  return nodes.map((node) => ({
    ...node,
    title: node.id === nodeId ? title : node.title,
    children: node.children ? updateHierarchyNodeTitle(node.children, nodeId, title) : node.children,
  }))
}

function PreviewMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
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
  moments,
  selectedMoment,
  selectedShot,
  onSelectMoment,
  onSelectShot,
  selectedCandidateId,
  selectedAssetCandidateId,
  onSelectCandidate,
  onSelectContentUnitCandidate,
  onSelectAssetCandidate,
  onCreateContentUnitCandidate,
  onCreateAssetCandidate,
  onUpdateAssetPrompt,
  onUpdateContentUnitPrompt,
  onUpdateExpressionUnit,
  onUpdateAudioCue,
  onUpdateTransition,
  onUpdateStoryboardTimeline,
  onJumpToNode,
}: {
  node: HierarchyNode
  moments: PreviewMoment[]
  selectedMoment: PreviewMoment
  selectedShot: PreviewShot
  onSelectMoment: (moment: PreviewMoment) => void
  onSelectShot: (momentId: string, shotId: string) => void
  selectedCandidateId: string
  selectedAssetCandidateId: string
  onSelectCandidate: (candidateId: string) => void
  onSelectContentUnitCandidate: (contentUnitId: string, candidateId: string) => void
  onSelectAssetCandidate: (assetId: string, candidateId: string) => void
  onCreateContentUnitCandidate: (contentUnit: PreviewContentUnit) => Promise<void>
  onCreateAssetCandidate: (assetId: string) => Promise<void>
  onUpdateAssetPrompt: (assetId: string, text: string) => Promise<void>
  onUpdateContentUnitPrompt: (contentUnitId: string, targetPath: string, text: string) => Promise<void>
  onUpdateExpressionUnit: (unit: ExpressionUnit) => Promise<void>
  onUpdateAudioCue: (cue: AudioCue) => Promise<void>
  onUpdateTransition: (nodeId: string, targetPath: string, transition: HierarchyTransition) => Promise<void>
  onUpdateStoryboardTimeline: (nodeId: string, targetPath: string, timeline: StoryboardTimeline) => Promise<void>
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  const linkedRefs = findRefsForNode(node)
  const linkedChild = findChildForNode(node, selectedShot)
  const linkedContentUnit = linkedChild?.contentUnit
  const workspace = shotWorkspaceFor(selectedShot.id)
  const currentMoment = node.type === 'scene_moment' || node.type === 'group'
    ? moments.find((moment) => moment.id === (node.momentId ?? node.id)) ?? selectedMoment
    : selectedMoment
  const currentExpressionUnits = activeWorkspaceData.expressionUnitsByMoment[currentMoment.id] ?? []
  const currentAudioCues = activeWorkspaceData.audioCuesByMoment[currentMoment.id] ?? []
  const selectedExpressionUnit = currentExpressionUnits.find((unit) => unit.id === node.id)
  const selectedAudioCue = currentAudioCues.find((cue) => cue.id === node.id)
  const groupChildren = node.children ?? []

  return (
    <div className="content-source-workspace-board">
      <section className="content-source-workspace-entity-view">
        <div className="content-source-workspace-entity-view__header">
          <div>
            <span className="content-source-workspace__eyebrow">{nodeTypeLabel(node.type)} View</span>
            <h3>{node.title}</h3>
            {node.type !== 'asset' ? <p>{node.path}</p> : null}
          </div>
          {node.state ? <Badge variant={node.state === 'current' || node.state === 'selected' ? 'outline' : 'soft'}>{stateLabel(node.state)}</Badge> : null}
        </div>

        {node.type !== 'asset' ? (
          <section className="content-source-workspace-entity-preview">
            <div className="content-source-workspace-entity-preview__visual">
              <img src={stillSheetUrl} alt="" style={stillSheetStyle(selectedShot.stillPosition)} />
              <Badge variant="outline">{previewKindLabel(node.type)}</Badge>
            </div>
            <div className="content-source-workspace-entity-preview__meta">
              <span className="content-source-workspace__eyebrow">Preview</span>
              <h4>{previewTitleForNode(node, selectedShot, linkedChild)}</h4>
              <p>{previewCopyForNode(node, selectedShot, linkedChild)}</p>
              <div className="content-source-workspace-view-jumps">
                <Button type="button" size="sm">
                  <Wand2 size={13} />
                  生成预览
                </Button>
                <Button type="button" size="sm" variant="outline">
                  <Check size={13} />
                  设为选择
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {node.type === 'asset' ? (
          <AssetReferenceDetail
            node={node}
            unit={assetReferenceUnitForNode(node)}
            selectedCandidateId={selectedAssetCandidateId}
            onSelectCandidate={onSelectAssetCandidate}
            onCreateCandidate={onCreateAssetCandidate}
            onUpdatePrompt={onUpdateAssetPrompt}
            onJumpToNode={onJumpToNode}
          />
        ) : (
          <>
            <section className="content-source-workspace-entity-section">
              <div className="content-source-workspace-entity-section__title">
                <span className="content-source-workspace__eyebrow">Editor</span>
                <strong>{nodeTypeLabel(node.type)} edit surface</strong>
              </div>
              {supportsTransitionEditor(node) ? (
                <PlanningEditor
                  node={node}
                  onUpdateTransition={onUpdateTransition}
                  onUpdateStoryboardTimeline={onUpdateStoryboardTimeline}
                />
              ) : null}
              {node.type === 'production' || node.type === 'segment' ? (
                <div className="content-source-workspace-entity-grid">
                  {moments.map((moment, momentIndex) => (
                    <section
                      key={moment.id}
                      className="content-source-workspace-moment"
                      data-active={selectedMoment.id === moment.id}
                      onClick={() => onSelectMoment(moment)}
                    >
                      <div className="content-source-workspace-moment__header">
                        <div>
                          <span className="content-source-workspace__eyebrow">Scene Moment {momentIndex + 1}</span>
                          <h3>{moment.title}</h3>
                          <p>{moment.path}</p>
                        </div>
                        <div className="content-source-workspace-moment__state">
                          <Badge variant={moment.selectionState === 'stale' ? 'soft' : 'outline'}>{selectionStateText(moment.selectionState)}</Badge>
                          <span>{moment.priority}</span>
                        </div>
                      </div>
                      <ShotCardRow moment={moment} selectedShot={selectedShot} onSelectShot={onSelectShot} />
                    </section>
                  ))}
                </div>
              ) : null}
              {node.type === 'scene_moment' ? (
                <PreviewPacket icon={Layers3} title="Scene Moment Editor" meta={`${currentMoment.shots.length} shots · ${currentExpressionUnits.length} expression_units`}>
                  <PreviewFact label="scene_moment" value={currentMoment.title} />
                  <PreviewFact label="path" value={currentMoment.path} />
                  <PreviewFact label="segment" value={currentMoment.segment} />
                  <PreviewFact label="audio_cues" value={String(currentAudioCues.length)} />
                </PreviewPacket>
              ) : null}
              {node.type === 'group' ? (
                <PreviewPacket icon={Layers3} title={`${node.title} Group`} meta={`${groupChildren.length} children`}>
                  {groupChildren.length ? (
                    <PreviewList items={groupChildren.map((child) => `${nodeTypeBadge(child.type)} · ${child.title}`)} />
                  ) : (
                    <PreviewList items={['等待候选生成']} />
                  )}
                </PreviewPacket>
              ) : null}
              {node.type === 'setting' || node.type === 'state' ? (
                <PreviewPacket icon={FilePenLine} title={`${nodeTypeLabel(node.type)} Editor`} meta={`${linkedRefs.length} linked`}>
                  <EditableRefList items={linkedRefs.length ? linkedRefs : collectEditableRefs(node.type)} />
                </PreviewPacket>
              ) : null}
              {node.type === 'shot' ? (
                <PreviewPacket icon={Clapperboard} title="Shot Editor" meta={selectedShot.contentUnit.id}>
                  <PreviewFact label="brief" value={selectedShot.expression} />
                  <PreviewFact label="camera" value={`${selectedShot.camera} · ${selectedShot.duration}`} />
                  <PreviewFact label="content_unit_type" value={selectedShot.contentUnit.type} />
                  <PreviewFact label="output_kind" value={selectedShot.contentUnit.outputKind} />
                  <ContentUnitPromptEditor contentUnit={selectedShot.contentUnit} onUpdatePrompt={onUpdateContentUnitPrompt} onCreateCandidate={onCreateContentUnitCandidate} />
                </PreviewPacket>
              ) : null}
              {node.type === 'keyframe' || node.type === 'storyboard' ? (
                <PreviewPacket icon={node.type === 'keyframe' ? Frame : Image} title={`${nodeTypeLabel(node.type)} Editor`} meta={linkedChild?.id ?? node.id}>
                  <ShotChildList
                    items={node.type === 'keyframe' ? workspace.keyframes : workspace.storyboards}
                    stillPosition={selectedShot.stillPosition}
                  />
                  {linkedContentUnit ? (
                    <>
                      <ContentUnitPromptEditor contentUnit={linkedContentUnit} onUpdatePrompt={onUpdateContentUnitPrompt} onCreateCandidate={onCreateContentUnitCandidate} />
                      <CandidateList
                        candidates={linkedContentUnit.candidates}
                        selectedCandidateId={linkedContentUnit.candidates.find((candidate) => candidate.selected)?.id ?? ''}
                        stillPosition={selectedShot.stillPosition}
                        onSelect={(candidateId) => onSelectContentUnitCandidate(linkedContentUnit.id, candidateId)}
                      />
                    </>
                  ) : (
                    <PreviewList items={['该节点尚未通过 edit_prompt 绑定 content_unit。']} />
                  )}
                </PreviewPacket>
              ) : null}
              {node.type === 'expression_unit' ? (
                <PreviewPacket icon={Sparkles} title="Expression Unit Editor" meta={node.id}>
                  {selectedExpressionUnit ? (
                    <ExpressionUnitEditor unit={selectedExpressionUnit} onUpdate={onUpdateExpressionUnit} />
                  ) : (
                    <PreviewList items={['未在当前 scene_moment 中找到 expression_unit source。']} />
                  )}
                </PreviewPacket>
              ) : null}
              {node.type === 'audio_cue' ? (
                <PreviewPacket icon={Sparkles} title="Audio Cue Editor" meta={node.id}>
                  {selectedAudioCue ? (
                    <AudioCueEditor cue={selectedAudioCue} onUpdate={onUpdateAudioCue} />
                  ) : (
                    <PreviewList items={['未在当前 scene_moment 中找到 audio_cue source。']} />
                  )}
                </PreviewPacket>
              ) : null}
            </section>

            <section className="content-source-workspace-entity-section">
              <div className="content-source-workspace-entity-section__title">
                <span className="content-source-workspace__eyebrow">Children / Relations</span>
                <strong>下游子节点、候选与影响链</strong>
              </div>
              {node.type === 'production' || node.type === 'segment' ? (
                <PreviewPacket icon={Layers3} title="Child Nodes" meta={`${moments.length} scene_moments`}>
                  <PreviewList items={moments.map((moment) => moment.path)} />
                </PreviewPacket>
              ) : null}
              {node.type === 'scene_moment' ? (
                <div className="content-source-workspace-entity-split">
                  <PreviewPacket icon={Clapperboard} title="Shots" meta={`${currentMoment.shots.length} shots`}>
                    <ShotCardRow moment={currentMoment} selectedShot={selectedShot} onSelectShot={onSelectShot} />
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
                  currentMoment={currentMoment}
                  selectedShot={selectedShot}
                  onSelectShot={onSelectShot}
                />
              ) : null}
              {node.type === 'setting' || node.type === 'state' ? (
                <SettingScopeDetail node={node} onJumpToNode={onJumpToNode} />
              ) : null}
              {node.type === 'shot' ? (
                <div className="content-source-workspace-entity-split">
                  <PreviewPacket icon={Frame} title="Keyframes" meta={`${workspace.keyframes.length} options`}>
                    <ShotChildList items={workspace.keyframes} stillPosition={selectedShot.stillPosition} />
                  </PreviewPacket>
                  <PreviewPacket icon={Image} title="Storyboards" meta={`${workspace.storyboards.length} options`}>
                    <ShotChildList items={workspace.storyboards} stillPosition={selectedShot.stillPosition} />
                  </PreviewPacket>
                  <PreviewPacket icon={Sparkles} title="Candidates / selection.json" meta={selectedCandidateId || '未选择'}>
                    <CandidateList
                      candidates={selectedShot.contentUnit.candidates}
                      selectedCandidateId={selectedCandidateId}
                      stillPosition={selectedShot.stillPosition}
                      onSelect={onSelectCandidate}
                    />
                  </PreviewPacket>
                </div>
              ) : null}
              {node.type === 'keyframe' || node.type === 'storyboard' || node.type === 'expression_unit' ? (
                <PreviewPacket icon={GitCompareArrows} title="Downstream Impact" meta={selectedShot.id}>
                  <ImpactList impacts={workspace.impacts} />
                </PreviewPacket>
              ) : null}
            </section>
          </>
        )}
      </section>
    </div>
  )
}

function SettingScopeDetail({
  node,
  onJumpToNode,
}: {
  node: HierarchyNode
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  const details = buildSettingScopeDetails(node)
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
              <p>{state.node.path}</p>
              {state.refs.length ? <EditableRefList items={state.refs} /> : null}
              <div className="content-source-workspace-setting-asset-row">
                {state.assets.map((asset) => {
                  const unit = assetReferenceUnitForNode(asset)
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
  currentMoment,
  selectedShot,
  onSelectShot,
}: {
  node: HierarchyNode
  currentMoment: PreviewMoment
  selectedShot: PreviewShot
  onSelectShot: (momentId: string, shotId: string) => void
}) {
  const workspace = shotWorkspaceFor(selectedShot.id)

  if (node.title === 'Shots') {
    return (
      <PreviewPacket icon={Clapperboard} title="Shots" meta={`${currentMoment.shots.length} shots`}>
        <ShotCardRow moment={currentMoment} selectedShot={selectedShot} onSelectShot={onSelectShot} />
      </PreviewPacket>
    )
  }

  if (node.title === 'Expression Units') {
    const expressionUnits = activeWorkspaceData.expressionUnitsByMoment[currentMoment.id] ?? []
    return (
      <PreviewPacket icon={Sparkles} title="Expression Units" meta={`${expressionUnits.length} units`}>
        <ExpressionUnitList items={expressionUnits} />
      </PreviewPacket>
    )
  }

  if (node.title === 'Audio Cues') {
    const audioCues = activeWorkspaceData.audioCuesByMoment[currentMoment.id] ?? []
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
  moment,
  selectedShot,
  onSelectShot,
}: {
  moment: PreviewMoment
  selectedShot: PreviewShot
  onSelectShot: (momentId: string, shotId: string) => void
}) {
  return (
    <div className="content-source-workspace-shot-row">
      {moment.shots.map((shot, shotIndex) => {
        const shotWorkspace = shotWorkspaceFor(shot.id)
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
    <PreviewPacket icon={GitCompareArrows} title="Transition" meta={node.path}>
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

function buildSettingScopeDetails(node: HierarchyNode): SettingScopeDetails {
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
    refs: findRefsForNode(stateNode),
  }))
  const assets = assetNodes.map((assetNode) => ({
    node: assetNode,
    unit: assetReferenceUnitForNode(assetNode),
    refs: findRefsForNode(assetNode),
  }))
  const dependencies = uniqueSettingDependencies([
    ...buildRefDependencies([node, ...stateNodes]),
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

function buildRefDependencies(nodes: HierarchyNode[]): SettingScopeDependency[] {
  return nodes.flatMap((node) => {
    const refDependencies = findRefsForNode(node).flatMap((ref) =>
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
    const impactDependencies = Object.values(activeWorkspaceData.shotWorkspaceDetails).flatMap((workspace) =>
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

function findRefsForNode(node: HierarchyNode): EditableRef[] {
  return Object.values(activeWorkspaceData.shotWorkspaceDetails).flatMap((workspace) => {
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

function assetReferenceUnitForNode(node: HierarchyNode): PreviewAssetReferenceUnit {
  const existingUnit = activeWorkspaceData.assetReferenceUnits[node.id]
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

function collectEditableRefs(type: HierarchyNodeType): EditableRef[] {
  const refs = Object.values(activeWorkspaceData.shotWorkspaceDetails).flatMap((workspace) => (type === 'asset' ? workspace.assets : workspace.settings))
  return Array.from(new Map(refs.map((ref) => [ref.id, ref])).values())
}

function findChildForNode(node: HierarchyNode, shot: PreviewShot): ShotChildOption | undefined {
  const workspace = shotWorkspaceFor(shot.id)
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

