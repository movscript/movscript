package handler

import (
	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/app/systemstream"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

type JobHandler struct {
	db             *gorm.DB
	service        *jobapp.Service
	systemMessages *systemstream.Hub
}

func NewJobHandler(db *gorm.DB, aiService *ai.AIService, systemMessages ...*systemstream.Hub) *JobHandler {
	var hub *systemstream.Hub
	if len(systemMessages) > 0 {
		hub = systemMessages[0]
	}
	return &JobHandler{db: db, service: jobapp.NewService(db, aiService), systemMessages: hub}
}
