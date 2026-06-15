import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { toneTextClass } from "../../../../semantic";
import { cn } from "../../../../lib/cn";
import { Button, Input, Label, type ButtonProps, type InputProps } from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";
import { AppIconFrame } from "../display";
import { AppChoiceTile, AppSection, AppSurfaceItem } from "../surface";
import { WorkModeSwitchGuide, type WorkModeChoice } from "../work-mode";

export function OnboardingShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("onboarding-shell", className)} {...props} />;
}

export function OnboardingMain({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <main className={cn("onboarding-main", className)} {...props} />;
}

export function OnboardingHero({
  brand,
  title,
  description,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  brand: ReactNode;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div className={cn("onboarding-hero", className)} {...props}>
      <p className="onboarding-hero__brand">{brand}</p>
      <h1 className="onboarding-hero__title">{title}</h1>
      <p className="onboarding-hero__description">{description}</p>
    </div>
  );
}

export function OnboardingWorkModeSummary({
  selectedLabel,
  hint,
  activeMode,
  agentIcon,
  projectIcon,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  selectedLabel: ReactNode;
  hint: ReactNode;
  activeMode: WorkModeChoice;
  agentIcon: IconComponent;
  projectIcon: IconComponent;
}) {
  return (
    <AppSurfaceItem className={cn("onboarding-work-mode-summary", className)} {...props}>
      <div className="onboarding-work-mode-summary__content">
        <div className="onboarding-work-mode-summary__copy">
          <p className="onboarding-work-mode-summary__title">{selectedLabel}</p>
          <p className="onboarding-work-mode-summary__hint">{hint}</p>
        </div>
        <WorkModeSwitchGuide activeMode={activeMode} agentIcon={agentIcon} projectIcon={projectIcon} />
      </div>
    </AppSurfaceItem>
  );
}

export function OnboardingLaunchGrid({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("onboarding-launch-grid", className)} {...props} />;
}

export const OnboardingLaunchTile = forwardRef<HTMLButtonElement, ButtonProps & {
  icon: IconComponent;
  title: ReactNode;
  description: ReactNode;
  action: ReactNode;
}>(({ icon: Icon, title, description, action, className, ...props }, ref) => (
  <AppChoiceTile ref={ref} className={cn("onboarding-launch-tile", className)} {...props}>
    <AppIconFrame size="lg" className="onboarding-launch-tile__icon">
      <Icon size={18} />
    </AppIconFrame>
    <h2 className="onboarding-launch-tile__title">{title}</h2>
    <p className="onboarding-launch-tile__description">{description}</p>
    <span className="onboarding-launch-tile__action">{action}</span>
  </AppChoiceTile>
));

OnboardingLaunchTile.displayName = "OnboardingLaunchTile";

export function OnboardingFormSection({
  className,
  ...props
}: Parameters<typeof AppSection>[0]) {
  return <AppSection className={cn("onboarding-form-section", className)} {...props} />;
}

export function OnboardingFormField({
  label,
  htmlFor,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("onboarding-form-field", className)} {...props}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export const OnboardingFormInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("onboarding-form-input", className)} {...props} />
  )
);

OnboardingFormInput.displayName = "OnboardingFormInput";

export function OnboardingFieldError({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("onboarding-field-error", toneTextClass("danger"), className)} {...props} />;
}

export function OnboardingFormActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("onboarding-form-actions", className)} {...props} />;
}

export const OnboardingActionButton = forwardRef<HTMLButtonElement, ButtonProps & {
  loadingIcon?: ReactNode;
}>(({ loadingIcon, children, className, ...props }, ref) => (
  <Button ref={ref} className={cn("onboarding-action-button", className)} {...props}>
    {loadingIcon ? <span className="onboarding-action-button__loading">{loadingIcon}</span> : null}
    {children}
  </Button>
));

OnboardingActionButton.displayName = "OnboardingActionButton";
