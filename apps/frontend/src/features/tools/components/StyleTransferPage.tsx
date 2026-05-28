import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'
import { ResourceLibraryView } from '@/features/resources/components/ResourcesPage'

export default function StyleTransferPage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="style_transfer"
      capability="image"
      toolName={t('tools.defs.styleTransfer.name')}
      toolDescription={t('tools.defs.styleTransfer.description')}
      inputType="image"
      outputType="image"
      promptPlaceholder={t('tools.defs.styleTransfer.promptPlaceholder')}
      layout="reference-workbench"
      showHistory={false}
      resourcePane={<ResourceLibraryView variant="pane" />}
    />
  )
}
