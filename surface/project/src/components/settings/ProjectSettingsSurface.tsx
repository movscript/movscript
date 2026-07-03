import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  PROJECT_SURFACE_ROUTE_DEFINITIONS,
} from '../../domain/index.js'
import {
  useProjectSurfaceRuntime,
  type ProjectSurfaceDataSpaceSummary,
  type ProjectSurfaceGitAction,
} from '../../runtime/index.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from '../AgentSurfaceShell.js'

function capabilityStatus(value: boolean): string {
  return value ? 'enabled' : 'unavailable'
}

function gatewayStatus(value: unknown): string {
  return typeof value === 'function' ? 'available' : 'not wired'
}

export function ProjectSettingsSurface() {
  const runtime = useProjectSurfaceRuntime()
  const project = runtime.project
  const endpoints = runtime.diagnostics.endpoints ?? {}
  const capabilities = runtime.capabilities
  const projectGateway = runtime.gateways.project
  const [remoteURL, setRemoteURL] = useState('')
  const [remoteTouched, setRemoteTouched] = useState(false)
  const gitStatusQuery = useQuery({
    queryKey: ['project-surface', 'settings', 'git-status', project.projectId, project.projectDir ?? ''],
    queryFn: () => {
      if (!projectGateway.gitStatus) throw new Error('Project git status gateway is not wired.')
      return projectGateway.gitStatus({
        projectId: project.projectId,
        projectDir: project.projectDir,
        projectUid: project.projectUid,
      })
    },
    enabled: Boolean(projectGateway.gitStatus && project.projectDir),
  })
  const workspaceMetadataQuery = useQuery({
    queryKey: ['project-surface', 'settings', 'workspace-metadata', project.projectId],
    queryFn: () => projectGateway.readWorkspaceMetadata?.({
      projectId: project.projectId,
      projectDir: project.projectDir,
      projectUid: project.projectUid,
    }),
    enabled: Boolean(projectGateway.readWorkspaceMetadata),
  })
  const dataSpacesQuery = useQuery({
    queryKey: ['project-surface', 'settings', 'data-spaces', project.projectId, project.projectUid ?? ''],
    queryFn: () => {
      if (!projectGateway.listDataSpaces) throw new Error('Project data-space gateway is not wired.')
      return projectGateway.listDataSpaces({
        projectId: project.projectId,
        projectDir: project.projectDir,
        projectUid: project.projectUid,
      })
    },
    enabled: Boolean(projectGateway.listDataSpaces),
  })
  const gitActionMutation = useMutation({
    mutationFn: async (input: { action: ProjectSurfaceGitAction; remoteURL?: string }) => {
      if (!projectGateway.gitAction) throw new Error('Project git action gateway is not wired.')
      return projectGateway.gitAction({
        action: input.action,
        projectId: project.projectId,
        projectDir: project.projectDir,
        projectUid: project.projectUid,
        ...(input.remoteURL ? { remoteURL: input.remoteURL } : {}),
      })
    },
    onSuccess: async (result, input) => {
      if (result.ok === false) {
        runtime.notifier.error(gitActionFailureLabel(input.action), result.error ?? result.stderr)
        return
      }
      runtime.notifier.success(gitActionSuccessLabel(input.action), result.path)
      await gitStatusQuery.refetch()
    },
    onError: (error, input) => {
      runtime.notifier.error(gitActionFailureLabel(input.action), error instanceof Error ? error.message : String(error))
    },
  })
  const gitStatus = gitStatusQuery.data
  const workspaceMetadata = workspaceMetadataQuery.data
  const backendGitRemoteURL = normalizeRemoteURL(workspaceMetadata?.gitRemoteUrl)
  const dataSpace = useMemo(() => {
    const items = dataSpacesQuery.data?.items ?? []
    return resolveCurrentDataSpace(items, project.projectUid)
  }, [dataSpacesQuery.data?.items, project.projectUid])

  useEffect(() => {
    if (remoteTouched) return
    if (gitStatus?.remoteURL) {
      setRemoteURL(gitStatus.remoteURL)
      return
    }
    if (backendGitRemoteURL) setRemoteURL(backendGitRemoteURL)
  }, [backendGitRemoteURL, gitStatus?.remoteURL, remoteTouched])

  const gitTone = gitStatus?.hasGit ? gitStatus.isDirty ? 'Dirty' : 'Clean' : 'Not initialized'
  const dataSpaceStatus = dataSpace ? dataSpace.status ?? 'Linked' : project.projectUid ? 'Empty' : 'Missing UID'

  return (
    <AgentSurfaceShell
      title="Settings"
      description="Project runtime, gateway links, and local capability status."
      ready={Boolean(project.projectId)}
      chips={[
        `project: ${project.projectId}`,
        `location: ${project.location ?? 'unknown'}`,
      ]}
    >
      <div className="agent-surface-grid">
        <AgentSurfacePanel title="Project">
          <AgentSurfaceKeyValues items={[
            ['Project ID', project.projectId],
            ['Project UID', project.projectUid ?? 'not configured'],
            ['Project Dir', project.projectDir ?? 'not configured'],
            ['Title', project.title ?? project.projectId],
            ['Data Space', dataSpaceStatus],
          ]} />
        </AgentSurfacePanel>
        <AgentSurfacePanel title="Git Repository">
          <AgentSurfaceKeyValues items={[
            ['Status', gitStatusQuery.isLoading ? 'loading' : gitTone],
            ['Branch', gitStatus?.branch ?? 'not configured'],
            ['Changed files', String(gitStatus?.changedFiles ?? 0)],
            ['Remote', gitStatus?.remoteName ?? 'not configured'],
            ['Remote URL', gitStatus?.remoteURL ?? backendGitRemoteURL ?? 'not configured'],
          ]} />
          <div className="agent-surface-form-row">
            <input
              className="agent-surface-input"
              value={remoteURL}
              placeholder={backendGitRemoteURL ?? 'https://example.com/owner/repo.git'}
              onChange={(event) => {
                setRemoteTouched(true)
                setRemoteURL(event.target.value)
              }}
              aria-label="Git remote URL"
            />
            <button
              type="button"
              className="agent-surface-button"
              disabled={!project.projectDir || !projectGateway.gitAction || gitActionMutation.isPending || !remoteURL.trim()}
              onClick={() => gitActionMutation.mutate({ action: 'init', remoteURL: remoteURL.trim() })}
            >
              Save Remote
            </button>
          </div>
          <div className="surface-host-route-list">
            {(['init', 'commit', 'pull', 'push'] as const).map((action) => (
              <button
                key={action}
                type="button"
                className="agent-surface-button"
                disabled={!project.projectDir || !projectGateway.gitAction || gitActionMutation.isPending}
                onClick={() => gitActionMutation.mutate({
                  action,
                  ...(action === 'init' && remoteURL.trim() ? { remoteURL: remoteURL.trim() } : {}),
                })}
              >
                {gitActionLabel(action)}
              </button>
            ))}
          </div>
          {gitStatusQuery.error ? (
            <div className="agent-surface-status">{errorMessage(gitStatusQuery.error)}</div>
          ) : null}
        </AgentSurfacePanel>
        <AgentSurfacePanel title="Project Data Space">
          <AgentSurfaceKeyValues items={[
            ['Status', dataSpacesQuery.isLoading ? 'loading' : dataSpaceStatus],
            ['Scope', dataSpace?.scope_kind && dataSpace.scope_id ? `${dataSpace.scope_kind}:${dataSpace.scope_id}` : dataSpacesQuery.data?.scopeKind ? `${dataSpacesQuery.data.scopeKind}:${dataSpacesQuery.data.scopeId ?? 'unknown'}` : 'not configured'],
            ['Targets', String(dataSpace?.decision_count ?? 0)],
            ['Candidates', String(dataSpace?.candidate_count ?? 0)],
            ['Selections', String(dataSpace?.selection_count ?? 0)],
            ['Updated', dataSpace?.last_decision_at ?? dataSpace?.updated_at ?? 'not available'],
          ]} />
          {dataSpace ? (
            <AgentSurfaceJson value={dataSpace} />
          ) : (
            <div className="agent-surface-status">
              {project.projectUid ? 'No project data space has been reported for this project UID yet.' : 'Project UID is required before project data can be linked.'}
            </div>
          )}
        </AgentSurfacePanel>
        <AgentSurfacePanel title="Runtime Links">
          <AgentSurfaceKeyValues items={[
            ['Daemon Gateway', endpoints.gateway ?? 'not configured'],
            ['Editing', endpoints.editing ?? 'not configured'],
            ['Media Pipeline', endpoints.mediaPipeline ?? 'not configured'],
            ['Agent Gateway', endpoints.mcpApi ?? 'not configured'],
          ]} />
        </AgentSurfacePanel>
        <AgentSurfacePanel title="Project Gateway">
          <AgentSurfaceKeyValues items={[
            ['Read Model', gatewayStatus(projectGateway.readModel)],
            ['Source Snapshot', gatewayStatus(projectGateway.sourceSnapshot ?? projectGateway.readSource)],
            ['Inspect Source', gatewayStatus(projectGateway.inspectSource)],
            ['Overview Source', gatewayStatus(projectGateway.overviewSource)],
            ['Interpret Source', gatewayStatus(projectGateway.interpretSource ?? projectGateway.interpret)],
            ['Regeneration Plan', gatewayStatus(projectGateway.regenerationPlan)],
            ['Project Standards', gatewayStatus(projectGateway.upsertProjectStandards)],
            ['Project Scripts', gatewayStatus(projectGateway.readScriptSource ?? projectGateway.upsertScript)],
            ['Resource View', gatewayStatus(projectGateway.resourceView)],
            ['Git Status', gatewayStatus(projectGateway.gitStatus)],
            ['Git Action', gatewayStatus(projectGateway.gitAction)],
            ['Data Spaces', gatewayStatus(projectGateway.listDataSpaces)],
            ['Workspace Metadata', gatewayStatus(projectGateway.readWorkspaceMetadata)],
          ]} />
        </AgentSurfacePanel>
        <AgentSurfacePanel title="Capabilities">
          <AgentSurfaceKeyValues items={[
            ['Native Window Controls', capabilityStatus(capabilities.nativeWindowControls)],
            ['Local File Picker', capabilityStatus(capabilities.localFilePicker)],
            ['Local Directory Picker', capabilityStatus(capabilities.localDirectoryPicker)],
            ['Local Git', capabilityStatus(capabilities.localGit)],
            ['Resource Upload', capabilityStatus(capabilities.resourceUpload)],
            ['Generation', capabilityStatus(capabilities.generation)],
            ['Editing', capabilityStatus(capabilities.editing)],
            ['Media Pipeline', capabilityStatus(capabilities.mediaPipeline)],
          ]} />
        </AgentSurfacePanel>
        <AgentSurfacePanel title="Routes">
          <div className="surface-host-route-list">
            {PROJECT_SURFACE_ROUTE_DEFINITIONS.map((entry) => (
              <AgentSurfaceLink key={entry.path} href={runtime.navigator.href(entry.key)}>{entry.label}</AgentSurfaceLink>
            ))}
          </div>
        </AgentSurfacePanel>
      </div>
    </AgentSurfaceShell>
  )
}

function resolveCurrentDataSpace(
  items: ProjectSurfaceDataSpaceSummary[],
  projectUid: string | undefined,
): ProjectSurfaceDataSpaceSummary | undefined {
  if (!projectUid) return undefined
  return items.find((item) => item.project_uid === projectUid)
}

function normalizeRemoteURL(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function gitActionLabel(action: ProjectSurfaceGitAction): string {
  if (action === 'init') return 'Init'
  if (action === 'commit') return 'Commit'
  if (action === 'pull') return 'Pull'
  if (action === 'push') return 'Push'
  return 'Status'
}

function gitActionSuccessLabel(action: ProjectSurfaceGitAction): string {
  if (action === 'init') return 'Git repository initialized'
  if (action === 'commit') return 'Project committed'
  if (action === 'pull') return 'Project pulled'
  if (action === 'push') return 'Project pushed'
  return 'Git status refreshed'
}

function gitActionFailureLabel(action: ProjectSurfaceGitAction): string {
  if (action === 'init') return 'Failed to initialize Git'
  if (action === 'commit') return 'Commit failed'
  if (action === 'pull') return 'Pull failed'
  if (action === 'push') return 'Push failed'
  return 'Failed to read Git status'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
