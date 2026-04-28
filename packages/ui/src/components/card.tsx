"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "default" | "sm";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, size = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-size={size}
        className={cn("ms-card", size === "sm" && "ms-card--sm", className)}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-card__header", className)} {...props} />;
  }
);

CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    return <h3 ref={ref} className={cn("ms-card__title", className)} {...props} />;
  }
);

CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn("ms-card__description", className)} {...props} />;
});

CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-card__content", className)} {...props} />;
  }
);

CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-card__footer", className)} {...props} />;
  }
);

CardFooter.displayName = "CardFooter";

export const CardAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-card__action", className)} {...props} />;
  }
);

CardAction.displayName = "CardAction";
