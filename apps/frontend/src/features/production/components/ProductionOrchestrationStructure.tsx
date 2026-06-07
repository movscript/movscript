import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'

import type { SemanticEntityPayload, SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import type {
  ProductionSegmentNavigatorItem,
  ProductionOrchestrationDropPosition,
} from '@/features/production/domain/productionOrchestrationWorkspaceModel'
import { productionPresenceRecipe } from '@/features/production/presentation/productionSemanticUi'
import {
  ProductionSegmentEmptyMomentItem,
  ProductionSegmentMomentItem,
  ProductionSegmentMomentStack,
  ProductionSegmentNavigatorCard,
  ProductionSegmentNavigatorCardActions,
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

const segmentDragDataKey = 'application/x-movscript-production-segment-id'
const sceneMomentDragDataKey = 'application/x-movscript-production-scene-moment-id'

export function ProductionStructureWorkspaceLayout({
  segments,
  editingSegmentId,
  isSavingSegment,
  isReorderingStructure,
  isDeletingSegment,
  onCreateSegment,
  onCreateSceneMoment,
  onEditingSegmentChange,
  onSaveSegment,
  onDeleteSegment,
  onSelectSceneMoment,
  onReorderSegment,
  onReorderSceneMoment,
  children,
}: {
  segments: ProductionSegmentNavigatorItem[]
  editingSegmentId: number | null
  isSavingSegment: boolean
  isReorderingStructure: boolean
  isDeletingSegment: boolean
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onEditingSegmentChange: (segmentId: number | null) => void
  onSaveSegment: (segmentId: number, payload: SemanticEntityPayload) => void
  onDeleteSegment: (segmentId: number) => void
  onSelectSceneMoment: (momentId: number) => void
  onReorderSegment: (draggedSegmentId: number, targetSegmentId: number, position: ProductionOrchestrationDropPosition) => void
  onReorderSceneMoment: (draggedMomentId: number, targetSegmentId: number, targetMomentId: number | null, position: ProductionOrchestrationDropPosition) => void
  children?: ReactNode
}) {
  return (
    <ProductionStructureWorkspaceLayoutShell
      sidebar={(
        <ProductionSegmentNavigator
          segments={segments}
          editingSegmentId={editingSegmentId}
          isSavingSegment={isSavingSegment}
          isReorderingStructure={isReorderingStructure}
          isDeletingSegment={isDeletingSegment}
          onCreateSegment={onCreateSegment}
          onCreateSceneMoment={onCreateSceneMoment}
          onEditingSegmentChange={onEditingSegmentChange}
          onSaveSegment={onSaveSegment}
          onDeleteSegment={onDeleteSegment}
          onSelectSceneMoment={onSelectSceneMoment}
          onReorderSegment={onReorderSegment}
          onReorderSceneMoment={onReorderSceneMoment}
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
  nextStep,
}: {
  projectName: string
  productionLabel: string
  segmentCount: number
  sceneMomentCount: number
  writingExpressionCount: number
  nextStep: string
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
    </ProductionWorkspaceHeaderContextShell>
  )
}

export function ProductionSegmentNavigator({
  segments,
  editingSegmentId,
  isSavingSegment,
  isReorderingStructure,
  isDeletingSegment,
  onCreateSegment,
  onCreateSceneMoment,
  onEditingSegmentChange,
  onSaveSegment,
  onDeleteSegment,
  onSelectSceneMoment,
  onReorderSegment,
  onReorderSceneMoment,
}: {
  segments: ProductionSegmentNavigatorItem[]
  editingSegmentId: number | null
  isSavingSegment: boolean
  isReorderingStructure: boolean
  isDeletingSegment: boolean
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onEditingSegmentChange: (segmentId: number | null) => void
  onSaveSegment: (segmentId: number, payload: SemanticEntityPayload) => void
  onDeleteSegment: (segmentId: number) => void
  onSelectSceneMoment: (momentId: number) => void
  onReorderSegment: (draggedSegmentId: number, targetSegmentId: number, position: ProductionOrchestrationDropPosition) => void
  onReorderSceneMoment: (draggedMomentId: number, targetSegmentId: number, targetMomentId: number | null, position: ProductionOrchestrationDropPosition) => void
}) {
  const [draggingSegmentId, setDraggingSegmentId] = useState<number | null>(null)
  const [draggingMomentId, setDraggingMomentId] = useState<number | null>(null)
  const canReorderStructure = !isReorderingStructure && editingSegmentId === null

  function clearDragState() {
    setDraggingSegmentId(null)
    setDraggingMomentId(null)
  }

  function handleSegmentDragStart(event: DragEvent<HTMLElement>, segmentId: number) {
    if (!canReorderStructure) return
    setDraggingSegmentId(segmentId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(segmentDragDataKey, String(segmentId))
  }

  function handleMomentDragStart(event: DragEvent<HTMLElement>, momentId: number) {
    if (!canReorderStructure) return
    event.stopPropagation()
    setDraggingMomentId(momentId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(sceneMomentDragDataKey, String(momentId))
  }

  function handleSegmentDragOver(event: DragEvent<HTMLElement>, segmentId: number) {
    if (!canReorderStructure) return
    const draggedSegmentId = Number(event.dataTransfer.getData(segmentDragDataKey) || draggingSegmentId || 0)
    const draggedMomentId = Number(event.dataTransfer.getData(sceneMomentDragDataKey) || draggingMomentId || 0)
    if ((!draggedSegmentId || draggedSegmentId === segmentId) && !draggedMomentId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function handleSegmentDrop(event: DragEvent<HTMLElement>, targetSegmentId: number) {
    const draggedSegmentId = Number(event.dataTransfer.getData(segmentDragDataKey) || draggingSegmentId || 0)
    if (!draggedSegmentId || draggedSegmentId === targetSegmentId) return
    event.preventDefault()
    event.stopPropagation()
    onReorderSegment(draggedSegmentId, targetSegmentId, dropPositionForVerticalEvent(event))
    clearDragState()
  }

  function handleMomentStackDrop(event: DragEvent<HTMLElement>, targetSegmentId: number) {
    const draggedMomentId = Number(event.dataTransfer.getData(sceneMomentDragDataKey) || draggingMomentId || 0)
    if (!draggedMomentId) return
    event.preventDefault()
    event.stopPropagation()
    onReorderSceneMoment(draggedMomentId, targetSegmentId, null, 'after')
    clearDragState()
  }

  function handleMomentDrop(event: DragEvent<HTMLElement>, targetSegmentId: number, targetMomentId: number) {
    const draggedMomentId = Number(event.dataTransfer.getData(sceneMomentDragDataKey) || draggingMomentId || 0)
    if (!draggedMomentId || draggedMomentId === targetMomentId) return
    event.preventDefault()
    event.stopPropagation()
    onReorderSceneMoment(draggedMomentId, targetSegmentId, targetMomentId, dropPositionForVerticalEvent(event))
    clearDragState()
  }

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
          {segments.map((segment) => {
            const editing = editingSegmentId === segment.id

            return (
              <ProductionSegmentNavigatorSection key={segment.id} active={segment.active}>
                <ProductionSegmentNavigatorCard
                  draggable={canReorderStructure}
                  data-draggable={canReorderStructure ? 'true' : undefined}
                  data-dragging={draggingSegmentId === segment.id ? 'true' : undefined}
                  aria-grabbed={draggingSegmentId === segment.id}
                  title={canReorderStructure ? '拖动调整编排段顺序' : undefined}
                  onDragStart={(event) => handleSegmentDragStart(event, segment.id)}
                  onDragOver={(event) => handleSegmentDragOver(event, segment.id)}
                  onDrop={(event) => handleSegmentDrop(event, segment.id)}
                  onDragEnd={clearDragState}
                  header={(
                    <ProductionSegmentNavigatorCardHeader
                      index={segment.indexLabel}
                      title={segment.title}
                      summary={segment.summary}
                      action={editing ? null : (
                        <ProductionSegmentNavigatorCardActions>
                          <ProductionStructureIconButton
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`拖动编排段 ${segment.title}`}
                            title="拖动排序"
                            disabled={!canReorderStructure}
                          >
                            <GripVertical size={12} />
                          </ProductionStructureIconButton>
                          <ProductionStructureIconButton
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`添加情节到 ${segment.title}`}
                            title="添加情节"
                            onClick={() => onCreateSceneMoment(segment.id)}
                          >
                            <Plus size={12} />
                          </ProductionStructureIconButton>
                          <ProductionStructureIconButton
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`编辑编排段 ${segment.title}`}
                            title="编辑编排段"
                            onClick={() => onEditingSegmentChange(segment.id)}
                          >
                            <Pencil size={12} />
                          </ProductionStructureIconButton>
                        </ProductionSegmentNavigatorCardActions>
                      )}
                    />
                  )}
                  badges={editing ? null : (
                    <>
                      <ProductionStructureBadge variant="outline">{segment.moments.length} 情节</ProductionStructureBadge>
                      <ProductionStructureBadge variant="outline">{segment.kindLabel}</ProductionStructureBadge>
                    </>
                  )}
                >
                  {editing ? (
                    <ProductionSegmentCardEditor
                      segment={segment.rawRecord}
                      momentCount={segment.moments.length}
                      isSaving={isSavingSegment}
                      isDeleting={isDeletingSegment}
                      onCancel={() => onEditingSegmentChange(null)}
                      onSave={(payload) => {
                        onSaveSegment(segment.id, payload)
                        onEditingSegmentChange(null)
                      }}
                      onDelete={() => {
                        const title = segment.title || `编排段 #${segment.id}`
                        if (!window.confirm(`确定删除编排段「${title}」吗？该段下的情节、制作项和预览时间线会一起标记为不可用。`)) return
                        onDeleteSegment(segment.id)
                        onEditingSegmentChange(null)
                      }}
                    />
                  ) : null}
                  <ProductionSegmentMomentStack
                    onDragOver={(event) => {
                      if (!canReorderStructure) return
                      const draggedMomentId = Number(event.dataTransfer.getData(sceneMomentDragDataKey) || draggingMomentId || 0)
                      if (!draggedMomentId) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(event) => handleMomentStackDrop(event, segment.id)}
                  >
                    {segment.moments.length === 0 ? (
                      <ProductionSegmentEmptyMomentItem
                        onClick={() => onCreateSceneMoment(segment.id)}
                        onDragOver={(event) => {
                          if (!canReorderStructure) return
                          const draggedMomentId = Number(event.dataTransfer.getData(sceneMomentDragDataKey) || draggingMomentId || 0)
                          if (!draggedMomentId) return
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(event) => handleMomentStackDrop(event, segment.id)}
                      >
                        这个编排段还没有情节，点击添加。
                      </ProductionSegmentEmptyMomentItem>
                    ) : segment.moments.map((moment) => (
                      <ProductionSegmentMomentItem
                        key={moment.id}
                        active={moment.active}
                        draggable={canReorderStructure}
                        data-draggable={canReorderStructure ? 'true' : undefined}
                        data-dragging={draggingMomentId === moment.id ? 'true' : undefined}
                        aria-grabbed={draggingMomentId === moment.id}
                        identifier={moment.identifier}
                        title={moment.title}
                        description={moment.description}
                        status={(
                          <ProductionStructureStatusBadge statusProps={productionPresenceRecipe(moment.lineCount > 0)}>
                            {moment.lineCount} 条
                          </ProductionStructureStatusBadge>
                        )}
                        onDragStart={(event) => handleMomentDragStart(event, moment.id)}
                        onDragOver={(event) => {
                          if (!canReorderStructure) return
                          const draggedMomentId = Number(event.dataTransfer.getData(sceneMomentDragDataKey) || draggingMomentId || 0)
                          if (!draggedMomentId || draggedMomentId === moment.id) return
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(event) => handleMomentDrop(event, segment.id, moment.id)}
                        onDragEnd={clearDragState}
                        onClick={() => onSelectSceneMoment(moment.id)}
                      />
                    ))}
                  </ProductionSegmentMomentStack>
                </ProductionSegmentNavigatorCard>
              </ProductionSegmentNavigatorSection>
            )
          })}
        </ProductionSegmentStack>
      )}
    </ProductionSegmentNavigatorShell>
  )
}

function dropPositionForVerticalEvent(event: DragEvent<HTMLElement>): ProductionOrchestrationDropPosition {
  const box = event.currentTarget.getBoundingClientRect()
  return event.clientY > box.top + box.height / 2 ? 'after' : 'before'
}

function ProductionSegmentCardEditor({
  segment,
  momentCount,
  isSaving,
  isDeleting,
  onCancel,
  onSave,
  onDelete,
}: {
  segment: SemanticEntityRecord
  momentCount: number
  isSaving: boolean
  isDeleting: boolean
  onCancel: () => void
  onSave: (payload: SemanticEntityPayload) => void
  onDelete: () => void
}) {
  const [workspace, setWorkspace] = useState({
    title: '',
    kind: 'emotional_function',
    summary: '',
  })

  useEffect(() => {
    setWorkspace(segmentWorkspaceFromRecord(segment))
  }, [segment])

  const original = segmentWorkspaceFromRecord(segment)
  const changed = Object.keys(workspace).some((key) => workspace[key as keyof typeof workspace].trim() !== original[key as keyof typeof original].trim())

  function resetWorkspace() {
    setWorkspace(original)
    onCancel()
  }

  function saveWorkspace() {
    if (!workspace.title.trim()) return
    onSave({
      title: workspace.title.trim(),
      kind: workspace.kind.trim(),
      summary: workspace.summary.trim(),
    })
  }

  return (
    <ProductionSelectedSegmentSummaryShell>
      <ProductionSelectedSegmentSummaryBody>
        <ProductionSelectedSegmentCopy
          eyebrow="编辑编排段"
          title={original.title || '未命名编排段'}
          description={`${momentCount} 个情节`}
        />
      </ProductionSelectedSegmentSummaryBody>
      <ProductionSelectedSegmentEditStack>
        <ProductionSelectedSegmentField label="标题">
          <ProductionSelectedSegmentInput
            value={workspace.title}
            onChange={(event) => setWorkspace((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="编排段标题"
          />
        </ProductionSelectedSegmentField>
        <ProductionSelectedSegmentFieldGrid>
          <ProductionSelectedSegmentField label="情绪功能">
            <Select value={workspace.kind} onValueChange={(value) => setWorkspace((prev) => ({ ...prev, kind: value }))}>
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
        </ProductionSelectedSegmentFieldGrid>
        <ProductionSelectedSegmentField label="情绪 / 节奏 / 戏剧功能说明">
          <ProductionSelectedSegmentTextarea
            value={workspace.summary}
            onChange={(event) => setWorkspace((prev) => ({ ...prev, summary: event.target.value }))}
            placeholder="说明这一段承担的情绪推进、节奏变化或戏剧功能"
          />
        </ProductionSelectedSegmentField>
      </ProductionSelectedSegmentEditStack>
      <ProductionSelectedSegmentActions>
        <ProductionStructureBadge variant="outline">{momentCount} 个情节</ProductionStructureBadge>
        <ProductionStructureActionButton
          size="sm"
          variant="solid"
          tone="danger"
          loading={isDeleting}
          disabled={isSaving || isDeleting}
          onClick={onDelete}
        >
          <Trash2 size={12} />
          删除
        </ProductionStructureActionButton>
        <ProductionStructureActionButton size="sm" variant="outline" disabled={isSaving || isDeleting} onClick={resetWorkspace}>
          <X size={12} />
          取消
        </ProductionStructureActionButton>
        <ProductionStructureActionButton size="sm" loading={isSaving} disabled={!workspace.title.trim() || !changed || isSaving || isDeleting} onClick={saveWorkspace}>
          <Check size={12} />
          保存
        </ProductionStructureActionButton>
      </ProductionSelectedSegmentActions>
    </ProductionSelectedSegmentSummaryShell>
  )
}

function segmentWorkspaceFromRecord(segment: SemanticEntityRecord | null | undefined) {
  return {
    title: stringField(segment?.title) || stringField(segment?.name) || '',
    kind: stringField(segment?.kind) || 'emotional_function',
    summary: stringField(segment?.summary) || stringField(segment?.content) || '',
  }
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : ''
}
