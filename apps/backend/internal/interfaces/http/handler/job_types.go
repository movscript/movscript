package handler

import (
	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

type JobHandler struct {
	db      *gorm.DB
	service *jobapp.Service
}

func NewJobHandler(db *gorm.DB, aiService *ai.AIService) *JobHandler {
	return &JobHandler{db: db, service: jobapp.NewService(db, aiService)}
}
