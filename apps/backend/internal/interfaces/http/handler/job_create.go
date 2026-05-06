package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/domain/model"
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

	job, err := h.service.EnqueueGeneration(c.Request.Context(), jobapp.EnqueueInput{
		UserID:           user.ID,
		ModelConfigID:    req.ModelConfigID,
		JobType:          req.JobType,
		FeatureKey:       req.FeatureKey,
		Prompt:           req.Prompt,
		ExtraParams:      req.ExtraParams,
		AspectRatio:      req.AspectRatio,
		Duration:         req.Duration,
		InputResourceID:  req.InputResourceID,
		InputResourceIDs: req.InputResourceIDs,
		ProjectID:        req.ProjectID,
		CreatedAt:        time.Now(),
	})
	if err != nil {
		h.writeJobCreateError(c, err)
		return
	}
	c.JSON(http.StatusCreated, h.buildJobResponses(c, []model.Job{job})[0])
}

func (h *JobHandler) writeJobCreateError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, jobapp.ErrJobTypeRequired), errors.Is(err, jobapp.ErrInvalidJobType):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case jobapp.IsInsufficientQuota(err):
		c.JSON(http.StatusPaymentRequired, gin.H{"error": err.Error()})
	case errors.Is(err, jobapp.ErrReserveQuota), errors.Is(err, jobapp.ErrCreateJob):
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	case errors.Is(err, jobapp.ErrLoadInputResources):
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to load input resources: " + err.Error()})
	case errors.Is(err, jobapp.ErrCredentialNotFound):
		c.JSON(http.StatusBadRequest, gin.H{"error": "credential not found"})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	}
}
