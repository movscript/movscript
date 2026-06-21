import { toast } from '@/shared/ui/toastStore'
import type { ElectronProjectGitActionInput, ElectronProjectGitActionResult } from '@/shared/contracts/electronApi'
import type { Project } from '@/types'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export type ProjectGitWorkspaceAction = 'commit' | 'pull' | 'push' | 'init' | 'status'

export function projectGitStatusQueryKey(projectDir: string | undefined, projectId?: number | string) {
  return ['project-git-status', projectDir ?? '', projectId ?? 'local'] as const
}

export async function runProjectGitWorkspaceAction(
  action: ProjectGitWorkspaceAction,
  input: ElectronProjectGitActionInput,
): Promise<ElectronProjectGitActionResult | undefined> {
  const api = readElectronApi()
  const apiMethod = action === 'status'
    ? api?.getProjectGitWorkspaceStatus
    : action === 'init'
      ? api?.initProjectGitWorkspace
      : action === 'commit'
        ? api?.commitProjectGitWorkspace
        : action === 'pull'
          ? api?.pullProjectGitWorkspace
          : api?.pushProjectGitWorkspace
  return apiMethod?.(input)
}

export async function initializeProjectGitWorkspace(project: Project, orgId?: number | string | null): Promise<void> {
  const projectDir = project.workspace_path ?? project.project_path
  if (!projectDir) return
  try {
    const result = await runProjectGitWorkspaceAction('push', {
      projectDir,
      projectId: project.ID > 0 ? project.ID : undefined,
      ...(orgId ? { orgId } : {}),
    })
    if (!result) return
    if (!result.ok) {
      toast.error('项目仓库初始化提交失败', result.error || result.stderr)
    }
  } catch (error) {
    toast.error('项目仓库初始化提交失败', error instanceof Error ? error.message : undefined)
  }
}
