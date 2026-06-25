package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	appcontentcandidate "github.com/movscript/movscript/internal/app/contentcandidate"
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
		CandidateID      string          `json:"candidate_id"`
		OutputKind       string          `json:"output_kind"`
		ModelID          string          `json:"model_id"`
		JobType          string          `json:"job_type"`
		Title            string          `json:"title"`
		Prompt           string          `json:"prompt"`
		ExtraParams      string          `json:"extra_params"`
		AspectRatio      string          `json:"aspect_ratio"`
		Duration         int             `json:"duration"`
		InputResourceIDs []uint          `json:"input_resource_ids"`
		PromptSnapshot   json.RawMessage `json:"prompt_snapshot"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.service.Generate(c.Request.Context(), appcontentcandidate.GenerateInput{
		ProjectID:        parseID(c.Param("id")),
		UserID:           user.ID,
		OrgID:            currentOrgID(c),
		ContentUnitID:    c.Param("contentUnitId"),
		CandidateID:      body.CandidateID,
		OutputKind:       body.OutputKind,
		ModelID:          body.ModelID,
		JobType:          body.JobType,
		Title:            body.Title,
		Prompt:           body.Prompt,
		ExtraParams:      body.ExtraParams,
		AspectRatio:      body.AspectRatio,
		Duration:         body.Duration,
		InputResourceIDs: body.InputResourceIDs,
		PromptSnapshot:   body.PromptSnapshot,
	})
	if err != nil {
		h.writeContentCandidateError(c, err)
		return
	}
	c.JSON(http.StatusCreated, result)
}

func (h *ContentCandidateHandler) writeContentCandidateError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, appcontentcandidate.ErrInvalidInput),
		errors.Is(err, appcontentcandidate.ErrUnsupportedOutput):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "content candidate generation failed"})
	}
}
