import CreationPage from '@/pages/work/CreationPage'

export type WorkbenchMode = 'free'

interface WorkbenchContentProps {
  mode: WorkbenchMode
  nodeId?: string | number
  embedded?: boolean
  onBack?: () => void
}

export function WorkbenchContent({
  embedded = false,
  onBack,
}: WorkbenchContentProps) {
  return <CreationPage />
}

interface WorkbenchPageProps {
  mode: WorkbenchMode
}

export default function WorkbenchPage({ mode }: WorkbenchPageProps) {
  return <WorkbenchContent mode={mode} />
}
