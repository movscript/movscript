package ai

import (
	"context"
	"fmt"
	"time"
)

type OfficialVideoGenerationsAdapter struct {
	openai *OpenAIAdapter
}

func NewOfficialVideoGenerationsAdapter(apiKey, baseURL string) *OfficialVideoGenerationsAdapter {
	return &OfficialVideoGenerationsAdapter{
		openai: NewOpenAIAdapter(baseURL, apiKey),
	}
}

func (a *OfficialVideoGenerationsAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	return a.openai.TextGenerate(ctx, req)
}

func (a *OfficialVideoGenerationsAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	return a.openai.ImageGenerate(ctx, req)
}

func (a *OfficialVideoGenerationsAdapter) Ping(ctx context.Context) error {
	return a.openai.Ping(ctx)
}

func (a *OfficialVideoGenerationsAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
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

func (a *OfficialVideoGenerationsAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	return a.openai.officialVideoGenerationsStart(ctx, req)
}

func (a *OfficialVideoGenerationsAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	return a.openai.VideoPoll(ctx, req)
}
