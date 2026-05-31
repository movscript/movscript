"use client";

import { forwardRef, type AudioHTMLAttributes, type ImgHTMLAttributes, type VideoHTMLAttributes } from "react";

import { cn } from "../../../../lib/cn";
import { AppSkeleton } from "../../app";

export interface ResourceAuthImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  isLoading?: boolean;
}

export function ResourceAuthImage({
  isLoading = false,
  src,
  className,
  ...props
}: ResourceAuthImageProps) {
  if (isLoading) {
    return <AppSkeleton data-variant="block" className={cn("resource-auth-media-placeholder", className)} />;
  }
  if (!src) return null;
  return <img src={src} className={className} {...props} />;
}

export interface ResourceAuthVideoProps extends VideoHTMLAttributes<HTMLVideoElement> {
  src?: string;
}

export const ResourceAuthVideo = forwardRef<HTMLVideoElement, ResourceAuthVideoProps>(function ResourceAuthVideo({ src, ...props }, ref) {
  return <video ref={ref} src={src} {...props} />;
});

export interface ResourceAuthAudioProps extends AudioHTMLAttributes<HTMLAudioElement> {
  src?: string;
}

export function ResourceAuthAudio({ src, ...props }: ResourceAuthAudioProps) {
  return <audio src={src} {...props} />;
}
