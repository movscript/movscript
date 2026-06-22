import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@movscript/ui/primitives'
import {
  checkForAppUpdate,
  downloadAppUpdate,
  installAppUpdate,
  useAppUpdateStatus,
} from '@/shared/infrastructure/appUpdateStatus'
import './AppUpdateGate.css'

export function AppUpdateGate() {
  const { t } = useTranslation()
  const status = useAppUpdateStatus()
  const required = status.available && status.policy === 'required'
  const primaryLabel = useMemo(() => {
    if (status.installing) return t('appUpdate.actions.installing', { defaultValue: '正在重启' })
    if (status.downloaded) return t('appUpdate.actions.install', { defaultValue: '重启安装更新' })
    if (status.downloading) return t('appUpdate.actions.downloading', { defaultValue: '下载中 {{progress}}%', progress: Math.round(status.downloadProgress ?? 0) })
    return t('appUpdate.actions.download', { defaultValue: '下载更新' })
  }, [status.downloadProgress, status.downloaded, status.downloading, status.installing, t])

  if (!required) return null

  function handlePrimaryAction() {
    if (status.installing || status.downloading) return
    if (status.downloaded) {
      void installAppUpdate().catch(() => {})
      return
    }
    void downloadAppUpdate().catch(() => {})
  }

  return (
    <div className="app-update-gate" role="alertdialog" aria-modal="true" aria-labelledby="app-update-gate-title">
      <section className="app-update-gate__panel">
        <div className="app-update-gate__body">
          <header className="app-update-gate__header">
            <h2 className="app-update-gate__title" id="app-update-gate-title">
              {status.policyTitle || t('appUpdate.requiredTitle', { defaultValue: '需要更新 Movscript' })}
            </h2>
            <p className="app-update-gate__description">
              {status.policyMessage || t('appUpdate.requiredDescription', { defaultValue: '当前版本需要更新后才能继续使用。Movscript 不会在你确认前下载或安装更新。' })}
            </p>
          </header>

          <div className="app-update-gate__meta">
            <span>{t('appUpdate.currentVersion', { defaultValue: '当前版本：{{version}}', version: status.currentVersion ?? '-' })}</span>
            <span>{t('appUpdate.latestVersion', { defaultValue: '最新版本：{{version}}', version: status.latestVersion ?? '-' })}</span>
            {status.severity && status.severity !== 'normal' ? (
              <span>{t('appUpdate.severity', { defaultValue: '更新级别：{{severity}}', severity: status.severity })}</span>
            ) : null}
            {status.deadlineAt ? (
              <span>{t('appUpdate.deadline', { defaultValue: '截止时间：{{deadline}}', deadline: status.deadlineAt })}</span>
            ) : null}
            {status.error ? <span>{status.error}</span> : null}
          </div>

          <div className="app-update-gate__actions">
            <Button type="button" variant="outline" onClick={() => void checkForAppUpdate().catch(() => {})} disabled={status.checking || status.downloading || status.installing}>
              {status.checking ? t('appUpdate.actions.checking', { defaultValue: '检查中' }) : t('appUpdate.actions.checkAgain', { defaultValue: '重新检查' })}
            </Button>
            <Button type="button" onClick={handlePrimaryAction} disabled={status.downloading || status.installing} loading={status.downloading || status.installing}>
              {primaryLabel}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
