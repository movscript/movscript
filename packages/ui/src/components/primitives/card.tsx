"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Surface } from "./surface";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "default" | "sm";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, size = "default", ...props }, ref) => {
    return (
      <Surface
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
    return <div ref={ref} data-ms-component="Card" data-ms-slot="header" className={cn("ms-stack ms-frame__header ms-card__header", className)} {...props} />;
  }
);

CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    return <h3 ref={ref} data-ms-component="Card" data-ms-slot="title" className={cn("ms-frame__title ms-card__title", className)} {...props} />;
  }
);

CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return <div ref={ref} data-ms-component="Card" data-ms-slot="description" className={cn("ms-frame__description ms-card__description", className)} {...props} />;
});

CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} data-ms-component="Card" data-ms-slot="content" className={cn("ms-frame__body ms-card__content", className)} {...props} />;
  }
);

CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} data-ms-component="Card" data-ms-slot="footer" className={cn("ms-action-row ms-card__footer", className)} {...props} />;
  }
);

CardFooter.displayName = "CardFooter";

export const CardAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} data-ms-component="Card" data-ms-slot="action" className={cn("ms-card__action", className)} {...props} />;
  }
);

CardAction.displayName = "CardAction";
