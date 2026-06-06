import { ChevronRight, Database, GitBranch, PackageCheck, type LucideIcon } from 'lucide-react'

import { PreProductionWorkspaceReviewPanel } from '@/features/pre-production/components/workspaces/PreProductionWorkspaceReviewPanel'
import {
  ResourcePrepReviewBackButton,
  ResourcePrepReviewBreadcrumb,
  ResourcePrepReviewBreadcrumbText,
  ResourcePrepReviewGrid,
  ResourcePrepReviewHeader,
  ResourcePrepReviewInfoPanel,
  ResourcePrepReviewMain,
  ResourcePrepReviewSidebar,
  ResourcePrepReviewWorkspaceRoot,
  WorkbenchKeyValue,
} from '@movscript/ui'
import type { WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'
import type { AssetSlotRecord, SettingRecord } from '@/features/pre-production/domain/preProductionAssetRows'

export function PreProductionReviewWorkspace({
  projectId,
  settingWorkspaceArtifacts,
  settingWorkspaceArtifactsLoading,
  assetWorkspaceArtifacts,
  assetWorkspaceArtifactsLoading,
  settings,
  assetSlots,
  onApplied,
  setWorkspaceView,
}: {
  projectId?: number
  settingWorkspaceArtifacts: WorkspaceArtifact[]
  settingWorkspaceArtifactsLoading: boolean
  assetWorkspaceArtifacts: WorkspaceArtifact[]
  assetWorkspaceArtifactsLoading: boolean
  settings: SettingRecord[]
  assetSlots: AssetSlotRecord[]
  onApplied: () => Promise<void>
  setWorkspaceView: (view: 'main' | 'review') => void
}) {
  return (
    <ResourcePrepReviewWorkspaceRoot>
      <ResourcePrepReviewHeader
        eyebrow={(
          <ResourcePrepReviewBreadcrumb>
            <GitBranch size={14} />
            <ResourcePrepReviewBreadcrumbText>前期准备</ResourcePrepReviewBreadcrumbText>
            <ChevronRight size={14} />
            <ResourcePrepReviewBreadcrumbText>草案审阅</ResourcePrepReviewBreadcrumbText>
          </ResourcePrepReviewBreadcrumb>
        )}
        title="前期准备审阅"
        description="这里审阅素材需求和设定归属；候选图 prompt、模型参数和真实图片生成从具体素材进入。"
        action={(
          <ResourcePrepReviewBackButton onClick={() => setWorkspaceView('main')}>
            <Database size={14} />
            返回前期准备
          </ResourcePrepReviewBackButton>
        )}
      />
      <ResourcePrepReviewGrid>
        <ResourcePrepReviewMain>
          <PreProductionWorkspaceReviewPanel
            projectId={projectId}
            kind="setting_workspace"
            title="设定草案"
            description="只确认人物、地点、道具、产品、风格和世界规则；素材需求不在此草案内写入。"
            emptyMessage="暂无待审阅设定草案。"
            workspaces={settingWorkspaceArtifacts}
            loading={settingWorkspaceArtifactsLoading}
            data={{ settings, assetSlots }}
            onApplied={onApplied}
          />
          <PreProductionWorkspaceReviewPanel
            projectId={projectId}
            kind="asset_workspace"
            title="素材需求草案"
            description="只确认需要什么素材、属于哪个设定、用途、优先级、复用边界和下一步。"
            emptyMessage="暂无待审阅素材需求草案。"
            workspaces={assetWorkspaceArtifacts}
            loading={assetWorkspaceArtifactsLoading}
            data={{ settings, assetSlots }}
            onApplied={onApplied}
          />
        </ResourcePrepReviewMain>
        <ResourcePrepReviewSidebar>
          <AssetInfoPanel title="审阅边界" icon={GitBranch}>
            <AssetInfoRow label="设定资料" value="人物、地点、道具、风格等前期核心" />
            <AssetInfoRow label="素材需求" value="围绕设定形成素材包" />
            <AssetInfoRow label="候选图片" value="进入具体素材后生成" />
          </AssetInfoPanel>
          <AssetInfoPanel title="当前规模" icon={PackageCheck}>
            <AssetInfoRow label="设定资料" value={`${settings.length}`} />
            <AssetInfoRow label="素材需求" value={`${assetSlots.length}`} />
          </AssetInfoPanel>
        </ResourcePrepReviewSidebar>
      </ResourcePrepReviewGrid>
    </ResourcePrepReviewWorkspaceRoot>
  )
}

function AssetInfoPanel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <ResourcePrepReviewInfoPanel title={title} icon={Icon}>
      {children}
    </ResourcePrepReviewInfoPanel>
  )
}

function AssetInfoRow({ label, value }: { label: string; value: string }) {
  return <WorkbenchKeyValue label={label} value={value} />
}
