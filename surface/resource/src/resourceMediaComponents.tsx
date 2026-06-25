import React, { forwardRef, type AudioHTMLAttributes, type ImgHTMLAttributes, type VideoHTMLAttributes } from 'react'
import { ResourceAuthAudio, ResourceAuthImage, ResourceAuthVideo } from '@movscript/ui/business/resource'
import type { RawResource } from '@movscript/shared'
import { AuthedAudio, AuthedImage, AuthedVideo } from './resourceAuthMedia.js'
import { HlsVideo, isHlsSource } from './resourceHlsVideo.js'
import {
  resolveResourceFileImageUrl,
  resolveResourceFileUrl,
  resolveResourceUrl,
} from './resourceMediaBrowser.js'

export type UrlImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src?: string
}

export function UrlImage({ src, ...props }: UrlImageProps) {
  return <ResourceAuthImage src={src} {...props} />
}

export type UrlVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'resource'> & {
  src?: string
}

export const UrlVideo = forwardRef<HTMLVideoElement, UrlVideoProps>(function UrlVideo({ src, ...props }, ref) {
  return <ResourceAuthVideo videoRef={ref} src={src} {...props} />
})

export function UrlMediaPreview({
  src,
  type,
  alt = '',
  poster,
  imageProps,
  videoProps,
}: {
  src?: string
  type: string
  alt?: string
  poster?: string
  imageProps?: Omit<UrlImageProps, 'src' | 'alt'>
  videoProps?: Omit<UrlVideoProps, 'src' | 'poster' | 'controls' | 'playsInline' | 'resource'>
}) {
  if (!src) return null
  if (type === 'video') return <UrlVideo src={src} poster={poster} {...videoProps} controls playsInline />
  return <UrlImage src={src} alt={alt} {...imageProps} />
}

export type ResourceFileImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'resource'> & {
  resourceId?: number | string | null
  resourceUrl?: string | null
  diagnosticLabel?: string
  thumbnailMaxSize?: number
}

export function ResourceFileImage({
  resourceId,
  resourceUrl,
  diagnosticLabel: _diagnosticLabel,
  thumbnailMaxSize: _thumbnailMaxSize,
  ...props
}: ResourceFileImageProps) {
  return <ResourceAuthImage src={resolveResourceFileImageUrl(resourceId, resourceUrl)} {...props} />
}

export type ResourceFileVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'resource'> & {
  resourceId?: number | string | null
  resourceUrl?: string | null
  diagnosticLabel?: string
}

export const ResourceFileVideo = forwardRef<HTMLVideoElement, ResourceFileVideoProps>(function ResourceFileVideo(
  { resourceId, resourceUrl, diagnosticLabel: _diagnosticLabel, ...props },
  ref,
) {
  return <ResourceAuthVideo videoRef={ref} src={resolveResourceFileUrl(resourceId, resourceUrl)} {...props} />
})

export type ResourceFileAudioProps = Omit<AudioHTMLAttributes<HTMLAudioElement>, 'src' | 'resource'> & {
  resourceId?: number | string | null
  resourceUrl?: string | null
}

export function ResourceFileAudio({ resourceId, resourceUrl, ...props }: ResourceFileAudioProps) {
  return <ResourceAuthAudio src={resolveResourceFileUrl(resourceId, resourceUrl)} {...props} />
}

export type ResourceImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'resource'> & {
  resource: RawResource
  diagnosticLabel?: string
  thumbnailMaxSize?: number
}

export function ResourceImage({ resource, ...props }: ResourceImageProps) {
  return <AuthedImage src={resolveResourceUrl(resource)} {...props} />
}

export type ResourceVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'resource'> & {
  resource: RawResource
  diagnosticLabel?: string
}

export const ResourceVideo = forwardRef<HTMLVideoElement, ResourceVideoProps>(function ResourceVideo(
  { resource, ...props },
  ref,
) {
  const src = resolveResourceUrl(resource)
  if (isHlsResource(resource, src)) return <HlsVideo ref={ref} src={src} {...props} />
  return <AuthedVideo ref={ref} src={src} {...props} />
})

export function isHlsResource(resource: Pick<RawResource, 'mime_type' | 'url'>, src = resource.url): boolean {
  const mimeType = resource.mime_type.toLowerCase()
  return mimeType === 'application/vnd.apple.mpegurl'
    || mimeType === 'application/x-mpegurl'
    || isHlsSource(src)
}

export type ResourceAudioProps = Omit<AudioHTMLAttributes<HTMLAudioElement>, 'src' | 'resource'> & {
  resource: RawResource
}

export function ResourceAudio({ resource, ...props }: ResourceAudioProps) {
  return <AuthedAudio src={resolveResourceUrl(resource)} {...props} />
}
