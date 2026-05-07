package jobrunner

import (
	"context"
	"fmt"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

type providerResult struct {
	URL      string
	MimeType string
}

func (w *Worker) runImageJob(ctx context.Context, job *persistencemodel.Job, params generationParams, imageData []ai.MediaData, sm *jobStateMachine) (providerResult, error) {
	cloudFileID := w.prepareImageInputReferences(job, imageData)
	req := w.buildImageRequest(job, params, imageData, cloudFileID)
	if len(imageData) > 0 {
		if cloudFileID == "" && imageData[0].PresignedURL != "" {
			req.InputImage = imageData[0].PresignedURL
		} else if cloudFileID == "" {
			req.InputImageBytes = imageData[0].Bytes
			req.InputImageMime = imageData[0].MimeType
		}
	}
	sm.enter(StateCallingProvider, "call image provider")
	resp, err := callProviderWithTimeout(ctx, providerCallTimeout, func(ctx context.Context) (ai.ImageResponse, error) {
		return w.aiService.CallImageWithUsage(ctx, job.UserID, job.ModelConfigID, req, w.usageContext(job))
	})
	if err != nil {
		return providerResult{}, fmt.Errorf("image generation: %w", err)
	}
	sm.succeed("image provider returned")
	if len(resp.URLs) == 0 {
		return providerResult{}, fmt.Errorf("no image URL returned by provider")
	}
	return providerResult{URL: resp.URLs[0], MimeType: "image/png"}, nil
}

func (w *Worker) runImageEditJob(ctx context.Context, job *persistencemodel.Job, params generationParams, imageData []ai.MediaData, sm *jobStateMachine) (providerResult, error) {
	if len(imageData) == 0 {
		return providerResult{}, fmt.Errorf("image_edit job requires an image input but none was found (job #%d)", job.ID)
	}
	cloudFileID := w.prepareImageInputReferences(job, imageData)
	req := w.buildImageRequest(job, params, imageData, cloudFileID)
	if cloudFileID == "" {
		firstImage := imageData[0]
		if firstImage.PresignedURL != "" {
			req.InputImage = firstImage.PresignedURL
		} else {
			req.InputImageBytes = firstImage.Bytes
			req.InputImageMime = firstImage.MimeType
		}
	}
	sm.enter(StateCallingProvider, "call image edit provider")
	resp, err := callProviderWithTimeout(ctx, providerCallTimeout, func(ctx context.Context) (ai.ImageResponse, error) {
		return w.aiService.CallImageWithUsage(ctx, job.UserID, job.ModelConfigID, req, w.usageContext(job))
	})
	if err != nil {
		return providerResult{}, fmt.Errorf("image generation: %w", err)
	}
	sm.succeed("image edit provider returned")
	if len(resp.URLs) == 0 {
		return providerResult{}, fmt.Errorf("no image URL returned by provider")
	}
	return providerResult{URL: resp.URLs[0], MimeType: "image/png"}, nil
}

func (w *Worker) buildImageRequest(job *persistencemodel.Job, params generationParams, imageData []ai.MediaData, cloudFileID string) ai.ImageRequest {
	return ai.ImageRequest{
		Prompt:              job.Prompt,
		N:                   1,
		Size:                params.String("size"),
		Quality:             params.String("quality"),
		Style:               params.String("style"),
		AspectRatio:         firstNonEmpty(job.AspectRatio, params.String("aspect_ratio")),
		Seed:                params.Int64Ptr("seed"),
		GuidanceScale:       params.Float("guidance_scale"),
		Watermark:           params.BoolPtr("watermark"),
		OutputFormat:        params.String("output_format"),
		SequentialMode:      params.String("sequential_image_generation"),
		SequentialMaxImages: params.Int("max_images"),
		WebSearch:           params.Bool("web_search"),
		OptimizePromptMode:  params.String("optimize_prompt_mode"),
		InputImageDataList:  imageData,
		CloudFileID:         cloudFileID,
	}
}
