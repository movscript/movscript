import type { ReactNode } from "react";

export type DetailEntityFieldType = "text" | "textarea" | "select" | "number" | "boolean" | string;

export interface DetailEntityFieldOption {
  value: string;
  label: string;
}

export interface DetailEntityFieldDefinition {
  key: string;
  label: string;
  type: DetailEntityFieldType;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  options?: DetailEntityFieldOption[];
}

export type DetailEntityFieldValue = string | boolean;

export interface DetailEntityEditorActionIcons {
  collapse?: ReactNode;
  expand?: ReactNode;
  edit?: ReactNode;
  delete?: ReactNode;
  cancel?: ReactNode;
  save?: ReactNode;
}

export interface DetailEntityEditorStat {
  label: string;
  value: ReactNode;
}
