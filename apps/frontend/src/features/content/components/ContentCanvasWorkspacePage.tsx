import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PanelResizeHandle } from '@movscript/ui/layout'
import { Film, ListFilter, Plus, Search, Star } from 'lucide-react'

import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { contentCanvasKeys } from '../application/contentCanvasQueryKeys'
import type { ContentCanvasNodePosition } from '../application/contentCanvasViewState'
import { loadContentCanvasProject } from '../application/loadContentCanvasProject'
import {
  connectSceneMomentSettingFromCanvas,
  createChildContentCanvasNode,
  createRootContentCanvasNode,
} from '../application/contentCanvasCommands'
import { buildContentCanvasGraph } from '../domain/contentCanvasGraph'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import { toast } from '@/shared/ui/toastStore'
import {
  ASSET_PROMPTS,
  CONTENT_CANVAS_SETTING_DRAG_TYPE,
  type CandidateSelections,
  type CanvasMode,
  type InspectorSelection,
  type SceneSettingGroup,
  type SettingKind,
  type StarCanvasAction,
} from './contentCanvasWorkspaceTypes'
import {
  contentCanvasGraphIndex,
  contentCanvasStructureTree,
  contentStatusLabel,
  emptyContentCanvasGraph,
  iconForContentNode,
  mergeSceneSettingGroups,
  radialNodeFromContentNode,
  radialNodesAround,
  radialPoint,
  radialVariantForKind,
  sceneSettingGroupFromNode,
  sceneSettingGroupsUsedByScene,
  sceneTimelineItemsFromGraph,
  SCENE_MAIN_NODE,
  selectedSelectionId,
  settingKindFromNode,
  uniqueContentNodes,
} from './contentCanvasWorkspaceModel'
import { ContentCanvasResizeHandle, useContentCanvasPaneLayout, useContentCanvasRadialLayout } from './contentCanvasWorkspaceLayout'
import { StarCanvas } from './ContentCanvasStarCanvas'
import { NodeInspector, SceneTimeline, TreeNode } from './ContentCanvasWorkspaceDetails'
import './ContentCanvasWorkspacePage.css'

export default function ContentCanvasWorkspacePage() {
  const paneLayout = useContentCanvasPaneLayout()
  const queryClient = useQueryClient()
  const project = useProjectStore((state) => state.current)
  const projectId = project?.ID
  const [settingQuery, setSettingQuery] = useState('')
  const [activeKind, setActiveKind] = useState<SettingKind | 'all'>('all')
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('scene_moment')
  const [activeSettingId, setActiveSettingId] = useState<string | null>(null)
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<InspectorSelection>({ kind: 'scene_moment', node: SCENE_MAIN_NODE })
  const [assetPrompts, setAssetPrompts] = useState(ASSET_PROMPTS)
  const [expressionPrompts, setExpressionPrompts] = useState<Record<string, string>>({})
  const [candidateSelections, setCandidateSelections] = useState<CandidateSelections>({})
  const [manualSceneSettingGroupsBySceneId, setManualSceneSettingGroupsBySceneId] = useState<Record<string, SceneSettingGroup[]>>({})
  const [pendingCanvasAction, setPendingCanvasAction] = useState<string | null>(null)

  const projectQuery = useQuery({
    queryKey: contentCanvasKeys.project(projectId),
    queryFn: () => loadContentCanvasProject(projectId!),
    enabled: Boolean(projectId),
  })
  const graph = useMemo(
    () => projectQuery.data ? buildContentCanvasGraph(projectQuery.data) : emptyContentCanvasGraph(),
    [projectQuery.data],
  )
  const graphIndex = useMemo(() => contentCanvasGraphIndex(graph), [graph])
  const settingNodes = useMemo(() => graph.nodes.filter((node) => node.kind === 'setting'), [graph.nodes])
  const sceneNodes = useMemo(() => graph.nodes.filter((node) => node.kind === 'scene_moment'), [graph.nodes])
  const activeSetting = useMemo(
    () => settingNodes.find((node) => node.id === activeSettingId) ?? settingNodes[0] ?? null,
    [activeSettingId, settingNodes],
  )
  const activeScene = useMemo(
    () => sceneNodes.find((node) => node.id === activeSceneId) ?? sceneNodes[0] ?? null,
    [activeSceneId, sceneNodes],
  )
  const sceneMainNode = useMemo(
    () => activeScene ? radialNodeFromContentNode(activeScene, 0, 0, 'primary') : SCENE_MAIN_NODE,
    [activeScene],
  )
  const settingMainNode = useMemo(
    () => activeSetting ? radialNodeFromContentNode(activeSetting, 0, 0, 'primary') : null,
    [activeSetting],
  )
  const sceneRelationNodes = useMemo(
    () => activeScene ? radialNodesAround(activeScene, graphIndex, ['expression_unit', 'shot', 'keyframe', 'storyboard', 'audio_cue']) : [],
    [activeScene, graphIndex],
  )
  const settingRelationNodes = useMemo(
    () => activeSetting ? radialNodesAround(activeSetting, graphIndex, ['state', 'asset']) : [],
    [activeSetting, graphIndex],
  )
  const radialLayout = useContentCanvasRadialLayout({
    projectId,
    mode: canvasMode,
    mainNodeId: canvasMode === 'scene_moment' ? activeScene?.id : activeSetting?.id,
  })
  const laidOutSceneMainNode = sceneMainNode
  const laidOutSettingMainNode = settingMainNode
  const laidOutSceneRelationNodes = useMemo(
    () => radialLayout.applyNodePositions(sceneRelationNodes),
    [radialLayout, sceneRelationNodes],
  )
  const laidOutSettingRelationNodes = useMemo(
    () => radialLayout.applyNodePositions(settingRelationNodes),
    [radialLayout, settingRelationNodes],
  )
  const tree = useMemo(() => contentCanvasStructureTree(graph, activeScene?.id), [activeScene?.id, graph])
  const timelineItems = useMemo(
    () => activeScene ? sceneTimelineItemsFromGraph(activeScene, graphIndex) : [],
    [activeScene, graphIndex],
  )
  const automaticSceneSettingGroups = useMemo(
    () => activeScene ? sceneSettingGroupsUsedByScene(activeScene, graphIndex) : [],
    [activeScene, graphIndex],
  )
  const manualSceneSettingGroups = useMemo(
    () => manualSceneSettingGroupsBySceneId[activeScene?.id ?? 'default'] ?? [],
    [activeScene?.id, manualSceneSettingGroupsBySceneId],
  )
  const sceneSettingGroups = useMemo(
    () => mergeSceneSettingGroups(automaticSceneSettingGroups, manualSceneSettingGroups),
    [automaticSceneSettingGroups, manualSceneSettingGroups],
  )
  const sceneSettingGroupIds = useMemo(
    () => new Set(sceneSettingGroups.map((group) => group.setting.id)),
    [sceneSettingGroups],
  )
  const sceneSettingAssets = useMemo(
    () => uniqueContentNodes(sceneSettingGroups.flatMap((group) => group.states.flatMap((state) => state.assets))),
    [sceneSettingGroups],
  )

  const filteredSettings = useMemo(() => {
    const needle = settingQuery.trim().toLowerCase()
    return settingNodes.filter((item) => {
      const kind = settingKindFromNode(item)
      const active = activeKind === 'all' || kind === activeKind
      if (!active) return false
      if (!needle) return true
      return [
        item.id,
        kind,
        item.entityKey,
        item.title,
        item.subtitle,
        item.summary,
        item.status,
        item.sourcePath,
      ].join(' ').toLowerCase().includes(needle)
    })
  }, [activeKind, settingNodes, settingQuery])

  const invalidateContentCanvasProject = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: contentCanvasKeys.project(projectId) })
  }, [projectId, queryClient])

  const runCanvasCommand = useCallback(async (
    actionKey: string,
    command: () => Promise<{ message: string; focusNodeId?: string }>,
  ) => {
    if (!projectId) return
    setPendingCanvasAction(actionKey)
    try {
      const result = await command()
      toast.success(result.message)
      if (result.focusNodeId?.startsWith('setting:')) {
        setActiveSettingId(result.focusNodeId)
        setCanvasMode('setting')
      }
      await invalidateContentCanvasProject()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '内容画布操作失败')
    } finally {
      setPendingCanvasAction(null)
    }
  }, [invalidateContentCanvasProject, projectId])

  const firstStateForSetting = useCallback((setting: ContentCanvasNode) => (
    (graphIndex.connectedByNodeId.get(setting.id) ?? []).find((node) => node.kind === 'state')
  ), [graphIndex])

  const addSettingToActiveScene = useCallback((setting: ContentCanvasNode, position?: ContentCanvasNodePosition) => {
    if (!projectId || !activeScene) return
    const sceneKey = activeScene.id
    const optimisticGroup = sceneSettingGroupFromNode(setting, graphIndex, position ?? radialPoint(sceneSettingGroups.length, sceneSettingGroups.length + 1, 295, 172, Math.PI / 6))
    setManualSceneSettingGroupsBySceneId((currentByScene) => {
      const current = currentByScene[sceneKey] ?? []
      const existingIndex = current.findIndex((group) => group.setting.id === setting.id)
      const nextGroups = existingIndex < 0
        ? [...current, optimisticGroup]
        : current.map((group, index) => index === existingIndex ? optimisticGroup : group)
      return { ...currentByScene, [sceneKey]: nextGroups }
    })
    setSelectedNode({ kind: 'setting', setting })
    void runCanvasCommand(`scene-setting:${setting.id}`, () => (
      connectSceneMomentSettingFromCanvas(projectId, activeScene, setting, firstStateForSetting(setting))
    ))
  }, [activeScene, firstStateForSetting, graphIndex, projectId, runCanvasCommand, sceneSettingGroups.length])

  const sceneCanvasActions = useMemo<StarCanvasAction[]>(() => ([
    {
      label: '添加表达单元',
      disabled: !projectId || !activeScene || pendingCanvasAction === 'scene-expression',
      onClick: activeScene && projectId
        ? () => void runCanvasCommand('scene-expression', () => createChildContentCanvasNode(projectId, activeScene, 'expression_unit'))
        : undefined,
    },
    {
      label: '添加设定',
      disabled: !projectId || !activeScene || !activeSetting || pendingCanvasAction?.startsWith('scene-setting'),
      onClick: activeSetting ? () => addSettingToActiveScene(activeSetting) : undefined,
    },
    { label: '给 Shot 添加 Keyframe', disabled: true },
    { label: '添加 Storyboard', disabled: true },
  ]), [activeScene, activeSetting, addSettingToActiveScene, pendingCanvasAction, projectId, runCanvasCommand])

  const settingCanvasActions = useMemo<StarCanvasAction[]>(() => ([
    { label: '添加 State', disabled: true },
    { label: '给 State 添加 Asset', disabled: true },
    {
      label: '绑定到 Scene Moment',
      disabled: !activeScene || !activeSetting || pendingCanvasAction?.startsWith('scene-setting'),
      onClick: activeSetting ? () => addSettingToActiveScene(activeSetting) : undefined,
    },
  ]), [activeScene, activeSetting, addSettingToActiveScene, pendingCanvasAction])

  return (
    <section
      className="content-canvas-workspace-page"
      data-main-node={canvasMode}
      data-testid="content-canvas-workspace-page"
      style={paneLayout.style}
    >
      <header className="content-canvas-workspace-top">
        <div className="content-canvas-workspace-top__filter">
          <label className="content-canvas-workspace-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={settingQuery}
              onChange={(event) => setSettingQuery(event.target.value)}
              placeholder="筛选 Setting 名称、状态、作用域"
              aria-label="筛选顶部 Setting 节点"
            />
          </label>
          <div className="content-canvas-workspace-chips" aria-label="Setting 节点筛选">
            <button type="button" data-active={activeKind === 'all' ? 'true' : undefined} onClick={() => setActiveKind('all')}>全部</button>
            <button type="button" data-active={activeKind === 'character' ? 'true' : undefined} onClick={() => setActiveKind('character')}>角色</button>
            <button type="button" data-active={activeKind === 'location' ? 'true' : undefined} onClick={() => setActiveKind('location')}>场景</button>
            <button type="button" data-active={activeKind === 'prop' ? 'true' : undefined} onClick={() => setActiveKind('prop')}>道具</button>
            <button type="button" data-active={activeKind === 'visual_style' ? 'true' : undefined} onClick={() => setActiveKind('visual_style')}>视觉</button>
          </div>
          <span className="content-canvas-workspace-count">{filteredSettings.length}/{settingNodes.length} Setting</span>
          <button
            type="button"
            className="content-canvas-workspace-add-setting"
            disabled={!projectId || pendingCanvasAction === 'root-setting'}
            onClick={() => {
              if (!projectId) return
              void runCanvasCommand('root-setting', () => createRootContentCanvasNode(projectId, 'setting'))
            }}
          >
            <Plus size={13} aria-hidden="true" />
            Setting
          </button>
        </div>

        <div className="content-canvas-catalog" aria-label="Setting 节点卡片网格">
          {projectQuery.isLoading ? (
            <div className="content-canvas-catalog-empty">正在读取项目数据...</div>
          ) : filteredSettings.length ? filteredSettings.map((item) => {
            const Icon = iconForContentNode(item)
            return (
            <button
              key={item.id}
              type="button"
              className="content-canvas-catalog-card"
              data-status={item.status}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'copy'
                event.dataTransfer.setData(CONTENT_CANVAS_SETTING_DRAG_TYPE, item.id)
                event.dataTransfer.setData('text/plain', item.title)
              }}
              onClick={() => {
                setActiveSettingId(item.id)
                setCanvasMode('setting')
                setSelectedNode({ kind: 'setting', setting: item })
              }}
              aria-label={`${item.title} Setting 节点`}
            >
              <span className="content-canvas-catalog-card__icon">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="content-canvas-catalog-card__copy">
                <strong>{item.title}</strong>
                <small>{item.summary || item.subtitle}</small>
              </span>
              <span className="content-canvas-catalog-card__status">{contentStatusLabel(item.status)}</span>
              <span className="content-canvas-catalog-card__code">SET</span>
              <span className="content-canvas-catalog-card__scope">{item.subtitle}</span>
            </button>
          )}) : (
            <div className="content-canvas-catalog-empty">当前项目暂无 Setting 节点</div>
          )}
        </div>
        <ContentCanvasResizeHandle
          className="content-canvas-resize-handle content-canvas-resize-handle--top"
          resizeHandleProps={paneLayout.settingCatalog.resizeHandleProps}
        />
      </header>

      <aside className="content-canvas-workspace-sidebar" aria-label="Production Segment Scene Moment 层级">
        <div className="content-canvas-workspace-sidebar__header">
          <div>
            <strong>结构层级</strong>
            <span>只到 Production / Segment / Scene Moment</span>
          </div>
          <button type="button" title="筛选层级" aria-label="筛选层级">
            <ListFilter size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="content-canvas-workspace-sidebar__actions" aria-label="添加结构节点">
          <button type="button"><Plus size={13} aria-hidden="true" /> Pro</button>
          <button type="button"><Plus size={13} aria-hidden="true" /> Seg</button>
          <button type="button"><Plus size={13} aria-hidden="true" /> Sec</button>
        </div>
        <label className="content-canvas-workspace-sidebar__search">
          <Search size={14} aria-hidden="true" />
          <input defaultValue="雨夜" aria-label="搜索结构层级" />
        </label>
        <div className="content-canvas-workspace-tree">
          {tree.length ? tree.map((node) => <TreeNode key={node.id ?? node.title} node={node} onSelectScene={(sceneId) => {
            setCanvasMode('scene_moment')
            setActiveSceneId(sceneId)
            const nextScene = graph.nodes.find((item) => item.id === sceneId && item.kind === 'scene_moment')
            setSelectedNode({ kind: 'scene_moment', node: nextScene ? radialNodeFromContentNode(nextScene, 0, 0, 'primary') : laidOutSceneMainNode })
          }} />) : null}
          {!tree.length && <div className="content-canvas-tree-empty">当前项目暂无 Production / Segment / Scene Moment</div>}
        </div>
        <PanelResizeHandle
          className="content-canvas-resize-handle content-canvas-resize-handle--left"
          side="right"
          {...paneLayout.structure.resizeHandleProps}
        />
      </aside>

      <main className="content-canvas-workspace-canvas" aria-label="无限画布">
        <div className="content-canvas-workspace-canvas__toolbar">
          <span>{canvasMode === 'scene_moment' ? 'Scene Moment 主节点画布' : 'Setting 主节点画布'}</span>
          <div className="content-canvas-workspace-canvas__switch" aria-label="切换主节点类型">
            <button type="button" data-active={canvasMode === 'scene_moment' ? 'true' : undefined} onClick={() => {
              setCanvasMode('scene_moment')
              setSelectedNode({ kind: 'scene_moment', node: laidOutSceneMainNode })
            }}>
              <Film size={13} aria-hidden="true" />
              Scene
            </button>
            <button type="button" data-active={canvasMode === 'setting' ? 'true' : undefined} onClick={() => {
              setCanvasMode('setting')
              if (activeSetting) setSelectedNode({ kind: 'setting', setting: activeSetting })
            }}>
              <Star size={13} aria-hidden="true" />
              Setting
            </button>
          </div>
          <em>{canvasMode === 'scene_moment' ? 'Scene Moment 可添加表达单元，并给 Shot 添加 Keyframe / Storyboard' : 'Setting 可添加 State，State 下可添加 Asset 节点'}</em>
        </div>
        {canvasMode === 'scene_moment' ? (
          <StarCanvas
            main={laidOutSceneMainNode}
            nodes={laidOutSceneRelationNodes}
            actions={sceneCanvasActions}
            selectedNodeId={selectedSelectionId(selectedNode)}
            emptyText={activeScene ? '这个 Scene Moment 暂无表达单元 / Shot / Keyframe / Storyboard 关系' : '当前项目暂无 Scene Moment'}
            onSelect={(node) => setSelectedNode(node.id === laidOutSceneMainNode.id ? { kind: 'scene_moment', node } : { kind: 'other', node })}
            onNodePositionCommit={radialLayout.commitNodePosition}
            onResetLayout={radialLayout.reset}
            candidateSelections={candidateSelections}
            settingGroups={sceneSettingGroups}
            groupedSettingIds={sceneSettingGroupIds}
            onDropSetting={(settingId, position) => {
              const setting = graphIndex.nodeById.get(settingId)
              if (!setting || setting.kind !== 'setting') return
              addSettingToActiveScene(setting, position)
            }}
            onSettingGroupPositionCommit={(group, position) => {
              const sceneKey = activeScene?.id ?? 'default'
              setManualSceneSettingGroupsBySceneId((currentByScene) => {
                const current = currentByScene[sceneKey] ?? []
                const nextGroup = { ...group, x: position.x, y: position.y }
                const existingIndex = current.findIndex((item) => item.setting.id === group.setting.id)
                const nextGroups = existingIndex < 0
                  ? [...current, nextGroup]
                  : current.map((item, index) => index === existingIndex ? nextGroup : item)
                return { ...currentByScene, [sceneKey]: nextGroups }
              })
            }}
            onSelectSettingGroupNode={(node) => {
              if (node.kind === 'setting') {
                setSelectedNode({ kind: 'setting', setting: node })
                return
              }
              const radialNode = radialNodeFromContentNode(node, 0, 0, radialVariantForKind(node.kind))
              if (node.kind === 'state') setSelectedNode({ kind: 'state', node: radialNode })
              else if (node.kind === 'asset') setSelectedNode({ kind: 'asset', node: radialNode })
              else setSelectedNode({ kind: 'other', node: radialNode })
            }}
          />
        ) : laidOutSettingMainNode && activeSetting ? (
          <StarCanvas
            main={laidOutSettingMainNode}
            nodes={laidOutSettingRelationNodes}
            actions={settingCanvasActions}
            selectedNodeId={selectedSelectionId(selectedNode)}
            emptyText="这个 Setting 暂无 State / Asset 关系"
            onSelect={(node) => {
              if (node.id === activeSetting.id) {
                setSelectedNode({ kind: 'setting', setting: activeSetting })
                return
              }
              if (node.variant === 'state') {
                setSelectedNode({ kind: 'state', node })
                return
              }
              if (node.variant === 'asset') {
                setSelectedNode({ kind: 'asset', node })
                return
              }
              setSelectedNode({ kind: 'other', node })
            }}
            onNodePositionCommit={radialLayout.commitNodePosition}
            onResetLayout={radialLayout.reset}
            candidateSelections={candidateSelections}
          />
        ) : (
          <div className="content-canvas-star content-canvas-star--empty">当前项目暂无 Setting</div>
        )}
      </main>

      <aside className="content-canvas-workspace-inspector" aria-label="右侧节点信息区域">
        <PanelResizeHandle
          className="content-canvas-resize-handle content-canvas-resize-handle--right"
          side="left"
          {...paneLayout.inspector.resizeHandleProps}
        />
        <NodeInspector
          selection={selectedNode}
          activeSetting={activeSetting}
          assetPrompts={assetPrompts}
          expressionPrompts={expressionPrompts}
          candidateSelections={candidateSelections}
          referenceAssets={sceneSettingAssets}
          onPromptChange={(assetId, prompt) => setAssetPrompts((current) => ({ ...current, [assetId]: prompt }))}
          onExpressionPromptChange={(nodeId, prompt) => setExpressionPrompts((current) => ({ ...current, [nodeId]: prompt }))}
          onCandidateSelect={(nodeId, candidateId) => setCandidateSelections((current) => ({ ...current, [nodeId]: candidateId }))}
        />
      </aside>

      <section className="content-canvas-workspace-timeline" aria-label="底部 Scene Moment 时间线区域">
        <ContentCanvasResizeHandle
          className="content-canvas-resize-handle content-canvas-resize-handle--bottom"
          resizeHandleProps={paneLayout.timeline.resizeHandleProps}
        />
        <SceneTimeline items={timelineItems} />
      </section>
    </section>
  )
}
