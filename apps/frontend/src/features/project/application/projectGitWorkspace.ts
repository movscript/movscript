import { toast } from '@/shared/ui/toastStore'
import type { Project } from '@/types'

export async function initializeProjectGitWorkspace(project: Project, orgId?: number | string | null): Promise<void> {
  const apiMethod = window.api?.pushProjectGitWorkspace
  if (!apiMethod) return
  try {
    const result = await apiMethod({
      projectId: project.ID,
      ...(orgId ? { orgId } : {}),
    })
    if (!result.ok) {
      toast.error('项目仓库初始化提交失败', result.error || result.stderr)
    }
  } catch (error) {
    toast.error('项目仓库初始化提交失败', error instanceof Error ? error.message : undefined)
  }
}
