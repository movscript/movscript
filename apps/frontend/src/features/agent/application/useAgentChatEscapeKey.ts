import { useEffect } from 'react'

import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'

export function useAgentChatEscapeKey(input: {
  enabled: boolean
  onEscape: () => void
}) {
  const { enabled, onEscape } = input

  useEffect(() => {
    if (!enabled) return undefined

    function handleAgentChatEscapeKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      event.preventDefault()
      onEscape()
    }

    return listenToWindowEvent('keydown', handleAgentChatEscapeKey)
  }, [enabled, onEscape])
}
