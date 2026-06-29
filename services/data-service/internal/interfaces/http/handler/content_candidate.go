package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	appcontentcandidate "github.com/movscript/movscript/internal/app/contentcandidate"
	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

type ContentCandidateHandler struct {
	service *appcontentcandidate.Service
}

func NewContentCandidateHandler(db *gorm.DB, aiService *ai.AIService) *ContentCandidateHandler {
	return &ContentCandidateHandler{service: appcontentcandidate.NewService(db, aiService)}
}

func (h *ContentCandidateHandler) Generate(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var body struct {
		CandidateID      string                        `json:"candidate_id"`
		ProjectUID       string                        `json:"project_uid"`
		ProjectTitle     string                        `json:"project_title"`
		ScopeKind        string                        `json:"scope_kind"`
		ScopeID          string                        `json:"scope_id"`
		OutputKind       string                        `json:"output_kind"`
		ModelID          string                        `json:"model_id"`
		JobType          string                        `json:"job_type"`
		Title            string                        `json:"title"`
		Prompt           string                        `json:"prompt"`
		ExtraParams      string                        `json:"extra_params"`
		AspectRatio      string                        `json:"aspect_ratio"`
		Duration         int                           `json:"duration"`
		InputResourceIDs []uint                        `json:"input_resource_ids"`
		GenerationIntent *jobapp.GenerationIntentInput `json:"generation_intent"`
		PromptSnapshot   json.RawMessage               `json:"prompt_snapshot"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scopeKind, scopeID, ok := contentCandidateProjectDataScope(c, body.ScopeKind)
	if !ok {
		return
	}

	result, err := h.service.Generate(c.Request.Context(), appcontentcandidate.GenerateInput{
		ProjectID:        parseID(c.Param("id")),
		UserID:           user.ID,
		OrgID:            currentOrgID(c),
		ContentUnitID:    c.Param("contentUnitId"),
		CandidateID:      body.CandidateID,
		ProjectUID:       body.ProjectUID,
		ProjectTitle:     body.ProjectTitle,
		ScopeKind:        scopeKind,
		ScopeID:          scopeID,
		OutputKind:       body.OutputKind,
		ModelID:          body.ModelID,
		JobType:          body.JobType,
		Title:            body.Title,
		Prompt:           body.Prompt,
		ExtraParams:      body.ExtraParams,
		AspectRatio:      body.AspectRatio,
		Duration:         body.Duration,
		InputResourceIDs: body.InputResourceIDs,
		GenerationIntent: body.GenerationIntent,
		PromptSnapshot:   body.PromptSnapshot,
	})
	if err != nil {
		h.writeContentCandidateError(c, err)
		return
	}
	c.JSON(http.StatusCreated, result)
}

func (h *ContentCandidateHandler) Preflight(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var body struct {
		CandidateID      string                        `json:"candidate_id"`
		ProjectUID       string                        `json:"project_uid"`
		ProjectTitle     string                        `json:"project_title"`
		ScopeKind        string                        `json:"scope_kind"`
		ScopeID          string                        `json:"scope_id"`
		OutputKind       string                        `json:"output_kind"`
		ModelID          string                        `json:"model_id"`
		JobType          string                        `json:"job_type"`
		Title            string                        `json:"title"`
		Prompt           string                        `json:"prompt"`
		ExtraParams      string                        `json:"extra_params"`
		AspectRatio      string                        `json:"aspect_ratio"`
		Duration         int                           `json:"duration"`
		InputResourceIDs []uint                        `json:"input_resource_ids"`
		GenerationIntent *jobapp.GenerationIntentInput `json:"generation_intent"`
		PromptSnapshot   json.RawMessage               `json:"prompt_snapshot"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, generationPreflightBlocked("invalid_request", err.Error(), "body"))
		return
	}
	scopeKind, scopeID, ok := contentCandidateProjectDataScope(c, body.ScopeKind)
	if !ok {
		return
	}

	result, err := h.service.Preflight(c.Request.Context(), appcontentcandidate.GenerateInput{
		ProjectID:        parseID(c.Param("id")),
		UserID:           user.ID,
		OrgID:            currentOrgID(c),
		ContentUnitID:    c.Param("contentUnitId"),
		CandidateID:      body.CandidateID,
		ProjectUID:       body.ProjectUID,
		ProjectTitle:     body.ProjectTitle,
		ScopeKind:        scopeKind,
		ScopeID:          scopeID,
		OutputKind:       body.OutputKind,
		ModelID:          body.ModelID,
		JobType:          body.JobType,
		Title:            body.Title,
		Prompt:           body.Prompt,
		ExtraParams:      body.ExtraParams,
		AspectRatio:      body.AspectRatio,
		Duration:         body.Duration,
		InputResourceIDs: body.InputResourceIDs,
		GenerationIntent: body.GenerationIntent,
		PromptSnapshot:   body.PromptSnapshot,
	})
	if err != nil {
		c.JSON(http.StatusOK, generationPreflightBlockedFromError(err))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":             "ready",
		"ready":              true,
		"blockers":           []gin.H{},
		"job_type":           result.JobType,
		"output_type":        result.OutputType,
		"model_id":           result.ModelID,
		"runtime_model_id":   result.RuntimeModelID,
		"catalog_entry_id":   result.CatalogEntryID,
		"route_binding_id":   result.RouteBindingID,
		"route_group":        result.RouteGroup,
		"provider_id":        result.ProviderID,
		"provider_kind":      result.ProviderKind,
		"provider_model_id":  result.ProviderModelID,
		"credential_id":      result.CredentialID,
		"input_resource_ids": result.InputResourceIDs,
		"image_count":        result.ImageCount,
		"video_count":        result.VideoCount,
		"estimate":           result.Estimate,
	})
}

func contentCandidateProjectDataScope(c *gin.Context, rawKind string) (string, string, bool) {
	user := currentUser(c)
	if user == nil || user.ID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return "", "", false
	}
	if strings.ToLower(strings.TrimSpace(rawKind)) == "org" {
		orgID := currentOrgID(c)
		if orgID == nil || *orgID == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "organization scope unavailable"})
			return "", "", false
		}
		return "org", strconv.FormatUint(uint64(*orgID), 10), true
	}
	return "user", strconv.FormatUint(uint64(user.ID), 10), true
}

func (h *ContentCandidateHandler) writeContentCandidateError(c *gin.Context, err error) {
	var validationErr *ai.ValidationError
	switch {
	case errors.As(err, &validationErr):
		writeGenerationValidationError(c, validationErr)
	case errors.Is(err, appcontentcandidate.ErrInvalidInput),
		errors.Is(err, appcontentcandidate.ErrUnsupportedOutput):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
	case isContentCandidateGenerationConfigError(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		body := gin.H{"error": "content candidate generation failed"}
		if reason := strings.TrimSpace(err.Error()); reason != "" {
			body["reason"] = reason
		}
		c.JSON(http.StatusInternalServerError, body)
	}
}

func isContentCandidateGenerationConfigError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	if message == "" {
		return false
	}
	for _, marker := range []string{
		"not available for capability",
		"not found for capability",
		"does not support",
		"no available provider route",
		"catalog route is required for generation preflight",
		"model_id is required",
		"provider_id is required for local provider catalog route",
		"not found or disabled",
		"has no active credential",
		"is not linked to a legacy credential",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}
