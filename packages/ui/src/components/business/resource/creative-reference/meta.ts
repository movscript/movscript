import { accentGradientClass, type AccentTone } from "../../../../semantic";
import type { StatusIntent } from "../../../primitives";
import { BoxIcon, MapPinIcon, PaletteIcon, TagIcon, UserRoundIcon } from "./icons";
import type { CreativeReferenceCardKind, CreativeReferenceCardStatus, CreativeReferenceIcon } from "./types";

export const creativeReferenceKindMeta: Record<CreativeReferenceCardKind, { label: string; icon: CreativeReferenceIcon; tone: AccentTone }> = {
  person: { label: "人物", icon: UserRoundIcon, tone: "sky" },
  location: { label: "地点", icon: MapPinIcon, tone: "teal" },
  object: { label: "道具", icon: BoxIcon, tone: "amber" },
  style: { label: "风格", icon: PaletteIcon, tone: "rose" },
  product: { label: "产品", icon: TagIcon, tone: "violet" },
};

export const creativeReferenceStatusMeta: Record<CreativeReferenceCardStatus, { label: string; intent: StatusIntent }> = {
  locked: { label: "已锁定", intent: "success" },
  confirmed: { label: "已确认", intent: "success" },
  corrected: { label: "已修正", intent: "info" },
  active: { label: "进行中", intent: "info" },
  approved: { label: "已批准", intent: "success" },
  review: { label: "待确认", intent: "warning" },
  workspace: { label: "工作区", intent: "warning" },
  missing: { label: "待补设定", intent: "danger" },
  ignored: { label: "已忽略", intent: "neutral" },
  merged: { label: "已合并", intent: "neutral" },
  rejected: { label: "已拒绝", intent: "danger" },
};

export function normalizeCreativeReferenceKind(kind?: string): CreativeReferenceCardKind {
  const normalized = String(kind ?? "").toLowerCase();
  if (["person", "character", "人物", "角色"].includes(normalized)) return "person";
  if (["location", "place", "地点", "场景"].includes(normalized)) return "location";
  if (["object", "prop", "道具"].includes(normalized)) return "object";
  if (["style", "rule", "world_rule", "restriction", "time_period", "风格", "规则"].includes(normalized)) return "style";
  if (["product", "brand", "产品", "品牌"].includes(normalized)) return "product";
  return "object";
}

export function normalizeCreativeReferenceStatus(status?: string): CreativeReferenceCardStatus {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized in creativeReferenceStatusMeta) return normalized as CreativeReferenceCardStatus;
  return "workspace";
}

export function accentForCreativeReferenceKind(kind: CreativeReferenceCardKind) {
  return accentGradientClass(creativeReferenceKindMeta[kind].tone);
}
