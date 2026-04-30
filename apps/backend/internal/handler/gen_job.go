package handler

import (
	"context"
	"encoding/json"
	"errors"
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

type genJobResponse struct {
	model.GenJob
	InputResources  []model.RawResource  `json:"input_resources,omitempty"`
	ModelConfig     *model.AIModelConfig `json:"model_config,omitempty"`
	ProviderName    string               `json:"provider_name,omitempty"`
	ModelDisplay    string               `json:"model_display,omitempty"`
	ModelIdentifier string               `json:"model_identifier,omitempty"`
}

type genJobContextSnapshot struct {
	Model          genJobModelSnapshot      `json:"model"`
	JobType        string                   `json:"job_type"`
	FeatureKey     string                   `json:"feature_key,omitempty"`
	Prompt         string                   `json:"prompt"`
	Params         genJobParamsSnapshot     `json:"params"`
	InputResources []genJobResourceSnapshot `json:"input_resources,omitempty"`
	CreatedAt      time.Time                `json:"created_at"`
}

type genJobModelSnapshot struct {
	ConfigID     uint   `json:"config_id"`
	DisplayName  string `json:"display_name"`
	Identifier   string `json:"identifier"`
	ModelDefID   string `json:"model_def_id"`
	ProviderName string `json:"provider_name"`
	CredentialID uint   `json:"credential_id"`
}

type genJobParamsSnapshot struct {
	AspectRatio string         `json:"aspect_ratio,omitempty"`
	Duration    int            `json:"duration,omitempty"`
	ExtraParams map[string]any `json:"extra_params,omitempty"`
}

type genJobResourceSnapshot struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	MimeType string `json:"mime_type,omitempty"`
	Size     int64  `json:"size,omitempty"`
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
	inputResources, imageCount, videoCount, err := h.loadInputResources(append(req.InputResourceIDs, idOrNil(req.InputResourceID)...))
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

	var cred model.AICredential
	if err := h.db.First(&cred, mcfg.CredentialID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "credential not found"})
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
	requestContext := buildGenJobContextSnapshot(mcfg, cred, req.Prompt, req.ExtraParams, req.AspectRatio, req.Duration, jobType, req.FeatureKey, orderedResources(inputResources, allIDs), time.Now())
	estimate, err := h.estimateGenJobCost(req.ModelConfigID, jobType, req.Duration, req.ExtraParams, req.AspectRatio)
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

	job := model.GenJob{
		UserID:             user.ID,
		ModelConfigID:      req.ModelConfigID,
		JobType:            jobType,
		FeatureKey:         req.FeatureKey,
		Status:             genjob.StatusPending,
		MaxAttempts:        genjob.DefaultMaxAttempts,
		Prompt:             req.Prompt,
		ExtraParams:        req.ExtraParams,
		AspectRatio:        req.AspectRatio,
		Duration:           req.Duration,
		RequestContext:     requestContext,
		InputResourceID:    legacyInputID,
		InputResourceIDs:   inputResourceIDsJSON,
		UsageReservationID: &reservation.ID,
		ProjectID:          req.ProjectID,
	}
	if err := h.db.Create(&job).Error; err != nil {
		_ = h.aiService.ReleaseReservation(c.Request.Context(), reservation.ID, "gen job create failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = h.aiService.SetReservationGenJob(c.Request.Context(), reservation.ID, job.ID)
	c.JSON(http.StatusCreated, h.buildJobResponses(c, []model.GenJob{job})[0])
}

// loadInputResources loads resources by ID and returns them plus image/video counts.
func (h *GenJobHandler) loadInputResources(ids []uint) (resources []model.RawResource, imageCount, videoCount int, err error) {
	if len(ids) == 0 {
		return nil, 0, 0, nil
	}
	if err := h.db.Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil, 0, 0, err
	}
	for _, r := range resources {
		switch r.Type {
		case "image":
			imageCount++
		case "video":
			videoCount++
		}
	}
	return resources, imageCount, videoCount, nil
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

func parseJobInputIDs(job model.GenJob) []uint {
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

func buildGenJobContextSnapshot(mcfg model.AIModelConfig, cred model.AICredential, prompt, extraParams, aspectRatio string, duration int, jobType, featureKey string, inputResources []model.RawResource, createdAt time.Time) string {
	params := genJobParamsSnapshot{
		AspectRatio: aspectRatio,
		Duration:    duration,
	}
	if extraParams != "" {
		var parsed map[string]any
		if err := json.Unmarshal([]byte(extraParams), &parsed); err == nil {
			params.ExtraParams = parsed
		}
	}
	resources := make([]genJobResourceSnapshot, 0, len(inputResources))
	for _, r := range inputResources {
		resources = append(resources, genJobResourceSnapshot{
			ID:       r.ID,
			Name:     r.Name,
			Type:     r.Type,
			MimeType: r.MimeType,
			Size:     r.Size,
		})
	}
	snapshot := genJobContextSnapshot{
		Model: genJobModelSnapshot{
			ConfigID:     mcfg.ID,
			DisplayName:  genJobModelDisplay(mcfg),
			Identifier:   genJobModelIdentifier(mcfg),
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

func (h *GenJobHandler) estimateGenJobCost(modelConfigID uint, jobType string, duration int, extraParams, aspectRatio string) (ai.UsageEstimate, error) {
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

func genJobModelDisplay(mcfg model.AIModelConfig) string {
	return firstNonEmptyHandler(mcfg.CustomDisplayName, mcfg.ModelDefID, "Model")
}

func genJobModelIdentifier(mcfg model.AIModelConfig) string {
	return firstNonEmptyHandler(mcfg.ModelIDOverride, mcfg.ModelDefID)
}

func (h *GenJobHandler) buildJobResponses(c *gin.Context, jobs []model.GenJob) []genJobResponse {
	if len(jobs) == 0 {
		return []genJobResponse{}
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
	resourcesByID := make(map[uint]model.RawResource, len(resourceIDs))
	if len(resourceIDs) > 0 {
		var resources []model.RawResource
		if err := h.db.Where("id IN ?", resourceIDs).Find(&resources).Error; err == nil {
			for _, r := range resources {
				r.URL = resourceURL(c, r.ID)
				resourcesByID[r.ID] = r
			}
		}
	}

	modelConfigIDs := make([]uint, 0, len(modelConfigIDSet))
	for id := range modelConfigIDSet {
		modelConfigIDs = append(modelConfigIDs, id)
	}
	configsByID := make(map[uint]model.AIModelConfig, len(modelConfigIDs))
	credentialIDSet := make(map[uint]bool)
	if len(modelConfigIDs) > 0 {
		var configs []model.AIModelConfig
		if err := h.db.Where("id IN ?", modelConfigIDs).Find(&configs).Error; err == nil {
			for _, cfg := range configs {
				configsByID[cfg.ID] = cfg
				credentialIDSet[cfg.CredentialID] = true
			}
		}
	}

	credentialIDs := make([]uint, 0, len(credentialIDSet))
	for id := range credentialIDSet {
		credentialIDs = append(credentialIDs, id)
	}
	credentialsByID := make(map[uint]model.AICredential, len(credentialIDs))
	if len(credentialIDs) > 0 {
		var creds []model.AICredential
		if err := h.db.Where("id IN ?", credentialIDs).Find(&creds).Error; err == nil {
			for _, cred := range creds {
				credentialsByID[cred.ID] = cred
			}
		}
	}

	resp := make([]genJobResponse, 0, len(jobs))
	for _, job := range jobs {
		item := genJobResponse{GenJob: job}
		inputIDs := parseJobInputIDs(job)
		item.InputResources = make([]model.RawResource, 0, len(inputIDs))
		seenResources := make(map[uint]bool, len(inputIDs))
		for _, id := range inputIDs {
			if seenResources[id] {
				continue
			}
			seenResources[id] = true
			if r, ok := resourcesByID[id]; ok {
				item.InputResources = append(item.InputResources, r)
			}
		}
		if cfg, ok := configsByID[job.ModelConfigID]; ok {
			cfgCopy := cfg
			item.ModelConfig = &cfgCopy
			item.ModelDisplay = genJobModelDisplay(cfg)
			item.ModelIdentifier = genJobModelIdentifier(cfg)
			if cred, ok := credentialsByID[cfg.CredentialID]; ok {
				item.ProviderName = cred.DisplayName
			}
		}
		resp = append(resp, item)
	}
	return resp
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
	resp := h.buildJobResponses(c, jobs)
	c.Header("X-Total-Count", strconv.FormatInt(total, 10))
	if pageMode {
		c.JSON(http.StatusOK, gin.H{"total": total, "items": resp, "page": page, "page_size": pageSize})
		return
	}
	c.JSON(http.StatusOK, resp)
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

	c.JSON(http.StatusOK, h.buildJobResponses(c, []model.GenJob{job})[0])
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
	if job.UsageReservationID != nil {
		_ = h.aiService.ReleaseReservation(c.Request.Context(), *job.UsageReservationID, "cancelled by user")
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
		if job.UsageReservationID != nil {
			_ = h.aiService.ReleaseReservation(c.Request.Context(), *job.UsageReservationID, "cancelled by user")
		}
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
