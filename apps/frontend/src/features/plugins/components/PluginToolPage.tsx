import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  PluginToolActionButton,
  PluginToolActionRow,
  PluginToolInfoCopy,
  PluginToolInfoHeader,
  PluginToolLoadingState,
  PluginToolMain,
  PluginToolNativeLayout,
  PluginToolRoot,
  PluginToolStateMessage,
  PluginToolSurface,
} from '@movscript/ui'
import { ROUTES } from '@/routes/projectRoutes'

export default function PluginToolPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <PluginToolRoot>
      <PluginToolLoadingState>
        <PluginToolNativeLayout>
          <PluginToolMain>
            <PluginToolSurface>
              <PluginToolInfoHeader>
                <PluginToolInfoCopy>
                  <p className="type-body font-semibold text-foreground">
                    {t('plugins.title')}
                  </p>
                  <PluginToolStateMessage>
                    {t('plugins.toolDisabledDescription')}
                  </PluginToolStateMessage>
                </PluginToolInfoCopy>
              </PluginToolInfoHeader>
              <PluginToolActionRow>
                <PluginToolActionButton
                  type="button"
                  variant="outline"
                  onClick={() => navigate(ROUTES.plugins)}
                >
                  <ArrowLeft size={16} />
                  {t('common.back')}
                </PluginToolActionButton>
              </PluginToolActionRow>
            </PluginToolSurface>
          </PluginToolMain>
        </PluginToolNativeLayout>
      </PluginToolLoadingState>
    </PluginToolRoot>
  )
}
