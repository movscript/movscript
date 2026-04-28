import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

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
    />
  )
}
