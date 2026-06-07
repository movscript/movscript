import { useState } from 'react'
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react'
import { AppTopControlButton } from '@movscript/ui'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { toast } from '@/shared/ui/toastStore'
import type { ElectronProjectGitActionInput } from '@/shared/contracts/electronApi'

type GitAction = 'push' | 'pull'

interface ProjectGitHeaderActionsProps {
  compact?: boolean
}

export function ProjectGitHeaderActions({ compact = false }: ProjectGitHeaderActionsProps) {
  const current = useProjectStore((s) => s.current)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const [runningAction, setRunningAction] = useState<GitAction | null>(null)

  if (!current) return null

  const density = compact ? 'compact' : 'default'
  const iconSize = compact ? 11 : 16

  async function runGitAction(action: GitAction) {
    if (!current) return
    const apiMethod = action === 'push'
      ? window.api?.pushProjectGitWorkspace
      : window.api?.pullProjectGitWorkspace
    console.info('[movscript:project-git-header] action start', { action, projectId: current.ID, orgId: currentOrgID })
    if (!apiMethod) {
      toast.error(action === 'push' ? '项目上传不可用' : '项目下载不可用')
      return
    }
    const input: ElectronProjectGitActionInput = {
      projectId: current.ID,
      ...(currentOrgID ? { orgId: currentOrgID } : {}),
    }
    setRunningAction(action)
    try {
      const result = await apiMethod(input)
      console.info('[movscript:project-git-header] action result', result)
      if (!result.ok) {
        toast.error(action === 'push' ? '上传失败' : '下载失败', result.error || result.stderr)
        return
      }
      toast.success(action === 'push' ? '项目已上传' : '项目已下载', result.path)
    } catch (error) {
      console.info('[movscript:project-git-header] action error', { action, error })
      toast.error(action === 'push' ? '上传失败' : '下载失败', error instanceof Error ? error.message : undefined)
    } finally {
      setRunningAction(null)
    }
  }

  return (
    <>
      <AppTopControlButton
        variant="ghost"
        density={density}
        onClick={() => void runGitAction('pull')}
        disabled={runningAction !== null}
        title="下载项目变更"
        aria-label="下载项目变更"
      >
        {runningAction === 'pull' ? <Loader2 size={iconSize} className="animate-spin" /> : <ArrowDown size={iconSize} />}
      </AppTopControlButton>
      <AppTopControlButton
        variant="ghost"
        density={density}
        onClick={() => void runGitAction('push')}
        disabled={runningAction !== null}
        title="上传项目变更"
        aria-label="上传项目变更"
      >
        {runningAction === 'push' ? <Loader2 size={iconSize} className="animate-spin" /> : <ArrowUp size={iconSize} />}
      </AppTopControlButton>
    </>
  )
}
