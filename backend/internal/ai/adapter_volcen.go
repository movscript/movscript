package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
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

func NewVolcenAdapter(baseURL, apiKey string) *VolcenAdapter {
	if baseURL == "" {
		baseURL = "https://ark.cn-beijing.volces.com/api/v3"
	}
	c := arkruntime.NewClientWithApiKey(apiKey,
		arkruntime.WithBaseUrl(baseURL),
		arkruntime.WithHTTPClient(&http.Client{Timeout: 30 * time.Second}),
	)
	return &VolcenAdapter{baseURL: baseURL, client: c}
}

func (a *VolcenAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	msgs := make([]*arkmodel.ChatCompletionMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		role := m.Role
		content := arkmodel.ChatCompletionMessageContent{StringValue: &m.Content}
		msgs = append(msgs, &arkmodel.ChatCompletionMessage{
			Role:    role,
			Content: &content,
		})
	}

	arkReq := arkmodel.CreateChatCompletionRequest{
		Model:    req.Model,
		Messages: msgs,
	}
	if req.MaxTokens > 0 {
		n := req.MaxTokens
		arkReq.MaxTokens = &n
	}

	resp, err := a.client.CreateChatCompletion(ctx, arkReq)
	if err != nil {
		return TextResponse{}, fmt.Errorf("volcen text: %w", err)
	}
	if len(resp.Choices) == 0 {
		return TextResponse{}, fmt.Errorf("volcen text: no choices in response")
	}
	text := ""
	if c := resp.Choices[0].Message.Content; c != nil && c.StringValue != nil {
		text = *c.StringValue
	}
	return TextResponse{
		Content: text,
		Usage: TokenUsage{
			InputTokens:  resp.Usage.PromptTokens,
			OutputTokens: resp.Usage.CompletionTokens,
		},
		Debug: takeDebug(ctx),
	}, nil
}

func (a *VolcenAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	arkReq := arkmodel.GenerateImagesRequest{
		Model:  req.Model,
		Prompt: req.Prompt,
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

	debugBody := map[string]any{"model": req.Model, "prompt": req.Prompt}
	if arkReq.Size != nil {
		debugBody["size"] = *arkReq.Size
	}
	debugBodyJSON, _ := json.Marshal(debugBody)
	debugEndpoint := a.baseURL + "/images/generations"

	start := time.Now()
	resp, err := a.client.GenerateImages(ctx, arkReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: req.Model,
			Endpoint: debugEndpoint, Method: "POST",
			RequestBody: string(debugBodyJSON),
			LatencyMs:   latency, Error: err.Error(),
		})
		return ImageResponse{}, fmt.Errorf("volcen image: %w", err)
	}
	if resp.Error != nil {
		recordDebug(ctx, DebugCallResult{
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
	recordDebug(ctx, DebugCallResult{
		Success: true, ModelID: req.Model,
		Endpoint: debugEndpoint, Method: "POST",
		RequestBody:    string(debugBodyJSON),
		ResponseStatus: http.StatusOK,
		ResponseBody:   fmt.Sprintf(`{"images":%d}`, len(urls)),
		LatencyMs:      latency,
	})
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
}

// VideoGenerate creates an async Seedance video task and polls until completion.
func (a *VolcenAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
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
			videoURL = "data:" + vd.MimeType + ";base64," + base64Encode(vd.Bytes)
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
	if req.Duration > 0 {
		dur := int64(req.Duration)
		createReq.Duration = &dur
	}
	if req.AspectRatio != "" {
		createReq.Ratio = &req.AspectRatio
	}

	// Build synthetic debug body: represent what was sent to the SDK.
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
	if req.Duration > 0 {
		debugBody["duration"] = req.Duration
	}
	if req.AspectRatio != "" {
		debugBody["aspect_ratio"] = req.AspectRatio
	}
	debugBodyJSON, _ := json.Marshal(debugBody)
	debugEndpoint := a.baseURL + "/content_generation/tasks"

	start := time.Now()
	taskResp, err := a.client.CreateContentGenerationTask(ctx, createReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: req.Model,
			Endpoint: debugEndpoint, Method: "POST",
			RequestBody: string(debugBodyJSON),
			LatencyMs:   latency, Error: err.Error(),
		})
		return VideoResponse{}, fmt.Errorf("volcen create task: %w", err)
	}
	taskID := taskResp.ID
	recordDebug(ctx, DebugCallResult{
		Success: true, ModelID: req.Model,
		Endpoint: debugEndpoint, Method: "POST",
		RequestBody:    string(debugBodyJSON),
		ResponseStatus: http.StatusOK,
		ResponseBody:   fmt.Sprintf(`{"task_id":%q,"status":"running"}`, taskID),
		LatencyMs:      latency,
	})

	// Poll: 5s × 24 = up to 2 minutes.
	for i := 0; i < 24; i++ {
		select {
		case <-ctx.Done():
			return VideoResponse{}, ctx.Err()
		case <-time.After(5 * time.Second):
		}

		pollResp, pollErr := a.client.GetContentGenerationTask(ctx, arkmodel.GetContentGenerationTaskRequest{ID: taskID})
		if pollErr != nil {
			return VideoResponse{}, fmt.Errorf("volcen poll task: %w", pollErr)
		}

		switch pollResp.Status {
		case arkmodel.StatusSucceeded:
			url := pollResp.Content.VideoURL
			if url == "" {
				return VideoResponse{}, fmt.Errorf("task succeeded but no video URL in response")
			}
			durSec := 0
			if pollResp.Duration != nil {
				durSec = int(*pollResp.Duration)
			}
			return VideoResponse{URL: url, DurationSec: durSec, TaskID: taskID, Debug: takeDebug(ctx)}, nil
		case arkmodel.StatusFailed, arkmodel.StatusCancelled:
			msg := "video generation failed"
			if pollResp.Error != nil {
				msg = pollResp.Error.Message
			}
			return VideoResponse{}, fmt.Errorf("%s", msg)
		}
	}
	return VideoResponse{}, fmt.Errorf("video generation timed out (task %s)", taskID)
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
