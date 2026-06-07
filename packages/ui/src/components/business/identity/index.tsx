"use client";

import * as React from "react";

import { cn } from "../../../lib/cn";
import {
  fallbackIdentityAsset,
  resolveIdentityAsset,
  type IdentityAsset,
  type IdentityBadgeVariant,
  type IdentityKind,
  type IdentitySize,
} from "./registry";

export {
  agentIdentityRegistry,
  fallbackIdentityAsset,
  modelIdentityRegistry,
  resolveIdentityAsset,
  type IdentityAsset,
  type IdentityBadgeVariant,
  type IdentityKind,
  type IdentitySize,
} from "./registry";

export interface IdentityBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "id"> {
  kind: IdentityKind;
  id?: string | null;
  label?: string;
  detail?: string;
  size?: IdentitySize;
  variant?: IdentityBadgeVariant;
  showLabel?: boolean;
}

export function IdentityBadge({
  kind,
  id,
  label,
  detail,
  size = "sm",
  variant = "label",
  showLabel,
  className,
  style,
  ...props
}: IdentityBadgeProps) {
  const asset = resolveIdentityAsset(kind, id ?? label);
  const displayLabel = label?.trim() || asset.label;
  const title = detail?.trim()
    ? `${displayLabel} - ${detail.trim()}`
    : asset.description
      ? `${displayLabel} - ${asset.description}`
      : displayLabel;
  const shouldShowLabel = showLabel ?? variant !== "compact";

  return (
    <span
      className={cn("ms-identity-badge", `ms-identity-badge--${size}`, `ms-identity-badge--${variant}`, className)}
      data-identity-kind={kind}
      data-identity-id={asset.id}
      title={title}
      style={{
        "--ms-identity-color": asset.color,
        "--ms-identity-background": asset.background,
        "--ms-identity-border": asset.border,
        ...style,
      } as React.CSSProperties}
      {...props}
    >
      <IdentityMark asset={asset} kind={kind} />
      {shouldShowLabel ? (
        <span className="ms-identity-badge__copy">
          <span className="ms-identity-badge__label">{variant === "stack" ? displayLabel : asset.shortLabel}</span>
          {variant === "stack" && detail ? <span className="ms-identity-badge__detail">{detail}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

export interface IdentityMarkProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "id"> {
  kind: IdentityKind;
  id?: string | null;
  asset?: IdentityAsset;
}

export function IdentityMark({ kind, id, asset: assetProp, className, style, ...props }: IdentityMarkProps) {
  const asset = assetProp ?? resolveIdentityAsset(kind, id);
  const fallbackAsset = fallbackIdentityAsset[kind];

  return (
    <span
      className={cn("ms-identity-mark", className)}
      data-identity-kind={kind}
      data-identity-id={asset.id}
      style={{
        "--ms-identity-color": asset.color,
        "--ms-identity-background": asset.background,
        "--ms-identity-border": asset.border,
        ...style,
      } as React.CSSProperties}
      {...props}
    >
      <img className="ms-identity-mark__image" src={asset.assetPath} alt="" aria-hidden="true" onError={(event) => {
        if (event.currentTarget.src.endsWith(fallbackAsset.assetPath)) return;
        event.currentTarget.src = fallbackAsset.assetPath;
      }} />
      <span className="ms-identity-mark__fallback" aria-hidden="true">{asset.shortLabel}</span>
    </span>
  );
}

export function AgentIdentityBadge(props: Omit<IdentityBadgeProps, "kind">) {
  return <IdentityBadge kind="agent" {...props} />;
}

export function ModelIdentityBadge(props: Omit<IdentityBadgeProps, "kind">) {
  return <IdentityBadge kind="model" {...props} />;
}
