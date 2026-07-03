import { AlertTriangle, Clipboard, RefreshCw, SquareTerminal } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'
import type { ProjectSurfaceShellIntent } from '../runtime/index.js'
import './ProjectSurfaceShellIntentCard.css'

export interface ProjectSurfaceShellIntentCardProps {
  intent: ProjectSurfaceShellIntent
  checking: boolean
  copying: boolean
  primaryActionLabel?: string
  checkAgainLabel?: string
  className?: string
  onCheckAgain: () => void
  onCopyCommand: () => void
}

export function ProjectSurfaceShellIntentCard({
  intent,
  checking,
  copying,
  primaryActionLabel,
  checkAgainLabel = '重新检查',
  className,
  onCheckAgain,
  onCopyCommand,
}: ProjectSurfaceShellIntentCardProps) {
  const IntentIcon = intent.destructive ? AlertTriangle : SquareTerminal
  const riskLabel = intent.destructive ? '需要确认' : '工作区命令'
  const rootClassName = ['project-surface-shell-intent-card', className].filter(Boolean).join(' ')
  return (
    <div className={rootClassName} data-risk={intent.destructive ? 'destructive' : 'workspace'}>
      <div className="project-surface-shell-intent-card__heading">
        <IntentIcon size={15} />
        <div>
          <div className="project-surface-shell-intent-card__title-row">
            <strong>{intent.title || '在 Shell 中启动 Remotion Studio'}</strong>
            <span className="project-surface-shell-intent-card__risk">{riskLabel}</span>
          </div>
          {intent.reason ? <span>{intent.reason}</span> : null}
        </div>
      </div>
      <dl className="project-surface-shell-intent-card__fields" aria-label="Shell 命令信息">
        <div>
          <dt>工作目录</dt>
          <dd>{intent.cwd || '未配置'}</dd>
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
      <div className="project-surface-shell-intent-card__actions">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={copying}
          onClick={onCopyCommand}
        >
          <Clipboard size={14} />
          <span>{primaryActionLabel ?? '复制命令'}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={checking}
          onClick={onCheckAgain}
        >
          <RefreshCw size={14} />
          <span>{checkAgainLabel}</span>
        </Button>
      </div>
    </div>
  )
}
