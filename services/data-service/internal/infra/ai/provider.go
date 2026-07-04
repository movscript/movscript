package ai

import providercontract "github.com/movscript/movscript/internal/providers/contract"

const DefaultTextMaxTokens = 200000

type TextRequest = providercontract.TextRequest
type Message = providercontract.Message
type MessageContentPart = providercontract.MessageContentPart
type TextResponse = providercontract.TextResponse
type ResponsesRequest = providercontract.ResponsesRequest
type ToolCall = providercontract.ToolCall
type ToolCallDelta = providercontract.ToolCallDelta
type ToolFunction = providercontract.ToolFunction
type TextStreamEvent = providercontract.TextStreamEvent
type ResponsesStreamEvent = providercontract.ResponsesStreamEvent
type TokenUsage = providercontract.TokenUsage
type ImageRequest = providercontract.ImageRequest
type ImageResponse = providercontract.ImageResponse
type VideoRequest = providercontract.VideoRequest
type ReferenceAsset = providercontract.ReferenceAsset
type MediaData = providercontract.MediaData
type VideoResponse = providercontract.VideoResponse
type VideoPollRequest = providercontract.VideoPollRequest
type VideoCancelRequest = providercontract.VideoCancelRequest
type EmbeddingRequest = providercontract.EmbeddingRequest
type EmbeddingVector = providercontract.EmbeddingVector
type EmbeddingResponse = providercontract.EmbeddingResponse
type RerankDocument = providercontract.RerankDocument
type RerankRequest = providercontract.RerankRequest
type RerankResult = providercontract.RerankResult
type RerankResponse = providercontract.RerankResponse
type ModerationRequest = providercontract.ModerationRequest
type ModerationResult = providercontract.ModerationResult
type ModerationResponse = providercontract.ModerationResponse
type RealtimeEvent = providercontract.RealtimeEvent
type RealtimeSessionRequest = providercontract.RealtimeSessionRequest
type RealtimeSession = providercontract.RealtimeSession
type RealtimeExchangeRequest = providercontract.RealtimeExchangeRequest
type RealtimeExchangeResponse = providercontract.RealtimeExchangeResponse
type DebugHTTPExchange = providercontract.DebugHTTPExchange
type DebugCallResult = providercontract.DebugCallResult
type DebugRouteTrace = providercontract.DebugRouteTrace
type DebugPromptMessage = providercontract.DebugPromptMessage
type ResourceDiagnostic = providercontract.ResourceDiagnostic
type ResourceAccessTrace = providercontract.ResourceAccessTrace

const (
	VideoStatusSubmitted  = providercontract.VideoStatusSubmitted
	VideoStatusQueued     = providercontract.VideoStatusQueued
	VideoStatusProcessing = providercontract.VideoStatusProcessing
	VideoStatusSucceeded  = providercontract.VideoStatusSucceeded
	VideoStatusFailed     = providercontract.VideoStatusFailed
	VideoStatusCancelled  = providercontract.VideoStatusCancelled
)

type Provider = providercontract.AIGatewayProvider
type TextStreamProvider = providercontract.AIGatewayTextStreamProvider
type ResponsesProvider = providercontract.AIGatewayResponsesProvider
type ResponsesStreamProvider = providercontract.AIGatewayResponsesStreamProvider
type VideoTaskProvider = providercontract.AIGatewayVideoTaskProvider
type VideoTaskCancelProvider = providercontract.AIGatewayVideoTaskCancelProvider
type EmbeddingProvider = providercontract.AIGatewayEmbeddingProvider
type RerankProvider = providercontract.AIGatewayRerankProvider
type ModerationProvider = providercontract.AIGatewayModerationProvider
type RealtimeProvider = providercontract.AIGatewayRealtimeProvider
type AudioSpeechProvider = providercontract.AIGatewayAudioSpeechProvider
type AudioSubtitleProvider = providercontract.AIGatewayAudioSubtitleProvider
