import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ClipboardCheck, RefreshCw } from 'lucide-react'
import {
  AgentConsoleActionButton,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleStatusBadge,
  AgentPageShell,
  AgentPageShellHeader,
  AgentWorkspaceReviewEffectsList,
  AgentWorkspaceReviewEmptyBlock,
  AgentWorkspaceReviewJsonBlock,
  AgentWorkspaceReviewJsonBlockTitle,
  AgentWorkspaceReviewJsonPre,
  AgentWorkspaceReviewPaneTitle,
  AgentWorkspaceReviewRawPane,
  AgentWorkspaceReviewSection,
  AgentWorkspaceReviewSectionTitle,
  AgentWorkspaceReviewSummaryPane,
  AgentWorkspaceReviewTextarea,
  AgentWorkspaceSummaryLabel,
  AgentWorkspaceSummaryRow,
  AgentWorkspaceSummaryValue,
  AgentWorkspaceStateRow,
  AgentWorkspaceStateSpinner,
  AgentWorkspacesPageBody,
  AgentWorkspacesPageFullMain,
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import type { ElectronMovScriptWorkspaceFileReadResult } from '@/shared/contracts/electronApi'

export default function MovScriptWorkspaceReviewPage() {
  const [searchParams] = useSearchParams()
  const reviewPath = searchParams.get('path')?.trim() || searchParams.get('reviewPath')?.trim() || ''
  const businessReviewPath = searchParams.get('businessReviewPath')?.trim() || ''
  const reviewQuery = useQuery<ElectronMovScriptWorkspaceFileReadResult>({
    queryKey: ['movscript-workspace-review-file', reviewPath],
    queryFn: () => requireWorkspaceFilesAPI().read({ path: reviewPath }),
    enabled: Boolean(reviewPath),
    retry: false,
  })
  const activeFile = reviewQuery.data
  const activeError = reviewQuery.error
  const activeLoading = reviewQuery.isLoading
  const activeFetching = reviewQuery.isFetching
  const parsedRecord = useMemo(() => parseJSONRecord(activeFile?.content), [activeFile?.content])
  const record = parsedRecord.record
  const recordHandoff = isRecord(record?.handoff) ? record.handoff : undefined
  const recordNavigation = isRecord(recordHandoff?.navigation) ? recordHandoff.navigation : undefined
  const openBusinessReviewPath = businessReviewPath
    || stringValue(recordHandoff?.businessReviewPath)
    || stringValue(recordNavigation?.businessReviewPath)
  const projection = isRecord(record?.projection) ? record.projection : undefined
  const target = isRecord(record?.target) ? record.target : undefined
  const validation = isRecord(record?.validation) ? record.validation : undefined
  const effects = Array.isArray(record?.effects)
    ? record.effects
    : Array.isArray(validation?.effects)
      ? validation.effects
      : []

  return (
    <AgentPageShell data-testid="movscript-workspace-review-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <ClipboardCheck size={18} />
              <AgentConsoleHeaderTitle>Workspace Review</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={activeError || parsedRecord.error ? 'danger' : reviewPath ? 'info' : 'neutral'} emphasis="soft">
                {activeError || parsedRecord.error ? '审阅异常' : reviewPath ? '待审阅' : '等待提交'}
              </AgentConsoleStatusBadge>
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              {reviewPath || '等待 workspace_submit 提交工作区修改'}
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            {openBusinessReviewPath && (
              <AgentConsoleActionButton asChild size="sm">
                <Link to={openBusinessReviewPath}>
                  <ArrowRight size={14} />
                  打开业务审阅
                </Link>
              </AgentConsoleActionButton>
            )}
            <AgentConsoleActionButton type="button" variant="outline" size="sm" onClick={() => {
                if (reviewPath) void reviewQuery.refetch()
              }} disabled={!reviewPath || activeFetching}>
              <RefreshCw size={14} />
              刷新
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentWorkspacesPageBody>
        {!reviewPath ? (
          <AgentWorkspacesPageFullMain>
            <StateRow text="等待审阅记录" />
          </AgentWorkspacesPageFullMain>
        ) : activeLoading ? (
          <AgentWorkspacesPageFullMain>
            <StateRow icon={<AgentWorkspaceStateSpinner />} text="读取工作区修改" />
          </AgentWorkspacesPageFullMain>
        ) : activeError ? (
          <AgentWorkspacesPageFullMain>
            <StateRow text={errorMessage(activeError)} tone="danger" />
          </AgentWorkspacesPageFullMain>
        ) : parsedRecord.error ? (
          <AgentWorkspacesPageFullMain>
            <StateRow text={parsedRecord.error} tone="danger" />
          </AgentWorkspacesPageFullMain>
        ) : (
          <>
            <AgentWorkspaceReviewSummaryPane data-testid="movscript-workspace-review-summary">
              <ReviewSummaryRow label="状态" value={stringValue(record?.status) ?? 'submitted'} />
              <ReviewSummaryRow label="类型" value={stringValue(record?.workspaceKind) ?? stringValue(recordHandoff?.workspaceKind) ?? '-'} />
              <ReviewSummaryRow label="创建时间" value={stringValue(record?.createdAt) ?? '-'} />
              <ReviewJSONBlock title="Target" value={target} />
              <ReviewJSONBlock title="Validation" value={validation} />
              <AgentWorkspaceReviewSection>
                <AgentWorkspaceReviewSectionTitle>Effects</AgentWorkspaceReviewSectionTitle>
                {effects.length === 0 ? (
                  <AgentWorkspaceReviewEmptyBlock>无记录</AgentWorkspaceReviewEmptyBlock>
                ) : (
                  <AgentWorkspaceReviewEffectsList>
                    {effects.map((effect, index) => (
                      <AgentWorkspaceReviewJsonPre key={index}>
                        {JSON.stringify(effect, null, 2)}
                      </AgentWorkspaceReviewJsonPre>
                    ))}
                  </AgentWorkspaceReviewEffectsList>
                )}
              </AgentWorkspaceReviewSection>
            </AgentWorkspaceReviewSummaryPane>
            <AgentWorkspaceReviewRawPane data-testid="movscript-workspace-review-raw">
              <AgentWorkspaceReviewPaneTitle>
                原始修改记录
              </AgentWorkspaceReviewPaneTitle>
              <AgentWorkspaceReviewTextarea
                value={activeFile?.content ?? ''}
                readOnly
                spellCheck={false}
              />
            </AgentWorkspaceReviewRawPane>
          </>
        )}
      </AgentWorkspacesPageBody>
    </AgentPageShell>
  )
}

function ReviewSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <AgentWorkspaceSummaryRow>
      <AgentWorkspaceSummaryLabel>{label}</AgentWorkspaceSummaryLabel>
      <AgentWorkspaceSummaryValue>{value}</AgentWorkspaceSummaryValue>
    </AgentWorkspaceSummaryRow>
  )
}

function ReviewJSONBlock({ title, value }: { title: string; value?: Record<string, unknown> }) {
  return (
    <AgentWorkspaceReviewJsonBlock>
      <AgentWorkspaceReviewJsonBlockTitle>{title}</AgentWorkspaceReviewJsonBlockTitle>
      <AgentWorkspaceReviewJsonPre maxHeight>
        {value ? JSON.stringify(value, null, 2) : '无记录'}
      </AgentWorkspaceReviewJsonPre>
    </AgentWorkspaceReviewJsonBlock>
  )
}

function StateRow({ icon, text, tone = 'muted' }: { icon?: ReactNode; text: string; tone?: 'muted' | 'danger' }) {
  return (
    <AgentWorkspaceStateRow tone={tone}>
      {icon}
      <span>{text}</span>
    </AgentWorkspaceStateRow>
  )
}

function requireWorkspaceFilesAPI() {
  const api = window.api
  if (!api?.readMovScriptWorkspaceFile) {
    throw new Error('当前窗口没有 MovScript Workspace 文件读取能力')
  }
  return {
    read: api.readMovScriptWorkspaceFile,
  }
}

function parseJSONRecord(content?: string): { record?: Record<string, unknown>; error?: string } {
  if (!content) return {}
  try {
    const parsed = JSON.parse(content) as unknown
    if (isRecord(parsed)) return { record: parsed }
    return { error: '工作区修改记录不是 JSON object' }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
