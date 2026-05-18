package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"github.com/openai/openai-go/packages/param"
)

// OpenAIAdapter handles OpenAI and any OpenAI-compatible API via the official openai-go SDK.
type OpenAIAdapter struct {
	BaseURL string
	APIKey  string
	client  openai.Client
	rawHTTP *http.Client // used only for non-SDK paths (video multipart)
}

var jsonWordPatternAI = regexp.MustCompile(`(?i)\bjson\b`)

func NewOpenAIAdapter(baseURL, apiKey string) *OpenAIAdapter {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	return &OpenAIAdapter{
		BaseURL: baseURL,
		APIKey:  apiKey,
		client: openai.NewClient(
			option.WithAPIKey(apiKey),
			option.WithBaseURL(baseURL),
			option.WithMiddleware(debugOpenAIMiddleware(apiKey)),
		),
		rawHTTP: &http.Client{},
	}
}

func (a *OpenAIAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	attachTextPromptDebug(ctx, req)
	body, err := buildOpenAIChatBody(req, false)
	if err != nil {
		return TextResponse{}, err
	}
	respBody, status, latency, err := a.postOpenAIJSON(ctx, "/chat/completions", body)
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: a.chatEndpoint(), Method: "POST",
			RequestBody: mustJSON(body), ResponseStatus: status, ResponseBody: string(respBody),
			LatencyMs: latency, Error: err.Error(),
		})
		return TextResponse{}, err
	}
	var parsed openAIChatCompletionResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return TextResponse{}, fmt.Errorf("decode chat completion: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return TextResponse{}, fmt.Errorf("no choices returned")
	}
	choice := parsed.Choices[0]
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.Model, Endpoint: a.chatEndpoint(), Method: "POST",
		RequestBody:    mustJSON(body),
		ResponseStatus: status,
		ResponseBody:   string(respBody),
		LatencyMs:      latency,
	})
	return TextResponse{
		Content:      stringPtrValue(choice.Message.Content),
		ToolCalls:    choice.Message.ToolCalls,
		FinishReason: choice.FinishReason,
		Usage: TokenUsage{
			InputTokens:  parsed.Usage.PromptTokens,
			OutputTokens: parsed.Usage.CompletionTokens,
		},
		Debug: takeDebug(ctx),
	}, nil
}

func (a *OpenAIAdapter) ResponsesGenerate(ctx context.Context, req ResponsesRequest) (TextResponse, error) {
	attachTextPromptDebug(ctx, req.Text)
	body, err := buildOpenAIResponsesBody(req)
	if err != nil {
		return TextResponse{}, err
	}
	respBody, status, latency, err := a.postOpenAIJSONWithErrorLabel(ctx, "/responses", body, "openai responses")
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Text.Model, Endpoint: a.responsesEndpoint(), Method: "POST",
			RequestBody: mustJSON(body), ResponseStatus: status, ResponseBody: string(respBody),
			LatencyMs: latency, Error: err.Error(),
		})
		return TextResponse{}, err
	}
	var parsed openAIResponsesResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return TextResponse{}, fmt.Errorf("decode responses: %w", err)
	}
	result := parsed.toTextResponse()
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.Text.Model, Endpoint: a.responsesEndpoint(), Method: "POST",
		RequestBody:    mustJSON(body),
		ResponseStatus: status,
		ResponseBody:   string(respBody),
		LatencyMs:      latency,
	})
	result.Debug = takeDebug(ctx)
	return result, nil
}

func (a *OpenAIAdapter) TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error) {
	attachTextPromptDebug(ctx, req)
	body, err := buildOpenAIChatBody(req, true)
	if err != nil {
		return nil, err
	}
	httpReqBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.chatEndpoint(), bytes.NewReader(httpReqBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)

	streamDebug := aiStreamDebugEnabled()
	if streamDebug {
		slog.Info("ai_openai_stream_request",
			slog.String("model", req.Model),
			slog.String("endpoint", a.chatEndpoint()),
			slog.Int("message_count", len(req.Messages)),
			slog.Bool("json_mode", req.JSONMode),
			slog.Bool("is_reasoning", req.IsReasoning),
			slog.Any("extra_params", req.ExtraParams),
			slog.String("request_body", truncateForStreamDebug(string(httpReqBody))),
		)
	}

	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: a.chatEndpoint(), Method: "POST",
			RequestBody: mustJSON(body), LatencyMs: latency, Error: err.Error(),
		})
		return nil, err
	}
	if streamDebug {
		slog.Info("ai_openai_stream_response",
			slog.String("model", req.Model),
			slog.Int("status", resp.StatusCode),
			slog.Int64("latency_ms", latency),
			slog.String("content_type", resp.Header.Get("Content-Type")),
		)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		err := fmt.Errorf("openai chat stream HTTP %d: %s", resp.StatusCode, string(respBody))
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: a.chatEndpoint(), Method: "POST",
			RequestBody: mustJSON(body), ResponseStatus: resp.StatusCode, ResponseBody: string(respBody),
			LatencyMs: latency, Error: err.Error(),
		})
		return nil, err
	}

	out := make(chan TextStreamEvent)
	go func() {
		defer close(out)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, ":") {
				continue
			}
			if !strings.HasPrefix(line, "data:") {
				continue
			}
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if data == "[DONE]" {
				if streamDebug {
					slog.Info("ai_openai_stream_done", slog.String("model", req.Model))
				}
				out <- TextStreamEvent{Done: true}
				return
			}
			if streamDebug {
				slog.Info("ai_openai_stream_raw_chunk",
					slog.String("model", req.Model),
					slog.String("data", truncateForStreamDebug(data)),
				)
			}
			var chunk openAIChatCompletionChunk
			if err := json.Unmarshal([]byte(data), &chunk); err != nil {
				if streamDebug {
					slog.Warn("ai_openai_stream_decode_failed",
						slog.String("model", req.Model),
						slog.String("error", err.Error()),
						slog.String("data", truncateForStreamDebug(data)),
					)
				}
				continue
			}
			event := TextStreamEvent{}
			if len(chunk.Choices) > 0 {
				choice := chunk.Choices[0]
				event.Role = choice.Delta.Role
				event.ContentDelta = choice.Delta.Content
				event.ReasoningDelta = choice.Delta.ReasoningContent
				event.ToolCallDeltas = choice.Delta.ToolCalls
				event.FinishReason = choice.FinishReason
			}
			if streamDebug {
				slog.Info("ai_openai_stream_parsed_chunk",
					slog.String("model", req.Model),
					slog.Int("choices", len(chunk.Choices)),
					slog.Int("content_delta_chars", len(event.ContentDelta)),
					slog.Int("reasoning_delta_chars", len(event.ReasoningDelta)),
					slog.Int("tool_call_deltas", len(event.ToolCallDeltas)),
					slog.String("finish_reason", event.FinishReason),
					slog.String("content_delta", truncateForStreamDebug(event.ContentDelta)),
					slog.String("reasoning_delta", truncateForStreamDebug(event.ReasoningDelta)),
				)
			}
			event.Usage = TokenUsage{
				InputTokens:  chunk.Usage.PromptTokens,
				OutputTokens: chunk.Usage.CompletionTokens,
			}
			out <- event
		}
		if err := scanner.Err(); err != nil {
			out <- TextStreamEvent{Error: fmt.Sprintf("openai text stream receive: %v", err)}
		}
	}()
	return out, nil
}

func aiStreamDebugEnabled() bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv("MOVSCRIPT_AI_STREAM_DEBUG")))
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func truncateForStreamDebug(value string) string {
	const max = 4000
	if len(value) <= max {
		return value
	}
	return value[:max] + fmt.Sprintf("\n...[truncated %d bytes]", len(value)-max)
}

type openAIChatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content   *string    `json:"content"`
			ToolCalls []ToolCall `json:"tool_calls"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

type openAIChatCompletionChunk struct {
	Choices []struct {
		Delta struct {
			Role             string          `json:"role"`
			Content          string          `json:"content"`
			ReasoningContent string          `json:"reasoning_content"`
			ToolCalls        []ToolCallDelta `json:"tool_calls"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

type openAIResponsesResponse struct {
	Output []struct {
		ID      string `json:"id"`
		Type    string `json:"type"`
		Status  string `json:"status"`
		Role    string `json:"role"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		CallID    string `json:"call_id"`
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"output"`
	OutputText string `json:"output_text"`
	Status     string `json:"status"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
		TotalTokens  int `json:"total_tokens"`
	} `json:"usage"`
}

func (r openAIResponsesResponse) toTextResponse() TextResponse {
	var content strings.Builder
	if r.OutputText != "" {
		content.WriteString(r.OutputText)
	}
	toolCalls := make([]ToolCall, 0)
	for _, item := range r.Output {
		switch item.Type {
		case "message":
			if r.OutputText != "" {
				continue
			}
			for _, part := range item.Content {
				if part.Type == "output_text" || part.Type == "text" {
					content.WriteString(part.Text)
				}
			}
		case "function_call":
			id := item.CallID
			if id == "" {
				id = item.ID
			}
			toolCalls = append(toolCalls, ToolCall{
				ID:   id,
				Type: "function",
				Function: ToolFunction{
					Name:      item.Name,
					Arguments: item.Arguments,
				},
			})
		}
	}
	finishReason := "stop"
	if len(toolCalls) > 0 {
		finishReason = "tool_calls"
	} else if r.Status != "" && r.Status != "completed" {
		finishReason = r.Status
	}
	return TextResponse{
		Content:      content.String(),
		ToolCalls:    toolCalls,
		FinishReason: finishReason,
		Usage: TokenUsage{
			InputTokens:  r.Usage.InputTokens,
			OutputTokens: r.Usage.OutputTokens,
		},
	}
}

func buildOpenAIChatBody(req TextRequest, stream bool) (map[string]any, error) {
	messages := make([]map[string]any, 0, len(req.Messages))
	for _, m := range req.Messages {
		msg := map[string]any{"role": m.Role}
		if m.Role == "tool" {
			msg["content"] = m.Content
			msg["tool_call_id"] = m.ToolCallID
		} else {
			if len(m.ToolCalls) > 0 && m.Content == "" {
				msg["content"] = nil
			} else {
				msg["content"] = m.Content
			}
			if len(m.ToolCalls) > 0 {
				msg["tool_calls"] = m.ToolCalls
			}
		}
		messages = append(messages, msg)
	}
	jsonMode := req.JSONMode && !isOSeriesModel(req.Model)
	if jsonMode {
		messages = ensureOpenAIJSONModeMessages(messages)
	}

	body := map[string]any{
		"model":    req.Model,
		"messages": messages,
	}
	if stream {
		body["stream"] = true
		body["stream_options"] = map[string]any{"include_usage": true}
	}
	if req.MaxTokens > 0 {
		if isOSeriesModel(req.Model) {
			body["max_completion_tokens"] = req.MaxTokens
		} else {
			body["max_tokens"] = req.MaxTokens
		}
	}
	if req.Temperature >= 0 && !isOSeriesModel(req.Model) {
		body["temperature"] = req.Temperature
	}
	if jsonMode {
		body["response_format"] = map[string]any{"type": "json_object"}
	}
	for k, v := range req.ExtraParams {
		body[k] = v
	}
	if rawJSONPresentAI(req.Tools) {
		var tools any
		if err := json.Unmarshal(req.Tools, &tools); err != nil {
			return nil, fmt.Errorf("tools must be valid JSON: %w", err)
		}
		body["tools"] = tools
	}
	if rawJSONPresentAI(req.ToolChoice) {
		var toolChoice any
		if err := json.Unmarshal(req.ToolChoice, &toolChoice); err != nil {
			return nil, fmt.Errorf("tool_choice must be valid JSON: %w", err)
		}
		body["tool_choice"] = toolChoice
	}
	return body, nil
}

func buildOpenAIResponsesBody(req ResponsesRequest) (map[string]any, error) {
	textReq := req.Text
	input, err := openAIResponsesInput(req)
	if err != nil {
		return nil, err
	}
	body := map[string]any{
		"model": textReq.Model,
		"input": input,
	}
	if strings.TrimSpace(req.Instructions) != "" {
		body["instructions"] = strings.TrimSpace(req.Instructions)
	}
	if textReq.MaxTokens > 0 {
		body["max_output_tokens"] = textReq.MaxTokens
	}
	if textReq.Temperature >= 0 && !isOSeriesModel(textReq.Model) {
		body["temperature"] = textReq.Temperature
	}
	if textReq.JSONMode {
		body["text"] = map[string]any{"format": map[string]any{"type": "json_object"}}
	}
	for k, v := range textReq.ExtraParams {
		body[k] = v
	}
	if rawJSONPresentAI(req.Tools) {
		tools, err := openAIResponsesTools(req.Tools)
		if err != nil {
			return nil, err
		}
		body["tools"] = tools
	}
	if rawJSONPresentAI(req.ToolChoice) {
		var toolChoice any
		if err := json.Unmarshal(req.ToolChoice, &toolChoice); err != nil {
			return nil, fmt.Errorf("tool_choice must be valid JSON: %w", err)
		}
		body["tool_choice"] = toolChoice
	}
	return body, nil
}

func openAIResponsesInput(req ResponsesRequest) (any, error) {
	if rawJSONPresentAI(req.Input) {
		var input any
		if err := json.Unmarshal(req.Input, &input); err != nil {
			return nil, fmt.Errorf("input must be valid JSON: %w", err)
		}
		return input, nil
	}
	return openAIResponsesInputFromMessages(req.Text.Messages), nil
}

func openAIResponsesInputFromMessages(messages []Message) []map[string]any {
	input := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		if message.Role == "tool" {
			input = append(input, map[string]any{
				"type":    "function_call_output",
				"call_id": message.ToolCallID,
				"output":  message.Content,
			})
			continue
		}
		if message.Role == "assistant" && len(message.ToolCalls) > 0 {
			if message.Content != "" {
				input = append(input, openAIResponsesMessageItem(message.Role, "output_text", message.Content))
			}
			for _, toolCall := range message.ToolCalls {
				input = append(input, map[string]any{
					"type":      "function_call",
					"call_id":   toolCall.ID,
					"name":      toolCall.Function.Name,
					"arguments": toolCall.Function.Arguments,
				})
			}
			continue
		}
		contentType := "input_text"
		if message.Role == "assistant" {
			contentType = "output_text"
		}
		input = append(input, openAIResponsesMessageItem(message.Role, contentType, message.Content))
	}
	return input
}

func openAIResponsesMessageItem(role, contentType, text string) map[string]any {
	return map[string]any{
		"role": role,
		"content": []map[string]any{{
			"type": contentType,
			"text": text,
		}},
	}
}

func openAIResponsesTools(raw json.RawMessage) (any, error) {
	var tools []map[string]any
	if err := json.Unmarshal(raw, &tools); err != nil {
		return nil, fmt.Errorf("tools must be valid JSON: %w", err)
	}
	for _, tool := range tools {
		fn, ok := tool["function"].(map[string]any)
		if !ok {
			continue
		}
		tool["type"] = "function"
		for key, value := range fn {
			if _, exists := tool[key]; !exists {
				tool[key] = value
			}
		}
		delete(tool, "function")
	}
	return tools, nil
}

func ensureOpenAIJSONModeMessages(messages []map[string]any) []map[string]any {
	for _, msg := range messages {
		content, ok := msg["content"].(string)
		if ok && containsJSONWordAI(content) {
			return messages
		}
	}
	return append([]map[string]any{{
		"role":    "system",
		"content": "JSON mode is enabled. Return only a valid JSON object with no markdown fences.",
	}}, messages...)
}

func containsJSONWordAI(content string) bool {
	return jsonWordPatternAI.MatchString(content)
}

func rawJSONPresentAI(raw json.RawMessage) bool {
	s := strings.TrimSpace(string(raw))
	return s != "" && s != "null" && s != "[]"
}

func (a *OpenAIAdapter) postOpenAIJSON(ctx context.Context, path string, body map[string]any) ([]byte, int, int64, error) {
	return a.postOpenAIJSONWithErrorLabel(ctx, path, body, "openai chat")
}

func (a *OpenAIAdapter) postOpenAIJSONWithErrorLabel(ctx context.Context, path string, body map[string]any, errorLabel string) ([]byte, int, int64, error) {
	reqBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(a.BaseURL, "/")+path, bytes.NewReader(reqBody))
	if err != nil {
		return nil, 0, 0, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return nil, 0, latency, err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return respBody, resp.StatusCode, latency, readErr
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return respBody, resp.StatusCode, latency, fmt.Errorf("%s HTTP %d: %s", errorLabel, resp.StatusCode, string(respBody))
	}
	return respBody, resp.StatusCode, latency, nil
}

func (a *OpenAIAdapter) chatEndpoint() string {
	return strings.TrimRight(a.BaseURL, "/") + "/chat/completions"
}

func (a *OpenAIAdapter) responsesEndpoint() string {
	return strings.TrimRight(a.BaseURL, "/") + "/responses"
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (a *OpenAIAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	hasInputImage := len(req.InputImageDataList) > 0 || len(req.InputImageBytes) > 0 || req.InputImage != "" || req.CloudFileID != ""
	if hasInputImage {
		return a.imageEdit(ctx, req)
	}
	if req.EditOnly {
		return ImageResponse{}, fmt.Errorf("this model requires an input image (image_edit capability)")
	}

	n := req.N
	if n == 0 {
		n = 1
	}
	params := openai.ImageGenerateParams{
		Model:  req.Model,
		Prompt: req.Prompt,
		N:      param.NewOpt(int64(n)),
	}
	if req.Size != "" {
		params.Size = openai.ImageGenerateParamsSize(req.Size)
	} else if req.AspectRatio != "" {
		if size := aspectRatioToOpenAIImageSize(req.Model, req.AspectRatio); size != "" {
			params.Size = openai.ImageGenerateParamsSize(size)
			req.Size = size
		}
	}
	if req.Quality != "" {
		params.Quality = openai.ImageGenerateParamsQuality(req.Quality)
	}
	if req.Style != "" {
		params.Style = openai.ImageGenerateParamsStyle(req.Style)
	}

	// ImageGenerate (text-to-image via SDK)
	var reqOpts2 []option.RequestOption
	if req.AspectRatio != "" && req.Size == "" {
		reqOpts2 = append(reqOpts2, option.WithJSONSet("aspect_ratio", req.AspectRatio))
	}

	debugBody := map[string]any{
		"model":  req.Model,
		"prompt": req.Prompt,
		"n":      n,
	}
	if req.Size != "" {
		debugBody["size"] = req.Size
	}
	if req.Quality != "" {
		debugBody["quality"] = req.Quality
	}
	if req.Style != "" {
		debugBody["style"] = req.Style
	}
	if req.AspectRatio != "" && req.Size == "" {
		debugBody["aspect_ratio"] = req.AspectRatio
	}
	endpoint := a.BaseURL + "/images/generations"
	start := time.Now()
	resp, err := a.client.Images.Generate(ctx, params, reqOpts2...)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: endpoint, Method: "POST",
			RequestBody: mustJSON(debugBody), LatencyMs: latency, Error: err.Error(),
		})
		return ImageResponse{}, err
	}
	urls := make([]string, 0, len(resp.Data))
	for _, d := range resp.Data {
		if result := openAIImageResult(d.URL, d.B64JSON, string(resp.OutputFormat)); result != "" {
			urls = append(urls, result)
		}
	}
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.Model, Endpoint: endpoint, Method: "POST",
		RequestBody:    mustJSON(debugBody),
		ResponseStatus: http.StatusOK,
		ResponseBody:   resp.RawJSON(),
		LatencyMs:      latency,
	})
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
}

// imageEdit calls POST /images/edits.
//
// Priority order for the input image:
//  1. InputImageDataList — sends ordered resource bytes as multipart
//  2. InputImageBytes — sends raw bytes as multipart
//  3. InputImage URL — downloads the image bytes and sends as multipart
//  4. CloudFileID — fallback for providers that accept file IDs
func (a *OpenAIAdapter) imageEdit(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	if req.Size == "" && req.AspectRatio != "" {
		req.Size = aspectRatioToOpenAIImageSize(req.Model, req.AspectRatio)
	}

	var imgData []byte
	var mimeType string
	var readers []io.Reader
	var debugImages []string

	for _, media := range req.InputImageDataList {
		if len(media.Bytes) == 0 {
			continue
		}
		mediaMime := media.MimeType
		if mediaMime == "" {
			mediaMime = "image/png"
		}
		readers = append(readers, bytes.NewReader(media.Bytes))
		debugImages = append(debugImages, fmt.Sprintf("(binary %s, %d bytes)", mediaMime, len(media.Bytes)))
		if imgData == nil {
			imgData = media.Bytes
			mimeType = mediaMime
		}
	}

	if len(readers) > 0 {
		// Use custom multipart when the provider requires a non-standard field name (e.g. xAI "image[]").
		if req.ImageFieldName != "" && req.ImageFieldName != "image" {
			return a.imageEditMultipartCustomField(ctx, req, req.InputImageDataList)
		}
	} else if len(req.InputImageBytes) > 0 {
		imgData = req.InputImageBytes
		mimeType = req.InputImageMime
		if mimeType == "" {
			mimeType = "image/png"
		}
		readers = []io.Reader{bytes.NewReader(imgData)}
		debugImages = []string{fmt.Sprintf("(binary %s, %d bytes)", mimeType, len(imgData))}
	} else {
		if req.InputImage == "" && req.CloudFileID != "" {
			return a.imageEditByFileID(ctx, req)
		}
		var err error
		imgData, mimeType, err = fetchURLBytes(ctx, req.InputImage, "")
		if err != nil {
			return ImageResponse{}, fmt.Errorf("fetch input image: %w", err)
		}
		readers = []io.Reader{bytes.NewReader(imgData)}
		debugImages = []string{fmt.Sprintf("(binary %s, %d bytes)", mimeType, len(imgData))}
	}

	// Use custom multipart when the provider requires a non-standard field name (e.g. xAI "image[]").
	if req.ImageFieldName != "" && req.ImageFieldName != "image" {
		return a.imageEditMultipartCustomField(ctx, req, []MediaData{{Bytes: imgData, MimeType: mimeType}})
	}

	params := openai.ImageEditParams{
		Model:  req.Model,
		Prompt: req.Prompt,
		Image:  openAIImageEditInput(readers),
	}
	if req.Size != "" {
		params.Size = openai.ImageEditParamsSize(req.Size)
	} else if req.AspectRatio != "" {
		if size := aspectRatioToOpenAIImageSize(req.Model, req.AspectRatio); size != "" {
			params.Size = openai.ImageEditParamsSize(size)
			req.Size = size
		}
	}

	endpoint := a.BaseURL + "/images/edits"
	debugBody := map[string]any{
		"model":  req.Model,
		"prompt": req.Prompt,
		"image":  debugImages,
	}
	if req.Size != "" {
		debugBody["size"] = req.Size
	}
	start := time.Now()
	resp, err := a.client.Images.Edit(ctx, params)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			ModelID: req.Model, Endpoint: endpoint, Method: "POST",
			RequestBody: mustJSON(debugBody),
			LatencyMs:   latency, Error: err.Error(),
		})
		return ImageResponse{}, err
	}
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.Model, Endpoint: endpoint, Method: "POST",
		RequestBody:    mustJSON(debugBody),
		ResponseStatus: http.StatusOK,
		ResponseBody:   resp.RawJSON(),
		LatencyMs:      latency,
	})
	urls := make([]string, 0, len(resp.Data))
	for _, d := range resp.Data {
		if result := openAIImageResult(d.URL, d.B64JSON, string(resp.OutputFormat)); result != "" {
			urls = append(urls, result)
		}
	}
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
}

func openAIImageEditInput(readers []io.Reader) openai.ImageEditParamsImageUnion {
	if len(readers) == 1 {
		return openai.ImageEditParamsImageUnion{OfFile: readers[0]}
	}
	return openai.ImageEditParamsImageUnion{OfFileArray: readers}
}

// imageEditByFileID sends POST /images/edits with a JSON body referencing a provider file ID.
// Some providers (xAI) accept "image[]": fileID as JSON instead of a multipart binary upload.
func (a *OpenAIAdapter) imageEditByFileID(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	params := openai.ImageEditParams{
		Model:  req.Model,
		Prompt: req.Prompt,
		// Image field is required by the struct but we send the file ID via extra JSON.
		Image: openai.ImageEditParamsImageUnion{},
	}
	if req.Size != "" {
		params.Size = openai.ImageEditParamsSize(req.Size)
	} else if req.AspectRatio != "" {
		if size := aspectRatioToOpenAIImageSize(req.Model, req.AspectRatio); size != "" {
			params.Size = openai.ImageEditParamsSize(size)
			req.Size = size
		}
	}
	reqOpts := []option.RequestOption{
		option.WithJSONSet("image[]", req.CloudFileID),
	}
	endpoint := a.BaseURL + "/images/edits"
	debugBody := map[string]any{
		"model":   req.Model,
		"prompt":  req.Prompt,
		"image[]": req.CloudFileID,
	}
	if req.Size != "" {
		debugBody["size"] = req.Size
	}
	start := time.Now()
	resp, err := a.client.Images.Edit(ctx, params, reqOpts...)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			ModelID: req.Model, Endpoint: endpoint, Method: "POST",
			RequestBody: mustJSON(debugBody),
			LatencyMs:   latency, Error: err.Error(),
		})
		return ImageResponse{}, err
	}
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.Model, Endpoint: endpoint, Method: "POST",
		RequestBody:    mustJSON(debugBody),
		ResponseStatus: http.StatusOK,
		ResponseBody:   resp.RawJSON(),
		LatencyMs:      latency,
	})
	urls := make([]string, 0, len(resp.Data))
	for _, d := range resp.Data {
		if result := openAIImageResult(d.URL, d.B64JSON, string(resp.OutputFormat)); result != "" {
			urls = append(urls, result)
		}
	}
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
}

// imageEditMultipartCustomField is a raw-HTTP fallback for providers that require
// a non-standard multipart field name for the image (e.g. xAI uses "image[]").
func (a *OpenAIAdapter) imageEditMultipartCustomField(ctx context.Context, req ImageRequest, mediaList []MediaData) (ImageResponse, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fieldName := req.ImageFieldName
	if fieldName == "" {
		fieldName = "image"
	}
	imageCount := 0
	for _, media := range mediaList {
		if len(media.Bytes) == 0 {
			continue
		}
		mimeType := media.MimeType
		if mimeType == "" {
			mimeType = "image/png"
		}
		ext := imageExtFromMime(mimeType)
		partHeader := textproto.MIMEHeader{}
		partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="image-%d.%s"`, fieldName, imageCount+1, ext))
		partHeader.Set("Content-Type", mimeType)
		fw, _ := w.CreatePart(partHeader)
		_, _ = fw.Write(media.Bytes)
		imageCount++
	}
	if imageCount == 0 {
		_ = w.Close()
		return ImageResponse{}, fmt.Errorf("image edit requires at least one image")
	}
	_ = w.WriteField("model", req.Model)
	_ = w.WriteField("prompt", req.Prompt)
	if req.Size != "" {
		_ = w.WriteField("size", req.Size)
	}
	w.Close()

	endpoint := a.BaseURL + "/images/edits"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &buf)
	if err != nil {
		return ImageResponse{}, err
	}
	httpReq.Header.Set("Content-Type", w.FormDataContentType())
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)

	editHeaders := map[string]string{
		"Content-Type":  w.FormDataContentType(),
		"Authorization": "Bearer " + maskKey(a.APIKey),
	}
	editBody := fmt.Sprintf("(multipart: model=%s prompt=%q image_field=%s images=%d)", req.Model, req.Prompt, fieldName, imageCount)
	editStart := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	editLatency := time.Since(editStart).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			ModelID: req.Model, Endpoint: endpoint, Method: "POST",
			RequestHeaders: editHeaders, RequestBody: editBody,
			LatencyMs: editLatency, Error: err.Error(),
		})
		return ImageResponse{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: req.Model, Endpoint: endpoint, Method: "POST",
		RequestHeaders: editHeaders, RequestBody: editBody,
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: editLatency,
	})
	if resp.StatusCode >= 400 {
		return ImageResponse{}, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}
	var result struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
		OutputFormat string `json:"output_format"`
	}
	if err := jsonUnmarshal(respBody, &result); err != nil {
		return ImageResponse{}, fmt.Errorf("parse image edit response: %w", err)
	}
	urls := make([]string, 0, len(result.Data))
	for _, d := range result.Data {
		if resultURL := openAIImageResult(d.URL, d.B64JSON, result.OutputFormat); resultURL != "" {
			urls = append(urls, resultURL)
		}
	}
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
}

func openAIImageResult(rawURL, b64JSON, outputFormat string) string {
	if u := strings.TrimSpace(rawURL); u != "" {
		return u
	}
	b64 := strings.TrimSpace(b64JSON)
	if b64 == "" {
		return ""
	}
	mimeType := "image/png"
	switch strings.ToLower(strings.TrimSpace(outputFormat)) {
	case "jpeg", "jpg":
		mimeType = "image/jpeg"
	case "webp":
		mimeType = "image/webp"
	}
	return "data:" + mimeType + ";base64," + b64
}

func aspectRatioToOpenAIImageSize(model, ratio string) string {
	switch ratio {
	case "1:1":
		return "1024x1024"
	case "16:9", "4:3":
		if strings.Contains(model, "gpt-image") {
			return "1536x1024"
		}
		return "1792x1024"
	case "9:16", "3:4":
		if strings.Contains(model, "gpt-image") {
			return "1024x1536"
		}
		return "1024x1792"
	default:
		return ""
	}
}

func (a *OpenAIAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	startResp, err := a.VideoStart(ctx, req)
	if err != nil {
		return VideoResponse{}, err
	}
	if startResp.URL != "" || len(startResp.ContentBytes) > 0 || startResp.TaskID == "" {
		return startResp, nil
	}
	for i := 0; i < 60; i++ {
		select {
		case <-ctx.Done():
			return VideoResponse{}, ctx.Err()
		case <-time.After(5 * time.Second):
		}
		pollResp, err := a.VideoPoll(ctx, VideoPollRequest{
			Model:    req.Model,
			TaskID:   startResp.TaskID,
			TaskKind: startResp.TaskKind,
		})
		if err != nil {
			return pollResp, err
		}
		if pollResp.Status == VideoStatusSucceeded {
			return pollResp, nil
		}
		if pollResp.Status == VideoStatusFailed {
			msg := pollResp.Message
			if msg == "" {
				msg = "video generation failed"
			}
			return pollResp, fmt.Errorf("video task %s failed: %s", startResp.TaskID, msg)
		}
	}
	return VideoResponse{}, fmt.Errorf("video generation timed out (task %s)", startResp.TaskID)
}

func (a *OpenAIAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("model", req.Model)
	_ = w.WriteField("prompt", req.Prompt)
	dur := req.Duration
	if dur <= 0 {
		dur = 6
	}
	_ = w.WriteField("seconds", fmt.Sprintf("%d", dur))
	if req.AspectRatio != "" {
		_ = w.WriteField("aspect_ratio", req.AspectRatio)
	}
	if req.Size != "" {
		_ = w.WriteField("size", req.Size)
	}
	if req.ResolutionName != "" {
		_ = w.WriteField("resolution_name", req.ResolutionName)
	}
	if req.Preset != "" {
		_ = w.WriteField("preset", req.Preset)
	}
	if req.Quality != "" {
		_ = w.WriteField("quality", req.Quality)
	}

	var refImages []MediaData
	if len(req.InputImageDataList) > 0 {
		refImages = req.InputImageDataList
	} else {
		refs := req.InputImages
		if req.Image != "" {
			refs = append([]string{req.Image}, refs...)
		}
		for _, imgURL := range refs {
			imgData, mimeType, err := fetchURLBytes(ctx, imgURL, "")
			if err != nil {
				return VideoResponse{}, fmt.Errorf("fetch reference image: %w", err)
			}
			refImages = append(refImages, MediaData{Bytes: imgData, MimeType: mimeType})
		}
	}
	for i, md := range refImages {
		if i >= 7 {
			break
		}
		mimeType := md.MimeType
		if mimeType == "" {
			mimeType = "image/png"
		}
		ext := imageExtFromMime(mimeType)
		partHeader := textproto.MIMEHeader{}
		partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="input_reference[]"; filename="ref%d.%s"`, i, ext))
		partHeader.Set("Content-Type", mimeType)
		fw, err := w.CreatePart(partHeader)
		if err != nil {
			return VideoResponse{}, err
		}
		_, _ = fw.Write(md.Bytes)
	}
	w.Close()

	endpoint := a.BaseURL + "/videos"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &buf)
	if err != nil {
		return VideoResponse{}, err
	}
	httpReq.Header.Set("Content-Type", w.FormDataContentType())
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)

	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	reqHeaders := map[string]string{
		"Content-Type":  w.FormDataContentType(),
		"Authorization": "Bearer " + maskKey(a.APIKey),
	}
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			ModelID: req.Model, Endpoint: endpoint, Method: "POST",
			RequestHeaders: reqHeaders,
			RequestBody:    fmt.Sprintf("(multipart: model=%s prompt=%q images=%d)", req.Model, req.Prompt, len(refImages)),
			LatencyMs:      latency, Error: err.Error(),
		})
		return VideoResponse{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: req.Model, Endpoint: endpoint, Method: "POST",
		RequestHeaders: reqHeaders,
		RequestBody:    fmt.Sprintf("(multipart: model=%s prompt=%q images=%d)", req.Model, req.Prompt, len(refImages)),
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return VideoResponse{}, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	if err := jsonUnmarshal(respBody, &result); err != nil {
		return VideoResponse{}, fmt.Errorf("unexpected response format (got: %.120s): %w", string(respBody), err)
	}
	if result.URL != "" {
		return VideoResponse{TaskID: result.ID, Status: VideoStatusSucceeded, URL: result.URL, Debug: takeDebug(ctx)}, nil
	}
	if result.ID == "" {
		return VideoResponse{}, fmt.Errorf("no video URL or task ID returned by provider")
	}
	return VideoResponse{TaskID: result.ID, Status: VideoStatusSubmitted, Debug: takeDebug(ctx)}, nil
}

func (a *OpenAIAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	taskID := req.TaskID
	pollURL := a.BaseURL + "/videos/" + taskID
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, pollURL, nil)
	if err != nil {
		return VideoResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)

	reqHeaders := map[string]string{
		"Authorization": "Bearer " + maskKey(a.APIKey),
	}
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			ModelID: taskID, Endpoint: pollURL, Method: "GET",
			RequestHeaders: reqHeaders,
			LatencyMs:      latency, Error: err.Error(),
		})
		return VideoResponse{TaskID: taskID}, fmt.Errorf("poll video task: %w", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: taskID,
		Endpoint: pollURL, Method: "GET",
		RequestHeaders: reqHeaders,
		ResponseStatus: resp.StatusCode, ResponseBody: string(body),
		LatencyMs: latency,
	})

	if resp.StatusCode >= 400 {
		return VideoResponse{TaskID: taskID}, fmt.Errorf("poll video task API error %d: %s", resp.StatusCode, string(body))
	}

	var raw map[string]any
	if err := jsonUnmarshal(body, &raw); err != nil {
		return VideoResponse{TaskID: taskID}, fmt.Errorf("poll video task: parse response: %w", err)
	}

	status, _ := raw["status"].(string)
	normalized := normalizeVideoStatus(status)
	videoURL := stringField(raw, "url", "video_url", "output_url", "result_url", "download_url")

	switch normalized {
	case VideoStatusSucceeded:
		if videoURL != "" {
			return VideoResponse{TaskID: taskID, Status: VideoStatusSucceeded, URL: videoURL, Debug: takeDebug(ctx)}, nil
		}
		resp, err := a.downloadVideoContent(ctx, taskID)
		resp.Status = VideoStatusSucceeded
		return resp, err
	case VideoStatusFailed:
		msg := videoTaskErrorMessage(raw)
		if msg == "" {
			msg = "video generation failed"
		}
		return VideoResponse{TaskID: taskID, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s failed: %s", taskID, msg)
	default:
		return VideoResponse{TaskID: taskID, Status: normalized, Debug: takeDebug(ctx)}, nil
	}
}

func (a *OpenAIAdapter) downloadVideoContent(ctx context.Context, taskID string) (VideoResponse, error) {
	contentURL := a.BaseURL + "/videos/" + taskID + "/content"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, contentURL, nil)
	if err != nil {
		return VideoResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)

	reqHeaders := map[string]string{
		"Authorization": "Bearer " + maskKey(a.APIKey),
	}
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			ModelID: taskID, Endpoint: contentURL, Method: "GET",
			RequestHeaders: reqHeaders,
			LatencyMs:      latency, Error: err.Error(),
		})
		return VideoResponse{}, fmt.Errorf("download video content: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: taskID, Endpoint: contentURL, Method: "GET",
			RequestHeaders: reqHeaders,
			ResponseStatus: resp.StatusCode, ResponseBody: string(body),
			LatencyMs: latency,
		})
		return VideoResponse{}, fmt.Errorf("download video content API error %d: %s", resp.StatusCode, string(body))
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return VideoResponse{}, fmt.Errorf("download video content: read body: %w", err)
	}
	recordDebug(ctx, DebugCallResult{
		Success: true, ModelID: taskID, Endpoint: contentURL, Method: "GET",
		RequestHeaders: reqHeaders,
		ResponseStatus: resp.StatusCode,
		ResponseBody:   fmt.Sprintf("(binary video content, %d bytes)", len(data)),
		LatencyMs:      latency,
	})
	return VideoResponse{TaskID: taskID, ContentBytes: data}, nil
}

func (a *OpenAIAdapter) Ping(ctx context.Context) error {
	_, err := a.client.Models.List(ctx)
	return err
}

func (a *OpenAIAdapter) FetchModels(ctx context.Context) ([]string, error) {
	page, err := a.client.Models.List(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(page.Data))
	for _, m := range page.Data {
		if m.ID != "" {
			ids = append(ids, m.ID)
		}
	}
	return ids, nil
}

// stringField returns the first non-empty string value found among the given keys in m.
func stringField(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

// isOSeriesModel reports whether the model ID is an OpenAI o-series reasoning model
// (o1, o3, o4…). These use max_completion_tokens and don't support temperature.
func isOSeriesModel(model string) bool {
	return len(model) >= 2 && model[0] == 'o' && model[1] >= '1' && model[1] <= '9'
}
