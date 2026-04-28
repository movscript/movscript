import CreationPage from '@/pages/work/CreationPage'
import { StageWorkspaceContent } from '@/pages/pipeline/StageWorkspacePage'

export type WorkbenchMode = 'free' | 'pipeline-node'

interface WorkbenchContentProps {
  mode: WorkbenchMode
  nodeId?: string | number
  embedded?: boolean
  onBack?: () => void
}

export function WorkbenchContent({
  mode,
  nodeId,
  embedded = false,
  onBack,
}: WorkbenchContentProps) {
  if (mode === 'pipeline-node') {
    return (
      <StageWorkspaceContent
        nodeId={nodeId}
        embedded={embedded}
        onBack={onBack}
      />
    )
  }

  return <CreationPage />
}

interface WorkbenchPageProps {
  mode: WorkbenchMode
}

export default function WorkbenchPage({ mode }: WorkbenchPageProps) {
  return <WorkbenchContent mode={mode} />
}
