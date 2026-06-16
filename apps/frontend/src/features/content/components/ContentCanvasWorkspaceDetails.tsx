import { useState, type FormEvent, type ReactNode } from 'react'
import { Image, Plus, TextCursorInput, type LucideIcon } from 'lucide-react'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import { CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS, type ContentCanvasCreateNodeInput, type ContentCanvasExpressionUnitKind } from '../application/contentCanvasCommands'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { CandidateSelections, InspectorSelection, RadialNode, TimelineTrack, TreeNodeData } from './contentCanvasWorkspaceTypes'
import { appendAssetReferenceToPrompt, candidateDecisionForNode, candidatesForNode, iconForContentNode, isExpressionPromptNode, mediaKindForNode, mediaKindLabel, promptFromContentNode, selectedCandidateForNode, stringField } from './contentCanvasWorkspaceModel'

export function NodeInspector({
  selection,
  activeSetting,
  assetPrompts,
  expressionPrompts,
  candidateSelections,
  childNodesByHierarchy,
  nodes,
  referenceAssets,
  onPromptChange,
  onPromptCommit,
  onCreateAsset,
  onCreateExpressionUnit,
  onCreateKeyframe,
  onCreateState,
  onExpressionPromptChange,
  onCandidateSelect,
  onSelectNode,
}: {
  selection: InspectorSelection
  activeSetting: ContentCanvasNode | null
  assetPrompts: Record<string, string>
  expressionPrompts: Record<string, string>
  candidateSelections: CandidateSelections
  childNodesByHierarchy: Map<string, ContentCanvasNode[]>
  nodes: ContentCanvasNode[]
  referenceAssets: ContentCanvasNode[]
  onPromptChange: (assetId: string, prompt: string) => void
  onPromptCommit: (node: ContentCanvasNode | undefined, prompt: string) => void
  onCreateAsset: (state: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateExpressionUnit: (scene: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateKeyframe: (shot: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateState: (setting: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onExpressionPromptChange: (nodeId: string, prompt: string) => void
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
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

  if (selection.kind === 'create_keyframe') {
    return (
      <CreateChildNodeInspector
        eyebrow="Create Keyframe"
        title={`添加关键帧到 ${selection.parent.title}`}
        description="创建关键帧时会同步创建对应的 keyframe_ref 制作项。"
        idPlaceholder="kf_closeup"
        titlePlaceholder="关键帧标题"
        statusPlaceholder="visual_anchor"
        submitLabel="创建关键帧"
        onSubmit={(input) => onCreateKeyframe(selection.parent, input)}
      />
    )
  }

  if (selection.kind === 'scene_moment') {
    const scene = selection.node.source
    const prompt = expressionPrompts[selection.node.id] ?? promptFromContentNode(scene) ?? ''
    const expressionUnits = scene ? childNodesFor(scene, childNodesByHierarchy, 'expression_unit') : []
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Scene Moment Detail" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
        <InspectorSection title="提示词编辑">
          <label className="content-canvas-prompt-editor">
            <span><TextCursorInput size={13} aria-hidden="true" /> Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => onExpressionPromptChange(selection.node.id, event.target.value)}
              onBlur={() => onPromptCommit(scene, prompt)}
              aria-label={`${selection.node.title} 情节提示词`}
            />
            <PromptReferenceStrip
              prompt={prompt}
              nodes={nodes}
              ownerNode={scene}
              onSelectNode={onSelectNode}
            />
          </label>
        </InspectorSection>
        <CandidateDecisionPanel
          node={scene}
          candidateSelections={candidateSelections}
          onCandidateSelect={onCandidateSelect}
        />
        <InspectorNodeList
          title="表达单元"
          emptyText="这个情节暂无表达单元"
          nodes={expressionUnits}
          onSelect={(node) => onSelectNode(inspectorKindForNode(node), node.id)}
        />
      </div>
    )
  }

  if (selection.kind === 'setting') {
    const Icon = iconForContentNode(selection.setting)
    const states = childNodesFor(selection.setting, childNodesByHierarchy, 'state')
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Setting Detail" title={selection.setting.title} Icon={Icon} />
        <p>{selection.setting.summary || selection.setting.subtitle}</p>
        <InspectorMeta label="Setting 类型" value={selection.setting.subtitle} />
        <InspectorNodeList
          title="下级 State"
          emptyText="这个 Setting 暂无 State"
          nodes={states}
          onSelect={(node) => onSelectNode('state', node.id)}
        />
        <CandidateDecisionPanel
          node={selection.setting}
          candidateSelections={candidateSelections}
          onCandidateSelect={onCandidateSelect}
        />
      </div>
    )
  }

  if (selection.kind === 'state') {
    const state = selection.node.source
    const assets = state ? childNodesFor(state, childNodesByHierarchy, 'asset') : []
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="State Detail" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
        <InspectorMeta label="所属 Setting" value={activeSetting?.title ?? '未关联'} />
        <InspectorMeta label="节点类型" value="State" />
        <InspectorNodeList
          title="下级 Asset"
          emptyText="这个 State 暂无 Asset"
          nodes={assets}
          onSelect={(node) => onSelectNode('asset', node.id)}
        />
        <CandidateDecisionPanel
          node={state}
          candidateSelections={candidateSelections}
          onCandidateSelect={onCandidateSelect}
        />
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
    const asset = selection.node.source
    const prompt = assetPrompts[selection.node.id] ?? promptFromContentNode(asset) ?? ''
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Asset Detail" title={selection.node.title} Icon={selection.node.Icon} />
        <CandidateDecisionPanel
          node={asset}
          candidateSelections={candidateSelections}
          onCandidateSelect={onCandidateSelect}
        />
        <InspectorSection title="Asset 提示词草稿">
          <label className="content-canvas-prompt-editor">
            <span><TextCursorInput size={13} aria-hidden="true" /> Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => onPromptChange(selection.node.id, event.target.value)}
              onBlur={() => onPromptCommit(asset, prompt)}
              aria-label={`${selection.node.title} Asset 提示词草稿`}
            />
            <PromptReferenceStrip
              prompt={prompt}
              nodes={nodes}
              ownerNode={asset}
              onSelectNode={onSelectNode}
            />
          </label>
        </InspectorSection>
      </div>
    )
  }

  if (selection.kind === 'other' && isExpressionPromptNode(selection.node)) {
    const source = selection.node.source
    const prompt = expressionPrompts[selection.node.id] ?? promptFromContentNode(selection.node.source) ?? ''
    const childGroups = childGroupsForNode(selection.node.source, childNodesByHierarchy)
    const expressionKind = source?.kind === 'expression_unit' ? expressionUnitKindValue(source) : undefined
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Expression Prompt" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
        {expressionKind ? (
          <>
            <InspectorMeta label="表达类型" value={expressionUnitKindLabel(expressionKind)} />
            <ExpressionUnitKindCandidates value={expressionKind} />
          </>
        ) : (
          <InspectorMeta label="节点类型" value={selection.node.code} />
        )}
        <GenerationTaskPanel node={selection.node.source} />
        <CandidateDecisionPanel
          node={selection.node.source}
          candidateSelections={candidateSelections}
          onCandidateSelect={onCandidateSelect}
        />
        <InspectorChildGroups
          groups={childGroups}
          onSelectNode={onSelectNode}
        />
        <InspectorSection title="表达提示词草稿">
          <label className="content-canvas-prompt-editor">
            <span><TextCursorInput size={13} aria-hidden="true" /> Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => onExpressionPromptChange(selection.node.id, event.target.value)}
              aria-label={`${selection.node.title} 表达提示词`}
            />
            <PromptReferenceStrip
              prompt={prompt}
              nodes={nodes}
              ownerNode={selection.node.source}
              onSelectNode={onSelectNode}
            />
          </label>
        </InspectorSection>
        <InspectorSection title="引用 Setting Asset">
          {referenceAssets.length ? (
            <div className="content-canvas-reference-assets">
              {referenceAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onExpressionPromptChange(selection.node.id, appendAssetReferenceToPrompt(prompt, asset))}
                >
                  <Image size={12} aria-hidden="true" />
                  <span>{asset.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="content-canvas-reference-assets__empty">当前 Scene Moment 暂无可引用 Asset</span>
          )}
        </InspectorSection>
      </div>
    )
  }

  const node = selection.node.source
  const childGroups = childGroupsForNode(node, childNodesByHierarchy)
  const isShot = node?.kind === 'shot'
  return (
    <div className="content-canvas-inspector-card">
      <InspectorHeader
        eyebrow={isShot ? 'Shot Detail' : 'Node Detail'}
        title={selection.node.title}
        Icon={selection.node.Icon}
      />
      <p>{selection.node.description}</p>
      <InspectorMeta label="节点类型" value={selection.node.code} />
      <InspectorMeta label="布局" value="星状视图" />
      <GenerationTaskPanel node={selection.node.source} />
      <InspectorChildGroups
        groups={childGroups}
        onSelectNode={onSelectNode}
      />
      <CandidateDecisionPanel
        node={selection.node.source}
        candidateSelections={candidateSelections}
        onCandidateSelect={onCandidateSelect}
      />
    </div>
  )
}

function CreateChildNodeInspector({
  eyebrow,
  title,
  description,
  idPlaceholder,
  titlePlaceholder,
  statusPlaceholder,
  statusLabel = 'Status',
  statusOptions,
  submitLabel,
  onSubmit,
}: {
  eyebrow: string
  title: string
  description: string
  idPlaceholder: string
  titlePlaceholder: string
  statusPlaceholder: string
  statusLabel?: string
  statusOptions?: Array<{ value: string; label: string }>
  submitLabel: string
  onSubmit: (input: ContentCanvasCreateNodeInput) => void
}) {
  const [id, setId] = useState('')
  const [nodeTitle, setNodeTitle] = useState('')
  const [status, setStatus] = useState(statusOptions?.[0]?.value ?? '')
  const canSubmit = Boolean(id.trim() && nodeTitle.trim() && status.trim())

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({ id: id.trim(), title: nodeTitle.trim(), status: status.trim() })
  }

  return (
    <div className="content-canvas-inspector-card">
      <InspectorHeader eyebrow={eyebrow} title={title} Icon={Plus} />
      <p>{description}</p>
      <form className="content-canvas-inspector-create-form" onSubmit={handleSubmit}>
        <label>
          <span>ID</span>
          <input
            value={id}
            placeholder={idPlaceholder}
            onChange={(event) => setId(event.target.value)}
            autoFocus
          />
        </label>
        <label>
          <span>标题</span>
          <input
            value={nodeTitle}
            placeholder={titlePlaceholder}
            onChange={(event) => setNodeTitle(event.target.value)}
          />
        </label>
        <label>
          <span>{statusLabel}</span>
          {statusOptions ? (
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label={statusLabel}
            >
              <option value="" disabled>{statusPlaceholder}</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input
              value={status}
              placeholder={statusPlaceholder}
              onChange={(event) => setStatus(event.target.value)}
            />
          )}
        </label>
        <button type="submit" disabled={!canSubmit}>
          <Plus size={13} aria-hidden="true" />
          {submitLabel}
        </button>
      </form>
    </div>
  )
}

function ExpressionUnitKindCandidates({
  value,
}: {
  value: string
}) {
  const selectedValue = value === 'visual' ? 'visual_note' : value
  return (
    <InspectorSection title="类型候选">
      <div className="content-canvas-expression-kind-list">
        {CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS.map((option) => (
          <span key={option.value} data-selected={option.value === selectedValue ? 'true' : undefined}>
            {option.label}
            <small>{option.value}</small>
          </span>
        ))}
      </div>
    </InspectorSection>
  )
}

function GenerationTaskPanel({ node }: { node: ContentCanvasNode | undefined }) {
  const task = node?.generationTask
  if (!task) return null
  return (
    <InspectorSection title="制作项">
      <div className="content-canvas-generation-task" data-status={task.status}>
        <span>
          <small>{generationTaskStatusLabel(task.status)}</small>
          <strong>{task.title}</strong>
          <em>{task.contentUnitType} / {task.outputKind}</em>
        </span>
        <b>{task.candidates.length} 候选</b>
      </div>
      <InspectorMeta label="制作项来源" value={task.sourcePath} />
    </InspectorSection>
  )
}

function PromptReferenceStrip({
  prompt,
  nodes,
  ownerNode,
  onSelectNode,
}: {
  prompt: string
  nodes: ContentCanvasNode[]
  ownerNode: ContentCanvasNode | undefined
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}) {
  const references = promptReferenceItems(prompt, nodes, ownerNode)
  if (!references.length) return null
  return (
    <div className="content-canvas-prompt-reference-strip" aria-label="提示词引用预览">
      {references.map((reference) => (
        <button
          key={`${reference.kind}:${reference.token}`}
          type="button"
          data-missing={reference.missing ? 'true' : undefined}
          onClick={() => {
            if (reference.node) onSelectNode(inspectorKindForNode(reference.node), reference.node.id)
          }}
          disabled={!reference.node}
        >
          <PromptReferenceThumb reference={reference} />
          <span>
            <strong>{reference.title}</strong>
            <small>{reference.label}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

type PromptReferenceItem = {
  kind: 'asset' | 'candidate' | 'resource'
  token: string
  title: string
  label: string
  node?: ContentCanvasNode
  resourceId?: number
  mediaType?: 'image' | 'video' | 'audio' | 'file'
  missing?: boolean
}

function PromptReferenceThumb({ reference }: { reference: PromptReferenceItem }) {
  if (reference.resourceId !== undefined && reference.mediaType === 'image') {
    return <img src={resourceFileUrl(reference.resourceId)} alt={reference.title} loading="lazy" />
  }
  if (reference.resourceId !== undefined && reference.mediaType === 'video') {
    return <video src={resourceFileUrl(reference.resourceId)} muted playsInline preload="metadata" />
  }
  const Icon = reference.node ? iconForContentNode(reference.node) : Image
  return (
    <span className="content-canvas-prompt-reference-strip__fallback">
      <Icon size={15} aria-hidden="true" />
    </span>
  )
}

function promptReferenceItems(
  prompt: string,
  nodes: ContentCanvasNode[],
  ownerNode: ContentCanvasNode | undefined,
): PromptReferenceItem[] {
  const output: PromptReferenceItem[] = []
  const seen = new Set<string>()
  const pattern = /\{\{\s*(asset|candidate|resource):([^}]+?)\s*\}\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(prompt)) !== null) {
    const kind = match[1] as PromptReferenceItem['kind']
    const token = match[2].trim()
    const key = `${kind}:${token}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(resolvePromptReference(kind, token, nodes, ownerNode))
  }
  return output
}

function resolvePromptReference(
  kind: PromptReferenceItem['kind'],
  token: string,
  nodes: ContentCanvasNode[],
  ownerNode: ContentCanvasNode | undefined,
): PromptReferenceItem {
  if (kind === 'resource') {
    const resourceId = numberValue(token)
    return {
      kind,
      token,
      title: resourceId !== undefined ? `Resource ${resourceId}` : token,
      label: resourceId !== undefined ? '资源引用' : '资源引用缺失',
      resourceId,
      mediaType: 'image',
      missing: resourceId === undefined,
    }
  }
  if (kind === 'candidate') {
    const candidate = candidatesForNode(ownerNode).find((item) => item.id === token || String(item.resourceId) === token || item.artifactRef === token)
    if (candidate) {
      return {
        kind,
        token,
        title: candidate.title,
        label: '候选引用',
        resourceId: candidate.resourceId,
        mediaType: mediaTypeForReference(candidate.resourceKind, candidate.artifactRef),
      }
    }
  }
  const node = nodes.find((item) => (
    item.kind === kind
    && (item.entityKey === token || item.id === token || item.id === `${kind}:${token}` || item.sourcePath === token)
  ))
  if (node) {
    return {
      kind,
      token,
      title: node.title,
      label: kind === 'asset' ? 'Asset 引用' : '候选引用',
      node,
      resourceId: numberValue(node.record.resource_id ?? node.record.resourceId),
      mediaType: mediaTypeForReference(stringValue(node.record.resource_kind ?? node.record.resourceKind), stringValue(node.record.artifact_ref ?? node.record.artifactRef)),
    }
  }
  return {
    kind,
    token,
    title: token,
    label: kind === 'asset' ? 'Asset 引用缺失' : '候选引用缺失',
    missing: true,
  }
}

function mediaTypeForReference(resourceKind: string | undefined, artifactRef: string | undefined): PromptReferenceItem['mediaType'] {
  const value = `${resourceKind ?? ''} ${artifactRef ?? ''}`.toLowerCase()
  if (value.includes('video') || /\.(mp4|mov|webm|m4v)(\?|#|$)/.test(value)) return 'video'
  if (value.includes('audio') || /\.(mp3|wav|m4a|aac|ogg)(\?|#|$)/.test(value)) return 'audio'
  if (value.includes('image') || /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/.test(value)) return 'image'
  return 'file'
}

function resourceFileUrl(resourceId: number) {
  return `${getAPIBaseURL()}/api/v1/resources/${resourceId}/file`
}

function CandidateDecisionPanel({
  node,
  candidateSelections,
  onCandidateSelect,
}: {
  node: ContentCanvasNode | undefined
  candidateSelections: CandidateSelections
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
}) {
  const candidates = candidatesForNode(node)
  const decision = candidateDecisionForNode(node, candidateSelections)
  if (!node || !decision || candidates.length === 0) return null
  const selectedCandidate = selectedCandidateForNode(node, candidateSelections)
  return (
    <InspectorSection title="候选决策">
      <div className="content-canvas-candidate-summary" data-decision={decision.tone}>
        <span>{mediaKindLabel(mediaKindForNode(node))}</span>
        <strong>{selectedCandidate?.title ?? decision.label}</strong>
        <em>{decision.candidateCount} 个候选</em>
        <small>{decision.summary}</small>
      </div>
      {selectedCandidate ? (
        <div className="content-canvas-candidate-current">
          <span>
            <small>当前选择</small>
            <strong>{selectedCandidate.title}</strong>
            <em>{selectedCandidate.notes || selectedCandidate.source || selectedCandidate.artifactRef || '候选结果'}</em>
          </span>
          <b data-decision={decision.tone}>{decision.label}</b>
        </div>
      ) : (
        <div className="content-canvas-candidate-current" data-empty="true">
          <span>
            <small>当前选择</small>
            <strong>{decision.label}</strong>
            <em>{decision.summary}</em>
          </span>
          <b data-decision={decision.tone}>{decision.actionLabel}</b>
        </div>
      )}
      {candidates.length ? (
        <div className="content-canvas-candidate-list">
          {candidates.map((candidate) => {
            const selected = candidate.id === selectedCandidate?.id
            return (
              <button
                key={candidate.id}
                type="button"
                data-selected={selected ? 'true' : undefined}
                onClick={() => onCandidateSelect(node, candidate)}
              >
                <span>
                  <strong>{candidate.title}</strong>
                  <small>{candidate.notes || candidate.source || candidate.artifactRef || '候选结果'}</small>
                </span>
                <em>{selected ? '当前' : '设为当前'}</em>
              </button>
            )
          })}
        </div>
      ) : null}
    </InspectorSection>
  )
}

function InspectorNodeList({
  title,
  emptyText,
  nodes,
  onSelect,
}: {
  title: string
  emptyText: string
  nodes: ContentCanvasNode[]
  onSelect: (node: ContentCanvasNode) => void
}) {
  return (
    <InspectorSection title={title}>
      {nodes.length ? (
        <div className="content-canvas-inspector-node-list">
          {nodes.map((node) => {
            const Icon = iconForContentNode(node)
            return (
              <button key={node.id} type="button" onClick={() => onSelect(node)}>
                <span className="content-canvas-inspector-node-list__icon">
                  <Icon size={13} aria-hidden="true" />
                </span>
                <span>
                  <strong>{node.title}</strong>
                  <small>{node.summary || node.subtitle || node.entityKey}</small>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <span className="content-canvas-inspector-node-list__empty">{emptyText}</span>
      )}
    </InspectorSection>
  )
}

function InspectorChildGroups({
  groups,
  onSelectNode,
}: {
  groups: Array<{ title: string; emptyText: string; nodes: ContentCanvasNode[] }>
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}) {
  return (
    <>
      {groups.map((group) => (
        <InspectorNodeList
          key={group.title}
          title={group.title}
          emptyText={group.emptyText}
          nodes={group.nodes}
          onSelect={(node) => onSelectNode(inspectorKindForNode(node), node.id)}
        />
      ))}
    </>
  )
}

function childGroupsForNode(
  parent: ContentCanvasNode | undefined,
  childNodesByHierarchy: Map<string, ContentCanvasNode[]>,
) {
  if (!parent) return []
  if (parent.kind === 'scene_moment') {
    return [
      {
        title: '表达单元',
        emptyText: '这个情节暂无表达单元',
        nodes: childNodesFor(parent, childNodesByHierarchy, 'expression_unit'),
      },
      {
        title: 'Shot',
        emptyText: '这个情节暂无 Shot',
        nodes: childNodesFor(parent, childNodesByHierarchy, 'shot'),
      },
    ]
  }
  if (parent.kind === 'shot') {
    return [
      {
        title: 'Keyframe',
        emptyText: '这个 Shot 暂无 Keyframe',
        nodes: childNodesFor(parent, childNodesByHierarchy, 'keyframe'),
      },
      {
        title: 'Storyboard',
        emptyText: '这个 Shot 暂无 Storyboard',
        nodes: childNodesFor(parent, childNodesByHierarchy, 'storyboard'),
      },
    ]
  }
  const children = childNodesByHierarchy.get(parent.id) ?? []
  if (!children.length) return []
  return [{
    title: '下级节点',
    emptyText: '这个节点暂无下级',
    nodes: children,
  }]
}

function childNodesFor(
  parent: ContentCanvasNode,
  childNodesByHierarchy: Map<string, ContentCanvasNode[]>,
  kind: ContentCanvasNode['kind'],
) {
  return (childNodesByHierarchy.get(parent.id) ?? []).filter((node) => node.kind === kind)
}

function inspectorKindForNode(node: ContentCanvasNode): InspectorSelection['kind'] {
  if (node.kind === 'setting') return 'setting'
  if (node.kind === 'state') return 'state'
  if (node.kind === 'asset') return 'asset'
  if (node.kind === 'scene_moment') return 'scene_moment'
  return 'other'
}

function generationTaskStatusLabel(status: NonNullable<ContentCanvasNode['generationTask']>['status']) {
  if (status === 'selected') return '已选择'
  if (status === 'ready') return '可生成'
  if (status === 'stale') return '需复查'
  if (status === 'needs_candidate') return '待生成'
  return '未绑定'
}

function InspectorHeader({ eyebrow, title, Icon }: { eyebrow: string, title: string, Icon: LucideIcon }) {
  return (
    <div className="content-canvas-inspector-card__header">
      <span className="content-canvas-inspector-card__icon">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div>
        <span className="content-canvas-inspector-card__eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
      </div>
    </div>
  )
}

function InspectorMeta({ label, value }: { label: string, value: string }) {
  return (
    <div className="content-canvas-inspector-card__meta">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

function InspectorSection({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section className="content-canvas-inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function expressionUnitKindValue(node: ContentCanvasNode): string {
  return stringValue(
    node.record.expression_kind
      ?? node.record.expressionKind
      ?? node.record.kind
      ?? node.record.type,
  ) ?? 'dialogue'
}

function expressionUnitKindLabel(value: string): string {
  const normalized = value === 'visual' ? 'visual_note' : value
  const option = CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS.find((item) => item.value === (normalized as ContentCanvasExpressionUnitKind))
  return option ? `${option.label} (${value})` : value
}

export function SceneTimeline({ emptyText, items, title }: { emptyText: string; items: TimelineTrack[]; title: string }) {
  const totalDuration = Math.max(12, ...items.flatMap((track) => track.items.map((item) => (item.startSec ?? 0) + (item.durationSec ?? 0))))
  return (
    <div className="content-canvas-timeline">
      <div className="content-canvas-timeline__header">
        <div>
          <strong>{title}</strong>
          <span>OpenCut-compatible MVP view · {formatSeconds(totalDuration)} total</span>
        </div>
      </div>
      <div className="content-canvas-timeline__ruler" aria-hidden="true">
        <span>00:00</span>
        <span>{formatSeconds(totalDuration / 3)}</span>
        <span>{formatSeconds(totalDuration * 2 / 3)}</span>
        <span>{formatSeconds(totalDuration)}</span>
      </div>
      <div className="content-canvas-timeline__tracks">
        {items.length ? items.map((track) => (
          <div key={track.kind} className="content-canvas-timeline__track" data-track={track.kind}>
            <span className="content-canvas-timeline__track-label">{track.label}</span>
            <div className="content-canvas-timeline__track-surface">
              {track.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="content-canvas-timeline__item"
                  data-type={item.type}
                  data-status={item.status}
                  style={{ left: `${item.start}%`, width: `${item.width}%` }}
                  title={timelineItemTitle(item)}
                >
                  <span className="content-canvas-timeline__item-handle" aria-hidden="true" />
                  <span className="content-canvas-timeline__item-copy">
                    <strong>{item.title}</strong>
                    <small>{timelineItemMeta(item)}</small>
                  </span>
                  <span className="content-canvas-timeline__item-handle" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )) : <span className="content-canvas-timeline__empty">{emptyText}</span>}
      </div>
    </div>
  )
}

function timelineItemMeta(item: TimelineTrack['items'][number]): string {
  return [
    item.resourceId ? `res ${item.resourceId}` : statusLabelForTimelineItem(item.status),
    item.startSec !== undefined ? `${formatSeconds(item.startSec)}+${formatSeconds(item.durationSec ?? 0)}` : undefined,
    item.trimStartSec !== undefined || item.trimEndSec !== undefined ? `trim ${item.trimStartSec ?? 0}/${item.trimEndSec ?? 0}` : undefined,
  ].filter(Boolean).join(' · ')
}

function timelineItemTitle(item: TimelineTrack['items'][number]): string {
  return `${item.title}${item.resourceId ? ` · resource ${item.resourceId}` : ''}${item.contentUnitId ? ` · content unit ${item.contentUnitId}` : ''}`
}

function statusLabelForTimelineItem(status: TimelineTrack['items'][number]['status']): string {
  if (status === 'selected') return 'selected'
  if (status === 'needs_candidate') return 'needs candidate'
  if (status === 'stale') return 'stale'
  if (status === 'missing') return 'missing'
  return 'ready'
}

function formatSeconds(value: number): string {
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function TreeNode({
  node,
  onCreateChild,
  onSelectStructureNode,
}: {
  node: TreeNodeData
  onCreateChild?: (node: TreeNodeData) => void
  onSelectStructureNode: (node: TreeNodeData) => void
}) {
  const createLabel = node.kind === 'production' ? '添加 Segment' : node.kind === 'segment' ? '添加 Scene Moment' : null
  const isSelectable = node.kind === 'production' || node.kind === 'scene_moment'
  return (
    <div className="content-canvas-workspace-tree-node-wrap">
      <div className="content-canvas-workspace-tree-node-row">
        <button
          type="button"
          className="content-canvas-workspace-tree-node"
          data-active={node.active ? 'true' : undefined}
          data-tone={node.tone}
          onClick={isSelectable && node.id ? () => onSelectStructureNode(node) : undefined}
        >
          <span className="content-canvas-workspace-tree-node__chevron">{node.children?.length ? '⌄' : ''}</span>
          <span className="content-canvas-workspace-tree-node__code">{node.code}</span>
          <span className="content-canvas-workspace-tree-node__copy">
            <strong>{node.title}</strong>
            <small>{node.meta}</small>
          </span>
        </button>
        {createLabel && onCreateChild ? (
          <button
            type="button"
            className="content-canvas-workspace-tree-node__add"
            title={createLabel}
            aria-label={createLabel}
            onClick={() => onCreateChild(node)}
          >
            <Plus size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {node.children?.length ? (
        <div className="content-canvas-workspace-tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id ?? child.title}
              node={child}
              onCreateChild={onCreateChild}
              onSelectStructureNode={onSelectStructureNode}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
