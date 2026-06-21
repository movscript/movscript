import {
  AgentPageShell,
  AgentPageShellHeader,
} from '@/features/agent/components/AgentPageUi'
import { AgentConsoleDocumentBody } from '@/features/agent/components/AgentConsoleUi'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { useAgentsPageController } from '@/features/agent/application/useAgentsPageController'
import {
  AgentsPageBody,
  AgentsPageHeader,
  ClaudeRuntimeDownloadDialog,
} from '@/features/agent/components/AgentsPageParts'

export default function AgentsPage() {
  const controller = useAgentsPageController()

  return (
    <AgentPageShell data-testid="agents-page">
      <AgentPageShellHeader>
        <AgentsPageHeader
          onRefreshConfig={controller.refreshConfig}
          selectedProfile={controller.selectedProfile}
          workspaceConfigLoading={controller.workspaceConfigLoading}
        />
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentConsoleDocumentBody>
        <AgentsPageBody
          activeProfile={controller.activeProfile}
          activeProviderKey={controller.activeProviderKey}
          agentProfiles={controller.agentProfiles}
          hostRuntimeStatus={controller.hostRuntimeStatus}
          hostRuntimeStatusLoading={controller.hostRuntimeStatusLoading}
          claudeRuntimeStatus={controller.claudeRuntimeStatus}
          claudeRuntimeStatusLoading={controller.claudeRuntimeStatusLoading}
          enabledCount={controller.enabledCount}
          onActivateProfile={(profile) => void controller.activateProfile(profile)}
          onSelectProfile={(profile) => void controller.selectAgentProfile(profile)}
          selectedProfile={controller.selectedProfile}
          settingsDefaultProviderId={controller.settingsDefaultProviderId}
          workspaceConfigError={controller.workspaceConfigError}
        />
      </AgentConsoleDocumentBody>
      <ClaudeRuntimeDownloadDialog
        state={controller.hostRuntimeDownload}
        onCancel={controller.cancelHostRuntimeDownload}
        onDismissError={controller.dismissHostRuntimeDownloadError}
        runtimeLabel="app-server"
      />
      <ClaudeRuntimeDownloadDialog
        state={controller.claudeRuntimeDownload}
        onCancel={controller.cancelClaudeRuntimeDownload}
        onDismissError={controller.dismissClaudeRuntimeDownloadError}
        runtimeLabel="Claude"
      />
    </AgentPageShell>
  )
}
