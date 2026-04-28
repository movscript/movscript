export const colorTokens = {
  background: "--ms-color-background",
  foreground: "--ms-color-foreground",
  surface: "--ms-color-surface",
  surfaceRaised: "--ms-color-surface-raised",
  border: "--ms-color-border",
  muted: "--ms-color-muted",
  mutedForeground: "--ms-color-muted-foreground",
  primary: "--ms-color-primary",
  primaryForeground: "--ms-color-primary-foreground",
  accent: "--ms-color-accent",
  accentForeground: "--ms-color-accent-foreground",
  danger: "--ms-color-danger",
  dangerForeground: "--ms-color-danger-foreground",
  success: "--ms-color-success",
  successForeground: "--ms-color-success-foreground",
  warning: "--ms-color-warning",
  warningForeground: "--ms-color-warning-foreground",
  focus: "--ms-color-focus"
} as const;

export const radiusTokens = {
  xs: "--ms-radius-xs",
  sm: "--ms-radius-sm",
  md: "--ms-radius-md",
  lg: "--ms-radius-lg",
  full: "--ms-radius-full"
} as const;

export const shadowTokens = {
  sm: "--ms-shadow-sm",
  md: "--ms-shadow-md",
  lg: "--ms-shadow-lg"
} as const;

export const typographyTokens = {
  fontSans: "--ms-font-sans",
  fontMono: "--ms-font-mono"
} as const;

export const motionTokens = {
  durationFast: "--ms-duration-fast",
  durationNormal: "--ms-duration-normal",
  easingStandard: "--ms-easing-standard"
} as const;

export const tokens = {
  color: colorTokens,
  radius: radiusTokens,
  shadow: shadowTokens,
  typography: typographyTokens,
  motion: motionTokens
} as const;

export type MovScriptTokenGroup = keyof typeof tokens;
export type MovScriptTokens = typeof tokens;

