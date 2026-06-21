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

import {
  DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION,
} from '@/shared/infrastructure/providerConfigStore'
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
  claudeRuntimeStatus,
  claudeRuntimeStatusLoading,
  onActivateProfile,
  onSelectProfile,
  profile,
}: {
  activeProviderKey: string
  claudeRuntimeStatus?: { installed?: boolean; installedVersion?: string }
  claudeRuntimeStatusLoading: boolean
  onActivateProfile: (profile: AgentProfile) => void
  onSelectProfile: (profile: AgentProfile) => void
  profile: AgentProfile
}) {
  const viewing = profile.routeKey === activeProviderKey
  const claudeRuntimeMissing = isClaudeAgentProfile(profile)
    && !profile.current
    && claudeRuntimeStatus?.installed === false
  const claudeRuntimeActionLabel = claudeRuntimeStatus?.installedVersion ? '更新' : '下载'
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
      <AgentConsoleStatusBadge intent={profile.current ? 'success' : profile.enabled ? 'neutral' : 'warning'} emphasis="soft">
        {profile.current ? '当前启用' : profile.enabled ? '可切换' : '已停用'}
      </AgentConsoleStatusBadge>
      {claudeRuntimeMissing ? (
        <AgentConsoleActionButton
          type="button"
          size="sm"
          variant="outline"
          aria-label={`下载并启用 ${profile.label}`}
          onClick={(event) => {
            event.stopPropagation()
            onActivateProfile(profile)
          }}
        >
          <Download size={14} />
          {claudeRuntimeActionLabel}
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
}: {
  state: ClaudeRuntimeDownloadState | null
  onCancel: () => void
  onDismissError: () => void
}) {
  return (
    <Dialog open={Boolean(state)}>
      <DialogContent
        hideClose={state?.phase === 'installing'}
        className="w-[min(420px,calc(100vw-32px))]"
        onEscapeKeyDown={(event) => {
          if (state?.phase === 'installing') event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (state?.phase === 'installing') event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{state?.phase === 'error' ? 'Claude 运行时下载失败' : '正在下载 Claude 运行时'}</DialogTitle>
          <DialogDescription>
            {state?.phase === 'error'
              ? '请检查网络连接或 npm 配置后重试。当前 Agent 不会被切换。'
              : '正在安装 Claude Agent SDK。请等待下载完成，完成后会自动切换到 Claude Code。'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2">
          {state?.phase === 'error' ? null : <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <p className="truncate type-caption text-foreground">{state?.label ?? 'Claude Code'}</p>
            <p className="type-tiny text-muted-foreground">
              {state ? `${state.packageName}@${state.packageVersion}` : `@anthropic-ai/claude-agent-sdk@${DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION}`}
            </p>
          </div>
        </div>
        <AgentConsoleStack>
          <Progress value={state?.phase === 'error' ? 100 : 45} className={state?.phase === 'installing' ? 'animate-pulse' : undefined} />
          <p className="type-tiny text-muted-foreground">
            {state?.phase === 'error' ? state.message : '正在下载并安装依赖，实际耗时取决于网络速度和 npm 源响应。'}
          </p>
        </AgentConsoleStack>
        {state?.phase === 'installing' ? (
          <div className="flex justify-end">
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onCancel}>
              取消下载
            </AgentConsoleActionButton>
          </div>
        ) : null}
        {state?.phase === 'error' ? (
          <div className="flex justify-end">
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onDismissError}>
              关闭
            </AgentConsoleActionButton>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
