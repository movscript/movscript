export type SemanticTone = "neutral" | "info" | "success" | "warning" | "danger";
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
  | "indigo";

const TONE_TEXT_CLASSES: Record<SemanticTone, string> = {
  neutral: "ms-tone-text ms-tone-text--neutral",
  info: "ms-tone-text ms-tone-text--info",
  success: "ms-tone-text ms-tone-text--success",
  warning: "ms-tone-text ms-tone-text--warning",
  danger: "ms-tone-text ms-tone-text--danger",
};

const TONE_SURFACE_CLASSES: Record<SemanticTone, string> = {
  neutral: "ms-tone-surface ms-tone-surface--neutral",
  info: "ms-tone-surface ms-tone-surface--info",
  success: "ms-tone-surface ms-tone-surface--success",
  warning: "ms-tone-surface ms-tone-surface--warning",
  danger: "ms-tone-surface ms-tone-surface--danger",
};

const TONE_DOT_CLASSES: Record<SemanticTone, string> = {
  neutral: "ms-tone-dot ms-tone-dot--neutral",
  info: "ms-tone-dot ms-tone-dot--info",
  success: "ms-tone-dot ms-tone-dot--success",
  warning: "ms-tone-dot ms-tone-dot--warning",
  danger: "ms-tone-dot ms-tone-dot--danger",
};

function joinToneClass(baseClass: string, extraClassName?: string) {
  return extraClassName ? `${baseClass} ${extraClassName}` : baseClass;
}

export function toneTextClass(tone: SemanticTone, extraClassName?: string) {
  return joinToneClass(TONE_TEXT_CLASSES[tone], extraClassName);
}

export function toneSurfaceClass(tone: SemanticTone, extraClassName?: string) {
  return joinToneClass(TONE_SURFACE_CLASSES[tone], extraClassName);
}

export function toneDotClass(tone: SemanticTone, extraClassName?: string) {
  return joinToneClass(TONE_DOT_CLASSES[tone], extraClassName);
}

export function accentTextClass(tone: AccentTone, extraClassName?: string) {
  return joinToneClass(`ms-accent-text ms-accent-text--${tone}`, extraClassName);
}

export function accentSurfaceClass(tone: AccentTone, extraClassName?: string) {
  return joinToneClass(`ms-accent-surface ms-accent-surface--${tone}`, extraClassName);
}

export function accentSoftClass(tone: AccentTone, extraClassName?: string) {
  return joinToneClass(`ms-accent-soft ms-accent-soft--${tone}`, extraClassName);
}

export function accentBadgeClass(tone: AccentTone, extraClassName?: string) {
  return joinToneClass(`ms-accent-badge ms-accent-badge--${tone}`, extraClassName);
}

export function accentDotClass(tone: AccentTone, extraClassName?: string) {
  return joinToneClass(`ms-accent-dot ms-accent-dot--${tone}`, extraClassName);
}

export function accentGradientClass(tone: AccentTone, extraClassName?: string) {
  return joinToneClass(`ms-accent-gradient ms-accent-gradient--${tone}`, extraClassName);
}

export function accentPortClass(tone: AccentTone, extraClassName?: string) {
  return joinToneClass(`ms-accent-port ms-accent-port--${tone}`, extraClassName);
}
