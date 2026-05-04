package handler

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/model"
)

// loadInputResources loads resources by ID and returns them plus image/video counts.
func (h *JobHandler) loadInputResources(ctx context.Context, ids []uint) (resources []model.RawResource, imageCount, videoCount int, err error) {
	result, err := h.service.LoadInputResources(ctx, ids)
	if err != nil {
		return nil, 0, 0, err
	}
	return result.Resources, result.ImageCount, result.VideoCount, nil
}

func buildJobContextSnapshot(mcfg model.AIModelConfig, cred model.AICredential, prompt, extraParams, aspectRatio string, duration int, jobType, featureKey string, inputResources []model.RawResource, createdAt time.Time) string {
	return jobapp.BuildContextSnapshot(jobapp.ContextSnapshotInput{
		Model:          mcfg,
		Credential:     cred,
		JobType:        jobType,
		FeatureKey:     featureKey,
		Prompt:         prompt,
		ExtraParams:    extraParams,
		AspectRatio:    aspectRatio,
		Duration:       duration,
		InputResources: inputResources,
		CreatedAt:      createdAt,
	})
}

func (h *JobHandler) estimateJobCost(modelConfigID uint, jobType string, duration int, extraParams, aspectRatio string) (ai.UsageEstimate, error) {
	kind, imageReq, videoReq, err := jobapp.CostRequest(modelConfigID, jobType, duration, extraParams, aspectRatio)
	if err != nil {
		return ai.UsageEstimate{}, err
	}
	switch kind {
	case "image":
		return h.aiService.EstimateImageCost(modelConfigID, imageReq)
	case "video":
		return h.aiService.EstimateVideoCost(modelConfigID, videoReq)
	default:
		return ai.UsageEstimate{}, err
	}
}

func (h *JobHandler) buildJobResponses(c *gin.Context, jobs []model.Job) []jobapp.Response {
	return h.service.BuildResponses(c.Request.Context(), jobs, func(id uint) string {
		return resourceURL(c, id)
	})
}

func isVideoJob(jobType string) bool {
	return jobapp.IsVideoJob(jobType)
}

func firstNonEmptyHandler(values ...string) string {
	return jobapp.FirstNonEmpty(values...)
}
