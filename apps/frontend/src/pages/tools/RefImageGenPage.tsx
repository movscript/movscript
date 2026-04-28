import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function RefImageGenPage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="ref_image_gen"
      capability="image"
      toolName={t('tools.defs.refImageGen.name')}
      toolDescription={t('tools.defs.refImageGen.description')}
      inputType="image"
      outputType="image"
      promptPlaceholder={t('tools.defs.refImageGen.promptPlaceholder')}
    />
  )
}
