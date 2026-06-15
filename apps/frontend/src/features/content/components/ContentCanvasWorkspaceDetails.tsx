import type { ReactNode } from 'react'
import { Image, Link2, Plus, TextCursorInput, type LucideIcon } from 'lucide-react'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { CandidateSelections, InspectorSelection, RadialNode, TimelineTrack, TreeNodeData } from './contentCanvasWorkspaceTypes'
import { appendAssetReferenceToPrompt, candidatesForNode, contentStatusLabel, iconForContentNode, isExpressionPromptNode, mediaKindForNode, mediaKindLabel, promptFromContentNode, selectedCandidateForNode, stringField } from './contentCanvasWorkspaceModel'

export function NodeInspector({
  selection,
  activeSetting,
  assetPrompts,
  expressionPrompts,
  candidateSelections,
  referenceAssets,
  onPromptChange,
  onExpressionPromptChange,
  onCandidateSelect,
}: {
  selection: InspectorSelection
  activeSetting: ContentCanvasNode | null
  assetPrompts: Record<string, string>
  expressionPrompts: Record<string, string>
  candidateSelections: CandidateSelections
  referenceAssets: ContentCanvasNode[]
  onPromptChange: (assetId: string, prompt: string) => void
  onExpressionPromptChange: (nodeId: string, prompt: string) => void
  onCandidateSelect: (nodeId: string, candidateId: string) => void
}) {
  if (selection.kind === 'setting') {
    const Icon = iconForContentNode(selection.setting)
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Setting Detail" title={selection.setting.title} Icon={Icon} />
        <p>{selection.setting.summary || selection.setting.subtitle}</p>
        <InspectorMeta label="Setting 类型" value={selection.setting.subtitle} />
        <InspectorMeta label="状态" value={contentStatusLabel(selection.setting.status)} />
        <InspectorMeta label="来源" value={selection.setting.sourcePath} />
        <CandidateDecisionPanel
          node={selection.setting}
          candidateSelections={candidateSelections}
          onCandidateSelect={onCandidateSelect}
        />
        <InspectorSection title="可添加关系">
          <div className="content-canvas-inspector-actions">
            <button type="button"><Plus size={13} aria-hidden="true" /> State</button>
            <button type="button"><Link2 size={13} aria-hidden="true" /> 绑定 Scene</button>
          </div>
        </InspectorSection>
      </div>
    )
  }

  if (selection.kind === 'state') {
    const state = selection.node.source
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="State Detail" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
        <InspectorMeta label="所属 Setting" value={activeSetting?.title ?? '未关联'} />
        <InspectorMeta label="节点类型" value="State" />
        <InspectorMeta label="来源" value={state?.sourcePath ?? selection.node.id} />
        <CandidateDecisionPanel
          node={state}
          candidateSelections={candidateSelections}
          onCandidateSelect={onCandidateSelect}
        />
        <InspectorSection title="State 约束">
          <textarea
            defaultValue={state?.summary || `保持「${selection.node.title}」在跨 Scene Moment 使用时连续一致。`}
            aria-label="State 约束说明"
          />
        </InspectorSection>
        <InspectorSection title="可添加关系">
          <div className="content-canvas-inspector-actions">
            <button type="button"><Plus size={13} aria-hidden="true" /> Asset</button>
          </div>
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
        <p>{selection.node.description}</p>
        <InspectorMeta label="所属 Setting" value={activeSetting?.title ?? '未关联'} />
        <InspectorMeta label="父级 State" value={assetParentStateLabel(selection.node, activeSetting)} />
        <InspectorMeta label="来源" value={asset?.sourcePath ?? selection.node.id} />
        <CandidateDecisionPanel
          node={asset}
          candidateSelections={candidateSelections}
          onCandidateSelect={onCandidateSelect}
        />
        <InspectorSection title="Content-unit 提示词">
          <label className="content-canvas-prompt-editor">
            <span><TextCursorInput size={13} aria-hidden="true" /> Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => onPromptChange(selection.node.id, event.target.value)}
              aria-label={`${selection.node.title} Content-unit 提示词`}
            />
          </label>
        </InspectorSection>
      </div>
    )
  }

  if (selection.kind === 'other' && isExpressionPromptNode(selection.node)) {
    const prompt = expressionPrompts[selection.node.id] ?? promptFromContentNode(selection.node.source) ?? ''
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Expression Prompt" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
        <InspectorMeta label="节点类型" value={selection.node.code} />
        <CandidateDecisionPanel
          node={selection.node.source}
          candidateSelections={candidateSelections}
          onCandidateSelect={onCandidateSelect}
        />
        <InspectorSection title="表达提示词">
          <label className="content-canvas-prompt-editor">
            <span><TextCursorInput size={13} aria-hidden="true" /> Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => onExpressionPromptChange(selection.node.id, event.target.value)}
              aria-label={`${selection.node.title} 表达提示词`}
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

  return (
    <div className="content-canvas-inspector-card">
      <InspectorHeader
        eyebrow={selection.kind === 'scene_moment' ? 'Scene Moment Detail' : 'Node Detail'}
        title={selection.node.title}
        Icon={selection.node.Icon}
      />
      <p>{selection.node.description}</p>
      <InspectorMeta label="节点类型" value={selection.node.code} />
      <InspectorMeta label="布局" value="星状视图" />
      <CandidateDecisionPanel
        node={selection.node.source}
        candidateSelections={candidateSelections}
        onCandidateSelect={onCandidateSelect}
      />
    </div>
  )
}

function CandidateDecisionPanel({
  node,
  candidateSelections,
  onCandidateSelect,
}: {
  node: ContentCanvasNode | undefined
  candidateSelections: CandidateSelections
  onCandidateSelect: (nodeId: string, candidateId: string) => void
}) {
  const candidates = candidatesForNode(node)
  if (!node || candidates.length === 0) return null
  const selectedCandidate = selectedCandidateForNode(node, candidateSelections) ?? candidates[0]
  return (
    <InspectorSection title="候选决策">
      <div className="content-canvas-candidate-summary">
        <span>{mediaKindLabel(mediaKindForNode(node))}</span>
        <strong>{selectedCandidate.title}</strong>
        <em>{candidates.length} 个候选</em>
      </div>
      <div className="content-canvas-candidate-list">
        {candidates.map((candidate) => {
          const selected = candidate.id === selectedCandidate.id
          return (
            <button
              key={candidate.id}
              type="button"
              data-selected={selected ? 'true' : undefined}
              onClick={() => onCandidateSelect(node.id, candidate.id)}
            >
              <span>
                <strong>{candidate.title}</strong>
                <small>{candidate.notes || candidate.source || candidate.artifactRef || '候选结果'}</small>
              </span>
              <em>{selected ? '当前' : '选择'}</em>
            </button>
          )
        })}
      </div>
    </InspectorSection>
  )
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

function assetParentStateLabel(assetNode: RadialNode, activeSetting: ContentCanvasNode | null) {
  const stateRef = stringField(assetNode.source?.record, 'setting_state_id', 'setting_state_ref', 'state_id')
  return stateRef || activeSetting?.title || 'State'
}

export function SceneTimeline({ items }: { items: TimelineTrack[] }) {
  return (
    <div className="content-canvas-timeline">
      <div className="content-canvas-timeline__header">
        <div>
          <strong>Scene Moment Timeline</strong>
          <span>只显示当前 Scene Moment 已存在的音频、视频、字幕表达轨道。</span>
        </div>
        <button type="button">
          <Plus size={13} aria-hidden="true" />
          表达单元
        </button>
      </div>
      <div className="content-canvas-timeline__ruler" aria-hidden="true">
        <span>00:00</span>
        <span>00:04</span>
          <span>00:08</span>
          <span>00:12</span>
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
                  style={{ left: `${item.start}%`, width: `${item.width}%` }}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>
        )) : <span className="content-canvas-timeline__empty">当前 Scene Moment 暂无音频 / 视频 / 字幕表达轨道</span>}
      </div>
    </div>
  )
}

export function TreeNode({ node, onSelectScene }: { node: TreeNodeData, onSelectScene: (sceneId: string) => void }) {
  return (
    <div className="content-canvas-workspace-tree-node-wrap">
      <button
        type="button"
        className="content-canvas-workspace-tree-node"
        data-active={node.active ? 'true' : undefined}
        data-tone={node.tone}
        onClick={node.code === 'SCN' && node.id ? () => onSelectScene(node.id!) : undefined}
      >
        <span className="content-canvas-workspace-tree-node__chevron">{node.children?.length ? '⌄' : ''}</span>
        <span className="content-canvas-workspace-tree-node__code">{node.code}</span>
        <span className="content-canvas-workspace-tree-node__copy">
          <strong>{node.title}</strong>
          <small>{node.meta}</small>
        </span>
      </button>
      {node.children?.length ? (
        <div className="content-canvas-workspace-tree-children">
          {node.children.map((child) => <TreeNode key={child.title} node={child} onSelectScene={onSelectScene} />)}
        </div>
      ) : null}
    </div>
  )
}
