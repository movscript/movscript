import type { ITheme } from '@xterm/xterm'

export const SHELL_TERMINAL_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
export const SHELL_TERMINAL_FONT_SIZE = 12
export const SHELL_TERMINAL_LINE_HEIGHT = 1.42

export const SHELL_TERMINAL_CANVAS_THEME = {
  background: '#111418',
  foreground: '#d7dde7',
  muted: '#7f8794',
  primary: '#7ab7ff',
  accent: '#f1c65b',
  selection: '#26455f',
  red: '#ff7878',
  green: '#8bd86f',
  yellow: '#f1c65b',
  cyan: '#67e8f9',
} as const

export function shellTerminalThemeFromStyle(style: CSSStyleDeclaration): ITheme {
  const value = (name: string, fallback: string) => cssColorValue(style.getPropertyValue(name), fallback)
  const primary = value('--shell-workbench-primary', SHELL_TERMINAL_CANVAS_THEME.primary)
  const accent = value('--shell-workbench-accent', SHELL_TERMINAL_CANVAS_THEME.accent)
  return {
    background: value('--shell-workbench-background', SHELL_TERMINAL_CANVAS_THEME.background),
    foreground: value('--shell-workbench-text', SHELL_TERMINAL_CANVAS_THEME.foreground),
    cursor: accent,
    selectionBackground: value('--shell-workbench-selection', SHELL_TERMINAL_CANVAS_THEME.selection),
    black: '#0b0d10',
    red: SHELL_TERMINAL_CANVAS_THEME.red,
    green: SHELL_TERMINAL_CANVAS_THEME.green,
    yellow: SHELL_TERMINAL_CANVAS_THEME.yellow,
    blue: primary,
    magenta: '#d946ef',
    cyan: '#2dd4bf',
    white: SHELL_TERMINAL_CANVAS_THEME.foreground,
    brightBlack: '#64748b',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: primary,
    brightMagenta: '#e879f9',
    brightCyan: SHELL_TERMINAL_CANVAS_THEME.cyan,
    brightWhite: '#ffffff',
  }
}

function cssColorValue(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed || fallback
}
