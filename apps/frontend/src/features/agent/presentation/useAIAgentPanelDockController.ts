import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { AGENT_PANEL_DRAFT_EVENT, AGENT_PANEL_THREAD_EVENT, type AgentPanelThreadPayload } from '@/features/agent/application/agentPanelBridge'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const DETAIL_AGENT_PANEL_MIN_WIDTH = 300
const DETAIL_AGENT_PANEL_DEFAULT_WIDTH = 320
const DETAIL_AGENT_PANEL_WIDE_DEFAULT_WIDTH = 360
const DETAIL_AGENT_PANEL_MAX_WIDTH = 420

function agentPanelDefaultWidth(viewportWidth: number) {
  return viewportWidth >= 1440 ? DETAIL_AGENT_PANEL_WIDE_DEFAULT_WIDTH : DETAIL_AGENT_PANEL_DEFAULT_WIDTH
}

function agentPanelMaxWidth(viewportWidth: number) {
  return Math.min(DETAIL_AGENT_PANEL_MAX_WIDTH, Math.max(DETAIL_AGENT_PANEL_MIN_WIDTH, Math.round(viewportWidth * 0.28)))
}

function clampAgentPanelWidth(width: number, viewportWidth: number) {
  return clampNumber(width, DETAIL_AGENT_PANEL_MIN_WIDTH, agentPanelMaxWidth(viewportWidth))
}

export function useAIAgentPanelDockController() {
  const open = useAgentPanelUiStore((state) => state.open)
  const setOpen = useAgentPanelUiStore((state) => state.setOpen)
  const toggleOpen = useAgentPanelUiStore((state) => state.toggleOpen)
  const [pendingThreadIdToOpen, setPendingThreadIdToOpen] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useState(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
    return clampAgentPanelWidth(agentPanelDefaultWidth(viewportWidth), viewportWidth)
  })
  const dockLayout = true
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelResizeFrameRef = useRef<number | null>(null)
  const panelResizeStateRef = useRef<{ startX: number; startWidth: number; latestWidth: number; maxWidth: number } | null>(null)

  useEffect(() => {
    function handleDraft() {
      setOpen(true)
    }
    function handleThreadOpen(event: Event) {
      const detail = (event as CustomEvent<AgentPanelThreadPayload>).detail
      if (!detail?.threadId?.trim()) return
      setPendingThreadIdToOpen(detail.threadId)
      setOpen(true)
    }

    window.addEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
    window.addEventListener(AGENT_PANEL_THREAD_EVENT, handleThreadOpen)
    return () => {
      window.removeEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
      window.removeEventListener(AGENT_PANEL_THREAD_EVENT, handleThreadOpen)
    }
  }, [])

  useEffect(() => {
    function updateDockLayout() {
      const viewportWidth = window.innerWidth
      setPanelWidth((current) => clampAgentPanelWidth(current, viewportWidth))
    }

    updateDockLayout()
    window.addEventListener('resize', updateDockLayout)
    return () => window.removeEventListener('resize', updateDockLayout)
  }, [])

  const handlePendingThreadHandled = useCallback((threadId: string) => {
    setPendingThreadIdToOpen((current) => current === threadId ? null : current)
  }, [])

  const startPanelResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!open || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startWidth = panelWidth
    const startX = event.clientX
    const viewportWidth = window.innerWidth
    const maxWidth = agentPanelMaxWidth(viewportWidth)
    panelResizeStateRef.current = { startX, startWidth, latestWidth: startWidth, maxWidth }
    document.body.classList.add('ai-agent-panel-resizing', 'ai-agent-panel-resizing--x')

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const state = panelResizeStateRef.current
      if (!state) return
      const delta = state.startX - moveEvent.clientX
      state.latestWidth = clampNumber(state.startWidth + delta, DETAIL_AGENT_PANEL_MIN_WIDTH, state.maxWidth)
      if (panelResizeFrameRef.current !== null) return
      panelResizeFrameRef.current = window.requestAnimationFrame(() => {
        panelResizeFrameRef.current = null
        const latest = panelResizeStateRef.current
        if (!latest) return
        panelRef.current?.style.setProperty('--ui-agent-panel-width', `${latest.latestWidth}px`)
      })
    }

    const onUp = () => {
      const finalWidth = panelResizeStateRef.current?.latestWidth ?? panelWidth
      if (panelResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(panelResizeFrameRef.current)
        panelResizeFrameRef.current = null
      }
      panelRef.current?.style.setProperty('--ui-agent-panel-width', `${finalWidth}px`)
      setPanelWidth(finalWidth)
      panelResizeStateRef.current = null
      document.body.classList.remove('ai-agent-panel-resizing', 'ai-agent-panel-resizing--x')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [open, panelWidth])

  return {
    dockLayout,
    handlePendingThreadHandled,
    open,
    panelRef,
    panelWidth,
    pendingThreadIdToOpen,
    startPanelResize,
    toggleOpen,
  }
}
