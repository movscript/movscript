package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	jobapp "github.com/movscript/movscript/internal/app/job"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
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
		Title            string `json:"title"`
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
		OrgID:            currentOrgID(c),
		ModelConfigID:    req.ModelConfigID,
		JobType:          req.JobType,
		FeatureKey:       req.FeatureKey,
		Title:            req.Title,
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
	c.JSON(http.StatusCreated, h.buildJobResponses(c, []domainjob.Job{job})[0])
}

func (h *JobHandler) writeJobCreateError(c *gin.Context, err error) {
	var validationErr *ai.ValidationError
	switch {
	case errors.As(err, &validationErr):
		body := gin.H{
			"error":   validationErr.Message,
			"code":    validationErr.Code,
			"details": validationErr,
		}
		if validationErr.Field != "" {
			body["field"] = validationErr.Field
		}
		if len(validationErr.AllowedValues) > 0 {
			body["allowed_values"] = validationErr.AllowedValues
		}
		if len(validationErr.SuggestedFix) > 0 {
			body["suggested_fix"] = validationErr.SuggestedFix
		}
		if validationErr.RequiredMin != nil {
			body["required_min"] = *validationErr.RequiredMin
		}
		if validationErr.AllowedMax != nil {
			body["allowed_max"] = *validationErr.AllowedMax
		}
		if validationErr.ActualCount != nil {
			body["actual_count"] = *validationErr.ActualCount
		}
		c.JSON(http.StatusBadRequest, body)
	case errors.Is(err, jobapp.ErrJobTypeRequired), errors.Is(err, jobapp.ErrInvalidJobType):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, jobapp.ErrProjectNotFound):
		c.JSON(http.StatusBadRequest, gin.H{"error": "project not found"})
	case errors.Is(err, jobapp.ErrProjectOutsideOrg):
		c.JSON(http.StatusForbidden, gin.H{"error": "project is outside current workspace"})
	case errors.Is(err, jobapp.ErrResourceOutsideOrg):
		c.JSON(http.StatusForbidden, gin.H{"error": "input resource is outside current workspace"})
	case jobapp.IsUsageLimitExceeded(err):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "USAGE_LIMIT_EXCEEDED"})
	case errors.Is(err, jobapp.ErrReserveUsage), errors.Is(err, jobapp.ErrCreateJob):
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	case errors.Is(err, jobapp.ErrLoadInputResources):
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to load input resources: " + err.Error()})
	case errors.Is(err, jobapp.ErrCredentialNotFound):
		c.JSON(http.StatusBadRequest, gin.H{"error": "credential not found"})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	}
}
