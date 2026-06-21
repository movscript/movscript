import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, Loader2 } from 'lucide-react'
import { AppTopControlButton } from '@movscript/ui/business/app'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { toast } from '@/shared/ui/toastStore'
import type { ElectronProjectGitActionInput } from '@/shared/contracts/electronApi'
import { projectGitStatusQueryKey, runProjectGitWorkspaceAction, type ProjectGitWorkspaceAction } from '@/features/project/application/projectGitWorkspace'

type GitAction = Extract<ProjectGitWorkspaceAction, 'commit' | 'pull' | 'push'>

interface ProjectGitHeaderActionsProps {
  compact?: boolean
}

export function ProjectGitHeaderActions({ compact = false }: ProjectGitHeaderActionsProps) {
  const current = useProjectStore((s) => s.current)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const [runningAction, setRunningAction] = useState<GitAction | null>(null)
  const projectDir = current?.workspace_path ?? current?.project_path
  const gitStatusQuery = useQuery({
    queryKey: projectGitStatusQueryKey(projectDir, current?.ID),
    queryFn: async () => {
      if (!projectDir) return undefined
      return runProjectGitWorkspaceAction('status', {
        projectDir,
        ...(current && current.ID > 0 ? { projectId: current.ID } : {}),
        ...(currentOrgID ? { orgId: currentOrgID } : {}),
      })
    },
    enabled: Boolean(projectDir),
  })

  if (!current || !projectDir || !gitStatusQuery.data?.hasGit) return null

  const density = compact ? 'compact' : 'default'
  const iconSize = compact ? 11 : 16
  const actionLabels: Record<GitAction, { unavailable: string; failure: string; success: string; title: string }> = {
    commit: {
      unavailable: '项目提交不可用',
      failure: '提交失败',
      success: '项目已提交',
      title: '提交项目变更',
    },
    pull: {
      unavailable: '项目下载不可用',
      failure: '下载失败',
      success: '项目已下载',
      title: '下载项目变更',
    },
    push: {
      unavailable: '项目上传不可用',
      failure: '上传失败',
      success: '项目已上传',
      title: '上传项目变更',
    },
  }

  async function runGitAction(action: GitAction) {
    if (!current) return
    if (!projectDir) {
      toast.error('项目仓库不可用', '当前项目没有本地路径')
      return
    }
    const labels = actionLabels[action]
    console.info('[movscript:project-git-header] action start', { action, projectId: current.ID, orgId: currentOrgID })
    const input: ElectronProjectGitActionInput = {
      projectDir,
      ...(current.ID > 0 ? { projectId: current.ID } : {}),
      ...(currentOrgID ? { orgId: currentOrgID } : {}),
    }
    setRunningAction(action)
    try {
      const result = await runProjectGitWorkspaceAction(action, input)
      if (!result) {
        toast.error(labels.unavailable)
        return
      }
      console.info('[movscript:project-git-header] action result', result)
      if (!result.ok) {
        toast.error(labels.failure, result.error || result.stderr)
        return
      }
      toast.success(labels.success, result.path)
      await gitStatusQuery.refetch()
    } catch (error) {
      console.info('[movscript:project-git-header] action error', { action, error })
      toast.error(labels.failure, error instanceof Error ? error.message : undefined)
    } finally {
      setRunningAction(null)
    }
  }

  return (
    <>
      <AppTopControlButton
        variant="ghost"
        density={density}
        onClick={() => void runGitAction('commit')}
        disabled={runningAction !== null}
        title={actionLabels.commit.title}
        aria-label={actionLabels.commit.title}
      >
        {runningAction === 'commit' ? <Loader2 size={iconSize} className="animate-spin" /> : <Check size={iconSize} />}
      </AppTopControlButton>
      <AppTopControlButton
        variant="ghost"
        density={density}
        onClick={() => void runGitAction('pull')}
        disabled={runningAction !== null}
        title={actionLabels.pull.title}
        aria-label={actionLabels.pull.title}
      >
        {runningAction === 'pull' ? <Loader2 size={iconSize} className="animate-spin" /> : <ArrowDown size={iconSize} />}
      </AppTopControlButton>
      <AppTopControlButton
        variant="ghost"
        density={density}
        onClick={() => void runGitAction('push')}
        disabled={runningAction !== null}
        title={actionLabels.push.title}
        aria-label={actionLabels.push.title}
      >
        {runningAction === 'push' ? <Loader2 size={iconSize} className="animate-spin" /> : <ArrowUp size={iconSize} />}
      </AppTopControlButton>
    </>
  )
}
