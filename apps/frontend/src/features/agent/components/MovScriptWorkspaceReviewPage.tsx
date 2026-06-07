import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ClipboardCheck, Loader2, RefreshCw } from 'lucide-react'
import {
  AgentPageShell,
  AgentPageShellBody,
  AgentPageShellHeader,
  Button,
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
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <ClipboardCheck size={18} />
                Workspace Review
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {reviewPath || '等待 workspace_submit 提交工作区修改'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {openBusinessReviewPath && (
                <Link to={openBusinessReviewPath}>
                  <Button type="button" size="sm">
                    <ArrowRight size={14} />
                    打开业务审阅
                  </Button>
                </Link>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => {
                if (reviewPath) void reviewQuery.refetch()
              }} disabled={!reviewPath || activeFetching}>
                <RefreshCw size={14} />
                刷新
              </Button>
            </div>
          </div>
          <AgentConsoleNav compact />
        </div>
      </AgentPageShellHeader>
      <AgentPageShellBody>
        {!reviewPath ? (
          <StateRow text="等待审阅记录" />
        ) : activeLoading ? (
          <StateRow icon={<Loader2 size={14} className="animate-spin" />} text="读取工作区修改" />
        ) : activeError ? (
          <StateRow text={errorMessage(activeError)} tone="danger" />
        ) : parsedRecord.error ? (
          <StateRow text={parsedRecord.error} tone="danger" />
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
            <section className="flex min-h-[420px] flex-col gap-3 overflow-auto rounded-md border border-border bg-card p-4">
              <ReviewSummaryRow label="状态" value={stringValue(record?.status) ?? 'submitted'} />
              <ReviewSummaryRow label="类型" value={stringValue(record?.workspaceKind) ?? stringValue(recordHandoff?.workspaceKind) ?? '-'} />
              <ReviewSummaryRow label="创建时间" value={stringValue(record?.createdAt) ?? '-'} />
              <ReviewJSONBlock title="Target" value={target} />
              <ReviewJSONBlock title="Validation" value={validation} />
              <div>
                <div className="mb-2 text-sm font-medium text-foreground">Effects</div>
                {effects.length === 0 ? (
                  <div className="rounded border border-border bg-background p-3 text-sm text-muted-foreground">无记录</div>
                ) : (
                  <div className="space-y-2">
                    {effects.map((effect, index) => (
                      <pre key={index} className="overflow-auto rounded border border-border bg-background p-3 text-xs leading-5 text-foreground">
                        {JSON.stringify(effect, null, 2)}
                      </pre>
                    ))}
                  </div>
                )}
              </div>
            </section>
            <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card">
              <div className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
                原始修改记录
              </div>
              <textarea
                className="min-h-0 flex-1 resize-none bg-background p-3 font-mono text-xs leading-5 text-foreground outline-none"
                value={activeFile?.content ?? ''}
                readOnly
                spellCheck={false}
              />
            </section>
          </div>
        )}
      </AgentPageShellBody>
    </AgentPageShell>
  )
}

function ReviewSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-foreground">{value}</div>
    </div>
  )
}

function ReviewJSONBlock({ title, value }: { title: string; value?: Record<string, unknown> }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-foreground">{title}</div>
      <pre className="max-h-64 overflow-auto rounded border border-border bg-background p-3 text-xs leading-5 text-foreground">
        {value ? JSON.stringify(value, null, 2) : '无记录'}
      </pre>
    </div>
  )
}

function StateRow({ icon, text, tone = 'muted' }: { icon?: ReactNode; text: string; tone?: 'muted' | 'danger' }) {
  return (
    <div className={`flex min-h-32 items-center justify-center gap-2 text-sm ${tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'}`}>
      {icon}
      <span>{text}</span>
    </div>
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
