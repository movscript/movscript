package handler

import (
	"github.com/movscript/movscript/internal/ai"
	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type JobHandler struct {
	aiService *ai.AIService
	service   *jobapp.Service
}

type jobResponse struct {
	model.Job
	InputResources  []model.RawResource  `json:"input_resources,omitempty"`
	ModelConfig     *model.AIModelConfig `json:"model_config,omitempty"`
	ProviderName    string               `json:"provider_name,omitempty"`
	ModelDisplay    string               `json:"model_display,omitempty"`
	ModelIdentifier string               `json:"model_identifier,omitempty"`
}

func NewJobHandler(db *gorm.DB, aiService *ai.AIService) *JobHandler {
	return &JobHandler{aiService: aiService, service: jobapp.NewService(db)}
}
