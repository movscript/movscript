import { forwardRef, type ImgHTMLAttributes, type VideoHTMLAttributes } from 'react'
import { ResourceAuthImage, ResourceAuthVideo } from '@movscript/ui'

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
