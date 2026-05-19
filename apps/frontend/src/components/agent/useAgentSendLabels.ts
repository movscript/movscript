import { useMemo } from 'react'
import type { TFunction } from 'i18next'

export function useAgentSendLabels(t: TFunction) {
  const sendDraftLabels = useMemo(() => ({
    attachmentOnlyMessage: t('agents.chat.attachmentOnlyMessage'),
    syncModelConfig: t('agents.chat.panel.http.syncModelConfig'),
    loadExistingThread: t('agents.chat.panel.http.loadExistingThread'),
    missingThreadFallback: t('agents.chat.panel.http.missingThreadFallback'),
    createThread: t('agents.chat.panel.http.createThread'),
    appendUserMessage: t('agents.chat.panel.http.appendUserMessage'),
    createRun: t('agents.chat.panel.http.createRun'),
    pollRun: t('agents.chat.panel.http.pollRun'),
    pollRunNote: t('agents.chat.panel.http.pollRunNote'),
    fetchFinalThread: t('agents.chat.panel.http.fetchFinalThread'),
  }), [t])

  const commitSendLabels = useMemo(() => ({
    selectModelFirst: t('agents.chat.selectModelFirst'),
    localRuntime: t('agents.chat.localRuntime'),
  }), [t])

  const sendActionLabels = useMemo(() => ({
    selectModelFirst: t('agents.chat.selectModelFirst'),
    busyError: '当前 Agent 对话正在处理上一条请求，请稍后再试',
    buildFailurePrefix: '发送前调试构建失败：',
  }), [t])

  return {
    commitSendLabels,
    sendActionLabels,
    sendDraftLabels,
  }
}
