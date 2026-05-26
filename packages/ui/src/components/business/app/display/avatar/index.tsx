import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Avatar, AvatarFallback, AvatarImage } from "../../../../primitives";

export interface AppAvatarProps extends HTMLAttributes<HTMLSpanElement> {
  src?: string;
  alt?: string;
  name?: string;
  fallback?: ReactNode;
  size?: "xs" | "sm" | "md" | "lg";
}

export function AppAvatar({
  src,
  alt,
  name,
  fallback,
  size = "md",
  className,
  ...props
}: AppAvatarProps) {
  const fallbackText = fallback ?? avatarFallbackText(name ?? alt);
  return (
    <Avatar data-size={size} className={cn("app-avatar", className)} {...props}>
      {src ? <AvatarImage src={src} alt={alt ?? name ?? ""} /> : null}
      <AvatarFallback>{fallbackText}</AvatarFallback>
    </Avatar>
  );
}

function avatarFallbackText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed[0]?.toUpperCase() : "?";
}
