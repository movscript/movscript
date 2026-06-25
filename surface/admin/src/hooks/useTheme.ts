import { useState, useEffect, useCallback } from 'react'
import {
  applyMovScriptTheme,
  getMovScriptThemeMeta,
  initMovScriptTheme,
  nextMovScriptThemeName,
  readMovScriptTheme,
  setMovScriptTheme,
  type MovScriptThemeName,
} from '@movscript/theme'

export function useTheme() {
  const [theme, setThemeState] = useState<MovScriptThemeName>(() => readMovScriptTheme())

  useEffect(() => {
    applyMovScriptTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      return setMovScriptTheme(nextMovScriptThemeName(prev))
    })
  }, [])

  const nextTheme = nextMovScriptThemeName(theme)
  return {
    theme,
    themeMeta: getMovScriptThemeMeta(theme),
    nextTheme,
    nextThemeMeta: getMovScriptThemeMeta(nextTheme),
    toggleTheme,
  }
}

/** Call once before React mounts to avoid flash of wrong theme */
export function initTheme() {
  initMovScriptTheme()
}
