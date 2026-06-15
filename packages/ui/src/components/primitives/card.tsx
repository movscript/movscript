"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Frame, FrameActions, FrameBody, FrameDescription, FrameFooter, FrameHeader, FrameTitle } from "./frame";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "default" | "sm";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, size = "default", ...props }, ref) => {
    return (
      <Frame
        ref={ref}
        kind="card"
        density="normal"
        emphasis="raised"
        data-size={size}
        data-ms-component="Card"
        data-ms-slot="root"
        data-ms-size={size}
        className={cn("ms-card", size === "sm" && "ms-card--sm", className)}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return <FrameHeader ref={ref} data-ms-component="Card" data-ms-slot="header" className={cn("ms-card__header", className)} {...props} />;
  }
);

CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    return <FrameTitle ref={ref} as="h3" data-ms-component="Card" data-ms-slot="title" className={cn("ms-card__title", className)} {...props} />;
  }
);

CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return <FrameDescription ref={ref} as="div" data-ms-component="Card" data-ms-slot="description" className={cn("ms-card__description", className)} {...props} />;
});

CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return <FrameBody ref={ref} data-ms-component="Card" data-ms-slot="content" className={cn("ms-card__content", className)} {...props} />;
  }
);

CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return <FrameFooter ref={ref} data-ms-component="Card" data-ms-slot="footer" className={cn("ms-card__footer", className)} {...props} />;
  }
);

CardFooter.displayName = "CardFooter";

export const CardAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <FrameActions ref={ref} data-ms-component="Card" data-ms-slot="action" className={cn("ms-card__action", className)} {...props} />;
  }
);

CardAction.displayName = "CardAction";
