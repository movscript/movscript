import type { ReactNode } from "react";

import { Badge } from "./badge";
import { cn } from "../lib/cn";

export type SemanticTone = "neutral" | "info" | "success" | "warning" | "danger";
export type SemanticTonePart = "badge" | "dot" | "icon" | "surface";
export type AccentTone =
  | "neutral"
  | "sky"
  | "cyan"
  | "blue"
  | "teal"
  | "emerald"
  | "lime"
  | "amber"
  | "orange"
  | "rose"
  | "violet"
  | "indigo"
  | "zinc";
export type AccentTonePart = "badge" | "dot" | "gradient" | "icon" | "port" | "soft" | "surface";

const TONE_CLASSES: Record<SemanticTone, Record<SemanticTonePart, string>> = {
  neutral: {
    badge: "ms-semantic-badge ms-semantic-badge--neutral",
    dot: "ms-semantic-dot ms-semantic-dot--neutral",
    icon: "ms-semantic-icon ms-semantic-icon--neutral",
    surface: "ms-semantic-surface ms-semantic-surface--neutral",
  },
  info: {
    badge: "ms-semantic-badge ms-semantic-badge--info",
    dot: "ms-semantic-dot ms-semantic-dot--info",
    icon: "ms-semantic-icon ms-semantic-icon--info",
    surface: "ms-semantic-surface ms-semantic-surface--info",
  },
  success: {
    badge: "ms-semantic-badge ms-semantic-badge--success",
    dot: "ms-semantic-dot ms-semantic-dot--success",
    icon: "ms-semantic-icon ms-semantic-icon--success",
    surface: "ms-semantic-surface ms-semantic-surface--success",
  },
  warning: {
    badge: "ms-semantic-badge ms-semantic-badge--warning",
    dot: "ms-semantic-dot ms-semantic-dot--warning",
    icon: "ms-semantic-icon ms-semantic-icon--warning",
    surface: "ms-semantic-surface ms-semantic-surface--warning",
  },
  danger: {
    badge: "ms-semantic-badge ms-semantic-badge--danger",
    dot: "ms-semantic-dot ms-semantic-dot--danger",
    icon: "ms-semantic-icon ms-semantic-icon--danger",
    surface: "ms-semantic-surface ms-semantic-surface--danger",
  },
};

const ACCENT_TONE_CLASSES: Record<AccentTone, Record<Exclude<AccentTonePart, "port">, string>> = {
  neutral: {
    badge: "ms-accent-badge ms-accent-badge--neutral",
    dot: "ms-accent-dot ms-accent-dot--neutral",
    gradient: "ms-accent-gradient ms-accent-gradient--neutral",
    icon: "ms-accent-icon ms-accent-icon--neutral",
    soft: "ms-accent-soft ms-accent-soft--neutral",
    surface: "ms-accent-surface ms-accent-surface--neutral",
  },
  sky: {
    badge: "ms-accent-badge ms-accent-badge--sky",
    dot: "ms-accent-dot ms-accent-dot--sky",
    gradient: "ms-accent-gradient ms-accent-gradient--sky",
    icon: "ms-accent-icon ms-accent-icon--sky",
    soft: "ms-accent-soft ms-accent-soft--sky",
    surface: "ms-accent-surface ms-accent-surface--sky",
  },
  cyan: {
    badge: "ms-accent-badge ms-accent-badge--cyan",
    dot: "ms-accent-dot ms-accent-dot--cyan",
    gradient: "ms-accent-gradient ms-accent-gradient--cyan",
    icon: "ms-accent-icon ms-accent-icon--cyan",
    soft: "ms-accent-soft ms-accent-soft--cyan",
    surface: "ms-accent-surface ms-accent-surface--cyan",
  },
  blue: {
    badge: "ms-accent-badge ms-accent-badge--blue",
    dot: "ms-accent-dot ms-accent-dot--blue",
    gradient: "ms-accent-gradient ms-accent-gradient--blue",
    icon: "ms-accent-icon ms-accent-icon--blue",
    soft: "ms-accent-soft ms-accent-soft--blue",
    surface: "ms-accent-surface ms-accent-surface--blue",
  },
  teal: {
    badge: "ms-accent-badge ms-accent-badge--teal",
    dot: "ms-accent-dot ms-accent-dot--teal",
    gradient: "ms-accent-gradient ms-accent-gradient--teal",
    icon: "ms-accent-icon ms-accent-icon--teal",
    soft: "ms-accent-soft ms-accent-soft--teal",
    surface: "ms-accent-surface ms-accent-surface--teal",
  },
  emerald: {
    badge: "ms-accent-badge ms-accent-badge--emerald",
    dot: "ms-accent-dot ms-accent-dot--emerald",
    gradient: "ms-accent-gradient ms-accent-gradient--emerald",
    icon: "ms-accent-icon ms-accent-icon--emerald",
    soft: "ms-accent-soft ms-accent-soft--emerald",
    surface: "ms-accent-surface ms-accent-surface--emerald",
  },
  lime: {
    badge: "ms-accent-badge ms-accent-badge--lime",
    dot: "ms-accent-dot ms-accent-dot--lime",
    gradient: "ms-accent-gradient ms-accent-gradient--lime",
    icon: "ms-accent-icon ms-accent-icon--lime",
    soft: "ms-accent-soft ms-accent-soft--lime",
    surface: "ms-accent-surface ms-accent-surface--lime",
  },
  amber: {
    badge: "ms-accent-badge ms-accent-badge--amber",
    dot: "ms-accent-dot ms-accent-dot--amber",
    gradient: "ms-accent-gradient ms-accent-gradient--amber",
    icon: "ms-accent-icon ms-accent-icon--amber",
    soft: "ms-accent-soft ms-accent-soft--amber",
    surface: "ms-accent-surface ms-accent-surface--amber",
  },
  orange: {
    badge: "ms-accent-badge ms-accent-badge--orange",
    dot: "ms-accent-dot ms-accent-dot--orange",
    gradient: "ms-accent-gradient ms-accent-gradient--orange",
    icon: "ms-accent-icon ms-accent-icon--orange",
    soft: "ms-accent-soft ms-accent-soft--orange",
    surface: "ms-accent-surface ms-accent-surface--orange",
  },
  rose: {
    badge: "ms-accent-badge ms-accent-badge--rose",
    dot: "ms-accent-dot ms-accent-dot--rose",
    gradient: "ms-accent-gradient ms-accent-gradient--rose",
    icon: "ms-accent-icon ms-accent-icon--rose",
    soft: "ms-accent-soft ms-accent-soft--rose",
    surface: "ms-accent-surface ms-accent-surface--rose",
  },
  violet: {
    badge: "ms-accent-badge ms-accent-badge--violet",
    dot: "ms-accent-dot ms-accent-dot--violet",
    gradient: "ms-accent-gradient ms-accent-gradient--violet",
    icon: "ms-accent-icon ms-accent-icon--violet",
    soft: "ms-accent-soft ms-accent-soft--violet",
    surface: "ms-accent-surface ms-accent-surface--violet",
  },
  indigo: {
    badge: "ms-accent-badge ms-accent-badge--indigo",
    dot: "ms-accent-dot ms-accent-dot--indigo",
    gradient: "ms-accent-gradient ms-accent-gradient--indigo",
    icon: "ms-accent-icon ms-accent-icon--indigo",
    soft: "ms-accent-soft ms-accent-soft--indigo",
    surface: "ms-accent-surface ms-accent-surface--indigo",
  },
  zinc: {
    badge: "ms-accent-badge ms-accent-badge--zinc",
    dot: "ms-accent-dot ms-accent-dot--zinc",
    gradient: "ms-accent-gradient ms-accent-gradient--zinc",
    icon: "ms-accent-icon ms-accent-icon--zinc",
    soft: "ms-accent-soft ms-accent-soft--zinc",
    surface: "ms-accent-surface ms-accent-surface--zinc",
  },
};

const STATUS_TONES: Record<string, SemanticTone> = {
  accepted: "success",
  active: "success",
  approved: "success",
  attached: "success",
  answered: "success",
  completed: "success",
  confirmed: "success",
  delivered: "success",
  done: "success",
  locked: "success",
  selected: "success",
  succeeded: "success",
  candidate: "info",
  corrected: "info",
  exported: "info",
  generated: "info",
  in_production: "info",
  in_progress: "info",
  previewing: "info",
  producing: "info",
  running: "info",
  abandoned: "neutral",
  draft: "neutral",
  ignored: "neutral",
  merged: "neutral",
  planning: "neutral",
  queued: "neutral",
  removed: "neutral",
  skipped: "neutral",
  asset_prep: "warning",
  checking: "warning",
  completed_with_warnings: "warning",
  materializing: "warning",
  missing: "warning",
  pending: "warning",
  review: "warning",
  reviewing: "warning",
  requires_action: "warning",
  waiting: "warning",
  blocked: "danger",
  cancelled: "danger",
  failed: "danger",
  rejected: "danger",
};

const STATUS_LABELS: Record<string, string> = {
  accepted: "已采纳",
  active: "进行中",
  approved: "通过",
  asset_prep: "素材准备",
  attached: "已关联",
  answered: "已回答",
  blocked: "阻塞",
  cancelled: "已取消",
  candidate: "候选",
  completed: "已完成",
  completed_with_warnings: "有警告",
  confirmed: "已确认",
  corrected: "已修正",
  delivered: "已成片",
  done: "已完成",
  draft: "草稿",
  exported: "已导出",
  failed: "失败",
  generated: "已生成",
  ignored: "忽略",
  abandoned: "已废弃",
  in_production: "生产中",
  in_progress: "进行中",
  locked: "已锁定",
  materializing: "资料推演",
  merged: "已合并",
  removed: "已移除",
  missing: "缺失",
  pending: "待处理",
  planning: "筹备中",
  previewing: "预览中",
  producing: "制作中",
  queued: "排队中",
  rejected: "拒绝",
  requires_action: "需要操作",
  review: "待审",
  reviewing: "审片中",
  running: "运行中",
  selected: "已选择",
  skipped: "已跳过",
  succeeded: "成功",
  waiting: "待处理",
  checking: "检查中",
};

export function semanticToneForStatus(status?: string | null): SemanticTone {
  if (!status) return "neutral";
  return STATUS_TONES[status] ?? "neutral";
}

export function semanticStatusLabel(status?: string | null): string {
  if (!status) return "未知";
  return STATUS_LABELS[status] ?? status;
}

export function semanticToneClass(tone: SemanticTone, part: SemanticTonePart) {
  return TONE_CLASSES[tone][part];
}

export function semanticStatusClass(status: string | undefined | null, part: SemanticTonePart, className?: string) {
  return cn(semanticToneClass(semanticToneForStatus(status), part), className);
}

export function accentToneClass(tone: AccentTone, part: AccentTonePart, className?: string) {
  if (part === "port") {
    return cn("ms-accent-port", `ms-accent-port--${tone}`, className);
  }
  return cn(ACCENT_TONE_CLASSES[tone][part], className);
}

export function SemanticStatusBadge({
  status,
  label,
  tone,
  icon,
  className,
}: {
  status?: string | null;
  label?: ReactNode;
  tone?: SemanticTone;
  icon?: ReactNode;
  className?: string;
}) {
  const badgeClass = tone ? semanticToneClass(tone, "badge") : semanticStatusClass(status, "badge");
  return (
    <Badge variant="outline" className={cn("ms-semantic-status-badge", badgeClass, className)}>
      {icon ? <span className="ms-semantic-status-badge__icon">{icon}</span> : null}
      {label ?? semanticStatusLabel(status)}
    </Badge>
  );
}

export function SemanticDot({ status, tone, className }: { status?: string | null; tone?: SemanticTone; className?: string }) {
  const dotClass = tone ? semanticToneClass(tone, "dot") : semanticStatusClass(status, "dot");
  return <span className={cn("ms-semantic-status-dot", dotClass, className)} />;
}
