package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/volcengine/volcengine-go-sdk/service/arkruntime"
	arkmodel "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
)

// VolcenAdapter implements Provider for the Volcengine Ark platform,
// covering text (doubao), image (Seedream), and async video (Seedance).
type VolcenAdapter struct {
	baseURL string
	client  *arkruntime.Client
}

const volcenTextMaxTokensLimit = 131072
const volcenHTTPTimeout = 10 * time.Minute

func NewVolcenAdapter(baseURL, apiKey string) *VolcenAdapter {
	if baseURL == "" {
		baseURL = "https://ark.cn-beijing.volces.com/api/v3"
	}
	c := arkruntime.NewClientWithApiKey(apiKey,
		arkruntime.WithBaseUrl(baseURL),
		arkruntime.WithHTTPClient(debugHTTPClient(apiKey, volcenHTTPTimeout)),
	)
	return &VolcenAdapter{baseURL: baseURL, client: c}
}

func (a *VolcenAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	attachTextPromptDebug(ctx, req)
	arkReq := buildVolcenChatRequest(req)

	resp, err := a.client.CreateChatCompletion(ctx, arkReq)
	if err != nil {
		return TextResponse{}, fmt.Errorf("volcen text: %w", err)
	}
	if len(resp.Choices) == 0 {
		return TextResponse{}, fmt.Errorf("volcen text: no choices in response")
	}
	choice := resp.Choices[0]
	text := ""
	if c := choice.Message.Content; c != nil && c.StringValue != nil {
		text = *c.StringValue
	}
	toolCalls := convertVolcenToolCalls(choice.Message.ToolCalls)
	// Fallback: some Doubao models embed tool calls in content as <|FunctionCallBegin|>...<|FunctionCallEnd|>
	if len(toolCalls) == 0 && text != "" {
		if parsed, remaining := parseVolcenFunctionCallContent(text); len(parsed) > 0 {
			toolCalls = parsed
			text = remaining
		}
	}
	return TextResponse{
		Content:      text,
		ToolCalls:    toolCalls,
		FinishReason: string(choice.FinishReason),
		Usage: TokenUsage{
			InputTokens:  resp.Usage.PromptTokens,
			OutputTokens: resp.Usage.CompletionTokens,
		},
		Debug: takeDebug(ctx),
	}, nil
}

func (a *VolcenAdapter) TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error) {
	attachTextPromptDebug(ctx, req)
	arkReq := buildVolcenChatRequest(req)
	arkReq.StreamOptions = &arkmodel.StreamOptions{IncludeUsage: true}

	stream, err := a.client.CreateChatCompletionStream(ctx, arkReq)
	if err != nil {
		return nil, fmt.Errorf("volcen text stream: %w", err)
	}

	out := make(chan TextStreamEvent)
	go func() {
		defer close(out)
		defer stream.Close()
		for {
			resp, err := stream.Recv()
			if err == io.EOF {
				out <- TextStreamEvent{Done: true}
				return
			}
			if err != nil {
				out <- TextStreamEvent{Error: fmt.Sprintf("volcen text stream receive: %v", err)}
				return
			}
			event := TextStreamEvent{}
			if len(resp.Choices) > 0 && resp.Choices[0] != nil {
				choice := resp.Choices[0]
				event.Role = choice.Delta.Role
				event.ContentDelta = choice.Delta.Content
				if choice.Delta.ReasoningContent != nil {
					event.ReasoningDelta = *choice.Delta.ReasoningContent
				}
				if len(choice.Delta.ToolCalls) > 0 {
					deltas := make([]ToolCallDelta, 0, len(choice.Delta.ToolCalls))
					for _, tc := range choice.Delta.ToolCalls {
						d := ToolCallDelta{
							ID:   tc.ID,
							Type: string(tc.Type),
							Function: ToolFunction{
								Name:      tc.Function.Name,
								Arguments: tc.Function.Arguments,
							},
						}
						if tc.Index != nil {
							d.Index = *tc.Index
						}
						deltas = append(deltas, d)
					}
					event.ToolCallDeltas = deltas
				}
				if choice.FinishReason != "" {
					event.FinishReason = string(choice.FinishReason)
				}
			}
			if resp.Usage != nil {
				event.Usage = TokenUsage{
					InputTokens:  resp.Usage.PromptTokens,
					OutputTokens: resp.Usage.CompletionTokens,
				}
			}
			out <- event
		}
	}()
	return out, nil
}

func buildVolcenChatRequest(req TextRequest) arkmodel.CreateChatCompletionRequest {
	msgs := make([]*arkmodel.ChatCompletionMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		msg := &arkmodel.ChatCompletionMessage{Role: m.Role}
		switch {
		case m.Role == "tool":
			content := arkmodel.ChatCompletionMessageContent{StringValue: &m.Content}
			msg.Content = &content
			msg.ToolCallID = m.ToolCallID
		case len(m.ToolCalls) > 0:
			if m.Content != "" {
				content := arkmodel.ChatCompletionMessageContent{StringValue: &m.Content}
				msg.Content = &content
			}
			arkCalls := make([]*arkmodel.ToolCall, 0, len(m.ToolCalls))
			for _, tc := range m.ToolCalls {
				arkCalls = append(arkCalls, &arkmodel.ToolCall{
					ID:   tc.ID,
					Type: arkmodel.ToolTypeFunction,
					Function: arkmodel.FunctionCall{
						Name:      tc.Function.Name,
						Arguments: tc.Function.Arguments,
					},
				})
			}
			msg.ToolCalls = arkCalls
		default:
			content := arkmodel.ChatCompletionMessageContent{StringValue: &m.Content}
			msg.Content = &content
		}
		msgs = append(msgs, msg)
	}

	arkReq := arkmodel.CreateChatCompletionRequest{
		Model:    req.Model,
		Messages: msgs,
	}
	if req.MaxTokens > 0 {
		n := req.MaxTokens
		if n > volcenTextMaxTokensLimit {
			n = volcenTextMaxTokensLimit
		}
		arkReq.MaxTokens = &n
	}
	if req.Temperature >= 0 {
		t := req.Temperature
		arkReq.Temperature = &t
	}
	for key, value := range req.ExtraParams {
		switch key {
		case "top_p":
			if n, ok := numberValue(value); ok {
				v := float32(n)
				arkReq.TopP = &v
			}
		case "presence_penalty":
			if n, ok := numberValue(value); ok {
				v := float32(n)
				arkReq.PresencePenalty = &v
			}
		case "frequency_penalty":
			if n, ok := numberValue(value); ok {
				v := float32(n)
				arkReq.FrequencyPenalty = &v
			}
		}
	}
	if rawJSONPresentAI(req.Tools) {
		var tools []*arkmodel.Tool
		if err := json.Unmarshal(req.Tools, &tools); err == nil {
			arkReq.Tools = tools
		}
	}
	if rawJSONPresentAI(req.ToolChoice) {
		var toolChoice any
		if err := json.Unmarshal(req.ToolChoice, &toolChoice); err == nil {
			arkReq.ToolChoice = toolChoice
		}
	}
	return arkReq
}

func (a *VolcenAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	arkReq := arkmodel.GenerateImagesRequest{
		Model:  req.Model,
		Prompt: req.Prompt,
	}
	if imageInput := buildVolcenImageInput(req); imageInput != nil {
		arkReq.Image = imageInput
	}
	if req.Size != "" {
		s := req.Size
		arkReq.Size = &s
	} else if req.AspectRatio != "" {
		// Ark accepts size in WxH or "adaptive"; map common ratios.
		s := aspectRatioToArkSize(req.AspectRatio)
		if s != "" {
			arkReq.Size = &s
		}
	}
	urlFmt := arkmodel.GenerateImagesResponseFormatURL
	arkReq.ResponseFormat = &urlFmt
	if req.Seed != nil {
		arkReq.Seed = req.Seed
	}
	if req.GuidanceScale > 0 {
		arkReq.GuidanceScale = &req.GuidanceScale
	}
	if req.Watermark != nil {
		arkReq.Watermark = req.Watermark
	}
	if req.SequentialMode != "" {
		mode := arkmodel.SequentialImageGeneration(req.SequentialMode)
		arkReq.SequentialImageGeneration = &mode
	}
	if req.SequentialMaxImages > 0 {
		maxImages := req.SequentialMaxImages
		arkReq.SequentialImageGenerationOptions = &arkmodel.SequentialImageGenerationOptions{MaxImages: &maxImages}
	}
	if req.OutputFormat != "" {
		format := arkmodel.OutputFormat(req.OutputFormat)
		arkReq.OutputFormat = &format
	}
	if req.OptimizePromptMode != "" {
		mode := arkmodel.OptimizePromptMode(req.OptimizePromptMode)
		arkReq.OptimizePromptOptions = &arkmodel.OptimizePromptOptions{Mode: &mode}
	}
	if req.WebSearch {
		arkReq.Tools = []*arkmodel.ContentGenerationTool{{Type: arkmodel.ToolTypeWebSearch}}
	}

	debugBody := map[string]any{"model": req.Model, "prompt": req.Prompt}
	if arkReq.Image != nil {
		debugBody["image"] = "[media]"
	}
	if arkReq.Size != nil {
		debugBody["size"] = *arkReq.Size
	}
	if arkReq.Seed != nil {
		debugBody["seed"] = *arkReq.Seed
	}
	if arkReq.GuidanceScale != nil {
		debugBody["guidance_scale"] = *arkReq.GuidanceScale
	}
	if arkReq.Watermark != nil {
		debugBody["watermark"] = *arkReq.Watermark
	}
	if arkReq.SequentialImageGeneration != nil {
		debugBody["sequential_image_generation"] = *arkReq.SequentialImageGeneration
	}
	if req.SequentialMaxImages > 0 {
		debugBody["sequential_image_generation_options"] = map[string]any{"max_images": req.SequentialMaxImages}
	}
	if arkReq.OutputFormat != nil {
		debugBody["output_format"] = *arkReq.OutputFormat
	}
	if req.OptimizePromptMode != "" {
		debugBody["optimize_prompt_options"] = map[string]any{"mode": req.OptimizePromptMode}
	}
	if req.WebSearch {
		debugBody["tools"] = []map[string]any{{"type": "web_search"}}
	}
	debugBodyJSON, _ := json.Marshal(debugBody)
	debugEndpoint := a.baseURL + "/images/generations"

	start := time.Now()
	resp, err := a.client.GenerateImages(ctx, arkReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model,
			Endpoint: debugEndpoint, Method: "POST",
			RequestBody: string(debugBodyJSON),
			LatencyMs:   latency, Error: err.Error(),
		})
		return ImageResponse{}, fmt.Errorf("volcen image: %w", err)
	}
	if resp.Error != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model,
			Endpoint: debugEndpoint, Method: "POST",
			RequestBody:    string(debugBodyJSON),
			ResponseStatus: http.StatusBadRequest,
			ResponseBody:   resp.Error.Message,
			LatencyMs:      latency, Error: resp.Error.Message,
		})
		return ImageResponse{}, fmt.Errorf("volcen image: %s", resp.Error.Message)
	}
	var urls []string
	for _, img := range resp.Data {
		if img.Url != nil && *img.Url != "" {
			urls = append(urls, *img.Url)
		} else if img.B64Json != nil && *img.B64Json != "" {
			urls = append(urls, "data:image/png;base64,"+*img.B64Json)
		}
	}
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.Model,
		Endpoint: debugEndpoint, Method: "POST",
		RequestBody:    string(debugBodyJSON),
		ResponseStatus: http.StatusOK,
		ResponseBody:   fmt.Sprintf(`{"images":%d}`, len(urls)),
		LatencyMs:      latency,
	})
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
}

func (a *VolcenAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	startResp, err := a.VideoStart(ctx, req)
	if err != nil {
		return VideoResponse{}, err
	}
	if startResp.URL != "" || len(startResp.ContentBytes) > 0 || startResp.TaskID == "" {
		return startResp, nil
	}

	// Legacy synchronous path for direct callers. The job worker uses
	// VideoStart/VideoPoll so submitted task IDs are persisted before polling.
	for i := 0; i < 60; i++ {
		select {
		case <-ctx.Done():
			return VideoResponse{TaskID: startResp.TaskID, TaskKind: startResp.TaskKind, Status: VideoStatusProcessing}, ctx.Err()
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
		if pollResp.Status == VideoStatusCancelled {
			msg := pollResp.Message
			if msg == "" {
				msg = "video generation cancelled"
			}
			return pollResp, fmt.Errorf("video task %s cancelled: %s", startResp.TaskID, msg)
		}
	}
	return VideoResponse{TaskID: startResp.TaskID, TaskKind: startResp.TaskKind, Status: VideoStatusProcessing}, fmt.Errorf("video generation timed out (task %s)", startResp.TaskID)
}

func (a *VolcenAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	createReq, debugBody, buildErr := buildVolcenVideoTaskRequest(req)
	debugBodyJSON, _ := json.Marshal(debugBody)
	debugEndpoint := a.baseURL + "/contents/generations/tasks"

	if buildErr != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model,
			Endpoint: debugEndpoint, Method: "POST",
			RequestBody: string(debugBodyJSON),
			Error:       buildErr.Error(),
		})
		return VideoResponse{}, buildErr
	}

	start := time.Now()
	taskResp, err := a.client.CreateContentGenerationTask(ctx, createReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model,
			Endpoint: debugEndpoint, Method: "POST",
			RequestBody: string(debugBodyJSON),
			LatencyMs:   latency, Error: err.Error(),
		})
		return VideoResponse{}, fmt.Errorf("volcen create task: %w", err)
	}
	taskID := taskResp.ID
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.Model,
		Endpoint: debugEndpoint, Method: "POST",
		RequestBody:    string(debugBodyJSON),
		ResponseStatus: http.StatusOK,
		ResponseBody:   fmt.Sprintf(`{"task_id":%q,"status":"submitted"}`, taskID),
		LatencyMs:      latency,
	})
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("volcen create task: no task id returned")
	}
	return VideoResponse{TaskID: taskID, TaskKind: "content_generation", Status: VideoStatusSubmitted, Debug: takeDebug(ctx)}, nil
}

func (a *VolcenAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	if req.TaskID == "" {
		return VideoResponse{}, fmt.Errorf("volcen poll task: task id is required")
	}

	debugEndpoint := a.baseURL + "/contents/generations/tasks/" + req.TaskID
	start := time.Now()
	pollResp, err := a.client.GetContentGenerationTask(ctx, arkmodel.GetContentGenerationTaskRequest{ID: req.TaskID})
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.TaskID,
			Endpoint: debugEndpoint, Method: "GET",
			LatencyMs: latency, Error: err.Error(),
		})
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind}, fmt.Errorf("volcen poll task: %w", err)
	}

	responseBody := map[string]any{
		"task_id": pollResp.ID,
		"status":  pollResp.Status,
	}
	if pollResp.Content.VideoURL != "" {
		responseBody["video_url"] = pollResp.Content.VideoURL
	}
	if pollResp.Content.FileURL != "" {
		responseBody["file_url"] = pollResp.Content.FileURL
	}
	if pollResp.Error != nil {
		responseBody["error"] = pollResp.Error
	}
	responseBodyJSON, _ := json.Marshal(responseBody)
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.TaskID,
		Endpoint: debugEndpoint, Method: "GET",
		ResponseStatus: http.StatusOK, ResponseBody: string(responseBodyJSON),
		LatencyMs: latency,
	})

	switch pollResp.Status {
	case arkmodel.StatusSucceeded:
		url := pollResp.Content.VideoURL
		if url == "" {
			url = pollResp.Content.FileURL
		}
		if url == "" {
			return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: "task succeeded but no video URL in response", Debug: takeDebug(ctx)}, fmt.Errorf("task succeeded but no video URL in response")
		}
		durSec := 0
		if pollResp.Duration != nil {
			durSec = int(*pollResp.Duration)
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusSucceeded, URL: url, DurationSec: durSec, Debug: takeDebug(ctx)}, nil
	case arkmodel.StatusCancelled:
		msg := "video generation cancelled"
		if pollResp.Error != nil && pollResp.Error.Message != "" {
			msg = pollResp.Error.Message
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusCancelled, Message: msg, Debug: takeDebug(ctx)}, nil
	case arkmodel.StatusFailed:
		msg := "video generation failed"
		if pollResp.Error != nil && pollResp.Error.Message != "" {
			msg = pollResp.Error.Message
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s failed: %s", req.TaskID, msg)
	case arkmodel.StatusQueued:
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusQueued, Debug: takeDebug(ctx)}, nil
	default:
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusProcessing, Debug: takeDebug(ctx)}, nil
	}
}

func (a *VolcenAdapter) VideoCancel(ctx context.Context, req VideoCancelRequest) (VideoResponse, error) {
	if req.TaskID == "" {
		return VideoResponse{}, fmt.Errorf("volcen cancel task: task id is required")
	}

	debugEndpoint := a.baseURL + "/contents/generations/tasks/" + req.TaskID
	start := time.Now()
	err := a.client.DeleteContentGenerationTask(ctx, arkmodel.DeleteContentGenerationTaskRequest{ID: req.TaskID})
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.TaskID,
			Endpoint: debugEndpoint, Method: "DELETE",
			LatencyMs: latency, Error: err.Error(),
		})
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusProcessing}, fmt.Errorf("volcen cancel task: %w", err)
	}

	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.TaskID,
		Endpoint: debugEndpoint, Method: "DELETE",
		ResponseStatus: http.StatusOK,
		ResponseBody:   fmt.Sprintf(`{"task_id":%q,"status":"cancelled"}`, req.TaskID),
		LatencyMs:      latency,
	})
	return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusCancelled, Message: "video task cancelled", Debug: takeDebug(ctx)}, nil
}

func buildVolcenVideoTaskRequest(req VideoRequest) (arkmodel.CreateContentGenerationTaskRequest, map[string]any, error) {
	prompt := req.Prompt
	content := []*arkmodel.CreateContentGenerationContentItem{
		{Type: arkmodel.ContentGenerationContentItemTypeText, Text: &prompt},
	}

	imageURL := req.Image
	if imageURL == "" && len(req.InputImageDataList) > 0 {
		img := req.InputImageDataList[0]
		if img.PresignedURL != "" {
			imageURL = img.PresignedURL
		} else if len(img.Bytes) > 0 {
			// No public URL (e.g. local MinIO); send as base64 data URL.
			imageURL = "data:" + img.MimeType + ";base64," + base64Encode(img.Bytes)
		}
	}
	if imageURL != "" {
		content = append(content, &arkmodel.CreateContentGenerationContentItem{
			Type:     arkmodel.ContentGenerationContentItemTypeImage,
			ImageURL: &arkmodel.ImageURL{URL: imageURL},
		})
	}

	videoURL := req.InputVideo
	if videoURL == "" && req.InputVideoData != nil {
		vd := req.InputVideoData
		if vd.PresignedURL != "" {
			videoURL = vd.PresignedURL
		} else if len(vd.Bytes) > 0 {
			// Volcen's contents/generations/tasks endpoint does not accept base64
			// data URLs for video_url. If we reach this branch, the worker failed
			// to upload the reference video to a public object relay (e.g. TOS).
			return arkmodel.CreateContentGenerationTaskRequest{}, nil, fmt.Errorf("volcen video reference requires a public URL; configure a cloud file relay (TOS/S3/OSS) for this credential")
		}
	}
	if videoURL != "" {
		content = append(content, &arkmodel.CreateContentGenerationContentItem{
			Type:     arkmodel.ContentGenerationContentItemTypeVideo,
			VideoURL: &arkmodel.VideoUrl{Url: videoURL},
		})
	}

	createReq := arkmodel.CreateContentGenerationTaskRequest{
		Model:   req.Model,
		Content: content,
	}
	if req.Frames > 0 {
		frames := int64(req.Frames)
		createReq.Frames = &frames
	} else if req.Duration != 0 {
		dur := int64(req.Duration)
		createReq.Duration = &dur
	}
	if req.Seed != nil {
		createReq.Seed = req.Seed
	}
	ratio := req.Ratio
	if ratio == "" {
		ratio = req.AspectRatio
	}
	if ratio != "" {
		createReq.Ratio = &ratio
	}
	if req.ResolutionName != "" {
		createReq.Resolution = &req.ResolutionName
	}
	if req.CameraFixed != nil {
		createReq.CameraFixed = req.CameraFixed
	}
	if req.Watermark != nil {
		createReq.Watermark = req.Watermark
	}
	if req.GenerateAudio != nil {
		createReq.GenerateAudio = req.GenerateAudio
	}
	if req.ReturnLastFrame != nil {
		createReq.ReturnLastFrame = req.ReturnLastFrame
	}
	if req.ServiceTier != "" {
		createReq.ServiceTier = &req.ServiceTier
	}
	if req.ExecutionExpiresAfter > 0 {
		expires := int64(req.ExecutionExpiresAfter)
		createReq.ExecutionExpiresAfter = &expires
	}
	if req.Draft != nil {
		createReq.Draft = req.Draft
	}
	if req.WebSearch {
		createReq.Tools = []*arkmodel.ContentGenerationTool{{Type: arkmodel.ToolTypeWebSearch}}
	}

	debugBody := map[string]any{
		"model":  req.Model,
		"prompt": req.Prompt,
	}
	if imageURL != "" {
		debugBody["image_url"] = imageURL
	}
	if videoURL != "" {
		debugBody["video_url"] = videoURL
	}
	if req.Frames > 0 {
		debugBody["frames"] = req.Frames
	} else if req.Duration != 0 {
		debugBody["duration"] = req.Duration
	}
	if req.Seed != nil {
		debugBody["seed"] = *req.Seed
	}
	if ratio != "" {
		debugBody["ratio"] = ratio
	}
	if req.ResolutionName != "" {
		debugBody["resolution"] = req.ResolutionName
	}
	if req.CameraFixed != nil {
		debugBody["camera_fixed"] = *req.CameraFixed
	}
	if req.Watermark != nil {
		debugBody["watermark"] = *req.Watermark
	}
	if req.GenerateAudio != nil {
		debugBody["generate_audio"] = *req.GenerateAudio
	}
	if req.ReturnLastFrame != nil {
		debugBody["return_last_frame"] = *req.ReturnLastFrame
	}
	if req.ServiceTier != "" {
		debugBody["service_tier"] = req.ServiceTier
	}
	if req.ExecutionExpiresAfter > 0 {
		debugBody["execution_expires_after"] = req.ExecutionExpiresAfter
	}
	if req.Draft != nil {
		debugBody["draft"] = *req.Draft
	}
	if req.WebSearch {
		debugBody["tools"] = []map[string]any{{"type": "web_search"}}
	}
	return createReq, debugBody, nil
}

func buildVolcenImageInput(req ImageRequest) any {
	if len(req.InputImageDataList) > 0 {
		images := make([]string, 0, len(req.InputImageDataList))
		for _, img := range req.InputImageDataList {
			if img.PresignedURL != "" {
				images = append(images, img.PresignedURL)
				continue
			}
			if len(img.Bytes) > 0 {
				mimeType := img.MimeType
				if mimeType == "" {
					mimeType = "image/png"
				}
				images = append(images, "data:"+mimeType+";base64,"+base64Encode(img.Bytes))
			}
		}
		switch len(images) {
		case 0:
			return nil
		case 1:
			return images[0]
		default:
			return images
		}
	}
	if len(req.InputImageBytes) > 0 {
		mimeType := req.InputImageMime
		if mimeType == "" {
			mimeType = "image/png"
		}
		return "data:" + mimeType + ";base64," + base64Encode(req.InputImageBytes)
	}
	if req.InputImage != "" {
		return req.InputImage
	}
	return nil
}

func (a *VolcenAdapter) Ping(ctx context.Context) error {
	pageSize := 1
	ps := arkmodel.ListContentGenerationTasksRequest{PageSize: &pageSize}
	_, err := a.client.ListContentGenerationTasks(ctx, ps)
	return err
}

// aspectRatioToArkSize maps common ratio strings to Ark image size strings.
func aspectRatioToArkSize(ratio string) string {
	switch ratio {
	case "1:1":
		return "1024x1024"
	case "16:9":
		return "1280x720"
	case "9:16":
		return "720x1280"
	case "4:3":
		return "1024x768"
	case "3:4":
		return "768x1024"
	}
	return ""
}

func base64Encode(b []byte) string {
	return base64.StdEncoding.EncodeToString(b)
}

// convertVolcenToolCalls converts Volcengine SDK tool calls to the internal format.
func convertVolcenToolCalls(arkCalls []*arkmodel.ToolCall) []ToolCall {
	if len(arkCalls) == 0 {
		return nil
	}
	result := make([]ToolCall, 0, len(arkCalls))
	for _, tc := range arkCalls {
		result = append(result, ToolCall{
			ID:   tc.ID,
			Type: string(tc.Type),
			Function: ToolFunction{
				Name:      tc.Function.Name,
				Arguments: tc.Function.Arguments,
			},
		})
	}
	return result
}

// parseVolcenFunctionCallContent parses the <|FunctionCallBegin|>...<|FunctionCallEnd|> format
// that some Doubao models use when standard tool_calls are not returned.
// Returns the parsed tool calls and the remaining content with the marker stripped.
func parseVolcenFunctionCallContent(content string) ([]ToolCall, string) {
	const begin = "<|FunctionCallBegin|>"
	const end = "<|FunctionCallEnd|>"
	startIdx := strings.Index(content, begin)
	if startIdx < 0 {
		return nil, content
	}
	endIdx := strings.Index(content, end)
	if endIdx < 0 {
		return nil, content
	}
	jsonStr := content[startIdx+len(begin) : endIdx]
	remaining := strings.TrimSpace(content[:startIdx] + content[endIdx+len(end):])

	var calls []struct {
		Name       string          `json:"name"`
		Parameters json.RawMessage `json:"parameters"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &calls); err != nil {
		return nil, content
	}
	result := make([]ToolCall, 0, len(calls))
	for i, c := range calls {
		args := "{}"
		if len(c.Parameters) > 0 {
			args = string(c.Parameters)
		}
		result = append(result, ToolCall{
			ID:   fmt.Sprintf("call_%d", i),
			Type: "function",
			Function: ToolFunction{
				Name:      c.Name,
				Arguments: args,
			},
		})
	}
	return result, remaining
}
