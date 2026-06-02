import { ContentWorkbenchDialogEmptyState, ContentWorkbenchDialogFrame } from '@movscript/ui'

import { SemanticEntityInlineEditor } from '@/shared/ui/SemanticEntityInlineEditor'
import { titleOfRecord } from '@/features/content/domain/contentWorkbenchRecordUtils'
import type { ContentGenerationMomentRow, ContentWorkbenchRecord } from '@/features/content/domain/contentWorkbenchModel'
import type { SemanticEntityPayload, semanticEntityConfig } from '@/shared/infrastructure/api/semanticEntities'
import { CreateContentUnitQuickCard, CreateKeyframeQuickCard } from './ContentUnitQuickCreateCards'

type EntityConfig = ReturnType<typeof semanticEntityConfig>

export function ContentWorkbenchDialogs({
  projectId,
  queryKey,
  selected,
  selectedUnit,
  selectedUnitKeyframes,
  contentUnitConfig,
  assetSlotConfig,
  keyframeConfig,
  creatingUnit,
  unitWorkspaceDefaults,
  editingUnit,
  creatingAssetSlot,
  assetSlotDefaults,
  creatingKeyframe,
  keyframeDefaults,
  onCreatingUnitChange,
  onUnitSaved,
  onEditingUnitChange,
  onAssetSlotCreated,
  onCreatingAssetSlotChange,
  onKeyframeCreated,
  onCreatingKeyframeChange,
}: {
  projectId?: number
  queryKey: readonly unknown[]
  selected: ContentGenerationMomentRow | null
  selectedUnit: ContentWorkbenchRecord | null
  selectedUnitKeyframes: ContentWorkbenchRecord[]
  contentUnitConfig: EntityConfig
  assetSlotConfig: EntityConfig
  keyframeConfig: EntityConfig
  creatingUnit: boolean
  unitWorkspaceDefaults: Partial<SemanticEntityPayload> | null
  editingUnit: boolean
  creatingAssetSlot: boolean
  assetSlotDefaults?: Partial<SemanticEntityPayload>
  creatingKeyframe: boolean
  keyframeDefaults?: Partial<SemanticEntityPayload>
  onCreatingUnitChange: (open: boolean) => void
  onUnitSaved: (record: ContentWorkbenchRecord) => void
  onEditingUnitChange: (open: boolean) => void
  onAssetSlotCreated: () => void
  onCreatingAssetSlotChange: (open: boolean) => void
  onKeyframeCreated: (record: ContentWorkbenchRecord) => void
  onCreatingKeyframeChange: (open: boolean) => void
}) {
  return (
    <>
      <ContentWorkbenchDialogFrame
        open={creatingUnit}
        onOpenChange={onCreatingUnitChange}
        title="添加制作项"
        description={selected ? `将作为候选工作区加入当前情节：${selected.title}` : '请先选择情节再添加制作项。'}
      >
        {selected ? (
          <CreateContentUnitQuickCard
            projectId={projectId}
            contentUnitConfig={contentUnitConfig}
            selected={selected}
            selectedUnit={selectedUnit}
            defaults={{
              kind: 'shot',
              ...unitWorkspaceDefaults,
            }}
            queryKey={queryKey}
            onSaved={onUnitSaved}
            onCancel={() => onCreatingUnitChange(false)}
          />
        ) : (
          <ContentWorkbenchDialogEmptyState>请先在筛选区选择情节。</ContentWorkbenchDialogEmptyState>
        )}
      </ContentWorkbenchDialogFrame>

      <ContentWorkbenchDialogFrame
        open={editingUnit}
        onOpenChange={onEditingUnitChange}
        width="lg"
        title="编辑制作项"
        description={selectedUnit ? `补齐生成目标、提示词和镜头参数：${titleOfRecord(selectedUnit)}` : '请先选择制作项。'}
      >
        {selectedUnit ? (
          <SemanticEntityInlineEditor
            projectId={projectId}
            config={contentUnitConfig}
            record={selectedUnit}
            queryKey={queryKey}
            idScope={`content-workbench-edit-unit-${selectedUnit.ID}`}
            editKey={selectedUnit.ID}
            title="编辑制作项"
            description="保存后会刷新制作项轨道和画面预览。"
            onSaved={onUnitSaved}
          />
        ) : (
          <ContentWorkbenchDialogEmptyState>请先在制作项轨道中选择一个制作项。</ContentWorkbenchDialogEmptyState>
        )}
      </ContentWorkbenchDialogFrame>

      <ContentWorkbenchDialogFrame
        open={creatingAssetSlot}
        onOpenChange={onCreatingAssetSlotChange}
        title="添加素材需求"
        description={selectedUnit ? `将写入当前制作项：${titleOfRecord(selectedUnit)}` : '请先选择制作项再添加素材需求。'}
      >
        {selected && selectedUnit && assetSlotDefaults ? (
          <SemanticEntityInlineEditor
            projectId={projectId}
            config={assetSlotConfig}
            record={null}
            defaults={assetSlotDefaults}
            queryKey={queryKey}
            idScope={`content-workbench-create-asset-slot-${selectedUnit.ID}`}
            title="新建素材需求"
            description="保存后会作为当前制作项的素材缺口出现，可以继续上传候选或绑定资源。"
            onSaved={onAssetSlotCreated}
          />
        ) : (
          <ContentWorkbenchDialogEmptyState>请先在制作项轨道中选择一个制作项；如果当前情节还没有制作项，请先添加制作项。</ContentWorkbenchDialogEmptyState>
        )}
      </ContentWorkbenchDialogFrame>

      <ContentWorkbenchDialogFrame
        open={creatingKeyframe}
        onOpenChange={onCreatingKeyframeChange}
        title="添加关键帧"
        description={selectedUnit ? `将写入当前制作项：${titleOfRecord(selectedUnit)}` : '请先选择制作项再添加关键帧。'}
      >
        {selected && selectedUnit && keyframeDefaults ? (
          <CreateKeyframeQuickCard
            projectId={projectId}
            keyframeConfig={keyframeConfig}
            selectedUnit={selectedUnit}
            defaults={keyframeDefaults}
            existingKeyframes={selectedUnitKeyframes}
            queryKey={queryKey}
            onSaved={onKeyframeCreated}
            onCancel={() => onCreatingKeyframeChange(false)}
          />
        ) : (
          <ContentWorkbenchDialogEmptyState>请先在制作项轨道中选择一个制作项；如果当前情节还没有制作项，请先添加制作项。</ContentWorkbenchDialogEmptyState>
        )}
      </ContentWorkbenchDialogFrame>
    </>
  )
}
