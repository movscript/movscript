import { ArrowLeft, ArrowRight, Bot, Home, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Terminal } from 'lucide-react'
import { AppWindowIconButton } from '@movscript/ui/business/app'
import i18n from '@/i18n'
import { openHomeWindow } from '@/shared/infrastructure/appWindowContext'

export function AppShellTerminalToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <AppWindowIconButton
      type="button"
      className="app-window-terminal-toggle"
      data-active={open ? 'true' : undefined}
      onClick={onToggle}
      title={open ? '收起 Terminal' : '展开 Terminal'}
      aria-label={open ? '收起 Terminal' : '展开 Terminal'}
    >
      <Terminal size={13} />
    </AppWindowIconButton>
  )
}

export function AppShellHomeControl({
  onClick,
  title = '回到首页',
  ariaLabel = title,
}: {
  onClick?: () => void | Promise<void>
  title?: string
  ariaLabel?: string
} = {}) {
  return (
    <AppWindowIconButton
      type="button"
      className="app-window-sidebar-toggle app-window-home-button"
      onClick={() => {
        if (onClick) {
          void onClick()
          return
        }
        void openHomeWindow()
      }}
      title={title}
      aria-label={ariaLabel}
    >
      <Home size={13} />
    </AppWindowIconButton>
  )
}

export function AppShellSettingsExitControl({ active, onExit }: { active: boolean; onExit: () => void }) {
  if (!active) return null
  return (
    <AppWindowIconButton
      type="button"
      className="app-window-sidebar-toggle app-window-business-back"
      onClick={onExit}
      title="退出设置"
      aria-label="退出设置"
    >
      <ArrowLeft size={14} />
    </AppWindowIconButton>
  )
}

export function AppShellHistoryNavigationControls({ navClassName }: { navClassName: string }) {
  return (
    <>
      <AppWindowIconButton
        type="button"
        className={`app-window-sidebar-toggle ${navClassName}`}
        onClick={() => window.history.back()}
        title="后退"
        aria-label="后退"
      >
        <ArrowLeft size={14} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        className={`app-window-sidebar-toggle ${navClassName}`}
        onClick={() => window.history.forward()}
        title="前进"
        aria-label="前进"
      >
        <ArrowRight size={14} />
      </AppWindowIconButton>
    </>
  )
}

export function AppShellLeftPaneToggle({
  hidden,
  onShow,
  onHide,
}: {
  hidden: boolean
  onShow: () => void
  onHide: () => void
}) {
  return (
    <AppWindowIconButton
      type="button"
      className="app-window-sidebar-toggle"
      onClick={hidden ? onShow : onHide}
      title={hidden ? '显示左侧栏' : '隐藏左侧栏'}
      aria-label={hidden ? '显示左侧栏' : '隐藏左侧栏'}
    >
      {hidden ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
    </AppWindowIconButton>
  )
}

export function AppShellAgentContentToggle({
  closed,
  onShow,
  onCollapse,
}: {
  closed: boolean
  onShow: () => void
  onCollapse: () => void
}) {
  return (
    <AppWindowIconButton
      type="button"
      className="app-window-agent-content-toggle"
      data-active={!closed ? 'true' : undefined}
      onClick={closed ? onShow : onCollapse}
      title={closed ? i18n.t('agents.chat.expandAgentContentPanel') : i18n.t('agents.chat.collapseAgentContentPanel')}
      aria-label={closed ? i18n.t('agents.chat.expandAgentContentPanel') : i18n.t('agents.chat.collapseAgentContentPanel')}
    >
      {closed ? <PanelRightOpen size={13} /> : <PanelRightClose size={13} />}
    </AppWindowIconButton>
  )
}

export function AppShellProjectAgentToggle({
  closed,
  onShow,
  onCollapse,
}: {
  closed: boolean
  onShow: () => void
  onCollapse: () => void
}) {
  return (
    <AppWindowIconButton
      type="button"
      className="app-window-agent-content-toggle"
      data-active={!closed ? 'true' : undefined}
      onClick={closed ? onShow : onCollapse}
      title={closed ? i18n.t('agents.chat.expandProjectAgentPanel') : i18n.t('agents.chat.collapseProjectAgentPanel')}
      aria-label={closed ? i18n.t('agents.chat.expandProjectAgentPanel') : i18n.t('agents.chat.collapseProjectAgentPanel')}
    >
      {closed ? <Bot size={13} /> : <PanelRightClose size={13} />}
    </AppWindowIconButton>
  )
}
