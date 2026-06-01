"use client";

import type { AudioHTMLAttributes, ImgHTMLAttributes, Ref, VideoHTMLAttributes } from "react";

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
  videoRef?: Ref<HTMLVideoElement>;
}

export function ResourceAuthVideo({ src, videoRef, ...props }: ResourceAuthVideoProps) {
  return <video ref={videoRef} src={src} {...props} />;
}

export interface ResourceAuthAudioProps extends AudioHTMLAttributes<HTMLAudioElement> {
  src?: string;
}

export function ResourceAuthAudio({ src, ...props }: ResourceAuthAudioProps) {
  return <audio src={src} {...props} />;
}
