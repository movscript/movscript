import type { HTMLAttributes } from "react";

import { accentDotClass, toneDotClass, type AccentTone, type SemanticTone } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";

export interface AppMarkerDotProps extends HTMLAttributes<HTMLSpanElement> {
  accent?: AccentTone;
  tone?: SemanticTone | "brand" | "border" | "muted";
  size?: "2xs" | "xs" | "sm" | "md";
  outlined?: boolean;
}

const SEMANTIC_DOT_TONES = new Set(["neutral", "info", "success", "warning", "danger"]);

export function AppMarkerDot({
  accent,
  tone = "neutral",
  size = "sm",
  outlined = false,
  className,
  role,
  ...props
}: AppMarkerDotProps) {
  const semanticTone = !accent && SEMANTIC_DOT_TONES.has(tone) ? tone as SemanticTone : undefined;
  return (
    <span
      {...props}
      role={role}
      aria-hidden={role ? props["aria-hidden"] : props["aria-hidden"] ?? true}
      data-tone={!accent && !semanticTone ? tone : undefined}
      data-size={size}
      data-outlined={outlined ? "true" : undefined}
      className={cn(
        "app-marker-dot",
        accent ? accentDotClass(accent) : semanticTone ? toneDotClass(semanticTone) : undefined,
        className,
      )}
    />
  );
}
