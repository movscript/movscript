import {
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Progress,
} from '@movscript/ui/primitives'

import type { ClaudeRuntimeDownloadState } from '@/features/agent/application/useAgentsPageController'
import type { AgentProfile } from '@/features/agent/application/agentProfileModel'
import { isClaudeAgentProfile } from '@/features/agent/application/agentProfileModel'
import {
  AgentConsoleActionButton,
  AgentConsoleAgentList,
  AgentConsoleAgentListRow,
  AgentConsoleAgentSwitch,
  AgentConsoleCallout,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleInlineError,
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
} from '@/features/agent/components/AgentConsoleUi'
import { IdentityBadge, IdentityMark } from '@/features/agent/components/AgentIdentityUi'

interface AgentsPageHeaderProps {
  onRefreshConfig: () => void
  selectedProfile?: AgentProfile
  workspaceConfigLoading: boolean
}

interface AgentsPageBodyProps {
  activeProfile?: AgentProfile
  activeProviderKey: string
  agentProfiles: AgentProfile[]
  hostRuntimeStatus?: { installed?: boolean; installedVersion?: string }
  hostRuntimeStatusLoading: boolean
  claudeRuntimeStatus?: { installed?: boolean; installedVersion?: string }
  claudeRuntimeStatusLoading: boolean
  enabledCount: number
  onActivateProfile: (profile: AgentProfile) => void
  onSelectProfile: (profile: AgentProfile) => void
  selectedProfile?: AgentProfile
  settingsDefaultProviderId?: string
  workspaceConfigError: string | null
}

export function AgentsPageHeader({
  onRefreshConfig,
  selectedProfile,
  workspaceConfigLoading,
}: AgentsPageHeaderProps) {
  return (
    <AgentConsoleHeader>
      <AgentConsoleHeaderCopy>
        <AgentConsoleHeaderTitleRow>
          <IdentityMark kind="agent" id="mova" />
          <AgentConsoleHeaderTitle>当前 Agent</AgentConsoleHeaderTitle>
          <AgentConsoleStatusBadge intent={selectedProfile ? 'success' : 'warning'} emphasis="soft">
            {selectedProfile?.label ?? '未选择'}
          </AgentConsoleStatusBadge>
          {workspaceConfigLoading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
        </AgentConsoleHeaderTitleRow>
        <AgentConsoleHeaderDescription>
          这里只选择当前助手。运行时统一通过 Runtime Host 接入，模型、账号和权限偏好在 Agent 设置中管理。
        </AgentConsoleHeaderDescription>
      </AgentConsoleHeaderCopy>
      <AgentConsoleHeaderActions>
        <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onRefreshConfig}>
          <RefreshCw size={14} />
          刷新配置
        </AgentConsoleActionButton>
      </AgentConsoleHeaderActions>
    </AgentConsoleHeader>
  )
}

export function AgentsPageBody({
  activeProfile,
  activeProviderKey,
  agentProfiles,
  hostRuntimeStatus,
  hostRuntimeStatusLoading,
  claudeRuntimeStatus,
  claudeRuntimeStatusLoading,
  enabledCount,
  onActivateProfile,
  onSelectProfile,
  selectedProfile,
  settingsDefaultProviderId,
  workspaceConfigError,
}: AgentsPageBodyProps) {
  return (
    <AgentConsoleStack spacing="loose">
      <AgentConsoleAgentList aria-label="Agent 切换列表">
        {agentProfiles.map((profile) => (
          <AgentsPageProfileRow
            key={profile.id}
            activeProviderKey={activeProviderKey}
            hostRuntimeStatus={hostRuntimeStatus}
            hostRuntimeStatusLoading={hostRuntimeStatusLoading}
            claudeRuntimeStatus={claudeRuntimeStatus}
            claudeRuntimeStatusLoading={claudeRuntimeStatusLoading}
            onActivateProfile={onActivateProfile}
            onSelectProfile={onSelectProfile}
            profile={profile}
          />
        ))}
      </AgentConsoleAgentList>

      <AgentConsoleCallout compact tone="neutral">
        同一时间只会有一个 Agent 生效。当前选择：{selectedProfile?.label ?? settingsDefaultProviderId}。已启用 Agent：{enabledCount}。
      </AgentConsoleCallout>

      {workspaceConfigError ? <AgentConsoleInlineError>{workspaceConfigError}</AgentConsoleInlineError> : null}

      {activeProfile ? (
        <AgentConsoleCallout compact tone={activeProfile.enabled ? 'success' : 'warning'}>
          {activeProfile.label}：{activeProfile.detail}
        </AgentConsoleCallout>
      ) : (
        <AgentConsoleCallout compact tone="warning">
          当前没有可用 Agent。请先在 Agent 设置中启用一个 Agent。
        </AgentConsoleCallout>
      )}
    </AgentConsoleStack>
  )
}

function AgentsPageProfileRow({
  activeProviderKey,
  hostRuntimeStatus,
  hostRuntimeStatusLoading,
  claudeRuntimeStatus,
  claudeRuntimeStatusLoading,
  onActivateProfile,
  onSelectProfile,
  profile,
}: {
  activeProviderKey: string
  hostRuntimeStatus?: { installed?: boolean; installedVersion?: string }
  hostRuntimeStatusLoading: boolean
  claudeRuntimeStatus?: { installed?: boolean; installedVersion?: string }
  claudeRuntimeStatusLoading: boolean
  onActivateProfile: (profile: AgentProfile) => void
  onSelectProfile: (profile: AgentProfile) => void
  profile: AgentProfile
}) {
  const viewing = profile.routeKey === activeProviderKey
  const hostRuntimeMissing = profile.connectionKind === 'app-server'
    && hostRuntimeStatus?.installed === false
  const claudeRuntimeMissing = isClaudeAgentProfile(profile)
    && !profile.current
    && claudeRuntimeStatus?.installed === false
  const runtimeMissing = hostRuntimeMissing || claudeRuntimeMissing
  const hostRuntimeActionLabel = hostRuntimeStatus?.installedVersion ? '更新' : '下载'
  const claudeRuntimeActionLabel = claudeRuntimeStatus?.installedVersion ? '更新' : '下载'
  const runtimeActionLabel = hostRuntimeMissing ? hostRuntimeActionLabel : claudeRuntimeActionLabel
  const runtimeStatusLoadingForProfile = (profile.connectionKind === 'app-server' && hostRuntimeStatusLoading)
    || (isClaudeAgentProfile(profile) && !profile.current && claudeRuntimeStatusLoading)
  const claudeRuntimeStatusLoadingForProfile = isClaudeAgentProfile(profile)
    && !profile.current
    && claudeRuntimeStatusLoading

  return (
    <AgentConsoleAgentListRow
      active={viewing}
      onClick={() => onSelectProfile(profile)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelectProfile(profile)
      }}
      aria-label={`选择并配置 ${profile.label}`}
    >
      <span className="agent-console-local-tool-card__copy">
        <span className="agent-console-local-tool-card__title">{profile.label}</span>
        <span className="agent-console-local-tool-card__detail">
          <IdentityBadge kind="agent" id={profile.routeKey} label={profile.routeKey} size="xs" /> {profile.connectionLabel} · 点击选择并配置
        </span>
      </span>
      <AgentConsoleStatusBadge intent={runtimeMissing ? 'warning' : profile.current ? 'success' : profile.enabled ? 'neutral' : 'warning'} emphasis="soft">
        {runtimeMissing ? '需下载' : profile.current ? '当前启用' : profile.enabled ? '可切换' : '已停用'}
      </AgentConsoleStatusBadge>
      {runtimeMissing ? (
        <AgentConsoleActionButton
          type="button"
          size="sm"
          variant="outline"
          aria-label={`下载并启用 ${profile.label}`}
          disabled={runtimeStatusLoadingForProfile}
          onClick={(event) => {
            event.stopPropagation()
            onActivateProfile(profile)
          }}
        >
          <Download size={14} />
          {runtimeActionLabel}
        </AgentConsoleActionButton>
      ) : (
        <AgentConsoleAgentSwitch
          checked={profile.current}
          disabled={!profile.enabled || profile.current || claudeRuntimeStatusLoadingForProfile}
          aria-label={`启用 ${profile.label}`}
          onClick={(event) => {
            event.stopPropagation()
            if (!profile.current) onActivateProfile(profile)
          }}
        />
      )}
      <ChevronRight size={16} aria-hidden="true" />
    </AgentConsoleAgentListRow>
  )
}

export function ClaudeRuntimeDownloadDialog({
  state,
  onCancel,
  onDismissError,
  runtimeLabel = 'Claude',
}: {
  state: ClaudeRuntimeDownloadState | null
  onCancel: () => void
  onDismissError: () => void
  runtimeLabel?: string
}) {
  return (
    <AgentRuntimeOperationsDialog
      items={state ? [{
        id: `${state.packageName}:${state.packageVersion ?? 'latest'}:${runtimeLabel}`,
        state,
        onCancel,
        onDismiss: onDismissError,
      }] : []}
      runtimeLabel={runtimeLabel}
    />
  )
}

export function AgentRuntimeOperationsDialog({
  items,
  runtimeLabel = 'Agent',
}: {
  items: Array<{
    id: string
    state: ClaudeRuntimeDownloadState
    onCancel?: () => void
    onDismiss?: () => void
  }>
  runtimeLabel?: string
}) {
  const installing = items.some((item) => item.state.phase === 'installing')
  const errored = items.some((item) => item.state.phase === 'error')
  const title = errored
    ? `${runtimeLabel} 运行时任务失败`
    : installing
      ? `正在处理 ${runtimeLabel} 运行时`
      : `${runtimeLabel} 运行时任务完成`
  return (
    <Dialog open={items.length > 0}>
      <DialogContent
        hideClose={installing}
        className="w-[min(420px,calc(100vw-32px))]"
        onEscapeKeyDown={(event) => {
          if (installing) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (installing) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {errored
              ? '请检查网络连接或 npm 配置后重试。失败的 Agent 不会被切换。'
              : installing
                ? '正在安装 Agent 运行时。请等待下载完成。'
                : '运行时任务已经完成。'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2">
              {item.state.phase === 'installing' ? <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" /> : null}
              <div className="min-w-0 flex-1">
                <p className="truncate type-caption text-foreground">{item.state.label}</p>
                <p className="type-tiny text-muted-foreground">
                  {item.state.packageVersion ? `${item.state.packageName}@${item.state.packageVersion}` : item.state.packageName}
                </p>
                {item.state.phase !== 'installing' ? (
                  <p className="type-tiny text-muted-foreground">
                    {item.state.phase === 'error' ? item.state.message : item.state.message ?? '已完成'}
                  </p>
                ) : null}
              </div>
              {item.state.phase !== 'installing' && item.onDismiss ? (
                <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={item.onDismiss}>
                  关闭
                </AgentConsoleActionButton>
              ) : null}
            </div>
          ))}
        </div>
        <AgentConsoleStack>
          <Progress value={errored || !installing ? 100 : 45} className={installing ? 'animate-pulse' : undefined} />
          <p className="type-tiny text-muted-foreground">
            {installing ? '正在下载并安装依赖，实际耗时取决于网络速度和 npm 源响应。' : '可以关闭此窗口。'}
          </p>
        </AgentConsoleStack>
        {items.some((item) => item.state.phase === 'installing' && item.onCancel) ? (
          <div className="flex flex-wrap justify-end gap-2">
            {items.filter((item) => item.state.phase === 'installing' && item.onCancel).map((item) => (
              <AgentConsoleActionButton key={item.id} type="button" size="sm" variant="outline" onClick={item.onCancel}>
                取消 {item.state.label}
              </AgentConsoleActionButton>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
