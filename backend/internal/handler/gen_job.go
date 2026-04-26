package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

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
		ModelConfigID    uint    `json:"model_config_id" binding:"required"`
		JobType          string  `json:"job_type"`           // image | image_edit | video | video_i2v | video_v2v
		Prompt           string  `json:"prompt"`
		ExtraParams      string  `json:"extra_params"`
		AspectRatio      string  `json:"aspect_ratio"`
		Duration         int     `json:"duration"`
		InputResourceID  *uint   `json:"input_resource_id"` // legacy single resource
		InputResourceIDs []uint  `json:"input_resource_ids"`
		ProjectID        *uint   `json:"project_id"`
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
		ModelConfigID:   req.ModelConfigID,
		OutputType:      jobType,
		ImageCount:      imageCount,
		VideoCount:      videoCount,
	}); valErr != nil {
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
		Status:           genjob.StatusPending,
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

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	q := h.db.Where("user_id = ?", user.ID)
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if jobType := c.Query("type"); jobType != "" {
		// "image" also includes "image_edit" jobs since they're the same from the user's perspective.
		if jobType == "image" {
			q = q.Where("job_type IN ?", []string{"image", "image_edit"})
		} else {
			q = q.Where("job_type = ?", jobType)
		}
	}

	var jobs []model.GenJob
	q.Preload("OutputResource").Order("id desc").Limit(limit).Offset(offset).Find(&jobs)

	for i := range jobs {
		if jobs[i].OutputResource != nil {
			jobs[i].OutputResource.URL = resourceURL(c, jobs[i].OutputResource.ID)
		}
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

	// Only cancel pending jobs; running jobs are let to complete naturally.
	if job.Status == genjob.StatusPending {
		h.db.Model(&job).Update("status", genjob.StatusFailed)
	} else {
		h.db.Delete(&job)
	}
	c.Status(http.StatusNoContent)
}

