import type { SVGAttributes } from "react";

export type CreativeReferenceCardKind = "person" | "location" | "object" | "style" | "product";
export type CreativeReferenceCardStatus =
  | "locked"
  | "review"
  | "missing"
  | "confirmed"
  | "corrected"
  | "draft"
  | "ignored"
  | "merged"
  | "active"
  | "approved"
  | "rejected";

export interface CreativeReferenceCardData {
  id: string | number;
  kind: CreativeReferenceCardKind;
  title: string;
  subtitle: string;
  status: CreativeReferenceCardStatus;
  version: string;
  usage: number;
  coverage: number;
  summary: string;
  accent: string;
}

export type CreativeReferenceIcon = (props: SVGAttributes<SVGSVGElement>) => JSX.Element;
