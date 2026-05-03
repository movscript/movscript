package handler

import (
	"time"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type JobHandler struct {
	db        *gorm.DB
	aiService *ai.AIService
}

type jobResponse struct {
	model.Job
	InputResources  []model.RawResource  `json:"input_resources,omitempty"`
	ModelConfig     *model.AIModelConfig `json:"model_config,omitempty"`
	ProviderName    string               `json:"provider_name,omitempty"`
	ModelDisplay    string               `json:"model_display,omitempty"`
	ModelIdentifier string               `json:"model_identifier,omitempty"`
}

type jobContextSnapshot struct {
	Model          jobModelSnapshot      `json:"model"`
	JobType        string                `json:"job_type"`
	FeatureKey     string                `json:"feature_key,omitempty"`
	Prompt         string                `json:"prompt"`
	Params         jobParamsSnapshot     `json:"params"`
	InputResources []jobResourceSnapshot `json:"input_resources,omitempty"`
	CreatedAt      time.Time             `json:"created_at"`
}

type jobModelSnapshot struct {
	ConfigID     uint   `json:"config_id"`
	DisplayName  string `json:"display_name"`
	Identifier   string `json:"identifier"`
	ModelDefID   string `json:"model_def_id"`
	ProviderName string `json:"provider_name"`
	CredentialID uint   `json:"credential_id"`
}

type jobParamsSnapshot struct {
	AspectRatio string         `json:"aspect_ratio,omitempty"`
	Duration    int            `json:"duration,omitempty"`
	ExtraParams map[string]any `json:"extra_params,omitempty"`
}

type jobResourceSnapshot struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	MimeType string `json:"mime_type,omitempty"`
	Size     int64  `json:"size,omitempty"`
}

func NewJobHandler(db *gorm.DB, aiService *ai.AIService) *JobHandler {
	return &JobHandler{db: db, aiService: aiService}
}
