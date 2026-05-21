import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/components/shared/ResourceLibraryPicker'
import { assetKindLabel, type AssetSlotViewModel } from '@/lib/preProductionAssetRows'
import type { RawResource } from '@/types'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movscript/ui'

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
      <DialogContent className="flex max-h-[86vh] w-[min(920px,92vw)] max-w-none flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>从资源库选择素材</DialogTitle>
          <DialogDescription>
            {row ? `${row.slot.name || `素材需求 #${row.slot.ID}`} · ${assetKindLabel(row.kind)}` : '选择一个资源加入当前素材候选列表。'}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
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
            className="flex h-[min(620px,64vh)] flex-col bg-background"
            listClassName="max-h-none flex-1"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>取消</Button>
          <Button onClick={onConfirm} disabled={!row || !selectedResource || isSaving} loading={isSaving}>
            加入候选
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
