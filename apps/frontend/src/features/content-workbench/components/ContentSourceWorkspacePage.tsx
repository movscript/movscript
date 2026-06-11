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

import {
  assetReferenceUnits,
  expressionUnitsByMoment,
  hierarchyTree,
  previewMoments,
  shotWorkspaceDetails,
} from '../domain/sourceWorkspaceFixtures'
import {
  addTargetForSelectedNode,
  appendChildNode,
  buildChildNodePath,
  countHierarchyNodes,
  filterHierarchyTree,
  findHierarchyNode,
  getExpandableNodeIds,
  slugifyNodeTitle,
  type AddTarget,
} from '../domain/sourceWorkspaceTree'
import type {
  ChildStatus,
  EditableRef,
  ExpressionUnit,
  HierarchyNode,
  HierarchyNodeType,
  PreviewAssetCandidate,
  PreviewAssetDownstream,
  PreviewAssetReferenceUnit,
  PreviewAssetUpstream,
  PreviewCandidate,
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
} from '../domain/sourceWorkspaceTypes'

import './ContentSourceWorkspacePage.css'

const stillSheetUrl = new URL('../assets/production-stills-sheet.png', import.meta.url).href

export default function ContentSourceWorkspacePage() {
  const [productionTree, setProductionTree] = useState<HierarchyNode[]>(hierarchyTree)
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [addTarget, setAddTarget] = useState<Pick<AddTarget, 'parentId' | 'type'> | null>(null)
  const [selectedMomentId, setSelectedMomentId] = useState(previewMoments[0].id)
  const [selectedShotId, setSelectedShotId] = useState(previewMoments[0].shots[0].id)
  const [selectedNodeId, setSelectedNodeId] = useState('shot_phone_press')
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set(getExpandableNodeIds(hierarchyTree)))
  const [mode, setMode] = useState<PreviewMode>('structure')
  const [query, setQuery] = useState('')
  const [selectionByShot, setSelectionByShot] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      previewMoments.flatMap((moment) =>
        moment.shots.map((shot) => [
          shot.id,
          shot.contentUnit.candidates.find((candidate) => candidate.selected)?.id ?? '',
        ]),
      ),
    ),
  )
  const [selectionByAsset, setSelectionByAsset] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.values(assetReferenceUnits).map((unit) => [
        unit.assetId,
        unit.candidates.find((candidate) => candidate.selected)?.id ?? '',
      ]),
    ),
  )

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
  }, [query])
  const visibleTree = useMemo(() => filterHierarchyTree(productionTree, query), [productionTree, query])
  const selectedNode = findHierarchyNode(productionTree, selectedNodeId) ?? productionTree[0]
  const selectedAddTarget = useMemo(
    () => addTargetForSelectedNode(selectedNode),
    [selectedNode],
  )

  const selectedMoment = filteredMoments.find((moment) => moment.id === selectedMomentId) ?? filteredMoments[0] ?? previewMoments[0]
  const selectedShot = selectedMoment.shots.find((shot) => shot.id === selectedShotId) ?? selectedMoment.shots[0]
  const selectedCandidateId = selectionByShot[selectedShot.id]

  function selectMoment(moment: PreviewMoment) {
    setSelectedMomentId(moment.id)
    setSelectedShotId(moment.shots[0]?.id ?? '')
    setSelectedNodeId(moment.id)
  }

  function selectCandidate(candidateId: string) {
    setSelectionByShot((current) => ({ ...current, [selectedShot.id]: candidateId }))
    setMode('select')
  }

  function selectAssetCandidate(assetId: string, candidateId: string) {
    setSelectionByAsset((current) => ({ ...current, [assetId]: candidateId }))
    setMode('select')
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
    const id = `${childType}_custom_${Date.now()}`
    const pathSlug = slugifyNodeTitle(title)
    const node: HierarchyNode = {
      id,
      type: childType,
      title,
      path: buildChildNodePath(parentNode, pathSlug, childType),
      state: 'ready',
      children: [],
    }
    setProductionTree((current) => appendChildNode(current, parentNode.id, node))
    setExpandedNodeIds((current) => new Set([...current, parentNode.id]))
    setSelectedNodeId(id)
    setNewNodeTitle('')
    setAddTarget(null)
    setQuery('')
  }

  function cancelChildNodeCreation() {
    setNewNodeTitle('')
    setAddTarget(null)
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
            <Badge variant="outline">{countHierarchyNodes(productionTree)} nodes</Badge>
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
          onSelectAssetCandidate={selectAssetCandidate}
          onJumpToNode={jumpToNode}
        />
      </section>
    </main>
  )
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
  onSelectAssetCandidate,
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
  onSelectAssetCandidate: (assetId: string, candidateId: string) => void
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  const linkedRefs = findRefsForNode(node)
  const linkedChild = findChildForNode(node, selectedShot)
  const workspace = shotWorkspaceDetails[selectedShot.id]
  const currentMoment = node.type === 'scene_moment' || node.type === 'group'
    ? moments.find((moment) => moment.id === (node.momentId ?? node.id)) ?? selectedMoment
    : selectedMoment
  const currentExpressionUnits = expressionUnitsByMoment[currentMoment.id] ?? []
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
            onJumpToNode={onJumpToNode}
          />
        ) : (
          <>
        <section className="content-source-workspace-entity-section">
          <div className="content-source-workspace-entity-section__title">
            <span className="content-source-workspace__eyebrow">Editor</span>
            <strong>{nodeTypeLabel(node.type)} edit surface</strong>
          </div>
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
            </PreviewPacket>
          ) : null}
          {node.type === 'keyframe' || node.type === 'storyboard' ? (
            <PreviewPacket icon={node.type === 'keyframe' ? Frame : Image} title={`${nodeTypeLabel(node.type)} Editor`} meta={linkedChild?.id ?? node.id}>
              <ShotChildList
                items={node.type === 'keyframe' ? workspace.keyframes : workspace.storyboards}
                stillPosition={selectedShot.stillPosition}
              />
            </PreviewPacket>
          ) : null}
          {node.type === 'expression_unit' ? (
            <PreviewPacket icon={Sparkles} title="Expression Unit Editor" meta={node.id}>
              <ExpressionUnitList items={currentExpressionUnits.filter((unit) => unit.id === node.id)} />
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
  onJumpToNode,
}: {
  node: HierarchyNode
  unit: PreviewAssetReferenceUnit
  selectedCandidateId: string
  onSelectCandidate: (assetId: string, candidateId: string) => void
  onJumpToNode: (nodeId: string, momentId?: string, shotId?: string) => void
}) {
  const selectedCandidate = unit.candidates.find((candidate) => candidate.id === selectedCandidateId) ?? unit.candidates.find((candidate) => candidate.selected)
  const staleDownstreamCount = unit.downstream.filter((item) => item.state === 'stale' || item.state === 'needs_candidate').length

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
            <textarea value={unit.editPrompt} readOnly rows={4} />
          </label>
          <label className="content-source-workspace-asset-unit__field">
            <span>lock_policy</span>
            <textarea value={unit.lockPolicy} readOnly rows={3} />
          </label>
          <div className="content-source-workspace-view-jumps">
            <Button type="button" size="sm">
              <FilePenLine size={13} />
              编辑参考图单元
            </Button>
            <Button type="button" size="sm" variant="outline">
              <Wand2 size={13} />
              生成新候选
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
  const workspace = shotWorkspaceDetails[selectedShot.id]

  if (node.title === 'Shots') {
    return (
      <PreviewPacket icon={Clapperboard} title="Shots" meta={`${currentMoment.shots.length} shots`}>
        <ShotCardRow moment={currentMoment} selectedShot={selectedShot} onSelectShot={onSelectShot} />
      </PreviewPacket>
    )
  }

  if (node.title === 'Expression Units') {
    const expressionUnits = expressionUnitsByMoment[currentMoment.id] ?? []
    return (
      <PreviewPacket icon={Sparkles} title="Expression Units" meta={`${expressionUnits.length} units`}>
        <ExpressionUnitList items={expressionUnits} />
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
        const shotWorkspace = shotWorkspaceDetails[shot.id]
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
    const impactDependencies = Object.values(shotWorkspaceDetails).flatMap((workspace) =>
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
  return Object.values(shotWorkspaceDetails).flatMap((workspace) => {
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
  const existingUnit = assetReferenceUnits[node.id]
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
  const refs = Object.values(shotWorkspaceDetails).flatMap((workspace) => (type === 'asset' ? workspace.assets : workspace.settings))
  return Array.from(new Map(refs.map((ref) => [ref.id, ref])).values())
}

function findChildForNode(node: HierarchyNode, shot: PreviewShot): ShotChildOption | undefined {
  const workspace = shotWorkspaceDetails[shot.id]
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
  if (type === 'asset') return '资产预览'
  if (type === 'setting' || type === 'state') return '设定预览'
  return '结构预览'
}

function previewTitleForNode(node: HierarchyNode, shot: PreviewShot, child?: ShotChildOption) {
  if (child) return child.title
  if (node.type === 'group') return `${node.title} 选择集合`
  if (node.type === 'shot') return shot.title
  if (node.type === 'expression_unit') return node.title
  if (node.type === 'asset' || node.type === 'setting' || node.type === 'state') return node.title
  return `${node.title} 的制作范围`
}

function previewCopyForNode(node: HierarchyNode, shot: PreviewShot, child?: ShotChildOption) {
  if (child) return child.summary
  if (node.type === 'group') return '分组只用于把同一层级的候选集合收纳起来，帮助在左侧保持清晰层级；真实编辑仍发生在下方的 shot、expression、keyframe 或 storyboard 节点。'
  if (node.type === 'shot') return `${shot.expression} ${shot.camera}，时长 ${shot.duration}。`
  if (node.type === 'expression_unit') return '表达单元定义 scene_moment 中的表演、情绪和潜台词约束，可同时影响多个 shot、keyframe 和 storyboard。'
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

function assetStatusText(status: PreviewShot['assets'][number]['status']) {
  switch (status) {
    case 'ready':
      return '就绪'
    case 'missing':
      return '缺口'
    case 'locked':
      return '已锁定'
  }
}
