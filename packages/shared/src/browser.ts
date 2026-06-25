export type BrowserStorageArea = "local" | "session";

export function readBrowserStorageItem(area: BrowserStorageArea, key: string): string | null {
  const storage = browserStorageForArea(area);
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeBrowserStorageItem(area: BrowserStorageArea, key: string, value: string): void {
  const storage = browserStorageForArea(area);
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Browser storage can be unavailable in restricted contexts.
  }
}

export function removeBrowserStorageItem(area: BrowserStorageArea, key: string): void {
  const storage = browserStorageForArea(area);
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Browser storage can be unavailable in restricted contexts.
  }
}

export function listenToWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): () => void;
export function listenToWindowEvent(
  type: string,
  listener: EventListenerOrEventListenerObject | ((event: Event) => void) | (() => void),
  options?: boolean | AddEventListenerOptions,
): () => void;
export function listenToWindowEvent(
  type: string,
  listener: EventListenerOrEventListenerObject | ((event: Event) => void) | (() => void),
  options?: boolean | AddEventListenerOptions,
): () => void {
  if (typeof window === "undefined") return () => {};
  const addEventListener = window.addEventListener;
  if (typeof addEventListener !== "function") return () => {};
  const eventListener = listener as EventListenerOrEventListenerObject;
  addEventListener.call(window, type, eventListener, options);
  return () => {
    const removeEventListener = window.removeEventListener;
    if (typeof removeEventListener !== "function") return;
    removeEventListener.call(window, type, eventListener, options);
  };
}

export function publishWindowEvent<K extends keyof WindowEventMap>(event: WindowEventMap[K]): boolean;
export function publishWindowEvent<T = unknown>(type: string, detail?: T): boolean;
export function publishWindowEvent<T = unknown>(eventOrType: Event | string, detail?: T): boolean {
  if (typeof window === "undefined") return false;
  const dispatchEvent = window.dispatchEvent;
  if (typeof dispatchEvent !== "function") return false;
  if (eventOrType instanceof Event) return dispatchEvent.call(window, eventOrType);
  return dispatchEvent.call(window, new CustomEvent(eventOrType, { detail }));
}

export function createObjectUrl(source: Blob | MediaSource): string {
  return URL.createObjectURL(source);
}

export function revokeObjectUrl(url: string | undefined | null): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function revokeObjectUrls(urls: Iterable<string | undefined | null>): void {
  for (const url of urls) revokeObjectUrl(url);
}

export async function withObjectUrl<T>(source: Blob | MediaSource, fn: (url: string) => Promise<T>): Promise<T> {
  const url = createObjectUrl(source);
  try {
    return await fn(url);
  } finally {
    revokeObjectUrl(url);
  }
}

function browserStorageForArea(area: BrowserStorageArea): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  return area === "local" ? window.localStorage : window.sessionStorage;
}
