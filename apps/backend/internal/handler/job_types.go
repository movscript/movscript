package handler

import (
	"github.com/movscript/movscript/internal/ai"
	jobapp "github.com/movscript/movscript/internal/app/job"
	"gorm.io/gorm"
)

type JobHandler struct {
	aiService *ai.AIService
	service   *jobapp.Service
}

func NewJobHandler(db *gorm.DB, aiService *ai.AIService) *JobHandler {
	return &JobHandler{aiService: aiService, service: jobapp.NewService(db)}
}
