import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { File, FileAudio, FileImage, FileText, TextCursorInput, type LucideIcon } from 'lucide-react'
import { api } from '@/shared/infrastructure/api'
import { ResourceFileImage } from '@/shared/ui/ResourceFileImage'
import { ResourceFileVideo } from '@/shared/ui/ResourceFileVideo'
import type { RawResource } from '@/types'
import {
  CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS,
  type ContentCanvasCreateNodeInput,
  type ContentCanvasExpressionUnitEditorInput,
} from '../application/contentCanvasCommands'
import { contentCanvasResourceMediaType, type ContentCanvasNodeMedia } from '../application/contentCanvasMedia'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { ContentCanvasPromptEditor } from './ContentCanvasPromptEditor'
import type { CandidateSelections, ContentCanvasNodePosition, InspectorSelection } from './contentCanvasWorkspaceTypes'
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
  onCreateAsset: (state: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => void
  onCreateExpressionUnit: (scene: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => void
  onCreateKeyframe: (owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => void
  onCreateState: (setting: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => void
  onCreateStoryboard: (owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => void
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
        onSubmit={(input) => onCreateExpressionUnit(selection.parent, input, selection.position)}
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
        onSubmit={(input) => onCreateState(selection.parent, input, selection.position)}
      />
    )
  }

  if (selection.kind === 'create_keyframe') {
    return (
      <CreateChildNodeInspector
        eyebrow="Create Keyframe"
        title={`添加关键帧到 ${selection.parent.title}`}
        description="填写完整后才会写入 keyframe.json，并创建对应创作片段。"
        idPlaceholder="kf_visual"
        titlePlaceholder="关键帧标题"
        statusPlaceholder="ready"
        submitLabel="创建关键帧"
        onSubmit={(input) => onCreateKeyframe(selection.parent, input, selection.position)}
      />
    )
  }

  if (selection.kind === 'create_storyboard') {
    return (
      <CreateChildNodeInspector
        eyebrow="Create Storyboard"
        title={`添加分镜图到 ${selection.parent.title}`}
        description="填写完整后才会写入 storyboard.json，并创建对应创作片段。"
        idPlaceholder="board_main"
        titlePlaceholder="分镜图标题"
        statusPlaceholder="ready"
        submitLabel="创建分镜图"
        onSubmit={(input) => onCreateStoryboard(selection.parent, input, selection.position)}
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
        onSubmit={(input) => onCreateAsset(selection.parent, input, selection.position)}
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
        onPromptCommit={(nextPrompt) => onPromptCommit(contentUnitInspectorNode, nextPrompt)}
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

  if (selection.kind === 'other' && selection.node.source?.kind === 'resource') {
    return <ResourceInspector node={selection.node.source} />
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

function ResourceInspector({ node }: { node: ContentCanvasNode }) {
  const media = resourceMediaForNode(node)
  const resourceId = media?.resourceId ?? resourceIdForNode(node)
  const { data: resource, isLoading } = useQuery({
    queryKey: ['content-canvas', 'resource-preview', resourceId],
    queryFn: () => fetchContentCanvasPreviewResource(resourceId!),
    enabled: resourceId !== undefined,
    staleTime: 60_000,
  })
  const Icon = iconForContentNode(node)
  return (
    <div className="content-canvas-inspector-card">
      <InspectorHeader eyebrow="Resource Preview" title={node.title} Icon={Icon} />
      <p>{node.summary || node.subtitle || '资源节点'}</p>
      <ResourceInspectorPreview
        media={media}
        resource={resource}
        loading={isLoading}
        title={node.title}
        hasMediaHint={hasResourceMediaHint(node)}
      />
      <InspectorMeta label="Resource ID" value={String(resourceId ?? node.entityKey)} />
      <InspectorMeta label="资源类型" value={mediaKindLabel(resource?.type ?? media?.type)} />
      {typeof node.record.artifactRef === 'string' && node.record.artifactRef.trim() ? (
        <InspectorMeta label="Artifact" value={node.record.artifactRef} />
      ) : null}
    </div>
  )
}

function ResourceInspectorPreview({
  media,
  resource,
  loading,
  title,
  hasMediaHint,
}: {
  media: ContentCanvasNodeMedia | undefined
  resource: RawResource | undefined
  loading: boolean
  title: string
  hasMediaHint: boolean
}) {
  const resourceId = resource?.ID ?? media?.resourceId
  const resourceUrl = resource?.url
  const type = resource?.type ?? media?.type
  if (type === 'image') {
    return (
      <div className="content-canvas-resource-preview" data-kind="image">
        <ResourceFileImage resourceId={resourceId} resourceUrl={resourceUrl} alt={resource?.name ?? title} loading="lazy" thumbnailMaxSize={512} />
      </div>
    )
  }
  if (type === 'video') {
    return (
      <div className="content-canvas-resource-preview" data-kind="video">
        <ResourceFileVideo resourceId={resourceId} resourceUrl={resourceUrl} controls playsInline preload="metadata" />
      </div>
    )
  }
  if (resourceId !== undefined && !resource && !loading && !hasMediaHint) {
    return <UnknownResourceInspectorPreview resourceId={resourceId} title={title} />
  }
  const Icon = type === 'audio'
    ? FileAudio
    : type === 'file' || type === 'text'
      ? FileText
      : FileImage
  return (
    <div className="content-canvas-resource-preview" data-kind={type ?? 'missing'}>
      <Icon size={28} aria-hidden="true" />
      <span>{loading ? '正在加载资源预览' : media ? '当前资源不是图片或视频' : '当前资源缺少可预览文件'}</span>
    </div>
  )
}

function UnknownResourceInspectorPreview({ resourceId, title }: { resourceId: number; title: string }) {
  const [mode, setMode] = useState<'image' | 'video'>('image')
  if (mode === 'image') {
    return (
      <div className="content-canvas-resource-preview" data-kind="image">
        <ResourceFileImage
          resourceId={resourceId}
          alt={title}
          loading="lazy"
          thumbnailMaxSize={512}
          onError={() => setMode('video')}
        />
      </div>
    )
  }
  return (
    <div className="content-canvas-resource-preview" data-kind="video">
      <ResourceFileVideo resourceId={resourceId} controls playsInline preload="metadata" />
    </div>
  )
}

function resourceMediaForNode(node: ContentCanvasNode): ContentCanvasNodeMedia | undefined {
  const resourceId = resourceIdForNode(node)
  if (resourceId === undefined) return undefined
  return {
    resourceId,
    url: '',
    type: contentCanvasResourceMediaType({
      kind: 'resource',
      resourceKind: typeof node.record.resourceKind === 'string' ? node.record.resourceKind : undefined,
      artifactRef: typeof node.record.artifactRef === 'string' ? node.record.artifactRef : undefined,
    }),
  }
}

function resourceIdForNode(node: ContentCanvasNode): number | undefined {
  return typeof node.record.resourceId === 'number'
    ? node.record.resourceId
    : numericValue(node.entityKey)
}

function hasResourceMediaHint(node: ContentCanvasNode): boolean {
  return Boolean(
    (typeof node.record.resourceKind === 'string' && node.record.resourceKind.trim())
    || (typeof node.record.artifactRef === 'string' && node.record.artifactRef.trim()),
  )
}

async function fetchContentCanvasPreviewResource(resourceId: number): Promise<RawResource | undefined> {
  const { data } = await api.get<RawResource[] | { items?: RawResource[] }>('/resources', {
    params: { page: 1, page_size: 200, type: 'image,video' },
  })
  const resources = Array.isArray(data) ? data : data.items ?? []
  return resources.find((resource) => resource.ID === resourceId)
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return undefined
  return Number(value)
}

function mediaKindLabel(kind: ContentCanvasNodeMedia['type'] | RawResource['type'] | undefined): string {
  if (kind === 'image') return '图片'
  if (kind === 'video') return '视频'
  if (kind === 'audio') return '音频'
  if (kind === 'text') return '文本'
  if (kind === 'file') return '文件'
  return '未知'
}

function ContentCanvasInspectorTabs({
  entityInspector,
  contentUnitInspector,
}: {
  entityInspector: ReactNode
  contentUnitInspector: ReactNode
}) {
  const [activeTab, setActiveTab] = useState<'entity' | 'content_unit'>('content_unit')
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
          创作片段
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
  onPromptCommit: (prompt: string) => void
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
        <ContentCanvasPromptEditor
          ariaLabel={`${title} 创作片段提示词`}
          candidateSelections={candidateSelections}
          nodes={nodes}
          ownerNode={node}
          value={prompt}
          onChange={onPromptChange}
          onBlur={onPromptCommit}
          onSelectNode={(referenceNode) => onSelectNode(inspectorKindForNode(referenceNode), referenceNode.id)}
        />
        <PromptReferenceAppendButtons
          nodes={promptReferenceNodes}
          emptyText="当前命名空间暂无可引用创作片段"
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
