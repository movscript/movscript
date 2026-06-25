package handler

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	appresource "github.com/movscript/movscript/internal/app/resource"
	appshotreference "github.com/movscript/movscript/internal/app/shotreference"
	domainshotreference "github.com/movscript/movscript/internal/domain/shotreference"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/observability"
	"github.com/movscript/movscript/internal/infra/storage"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

type ShotReferenceHandler struct {
	service        *appshotreference.Service
	maxUploadBytes int64
}

func NewShotReferenceHandler(db *gorm.DB, store storage.Storage, verifier ai.ImageVerificationClient, maxUploadBytes int64, cacheStore ...cache.Cache) *ShotReferenceHandler {
	return NewShotReferenceHandlerWithVectorIndex(db, store, verifier, nil, maxUploadBytes, cacheStore...)
}

func NewShotReferenceHandlerWithVectorIndex(db *gorm.DB, store storage.Storage, verifier ai.ImageVerificationClient, vectors providercontract.VectorIndexProvider, maxUploadBytes int64, cacheStore ...cache.Cache) *ShotReferenceHandler {
	return &ShotReferenceHandler{
		service:        appshotreference.NewServiceWithVectorIndex(db, store, verifier, vectors, cacheStore...),
		maxUploadBytes: maxUploadBytes,
	}
}

func (h *ShotReferenceHandler) List(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	page, err := h.service.List(c.Request.Context(), domainshotreference.ListInput{
		UserID:   user.ID,
		OrgID:    currentOrgID(c),
		Query:    c.Query("q"),
		GroupID:  optionalID(c.Query("group_id")),
		Page:     parseInt(c.DefaultQuery("page", "1")),
		PageSize: parseInt(c.DefaultQuery("page_size", "30")),
	})
	if err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	c.JSON(http.StatusOK, page)
}

func (h *ShotReferenceHandler) CreateGroup(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req createShotReferenceGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, shotReferenceErrorBody("invalid request", "group_create"))
		return
	}
	group, err := h.service.CreateGroup(c.Request.Context(), appshotreference.CreateGroupInput{
		UserID:      user.ID,
		OrgID:       currentOrgID(c),
		ResourceID:  req.ResourceID,
		Title:       req.Title,
		Summary:     req.Summary,
		CutStrategy: req.CutStrategy,
	})
	if err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, group)
}

func (h *ShotReferenceHandler) GetGroup(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	detail, err := h.service.GetGroupDetail(c.Request.Context(), parseID(c.Param("id")), domainshotreference.ListInput{
		UserID: user.ID,
		OrgID:  currentOrgID(c),
	})
	if err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (h *ShotReferenceHandler) AdminVectorStats(c *gin.Context) {
	stats, err := h.service.VectorStats(c.Request.Context())
	if err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *ShotReferenceHandler) AdminVectorSearch(c *gin.Context) {
	topK := parseInt(c.DefaultQuery("top_k", "20"))
	if topK <= 0 {
		topK = 20
	}
	results, err := h.service.SearchVectorDocuments(c.Request.Context(), domainshotreference.VectorSearchRequest{
		Query:     c.Query("q"),
		Locale:    c.DefaultQuery("locale", "zh-CN"),
		SourceIDs: c.QueryArray("source_id"),
		TopK:      topK,
	})
	if err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": results})
}

func (h *ShotReferenceHandler) AdminVectorMetrics(c *gin.Context) {
	c.JSON(http.StatusOK, observability.DefaultVectorMetrics().Snapshot())
}

func (h *ShotReferenceHandler) AdminVectorReindex(c *gin.Context) {
	count, err := h.service.AdminReindexVectorDocuments(c.Request.Context())
	if err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	stats, err := h.service.VectorStats(c.Request.Context())
	if err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"reindexed": count, "stats": stats})
}

func (h *ShotReferenceHandler) UploadAnalyze(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	if h.maxUploadBytes > 0 {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, h.maxUploadBytes)
	}
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		if uploadTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, shotReferenceErrorBody("file too large", "read_upload"))
			return
		}
		c.JSON(http.StatusBadRequest, shotReferenceErrorBody("file required", "read_upload"))
		return
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		if uploadTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, shotReferenceErrorBody("file too large", "read_upload"))
			return
		}
		c.JSON(http.StatusInternalServerError, shotReferenceErrorBody("failed to read file", "read_upload"))
		return
	}
	reference, err := h.service.UploadAndAnalyze(c.Request.Context(), appshotreference.UploadInput{
		UserID:      user.ID,
		OrgID:       currentOrgID(c),
		Filename:    header.Filename,
		MimeType:    header.Header.Get("Content-Type"),
		Size:        header.Size,
		Data:        data,
		DurationSec: optionalFloat(c.PostForm("duration_sec")),
		Width:       parseInt(c.PostForm("width")),
		Height:      parseInt(c.PostForm("height")),
	})
	if err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, reference)
}

func (h *ShotReferenceHandler) CreateFromResource(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req createShotReferencesFromResourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, shotReferenceErrorBody("invalid request", "manual_create"))
		return
	}
	references, err := h.service.CreateFromResource(c.Request.Context(), appshotreference.CreateFromResourceInput{
		UserID:      user.ID,
		OrgID:       currentOrgID(c),
		ResourceID:  req.ResourceID,
		GroupID:     req.GroupID,
		GroupTitle:  req.GroupTitle,
		DurationSec: req.DurationSec,
		Width:       req.Width,
		Height:      req.Height,
		Shots:       patchRequestsToUpdateInputs(req.Shots),
	})
	if err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"items": references, "total": len(references)})
}

func (h *ShotReferenceHandler) Delete(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	if err := h.service.Delete(c.Request.Context(), parseID(c.Param("id")), domainshotreference.ListInput{
		UserID: user.ID,
		OrgID:  currentOrgID(c),
	}); err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *ShotReferenceHandler) Patch(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req patchShotReferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, shotReferenceErrorBody("invalid request", "manual_update"))
		return
	}
	reference, err := h.service.Update(c.Request.Context(), parseID(c.Param("id")), domainshotreference.ListInput{
		UserID: user.ID,
		OrgID:  currentOrgID(c),
	}, req.toUpdateInput())
	if err != nil {
		h.writeShotReferenceError(c, err)
		return
	}
	c.JSON(http.StatusOK, reference)
}

type patchShotReferenceRequest struct {
	Title             *string                                `json:"title"`
	Summary           *string                                `json:"summary"`
	Intent            *[]string                              `json:"intent"`
	Pattern           *[]string                              `json:"pattern"`
	ShotFunction      *[]string                              `json:"shot_function"`
	VisualPreference  *[]string                              `json:"visual_preference"`
	EmotionalEffect   *[]string                              `json:"emotional_effect"`
	StartSec          *float64                               `json:"start_sec"`
	StartSecSet       *bool                                  `json:"start_sec_set"`
	EndSec            *float64                               `json:"end_sec"`
	EndSecSet         *bool                                  `json:"end_sec_set"`
	ExecutionDetails  *domainshotreference.ExecutionDetails  `json:"execution_details"`
	VisualAnalysis    *domainshotreference.VisualAnalysis    `json:"visual_analysis"`
	SceneSemantics    *domainshotreference.SceneSemantics    `json:"scene_semantics"`
	NarrativeFunction *domainshotreference.NarrativeFunction `json:"narrative_function"`
	EmotionalProfile  *domainshotreference.EmotionalProfile  `json:"emotional_profile"`
	ReusablePattern   *domainshotreference.ReusablePattern   `json:"reusable_pattern"`
}

type createShotReferencesFromResourceRequest struct {
	ResourceID  uint                        `json:"resource_id"`
	GroupID     *uint                       `json:"group_id"`
	GroupTitle  string                      `json:"group_title"`
	DurationSec *float64                    `json:"duration_sec"`
	Width       int                         `json:"width"`
	Height      int                         `json:"height"`
	Shots       []patchShotReferenceRequest `json:"shots"`
}

type createShotReferenceGroupRequest struct {
	ResourceID  uint   `json:"resource_id"`
	Title       string `json:"title"`
	Summary     string `json:"summary"`
	CutStrategy string `json:"cut_strategy"`
}

func (req patchShotReferenceRequest) toUpdateInput() domainshotreference.UpdateInput {
	input := domainshotreference.UpdateInput{
		Title:   req.Title,
		Summary: req.Summary,
	}
	if req.Intent != nil {
		input.Intent = *req.Intent
		input.IntentSet = true
	}
	if req.Pattern != nil {
		input.Pattern = *req.Pattern
		input.PatternSet = true
	}
	if req.ShotFunction != nil {
		input.ShotFunction = *req.ShotFunction
		input.ShotFunctionSet = true
	}
	if req.VisualPreference != nil {
		input.VisualPreference = *req.VisualPreference
		input.VisualPreferenceSet = true
	}
	if req.EmotionalEffect != nil {
		input.EmotionalEffect = *req.EmotionalEffect
		input.EmotionalEffectSet = true
	}
	if req.StartSec != nil || (req.StartSecSet != nil && *req.StartSecSet) {
		input.StartSec = req.StartSec
		input.StartSecSet = true
	}
	if req.EndSec != nil || (req.EndSecSet != nil && *req.EndSecSet) {
		input.EndSec = req.EndSec
		input.EndSecSet = true
	}
	if req.ExecutionDetails != nil {
		input.ExecutionDetails = *req.ExecutionDetails
		input.ExecutionDetailsSet = true
	}
	if req.VisualAnalysis != nil {
		input.VisualAnalysis = *req.VisualAnalysis
		input.VisualAnalysisSet = true
	}
	if req.SceneSemantics != nil {
		input.SceneSemantics = *req.SceneSemantics
		input.SceneSemanticsSet = true
	}
	if req.NarrativeFunction != nil {
		input.NarrativeFunction = *req.NarrativeFunction
		input.NarrativeFunctionSet = true
	}
	if req.EmotionalProfile != nil {
		input.EmotionalProfile = *req.EmotionalProfile
		input.EmotionalProfileSet = true
	}
	if req.ReusablePattern != nil {
		input.ReusablePattern = *req.ReusablePattern
		input.ReusablePatternSet = true
	}
	return input
}

func patchRequestsToUpdateInputs(requests []patchShotReferenceRequest) []domainshotreference.UpdateInput {
	inputs := make([]domainshotreference.UpdateInput, 0, len(requests))
	for _, req := range requests {
		inputs = append(inputs, req.toUpdateInput())
	}
	return inputs
}

func (h *ShotReferenceHandler) writeShotReferenceError(c *gin.Context, err error) {
	stage := ""
	var stageErr appshotreference.StageError
	if errors.As(err, &stageErr) {
		stage = stageErr.Stage
	}
	switch {
	case errors.Is(err, appresource.ErrNotFound):
		c.JSON(http.StatusNotFound, shotReferenceErrorBody("resource not found", stage))
	case errors.Is(err, appresource.ErrForbidden):
		c.JSON(http.StatusForbidden, shotReferenceErrorBody("resource access denied", stage))
	case errors.Is(err, appshotreference.ErrInvalidVideo):
		c.JSON(http.StatusBadRequest, shotReferenceErrorBody("shot reference requires a video resource", stage))
	case errors.Is(err, appshotreference.ErrNotFound):
		c.JSON(http.StatusNotFound, shotReferenceErrorBody("shot reference not found", stage))
	default:
		c.JSON(http.StatusInternalServerError, shotReferenceErrorBody(err.Error(), stage))
	}
}

func shotReferenceErrorBody(message string, stage string) gin.H {
	body := gin.H{"error": message}
	if stage != "" {
		body["stage"] = stage
	}
	return body
}

func optionalFloat(value string) *float64 {
	if value == "" {
		return nil
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil || parsed <= 0 {
		return nil
	}
	return &parsed
}

func optionalID(value string) *uint {
	id := parseID(value)
	if id == 0 {
		return nil
	}
	return &id
}
