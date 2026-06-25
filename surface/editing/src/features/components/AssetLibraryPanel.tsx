import { useState, type ComponentProps, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PanelResizeHandle } from '@movscript/ui/layout'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@movscript/ui/primitives'

import type { ElectronMediaPipelineAssetDescriptor, ElectronMediaPipelineEditingProject } from '@movscript/editing-surface/contracts'

import { trackIdForAssetType } from '../domain/tracks'
import type { ClipForm } from '../domain/types'
import { AssetLibraryPreview } from './AssetLibraryPreview'
import './AssetLibraryPanel.css'

type AssetLibraryFilter = 'all' | 'video' | 'audio' | 'image'

const ASSET_LIBRARY_FILTERS: Array<{ value: AssetLibraryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'image', label: '图片' },
]

type AssetLibraryPanelProps = {
  activeProject: ElectronMediaPipelineEditingProject | null
  canOpenFile: boolean
  resizeHandleProps: ComponentProps<typeof PanelResizeHandle>
  onAddLocalAsset: () => void
  onAssetDragStart: (event: DragEvent<HTMLElement>, asset: ElectronMediaPipelineAssetDescriptor) => void
  onClipFormChange: (update: (current: ClipForm) => ClipForm) => void
  onExtractAudio: (asset: ElectronMediaPipelineAssetDescriptor) => void
  onPreviewAsset: (assetId: string) => void
  onRemoveAsset: (assetId: string) => void
  onRevealAssetInFolder: (asset: ElectronMediaPipelineAssetDescriptor) => void
}

export function AssetLibraryPanel({
  activeProject,
  canOpenFile,
  resizeHandleProps,
  onAddLocalAsset,
  onAssetDragStart,
  onClipFormChange,
  onExtractAudio,
  onPreviewAsset,
  onRemoveAsset,
  onRevealAssetInFolder,
}: AssetLibraryPanelProps) {
  const [contextMenuAssetId, setContextMenuAssetId] = useState<string | null>(null)
  const [assetFilter, setAssetFilter] = useState<AssetLibraryFilter>('all')
  const assets = activeProject?.assets.assets ?? []
  const visibleAssets = assetFilter === 'all' ? assets : assets.filter((asset) => asset.assetType === assetFilter)

  function handleAssetContextMenu(event: ReactMouseEvent<HTMLElement>, asset: ElectronMediaPipelineAssetDescriptor) {
    if (asset.assetType !== 'video' && !asset.localPath) return
    event.preventDefault()
    setContextMenuAssetId(asset.id)
  }

  return (
    <aside className="editing-workspace-library" aria-label="素材资源库">
      <PanelResizeHandle
        className="editing-workspace-resize-handle editing-workspace-resize-handle--library"
        side="right"
        {...resizeHandleProps}
      />
      <div className="editing-workspace-panel-header editing-workspace-library-header">
        <Tabs value={assetFilter} onValueChange={(value) => setAssetFilter(value as AssetLibraryFilter)} className="editing-workspace-library-tabs">
          <TabsList className="editing-workspace-library-tab-list">
            {ASSET_LIBRARY_FILTERS.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value}>{filter.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button type="button" size="sm" variant="outline" className="editing-workspace-library-import-button" disabled={!activeProject || !canOpenFile} onClick={onAddLocalAsset}>
          <Plus size={13} />
          导入
        </Button>
      </div>
      <div className="editing-workspace-asset-list">
        {visibleAssets.length === 0 ? (
          <div className="editing-workspace-empty">{assets.length === 0 ? '暂无素材' : '当前分类无素材'}</div>
        ) : visibleAssets.map((asset) => (
          <div
            key={asset.id}
            className="editing-workspace-asset"
            draggable
            onContextMenu={(event) => handleAssetContextMenu(event, asset)}
            onDragStart={(event) => onAssetDragStart(event, asset)}
          >
            <button
              type="button"
              className="editing-workspace-asset-main"
              onClick={() => {
                onClipFormChange((current) => ({ ...current, assetId: asset.id, trackId: trackIdForAssetType(asset.assetType) }))
                onPreviewAsset(asset.id)
              }}
              onDoubleClick={() => onPreviewAsset(asset.id)}
            >
              <AssetLibraryPreview asset={asset} />
              <span className="editing-workspace-asset-name">{asset.label ?? asset.id}</span>
            </button>
            <div className="editing-workspace-asset-actions">
              <Button type="button" variant="ghost" size="icon-xs" intent="danger" onClick={() => onRemoveAsset(asset.id)} aria-label={`移除 ${asset.label ?? asset.id}`}>
                <Trash2 size={13} />
              </Button>
            </div>
            {asset.assetType === 'video' || asset.localPath ? (
              <DropdownMenu
                open={contextMenuAssetId === asset.id}
                onOpenChange={(open) => setContextMenuAssetId(open ? asset.id : null)}
              >
                <DropdownMenuTrigger asChild>
                  <button type="button" tabIndex={-1} className="editing-workspace-asset-context-trigger" aria-label={`${asset.label ?? asset.id} 操作菜单`} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="editing-workspace-asset-context-menu">
                  {asset.localPath ? (
                    <DropdownMenuItem onSelect={() => onRevealAssetInFolder(asset)}>
                      打开文件所在位置
                    </DropdownMenuItem>
                  ) : null}
                  {asset.assetType === 'video' ? (
                    <DropdownMenuItem onSelect={() => onExtractAudio(asset)}>
                      添加音频素材
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  )
}
