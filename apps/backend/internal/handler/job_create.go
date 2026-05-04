package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/model"
)

// Create enqueues a new generation job and returns immediately with status=pending.
func (h *JobHandler) Create(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var req struct {
		ModelConfigID    uint   `json:"model_config_id" binding:"required"`
		JobType          string `json:"job_type"` // image | image_edit | video | video_i2v | video_v2v
		FeatureKey       string `json:"feature_key"`
		Prompt           string `json:"prompt"`
		ExtraParams      string `json:"extra_params"`
		AspectRatio      string `json:"aspect_ratio"`
		Duration         int    `json:"duration"`
		InputResourceID  *uint  `json:"input_resource_id"` // legacy single resource
		InputResourceIDs []uint `json:"input_resource_ids"`
		ProjectID        *uint  `json:"project_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	jobType := req.JobType
	if jobType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "job_type is required"})
		return
	}

	switch jobType {
	case ai.CapabilityImage, ai.CapabilityImageEdit,
		ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid job_type: " + jobType})
		return
	}

	inputResources, imageCount, videoCount, err := h.loadInputResources(c.Request.Context(), append(req.InputResourceIDs, idOrNil(req.InputResourceID)...))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to load input resources: " + err.Error()})
		return
	}

	preflight, err := h.aiService.PreflightGeneration(ai.GenerationPreflightRequest{
		ModelConfigID: req.ModelConfigID,
		OutputType:    jobType,
		ExtraParams:   req.ExtraParams,
		AspectRatio:   req.AspectRatio,
		Duration:      req.Duration,
		ImageCount:    imageCount,
		VideoCount:    videoCount,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	mcfg := preflight.Config

	cred, err := h.service.GetCredential(c.Request.Context(), mcfg.CredentialID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "credential not found"})
		return
	}

	inputResourceIDsJSON := ""
	allIDs := mergeIDs(req.InputResourceIDs, req.InputResourceID)
	if len(allIDs) > 0 {
		b, _ := json.Marshal(allIDs)
		inputResourceIDsJSON = string(b)
	}

	var legacyInputID *uint
	if len(allIDs) > 0 {
		legacyInputID = &allIDs[0]
	}
	requestContext := buildJobContextSnapshot(mcfg, cred, req.Prompt, req.ExtraParams, req.AspectRatio, req.Duration, jobType, req.FeatureKey, orderedResources(inputResources, allIDs), time.Now())
	estimate, err := h.estimateJobCost(req.ModelConfigID, jobType, req.Duration, req.ExtraParams, req.AspectRatio)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	reservation, err := h.aiService.ReserveQuota(c.Request.Context(), user.ID, req.ModelConfigID, estimate, ai.BillingContext{ProjectID: req.ProjectID})
	if err != nil {
		status := http.StatusPaymentRequired
		if !errors.Is(err, ai.ErrInsufficientQuota) {
			status = http.StatusInternalServerError
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	job, err := h.service.Create(c.Request.Context(), jobapp.CreateInput{
		UserID:             user.ID,
		ModelConfigID:      req.ModelConfigID,
		JobType:            jobType,
		FeatureKey:         req.FeatureKey,
		Prompt:             req.Prompt,
		ExtraParams:        req.ExtraParams,
		AspectRatio:        req.AspectRatio,
		Duration:           req.Duration,
		RequestContext:     requestContext,
		InputResourceID:    legacyInputID,
		InputResourceIDs:   inputResourceIDsJSON,
		UsageReservationID: &reservation.ID,
		ProjectID:          req.ProjectID,
	})
	if err != nil {
		_ = h.aiService.ReleaseReservation(c.Request.Context(), reservation.ID, "gen job create failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = h.aiService.SetReservationJob(c.Request.Context(), reservation.ID, job.ID)
	c.JSON(http.StatusCreated, h.buildJobResponses(c, []model.Job{job})[0])
}
