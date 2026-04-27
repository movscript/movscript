package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/genjob"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type GenJobHandler struct {
	db        *gorm.DB
	aiService *ai.AIService
}

func NewGenJobHandler(db *gorm.DB, aiService *ai.AIService) *GenJobHandler {
	return &GenJobHandler{db: db, aiService: aiService}
}

// Create enqueues a new generation job and returns immediately with status=pending.
func (h *GenJobHandler) Create(c *gin.Context) {
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

	// Validate job_type value.
	switch jobType {
	case ai.CapabilityImage, ai.CapabilityImageEdit,
		ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid job_type: " + jobType})
		return
	}

	// Resolve input resource counts for capability validation.
	imageCount, videoCount, err := h.countInputResources(append(req.InputResourceIDs, idOrNil(req.InputResourceID)...))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to load input resources: " + err.Error()})
		return
	}

	// Load model def and validate capability match.
	var mcfg model.AIModelConfig
	if err := h.db.First(&mcfg, req.ModelConfigID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "model config not found"})
		return
	}
	var cred model.AICredential
	if err := h.db.First(&cred, mcfg.CredentialID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "credential not found"})
		return
	}
	def := ai.ResolveModelDef(mcfg.ModelDefID, cred.AdapterType, mcfg.CustomDisplayName, mcfg.CustomCapabilities, mcfg.CustomBillingMode, mcfg.CustomAcceptsImage, mcfg.CustomMaxInputImages, mcfg.CustomMaxInputVideos, mcfg.CustomImageEditField, mcfg.CustomSupportedParams)
	if valErr := ai.ValidateGenRequest(def, ai.GenRequest{
		ModelConfigID: req.ModelConfigID,
		OutputType:    jobType,
		ImageCount:    imageCount,
		VideoCount:    videoCount,
	}); valErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": valErr.Error()})
		return
	}
	if valErr := ai.ValidateGenerationParams(def, jobType, req.ExtraParams, req.AspectRatio, req.Duration); valErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": valErr.Error()})
		return
	}

	// Encode input resource IDs array.
	inputResourceIDsJSON := ""
	allIDs := mergeIDs(req.InputResourceIDs, req.InputResourceID)
	if len(allIDs) > 0 {
		b, _ := json.Marshal(allIDs)
		inputResourceIDsJSON = string(b)
	}

	// Keep legacy single ID for backward compat.
	var legacyInputID *uint
	if len(allIDs) > 0 {
		legacyInputID = &allIDs[0]
	}

	job := model.GenJob{
		UserID:           user.ID,
		ModelConfigID:    req.ModelConfigID,
		JobType:          jobType,
		FeatureKey:       req.FeatureKey,
		Status:           genjob.StatusPending,
		MaxAttempts:      genjob.DefaultMaxAttempts,
		Prompt:           req.Prompt,
		ExtraParams:      req.ExtraParams,
		AspectRatio:      req.AspectRatio,
		Duration:         req.Duration,
		InputResourceID:  legacyInputID,
		InputResourceIDs: inputResourceIDsJSON,
		ProjectID:        req.ProjectID,
	}
	if err := h.db.Create(&job).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, job)
}

// countInputResources loads resources by ID and returns image and video counts.
func (h *GenJobHandler) countInputResources(ids []uint) (imageCount, videoCount int, err error) {
	if len(ids) == 0 {
		return 0, 0, nil
	}
	var resources []model.RawResource
	if err := h.db.Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return 0, 0, err
	}
	for _, r := range resources {
		switch r.Type {
		case "image":
			imageCount++
		case "video":
			videoCount++
		}
	}
	return imageCount, videoCount, nil
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

// List returns the current user's generation jobs (newest first).
func (h *GenJobHandler) List(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	pageMode := c.Query("page") != "" || c.Query("page_size") != ""
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", strconv.Itoa(pageSize)))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	if pageMode {
		limit = pageSize
		offset = (page - 1) * pageSize
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	q := h.db.Model(&model.GenJob{}).Where("user_id = ?", user.ID)
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if featureKey := c.Query("feature"); featureKey != "" {
		q = q.Where("feature_key = ?", featureKey)
	}
	if jobType := c.Query("type"); jobType != "" {
		// "image" also includes "image_edit" jobs since they're the same from the user's perspective.
		// Callers that need exact category tabs can pass exact_type=1.
		if jobType == "image" && c.Query("exact_type") != "1" {
			q = q.Where("job_type IN ?", []string{"image", "image_edit"})
		} else {
			q = q.Where("job_type = ?", jobType)
		}
	}

	var total int64
	q.Count(&total)

	var jobs []model.GenJob
	q.Preload("OutputResource").Order("id desc").Limit(limit).Offset(offset).Find(&jobs)

	for i := range jobs {
		if jobs[i].OutputResource != nil {
			jobs[i].OutputResource.URL = resourceURL(c, jobs[i].OutputResource.ID)
		}
	}
	c.Header("X-Total-Count", strconv.FormatInt(total, 10))
	if pageMode {
		c.JSON(http.StatusOK, gin.H{"total": total, "items": jobs, "page": page, "page_size": pageSize})
		return
	}
	c.JSON(http.StatusOK, jobs)
}

// Get returns a single job by ID with its output resource.
func (h *GenJobHandler) Get(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var job model.GenJob
	if err := h.db.Preload("OutputResource").First(&job, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if job.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	if job.OutputResource != nil {
		job.OutputResource.URL = resourceURL(c, job.OutputResource.ID)
	}
	c.JSON(http.StatusOK, job)
}

// Retry requeues a failed generation job for manual retry.
func (h *GenJobHandler) Retry(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var job model.GenJob
	if err := h.db.First(&job, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if job.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	if job.Status == genjob.StatusSucceeded {
		c.JSON(http.StatusConflict, gin.H{"error": "succeeded jobs cannot be retried"})
		return
	}
	if job.Status == genjob.StatusRunning {
		c.JSON(http.StatusConflict, gin.H{"error": "running jobs cannot be retried until they fail or time out"})
		return
	}

	now := time.Now()
	maxAttempts := job.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = genjob.DefaultMaxAttempts
	}
	if err := h.db.Model(&job).Updates(map[string]any{
		"status":                genjob.StatusPending,
		"attempt_count":         0,
		"max_attempts":          maxAttempts,
		"error_msg":             "",
		"next_run_at":           &now,
		"finished_at":           nil,
		"last_heartbeat_at":     nil,
		"output_resource_id":    nil,
		"provider_task_id":      "",
		"provider_task_kind":    "",
		"provider_task_status":  "",
		"provider_task_history": "",
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	genjob.MarkRetryScheduled(h.db, &job, "manual retry requested")

	if err := h.db.Preload("OutputResource").First(&job, job.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, job)
}

// Cancel requests cancellation for a video generation job.
// Provider-side cancellation is currently supported for Volcengine async video tasks.
func (h *GenJobHandler) Cancel(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var job model.GenJob
	if err := h.db.First(&job, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if job.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	if !isVideoGenJob(job.JobType) {
		c.JSON(http.StatusConflict, gin.H{"error": "only video generation jobs can be cancelled"})
		return
	}
	switch job.Status {
	case genjob.StatusCancelled:
		c.JSON(http.StatusOK, job)
		return
	case genjob.StatusSucceeded, genjob.StatusFailed:
		c.JSON(http.StatusConflict, gin.H{"error": "finished jobs cannot be cancelled"})
		return
	case genjob.StatusPending, genjob.StatusRunning:
	default:
		c.JSON(http.StatusConflict, gin.H{"error": "job cannot be cancelled from status " + job.Status})
		return
	}
	if !h.aiService.SupportsVideoTaskCancellation(job.ModelConfigID) {
		c.JSON(http.StatusConflict, gin.H{"error": "this provider does not support video task cancellation"})
		return
	}

	providerStatus := ai.VideoStatusCancelled
	message := "cancelled by user"
	if job.ProviderTaskID != "" {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
		defer cancel()
		resp, err := h.aiService.CallVideoCancel(ctx, job.ModelConfigID, job.ProviderTaskID, job.ProviderTaskKind)
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "provider cancellation failed: " + err.Error()})
			return
		}
		providerStatus = firstNonEmptyHandler(resp.Status, ai.VideoStatusCancelled)
		message = firstNonEmptyHandler(resp.Message, message)
	}

	now := time.Now()
	if err := h.db.Model(&job).Updates(map[string]any{
		"status":               genjob.StatusCancelled,
		"provider_task_status": providerStatus,
		"error_msg":            message,
		"next_run_at":          nil,
		"finished_at":          &now,
		"last_heartbeat_at":    &now,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.db.Preload("OutputResource").First(&job, job.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, job)
}

// Delete cancels a pending job or removes a finished job record.
func (h *GenJobHandler) Delete(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var job model.GenJob
	if err := h.db.First(&job, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if job.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	// Only cancel pending jobs; running jobs should use the explicit cancel endpoint.
	if job.Status == genjob.StatusPending {
		now := time.Now()
		h.db.Model(&job).Updates(map[string]any{
			"status":            genjob.StatusCancelled,
			"error_msg":         "cancelled by user",
			"finished_at":       &now,
			"next_run_at":       nil,
			"last_heartbeat_at": &now,
		})
	} else if job.Status == genjob.StatusRunning {
		c.JSON(http.StatusConflict, gin.H{"error": "running jobs must be cancelled before deletion"})
		return
	} else {
		h.db.Delete(&job)
	}
	c.Status(http.StatusNoContent)
}

func isVideoGenJob(jobType string) bool {
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
