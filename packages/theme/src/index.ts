export const movScriptThemeNames = ["light", "dark"] as const;

export type MovScriptThemeName = (typeof movScriptThemeNames)[number];
export type MovScriptThemeMode = "light" | "dark";

export interface MovScriptThemeMeta {
  name: MovScriptThemeName;
  label: string;
  mode: MovScriptThemeMode;
}

export const movScriptThemeRegistry: Record<MovScriptThemeName, MovScriptThemeMeta> = {
  light: { name: "light", label: "Light", mode: "light" },
  dark: { name: "dark", label: "Dark", mode: "dark" },
} as const;

export const movScriptThemeStorageKey = "movscript-theme" as const;
export const defaultMovScriptTheme: MovScriptThemeName = "light";

export function isMovScriptThemeName(value: unknown): value is MovScriptThemeName {
  return typeof value === "string" && (movScriptThemeNames as readonly string[]).includes(value);
}

export function getMovScriptThemeMeta(theme: MovScriptThemeName): MovScriptThemeMeta {
  return movScriptThemeRegistry[theme];
}

export function isMovScriptDarkTheme(theme: MovScriptThemeName): boolean {
  return getMovScriptThemeMeta(theme).mode === "dark";
}

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveThemeTarget(target?: Element | null): Element | null {
  if (target !== undefined) return target;
  if (typeof document === "undefined") return null;
  return document.documentElement;
}

export function readMovScriptTheme(storage?: Storage | null): MovScriptThemeName {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return defaultMovScriptTheme;
  try {
    const storedTheme = resolvedStorage.getItem(movScriptThemeStorageKey);
    return isMovScriptThemeName(storedTheme) ? storedTheme : defaultMovScriptTheme;
  } catch {
    return defaultMovScriptTheme;
  }
}

export function applyMovScriptTheme(theme: MovScriptThemeName, target?: Element | null): void {
  const resolvedTarget = resolveThemeTarget(target);
  if (!resolvedTarget) return;
  resolvedTarget.setAttribute("data-theme", theme);
}

export function writeMovScriptTheme(theme: MovScriptThemeName, storage?: Storage | null): void {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return;
  try {
    resolvedStorage.setItem(movScriptThemeStorageKey, theme);
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

export function setMovScriptTheme(theme: MovScriptThemeName, options: { storage?: Storage | null; target?: Element | null } = {}): MovScriptThemeName {
  writeMovScriptTheme(theme, options.storage);
  applyMovScriptTheme(theme, options.target);
  return theme;
}

export function initMovScriptTheme(options: { storage?: Storage | null; target?: Element | null } = {}): MovScriptThemeName {
  const theme = readMovScriptTheme(options.storage);
  applyMovScriptTheme(theme, options.target);
  return theme;
}

export function toggleMovScriptThemeName(theme: MovScriptThemeName): MovScriptThemeName {
  return nextMovScriptThemeName(theme);
}

export function nextMovScriptThemeName(
  theme: MovScriptThemeName,
  themes: readonly MovScriptThemeName[] = movScriptThemeNames
): MovScriptThemeName {
  const normalizedThemes = themes.length > 0 ? themes : movScriptThemeNames;
  const index = normalizedThemes.indexOf(theme);
  return normalizedThemes[(index + 1) % normalizedThemes.length] ?? defaultMovScriptTheme;
}
