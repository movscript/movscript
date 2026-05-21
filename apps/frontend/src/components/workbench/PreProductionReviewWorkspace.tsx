import { ChevronRight, Database, GitBranch, PackageCheck, type LucideIcon } from 'lucide-react'

import { ProjectLayerProposalReviewPanel } from '@/components/proposals/ProjectLayerProposalReviewPanel'
import { WorkbenchKeyValue } from '@/components/workbench/WorkbenchPrimitives'
import type { AgentDraft } from '@/lib/localAgentClient'
import type { AssetSlotRecord, CreativeReferenceRecord } from '@/lib/preProductionAssetRows'
import { Button } from '@movscript/ui'

export function PreProductionReviewWorkspace({
  projectId,
  settingDrafts,
  settingDraftsLoading,
  drafts,
  loading,
  creativeReferences,
  assetSlots,
  onApplied,
  setWorkspaceView,
}: {
  projectId?: number
  settingDrafts: AgentDraft[]
  settingDraftsLoading: boolean
  drafts: AgentDraft[]
  loading: boolean
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  onApplied: () => Promise<void>
  setWorkspaceView: (view: 'main' | 'review') => void
}) {
  return (
    <div className="h-full min-h-[720px] overflow-y-auto bg-background p-4">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 type-label text-muted-foreground">
            <GitBranch size={14} />
            <span>前期准备</span>
            <ChevronRight size={13} />
            <span>提案审阅</span>
          </div>
          <h1 className="type-body-lg font-semibold text-foreground">前期准备审阅</h1>
          <p className="mt-1 max-w-3xl type-label leading-5 text-muted-foreground">
            这里审阅素材需求和设定归属；候选图 prompt、模型参数和真实图片生成从具体素材进入。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setWorkspaceView('main')}>
          <Database size={14} />
          返回工作区
        </Button>
      </header>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <ProjectLayerProposalReviewPanel
            projectId={projectId}
            kind="setting_proposal"
            title="设定提案"
            description="只确认人物、地点、道具、产品、风格和世界规则；素材需求不在此提案内写入。"
            emptyMessage="暂无待审阅设定提案。"
            drafts={settingDrafts}
            loading={settingDraftsLoading}
            data={{ creativeReferences, assetSlots }}
            onApplied={onApplied}
          />
          <ProjectLayerProposalReviewPanel
            projectId={projectId}
            kind="asset_proposal"
            title="素材需求提案"
            description="只确认需要什么素材、属于哪个设定、用途、优先级、复用边界和状态。"
            emptyMessage="暂无待审阅素材需求提案。"
            drafts={drafts}
            loading={loading}
            data={{ creativeReferences, assetSlots }}
            onApplied={onApplied}
          />
        </div>
        <div className="min-w-0 space-y-3">
          <AssetInfoPanel title="审阅边界" icon={GitBranch}>
            <AssetInfoRow label="设定资料" value="人物、地点、道具、风格等前期核心" />
            <AssetInfoRow label="素材需求" value="围绕设定形成素材包" />
            <AssetInfoRow label="候选图片" value="进入具体素材后生成" />
          </AssetInfoPanel>
          <AssetInfoPanel title="当前规模" icon={PackageCheck}>
            <AssetInfoRow label="设定资料" value={`${creativeReferences.length}`} />
            <AssetInfoRow label="素材需求" value={`${assetSlots.length}`} />
          </AssetInfoPanel>
        </div>
      </div>
    </div>
  )
}

function AssetInfoPanel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Icon size={14} className="text-muted-foreground" />
        <p className="type-body font-semibold text-foreground">{title}</p>
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  )
}

function AssetInfoRow({ label, value }: { label: string; value: string }) {
  return <WorkbenchKeyValue label={label} value={value} />
}
