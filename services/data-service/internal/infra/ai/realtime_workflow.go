package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"
)

const (
	defaultRealtimeMaxEvents     = 256
	defaultRealtimeMaxAudioBytes = 25 * 1024 * 1024
)

func (s *AIService) RunRealtimeExchangeWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req RealtimeExchangeRequest, usage UsageContext) (RealtimeExchangeResponse, error) {
	usage = usageWithRoute(usage, route)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilityFamilyRealtime)
	if err != nil {
		return RealtimeExchangeResponse{}, err
	}
	if !handled {
		return RealtimeExchangeResponse{}, fmt.Errorf("catalog route is required for realtime")
	}
	provider, ok := runtime.provider.(RealtimeProvider)
	if !ok {
		return RealtimeExchangeResponse{}, fmt.Errorf("catalog entry id=%d does not support realtime", route.CatalogEntryID)
	}
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	attemptReq.Model = route.ProviderModelID
	attemptReq.ProtocolProfile = strings.TrimSpace(route.ProtocolProfile)
	estimatedInputTokens := estimateRealtimeInputTokens(attemptReq)
	if usage.ReservationID == nil {
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilityFamilyRealtime, estimatedInputTokens, 0, 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return RealtimeExchangeResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	start := time.Now()
	resp, err := runRealtimeExchange(ctx, provider, attemptReq)
	finishAttempt(err)
	logResp := TextResponse{Content: resp.Text, Usage: resp.Usage, Debug: resp.Debug}
	s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
		UserID:         userID,
		Usage:          usage,
		RuntimeModelID: route.RuntimeModelID,
		CredentialID:   route.CredentialID,
		Provider:       runtime.adapterType,
		OperationType:  CapabilityFamilyRealtime,
		RequestModel:   attemptReq.Model,
		ResponseModel:  attemptReq.Model,
		RequestPayload: attemptReq,
		Response:       &logResp,
		Start:          start,
		Err:            err,
	})
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return resp, err
	}
	usageDetails := resp.Usage
	if usageDetails.InputTokens <= 0 && usageDetails.OutputTokens <= 0 && usageDetails.CachedInputTokens <= 0 && usageDetails.ReasoningTokens <= 0 {
		usageDetails.InputTokens = estimatedInputTokens
	}
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimateUsageDetails(runtime.model.usageProfile(), runtime.def, CapabilityFamilyRealtime, usageDetails, 0, 1), usage); err != nil {
		return RealtimeExchangeResponse{}, err
	}
	return resp, nil
}

func runRealtimeExchange(ctx context.Context, provider RealtimeProvider, req RealtimeExchangeRequest) (RealtimeExchangeResponse, error) {
	session, err := provider.ConnectRealtime(ctx, RealtimeSessionRequest{
		Model:           req.Model,
		ProtocolProfile: req.ProtocolProfile,
		Query:           req.Query,
		Headers:         req.Headers,
	})
	if err != nil {
		return RealtimeExchangeResponse{Debug: takeDebug(ctx)}, err
	}
	defer func() {
		_ = session.Close()
	}()
	for _, event := range req.InitialEvents {
		if err := session.SendEvent(ctx, event); err != nil {
			return RealtimeExchangeResponse{Debug: takeDebug(ctx)}, fmt.Errorf("send realtime event: %w", err)
		}
	}
	maxEvents := req.MaxEvents
	if maxEvents <= 0 {
		maxEvents = defaultRealtimeMaxEvents
	}
	maxAudioBytes := req.MaxAudioBytes
	if maxAudioBytes <= 0 {
		maxAudioBytes = defaultRealtimeMaxAudioBytes
	}
	stopTypes := realtimeEventTypeSet(req.StopEventTypes, []string{
		"response.done",
		"response.completed",
		"response.text.done",
		"response.audio.done",
		"conversation.item.completed",
		"session.closed",
	})
	errorTypes := realtimeEventTypeSet(req.ErrorEventTypes, []string{"error", "response.error"})
	var text strings.Builder
	var audio bytes.Buffer
	resp := RealtimeExchangeResponse{AudioMimeType: "audio/wav"}
	for resp.EventCount < maxEvents {
		event, err := session.ReceiveEvent(ctx)
		if err != nil {
			if errorsIsEOFOrClosed(err) && resp.EventCount > 0 {
				resp.Debug = takeDebug(ctx)
				return resp, nil
			}
			resp.Debug = takeDebug(ctx)
			return resp, fmt.Errorf("receive realtime event: %w", err)
		}
		resp.EventCount++
		if req.CaptureEvents {
			resp.Events = append(resp.Events, event)
		}
		eventType := realtimeEventType(event)
		if usage := realtimeUsageFromEvent(event); hasTokenUsage(usage) {
			resp.Usage = usage
		}
		if delta := realtimeTextDelta(event); delta != "" {
			text.WriteString(delta)
			resp.Text = text.String()
		}
		if mimeType := realtimeAudioMimeType(event); mimeType != "" {
			resp.AudioMimeType = mimeType
		}
		if encodedAudio := realtimeAudioDelta(event); encodedAudio != "" {
			chunk, err := base64.StdEncoding.DecodeString(encodedAudio)
			if err != nil {
				resp.Debug = takeDebug(ctx)
				return resp, fmt.Errorf("decode realtime audio delta: %w", err)
			}
			if audio.Len()+len(chunk) > maxAudioBytes {
				resp.Debug = takeDebug(ctx)
				return resp, fmt.Errorf("realtime audio exceeded max_audio_bytes=%d", maxAudioBytes)
			}
			audio.Write(chunk)
			resp.AudioBytes = audio.Bytes()
		}
		if errorTypes[eventType] || realtimeEventErrorMessage(event) != "" {
			msg := realtimeEventErrorMessage(event)
			if msg == "" {
				msg = firstNonEmptyAI(eventType, "realtime error")
			}
			resp.Debug = takeDebug(ctx)
			return resp, fmt.Errorf("realtime event error: %s", msg)
		}
		if stopTypes[eventType] {
			resp.StopEventType = eventType
			if finalText := realtimeFinalText(event); finalText != "" && resp.Text == "" {
				resp.Text = finalText
			}
			resp.Debug = takeDebug(ctx)
			return resp, nil
		}
	}
	resp.Debug = takeDebug(ctx)
	return resp, fmt.Errorf("realtime exchange exceeded max_events=%d", maxEvents)
}

func estimateRealtimeInputTokens(req RealtimeExchangeRequest) int {
	chars := len(req.Model)
	for _, event := range req.InitialEvents {
		raw, err := json.Marshal(event)
		if err == nil {
			chars += len(raw)
		}
	}
	if chars <= 0 {
		return 1
	}
	return chars/4 + 1
}

func realtimeEventTypeSet(configured []string, defaults []string) map[string]bool {
	out := map[string]bool{}
	values := defaults
	if len(configured) > 0 {
		values = configured
	}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out[value] = true
		}
	}
	return out
}

func realtimeEventType(event RealtimeEvent) string {
	if event == nil {
		return ""
	}
	return stringValueTrim(event["type"])
}

func realtimeTextDelta(event RealtimeEvent) string {
	eventType := realtimeEventType(event)
	if strings.Contains(eventType, "audio") && !strings.Contains(eventType, "transcript") {
		return ""
	}
	for _, key := range []string{"delta", "text_delta", "transcript_delta"} {
		if value := stringValueTrim(event[key]); value != "" {
			return value
		}
	}
	if delta := stringValueTrim(nestedAny(event, "item", "content", "text")); delta != "" {
		return delta
	}
	return ""
}

func realtimeFinalText(event RealtimeEvent) string {
	if value := stringValueTrim(event["text"]); value != "" {
		return value
	}
	if value := stringValueTrim(event["transcript"]); value != "" {
		return value
	}
	for _, path := range [][]string{
		{"response", "output_text"},
		{"response", "text"},
		{"item", "text"},
	} {
		if value := stringValueTrim(nestedAny(event, path...)); value != "" {
			return value
		}
	}
	return ""
}

func realtimeAudioDelta(event RealtimeEvent) string {
	for _, key := range []string{"audio", "audio_delta"} {
		if value := stringValueTrim(event[key]); value != "" {
			return value
		}
	}
	if delta := stringValueTrim(event["delta"]); delta != "" {
		eventType := realtimeEventType(event)
		if strings.Contains(eventType, "audio") && !strings.Contains(eventType, "transcript") {
			return delta
		}
	}
	return ""
}

func realtimeAudioMimeType(event RealtimeEvent) string {
	for _, key := range []string{"audio_mime_type", "mime_type", "content_type"} {
		if value := stringValueTrim(event[key]); value != "" {
			return value
		}
	}
	return ""
}

func realtimeUsageFromEvent(event RealtimeEvent) TokenUsage {
	if usage, ok := mapFromAny(event["usage"]); ok {
		return tokenUsageFromMap(usage)
	}
	if usage, ok := mapFromAny(nestedAny(event, "response", "usage")); ok {
		return tokenUsageFromMap(usage)
	}
	return TokenUsage{}
}

func tokenUsageFromMap(raw map[string]any) TokenUsage {
	usage := TokenUsage{
		InputTokens:       firstPositiveAnyInt(raw["input_tokens"], raw["prompt_tokens"]),
		OutputTokens:      firstPositiveAnyInt(raw["output_tokens"], raw["completion_tokens"]),
		CachedInputTokens: intFromAny(nestedAny(raw, "input_token_details", "cached_tokens")),
		ReasoningTokens:   intFromAny(nestedAny(raw, "output_token_details", "reasoning_tokens")),
	}
	if usage.CachedInputTokens <= 0 {
		usage.CachedInputTokens = intFromAny(raw["cached_input_tokens"])
	}
	if usage.ReasoningTokens <= 0 {
		usage.ReasoningTokens = intFromAny(raw["reasoning_tokens"])
	}
	return usage
}

func realtimeEventErrorMessage(event RealtimeEvent) string {
	if value := stringValueTrim(event["message"]); value != "" {
		return value
	}
	if value := stringValueTrim(event["error"]); value != "" {
		return value
	}
	if errObj, ok := mapFromAny(event["error"]); ok {
		return firstNonEmptyAI(
			stringValueTrim(errObj["message"]),
			stringValueTrim(errObj["code"]),
			mustJSON(errObj),
		)
	}
	return ""
}

func mapFromAny(value any) (map[string]any, bool) {
	switch typed := value.(type) {
	case map[string]any:
		return typed, true
	case RealtimeEvent:
		return map[string]any(typed), true
	default:
		return nil, false
	}
}

func firstPositiveAnyInt(values ...any) int {
	for _, value := range values {
		if n := intFromAny(value); n > 0 {
			return n
		}
	}
	return 0
}

func hasTokenUsage(usage TokenUsage) bool {
	return usage.InputTokens > 0 || usage.OutputTokens > 0 || usage.CachedInputTokens > 0 || usage.ReasoningTokens > 0
}

func errorsIsEOFOrClosed(err error) bool {
	if err == nil {
		return false
	}
	return err == io.EOF || strings.Contains(strings.ToLower(err.Error()), "close")
}
