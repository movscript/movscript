import { useState, type ReactNode } from 'react'
import { TextCursorInput, type LucideIcon } from 'lucide-react'
import {
  CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS,
  type ContentCanvasCreateNodeInput,
  type ContentCanvasExpressionUnitEditorInput,
} from '../application/contentCanvasCommands'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { PromptReferenceInlineEditor } from './ContentCanvasPromptReferences'
import type { CandidateSelections, InspectorSelection } from './contentCanvasWorkspaceTypes'
import { contentCanvasGenerationTargetForNode } from './contentCanvasWorkspaceGenerationModel'
import {
  CandidateDecisionPanel,
  type ContentCanvasCandidateGenerationOptions,
  type ContentCanvasCandidatePromptPreview,
  CreateChildNodeInspector,
  ExpressionUnitEditor,
  InspectorHeader,
  InspectorMeta,
  InspectorSection,
  inspectorKindForNode,
} from './ContentCanvasInspectorParts'
import { settingTypeLabel } from './contentCanvasWorkspaceDisplayModel'
import { appendContentNodeReferenceToPrompt, iconForContentNode, isExpressionPromptNode, promptFromContentNode } from './contentCanvasWorkspaceModel'

export function NodeInspector({
  selection,
  activeSetting,
  assetPrompts,
  expressionPrompts,
  candidateSelections,
  nodes,
  promptReferenceNodes,
  onPromptChange,
  onPromptCommit,
  onCreateAsset,
  onCreateExpressionUnit,
  onCreateKeyframe,
  onCreateState,
  onCreateStoryboard,
  onExpressionPromptChange,
  onExpressionUnitSave,
  onCandidateCreate,
  onCandidatePromptPreview,
  onCandidateResourceSelect,
  onCandidateSelect,
  onCandidateUpload,
  onSelectNode,
}: {
  selection: InspectorSelection
  activeSetting: ContentCanvasNode | null
  assetPrompts: Record<string, string>
  expressionPrompts: Record<string, string>
  candidateSelections: CandidateSelections
  nodes: ContentCanvasNode[]
  promptReferenceNodes: ContentCanvasNode[]
  onPromptChange: (assetId: string, prompt: string) => void
  onPromptCommit: (node: ContentCanvasNode | undefined, prompt: string) => void
  onCreateAsset: (state: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateExpressionUnit: (scene: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateKeyframe: (owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateState: (setting: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateStoryboard: (owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onExpressionPromptChange: (nodeId: string, prompt: string) => void
  onExpressionUnitSave: (node: ContentCanvasNode, input: ContentCanvasExpressionUnitEditorInput) => void
  onCandidateCreate: (node: ContentCanvasNode | undefined, options?: ContentCanvasCandidateGenerationOptions) => void
  onCandidatePromptPreview: (node: ContentCanvasNode | undefined) => Promise<ContentCanvasCandidatePromptPreview>
  onCandidateResourceSelect: (node: ContentCanvasNode | undefined, resource: ContentCanvasUploadedResource) => void
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateUpload: (node: ContentCanvasNode | undefined, file: File) => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}) {
  if (selection.kind === 'create_expression_unit') {
    return (
      <CreateChildNodeInspector
        eyebrow="Create Expression"
        title={`添加表达单元到 ${selection.parent.title}`}
        description="填写完整后才会写入 expression_unit.json。"
        idPlaceholder="expr_visual"
        titlePlaceholder="表达单元标题"
        statusPlaceholder="选择表达类型"
        statusLabel="类型"
        statusOptions={CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS}
        submitLabel="创建表达单元"
        onSubmit={(input) => onCreateExpressionUnit(selection.parent, input)}
      />
    )
  }

  if (selection.kind === 'create_state') {
    return (
      <CreateChildNodeInspector
        eyebrow="Create State"
        title={`添加状态到 ${selection.parent.title}`}
        description="填写完整后才会写入 setting_state.json。"
        idPlaceholder="base"
        titlePlaceholder="基础状态"
        statusPlaceholder="ready"
        submitLabel="创建 State"
        onSubmit={(input) => onCreateState(selection.parent, input)}
      />
    )
  }

  if (selection.kind === 'create_keyframe') {
    return (
      <CreateChildNodeInspector
        eyebrow="Create Keyframe"
        title={`添加关键帧到 ${selection.parent.title}`}
        description="填写完整后才会写入 keyframe.json，并创建对应制作项。"
        idPlaceholder="kf_visual"
        titlePlaceholder="关键帧标题"
        statusPlaceholder="ready"
        submitLabel="创建关键帧"
        onSubmit={(input) => onCreateKeyframe(selection.parent, input)}
      />
    )
  }

  if (selection.kind === 'create_storyboard') {
    return (
      <CreateChildNodeInspector
        eyebrow="Create Storyboard"
        title={`添加分镜图到 ${selection.parent.title}`}
        description="填写完整后才会写入 storyboard.json，并创建对应制作项。"
        idPlaceholder="board_main"
        titlePlaceholder="分镜图标题"
        statusPlaceholder="ready"
        submitLabel="创建分镜图"
        onSubmit={(input) => onCreateStoryboard(selection.parent, input)}
      />
    )
  }

  if (selection.kind === 'create_asset') {
    return (
      <CreateChildNodeInspector
        eyebrow="Create Asset"
        title={`添加 Asset 到 ${selection.parent.title}`}
        description="填写完整后才会写入 asset.json。"
        idPlaceholder="portrait"
        titlePlaceholder="角色参考图"
        statusPlaceholder="ready"
        submitLabel="创建 Asset"
        onSubmit={(input) => onCreateAsset(selection.parent, input)}
      />
    )
  }

  const contentUnitInspectorNode = contentUnitInspectorSourceNode(selection)
  const contentUnitGenerationTarget = contentCanvasGenerationTargetForNode(contentUnitInspectorNode)
  const contentUnitInspector = contentUnitGenerationTarget ? (() => {
    const prompt = promptDraftForNode(contentUnitInspectorNode, contentUnitGenerationTarget.node, assetPrompts, expressionPrompts)
    const draftKey = contentUnitInspectorNode?.id ?? ''
    return (
      <ContentUnitInspector
        node={contentUnitInspectorNode}
        title={inspectorTitleForSelection(selection)}
        Icon={inspectorIconForSelection(selection)}
        prompt={prompt}
        nodes={nodes}
        promptReferenceNodes={promptReferenceNodes}
        candidateSelections={candidateSelections}
        onPromptChange={(nextPrompt) => {
          if (!contentUnitInspectorNode) return
          if (contentUnitInspectorNode.kind === 'asset') {
            onPromptChange(draftKey, nextPrompt)
          } else {
            onExpressionPromptChange(draftKey, nextPrompt)
          }
        }}
        onPromptCommit={() => onPromptCommit(contentUnitInspectorNode, prompt)}
        onReferenceAppend={(referenceNode) => {
          const nextPrompt = appendContentNodeReferenceToPrompt(prompt, referenceNode)
          if (!contentUnitInspectorNode) return
          if (contentUnitInspectorNode.kind === 'asset') {
            onPromptChange(draftKey, nextPrompt)
          } else {
            onExpressionPromptChange(draftKey, nextPrompt)
          }
        }}
        onSelectNode={onSelectNode}
        onCandidateCreate={onCandidateCreate}
        onCandidatePromptPreview={onCandidatePromptPreview}
        onCandidateResourceSelect={onCandidateResourceSelect}
        onCandidateSelect={onCandidateSelect}
        onCandidateUpload={onCandidateUpload}
      />
    )
  })() : null
  const withContentUnitTab = (entityInspector: ReactNode) => contentUnitInspector ? (
    <ContentCanvasInspectorTabs entityInspector={entityInspector} contentUnitInspector={contentUnitInspector} />
  ) : entityInspector

  if (selection.kind === 'scene_moment') {
    return withContentUnitTab(
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Scene Moment Detail" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
      </div>
    )
  }

  if (selection.kind === 'setting') {
    const Icon = iconForContentNode(selection.setting)
    return withContentUnitTab(
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Setting Detail" title={selection.setting.title} Icon={Icon} />
        <p>{selection.setting.summary || selection.setting.subtitle}</p>
        <InspectorMeta label="Setting 类型" value={settingTypeLabel(selection.setting)} />
      </div>
    )
  }

  if (selection.kind === 'state') {
    const state = selection.node.source
    return withContentUnitTab(
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="State Detail" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
        <InspectorMeta label="所属 Setting" value={activeSetting?.title ?? '未关联'} />
        <InspectorMeta label="节点类型" value="State" />
        <InspectorSection title="State 约束草稿">
          <textarea
            defaultValue={state?.summary || `保持「${selection.node.title}」在跨 Scene Moment 使用时连续一致。`}
            aria-label="State 约束说明"
          />
        </InspectorSection>
      </div>
    )
  }

  if (selection.kind === 'asset') {
    return withContentUnitTab(
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Asset Detail" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
        <InspectorMeta label="节点类型" value={selection.node.code} />
      </div>
    )
  }

  if (selection.kind === 'other' && isExpressionPromptNode(selection.node)) {
    const source = selection.node.source
    return withContentUnitTab(
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Expression Prompt" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
        {source?.kind !== 'expression_unit' ? (
          <InspectorMeta label="节点类型" value={selection.node.code} />
        ) : null}
        {source?.kind === 'expression_unit' ? (
          <ExpressionUnitEditor
            key={source.id}
            node={source}
            onSave={onExpressionUnitSave}
          />
        ) : null}
      </div>
    )
  }

  return withContentUnitTab(
    <div className="content-canvas-inspector-card">
      <InspectorHeader
        eyebrow="Node Detail"
        title={selection.node.title}
        Icon={selection.node.Icon}
      />
      <p>{selection.node.description}</p>
      <InspectorMeta label="节点类型" value={selection.node.code} />
      <InspectorMeta label="布局" value="星状视图" />
    </div>
  )
}

function ContentCanvasInspectorTabs({
  entityInspector,
  contentUnitInspector,
}: {
  entityInspector: ReactNode
  contentUnitInspector: ReactNode
}) {
  const [activeTab, setActiveTab] = useState<'entity' | 'content_unit'>('entity')
  return (
    <div className="content-canvas-inspector-tabbed">
      <div className="content-canvas-inspector-tabs" role="tablist" aria-label="Inspector 类型">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'entity'}
          onClick={() => setActiveTab('entity')}
        >
          实体
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'content_unit'}
          onClick={() => setActiveTab('content_unit')}
        >
          制作项
        </button>
      </div>
      {activeTab === 'entity' ? entityInspector : contentUnitInspector}
    </div>
  )
}

function ContentUnitInspector({
  node,
  title,
  Icon,
  prompt,
  nodes,
  promptReferenceNodes,
  candidateSelections,
  onPromptChange,
  onPromptCommit,
  onReferenceAppend,
  onSelectNode,
  onCandidateCreate,
  onCandidatePromptPreview,
  onCandidateResourceSelect,
  onCandidateSelect,
  onCandidateUpload,
}: {
  node: ContentCanvasNode | undefined
  title: string
  Icon: LucideIcon
  prompt: string
  nodes: ContentCanvasNode[]
  promptReferenceNodes: ContentCanvasNode[]
  candidateSelections: CandidateSelections
  onPromptChange: (prompt: string) => void
  onPromptCommit: () => void
  onReferenceAppend: (node: ContentCanvasNode) => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
  onCandidateCreate: (node: ContentCanvasNode | undefined, options?: ContentCanvasCandidateGenerationOptions) => void
  onCandidatePromptPreview: (node: ContentCanvasNode | undefined) => Promise<ContentCanvasCandidatePromptPreview>
  onCandidateResourceSelect: (node: ContentCanvasNode | undefined, resource: ContentCanvasUploadedResource) => void
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateUpload: (node: ContentCanvasNode | undefined, file: File) => void
}) {
  return (
    <div className="content-canvas-inspector-card">
      <InspectorHeader eyebrow="Content Unit" title={title} Icon={Icon} />
      <InspectorSection title="提示词">
        <label className="content-canvas-prompt-editor">
          <span className="content-canvas-prompt-editor__label"><TextCursorInput size={13} aria-hidden="true" /> Prompt</span>
          <PromptReferenceInlineEditor
            prompt={prompt}
            nodes={nodes}
            ownerNode={node}
            candidateSelections={candidateSelections}
            ariaLabel={`${title} 制作项提示词`}
            onChange={onPromptChange}
            onBlur={onPromptCommit}
            onSelectNode={(referenceNode) => onSelectNode(inspectorKindForNode(referenceNode), referenceNode.id)}
          />
        </label>
        <PromptReferenceAppendButtons
          nodes={promptReferenceNodes}
          emptyText="当前命名空间暂无可引用内容单元"
          onAppend={onReferenceAppend}
        />
      </InspectorSection>
      <CandidateDecisionPanel
        node={node}
        prompt={prompt}
        candidateSelections={candidateSelections}
        onCandidateCreate={onCandidateCreate}
        onCandidatePromptPreview={onCandidatePromptPreview}
        onCandidateResourceSelect={onCandidateResourceSelect}
        onCandidateSelect={onCandidateSelect}
        onCandidateUpload={onCandidateUpload}
      />
    </div>
  )
}

function contentUnitInspectorSourceNode(selection: InspectorSelection): ContentCanvasNode | undefined {
  if (selection.kind === 'scene_moment') return selection.node.source
  if (selection.kind === 'setting') return selection.setting
  if (selection.kind === 'state') return selection.node.source
  if (selection.kind === 'asset') return selection.node.source
  if (selection.kind === 'other') return selection.node.source
  return undefined
}

function promptDraftForNode(
  node: ContentCanvasNode | undefined,
  contentUnitNode: ContentCanvasNode | undefined,
  assetPrompts: Record<string, string>,
  expressionPrompts: Record<string, string>,
) {
  if (!node) return ''
  return node.kind === 'asset'
    ? assetPrompts[node.id] ?? promptFromContentNode(contentUnitNode) ?? ''
    : expressionPrompts[node.id] ?? promptFromContentNode(contentUnitNode) ?? promptFromContentNode(node) ?? ''
}

function inspectorTitleForSelection(selection: InspectorSelection): string {
  if (selection.kind === 'setting') return selection.setting.title
  if ('node' in selection) return selection.node.title
  return 'Content Unit'
}

function inspectorIconForSelection(selection: InspectorSelection) {
  if (selection.kind === 'setting') return iconForContentNode(selection.setting)
  if ('node' in selection) return selection.node.Icon
  return TextCursorInput
}

function PromptReferenceAppendButtons({
  emptyText,
  nodes,
  onAppend,
}: {
  emptyText: string
  nodes: ContentCanvasNode[]
  onAppend: (node: ContentCanvasNode) => void
}) {
  return (
    <div className="content-canvas-reference-assets">
      {nodes.length ? nodes.map((referenceNode) => {
        const Icon = iconForContentNode(referenceNode)
        return (
          <button
            key={referenceNode.id}
            type="button"
            onClick={() => onAppend(referenceNode)}
          >
            <Icon size={12} aria-hidden="true" />
            <span>{referenceNode.title}</span>
          </button>
        )
      }) : (
        <span className="content-canvas-reference-assets__empty">{emptyText}</span>
      )}
    </div>
  )
}
