import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  PluginToolActionButton,
  PluginToolActionRow,
  PluginToolCodeBlock,
  PluginToolField,
  PluginToolFieldDescription,
  PluginToolFieldLabel,
  PluginToolFormStack,
  PluginToolIframe,
  PluginToolIconButton,
  PluginToolInfoCopy,
  PluginToolInfoHeader,
  PluginToolInlineResource,
  PluginToolInput,
  PluginToolLoadingState,
  PluginToolMain,
  PluginToolMutedSurface,
  PluginToolNativeLayout,
  PluginToolNotFoundState,
  PluginToolRoot,
  PluginToolSelect,
  PluginToolStateMessage,
  PluginToolSurface,
  PluginToolTextarea,
  PluginToolWebviewFrame
} from '@/features/plugins/components/PluginsToolUi'
import { ROUTES } from '@/routes/projectRoutes'
import { PLUGIN_TOOL_NATIVE_MAIN_PANE_ID } from '@/features/plugins/presentation/pluginToolLayoutSpec'

export default function PluginToolPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const selectedResources = [
    { id: 'workspace', label: '当前工作区' },
    { id: 'project', label: '当前项目' },
  ]
  const result = {
    isError: true,
    message: t('plugins.toolDisabledDescription'),
  }
  const pluginInfoLabel = 'Plugin info'

  return (
    <PluginToolRoot>
      <PluginToolLoadingState>
        <PluginToolNativeLayout>
          <PluginToolMain data-layout-pane-id={PLUGIN_TOOL_NATIVE_MAIN_PANE_ID}>
            <PluginToolSurface>
              <PluginToolInfoHeader>
                <PluginToolInfoCopy>
                  <PluginToolFieldLabel>{pluginInfoLabel}</PluginToolFieldLabel>
                  <PluginToolStateMessage>
                    {t('plugins.toolDisabledDescription')}
                  </PluginToolStateMessage>
                </PluginToolInfoCopy>
                <PluginToolIconButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('common.back')}
                  onClick={() => navigate(ROUTES.plugins)}
                >
                  <ArrowLeft size={14} />
                </PluginToolIconButton>
              </PluginToolInfoHeader>
              <PluginToolFormStack>
                <PluginToolField>
                  <PluginToolFieldLabel htmlFor="plugin-tool-name">{t('plugins.title')}</PluginToolFieldLabel>
                  <PluginToolInput id="plugin-tool-name" readOnly value={t('plugins.title')} />
                  <PluginToolFieldDescription>{t('plugins.toolDisabledDescription')}</PluginToolFieldDescription>
                </PluginToolField>
                <PluginToolField>
                  <PluginToolFieldLabel htmlFor="plugin-tool-mode">运行模式</PluginToolFieldLabel>
                  <PluginToolSelect id="plugin-tool-mode" value="native" disabled>
                    <option value="native">Native fallback</option>
                  </PluginToolSelect>
                </PluginToolField>
                <PluginToolField>
                  <PluginToolFieldLabel htmlFor="plugin-tool-input">输入</PluginToolFieldLabel>
                  <PluginToolTextarea id="plugin-tool-input" readOnly value={t('plugins.toolDisabledDescription')} />
                </PluginToolField>
              </PluginToolFormStack>
              {selectedResources.map((resource) => (
                <PluginToolInlineResource key={resource.id}>
                  {resource.label}
                </PluginToolInlineResource>
              ))}
              {result.isError ? (
                <PluginToolStateMessage tone="danger">
                  {result.message}
                  <PluginToolCodeBlock>{result.message}</PluginToolCodeBlock>
                </PluginToolStateMessage>
              ) : null}
              <PluginToolMutedSurface>
                <PluginToolCodeBlock>{JSON.stringify(result, null, 2)}</PluginToolCodeBlock>
              </PluginToolMutedSurface>
              <PluginToolNotFoundState
                title={t('plugins.title')}
                action={(
                  <PluginToolActionButton type="button" variant="outline" onClick={() => navigate(ROUTES.plugins)}>
                    {t('common.back')}
                  </PluginToolActionButton>
                )}
              />
              <PluginToolWebviewFrame>
                <PluginToolIframe title="Plugin preview" src="about:blank" sandbox="" />
              </PluginToolWebviewFrame>
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
