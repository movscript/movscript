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

func jobModelDisplay(mcfg model.AIModelConfig) string {
	return jobapp.ModelDisplay(mcfg)
}

func jobModelIdentifier(mcfg model.AIModelConfig) string {
	return jobapp.ModelIdentifier(mcfg)
}

func (h *JobHandler) buildJobResponses(c *gin.Context, jobs []model.Job) []jobResponse {
	if len(jobs) == 0 {
		return []jobResponse{}
	}

	resourceIDSet := make(map[uint]bool)
	modelConfigIDSet := make(map[uint]bool)
	for i := range jobs {
		if jobs[i].OutputResource != nil {
			jobs[i].OutputResource.URL = resourceURL(c, jobs[i].OutputResource.ID)
		}
		modelConfigIDSet[jobs[i].ModelConfigID] = true
		for _, id := range jobapp.ParseInputIDs(jobs[i]) {
			resourceIDSet[id] = true
		}
	}

	resourceIDs := make([]uint, 0, len(resourceIDSet))
	for id := range resourceIDSet {
		resourceIDs = append(resourceIDs, id)
	}

	modelConfigIDs := make([]uint, 0, len(modelConfigIDSet))
	for id := range modelConfigIDSet {
		modelConfigIDs = append(modelConfigIDs, id)
	}
	lookups, err := h.service.ResponseLookups(c.Request.Context(), resourceIDs, modelConfigIDs)
	if err != nil {
		return []jobResponse{}
	}
	for id, resource := range lookups.ResourcesByID {
		resource.URL = resourceURL(c, resource.ID)
		lookups.ResourcesByID[id] = resource
	}

	resp := make([]jobResponse, 0, len(jobs))
	for _, job := range jobs {
		item := jobResponse{Job: job}
		inputIDs := jobapp.ParseInputIDs(job)
		item.InputResources = make([]model.RawResource, 0, len(inputIDs))
		seenResources := make(map[uint]bool, len(inputIDs))
		for _, id := range inputIDs {
			if seenResources[id] {
				continue
			}
			seenResources[id] = true
			if r, ok := lookups.ResourcesByID[id]; ok {
				item.InputResources = append(item.InputResources, r)
			}
		}
		if cfg, ok := lookups.ConfigsByID[job.ModelConfigID]; ok {
			cfgCopy := cfg
			item.ModelConfig = &cfgCopy
			item.ModelDisplay = jobModelDisplay(cfg)
			item.ModelIdentifier = jobModelIdentifier(cfg)
			if cred, ok := lookups.CredentialsByID[cfg.CredentialID]; ok {
				item.ProviderName = cred.DisplayName
			}
		}
		resp = append(resp, item)
	}
	return resp
}

func isVideoJob(jobType string) bool {
	return jobapp.IsVideoJob(jobType)
}

func firstNonEmptyHandler(values ...string) string {
	return jobapp.FirstNonEmpty(values...)
}
