import { clsx, type ClassValue } from "clsx";

export type { ClassValue };

export function cn(...values: ClassValue[]) {
  return clsx(values);
}

