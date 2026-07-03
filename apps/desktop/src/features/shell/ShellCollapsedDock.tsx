import { Terminal as TerminalIcon } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'

export function ShellCollapsedDock({
  disabled,
  onOpen,
  statusLabel,
}: {
  disabled: boolean
  onOpen: () => void
  statusLabel: string
}) {
  return (
    <div className="shell-workbench-dock" data-open="false">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="shell-workbench-dock__toggle"
        onClick={onOpen}
        disabled={disabled}
        title={disabled ? '当前运行环境不支持 MovScript Shell' : '打开 MovScript Shell'}
      >
        <TerminalIcon size={15} />
        <span>MovScript Shell</span>
      </Button>
      <span className="shell-workbench-dock__meta">{statusLabel}</span>
    </div>
  )
}
