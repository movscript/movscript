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
type MediaData = providercontract.MediaData
type VideoResponse = providercontract.VideoResponse
type VideoPollRequest = providercontract.VideoPollRequest
type VideoCancelRequest = providercontract.VideoCancelRequest
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
type AudioSpeechProvider = providercontract.AIGatewayAudioSpeechProvider
type AudioSubtitleProvider = providercontract.AIGatewayAudioSubtitleProvider
