import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@movscript/ui'

import { SemanticEntityInlineEditor } from '@/components/shared/SemanticEntityInlineEditor'
import { titleOfRecord } from '@/lib/contentWorkbenchRecordUtils'
import type { ContentGenerationMomentRow, ContentWorkbenchRecord } from '@/lib/contentWorkbenchModel'
import type { SemanticEntityPayload, semanticEntityConfig } from '@/api/semanticEntities'
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
  unitDraftDefaults,
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
  unitDraftDefaults: Partial<SemanticEntityPayload> | null
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
      <Dialog open={creatingUnit} onOpenChange={onCreatingUnitChange}>
        <DialogContent className="max-h-[88vh] w-[min(760px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>添加制作项</DialogTitle>
            <DialogDescription>
              {selected ? `将作为候选草稿加入当前情节：${selected.title}` : '请先选择情节再添加制作项。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {selected ? (
              <CreateContentUnitQuickCard
                projectId={projectId}
                contentUnitConfig={contentUnitConfig}
                selected={selected}
                selectedUnit={selectedUnit}
                defaults={{
                  kind: 'shot',
                  ...unitDraftDefaults,
                }}
                queryKey={queryKey}
                onSaved={onUnitSaved}
                onCancel={() => onCreatingUnitChange(false)}
              />
            ) : (
              <DialogEmptyState text="请先在筛选区选择情节。" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingUnit} onOpenChange={onEditingUnitChange}>
        <DialogContent className="max-h-[88vh] w-[min(820px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>编辑制作项</DialogTitle>
            <DialogDescription>
              {selectedUnit ? `补齐生成目标、提示词和镜头参数：${titleOfRecord(selectedUnit)}` : '请先选择制作项。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
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
              <DialogEmptyState text="请先在制作项轨道中选择一个制作项。" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={creatingAssetSlot} onOpenChange={onCreatingAssetSlotChange}>
        <DialogContent className="max-h-[88vh] w-[min(760px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>添加素材需求</DialogTitle>
            <DialogDescription>
              {selectedUnit ? `将写入当前制作项：${titleOfRecord(selectedUnit)}` : '请先选择制作项再添加素材需求。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
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
              <DialogEmptyState text="请先在制作项轨道中选择一个制作项；如果当前情节还没有制作项，请先添加制作项。" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={creatingKeyframe} onOpenChange={onCreatingKeyframeChange}>
        <DialogContent className="max-h-[88vh] w-[min(760px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>添加关键帧</DialogTitle>
            <DialogDescription>
              {selectedUnit ? `将写入当前制作项：${titleOfRecord(selectedUnit)}` : '请先选择制作项再添加关键帧。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
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
              <DialogEmptyState text="请先在制作项轨道中选择一个制作项；如果当前情节还没有制作项，请先添加制作项。" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DialogEmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-8 text-center type-body text-muted-foreground">
      {text}
    </p>
  )
}
