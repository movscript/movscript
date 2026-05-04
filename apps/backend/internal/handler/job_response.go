package handler

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
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

// idOrNil returns a slice with the dereferenced uint, or empty if nil.
func idOrNil(id *uint) []uint {
	if id == nil {
		return nil
	}
	return []uint{*id}
}

// mergeIDs combines the array and the optional single ID, deduplicating.
func mergeIDs(arr []uint, single *uint) []uint {
	seen := make(map[uint]bool)
	result := make([]uint, 0, len(arr)+1)
	for _, id := range arr {
		if !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	if single != nil && !seen[*single] {
		result = append(result, *single)
	}
	return result
}

func parseJobInputIDs(job model.Job) []uint {
	var ids []uint
	if job.InputResourceIDs != "" {
		_ = json.Unmarshal([]byte(job.InputResourceIDs), &ids)
	}
	if job.InputResourceID != nil {
		ids = mergeIDs(ids, job.InputResourceID)
	}
	return ids
}

func orderedResources(resources []model.RawResource, ids []uint) []model.RawResource {
	byID := make(map[uint]model.RawResource, len(resources))
	for _, r := range resources {
		byID[r.ID] = r
	}
	ordered := make([]model.RawResource, 0, len(ids))
	seen := make(map[uint]bool, len(ids))
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		if r, ok := byID[id]; ok {
			ordered = append(ordered, r)
		}
	}
	return ordered
}

func buildJobContextSnapshot(mcfg model.AIModelConfig, cred model.AICredential, prompt, extraParams, aspectRatio string, duration int, jobType, featureKey string, inputResources []model.RawResource, createdAt time.Time) string {
	params := jobParamsSnapshot{
		AspectRatio: aspectRatio,
		Duration:    duration,
	}
	if extraParams != "" {
		var parsed map[string]any
		if err := json.Unmarshal([]byte(extraParams), &parsed); err == nil {
			params.ExtraParams = parsed
		}
	}
	resources := make([]jobResourceSnapshot, 0, len(inputResources))
	for _, r := range inputResources {
		resources = append(resources, jobResourceSnapshot{
			ID:       r.ID,
			Name:     r.Name,
			Type:     r.Type,
			MimeType: r.MimeType,
			Size:     r.Size,
		})
	}
	snapshot := jobContextSnapshot{
		Model: jobModelSnapshot{
			ConfigID:     mcfg.ID,
			DisplayName:  jobModelDisplay(mcfg),
			Identifier:   jobModelIdentifier(mcfg),
			ModelDefID:   mcfg.ModelDefID,
			ProviderName: cred.DisplayName,
			CredentialID: mcfg.CredentialID,
		},
		JobType:        jobType,
		FeatureKey:     featureKey,
		Prompt:         prompt,
		Params:         params,
		InputResources: resources,
		CreatedAt:      createdAt,
	}
	b, err := json.Marshal(snapshot)
	if err != nil {
		return ""
	}
	return string(b)
}

func (h *JobHandler) estimateJobCost(modelConfigID uint, jobType string, duration int, extraParams, aspectRatio string) (ai.UsageEstimate, error) {
	extra := map[string]any{}
	if extraParams != "" {
		_ = json.Unmarshal([]byte(extraParams), &extra)
	}
	extra = ai.NormalizeGenerationParams(extra)
	getString := func(key string) string {
		if v, ok := extra[key].(string); ok {
			return v
		}
		return ""
	}
	getInt := func(key string) int {
		if v, ok := extra[key]; ok {
			switch n := v.(type) {
			case float64:
				return int(n)
			case int:
				return n
			case string:
				i, err := strconv.Atoi(n)
				if err == nil {
					return i
				}
			}
		}
		return 0
	}

	switch jobType {
	case ai.CapabilityImage, ai.CapabilityImageEdit:
		return h.aiService.EstimateImageCost(modelConfigID, ai.ImageRequest{
			N:           1,
			AspectRatio: firstNonEmptyHandler(aspectRatio, getString("aspect_ratio")),
		})
	case ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
		dur := duration
		if dur <= 0 {
			dur = getInt("duration")
		}
		return h.aiService.EstimateVideoCost(modelConfigID, ai.VideoRequest{
			Duration:    dur,
			AspectRatio: firstNonEmptyHandler(aspectRatio, getString("aspect_ratio"), getString("ratio")),
		})
	default:
		return ai.UsageEstimate{}, errors.New("unsupported generation job type")
	}
}

func jobModelDisplay(mcfg model.AIModelConfig) string {
	return firstNonEmptyHandler(mcfg.CustomDisplayName, mcfg.ModelDefID, "Model")
}

func jobModelIdentifier(mcfg model.AIModelConfig) string {
	return firstNonEmptyHandler(mcfg.ModelIDOverride, mcfg.ModelDefID)
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
		for _, id := range parseJobInputIDs(jobs[i]) {
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
		inputIDs := parseJobInputIDs(job)
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
	switch jobType {
	case ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
		return true
	default:
		return false
	}
}

func firstNonEmptyHandler(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
