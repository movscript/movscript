import { useEffect, useState, type ReactNode } from 'react'
import { Check, GitBranch, Pencil, Plus, Route, ScrollText, Target, Trash2, X } from 'lucide-react'

import type { SemanticEntityPayload, SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import type { ScriptVersion } from '@/shared/infrastructure/api/scriptVersions'
import {
  ScriptVersionBindingInline,
} from '@/features/production/components/ProductionScriptBinding'
import type {
  ProductionSegmentNavigatorItem,
} from '@/features/production/domain/productionOrchestrationWorkspaceModel'
import { productionEntityStatusRecipe, productionPresenceRecipe } from '@/features/production/presentation/productionSemanticUi'
import {
  ProductionSceneEditorContextGrid,
  ProductionSceneEditorContextLine,
  ProductionSceneEditorHeaderCopy,
  ProductionSceneEditorHeaderShell,
  ProductionSegmentEmptyMomentItem,
  ProductionSegmentMomentItem,
  ProductionSegmentMomentStack,
  ProductionSegmentNavigatorCard,
  ProductionSegmentNavigatorCardHeader,
  ProductionSegmentNavigatorEmptyState,
  ProductionSegmentNavigatorHeader,
  ProductionSegmentNavigatorSection,
  ProductionSegmentNavigatorShell,
  ProductionSegmentStack,
  ProductionSelectedSegmentActions,
  ProductionSelectedSegmentCopy,
  ProductionSelectedSegmentEditStack,
  ProductionSelectedSegmentField,
  ProductionSelectedSegmentFieldGrid,
  ProductionSelectedSegmentInput,
  ProductionSelectedSegmentSelectTrigger,
  ProductionSelectedSegmentSummaryBody,
  ProductionSelectedSegmentSummaryShell,
  ProductionSelectedSegmentTextarea,
  ProductionStructureActionButton,
  ProductionStructureBadge,
  ProductionStructureIconButton,
  ProductionStructureStatusBadge,
  ProductionStructureWorkspaceLayout as ProductionStructureWorkspaceLayoutShell,
  ProductionWorkspaceHeaderContextMeta,
  ProductionWorkspaceHeaderContextShell,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@movscript/ui'

const segmentKindOptions = [
  { value: 'emotional_function', label: '情绪功能' },
  { value: 'rhythm_shift', label: '节奏变化' },
  { value: 'dramatic_function', label: '戏剧功能' },
  { value: 'setup', label: '铺垫' },
  { value: 'escalation', label: '升级' },
  { value: 'release', label: '释放' },
  { value: 'reversal', label: '反转' },
  { value: 'transition', label: '转场' },
]

const segmentStatusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'confirmed', label: '已确认' },
  { value: 'ignored', label: '已忽略' },
]

export function ProductionStructureWorkspaceLayout({
  segments,
  onCreateSegment,
  onCreateSceneMoment,
  onEditSegment,
  onSelectSceneMoment,
  children,
}: {
  segments: ProductionSegmentNavigatorItem[]
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onEditSegment: (record: SemanticEntityRecord) => void
  onSelectSceneMoment: (momentId: number) => void
  children: ReactNode
}) {
  return (
    <ProductionStructureWorkspaceLayoutShell
      sidebar={(
        <ProductionSegmentNavigator
          segments={segments}
          onCreateSegment={onCreateSegment}
          onCreateSceneMoment={onCreateSceneMoment}
          onEditSegment={onEditSegment}
          onSelectSceneMoment={onSelectSceneMoment}
        />
      )}
    >
      {children}
    </ProductionStructureWorkspaceLayoutShell>
  )
}

export function ProductionWorkspaceHeaderContext({
  projectName,
  productionLabel,
  segmentCount,
  sceneMomentCount,
  writingExpressionCount,
  selectedScriptVersion,
  scriptVersions,
  scriptText,
  scriptBlockCount,
  nextStep,
  isFetchingScriptVersions,
  isBindingScriptVersion,
  disabled,
  onBindScriptVersion,
}: {
  projectName: string
  productionLabel: string
  segmentCount: number
  sceneMomentCount: number
  writingExpressionCount: number
  selectedScriptVersion: ScriptVersion | null
  scriptVersions: ScriptVersion[]
  scriptText: string
  scriptBlockCount: number
  nextStep: string
  isFetchingScriptVersions: boolean
  isBindingScriptVersion: boolean
  disabled: boolean
  onBindScriptVersion: (scriptVersionId: number | null) => void
}) {
  return (
    <ProductionWorkspaceHeaderContextShell>
      <ProductionWorkspaceHeaderContextMeta
        productionLabel={productionLabel}
        projectName={projectName}
        nextStep={nextStep}
      >
        <ProductionStructureBadge variant="outline">{segmentCount} 编排段</ProductionStructureBadge>
        <ProductionStructureBadge variant="outline">{sceneMomentCount} 情节</ProductionStructureBadge>
        <ProductionStructureStatusBadge statusProps={productionPresenceRecipe(writingExpressionCount > 0)}>
          {writingExpressionCount === 0 ? '待补表达' : `${writingExpressionCount} 条表达`}
        </ProductionStructureStatusBadge>
      </ProductionWorkspaceHeaderContextMeta>
      <ScriptVersionBindingInline
        scriptVersions={scriptVersions}
        selectedScriptVersion={selectedScriptVersion}
        scriptText={scriptText}
        scriptBlockCount={scriptBlockCount}
        isFetching={isFetchingScriptVersions}
        isSaving={isBindingScriptVersion}
        disabled={disabled}
        onChange={onBindScriptVersion}
      />
    </ProductionWorkspaceHeaderContextShell>
  )
}

export function ProductionSegmentNavigator({
  segments,
  onCreateSegment,
  onCreateSceneMoment,
  onEditSegment,
  onSelectSceneMoment,
}: {
  segments: ProductionSegmentNavigatorItem[]
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onEditSegment: (record: SemanticEntityRecord) => void
  onSelectSceneMoment: (momentId: number) => void
}) {
  return (
    <ProductionSegmentNavigatorShell
      header={(
        <ProductionSegmentNavigatorHeader
          title="编排结构"
          description="按剧本顺序推进编排段和情节。"
          action={(
            <ProductionStructureIconButton size="icon-sm" variant="outline" aria-label="新增编排段" onClick={onCreateSegment}>
              <Plus size={12} />
            </ProductionStructureIconButton>
          )}
        />
      )}
    >
      {segments.length === 0 ? (
        <ProductionSegmentNavigatorEmptyState title="还没有编排段。先添加一个铺垫、发现、反转或释放段，再把情节放进去。" />
      ) : (
        <ProductionSegmentStack>
          {segments.map((segment) => (
            <ProductionSegmentNavigatorSection key={segment.id} active={segment.active}>
              <ProductionSegmentNavigatorCard
                header={(
                  <ProductionSegmentNavigatorCardHeader
                    index={segment.indexLabel}
                    status={(
                      <ProductionStructureStatusBadge statusProps={productionEntityStatusRecipe(segment.status)}>
                        {segment.statusLabel}
                      </ProductionStructureStatusBadge>
                    )}
                    title={segment.title}
                    summary={segment.summary}
                    action={segment.active ? (
                      <ProductionStructureIconButton
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`编辑编排段 ${segment.title}`}
                        onClick={() => onEditSegment(segment.rawRecord)}
                      >
                        <Pencil size={12} />
                      </ProductionStructureIconButton>
                    ) : null}
                  />
                )}
                badges={(
                  <>
                    <ProductionStructureBadge variant="outline">{segment.moments.length} 情节</ProductionStructureBadge>
                    <ProductionStructureBadge variant="outline">{segment.kindLabel}</ProductionStructureBadge>
                  </>
                )}
              >
                <ProductionSegmentMomentStack>
                  {segment.moments.length === 0 ? (
                    <ProductionSegmentEmptyMomentItem onClick={() => onCreateSceneMoment(segment.id)}>
                      这个编排段还没有情节，点击添加。
                    </ProductionSegmentEmptyMomentItem>
                  ) : segment.moments.map((moment) => (
                    <ProductionSegmentMomentItem
                      key={moment.id}
                      active={moment.active}
                      identifier={moment.identifier}
                      title={moment.title}
                      description={moment.description}
                      status={(
                        <ProductionStructureStatusBadge statusProps={productionPresenceRecipe(moment.lineCount > 0)}>
                          {moment.lineCount} 条
                        </ProductionStructureStatusBadge>
                      )}
                      onClick={() => onSelectSceneMoment(moment.id)}
                    />
                  ))}
                </ProductionSegmentMomentStack>
              </ProductionSegmentNavigatorCard>
            </ProductionSegmentNavigatorSection>
          ))}
        </ProductionSegmentStack>
      )}
    </ProductionSegmentNavigatorShell>
  )
}

export function ProductionSelectedSegmentSummary({
  selectedSegment,
  momentCount,
  lineCount,
  isSaving,
  isDeleting,
  editing,
  onCreateSceneMoment,
  onEditingChange,
  onSaveSegment,
  onDeleteSegment,
}: {
  selectedSegment: SemanticEntityRecord | null
  momentCount: number
  lineCount: number
  isSaving: boolean
  isDeleting: boolean
  editing: boolean
  onCreateSceneMoment: (segmentId: number) => void
  onEditingChange: (editing: boolean) => void
  onSaveSegment: (segmentId: number, payload: SemanticEntityPayload) => void
  onDeleteSegment: (segmentId: number) => void
}) {
  const [draft, setDraft] = useState({
    title: '',
    kind: 'emotional_function',
    summary: '',
    status: 'draft',
  })

  useEffect(() => {
    setDraft({
      title: stringField(selectedSegment?.title) || stringField(selectedSegment?.name) || '',
      kind: stringField(selectedSegment?.kind) || 'emotional_function',
      summary: stringField(selectedSegment?.summary) || stringField(selectedSegment?.content) || '',
      status: stringField(selectedSegment?.status) || 'draft',
    })
  }, [selectedSegment?.ID, selectedSegment?.content, selectedSegment?.kind, selectedSegment?.name, selectedSegment?.status, selectedSegment?.summary, selectedSegment?.title])

  const selectedSegmentId = selectedSegment?.ID ?? null
  const selectedSegmentTitle = stringField(selectedSegment?.title) || stringField(selectedSegment?.name) || '未选择编排段'
  const selectedSegmentSummary = stringField(selectedSegment?.summary) || stringField(selectedSegment?.content) || '这一段还没有说明编排功能。'
  const original = {
    title: stringField(selectedSegment?.title) || stringField(selectedSegment?.name) || '',
    kind: stringField(selectedSegment?.kind) || 'emotional_function',
    summary: stringField(selectedSegment?.summary) || stringField(selectedSegment?.content) || '',
    status: stringField(selectedSegment?.status) || 'draft',
  }
  const changed = Object.keys(draft).some((key) => draft[key as keyof typeof draft].trim() !== original[key as keyof typeof original].trim())

  function resetDraft() {
    setDraft(original)
    onEditingChange(false)
  }

  function saveDraft() {
    if (!selectedSegmentId || !draft.title.trim()) return
    onSaveSegment(selectedSegmentId, {
      title: draft.title.trim(),
      kind: draft.kind.trim(),
      summary: draft.summary.trim(),
      status: draft.status.trim(),
    })
    onEditingChange(false)
  }

  return (
    <ProductionSelectedSegmentSummaryShell>
      <ProductionSelectedSegmentSummaryBody>
        {editing && selectedSegment ? (
          <ProductionSelectedSegmentCopy icon={Route} eyebrow="当前编排段">
            <ProductionSelectedSegmentEditStack>
              <ProductionSelectedSegmentFieldGrid>
                <ProductionSelectedSegmentField label="标题">
                  <ProductionSelectedSegmentInput
                    value={draft.title}
                    onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="编排段标题"
                  />
                </ProductionSelectedSegmentField>
                <ProductionSelectedSegmentField label="情绪功能">
                  <Select value={draft.kind} onValueChange={(value) => setDraft((prev) => ({ ...prev, kind: value }))}>
                    <ProductionSelectedSegmentSelectTrigger>
                      <SelectValue />
                    </ProductionSelectedSegmentSelectTrigger>
                    <SelectContent>
                      {segmentKindOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ProductionSelectedSegmentField>
                <ProductionSelectedSegmentField label="状态">
                  <Select value={draft.status} onValueChange={(value) => setDraft((prev) => ({ ...prev, status: value }))}>
                    <ProductionSelectedSegmentSelectTrigger>
                      <SelectValue />
                    </ProductionSelectedSegmentSelectTrigger>
                    <SelectContent>
                      {segmentStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ProductionSelectedSegmentField>
              </ProductionSelectedSegmentFieldGrid>
              <ProductionSelectedSegmentField label="情绪 / 节奏 / 戏剧功能说明">
                <ProductionSelectedSegmentTextarea
                  value={draft.summary}
                  onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
                  placeholder="说明这一段承担的情绪推进、节奏变化或戏剧功能"
                />
              </ProductionSelectedSegmentField>
            </ProductionSelectedSegmentEditStack>
          </ProductionSelectedSegmentCopy>
        ) : (
          <ProductionSelectedSegmentCopy
            icon={Route}
            eyebrow="当前编排段"
            title={selectedSegmentTitle}
            description={selectedSegmentSummary}
          />
        )}
        <ProductionSelectedSegmentActions>
          <ProductionStructureBadge variant="outline">{momentCount} 个情节 · {lineCount} 条表达</ProductionStructureBadge>
          {selectedSegment ? (
            editing ? (
              <>
                <ProductionStructureActionButton size="sm" variant="outline" disabled={isSaving} onClick={resetDraft}>
                  <X size={12} />
                  取消
                </ProductionStructureActionButton>
                <ProductionStructureActionButton size="sm" loading={isSaving} disabled={!draft.title.trim() || !changed || isSaving} onClick={saveDraft}>
                  <Check size={12} />
                  保存编排段
                </ProductionStructureActionButton>
              </>
            ) : (
              <>
                <ProductionStructureActionButton
                  size="sm"
                  variant="solid"
                  tone="danger"
                  loading={isDeleting}
                  disabled={isSaving || isDeleting}
                  onClick={() => {
                    const title = selectedSegmentTitle || `编排段 #${selectedSegment.ID}`
                    if (!window.confirm(`确定删除编排段「${title}」吗？该段下的情节、制作项和预览时间线会一起标记为不可用。`)) return
                    onDeleteSegment(selectedSegment.ID)
                  }}
                >
                  <Trash2 size={12} />
                  删除编排段
                </ProductionStructureActionButton>
                <ProductionStructureActionButton size="sm" variant="outline" onClick={() => onEditingChange(true)} disabled={isSaving || isDeleting}>
                  <Pencil size={12} />
                  编辑说明
                </ProductionStructureActionButton>
              </>
            )
          ) : null}
          {selectedSegmentId ? (
            <ProductionStructureActionButton size="sm" onClick={() => onCreateSceneMoment(selectedSegmentId)} disabled={editing || isDeleting}>
              <Plus size={12} />
              添加情节
            </ProductionStructureActionButton>
          ) : null}
        </ProductionSelectedSegmentActions>
      </ProductionSelectedSegmentSummaryBody>
    </ProductionSelectedSegmentSummaryShell>
  )
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function ProductionSceneEditorHeader({
  title,
  selectedSegmentTitle,
  dramaticTask,
  writingProgressLabel,
}: {
  title: string
  selectedSegmentTitle: string
  dramaticTask: string
  writingProgressLabel: string
}) {
  return (
    <ProductionSceneEditorHeaderShell>
      <ProductionSceneEditorHeaderCopy
        icon={GitBranch}
        eyebrow="情节编辑"
        title={title}
        description="情节负责语境和任务；先绑定剧本块，再按顺序写对白、动作、旁白、屏幕文字和镜头描述。"
      />
      <ProductionSceneEditorContextGrid>
        <ProductionSceneEditorContextLine icon={Route} label="所属编排段" value={selectedSegmentTitle} />
        <ProductionSceneEditorContextLine icon={Target} label="戏剧任务" value={dramaticTask} />
        <ProductionSceneEditorContextLine icon={ScrollText} label="表达数量" value={writingProgressLabel} />
      </ProductionSceneEditorContextGrid>
    </ProductionSceneEditorHeaderShell>
  )
}
