import { useSyncExternalStore } from "react";

export type ToastType = "success" | "warning" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  detail?: string;
}

export interface ToastStore {
  toasts: ToastItem[];
  debugMode: boolean;
  toggleDebugMode: () => void;
  add: (message: string, type: ToastType, detail?: string) => void;
  remove: (id: string) => void;
}

const TOAST_DEBUG_STORAGE_KEY = "toast-debug";
const listeners = new Set<() => void>();
let toasts: ToastItem[] = [];
let debugMode = readToastDebugMode();
let snapshot = createToastStoreSnapshot();

export function useToastStore(): ToastStore {
  return useSyncExternalStore(subscribeToastStore, toastStoreSnapshot, toastStoreSnapshot);
}

export const toast = {
  success: (message: string, detail?: string) => addToast(message, "success", detail),
  warning: (message: string, detail?: string) => addToast(message, "warning", detail),
  error: (message: string, detail?: string) => addToast(message, "error", detail),
  info: (message: string, detail?: string) => addToast(message, "info", detail),
  isDebug: () => debugMode,
};

function subscribeToastStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function toastStoreSnapshot(): ToastStore {
  return snapshot;
}

function createToastStoreSnapshot(): ToastStore {
  return {
    toasts,
    debugMode,
    toggleDebugMode,
    add: addToast,
    remove: removeToast,
  };
}

function addToast(message: string, type: ToastType, detail?: string): void {
  const id = `${Date.now()}-${Math.random()}`;
  toasts = [...toasts, { id, message, type, detail }];
  notifyToastStore();
  setTimeout(() => removeToast(id), detail ? 8000 : 4000);
}

function removeToast(id: string): void {
  const next = toasts.filter((toast) => toast.id !== id);
  if (next === toasts || next.length === toasts.length) return;
  toasts = next;
  notifyToastStore();
}

function toggleDebugMode(): void {
  debugMode = !debugMode;
  writeToastDebugMode(debugMode);
  notifyToastStore();
}

function notifyToastStore(): void {
  snapshot = createToastStoreSnapshot();
  for (const listener of listeners) listener();
}

function readToastDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(TOAST_DEBUG_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { debugMode?: unknown }; debugMode?: unknown };
    return parsed.state?.debugMode === true || parsed.debugMode === true;
  } catch {
    return false;
  }
}

function writeToastDebugMode(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      TOAST_DEBUG_STORAGE_KEY,
      JSON.stringify({ state: { debugMode: value }, version: 0 }),
    );
  } catch {
    // Debug-mode persistence is best-effort only.
  }
}
