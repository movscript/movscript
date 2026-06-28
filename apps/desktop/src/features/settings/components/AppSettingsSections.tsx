import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Clapperboard, FolderOpen, HardDrive, RefreshCw, Server } from 'lucide-react'
import { Textarea } from '@movscript/ui/primitives'
import {
  AppSettingsActionButton,
  AppSettingsActionRow,
  AppSettingsAdminSurface,
  AppSettingsContentStack,
  AppSettingsEndpointSurface,
  AppSettingsFeedbackText,
  AppSettingsField,
  AppSettingsFooterText,
  AppSettingsInput,
  AppSettingsIntro,
  AppSettingsSection,
} from '@/features/settings/components/AppSettingsUi'
import { ExternalResourceSourceSettingsSection } from '@/features/settings/components/ExternalResourceSourceSettingsSection'
import { ROUTES } from '@/routes/projectRoutes'
import type { AppSettings } from '@/shared/infrastructure/config'
import type {
  AppSettingsTestState,
  ShotLibrarySourceParseResult,
} from '@/features/settings/presentation/appSettingsPageModel'

interface AppSettingsContentProps {
  dataConnectionURL: string
  canOpenAdmin: boolean
  chooseMovScriptHomeDir: () => void
  collectResourceBlobs: (dryRun: boolean) => void
  hasChanged: boolean
  isValid: boolean
  localMode: boolean
  normalized: string
  openAdminConsole: () => void
  parsedShotSources: ShotLibrarySourceParseResult
  resetShotLibrarySources: () => void
  resetToDefault: () => void
  resourceGCState: AppSettingsTestState
  saveSettings: () => void
  saveShotLibrarySources: () => void
  saveWorkspaceRoot: () => void
  saved: boolean
  setDataConnectionURLInput: (value: string) => void
  setSaved: (saved: boolean) => void
  setShotSourcesSaved: (saved: boolean) => void
  setShotSourcesText: (value: string) => void
  setMovScriptHomeDirInput: (value: string) => void
  setWorkspaceSaved: (saved: boolean) => void
  settings: AppSettings
  shotSourcesChanged: boolean
  shotSourcesSaved: boolean
  shotSourcesText: string
  shotSourcesValid: boolean
  showLoginFooter: boolean
  testConnection: () => void
  testState: AppSettingsTestState
  useDefaultWorkspaceRoot: () => void
  movScriptHomeDir: string
  movScriptHomeDirChanged: boolean
  workspaceSaved: boolean
}

export function AppSettingsContent({
  dataConnectionURL,
  canOpenAdmin,
  chooseMovScriptHomeDir,
  collectResourceBlobs,
  hasChanged,
  isValid,
  localMode,
  normalized,
  openAdminConsole,
  parsedShotSources,
  resetShotLibrarySources,
  resetToDefault,
  resourceGCState,
  saveSettings,
  saveShotLibrarySources,
  saveWorkspaceRoot,
  saved,
  setDataConnectionURLInput,
  setSaved,
  setShotSourcesSaved,
  setShotSourcesText,
  setMovScriptHomeDirInput,
  setWorkspaceSaved,
  settings,
  shotSourcesChanged,
  shotSourcesSaved,
  shotSourcesText,
  shotSourcesValid,
  showLoginFooter,
  testConnection,
  testState,
  useDefaultWorkspaceRoot,
  movScriptHomeDir,
  movScriptHomeDirChanged,
  workspaceSaved,
}: AppSettingsContentProps) {
  const { t } = useTranslation()

  return (
    <AppSettingsContentStack>
      <AppSettingsIntro title={t('appSettings.title')} description={t('appSettings.description')} />

      <AppSettingsSection
        icon={HardDrive}
        title={t('appSettings.movScriptWorkspaceTitle')}
        description={t('appSettings.movScriptWorkspaceHint')}
      >
        <AppSettingsField
          label={t('appSettings.movScriptWorkspaceDir')}
          htmlFor="movScriptWorkspaceDir"
          help={t('appSettings.movScriptWorkspaceDirHelp')}
        >
          <AppSettingsInput
            id="movScriptWorkspaceDir"
            value={movScriptHomeDir}
            onChange={(e) => {
              setMovScriptHomeDirInput(e.target.value)
              setWorkspaceSaved(false)
            }}
            placeholder={t('appSettings.movScriptWorkspaceDirPlaceholder')}
            spellCheck={false}
          />
        </AppSettingsField>

        <AppSettingsEndpointSurface
          label={t('appSettings.movScriptWorkspaceEffectiveRoot')}
          value={settings.movScriptWorkspaceDir?.trim() || t('appSettings.movScriptWorkspaceDefaultRoot')}
        />

        {workspaceSaved && (
          <AppSettingsFeedbackText tone="success" icon={<CheckCircle2 size={14} />}>
            {t('appSettings.movScriptWorkspaceSavedRestart')}
          </AppSettingsFeedbackText>
        )}

        <AppSettingsActionRow>
          <AppSettingsActionButton type="button" variant="outline" onClick={chooseMovScriptHomeDir}>
            <FolderOpen size={14} className="mr-2" />
            {t('appSettings.movScriptWorkspaceChooseDirectory')}
          </AppSettingsActionButton>
          <AppSettingsActionButton onClick={saveWorkspaceRoot} disabled={!movScriptHomeDirChanged}>
            {t('common.save')}
          </AppSettingsActionButton>
          <AppSettingsActionButton type="button" variant="ghost" onClick={useDefaultWorkspaceRoot}>
            {t('appSettings.movScriptWorkspaceUseDefault')}
          </AppSettingsActionButton>
        </AppSettingsActionRow>
      </AppSettingsSection>

      <AppSettingsSection
        icon={Server}
        title={t('appSettings.cloudApiTitle')}
        description={t('appSettings.cloudApiHint')}
      >
        <AppSettingsField
          label={t('appSettings.apiBaseURL')}
          htmlFor="dataConnectionURL"
          help={t('appSettings.apiBaseURLHelp')}
          error={!isValid && dataConnectionURL.trim() ? t('appSettings.invalidURL') : undefined}
        >
          <AppSettingsInput
            id="dataConnectionURL"
            value={dataConnectionURL}
            onChange={(e) => {
              setDataConnectionURLInput(e.target.value)
              setSaved(false)
            }}
            placeholder="https://api.example.com"
            spellCheck={false}
          />
        </AppSettingsField>

        <AppSettingsEndpointSurface
          label={t('appSettings.effectiveEndpoint')}
          value={isValid ? `${normalized}/api/v1` : '-'}
        />

        {localMode && isValid && canOpenAdmin && (
          <AppSettingsAdminSurface
            label={t('appSettings.adminConsole')}
            url={t('appSettings.adminConsoleHost')}
            help={t('appSettings.adminConsoleHelp')}
            action={
              <AppSettingsActionButton
                type="button"
                variant="outline"
                size="sm"
                onClick={openAdminConsole}
              >
                {t('appSettings.openAdminConsole')}
              </AppSettingsActionButton>
            }
          />
        )}

        {testState.message && (
          <AppSettingsFeedbackText tone={testState.status === 'error' ? 'danger' : testState.status === 'success' ? 'success' : 'neutral'}>
            {testState.message}
          </AppSettingsFeedbackText>
        )}

        {saved && (
          <AppSettingsFeedbackText tone="success" icon={<CheckCircle2 size={14} />}>
            {t('appSettings.savedReloading')}
          </AppSettingsFeedbackText>
        )}

        <AppSettingsActionRow>
          <AppSettingsActionButton onClick={saveSettings} disabled={!isValid || !hasChanged}>
            {t('common.save')}
          </AppSettingsActionButton>
          <AppSettingsActionButton variant="outline" onClick={testConnection} disabled={!isValid || testState.status === 'testing'}>
            {testState.status === 'testing' && <RefreshCw size={14} className="mr-2 animate-spin" />}
            {t('appSettings.testConnection')}
          </AppSettingsActionButton>
          <AppSettingsActionButton variant="ghost" onClick={resetToDefault}>
            {t('appSettings.resetDefault')}
          </AppSettingsActionButton>
        </AppSettingsActionRow>
      </AppSettingsSection>

      {localMode && canOpenAdmin && (
        <AppSettingsSection
          icon={HardDrive}
          title={t('appSettings.resourceStorageTitle')}
          description={t('appSettings.resourceStorageHint')}
        >
          <AppSettingsEndpointSurface
            label={t('appSettings.resourceBlobGCEndpoint')}
            value="/api/v1/admin/resource-storage/blobs/gc"
          />

          {resourceGCState.message && (
            <AppSettingsFeedbackText tone={resourceGCState.status === 'error' ? 'danger' : resourceGCState.status === 'success' ? 'success' : 'neutral'}>
              {resourceGCState.message}
            </AppSettingsFeedbackText>
          )}

          <AppSettingsActionRow>
            <AppSettingsActionButton
              variant="outline"
              onClick={() => collectResourceBlobs(true)}
              disabled={hasChanged || resourceGCState.status === 'testing'}
            >
              {resourceGCState.status === 'testing' && <RefreshCw size={14} className="mr-2 animate-spin" />}
              {t('appSettings.resourceBlobGCDryRun')}
            </AppSettingsActionButton>
            <AppSettingsActionButton
              variant="ghost"
              onClick={() => collectResourceBlobs(false)}
              disabled={hasChanged || resourceGCState.status === 'testing'}
            >
              {t('appSettings.resourceBlobGCRun')}
            </AppSettingsActionButton>
          </AppSettingsActionRow>
        </AppSettingsSection>
      )}

      <ExternalResourceSourceSettingsSection canOpenAdmin={isValid && canOpenAdmin} enabled />

      <AppSettingsSection
        icon={Clapperboard}
        title={t('appSettings.shotLibraryApiTitle')}
        description={t('appSettings.shotLibraryApiHint')}
      >
        <AppSettingsField
          label={t('appSettings.shotLibrarySources')}
          htmlFor="shotLibrarySources"
          help={t('appSettings.shotLibrarySourcesHelp')}
          error={!parsedShotSources.ok ? parsedShotSources.error : undefined}
        >
          <Textarea
            id="shotLibrarySources"
            className="app-settings-textarea app-settings-textarea--code"
            value={shotSourcesText}
            onChange={(event) => {
              setShotSourcesText(event.target.value)
              setShotSourcesSaved(false)
            }}
            rows={8}
            spellCheck={false}
          />
        </AppSettingsField>

        <AppSettingsEndpointSurface
          label={t('appSettings.shotLibraryStandardApi')}
          value="/api/v1/shot-references"
        />

        {shotSourcesSaved && (
          <AppSettingsFeedbackText tone="success" icon={<CheckCircle2 size={14} />}>
            {t('appSettings.saved')}
          </AppSettingsFeedbackText>
        )}

        <AppSettingsActionRow>
          <AppSettingsActionButton onClick={saveShotLibrarySources} disabled={!shotSourcesValid || !shotSourcesChanged}>
            {t('common.save')}
          </AppSettingsActionButton>
          <AppSettingsActionButton variant="ghost" onClick={resetShotLibrarySources}>
            {t('appSettings.resetDefault')}
          </AppSettingsActionButton>
        </AppSettingsActionRow>
      </AppSettingsSection>

      {showLoginFooter && (
        <AppSettingsFooterText>
          <Link to={ROUTES.root} className="text-foreground underline-offset-4 hover:underline">{t('appSettings.returnToLogin')}</Link>
        </AppSettingsFooterText>
      )}
    </AppSettingsContentStack>
  )
}
