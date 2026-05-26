import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function MultiAnglePage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="multi_angle"
      capability="image"
      toolName={t('tools.defs.multiAngle.name')}
      toolDescription={t('tools.defs.multiAngle.description')}
      inputType="image"
      outputType="image"
      promptPlaceholder={t('tools.defs.multiAngle.promptPlaceholder')}
    />
  )
}
