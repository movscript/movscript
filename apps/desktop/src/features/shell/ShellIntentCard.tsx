import { AlertTriangle, Clipboard, Play, Terminal as TerminalIcon } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'

import type { ShellIntent } from '@/features/shell/ShellWorkbenchModel'

export function ShellIntentCard({
  intent,
  onCheckAgain,
  onCopyCommand,
}: {
  intent: ShellIntent
  onCheckAgain?: (intent: ShellIntent) => void
  onCopyCommand?: (intent: ShellIntent) => void
}) {
  const riskLabel = intent.destructive ? '需要确认' : '工作区命令'
  const IntentIcon = intent.destructive ? AlertTriangle : TerminalIcon
  return (
    <div
      className="shell-workbench-panel__intent-card"
      data-risk={intent.destructive ? 'destructive' : 'workspace'}
      data-status={intent.status ?? 'needs_external_shell'}
    >
      <div className="shell-workbench-panel__intent-heading">
        <IntentIcon size={16} />
        <div>
          <div className="shell-workbench-panel__intent-title-row">
            <strong>{intent.title}</strong>
            <span className="shell-workbench-panel__intent-risk">{riskLabel}</span>
          </div>
          {intent.reason ? <span>{intent.reason}</span> : null}
        </div>
      </div>
      <dl className="shell-workbench-panel__intent-fields" aria-label="Shell 命令信息">
        <div>
          <dt>工作目录</dt>
          <dd>{intent.cwd}</dd>
        </div>
        <div>
          <dt>命令</dt>
          <dd><code>{intent.commandText}</code></dd>
        </div>
        {intent.expectedPreviewUrl ? (
          <div>
            <dt>预期预览地址</dt>
            <dd>{intent.expectedPreviewUrl}</dd>
          </div>
        ) : null}
      </dl>
      <div className="shell-workbench-panel__intent-actions">
        <Button type="button" size="sm" variant="outline" className="shell-workbench-panel__intent-action" onClick={() => onCopyCommand?.(intent)}>
          <Clipboard size={14} />
          <span>复制命令</span>
        </Button>
        <Button type="button" size="sm" variant="outline" className="shell-workbench-panel__intent-action" onClick={() => onCheckAgain?.(intent)}>
          <Play size={14} />
          <span>重新检查</span>
        </Button>
      </div>
    </div>
  )
}
