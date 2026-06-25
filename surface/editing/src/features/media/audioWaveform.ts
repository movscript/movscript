import type { ElectronMediaPipelineClip } from '@movscript/editing-surface/contracts'

const audioBufferCache = new Map<string, Promise<AudioBuffer | null>>()
const MAX_AUDIO_BUFFER_CACHE_ENTRIES = 8

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

let sharedAudioContext: AudioContext | undefined

export async function extractTimelineAudioWaveform(
  src: string | undefined,
  clip: ElectronMediaPipelineClip,
  barCount: number,
): Promise<number[]> {
  if (!src || barCount <= 0 || typeof window === 'undefined') return []
  const audioBuffer = await loadAudioBuffer(src)
  if (!audioBuffer) return []
  return sampleAudioBufferWaveform(audioBuffer, clip, barCount)
}

function sampleAudioBufferWaveform(
  audioBuffer: AudioBuffer,
  clip: ElectronMediaPipelineClip,
  barCount: number,
) {
  const sourceStartSeconds = Math.max(0, (clip.sourceStartMs ?? 0) / 1000)
  const sourceEndSeconds = Math.min(
    audioBuffer.duration,
    Math.max(sourceStartSeconds, (clip.sourceEndMs ?? (clip.sourceStartMs ?? 0) + clip.durationMs) / 1000),
  )
  const startSample = Math.floor(sourceStartSeconds * audioBuffer.sampleRate)
  const endSample = Math.max(startSample + 1, Math.floor(sourceEndSeconds * audioBuffer.sampleRate))
  const channelCount = Math.max(1, audioBuffer.numberOfChannels)
  const bars: number[] = []

  for (let index = 0; index < barCount; index += 1) {
    const bucketStart = Math.floor(startSample + ((endSample - startSample) * index) / barCount)
    const bucketEnd = Math.max(bucketStart + 1, Math.floor(startSample + ((endSample - startSample) * (index + 1)) / barCount))
    const stride = Math.max(1, Math.floor((bucketEnd - bucketStart) / 240))
    let squareSum = 0
    let sampleCount = 0

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = audioBuffer.getChannelData(channel)
      for (let sample = bucketStart; sample < bucketEnd; sample += stride) {
        const value = data[sample] ?? 0
        squareSum += value * value
        sampleCount += 1
      }
    }

    bars.push(sampleCount > 0 ? Math.sqrt(squareSum / sampleCount) : 0)
  }

  const max = Math.max(...bars, 0)
  if (max <= 0) return bars
  return bars.map((value) => value / max)
}

async function loadAudioBuffer(src: string) {
  const cached = audioBufferCache.get(src)
  if (cached) return cached
  const next = decodeAudioBuffer(src)
  cacheAudioBuffer(src, next)
  return next
}

async function decodeAudioBuffer(src: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const context = audioContext()
    return await context.decodeAudioData(arrayBuffer.slice(0))
  } catch {
    return null
  }
}

function audioContext() {
  if (sharedAudioContext) return sharedAudioContext
  const AudioContextConstructor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext
  sharedAudioContext = new AudioContextConstructor()
  return sharedAudioContext
}

function cacheAudioBuffer(key: string, value: Promise<AudioBuffer | null>) {
  if (!audioBufferCache.has(key) && audioBufferCache.size >= MAX_AUDIO_BUFFER_CACHE_ENTRIES) {
    const firstKey = audioBufferCache.keys().next().value
    if (firstKey) audioBufferCache.delete(firstKey)
  }
  audioBufferCache.set(key, value)
}
