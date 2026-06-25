import { readBrowserStorageItem, writeBrowserStorageItem } from '@movscript/shared/browser'

export const LOCAL_ADMIN_PROMPT_DISMISSED_KEY = 'movscript-local-admin-prompt-dismissed'

export interface LocalAdminPromptPreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function readLocalAdminPromptDismissed(
  storage: LocalAdminPromptPreferenceStorage | null = browserLocalAdminPromptPreferenceStorage(),
): boolean {
  try {
    return storage?.getItem(LOCAL_ADMIN_PROMPT_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveLocalAdminPromptDismissed(
  storage: LocalAdminPromptPreferenceStorage | null = browserLocalAdminPromptPreferenceStorage(),
) {
  try {
    storage?.setItem(LOCAL_ADMIN_PROMPT_DISMISSED_KEY, 'true')
  } catch {
    // Non-critical preference persistence; the prompt remains dismissible in memory.
  }
}

function browserLocalAdminPromptPreferenceStorage(): LocalAdminPromptPreferenceStorage | null {
  return {
    getItem: (key) => readBrowserStorageItem('local', key),
    setItem: (key, value) => writeBrowserStorageItem('local', key, value),
  }
}
