"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Surface, type SurfaceProps } from "./surface";

export type FrameProps = SurfaceProps;

export const Frame = React.forwardRef<HTMLElement, FrameProps>(
  ({ className, ...props }, ref) => {
    return <Surface ref={ref} className={cn(className)} {...props} />;
  },
);

Frame.displayName = "Frame";

export const FrameHeader = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }>(
  ({ as: Component = "div", className, ...props }, ref) => {
    return <Component ref={ref} className={cn("ms-stack ms-frame__header", className)} {...props} />;
  },
);

FrameHeader.displayName = "FrameHeader";

export const FrameHeading = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-frame__heading", className)} {...props} />;
  },
);

FrameHeading.displayName = "FrameHeading";

export const FrameTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "h3" | "h4" }>(
  ({ as: Component = "h2", className, ...props }, ref) => {
    return <Component ref={ref} className={cn("ms-frame__title", className)} {...props} />;
  },
);

FrameTitle.displayName = "FrameTitle";

export const FrameDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement> & { as?: "p" | "div" }>(
  ({ as: Component = "p", className, ...props }, ref) => {
    return <Component ref={ref} className={cn("ms-frame__description", className)} {...props} />;
  },
);

FrameDescription.displayName = "FrameDescription";

export const FrameBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-frame__body", className)} {...props} />;
  },
);

FrameBody.displayName = "FrameBody";

export const FrameActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row", className)} {...props} />;
  },
);

FrameActions.displayName = "FrameActions";

export const FrameFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row", className)} {...props} />;
  },
);

FrameFooter.displayName = "FrameFooter";
