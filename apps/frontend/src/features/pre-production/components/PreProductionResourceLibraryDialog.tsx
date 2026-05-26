import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/shared/ui/ResourceLibraryPicker'
import { assetKindLabel, type AssetSlotViewModel } from '@/features/pre-production/domain/preProductionAssetRows'
import type { RawResource } from '@/types'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ResourcePrepLibraryDialogButton,
  ResourcePrepLibraryDialogContent,
  ResourcePrepLibraryPickerSlot,
} from '@movscript/ui'

export function PreProductionResourceLibraryDialog({
  open,
  row,
  resources,
  selectedResource,
  search,
  type,
  page,
  pageCount,
  total,
  isLoading,
  isSaving,
  onOpenChange,
  onSearch,
  onType,
  onPage,
  onSelect,
  onClear,
  onConfirm,
}: {
  open: boolean
  row: AssetSlotViewModel | null
  resources: RawResource[]
  selectedResource: RawResource | null
  search: string
  type: ResourceTypeFilter
  page: number
  pageCount: number
  total: number
  isLoading: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onSearch: (value: string) => void
  onType: (value: ResourceTypeFilter) => void
  onPage: (value: number) => void
  onSelect: (resource: RawResource) => void
  onClear: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResourcePrepLibraryDialogContent>
        <DialogHeader>
          <DialogTitle>从资源库选择素材</DialogTitle>
          <DialogDescription>
            {row ? `${row.slot.name || `素材需求 #${row.slot.ID}`} · ${assetKindLabel(row.kind)}` : '选择一个资源加入当前素材候选列表。'}
          </DialogDescription>
        </DialogHeader>
        <ResourcePrepLibraryPickerSlot>
          <ResourceLibraryPicker
            resources={resources}
            selectedResource={selectedResource}
            search={search}
            type={type}
            page={page}
            pageCount={pageCount}
            total={total}
            isLoading={isLoading}
            onSearch={onSearch}
            onType={onType}
            onPage={onPage}
            onSelect={onSelect}
            onClear={onClear}
            variant="prep-dialog"
          />
        </ResourcePrepLibraryPickerSlot>
        <DialogFooter>
          <ResourcePrepLibraryDialogButton variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>取消</ResourcePrepLibraryDialogButton>
          <ResourcePrepLibraryDialogButton onClick={onConfirm} disabled={!row || !selectedResource || isSaving} loading={isSaving}>
            加入候选
          </ResourcePrepLibraryDialogButton>
        </DialogFooter>
      </ResourcePrepLibraryDialogContent>
    </Dialog>
  )
}
