import type { SVGAttributes } from "react";

export type SettingCardKind = "person" | "location" | "object" | "style" | "product";
export type SettingCardStatus =
  | "locked"
  | "review"
  | "missing"
  | "confirmed"
  | "corrected"
  | "workspace"
  | "ignored"
  | "merged"
  | "active"
  | "approved"
  | "rejected";

export interface SettingCardData {
  id: string | number;
  kind: SettingCardKind;
  title: string;
  subtitle: string;
  status: SettingCardStatus;
  version: string;
  usage: number;
  coverage: number;
  summary: string;
  accent: string;
}

export type SettingIcon = (props: SVGAttributes<SVGSVGElement>) => JSX.Element;
