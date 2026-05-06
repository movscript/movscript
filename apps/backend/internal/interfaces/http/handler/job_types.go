package handler

import (
	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

type JobHandler struct {
	service *jobapp.Service
}

func NewJobHandler(db *gorm.DB, aiService *ai.AIService) *JobHandler {
	return &JobHandler{service: jobapp.NewService(db, aiService)}
}
